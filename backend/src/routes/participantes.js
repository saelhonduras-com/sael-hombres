const express = require('express');
const router = express.Router();
const pool = require('../db');

function validarDni(dni) {
  return /^\d{13}$/.test(dni);
}

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

module.exports = router;
