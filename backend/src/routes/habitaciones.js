const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');

// ============================================================
// MÓDULOS (edificio/sección — agrupación fija de habitaciones)
// ============================================================

router.get('/admin/modulos', requireAuth, requireModulo('habitaciones', 'consulta'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM modulos ORDER BY nombre ASC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el listado de módulos.' });
  }
});

router.post('/admin/modulos', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { nombre, precio_por_persona, notas } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del módulo es obligatorio.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO modulos (nombre, precio_por_persona, notas) VALUES ($1, $2, $3) RETURNING id`,
      [nombre, precio_por_persona || null, notas || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo crear el módulo.' });
  }
});

router.put('/admin/modulos/:id', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { nombre, precio_por_persona, notas } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del módulo es obligatorio.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE modulos SET nombre = $1, precio_por_persona = $2, notas = $3 WHERE id = $4 RETURNING id`,
      [nombre, precio_por_persona || null, notas || null, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Módulo no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el módulo.' });
  }
});

// Elimina un módulo. Las habitaciones que estaban en él NO se borran —
// quedan sin módulo asignado (ON DELETE SET NULL en la migración).
router.delete('/admin/modulos/:id', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`DELETE FROM modulos WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Módulo no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar el módulo.' });
  }
});

// ============================================================
// CATÁLOGO DE HABITACIONES (fijo, no cambia entre eventos)
// ============================================================

// Admin: listado del catálogo, agrupado por módulo, con el estado
// calculado (DISPONIBLE / NO DISPONIBLE) y los NOMBRES de los ocupantes
// ya incluidos — todo en una sola consulta, para que la tabla se pueda
// pintar de una vez sin pedir el detalle de cada habitación por separado.
router.get('/admin/habitaciones', requireAuth, requireModulo('habitaciones', 'consulta'), async (req, res) => {
  const { evento_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT h.id, h.numero, h.capacidad, h.notas, h.modulo_id,
              m.nombre AS modulo_nombre, m.precio_por_persona AS modulo_precio,
              COALESCE(o.total_ocupantes, 0) AS ocupantes,
              COALESCE(o.ocupantes_json, '[]'::json) AS ocupantes_detalle,
              r.nombre_reservado, r.numero_transferencia, r.monto AS reserva_monto,
              r.metodo_pago AS reserva_metodo_pago, r.observaciones AS reserva_observaciones,
              r.es_reserva_seguridad
       FROM habitaciones h
       LEFT JOIN modulos m ON m.id = h.modulo_id
       LEFT JOIN (
         SELECT ho.habitacion_id,
                COUNT(*) AS total_ocupantes,
                json_agg(json_build_object(
                  'id', ho.id,
                  'nombre', COALESCE(p.nombre_completo, s.nombre_completo),
                  'tipo', ho.tipo_ocupante
                ) ORDER BY ho.creado_en ASC) AS ocupantes_json
         FROM habitacion_ocupantes ho
         LEFT JOIN participantes p ON p.id = ho.participante_id
         LEFT JOIN saelistas s ON s.id = ho.saelista_id
         WHERE ho.evento_id = $1
         GROUP BY ho.habitacion_id
       ) o ON o.habitacion_id = h.id
       LEFT JOIN habitacion_reservas r ON r.habitacion_id = h.id AND r.evento_id = $1
       ORDER BY m.nombre ASC NULLS LAST,
                CASE WHEN h.numero ~ '^[0-9]+$' THEN LPAD(h.numero, 10, '0') ELSE h.numero END ASC`,
      [evento_id || null]
    );
    // Cuatro estados posibles, ya sin "parcial" — la capacidad es solo
    // informativa, no se fuerza a llenarla:
    //   OCUPADA    — tiene al menos un ocupante real asignado (roster)
    //   SEGURIDAD  — apartada sin depósito todavía (es_reserva_seguridad)
    //   BLOQUEADA  — apartada con depósito/transferencia ya capturado
    //   DISPONIBLE — nada de lo anterior
    // "sin_cobro" marca una habitación OCUPADA que todavía no tiene fila
    // de cobro en habitacion_reservas (reserva_monto NULL) — la persona
    // titular ya está en el roster pero el pago no se guardó todavía.
    const conEstado = rows.map((r) => {
      const ocupantes = parseInt(r.ocupantes, 10);
      let estado = 'DISPONIBLE';
      if (ocupantes > 0) estado = 'OCUPADA';
      else if (r.es_reserva_seguridad) estado = 'SEGURIDAD';
      else if (r.nombre_reservado) estado = 'BLOQUEADA';
      const sinCobro = ocupantes > 0 && (r.reserva_monto === null || r.reserva_monto === undefined);
      const titular = r.ocupantes_detalle && r.ocupantes_detalle.length > 0 ? r.ocupantes_detalle[0].nombre : null;
      return { ...r, ocupantes, estado, sin_cobro: sinCobro, titular };
    });
    res.json(conEstado);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el listado de habitaciones.' });
  }
});

