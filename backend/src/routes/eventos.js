const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');

// Público: lista todos los eventos, más recientes primero
router.get('/eventos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, abierto, es_actual,
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
  const { nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, abierto, es_actual } = req.body;
  if (!nombre || !anio || !mes || !fecha_inicio || !fecha_fin || !fecha_limite_registro) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    if (es_actual) {
      await cliente.query(`UPDATE eventos SET es_actual = false WHERE es_actual = true`);
    }
    const { rows } = await cliente.query(
      `INSERT INTO eventos (nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, abierto, es_actual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, !!abierto, !!es_actual]
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
  const { nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, abierto, es_actual } = req.body;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    if (es_actual) {
      await cliente.query(`UPDATE eventos SET es_actual = false WHERE es_actual = true AND id != $1`, [id]);
    }
    const { rows } = await cliente.query(
      `UPDATE eventos SET nombre=$1, anio=$2, mes=$3, fecha_inicio=$4, fecha_fin=$5,
       fecha_limite_registro=$6, abierto=$7, es_actual=$8 WHERE id=$9 RETURNING *`,
      [nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, !!abierto, !!es_actual, id]
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

// Admin: elimina un evento
router.delete('/admin/eventos/:id', requireAuth, requireModulo('eventos', 'edicion'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM eventos WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar el evento.' });
  }
});

module.exports = router;
