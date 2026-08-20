const jwt = require('jsonwebtoken');
const pool = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

// Permite pasar si el usuario tiene alguno de los roles indicados
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    next();
  };
}

// Para módulos con permisos configurables por usuario "admin".
// super_admin siempre pasa. admin necesita una fila en permisos_modulo con
// el nivel requerido ('edicion' incluye 'consulta').
function requireModulo(modulo, nivelMinimo = 'consulta') {
  return async (req, res, next) => {
    if (req.usuario.rol === 'super_admin') return next();
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    try {
      const { rows } = await pool.query(
        `SELECT nivel FROM permisos_modulo WHERE usuario_id = $1 AND modulo = $2`,
        [req.usuario.id, modulo]
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: 'No tienes acceso a este módulo.' });
      }
      const nivel = rows[0].nivel;
      if (nivelMinimo === 'edicion' && nivel !== 'edicion') {
        return res.status(403).json({ error: 'Solo tienes acceso de consulta a este módulo.' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'No se pudo verificar el permiso.' });
    }
  };
}

module.exports = { requireAuth, requireRole, requireModulo };
