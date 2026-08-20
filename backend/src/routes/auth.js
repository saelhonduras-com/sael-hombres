const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, nombre_completo, rol, activo FROM usuarios_admin WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (rows.length === 0 || !rows[0].activo) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    const usuario = rows[0];
    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, nombre_completo: usuario.nombre_completo, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, usuario: { id: usuario.id, nombre_completo: usuario.nombre_completo, rol: usuario.rol, email: usuario.email } });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

// Verifica si el token sigue siendo válido (para mantener sesión al recargar la página)
// Ahora también devuelve los permisos de módulo del usuario (solo aplica
// si su rol es 'admin') — el frontend los usa para mostrar/ocultar el
// menú según lo que realmente puede ver.
router.get('/auth/yo', requireAuth, async (req, res) => {
  let permisos = [];
  if (req.usuario.rol === 'admin') {
    try {
      const { rows } = await pool.query(
        `SELECT modulo, nivel FROM permisos_modulo WHERE usuario_id = $1`,
        [req.usuario.id]
      );
      permisos = rows;
    } catch (err) {
      // Si esto falla no tiene sentido tumbar la verificación de sesión
      // — el usuario simplemente no vería módulos hasta reintentar.
    }
  }
  res.json({ usuario: { ...req.usuario, permisos } });
});

module.exports = router;