// Admin: crea una habitación nueva en el catálogo
router.post('/admin/habitaciones', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { numero, capacidad, notas, modulo_id } = req.body;
  if (!numero || !capacidad || capacidad < 1) {
    return res.status(400).json({ error: 'El número y la capacidad (mínimo 1) son obligatorios.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO habitaciones (numero, capacidad, notas, modulo_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [numero, capacidad, notas || null, modulo_id || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una habitación con ese número.' });
    }
    res.status(500).json({ error: 'No se pudo crear la habitación.' });
  }
});

// Admin: edita una habitación del catálogo (ej. cambiar capacidad o módulo)
router.put('/admin/habitaciones/:id', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { numero, capacidad, notas, modulo_id } = req.body;
  if (!numero || !capacidad || capacidad < 1) {
    return res.status(400).json({ error: 'El número y la capacidad (mínimo 1) son obligatorios.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE habitaciones SET numero = $1, capacidad = $2, notas = $3, modulo_id = $4 WHERE id = $5 RETURNING id`,
      [numero, capacidad, notas || null, modulo_id || null, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una habitación con ese número.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar la habitación.' });
  }
});

// Admin: elimina una habitación del catálogo por completo (también borra
// su historial de ocupantes de todos los eventos, por el ON DELETE CASCADE)
router.delete('/admin/habitaciones/:id', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const habitacion = await pool.query(`SELECT * FROM habitaciones WHERE id = $1`, [id]);
    if (habitacion.rows.length === 0) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }
    const fila = habitacion.rows[0];

    // Se archiva en la Papelera ANTES de borrar (Fase 2 de Mantenimiento).
    // Sus ocupantes y cobro de ese momento (habitacion_ocupantes,
    // habitacion_reservas) se borran solos por el ON DELETE CASCADE ya
    // configurado — y a propósito NO se restauran junto con la habitación
    // (decisión tomada con Carlos): si alguien restaura esta habitación
    // más tarde, sus antiguos ocupantes pudieron haberse reasignado a
    // otra habitación mientras tanto, y traerlos de vuelta chocaría con
    // el candado contra asignaciones duplicadas. Vuelve vacía, y se
    // reasigna manualmente si hace falta.
    await pool.query(
      `INSERT INTO papelera (tipo, descripcion, tabla_origen, datos)
       VALUES ('Habitación', $1, 'habitaciones', $2)`,
      [`Habitación ${fila.numero}`, JSON.stringify(fila)]
    );

    await pool.query(`DELETE FROM habitaciones WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar la habitación.' });
  }
});

// ============================================================
// OCUPANTES DE UNA HABITACIÓN (por evento)
// ============================================================

// Admin: lista los ocupantes de una habitación específica, en un evento
// específico — usada por la pantalla de gestión. Ya no trae monto ni
// método de pago por persona: ese dato ahora vive una sola vez por
// habitación en habitacion_reservas (ver GET /admin/habitaciones).
router.get('/admin/habitaciones/:id/ocupantes', requireAuth, requireModulo('habitaciones', 'consulta'), async (req, res) => {
  const { id } = req.params;
  const { evento_id } = req.query;
  if (!evento_id) {
    return res.status(400).json({ error: 'Falta indicar el evento.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.tipo_ocupante,
              COALESCE(p.nombre_completo, s.nombre_completo) AS nombre_completo,
              COALESCE(p.capitulo, s.capitulo) AS capitulo,
              COALESCE(p.telefono_movil, s.celular) AS telefono
       FROM habitacion_ocupantes o
       LEFT JOIN participantes p ON p.id = o.participante_id
       LEFT JOIN saelistas s ON s.id = o.saelista_id
       WHERE o.habitacion_id = $1 AND o.evento_id = $2
       ORDER BY o.creado_en ASC`,
      [id, evento_id]
    );
    // El primero por fecha de creación es el titular — es el mismo orden
    // que ya usaba GET /admin/habitaciones para "ocupantes_detalle".
    const conTitular = rows.map((r, i) => ({ ...r, es_titular: i === 0 }));
    res.json(conTitular);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener los ocupantes de la habitación.' });
  }
});

