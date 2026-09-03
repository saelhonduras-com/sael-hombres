const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo, requireRole } = require('../middleware/auth');

// Honduras es UTC-6 todo el año (no tiene horario de verano), así que un
// desplazamiento fijo es suficiente y no depende de la zona horaria del servidor.
function mesEnCursoHonduras() {
  const ahoraHN = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return { mes: ahoraHN.getUTCMonth() + 1, anio: ahoraHN.getUTCFullYear() };
}

// Público: lista todos los eventos, más recientes primero
router.get('/eventos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, hora_limite_registro, abierto, es_actual,
              boleto_inicio, boleto_siguiente
       FROM eventos
       ORDER BY fecha_inicio DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron cargar los eventos.' });
  }
});

// Admin: crea un evento nuevo
router.post('/admin/eventos', requireAuth, requireModulo('eventos', 'edicion'), async (req, res) => {
  const { nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, hora_limite_registro, abierto, es_actual } = req.body;
  if (!nombre || !anio || !mes || !fecha_inicio || !fecha_fin || !fecha_limite_registro) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (hora_limite_registro && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hora_limite_registro)) {
    return res.status(400).json({ error: 'La hora límite de registro debe tener formato HH:MM (24 horas).' });
  }
  // Regla: ningún evento puede estar abierto si no es el evento actual.
  if (abierto && !es_actual) {
    return res.status(400).json({ error: 'Un evento no puede estar abierto si no es el evento actual. Márcalo como actual, o déjalo cerrado.' });
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Bloqueo duro: mientras el mes en curso tenga su propio evento, ningún
    // otro evento puede volverse actual ni abrirse desde el panel — salvo
    // que sea Super Admin, quien puede saltarse esto a propósito para
    // correcciones administrativas.
    const { mes: mesHoy, anio: anioHoy } = mesEnCursoHonduras();
    const { rows: delMesRows } = await cliente.query(
      `SELECT id, nombre FROM eventos WHERE mes = $1 AND anio = $2`,
      [mesHoy, anioHoy]
    );
    const eventoDelMes = delMesRows[0];
    if (
      req.usuario.rol !== 'super_admin' &&
      eventoDelMes && (es_actual || abierto) && (Number(mes) !== mesHoy || Number(anio) !== anioHoy)
    ) {
      await cliente.query('ROLLBACK');
      return res.status(403).json({
        error: `No se puede crear un evento actual o abierto de otro mes mientras estemos en el mes de "${eventoDelMes.nombre}". Este bloqueo es intencional.`,
      });
    }

    if (es_actual) {
      // El que deja de ser actual también deja de estar abierto — nunca puede
      // quedar un evento abierto que no sea el actual.
      await cliente.query(`UPDATE eventos SET es_actual = false, abierto = false WHERE es_actual = true`);
    }
    const { rows } = await cliente.query(
      `INSERT INTO eventos (nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, hora_limite_registro, abierto, es_actual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, hora_limite_registro || '23:59', !!abierto, !!es_actual]
    );
    await cliente.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await cliente.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo crear el evento.' });
  } finally {
    cliente.release();
  }
});

// Admin: edita un evento existente
router.put('/admin/eventos/:id', requireAuth, requireModulo('eventos', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, hora_limite_registro, abierto, es_actual } = req.body;
  if (hora_limite_registro && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hora_limite_registro)) {
    return res.status(400).json({ error: 'La hora límite de registro debe tener formato HH:MM (24 horas).' });
  }
  // Regla: ningún evento puede estar abierto si no es el evento actual.
  if (abierto && !es_actual) {
    return res.status(400).json({ error: 'Un evento no puede estar abierto si no es el evento actual. Márcalo como actual, o déjalo cerrado.' });
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Mismo bloqueo duro que en la creación, más el caso extra de querer
    // quitarle "actual" al evento del mes en curso sin poner otro en su
    // lugar — salvo que sea Super Admin, que puede saltárselo.
    const { mes: mesHoy, anio: anioHoy } = mesEnCursoHonduras();
    const { rows: delMesRows } = await cliente.query(
      `SELECT id, nombre, es_actual FROM eventos WHERE mes = $1 AND anio = $2`,
      [mesHoy, anioHoy]
    );
    const eventoDelMes = delMesRows[0];
    if (eventoDelMes && req.usuario.rol !== 'super_admin') {
      const esElDelMes = Number(eventoDelMes.id) === Number(id);
      const intentaCambiarloAOtro = !esElDelMes && (es_actual || abierto);
      const intentaQuitarleActual = esElDelMes && eventoDelMes.es_actual && !es_actual;
      if (intentaCambiarloAOtro || intentaQuitarleActual) {
        await cliente.query('ROLLBACK');
        return res.status(403).json({
          error: `No se puede cambiar el evento actual ni su registro mientras estemos en el mes de "${eventoDelMes.nombre}". Este bloqueo es intencional.`,
        });
      }
    }

    if (es_actual) {
      // El que deja de ser actual también deja de estar abierto — nunca puede
      // quedar un evento abierto que no sea el actual.
      await cliente.query(`UPDATE eventos SET es_actual = false, abierto = false WHERE es_actual = true AND id != $1`, [id]);
    }
    const { rows } = await cliente.query(
      `UPDATE eventos SET nombre=$1, anio=$2, mes=$3, fecha_inicio=$4, fecha_fin=$5,
       fecha_limite_registro=$6, hora_limite_registro=$7, abierto=$8, es_actual=$9 WHERE id=$10 RETURNING *`,
      [nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, hora_limite_registro || '23:59', !!abierto, !!es_actual, id]
    );
    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    await cliente.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await cliente.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo actualizar el evento.' });
  } finally {
    cliente.release();
  }
});

// Admin: "Finalizar evento" — cierra el registro y le quita "actual",
// sin que otro evento lo reemplace todavía (eso se hace aparte, al
// crear/marcar el siguiente). Se salta a propósito el bloqueo de "mes en
// curso" que tienen las demás rutas — finalizar ANTES de que termine el
// mes calendario es justo el propósito de este botón, no un error a
// prevenir. Reversible: se puede volver a marcar como actual/abierto
// manualmente desde Eventos si fue un error.
router.put('/admin/eventos/:id/finalizar', requireAuth, requireModulo('eventos', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE eventos SET es_actual = false, abierto = false WHERE id = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo finalizar el evento.' });
  }
});

// Admin: elimina un evento — SOLO Super Admin (decisión intencional:
// borrar un evento arrastra en cascada TODAS sus inscripciones, cobros,
// asignaciones de habitación y financiero — no es una acción de admin
// regular, sin importar el permiso que tenga configurado en Usuarios).
// El bloqueo de "mes en curso" NO aplica aquí a propósito — confirmado
// con Carlos que el SA puede eliminar incluso el evento en vivo si hace
// falta. Ya que solo el SA llega a esta ruta, no hace falta ninguna
// verificación extra de rol para la excepción.
router.delete('/admin/eventos/:id', requireAuth, requireRole('super_admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`SELECT nombre FROM eventos WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    await pool.query(`DELETE FROM eventos WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar el evento.' });
  }
});

module.exports = router;
