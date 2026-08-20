const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');

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
      `SELECT id, nombre_completo FROM participantes WHERE numero_identificacion = $1`,
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

// Público: crea un nuevo participante (solo la primera vez que se registra)
router.post('/participantes', async (req, res) => {
  const {
    numero_identificacion, nombre_completo, fecha_nacimiento, telefono_movil,
    departamento, municipio, capitulo, zona, cargo_fihnec, estado_civil,
    ha_recibido_saeles, veces_saeles_previas,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
  } = req.body;

  if (!validarDni(numero_identificacion)) {
    return res.status(400).json({ error: 'El DNI debe tener 13 dígitos.' });
  }
  if (!nombre_completo || !fecha_nacimiento || !telefono_movil || !departamento || !municipio || !zona || !cargo_fihnec || !estado_civil) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
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
    const { rows } = await pool.query(
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

// Público: inscribe a un participante (ya existente) a un evento específico
router.post('/inscripciones', async (req, res) => {
  const { participante_id, evento_id } = req.body;
  if (!participante_id || !evento_id) {
    return res.status(400).json({ error: 'Faltan datos para completar la inscripción.' });
  }
  try {
    const evento = await pool.query(`SELECT abierto FROM eventos WHERE id = $1`, [evento_id]);
    if (evento.rows.length === 0) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }
    if (!evento.rows[0].abierto) {
      return res.status(400).json({ error: 'El registro para este evento está cerrado.' });
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

  const condiciones = ['oculto = false'];
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
  try {
    const { rows } = await pool.query(
      `SELECT tipo_participante, COUNT(*) AS total FROM participantes WHERE oculto = false GROUP BY tipo_participante`
    );
    const estadisticas = { total: 0, nacional: 0, extranjero: 0 };
    rows.forEach((r) => {
      const cantidad = parseInt(r.total, 10);
      estadisticas[r.tipo_participante] = cantidad;
      estadisticas.total += cantidad;
    });
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
  try {
    const { rows } = await pool.query(
      `UPDATE participantes SET oculto = true WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Participante no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo ocultar al participante.' });
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
       ORDER BY p.nombre_completo ASC`,
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

    const inscripcion = await client.query(
      `SELECT participante_id, registrado_presencial FROM inscripciones WHERE id = $1`,
      [id]
    );
    if (inscripcion.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inscripción no encontrada.' });
    }
    if (inscripcion.rows[0].registrado_presencial) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'No se puede eliminar una inscripción con asistencia confirmada. Desmarca "Registrado" primero si fue un error.',
      });
    }

    const participante_id = inscripcion.rows[0].participante_id;
    await client.query(`DELETE FROM inscripciones WHERE id = $1`, [id]);

    const restantes = await client.query(
      `SELECT COUNT(*) FROM inscripciones WHERE participante_id = $1`,
      [participante_id]
    );
    let participante_eliminado = false;
    if (parseInt(restantes.rows[0].count, 10) === 0) {
      await client.query(`DELETE FROM participantes WHERE id = $1`, [participante_id]);
      participante_eliminado = true;
    }

    await client.query('COMMIT');
    res.json({ ok: true, participante_eliminado });
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
  try {
    const { rows } = await pool.query(
      `UPDATE inscripciones SET registrado_presencial = $1 WHERE id = $2 RETURNING id`,
      [!!registrado_presencial, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inscripción no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el estado de asistencia.' });
  }
});

module.exports = router;