// Valida método de pago y, si es "transferencia", exige que la
// habitación no venga de una reserva de seguridad (nunca hubo depósito
// real, así que el cobro en ese caso solo puede ser en efectivo).
async function validarMetodoPago(id, metodo_pago) {
  if (!['efectivo', 'transferencia'].includes(metodo_pago)) {
    return 'El método de pago debe ser "efectivo" o "transferencia".';
  }
  if (metodo_pago === 'transferencia') {
    const reserva = await pool.query(
      `SELECT es_reserva_seguridad FROM habitacion_reservas WHERE habitacion_id = $1`,
      [id]
    );
    if (reserva.rows.length > 0 && reserva.rows[0].es_reserva_seguridad) {
      return 'Esta habitación viene de una reserva de seguridad, nunca hubo depósito — el cobro debe ser en efectivo.';
    }
  }
  return null;
}

// Admin: asigna al TITULAR de una habitación — en una sola operación
// crea el roster (habitacion_ocupantes) y el cobro de la habitación
// completa (habitacion_reservas), con el monto tomado automáticamente
// del precio de Hotel configurado para el módulo. Solo se usa cuando la
// habitación todavía no tiene ningún ocupante — para agregar ocupantes
// adicionales sin costo extra, usar POST .../ocupantes-adicionales.
router.post('/admin/habitaciones/:id/titular', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { evento_id, tipo_ocupante, participante_id, saelista_id, nombre_titular, metodo_pago, numero_transferencia, observaciones } = req.body;

  if (!evento_id) return res.status(400).json({ error: 'Falta indicar el evento.' });
  if (tipo_ocupante !== 'participante' && tipo_ocupante !== 'saelista') {
    return res.status(400).json({ error: 'El tipo de ocupante debe ser "participante" o "saelista".' });
  }
  if (tipo_ocupante === 'participante' && !participante_id) {
    return res.status(400).json({ error: 'Debes seleccionar un participante.' });
  }
  if (tipo_ocupante === 'saelista' && !saelista_id) {
    return res.status(400).json({ error: 'Debes seleccionar un saelista.' });
  }
  const errorMetodo = await validarMetodoPago(id, metodo_pago).catch(() => null);
  if (errorMetodo) return res.status(400).json({ error: errorMetodo });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const habitacion = await client.query(`SELECT capacidad, modulo_id FROM habitaciones WHERE id = $1`, [id]);
    if (habitacion.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La habitación no existe.' });
    }
    const { capacidad, modulo_id: moduloId } = habitacion.rows[0];
    if (!moduloId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Esta habitación no tiene un módulo asignado — asígnale uno primero en Habitaciones.' });
    }

    const actuales = await client.query(
      `SELECT COUNT(*) FROM habitacion_ocupantes WHERE habitacion_id = $1 AND evento_id = $2`,
      [id, evento_id]
    );
    if (parseInt(actuales.rows[0].count, 10) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Esta habitación ya tiene un titular asignado — usa "Agregar otro ocupante" en vez de esto.' });
    }
    if (parseInt(actuales.rows[0].count, 10) >= capacidad) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Esta habitación ya alcanzó su capacidad máxima para este evento.' });
    }

    const columnaPersona = tipo_ocupante === 'participante' ? 'participante_id' : 'saelista_id';
    const idPersona = tipo_ocupante === 'participante' ? participante_id : saelista_id;
    const yaAsignado = await client.query(
      `SELECT h.numero
       FROM habitacion_ocupantes ho
       JOIN habitaciones h ON h.id = ho.habitacion_id
       WHERE ho.evento_id = $1 AND ho.${columnaPersona} = $2
       LIMIT 1`,
      [evento_id, idPersona]
    );
    if (yaAsignado.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Esta persona ya está asignada a la Habitación ${yaAsignado.rows[0].numero} en este evento. Quítala de ahí primero si necesitas moverla.`,
      });
    }

    const precio = await client.query(
      `SELECT monto FROM eventos_costos WHERE evento_id = $1 AND modulo_id = $2 AND concepto = 'Hotel'`,
      [evento_id, moduloId]
    );
    if (precio.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Este módulo todavía no tiene un precio de Hotel configurado — configúralo primero en Entradas de Efectivo.' });
    }

    await client.query(
      `INSERT INTO habitacion_ocupantes (habitacion_id, evento_id, tipo_ocupante, participante_id, saelista_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, evento_id, tipo_ocupante, tipo_ocupante === 'participante' ? participante_id : null, tipo_ocupante === 'saelista' ? saelista_id : null]
    );

    await client.query(
      `INSERT INTO habitacion_reservas (habitacion_id, evento_id, nombre_reservado, numero_transferencia, monto, metodo_pago, observaciones, es_reserva_seguridad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       ON CONFLICT (habitacion_id, evento_id) DO UPDATE SET
         nombre_reservado = EXCLUDED.nombre_reservado,
         numero_transferencia = EXCLUDED.numero_transferencia,
         monto = EXCLUDED.monto,
         metodo_pago = EXCLUDED.metodo_pago,
         observaciones = EXCLUDED.observaciones,
         es_reserva_seguridad = false`,
      [id, evento_id, nombre_titular || null, metodo_pago === 'transferencia' ? (numero_transferencia || null) : null, precio.rows[0].monto, metodo_pago, observaciones || null]
    );

    await client.query('COMMIT');
    res.status(201).json({ ok: true, monto: precio.rows[0].monto });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al asignar titular:', err);
    res.status(500).json({ error: 'No se pudo asignar el titular de la habitación.' });
  } finally {
    client.release();
  }
});

