const express = require('express');
const router = express.Router();
const pool = require('../db');

// Público: lista todos los eventos, más recientes primero
router.get('/eventos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, abierto, es_actual
       FROM eventos
       ORDER BY fecha_inicio DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron cargar los eventos.' });
  }
});

module.exports = router;
