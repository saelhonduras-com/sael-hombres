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
              r.nombre_reservado, r.numero_transferencia, r.monto AS reserva_monto
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
    const conEstado = rows.map((r) => {
      const ocupantes = parseInt(r.ocupantes, 10);
      let estado = ocupantes === 0 ? 'DISPONIBLE' : 'NO DISPONIBLE';
      // La reserva (bloqueo manual) tiene prioridad visual sobre lo demás —
      // aunque la habitación ya tenga algún ocupante, si sigue bloqueada
      // se muestra como BLOQUEADA para que quede claro que hay un acuerdo
      // especial ahí (ej. reservada para alguien más que todavía falta
      // por asignar).
      if (r.nombre_reservado) estado = 'BLOQUEADA';
      return { ...r, ocupantes, estado };
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
    const { rows } = await pool.query(`DELETE FROM habitaciones WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar la habitación.' });
  }
});

// ============================================================
// OCUPANTES DE UNA HABITACIÓN (por evento)
// ============================================================

// Admin: lista los ocupantes de una habitación específica, en un evento
// específico, con todo el detalle (monto, banco, observaciones) — usada
// por la pantalla de gestión, no por la tabla resumen de arriba.
router.get('/admin/habitaciones/:id/ocupantes', requireAuth, requireModulo('habitaciones', 'consulta'), async (req, res) => {
  const { id } = req.params;
  const { evento_id } = req.query;
  if (!evento_id) {
    return res.status(400).json({ error: 'Falta indicar el evento.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.tipo_ocupante, o.monto, o.metodo_pago, o.banco_o_recibo, o.observaciones,
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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener los ocupantes de la habitación.' });
  }
});

// Admin: asigna un nuevo ocupante a una habitación, en un evento
// específico. Valida que no se pase de la capacidad de la habitación.
router.post('/admin/habitaciones/:id/ocupantes', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { evento_id, tipo_ocupante, participante_id, saelista_id, monto, metodo_pago, banco_o_recibo, observaciones } = req.body;

  if (!evento_id) {
    return res.status(400).json({ error: 'Falta indicar el evento.' });
  }
  if (tipo_ocupante !== 'participante' && tipo_ocupante !== 'saelista') {
    return res.status(400).json({ error: 'El tipo de ocupante debe ser "participante" o "saelista".' });
  }
  if (tipo_ocupante === 'participante' && !participante_id) {
    return res.status(400).json({ error: 'Debes seleccionar un participante.' });
  }
  if (tipo_ocupante === 'saelista' && !saelista_id) {
    return res.status(400).json({ error: 'Debes seleccionar un saelista.' });
  }
  if (metodo_pago && !['tarjeta', 'efectivo', 'transferencia'].includes(metodo_pago)) {
    return res.status(400).json({ error: 'El método de pago debe ser "tarjeta", "efectivo" o "transferencia".' });
  }

  try {
    const habitacion = await pool.query(`SELECT capacidad FROM habitaciones WHERE id = $1`, [id]);
    if (habitacion.rows.length === 0) {
      return res.status(404).json({ error: 'La habitación no existe.' });
    }
    const actuales = await pool.query(
      `SELECT COUNT(*) FROM habitacion_ocupantes WHERE habitacion_id = $1 AND evento_id = $2`,
      [id, evento_id]
    );
    if (parseInt(actuales.rows[0].count, 10) >= habitacion.rows[0].capacidad) {
      return res.status(400).json({ error: 'Esta habitación ya alcanzó su capacidad máxima para este evento.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO habitacion_ocupantes (
        habitacion_id, evento_id, tipo_ocupante, participante_id, saelista_id,
        monto, metodo_pago, banco_o_recibo, observaciones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        id, evento_id, tipo_ocupante,
        tipo_ocupante === 'participante' ? participante_id : null,
        tipo_ocupante === 'saelista' ? saelista_id : null,
        monto || null, metodo_pago || null, banco_o_recibo || null, observaciones || null,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo asignar el ocupante.' });
  }
});

// Admin: edita los datos de una asignación (monto, método de pago, banco/recibo, observaciones)
router.put('/admin/habitacion-ocupantes/:ocupanteId', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { ocupanteId } = req.params;
  const { monto, metodo_pago, banco_o_recibo, observaciones } = req.body;
  if (metodo_pago && !['tarjeta', 'efectivo', 'transferencia'].includes(metodo_pago)) {
    return res.status(400).json({ error: 'El método de pago debe ser "tarjeta", "efectivo" o "transferencia".' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE habitacion_ocupantes SET monto = $1, metodo_pago = $2, banco_o_recibo = $3, observaciones = $4
       WHERE id = $5 RETURNING id`,
      [monto || null, metodo_pago || null, banco_o_recibo || null, observaciones || null, ocupanteId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar la asignación.' });
  }
});

// Admin: quita a alguien de una habitación (deshace la asignación,
// libera el espacio para este evento — no afecta eventos anteriores)
router.delete('/admin/habitacion-ocupantes/:ocupanteId', requireAuth, requireModulo('habitaciones', 'edicion'), async (req, res) => {
  const { ocupanteId } = req.params;
  try {
    const { rows } = await pool.query(`DELETE FROM habitacion_ocupantes WHERE id = $1 RETURNING id`, [ocupanteId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo quitar al ocupante.' });
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
  const { evento_id, nombre_reservado, numero_transferencia } = req.body;
  if (!evento_id || !nombre_reservado || !numero_transferencia) {
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
    const precio = await pool.query(
      `SELECT monto FROM eventos_costos WHERE evento_id = $1 AND modulo_id = $2 AND concepto = 'Hotel'`,
      [evento_id, moduloId]
    );
    if (precio.rows.length === 0) {
      return res.status(400).json({ error: 'Este módulo todavía no tiene un precio de Hotel configurado — configúralo primero en Entradas de Efectivo.' });
    }
    const monto = precio.rows[0].monto;

    await pool.query(
      `INSERT INTO habitacion_reservas (habitacion_id, evento_id, nombre_reservado, numero_transferencia, monto)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (habitacion_id, evento_id) DO UPDATE SET
         nombre_reservado = EXCLUDED.nombre_reservado,
         numero_transferencia = EXCLUDED.numero_transferencia,
         monto = EXCLUDED.monto`,
      [id, evento_id, nombre_reservado, numero_transferencia, monto]
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