// Admin: agrega un ocupante ADICIONAL a una habitación que ya tiene
// titular — solo roster, sin costo extra (el cobro ya quedó fijado por
// habitación al asignar el titular).
router.post('/admin/habitaciones/:id/ocupantes-adicionales', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { evento_id, tipo_ocupante, participante_id, saelista_id } = req.body;

  if (!evento_id) return res.status(400).json({ error: 'Falta indicar el evento.' });
  if (tipo_ocupante !== 'participante' && tipo_ocupante !== 'saelista') {
    return res.status(400).json({ error: 'El tipo de ocupante debe ser "participante" o "saelista".' });
  }
  if (tipo_ocupante === 'participante' && !participante_id) {
    return res.status(400).json({ error: 'Debes seleccionar un participante.' });
  }
  if (tipo_ocupante === 'saelista' && !saelista_id) {
    return res.status(400).json({ error: 'Debes seleccionar un saelista.' });
  }

  try {
    const habitacion = await pool.query(`SELECT capacidad FROM habitaciones WHERE id = $1`, [id]);
    if (habitacion.rows.length === 0) {
      return res.status(404).json({ error: 'La habitación no existe.' });
    }

    const columnaPersona = tipo_ocupante === 'participante' ? 'participante_id' : 'saelista_id';
    const idPersona = tipo_ocupante === 'participante' ? participante_id : saelista_id;
    const yaAsignado = await pool.query(
      `SELECT h.numero
       FROM habitacion_ocupantes ho
       JOIN habitaciones h ON h.id = ho.habitacion_id
       WHERE ho.evento_id = $1 AND ho.${columnaPersona} = $2
       LIMIT 1`,
      [evento_id, idPersona]
    );
    if (yaAsignado.rows.length > 0) {
      return res.status(400).json({
        error: `Esta persona ya está asignada a la Habitación ${yaAsignado.rows[0].numero} en este evento. Quítala de ahí primero si necesitas moverla.`,
      });
    }

    const actuales = await pool.query(
      `SELECT COUNT(*) FROM habitacion_ocupantes WHERE habitacion_id = $1 AND evento_id = $2`,
      [id, evento_id]
    );
    if (parseInt(actuales.rows[0].count, 10) === 0) {
      return res.status(400).json({ error: 'Esta habitación todavía no tiene titular — asígnalo primero.' });
    }
    if (parseInt(actuales.rows[0].count, 10) >= habitacion.rows[0].capacidad) {
      return res.status(400).json({ error: 'Esta habitación ya alcanzó su capacidad máxima para este evento.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO habitacion_ocupantes (habitacion_id, evento_id, tipo_ocupante, participante_id, saelista_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [id, evento_id, tipo_ocupante, tipo_ocupante === 'participante' ? participante_id : null, tipo_ocupante === 'saelista' ? saelista_id : null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo asignar el ocupante.' });
  }
});

