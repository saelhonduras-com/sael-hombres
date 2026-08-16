const express = require('express');
const router = express.Router();
const pool = require('../db');

// Chequeo simple: el servidor responde
router.get('/salud', (req, res) => {
  res.json({ estado: 'ok', servicio: 'SAEL API', hora: new Date().toISOString() });
});

// Chequeo completo: incluye verificación de conexión a la base de datos
router.get('/salud-completa', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', base_datos: 'conectada', hora: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ estado: 'error', base_datos: 'desconectada', detalle: err.message });
  }
});

module.exports = router;
