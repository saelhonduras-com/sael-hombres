const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');

function validarDni(dni) {
  return /^\d{13}$/.test(dni);
}

function validarTelefono(tel) {
  return /^\d{8}$/.test(tel);
}

// Alfanumérico, 5 a 20 caracteres. Igual criterio que SFL para pasaporte.
// NOTA: si el regex real usado en SFL es distinto, avisar para igualarlo aquí.
function validarPasaporte(valor) {
  return /^[A-Za-z0-9]{5,20}$/.test(valor);
}
// Límite razonable de "veces que ha recibido SAELES antes de este sistema".
// 0 a 99 — nadie ha ido cientos de veces, y evita que un número gigantesco
// (ej. 13 dígitos por error de captura) tumbe la inserción en la base de
// datos por desbordar el rango de un entero.
function validarVecesSaeles(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 99;
}

// Respaldo del lado del servidor para el mismo tipo de error que causó el
// bug de veces_saeles_previas: si por algún motivo el límite del navegador
// falla (input manipulado, algún navegador raro, etc.), esto evita que una
// fecha inválida o absurda (futura, o de hace siglos) llegue a la base.
function validarFechaNacimiento(fecha) {
  if (!fecha) return false;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return false;
  const minimo = new Date('1900-01-01');
  const hoy = new Date();
  return d >= minimo && d <= hoy;
}

// ============================================================
// RUTAS PÚBLICAS (wizard de inscripción — sin cambios de lógica)
// ============================================================

// Público: busca un participante por número de identificación (para el wizard, paso 1)
router.get('/participantes/dni/:dni', async (req, res) => {
  const { dni } = req.params;
  if (!validarDni(dni)) {
    return res.status(400).json({ error: 'El DNI debe tener 13 dígitos.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre_completo, fecha_nacimiento, telefono_movil,
              departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
              contacto_emergencia_nombre, contacto_emergencia_telefono
       FROM participantes WHERE numero_identificacion = $1`,
      [dni]
    );
    if (rows.length === 0) {
      return res.json({ existe: false });
    }
    res.json({ existe: true, participante: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo verificar el DNI.' });
  }
});

// Público: mismo propósito que la ruta de arriba, pero para extranjeros
// que se inscriben con número de pasaporte en vez de DNI hondureño.
router.get('/participantes/pasaporte/:pasaporte', async (req, res) => {
  const { pasaporte } = req.params;
  if (!validarPasaporte(pasaporte)) {
    return res.status(400).json({ error: 'El número de pasaporte debe ser alfanumérico (5 a 20 caracteres).' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre_completo, fecha_nacimiento, telefono_movil,
              departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
              contacto_emergencia_nombre, contacto_emergencia_telefono
       FROM participantes WHERE numero_identificacion = $1`,
      [pasaporte.trim().toUpperCase()]
    );
    if (rows.length === 0) {
      return res.json({ existe: false });
    }
    res.json({ existe: true, participante: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo verificar el pasaporte.' });
  }
});

// Público: actualiza los datos de un participante ya existente cuando se
// vuelve a inscribir (teléfono, ubicación, cargo, etc.) — excluye a propósito
// ha_recibido_saeles/veces_saeles_previas, porque ese historial ya vive en el
// sistema y no debe volver a preguntarse.
// Seguridad: como el wizard público no tiene login, se exige el DNI (o
// pasaporte, si es extranjero) en el cuerpo de la petición y se verifica
// que coincida con el registrado para ese id — mismo patrón de "conocer
// la identificación correcta = prueba de identidad" que ya usa el resto
// de este flujo público.
router.put('/participantes/:id', async (req, res) => {
  const { id } = req.params;
  const {
    numero_identificacion, nombre_completo, fecha_nacimiento, telefono_movil,
    departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
  } = req.body;

  if (!numero_identificacion) {
    return res.status(400).json({ error: 'Falta el número de identificación.' });
  }
  if (!nombre_completo || !fecha_nacimiento || !telefono_movil || !departamento || !municipio || !zona || !cargo_fihnec || !estado_civil) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!validarFechaNacimiento(fecha_nacimiento)) {
    return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
  }
  if (!validarTelefono(telefono_movil)) {
    return res.status(400).json({ error: 'El teléfono móvil debe tener exactamente 8 dígitos.' });
  }
  if (contacto_emergencia_telefono && !validarTelefono(contacto_emergencia_telefono)) {
    return res.status(400).json({ error: 'El teléfono de emergencia debe tener exactamente 8 dígitos.' });
  }

  try {
    const actual = await pool.query(`SELECT numero_identificacion, tipo_identificacion FROM participantes WHERE id = $1`, [id]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ error: 'Participante no encontrado.' });
    }
    // La validación de formato depende de con QUÉ está registrado hoy este
    // participante — no de lo que venga en el body — para que no se pueda
    // colar un pasaporte con formato de DNI (o viceversa) en una edición.
    const esPasaporte = actual.rows[0].tipo_identificacion === 'Pasaporte';
    const formatoValido = esPasaporte ? validarPasaporte(numero_identificacion.trim()) : validarDni(numero_identificacion);
    if (!formatoValido) {
      return res.status(400).json({ error: esPasaporte ? 'El número de pasaporte debe ser alfanumérico (5 a 20 caracteres).' : 'El DNI debe tener 13 dígitos.' });
    }
    if (actual.rows[0].numero_identificacion !== numero_identificacion) {
      return res.status(403).json({ error: 'La identificación no coincide con este registro.' });
    }

    const { rows } = await pool.query(
      `UPDATE participantes SET
        nombre_completo = $1, fecha_nacimiento = $2, telefono_movil = $3,
        departamento = $4, municipio = $5, capitulo = $6, zona = $7,
        cargo_fihnec = $8, estado_civil = $9,
        contacto_emergencia_nombre = $10, contacto_emergencia_telefono = $11
      WHERE id = $12
      RETURNING id, nombre_completo`,
      [
        nombre_completo, fecha_nacimiento, telefono_movil,
        departamento, municipio, capitulo || null, zona,
        cargo_fihnec, estado_civil,
        contacto_emergencia_nombre || null, contacto_emergencia_telefono || null,
        id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron actualizar tus datos.' });
  }
});

// Público: crea un nuevo participante (solo la primera vez que se registra).
// es_extranjero=true usa pasaporte en vez de DNI — mismo criterio que ya
// usa el endpoint admin de extranjeros, solo que aquí es autoservicio.
router.post('/participantes', async (req, res) => {
  const {
    numero_identificacion, nombre_completo, fecha_nacimiento, telefono_movil,
    departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
    ha_recibido_saeles, veces_saeles_previas,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    es_extranjero,
  } = req.body;

  if (es_extranjero) {
    if (!numero_identificacion || !validarPasaporte(numero_identificacion.trim())) {
      return res.status(400).json({ error: 'El número de pasaporte debe ser alfanumérico (5 a 20 caracteres).' });
    }
  } else if (!validarDni(numero_identificacion)) {
    return res.status(400).json({ error: 'El DNI debe tener 13 dígitos.' });
  }
  if (!nombre_completo || !fecha_nacimiento || !telefono_movil || !departamento || !municipio || !zona || !cargo_fihnec || !estado_civil) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!validarFechaNacimiento(fecha_nacimiento)) {
    return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
  }
  if (!validarTelefono(telefono_movil)) {
    return res.status(400).json({ error: 'El teléfono móvil debe tener exactamente 8 dígitos.' });
  }
  if (ha_recibido_saeles && !validarVecesSaeles(veces_saeles_previas)) {
    return res.status(400).json({ error: 'La cantidad de veces que ha recibido SAELES debe ser un número entre 0 y 99.' });
  }
  if (contacto_emergencia_telefono && !validarTelefono(contacto_emergencia_telefono)) {
    return res.status(400).json({ error: 'El teléfono de emergencia debe tener exactamente 8 dígitos.' });
  }

  try {
    // Dos variantes de INSERT a propósito: para hondureños se omiten
    // tipo_identificacion/tipo_participante para que tomen su valor por
    // defecto de siempre (comportamiento sin cambios); para extranjeros
    // se fijan explícitamente igual que en el registro manual del admin.
    const { rows } = es_extranjero
      ? await pool.query(
          `INSERT INTO participantes (
            numero_identificacion, tipo_identificacion, tipo_participante,
            nombre_completo, fecha_nacimiento, telefono_movil,
            departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
            ha_recibido_saeles, veces_saeles_previas,
            contacto_emergencia_nombre, contacto_emergencia_telefono
          ) VALUES ($1,'Pasaporte','extranjero',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING id, nombre_completo`,
          [
            numero_identificacion.trim().toUpperCase(), nombre_completo, fecha_nacimiento, telefono_movil,
            departamento, municipio, capitulo || null, zona, cargo_fihnec, estado_civil,
            !!ha_recibido_saeles, ha_recibido_saeles ? (veces_saeles_previas || 0) : null,
            contacto_emergencia_nombre || null, contacto_emergencia_telefono || null,
          ]
        )
      : await pool.query(
          `INSERT INTO participantes (
            numero_identificacion, nombre_completo, fecha_nacimiento, telefono_movil,
            departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
            ha_recibido_saeles, veces_saeles_previas,
            contacto_emergencia_nombre, contacto_emergencia_telefono
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING id, nombre_completo`,
          [
            numero_identificacion, nombre_completo, fecha_nacimiento, telefono_movil,
            departamento, municipio, capitulo || null, zona, cargo_fihnec, estado_civil,
            !!ha_recibido_saeles, ha_recibido_saeles ? (veces_saeles_previas || 0) : null,
            contacto_emergencia_nombre || null, contacto_emergencia_telefono || null,
          ]
        );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este DNI ya está registrado.' });
    }
    res.status(500).json({ error: 'No se pudo completar el registro.' });
  }
});