// Admin: edita el cobro de una habitación ya asignada (método de pago,
// observaciones) sin tocar el roster de ocupantes.
router.put('/admin/habitaciones/:id/cobro', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { evento_id, metodo_pago, numero_transferencia, observaciones } = req.body;
  if (!evento_id) return res.status(400).json({ error: 'Falta indicar el evento.' });
  const errorMetodo = await validarMetodoPago(id, metodo_pago).catch(() => null);
  if (errorMetodo) return res.status(400).json({ error: errorMetodo });
  try {
    const { rows } = await pool.query(
      `UPDATE habitacion_reservas SET metodo_pago = $1, numero_transferencia = $2, observaciones = $3
       WHERE habitacion_id = $4 AND evento_id = $5 RETURNING id`,
      [metodo_pago, metodo_pago === 'transferencia' ? (numero_transferencia || null) : null, observaciones || null, id, evento_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Esta habitación todavía no tiene un cobro registrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el cobro de la habitación.' });
  }
});

// Admin: quita a alguien de una habitación (deshace la asignación,
// libera el espacio para este evento — no afecta eventos anteriores).
// Si era el último ocupante, también se borra el cobro de la
// habitación (habitacion_reservas) para que vuelva a quedar DISPONIBLE
// de verdad, en vez de dejar un monto huérfano sin nadie ahí.
router.delete('/admin/habitacion-ocupantes/:ocupanteId', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { ocupanteId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `DELETE FROM habitacion_ocupantes WHERE id = $1 RETURNING habitacion_id, evento_id`,
      [ocupanteId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asignación no encontrada.' });
    }
    const { habitacion_id, evento_id } = rows[0];
    const restantes = await client.query(
      `SELECT COUNT(*) FROM habitacion_ocupantes WHERE habitacion_id = $1 AND evento_id = $2`,
      [habitacion_id, evento_id]
    );
    if (parseInt(restantes.rows[0].count, 10) === 0) {
      await client.query(
        `DELETE FROM habitacion_reservas WHERE habitacion_id = $1 AND evento_id = $2 AND es_reserva_seguridad = false`,
        [habitacion_id, evento_id]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo quitar al ocupante.' });
  } finally {
    client.release();
  }
});

// ============================================================
// RESERVAS (bloqueo manual de una habitación, por evento)
// ============================================================

// Admin: bloquea una habitación para el evento indicado — captura a
// nombre de quién (todavía no existe como Participante, por eso es
// texto libre) y el número de la transferencia bancaria del depósito
// previo. El monto NO se pide a mano: se toma automáticamente del
// precio de Hotel ya configurado para el módulo de esa habitación (en
// Entradas de Efectivo), porque ese precio ya se conoce de antemano. Se
// suma a Control de Ingresos desde este momento, no hasta que la
// persona llegue.
router.post('/admin/habitaciones/:id/reservar', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { evento_id, nombre_reservado, numero_transferencia, es_reserva_seguridad, observaciones } = req.body;
  // Reserva de seguridad: solo apartar el cupo, sin depósito real todavía —
  // no pide número de transferencia, y no debe sumar a Control de Ingresos.
  if (es_reserva_seguridad) {
    if (!evento_id || !nombre_reservado) {
      return res.status(400).json({ error: 'Faltan datos: evento y nombre son obligatorios.' });
    }
  } else if (!evento_id || !nombre_reservado || !numero_transferencia) {
    return res.status(400).json({ error: 'Faltan datos: evento, nombre, y número de transferencia son obligatorios.' });
  }
  try {
    const habitacion = await pool.query(`SELECT modulo_id FROM habitaciones WHERE id = $1`, [id]);
    if (habitacion.rows.length === 0) {
      return res.status(404).json({ error: 'La habitación no existe.' });
    }
    const moduloId = habitacion.rows[0].modulo_id;
    if (!moduloId) {
      return res.status(400).json({ error: 'Esta habitación no tiene un módulo asignado — asígnale uno primero en Habitaciones.' });
    }

    // Una reserva de seguridad no tiene depósito real todavía, así que su
    // monto queda en NULL a propósito — eso es lo que hace que Control de
    // Ingresos & Egresos no la cuente (la consulta de Hotel ya filtra por
    // "monto IS NOT NULL"). En cuanto se le asigne alguien de verdad, esa
    // fila se reemplaza por una asignación real con su propio monto.
    let monto = null;
    if (!es_reserva_seguridad) {
      const precio = await pool.query(
        `SELECT monto FROM eventos_costos WHERE evento_id = $1 AND modulo_id = $2 AND concepto = 'Hotel'`,
        [evento_id, moduloId]
      );
      if (precio.rows.length === 0) {
        return res.status(400).json({ error: 'Este módulo todavía no tiene un precio de Hotel configurado — configúralo primero en Entradas de Efectivo.' });
      }
      monto = precio.rows[0].monto;
    }

    // Una reserva de seguridad no implica ningún pago todavía (metodo_pago
    // queda NULL); una reserva normal siempre trae número de transferencia,
    // así que su método de pago es 'transferencia' por definición.
    const metodoPago = es_reserva_seguridad ? null : 'transferencia';

    await pool.query(
      `INSERT INTO habitacion_reservas (habitacion_id, evento_id, nombre_reservado, numero_transferencia, monto, metodo_pago, observaciones, es_reserva_seguridad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (habitacion_id, evento_id) DO UPDATE SET
         nombre_reservado = EXCLUDED.nombre_reservado,
         numero_transferencia = EXCLUDED.numero_transferencia,
         monto = EXCLUDED.monto,
         metodo_pago = EXCLUDED.metodo_pago,
         observaciones = EXCLUDED.observaciones,
         es_reserva_seguridad = EXCLUDED.es_reserva_seguridad`,
      [id, evento_id, nombre_reservado, numero_transferencia || null, monto, metodoPago, observaciones || null, !!es_reserva_seguridad]
    );
    res.status(201).json({ ok: true, monto });
  } catch (err) {
    console.error('Error al bloquear habitación:', err);
    res.status(500).json({ error: 'No se pudo bloquear la habitación.' });
  }
});

// Admin: desbloquea una habitación (para el evento indicado) — vuelve a
// quedar disponible para el público en general.
router.delete('/admin/habitaciones/:id/reservar', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { evento_id } = req.query;
  if (!evento_id) {
    return res.status(400).json({ error: 'Falta indicar el evento.' });
  }
  try {
    await pool.query(`DELETE FROM habitacion_reservas WHERE habitacion_id = $1 AND evento_id = $2`, [id, evento_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo desbloquear la habitación.' });
  }
});

module.exports = router;