// Honduras es UTC-6 todo el año (sin horario de verano) — mismo criterio
// fijo que ya usa eventos.js. Formatea "18:00" (24h) a "6:00 p. m." para
// que el mensaje de error se lea igual que en el resto del sitio.
function formatearHoraEs(horaHHMM) {
  const [h, m] = (horaHHMM || '23:59').split(':').map(Number);
  const meridiano = h >= 12 ? 'p. m.' : 'a. m.';
  let hora12 = h % 12;
  if (hora12 === 0) hora12 = 12;
  return `${hora12}:${String(m).padStart(2, '0')} ${meridiano}`;
}

// Público: inscribe a un participante (ya existente) a un evento específico
router.post('/inscripciones', async (req, res) => {
  const { participante_id, evento_id } = req.body;
  if (!participante_id || !evento_id) {
    return res.status(400).json({ error: 'Faltan datos para completar la inscripción.' });
  }
  try {
    const evento = await pool.query(
      `SELECT abierto, fecha_limite_registro, hora_limite_registro FROM eventos WHERE id = $1`,
      [evento_id]
    );
    if (evento.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    if (!evento.rows[0].abierto) {
      return res.status(400).json({ error: 'El registro para este evento está cerrado.' });
    }

    // El plazo solo bloquea inscripciones NUEVAS — alguien que ya estaba
    // inscrito y solo viene a actualizar sus datos (ej. cambió de teléfono)
    // no debe quedar atrapado por el cierre del plazo, porque su cupo ya
    // estaba asegurado desde antes.
    const yaInscrito = await pool.query(
      `SELECT 1 FROM inscripciones WHERE participante_id = $1 AND evento_id = $2`,
      [participante_id, evento_id]
    );
    if (yaInscrito.rows.length === 0) {
      const { fecha_limite_registro, hora_limite_registro } = evento.rows[0];
      if (fecha_limite_registro) {
        const fechaStr = new Date(fecha_limite_registro).toISOString().slice(0, 10);
        const horaStr = hora_limite_registro || '23:59';
        // "-06:00" aplicado explícitamente para comparar contra la hora
        // Honduras real, sin depender de la zona horaria del servidor.
        const limite = new Date(`${fechaStr}T${horaStr}:00.000-06:00`);
        if (Date.now() > limite.getTime()) {
          return res.status(400).json({
            error: `El plazo de inscripción para este evento venció el ${fechaStr} a las ${formatearHoraEs(horaStr)} (hora Honduras).`,
          });
        }
      }
    }

    await pool.query(
      `INSERT INTO inscripciones (participante_id, evento_id) VALUES ($1, $2)`,
      [participante_id, evento_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya estás inscrito a este evento.' });
    }
    res.status(500).json({ error: 'No se pudo completar la inscripción.' });
  }
});

// ============================================================
// RUTAS ADMIN (Módulo de Participantes — NUEVO)
// Protegidas con requireAuth + requireModulo('participantes', nivel)
// ============================================================

// Admin: listado de participantes con búsqueda, filtros y paginación
// (pagina/limite en query string; respuesta trae { participantes, total, pagina, limite }
// para soportar scroll infinito en el frontend sin traer todo de una vez)
router.get('/admin/participantes', requireAuth, requireModulo('participantes', 'consulta'), async (req, res) => {
  const { buscar, departamento, capitulo, zona, tipo_participante } = req.query;
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 30, 1), 100);
  const offset = (pagina - 1) * limite;

  const condiciones = [
    'oculto = false',
    // Solo aparece en "Todos los participantes" quien tenga al menos UNA
    // inscripción confirmada presencialmente en toda su historia. Alguien
    // que se inscribió pero nunca fue confirmado no cuenta como participante
    // real todavía — sigue solo en "Inscribiéndose ahora" hasta que se marque
    // o se elimine.
    `EXISTS (SELECT 1 FROM inscripciones i WHERE i.participante_id = participantes.id AND i.registrado_presencial = true)`,
  ];
  const valores = [];

  if (buscar) {
    valores.push(`%${buscar}%`);
    condiciones.push(`(nombre_completo ILIKE $${valores.length} OR numero_identificacion ILIKE $${valores.length})`);
  }
  if (departamento) {
    valores.push(departamento);
    condiciones.push(`departamento = $${valores.length}`);
  }
  if (capitulo) {
    valores.push(`%${capitulo}%`);
    condiciones.push(`capitulo ILIKE $${valores.length}`);
  }
  if (zona) {
    valores.push(zona);
    condiciones.push(`zona = $${valores.length}`);
  }
  if (tipo_participante) {
    valores.push(tipo_participante);
    condiciones.push(`tipo_participante = $${valores.length}`);
  }

  const where = `WHERE ${condiciones.join(' AND ')}`;

  try {
    const total = await pool.query(`SELECT COUNT(*) FROM participantes ${where}`, valores);
    const { rows } = await pool.query(
      `SELECT id, numero_identificacion, tipo_identificacion, tipo_participante,
              nombre_completo, departamento, municipio, capitulo, zona, cargo_fihnec
       FROM participantes
       ${where}
       ORDER BY nombre_completo ASC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limite, offset]
    );
    res.json({
      participantes: rows,
      total: parseInt(total.rows[0].count, 10),
      pagina,
      limite,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el listado de participantes.' });
  }
});

// Admin: estadísticas rápidas (para la columna de resumen del panel)
router.get('/admin/participantes/estadisticas', requireAuth, requireModulo('participantes', 'consulta'), async (req, res) => {
  const { evento_id } = req.query;
  try {
    // Con evento_id: cuenta solo lo de ESE evento (esto es lo que hace
    // que el resumen se "limpie" al pasar a un evento nuevo — no se
    // borra nada, simplemente el evento nuevo todavía no tiene
    // inscripciones/asistencias propias que contar). Sin evento_id:
    // se mantiene el comportamiento global de antes, por si algo más
    // llega a llamar este endpoint sin mandar el parámetro.
    const confirmados = evento_id
      ? await pool.query(
          `SELECT p.tipo_participante, COUNT(*) AS total
           FROM participantes p
           JOIN inscripciones i ON i.participante_id = p.id
           WHERE p.oculto = false AND i.evento_id = $1 AND i.registrado_presencial = true
           GROUP BY p.tipo_participante`,
          [evento_id]
        )
      : await pool.query(
          `SELECT tipo_participante, COUNT(*) AS total
           FROM participantes
           WHERE oculto = false
             AND EXISTS (SELECT 1 FROM inscripciones i WHERE i.participante_id = participantes.id AND i.registrado_presencial = true)
           GROUP BY tipo_participante`
        );
    // "Inscritos" = todas las personas que han pasado por el sistema alguna
    // vez (confirmadas o todavía esperando su chequeo presencial). Distinto
    // de "Confirmados", que es el mismo total ya usado en el resto del panel.
    const inscritosTotal = evento_id
      ? await pool.query(
          `SELECT COUNT(*) FROM inscripciones i
           JOIN participantes p ON p.id = i.participante_id
           WHERE p.oculto = false AND i.evento_id = $1`,
          [evento_id]
        )
      : await pool.query(`SELECT COUNT(*) FROM participantes WHERE oculto = false`);
    const saelistasAsistencia = evento_id
      ? await pool.query(`SELECT COUNT(*) FROM saelista_asistencias WHERE evento_id = $1 AND registrado_presencial = true`, [evento_id])
      : await pool.query(`SELECT COUNT(*) FROM saelista_asistencias WHERE registrado_presencial = true`);
    const estadisticas = { total: 0, nacional: 0, extranjero: 0 };
    confirmados.rows.forEach((r) => {
      const cantidad = parseInt(r.total, 10);
      estadisticas[r.tipo_participante] = cantidad;
      estadisticas.total += cantidad;
    });
    estadisticas.inscritos_total = parseInt(inscritosTotal.rows[0].count, 10);
    estadisticas.saelistas_asistencia = parseInt(saelistasAsistencia.rows[0].count, 10);
    res.json(estadisticas);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron obtener las estadísticas.' });
  }
});

// Admin: oculta a un participante de todos los listados y estadísticas
// SIN borrar su fila ni su historial (reversible en la base de datos,
// aunque hoy no hay pantalla para "desocultar" — puede agregarse después).
router.put('/admin/participantes/:id/ocultar', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const participante = await client.query(`SELECT * FROM participantes WHERE id = $1`, [id]);
    if (participante.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participante no encontrado.' });
    }
    const fila = participante.rows[0];

    // Guarda una copia completa ANTES de ocultar — así aparece en la
    // Papelera del módulo de Mantenimiento (solo Super Admin) y se puede
    // restaurar con un clic, sin necesitar SQL directo.
    await client.query(
      `INSERT INTO papelera (tipo, descripcion, tabla_origen, datos)
       VALUES ('Participante', $1, 'participantes', $2)`,
      [fila.nombre_completo, JSON.stringify(fila)]
    );

    const { rows } = await client.query(
      `UPDATE participantes SET oculto = true WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participante no encontrado.' });
    }

    // Se le libera la habitación SOLO del evento actual/activo (así se
    // confirmó) — si tenía habitación asignada en un evento pasado ya
    // finalizado, ese historial se queda intacto, no se toca.
    const eventoActualRes = await client.query(`SELECT id FROM eventos WHERE es_actual = true LIMIT 1`);
    let eventoId = eventoActualRes.rows[0]?.id;
    if (!eventoId) {
      const abiertoRes = await client.query(`SELECT id FROM eventos WHERE abierto = true LIMIT 1`);
      eventoId = abiertoRes.rows[0]?.id;
    }
    if (eventoId) {
      const ocupante = await client.query(
        `DELETE FROM habitacion_ocupantes WHERE participante_id = $1 AND evento_id = $2 RETURNING habitacion_id`,
        [id, eventoId]
      );
      if (ocupante.rows.length > 0) {
        const habitacionId = ocupante.rows[0].habitacion_id;
        const restantes = await client.query(
          `SELECT COUNT(*) FROM habitacion_ocupantes WHERE habitacion_id = $1 AND evento_id = $2`,
          [habitacionId, eventoId]
        );
        if (parseInt(restantes.rows[0].count, 10) === 0) {
          await client.query(
            `DELETE FROM habitacion_reservas WHERE habitacion_id = $1 AND evento_id = $2 AND es_reserva_seguridad = false`,
            [habitacionId, eventoId]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en PUT /admin/participantes/:id/ocultar:', err);
    res.status(500).json({ error: 'No se pudo ocultar al participante.' });
  } finally {
    client.release();
  }
});

// Admin: inscritos de UN evento específico, con su estado de chequeo presencial.
// Es la base de la pestaña "Inscribiéndose ahora" — permite marcar/desmarcar
// Registrado directo en la tabla, sin entrar al detalle de cada participante.
// NOTA: vive aquí por consistencia con el resto de rutas de inscripciones/participantes;
// si más adelante prefieres que viva en eventos.js, es un mover-y-listo.
router.get('/admin/eventos/:evento_id/inscripciones', requireAuth, requireModulo('participantes', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  const { buscar } = req.query;
  const condiciones = [`i.evento_id = $1`, `p.oculto = false`];
  const valores = [evento_id];

  if (buscar) {
    valores.push(`%${buscar}%`);
    condiciones.push(`(p.nombre_completo ILIKE $${valores.length} OR p.numero_identificacion ILIKE $${valores.length})`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT i.id AS inscripcion_id, i.registrado_presencial,
              p.id AS participante_id, p.nombre_completo, p.numero_identificacion,
              p.tipo_identificacion, p.tipo_participante, p.capitulo, p.zona
       FROM inscripciones i
       JOIN participantes p ON p.id = i.participante_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY i.registrado_presencial ASC, p.nombre_completo ASC`,
      valores
    );
    const total_registrados = rows.filter((r) => r.registrado_presencial).length;
    res.json({ inscripciones: rows, total: rows.length, total_registrados });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener la lista de inscritos al evento.' });
  }
});

// Admin: elimina una inscripción sin confirmar (no-show). Si esa era la única
// inscripción que la persona tuvo alguna vez (nunca asistió a nada, nunca
// confirmó nada), también se elimina su fila de participantes por completo —
// no hay historial real que proteger. Si tiene otras inscripciones (confirmadas
// o no), su fila y su historial quedan intactos.
// Protección: nunca se puede eliminar una inscripción ya confirmada
// (registrado_presencial = true) por esta vía — eso sería borrar asistencia real.
router.delete('/admin/inscripciones/:id', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inscripcion = await client.query(`SELECT * FROM inscripciones WHERE id = $1`, [id]);
    if (inscripcion.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inscripción no encontrada.' });
    }
    const fila = inscripcion.rows[0];
    if (fila.registrado_presencial) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'No se puede eliminar una inscripción con asistencia confirmada. Desmarca "Registrado" primero si fue un error.',
      });
    }

    // Mismo patrón que SFL: la inscripción se archiva (no se pierde el
    // rastro de que existió) y se borra de la tabla viva — pero la ficha
    // del participante NUNCA se toca aquí. Su DNI sigue existiendo, así
    // que si esta persona se vuelve a inscribir en un evento futuro, el
    // sistema la reconoce sola por DNI, sin duplicados ni ambigüedad.
    await client.query(
      `INSERT INTO inscripciones_historial (inscripcion_id, participante_id, evento_id, motivo, datos)
       VALUES ($1, $2, $3, 'eliminado', $4)`,
      [fila.id, fila.participante_id, fila.evento_id, JSON.stringify(fila)]
    );
    await client.query(`DELETE FROM inscripciones WHERE id = $1`, [id]);

    // Si tenía habitación asignada para este evento, se libera junto con
    // la inscripción — de lo contrario quedaría apareciendo como
    // ocupante de una habitación sin estar ya inscrito. Si la habitación
    // se queda sin nadie, también se limpia su cobro (mismo criterio que
    // ya usa el módulo de Habitaciones al quitar al último ocupante).
    const ocupante = await client.query(
      `DELETE FROM habitacion_ocupantes WHERE participante_id = $1 AND evento_id = $2 RETURNING habitacion_id`,
      [fila.participante_id, fila.evento_id]
    );
    if (ocupante.rows.length > 0) {
      const habitacionId = ocupante.rows[0].habitacion_id;
      const restantes = await client.query(
        `SELECT COUNT(*) FROM habitacion_ocupantes WHERE habitacion_id = $1 AND evento_id = $2`,
        [habitacionId, fila.evento_id]
      );
      if (parseInt(restantes.rows[0].count, 10) === 0) {
        await client.query(
          `DELETE FROM habitacion_reservas WHERE habitacion_id = $1 AND evento_id = $2 AND es_reserva_seguridad = false`,
          [habitacionId, fila.evento_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo eliminar la inscripción.' });
  } finally {
    client.release();
  }
});

// Admin: detalle de un participante + historial de inscripciones + total de SAELES
router.get('/admin/participantes/:id', requireAuth, requireModulo('participantes', 'consulta'), async (req, res) => {
  const { id } = req.params;
  try {
    const participante = await pool.query(`SELECT * FROM participantes WHERE id = $1`, [id]);
    if (participante.rows.length === 0) {
      return res.status(404).json({ error: 'Participante no encontrado.' });
    }
    const inscripciones = await pool.query(
      `SELECT i.id, i.evento_id, i.registrado_presencial, e.nombre AS evento_nombre, e.anio, e.mes, e.fecha_inicio
       FROM inscripciones i
       JOIN eventos e ON e.id = i.evento_id
       WHERE i.participante_id = $1
       ORDER BY e.anio DESC, e.mes DESC`,
      [id]
    );
    const p = participante.rows[0];
    // Solo se cuentan encuentros con presencia confirmada (registrado_presencial = true),
    // igual que en SFL: el histórico previo (veces_saeles_previas) ya se asume confirmado.
    const confirmadas = inscripciones.rows.filter((i) => i.registrado_presencial).length;
    const total_saeles = (p.veces_saeles_previas || 0) + confirmadas;
    res.json({ ...p, inscripciones: inscripciones.rows, total_saeles });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el detalle del participante.' });
  }
});

// Admin: edición de datos de un participante (no permite cambiar identificación ni tipo)
router.put('/admin/participantes/:id', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const {
    nombre_completo, fecha_nacimiento, telefono_movil,
    departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
    ha_recibido_saeles, veces_saeles_previas,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
  } = req.body;

  if (!nombre_completo) {
    return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
  }
  if (fecha_nacimiento && !validarFechaNacimiento(fecha_nacimiento)) {
    return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
  }
  if (telefono_movil && !validarTelefono(telefono_movil)) {
    return res.status(400).json({ error: 'El teléfono móvil debe tener exactamente 8 dígitos.' });
  }
  if (contacto_emergencia_telefono && !validarTelefono(contacto_emergencia_telefono)) {
    return res.status(400).json({ error: 'El teléfono de emergencia debe tener exactamente 8 dígitos.' });
  }
  if (ha_recibido_saeles && !validarVecesSaeles(veces_saeles_previas)) {
    return res.status(400).json({ error: 'La cantidad de veces que ha recibido SAELES debe ser un número entre 0 y 99.' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE participantes SET
        nombre_completo = $1, fecha_nacimiento = $2, telefono_movil = $3,
        departamento = $4, municipio = $5, capitulo = $6, zona = $7,
        cargo_fihnec = $8, estado_civil = $9,
        ha_recibido_saeles = $10, veces_saeles_previas = $11,
        contacto_emergencia_nombre = $12, contacto_emergencia_telefono = $13
      WHERE id = $14
      RETURNING id`,
      [
        nombre_completo, fecha_nacimiento || null, telefono_movil || null,
        departamento || null, municipio || null, capitulo || null, zona || null,
        cargo_fihnec || null, estado_civil || null,
        !!ha_recibido_saeles, ha_recibido_saeles ? (veces_saeles_previas || 0) : null,
        contacto_emergencia_nombre || null, contacto_emergencia_telefono || null,
        id,
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Participante no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el participante.' });
  }
});

// Admin: agrega un participante EXTRANJERO manualmente y lo inscribe de una vez
// al evento indicado. Transacción única: si falla la inscripción, no queda
// el participante huérfano sin evento.
router.post('/admin/participantes/extranjero', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const {
    numero_identificacion, nombre_completo, fecha_nacimiento, telefono_movil,
    departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
    ha_recibido_saeles, veces_saeles_previas,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    evento_id,
  } = req.body;

  if (!numero_identificacion || !validarPasaporte(numero_identificacion.trim())) {
    return res.status(400).json({ error: 'El número de pasaporte debe ser alfanumérico (5 a 20 caracteres).' });
  }
  if (!nombre_completo) {
    return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
  }
  if (!evento_id) {
    return res.status(400).json({ error: 'Debes seleccionar el evento SAEL al que se inscribe.' });
  }
  if (fecha_nacimiento && !validarFechaNacimiento(fecha_nacimiento)) {
    return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
  }
  if (telefono_movil && !validarTelefono(telefono_movil)) {
    return res.status(400).json({ error: 'El teléfono móvil debe tener exactamente 8 dígitos.' });
  }
  if (ha_recibido_saeles && !validarVecesSaeles(veces_saeles_previas)) {
    return res.status(400).json({ error: 'La cantidad de veces que ha recibido SAELES debe ser un número entre 0 y 99.' });
  }
  if (contacto_emergencia_telefono && !validarTelefono(contacto_emergencia_telefono)) {
    return res.status(400).json({ error: 'El teléfono de emergencia debe tener exactamente 8 dígitos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const evento = await client.query(`SELECT abierto FROM eventos WHERE id = $1`, [evento_id]);
    if (evento.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    if (!evento.rows[0].abierto) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El registro para este evento está cerrado.' });
    }

    const participante = await client.query(
      `INSERT INTO participantes (
        numero_identificacion, tipo_identificacion, tipo_participante,
        nombre_completo, fecha_nacimiento, telefono_movil,
        departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
        ha_recibido_saeles, veces_saeles_previas,
        contacto_emergencia_nombre, contacto_emergencia_telefono
      ) VALUES ($1,'Pasaporte','extranjero',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id, nombre_completo`,
      [
        numero_identificacion.trim().toUpperCase(), nombre_completo,
        fecha_nacimiento || null, telefono_movil || null,
        departamento || null, municipio || null, capitulo || null, zona || null,
        cargo_fihnec || null, estado_civil || null,
        !!ha_recibido_saeles, ha_recibido_saeles ? (veces_saeles_previas || 0) : null,
        contacto_emergencia_nombre || null, contacto_emergencia_telefono || null,
      ]
    );

    const participante_id = participante.rows[0].id;

    await client.query(
      `INSERT INTO inscripciones (participante_id, evento_id) VALUES ($1, $2)`,
      [participante_id, evento_id]
    );

    await client.query('COMMIT');
    res.status(201).json(participante.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este número de pasaporte ya está registrado.' });
    }
    res.status(500).json({ error: 'No se pudo completar el registro del participante extranjero.' });
  } finally {
    client.release();
  }
});

// Admin: marca (o desmarca) el chequeo presencial de una inscripción específica.
// Igual que en SFL: nunca se borra la inscripción por inasistencia, solo queda
// con registrado_presencial = false para siempre y así se excluye de conteos.
router.put('/admin/inscripciones/:id/presencial', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { registrado_presencial } = req.body;
  const nuevoValor = !!registrado_presencial;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const actual = await client.query(
      `SELECT evento_id, boleto_numero, alimentacion_monto, registrado_presencial FROM inscripciones WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inscripción no encontrada.' });
    }
    const insc = actual.rows[0];

    // Al DESMARCAR (true → false) una inscripción que tenía boleto
    // asignado (pagado o Cortesía — ambos consumen boleto): si ese boleto
    // era el ÚLTIMO que se había entregado en el evento, se regresa al
    // contador (nadie más lo tiene todavía). Si ya se entregaron boletos
    // después, el número queda anulado — nunca se reutiliza, para no
    // arriesgar que dos personas terminen con el mismo boleto físico.
    let boletoLiberado = null;
    if (!nuevoValor && insc.registrado_presencial && insc.boleto_numero) {
      const evento = await client.query(
        `SELECT boleto_siguiente FROM eventos WHERE id = $1 FOR UPDATE`,
        [insc.evento_id]
      );
      const siguiente = evento.rows[0]?.boleto_siguiente;
      if (siguiente && String(siguiente - 1) === String(insc.boleto_numero)) {
        await client.query(`UPDATE eventos SET boleto_siguiente = $1 WHERE id = $2`, [siguiente - 1, insc.evento_id]);
        boletoLiberado = insc.boleto_numero;
      }
    }

    await client.query(
      `UPDATE inscripciones SET registrado_presencial = $1, boleto_numero = $2 WHERE id = $3`,
      [
        nuevoValor,
        // Si se liberó el boleto (era el último), se limpia del todo. Si
        // no se pudo liberar (ya había otros después), se deja anotado
        // tal cual para que quede registro de qué número quedó anulado.
        nuevoValor ? insc.boleto_numero : (boletoLiberado ? null : insc.boleto_numero),
        id,
      ]
    );

    await client.query('COMMIT');
    res.json({ ok: true, boleto_liberado: boletoLiberado });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo actualizar el estado de asistencia.' });
  } finally {
    client.release();
  }
});

// ============================================================
// MÓDULO DIPLOMAS
// Usa su propio módulo de permisos ('diplomas'), separado de 'participantes'.
// Solo lectura/exportación — no hay nivel 'edicion' aquí. Un admin que ya
// tenga acceso a Participantes NO va a ver Diplomas automáticamente: hace
// falta una fila nueva en permisos_modulo con modulo='diplomas' para ese
// usuario (super_admin siempre pasa, como en el resto del sistema).
// ============================================================

// Consulta compartida por las tres rutas de abajo: confirmados del evento
// actual, ordenados por Zona A-Z (siempre) y luego por nombre.
//
// "Primera vez" NO se calcula con ha_recibido_saeles (ese campo solo
// refleja lo que la persona contestó UNA VEZ, en su primer registro,
// sobre su historial ANTES de que existiera el sistema — nunca se
// actualiza después). Se calcula igual que "Total de SAELES": histórico
// previo + confirmaciones reales dentro del sistema. Es "primera vez"
// solo cuando ese total da exactamente 1.
async function obtenerFilasDiplomas(evento_id) {
  const { rows } = await pool.query(
    `SELECT p.zona, p.capitulo, p.nombre_completo, p.veces_saeles_previas,
            i.alimentacion_monto, i.metodo_pago, i.observaciones_pago,
            (SELECT COUNT(*) FROM inscripciones i2
               WHERE i2.participante_id = p.id AND i2.registrado_presencial = true) AS confirmadas
     FROM inscripciones i
     JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = $1 AND i.registrado_presencial = true AND p.oculto = false
     ORDER BY p.zona ASC, p.nombre_completo ASC`,
    [evento_id]
  );
  const conPrimeraVez = rows.map((r) => ({
    ...r,
    total_saeles: (r.veces_saeles_previas || 0) + parseInt(r.confirmadas, 10),
  }));
  const total_primera_vez = conPrimeraVez.filter((r) => r.total_saeles === 1).length;

  // Totales por método de pago — suma de alimentacion_monto agrupado por
  // metodo_pago, para las 3 columnas nuevas (Efectivo / Transferencia
  // Bancaria / Tarjeta) que se muestran en pantalla, Excel y PDF.
  const totalesPago = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  conPrimeraVez.forEach((r) => {
    if (r.metodo_pago && totalesPago[r.metodo_pago] !== undefined && r.alimentacion_monto) {
      totalesPago[r.metodo_pago] += Number(r.alimentacion_monto);
    }
  });

  return { rows: conPrimeraVez, total: conPrimeraVez.length, total_primera_vez, totalesPago };
}

// Admin: lista para mostrar en pantalla (tabla + totales)
router.get('/admin/eventos/:evento_id/diplomas', requireAuth, requireModulo('diplomas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  try {
    const evento = await pool.query(`SELECT nombre FROM eventos WHERE id = $1`, [evento_id]);
    if (evento.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    const { rows, total, total_primera_vez, totalesPago } = await obtenerFilasDiplomas(evento_id);
    res.json({
      evento_nombre: evento.rows[0].nombre,
      filas: rows.map((r, i) => ({
        numero: i + 1,
        zona: r.zona,
        capitulo: r.capitulo || '',
        nombre_completo: r.nombre_completo,
        primera_vez: r.total_saeles === 1,
        metodo_pago: r.metodo_pago,
        alimentacion_monto: r.alimentacion_monto,
      })),
      total,
      total_primera_vez,
      totalesPago,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener la lista de diplomas.' });
  }
});

// Admin: descarga en Excel (mismo patrón que usa SFL: json_to_sheet + buffer)
router.get('/admin/eventos/:evento_id/diplomas/excel', requireAuth, requireModulo('diplomas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  try {
    const evento = await pool.query(`SELECT nombre FROM eventos WHERE id = $1`, [evento_id]);
    if (evento.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    const { rows, total, total_primera_vez, totalesPago } = await obtenerFilasDiplomas(evento_id);

    const datos = rows.map((r, i) => ({
      '#': i + 1,
      ZONA: r.zona,
      CAPÍTULO: r.capitulo || '',
      NOMBRE: r.nombre_completo,
      '1ER SAEL': r.total_saeles === 1 ? '1' : '',
      Efectivo: r.metodo_pago === 'efectivo' && r.alimentacion_monto ? Number(r.alimentacion_monto) : '',
      'Transferencia Bancaria': r.metodo_pago === 'transferencia' && r.alimentacion_monto ? Number(r.alimentacion_monto) : '',
      'Tarjeta credito/debito': r.metodo_pago === 'tarjeta' && r.alimentacion_monto ? Number(r.alimentacion_monto) : '',
    }));
    datos.push({});
    datos.push({ CAPÍTULO: 'Resumen' });
    datos.push({ CAPÍTULO: 'Total confirmados', NOMBRE: total });
    datos.push({ CAPÍTULO: 'Total primera vez', NOMBRE: total_primera_vez });
    datos.push({ CAPÍTULO: 'Total Efectivo', NOMBRE: totalesPago.efectivo });
    datos.push({ CAPÍTULO: 'Total Transferencia Bancaria', NOMBRE: totalesPago.transferencia });
    datos.push({ CAPÍTULO: 'Total TC / TD', NOMBRE: totalesPago.tarjeta });

    const hoja = xlsx.utils.json_to_sheet(datos);
    const libro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(libro, hoja, 'Diplomas');
    const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="diplomas_${evento.rows[0].nombre.replace(/\s+/g, '_')}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el Excel.' });
  }
});

// Admin: descarga en PDF (mismo patrón que usa SFL: PDFDocument, tabla dibujada a mano)
router.get('/admin/eventos/:evento_id/diplomas/pdf', requireAuth, requireModulo('diplomas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  try {
    const evento = await pool.query(`SELECT nombre FROM eventos WHERE id = $1`, [evento_id]);
    if (evento.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    const { rows, total, total_primera_vez, totalesPago } = await obtenerFilasDiplomas(evento_id);

    // Vertical (portrait), a pedido de Carlos.
    const doc = new PDFDocument({ size: 'letter', margin: 0, layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="diplomas_${evento.rows[0].nombre.replace(/\s+/g, '_')}.pdf"`);
    doc.pipe(res);

    const margenX = 40;
    const anchoPagina = doc.page.width;
    const rutaLogo = require('path').join(__dirname, '..', 'assets', 'logo-fihnec-emblema.png');

    function encabezadoPagina() {
      // Encabezado blanco con una línea de color abajo para separarlo del
      // contenido. Logo + título a la izquierda, totales en negrita
      // mayúscula a la derecha (2 líneas).
      const alturaEncabezado = 70;
      const cajaLogo = 54;
      const cajaX = margenX;
      const cajaY = 8;
      try {
        const altoLogo = cajaLogo;
        const anchoLogo = altoLogo * (923 / 787); // proporción real del archivo
        doc.image(rutaLogo, cajaX, cajaY, { height: altoLogo });
        var xTexto = cajaX + anchoLogo + 12;
      } catch (e) {
        // Si el logo no está presente por alguna razón, seguimos sin tumbar el PDF.
        var xTexto = cajaX;
      }
      doc.fillColor('#1F3464').fontSize(16).text('SAEL Hombres · FIHNEC', xTexto, 18, { lineBreak: false });
      doc.fontSize(10).fillColor('#E40521').text(`Diplomas — ${evento.rows[0].nombre}`, xTexto, 40, { lineBreak: false });

      // Totales a la derecha, en negrita y mayúscula, sin punto y coma.
      const anchoTotales = 220;
      const xTotales = anchoPagina - margenX - anchoTotales;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1F3464')
        .text(`TOTAL CONFIRMADOS: ${total}`, xTotales, 18, { width: anchoTotales, align: 'right', lineBreak: false });
      doc.fillColor('#E40521')
        .text(`TOTAL PRIMERA VEZ: ${total_primera_vez}`, xTotales, 34, { width: anchoTotales, align: 'right', lineBreak: false });
      doc.font('Helvetica');

      doc.moveTo(0, alturaEncabezado).lineTo(anchoPagina, alturaEncabezado).lineWidth(3).strokeColor('#1F3464').stroke();
      doc.lineWidth(1);
      doc.y = alturaEncabezado + 20;
    }

    // Tabla centrada horizontalmente en la página, columnas también
    // centradas (encabezados y datos por igual). Se achicaron las 5
    // columnas originales para que quepan las 3 nuevas de método de pago
    // sin salirse de la hoja vertical.
    const anchoCol = { num: 22, zona: 62, capitulo: 62, nombre: 108, primera: 42, efectivo: 62, transferencia: 72, tarjeta: 62 };
    const anchoTabla = Object.values(anchoCol).reduce((a, b) => a + b, 0);
    const inicioTabla = (anchoPagina - anchoTabla) / 2;
    const col = { num: inicioTabla };
    col.zona = col.num + anchoCol.num;
    col.capitulo = col.zona + anchoCol.zona;
    col.nombre = col.capitulo + anchoCol.capitulo;
    col.primera = col.nombre + anchoCol.nombre;
    col.efectivo = col.primera + anchoCol.primera;
    col.transferencia = col.efectivo + anchoCol.efectivo;
    col.tarjeta = col.transferencia + anchoCol.transferencia;

    function celda(texto, x, y, ancho, alineacion = 'center') {
      doc.text(texto, x, y, { width: ancho, align: alineacion, ellipsis: true, lineBreak: false });
    }

    // Igual que celda(), pero permite que el texto se envuelva a varias
    // líneas en vez de cortarse con "..." — para Zona/Capítulo/Nombre, que
    // se piden completos y a la izquierda.
    function celdaEnvuelta(texto, x, y, ancho) {
      doc.text(texto, x, y, { width: ancho, align: 'left' });
    }

    function encabezadosTabla() {
      const y = doc.y;
      doc.fontSize(8).fillColor('#000000');
      celda('#', col.num, y, anchoCol.num);
      celda('ZONA', col.zona, y, anchoCol.zona, 'left');
      celda('CAPÍTULO', col.capitulo, y, anchoCol.capitulo, 'left');
      celda('NOMBRE', col.nombre, y, anchoCol.nombre, 'left');
      celda('1ER SAEL', col.primera, y, anchoCol.primera);
      celda('EFECTIVO', col.efectivo, y, anchoCol.efectivo);
      celda('TRANSF.', col.transferencia, y, anchoCol.transferencia);
      celda('TARJETA', col.tarjeta, y, anchoCol.tarjeta);
      doc.y = y + 16;
      doc.moveTo(inicioTabla, doc.y).lineTo(inicioTabla + anchoTabla, doc.y).strokeColor('#cccccc').stroke();
      doc.y += 6;
    }

    encabezadoPagina();
    encabezadosTabla();

    rows.forEach((r, i) => {
      doc.fontSize(7).fillColor('#000000');
      // Zona/Capítulo/Nombre ahora se envuelven completos en vez de
      // cortarse — hay que medir cuánto ocupa cada una de verdad antes de
      // decidir la altura de la fila, o se encima con la siguiente.
      const alturaZona = doc.heightOfString(r.zona || '', { width: anchoCol.zona });
      const alturaCapitulo = doc.heightOfString(r.capitulo || '', { width: anchoCol.capitulo });
      const alturaNombre = doc.heightOfString(r.nombre_completo, { width: anchoCol.nombre });
      const alturaDatos = Math.max(alturaZona, alturaCapitulo, alturaNombre, 10);

      // Observación de pago (ej. motivo de una cortesía) — se agrega como
      // una notita debajo del nombre solo cuando esa persona tiene algo
      // escrito. Se mide su altura real para que tampoco se encime.
      const anchoObs = anchoCol.nombre + anchoCol.primera + anchoCol.efectivo;
      const alturaObs = r.observaciones_pago
        ? doc.heightOfString(`Obs: ${r.observaciones_pago}`, { width: anchoObs })
        : 0;
      const altoFila = alturaDatos + 6 + (alturaObs ? alturaObs + 2 : 0);

      if (doc.y + altoFila > doc.page.height - 40) {
        doc.addPage({ size: 'letter', margin: 0, layout: 'portrait' });
        encabezadoPagina();
        encabezadosTabla();
        doc.fontSize(7).fillColor('#000000');
      }
      const y = doc.y;
      celda(String(i + 1), col.num, y, anchoCol.num);
      celdaEnvuelta(r.zona || '', col.zona, y, anchoCol.zona);
      celdaEnvuelta(r.capitulo || '', col.capitulo, y, anchoCol.capitulo);
      celdaEnvuelta(r.nombre_completo, col.nombre, y, anchoCol.nombre);
      celda(r.total_saeles === 1 ? '1' : '', col.primera, y, anchoCol.primera);
      celda(r.metodo_pago === 'efectivo' && r.alimentacion_monto ? `L.${r.alimentacion_monto}` : '', col.efectivo, y, anchoCol.efectivo);
      celda(r.metodo_pago === 'transferencia' && r.alimentacion_monto ? `L.${r.alimentacion_monto}` : '', col.transferencia, y, anchoCol.transferencia);
      celda(r.metodo_pago === 'tarjeta' && r.alimentacion_monto ? `L.${r.alimentacion_monto}` : '', col.tarjeta, y, anchoCol.tarjeta);

      if (r.observaciones_pago) {
        doc.font('Helvetica-Oblique').fontSize(6).fillColor('#666666');
        doc.text(`Obs: ${r.observaciones_pago}`, col.nombre, y + alturaDatos + 2, { width: anchoObs });
        doc.font('Helvetica').fontSize(7).fillColor('#000000');
      }

      doc.y = y + altoFila;
    });

    // Resumen de totales, alineado bajo cada columna real — igual que ya
    // se hizo en el reporte de Control de Ingresos & Egresos.
    if (doc.y + 40 > doc.page.height - 40) {
      doc.addPage({ size: 'letter', margin: 0, layout: 'portrait' });
      encabezadoPagina();
    }
    doc.y += 10;
    doc.moveTo(inicioTabla, doc.y).lineTo(inicioTabla + anchoTabla, doc.y).strokeColor('#1F3464').lineWidth(1.5).stroke();
    doc.y += 8;
    const yTotalesDiplomas = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1F3464');
    celda('TOTALES', col.capitulo, yTotalesDiplomas, anchoCol.capitulo + anchoCol.nombre, 'left');
    celda(String(total_primera_vez), col.primera, yTotalesDiplomas, anchoCol.primera);
    celda(`L.${totalesPago.efectivo.toFixed(2)}`, col.efectivo, yTotalesDiplomas, anchoCol.efectivo);
    celda(`L.${totalesPago.transferencia.toFixed(2)}`, col.transferencia, yTotalesDiplomas, anchoCol.transferencia);
    celda(`L.${totalesPago.tarjeta.toFixed(2)}`, col.tarjeta, yTotalesDiplomas, anchoCol.tarjeta);
    doc.font('Helvetica');

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el PDF.' });
  }
});

// Admin: "Finalizar evento actual" — cierra el evento (abierto=false,
// es_actual=false). Nada se borra: las inscripciones sin "Registrado"
// simplemente dejan de contar en estadísticas y Diplomas porque ya no
// hay evento actual que las traiga a esas pantallas. Es reversible desde
// el módulo de Eventos si hace falta volver a abrirlo.
//
// Además, si este evento tenía boletería configurada (boleto_inicio y
// boleto_siguiente), se traslada automáticamente a "Evento anterior" en
// Control de Costos — así el próximo evento ya la ve ahí sin que el
// admin tenga que volver a escribirla a mano.
// NOTA: vive aquí por no tener eventos.js en esta sesión — lógicamente
// pertenece a ese módulo, es solo mover código si algún día lo reorganizas.
router.put('/admin/eventos/:id/finalizar', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const evento = await pool.query(
      `SELECT nombre, boleto_inicio, boleto_siguiente FROM eventos WHERE id = $1`,
      [id]
    );
    if (evento.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    const { rows } = await pool.query(
      `UPDATE eventos SET abierto = false, es_actual = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    const { nombre, boleto_inicio, boleto_siguiente } = evento.rows[0];
    if (boleto_inicio && boleto_siguiente && boleto_siguiente > boleto_inicio) {
      await pool.query(
        `INSERT INTO boleteria_config (id, evento_anterior_nombre, evento_anterior_inicio, evento_anterior_fin, actualizado_en)
         VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET
           evento_anterior_nombre = $1, evento_anterior_inicio = $2, evento_anterior_fin = $3, actualizado_en = now()`,
        [nombre, boleto_inicio, boleto_siguiente - 1]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo finalizar el evento.' });
  }
});

// ============================================================
// CONTROL DE COSTOS — conceptos configurables por evento (Alimentación,
// Ofrenda, Renta de espacio, y lo que se agregue) + Hotel por módulo
// (una fila por módulo, distinta del catálogo de referencia en Módulos).
// ============================================================

// Admin: lista los costos configurados para un evento, con el nombre del
// módulo ya resuelto cuando aplica (para las filas de Hotel).
router.get('/admin/eventos/:evento_id/costos', requireAuth, requireModulo('participantes', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.concepto, c.monto, c.modulo_id, c.es_boleto, c.cuenta_efectivo_id, c.cuenta_bancos_id,
              m.nombre AS modulo_nombre
       FROM eventos_costos c
       LEFT JOIN modulos m ON m.id = c.modulo_id
       WHERE c.evento_id = $1
       ORDER BY c.concepto ASC, m.nombre ASC NULLS FIRST`,
      [evento_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /admin/eventos/:evento_id/costos:', err);
    res.status(500).json({ error: 'No se pudo obtener los costos del evento.' });
  }
});

// Admin: crea o actualiza el monto de un concepto genérico (Alimentación,
// Ofrenda, Renta de espacio, etc. — sin módulo). Upsert por evento+concepto.
router.put('/admin/eventos/:evento_id/costos', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { evento_id } = req.params;
  const { concepto, monto } = req.body;
  if (!concepto || monto === undefined || monto === null) {
    return res.status(400).json({ error: 'Falta el concepto o el monto.' });
  }
  try {
    await pool.query(
      `INSERT INTO eventos_costos (evento_id, concepto, monto, modulo_id)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (evento_id, concepto) WHERE modulo_id IS NULL
       DO UPDATE SET monto = EXCLUDED.monto`,
      [evento_id, concepto, monto]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el costo.' });
  }
});

// Admin: edita un concepto genérico DIRECTO por su id — a diferencia del
// PUT por evento+concepto (que sirve para el monto de un concepto que ya
// existe), este permite además RENOMBRAR el concepto. Solo aplica a
// costos genéricos (modulo_id NULL) — los de Hotel se administran con su
// propio endpoint, por módulo.
router.put('/admin/eventos-costos/:id', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { concepto, monto } = req.body;
  if (!concepto || monto === undefined || monto === null) {
    return res.status(400).json({ error: 'Falta el concepto o el monto.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE eventos_costos SET concepto = $1, monto = $2 WHERE id = $3 AND modulo_id IS NULL RETURNING id`,
      [concepto, monto, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Costo no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un costo con ese nombre para este evento.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar el costo.' });
  }
});

// Admin: marca CUÁL costo genérico es el que alimenta "Inscripciones
// (Alimentación)" en el módulo de cobro y dispara la asignación de
// boleto — sin importar cómo se llame ese concepto. Solo uno puede estar
// marcado a la vez por evento: al marcar este, se desmarcan los demás
// del mismo evento en la misma transacción.
router.put('/admin/eventos-costos/:id/marcar-boleto', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const costo = await client.query(`SELECT evento_id FROM eventos_costos WHERE id = $1 AND modulo_id IS NULL`, [id]);
    if (costo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Costo no encontrado.' });
    }
    await client.query(`UPDATE eventos_costos SET es_boleto = false WHERE evento_id = $1`, [costo.rows[0].evento_id]);
    await client.query(`UPDATE eventos_costos SET es_boleto = true WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo marcar el costo.' });
  } finally {
    client.release();
  }
});

// Admin: elimina un concepto genérico (no aplica a los de Hotel por
// módulo, esos se administran solos según la lista de módulos existente)
router.delete('/admin/eventos-costos/:id', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`DELETE FROM eventos_costos WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Costo no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar el costo.' });
  }
});

// Admin: crea o actualiza el costo de Hotel para UN módulo específico,
// en un evento específico. Upsert por evento+concepto('Hotel')+modulo_id.
router.put('/admin/eventos/:evento_id/costos-modulo/:modulo_id', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { evento_id, modulo_id } = req.params;
  const { monto, cuenta_efectivo_id, cuenta_bancos_id } = req.body;
  if (monto === undefined || monto === null) {
    return res.status(400).json({ error: 'Falta el monto.' });
  }
  try {
    await pool.query(
      `INSERT INTO eventos_costos (evento_id, concepto, monto, modulo_id, cuenta_efectivo_id, cuenta_bancos_id)
       VALUES ($1, 'Hotel', $2, $3, $4, $5)
       ON CONFLICT (evento_id, concepto, modulo_id) WHERE modulo_id IS NOT NULL
       DO UPDATE SET monto = EXCLUDED.monto, cuenta_efectivo_id = EXCLUDED.cuenta_efectivo_id, cuenta_bancos_id = EXCLUDED.cuenta_bancos_id`,
      [evento_id, monto, modulo_id, cuenta_efectivo_id || null, cuenta_bancos_id || null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el costo del módulo.' });
  }
});

// ============================================================
// BOLETERÍA — inventario físico de boletos, cruza entre eventos.
// Reutiliza eventos.boleto_inicio/boleto_siguiente (ya existentes) para
// calcular todo — nada se duplica ni se guarda dos veces.
// ============================================================

// Admin: config actual (techo impreso, ubicación) — una sola fila
router.get('/admin/boleteria/config', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM boleteria_config WHERE id = 1`);
    res.json(rows[0] || {
      rango_fin_impreso: null, ubicacion: null, notas: null,
      evento_anterior_nombre: null, evento_anterior_inicio: null, evento_anterior_fin: null,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener la configuración de boletería.' });
  }
});

router.put('/admin/boleteria/config', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const {
    rango_fin_impreso, ubicacion, notas,
    evento_anterior_nombre, evento_anterior_inicio, evento_anterior_fin,
  } = req.body;
  try {
    await pool.query(
      `INSERT INTO boleteria_config (
        id, rango_fin_impreso, ubicacion, notas,
        evento_anterior_nombre, evento_anterior_inicio, evento_anterior_fin, actualizado_en
      )
       VALUES (1, $1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         rango_fin_impreso = $1, ubicacion = $2, notas = $3,
         evento_anterior_nombre = $4, evento_anterior_inicio = $5, evento_anterior_fin = $6,
         actualizado_en = now()`,
      [
        rango_fin_impreso || null, ubicacion || null, notas || null,
        evento_anterior_nombre || null, evento_anterior_inicio || null, evento_anterior_fin || null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar la configuración de boletería.' });
  }
});

// Admin: resumen calculado — evento anterior (dato MANUAL, capturado por
// el admin aquí mismo — no se busca en el módulo Eventos, por decisión
// explícita) + disponibilidad actual (calculada: arranca donde el
// evento actual va en su conteo real, o si todavía no ha empezado, justo
// después de donde terminó el evento anterior manual).
router.get('/admin/boleteria/resumen', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  const { evento_actual_id } = req.query;
  try {
    const config = await pool.query(`SELECT * FROM boleteria_config WHERE id = 1`);
    const cfg = config.rows[0] || {};
    const techo = cfg.rango_fin_impreso || null;

    let eventoActual = null;
    if (evento_actual_id) {
      const r = await pool.query(`SELECT boleto_inicio, boleto_siguiente FROM eventos WHERE id = $1`, [evento_actual_id]);
      eventoActual = r.rows[0] || null;
    }

    let resumenAnterior = null;
    if (cfg.evento_anterior_nombre && cfg.evento_anterior_inicio && cfg.evento_anterior_fin) {
      resumenAnterior = {
        evento_nombre: cfg.evento_anterior_nombre,
        inicio: cfg.evento_anterior_inicio,
        al: cfg.evento_anterior_fin,
        total_usados: cfg.evento_anterior_fin - cfg.evento_anterior_inicio,
      };
    }

    // El "Del" disponible arranca en el boleto_siguiente del evento
    // actual si ya tiene uno (avanza solo conforme se va usando en el
    // módulo de cobro); si no, justo después de donde terminó el evento
    // anterior capturado a mano.
    const inicioDisponible = eventoActual?.boleto_siguiente || (cfg.evento_anterior_fin ? cfg.evento_anterior_fin + 1 : null);
    let disponibilidad = null;
    if (inicioDisponible && techo) {
      disponibilidad = { del: inicioDisponible, al: techo, total: techo - inicioDisponible };
    }

    res.json({
      ubicacion: cfg.ubicacion || null,
      rango_fin_impreso: techo,
      resumen_evento_anterior: resumenAnterior,
      disponibilidad,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo calcular el resumen de boletería.' });
  }
});

// ============================================================
// CONTROL DE BOLETOS FÍSICOS (por evento)
// ============================================================

// Admin: define en qué número arranca el evento (basado en dónde quedó
// el evento anterior). Por defecto, boleto_siguiente SIEMPRE se sincroniza
// con el nuevo boleto_inicio — esto es intencional: cada vez que Control
// de Costos guarda el "Inventario inicial", debe ser un arranque limpio,
// sin quedarse pegado a un valor viejo de una prueba anterior. Solo si el
// llamador manda boleto_siguiente explícitamente (uso interno, no lo usa
// la pantalla de Control de Costos) se respeta ese valor en vez del reinicio.
router.put('/admin/eventos/:id/boletos', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { boleto_inicio, boleto_siguiente } = req.body;
  if (!boleto_inicio) {
    return res.status(400).json({ error: 'Falta el número de boleto inicial.' });
  }
  try {
    const actual = await pool.query(`SELECT id FROM eventos WHERE id = $1`, [id]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    const nuevoSiguiente = boleto_siguiente || boleto_inicio;
    await pool.query(
      `UPDATE eventos SET boleto_inicio = $1, boleto_siguiente = $2 WHERE id = $3`,
      [boleto_inicio, nuevoSiguiente, id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el control de boletos.' });
  }
});

// ============================================================
// MÓDULO DE COBRO — captura el pago al confirmar presencia
// ============================================================

// Admin: guarda lo que pagó la persona (Alimentación, Hotel, método,
// banco/recibo, boleto, observaciones) Y confirma su presencia en el
// mismo paso (registrado_presencial = true). Si pagó Alimentación y no
// se mandó un número de boleto a mano, el sistema asigna el siguiente en
// la fila del evento y avanza el contador — todo en una sola transacción,
// para que nunca se salte ni se repita un número por una carrera entre
// dos guardados al mismo tiempo.
router.put('/admin/inscripciones/:id/pago', requireAuth, requireModulo('participantes', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { alimentacion_monto, metodo_pago, banco_o_recibo, observaciones_pago } = req.body;

  if (alimentacion_monto === null || alimentacion_monto === undefined || alimentacion_monto === '') {
    return res.status(400).json({ error: '"Inscripciones (Alimentación)" es obligatorio.' });
  }
  // Método de pago es obligatorio SALVO cuando no se manda ninguno a
  // propósito (ej. Cortesía, que no tiene método de pago porque no se
  // paga nada) — pero si se manda algo, tiene que ser uno válido.
  if (metodo_pago && !['tarjeta', 'efectivo', 'transferencia'].includes(metodo_pago)) {
    return res.status(400).json({ error: 'El método de pago debe ser "tarjeta", "efectivo" o "transferencia".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inscripcion = await client.query(`SELECT evento_id, boleto_numero FROM inscripciones WHERE id = $1`, [id]);
    if (inscripcion.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inscripción no encontrada.' });
    }
    const evento_id = inscripcion.rows[0].evento_id;
    const boletoYaAsignado = inscripcion.rows[0].boleto_numero;

    // "Alimentación seleccionada" = el admin sí escogió algo (L.500 o
    // Cortesía) — en ambos casos consume un boleto, la diferencia es solo
    // el monto (0 en Cortesía). Si el campo se dejó sin seleccionar
    // (opcional, se puede guardar en blanco), no se asigna boleto.
    const alimentacionSeleccionada = alimentacion_monto !== null && alimentacion_monto !== undefined && alimentacion_monto !== '';

    // Si esta inscripción YA tenía un boleto asignado (de un guardado
    // anterior), se conserva tal cual — nunca se asigna uno nuevo por
    // volver a guardar la misma persona. Solo se asigna uno nuevo la
    // PRIMERA vez que a esta inscripción le toca boleto.
    let boletoFinal = boletoYaAsignado || null;
    if (alimentacionSeleccionada && !boletoYaAsignado) {
      const evento = await client.query(
        `SELECT boleto_siguiente FROM eventos WHERE id = $1 FOR UPDATE`,
        [evento_id]
      );
      const siguiente = evento.rows[0]?.boleto_siguiente;
      if (siguiente) {
        boletoFinal = String(siguiente);
        await client.query(`UPDATE eventos SET boleto_siguiente = $1 WHERE id = $2`, [siguiente + 1, evento_id]);
      }
      // Si el evento todavía no tiene boleto_inicio configurado (en
      // Entradas de Efectivo), no hay de dónde asignar — boletoFinal se
      // queda en null.
    }

    await client.query(
      `UPDATE inscripciones SET
        registrado_presencial = true,
        alimentacion_monto = $1, metodo_pago = $2, banco_o_recibo = $3,
        boleto_numero = $4, observaciones_pago = $5
      WHERE id = $6`,
      [
        alimentacionSeleccionada ? Number(alimentacion_monto) : null,
        metodo_pago || null, banco_o_recibo || null, boletoFinal, observaciones_pago || null,
        id,
      ]
    );

    await client.query('COMMIT');
    res.json({ ok: true, boleto_numero: boletoFinal });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo guardar el pago.' });
  } finally {
    client.release();
  }
});

// ============================================================
// INVENTARIO DE DIPLOMAS — standalone, captura 100% manual
// ============================================================

router.get('/admin/diplomas/inventario', requireAuth, requireModulo('diplomas', 'consulta'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM diplomas_inventario WHERE id = 1`);
    res.json(rows[0] || { inventario_usado: null, inventario_existentes: null });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el inventario de diplomas.' });
  }
});

router.put('/admin/diplomas/inventario', requireAuth, requireModulo('diplomas', 'edicion'), async (req, res) => {
  const { inventario_usado, inventario_existentes } = req.body;
  try {
    await pool.query(
      `INSERT INTO diplomas_inventario (id, inventario_usado, inventario_existentes, actualizado_en)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET inventario_usado = $1, inventario_existentes = $2, actualizado_en = now()`,
      [inventario_usado ?? null, inventario_existentes ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el inventario de diplomas.' });
  }
});

module.exports = router;
