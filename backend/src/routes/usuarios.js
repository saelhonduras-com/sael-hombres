const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Roles fijos del sistema (deben coincidir con los que ya se usan en
// requireRole/requireModulo en el resto del backend).
const ROLES_VALIDOS = ['super_admin', 'admin', 'consulta', 'estandar', 'registro', 'cocina'];

// Módulos sobre los que se puede dar permiso configurable (solo aplica
// cuando rol = 'admin'). Estos nombres DEBEN ser exactamente los mismos
// que se usan en requireModulo('...') en cada archivo de rutas.
const MODULOS_VALIDOS = [
  { valor: 'eventos', etiqueta: 'Eventos' },
  { valor: 'participantes', etiqueta: 'Participantes' },
  { valor: 'diplomas', etiqueta: 'Diplomas' },
  { valor: 'saelistas', etiqueta: 'Saelistas' },
  { valor: 'habitaciones', etiqueta: 'Habitaciones' },
  { valor: 'catalogo_cuentas', etiqueta: 'Catálogo de Cuentas' },
  { valor: 'entradas_salidas', etiqueta: 'Entradas & Salidas / Control de Ingresos y Egresos' },
];

// Todas las rutas de este archivo son solo para super_admin.
router.use('/admin/usuarios', requireAuth, requireRole('super_admin'));

// Devuelve el catálogo de módulos disponibles (para armar los checkboxes
// en el frontend sin tener que duplicar la lista a mano).
router.get('/admin/usuarios/modulos-disponibles', (req, res) => {
  res.json(MODULOS_VALIDOS);
});

// Lista todos los usuarios admin, con sus permisos de módulo si son 'admin'.
router.get('/admin/usuarios', async (req, res) => {
  try {
    const { rows: usuarios } = await pool.query(
      `SELECT id, email, nombre_completo, rol, activo FROM usuarios_admin ORDER BY nombre_completo ASC`
    );
    const { rows: permisos } = await pool.query(
      `SELECT usuario_id, modulo, nivel FROM permisos_modulo`
    );
    const permisosPorUsuario = {};
    permisos.forEach((p) => {
      if (!permisosPorUsuario[p.usuario_id]) permisosPorUsuario[p.usuario_id] = [];
      permisosPorUsuario[p.usuario_id].push({ modulo: p.modulo, nivel: p.nivel });
    });
    const resultado = usuarios.map((u) => ({ ...u, permisos: permisosPorUsuario[u.id] || [] }));
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron cargar los usuarios.' });
  }
});

function validarPermisos(permisos) {
  if (!Array.isArray(permisos)) return 'Los permisos deben ser una lista.';
  const modulosValidos = MODULOS_VALIDOS.map((m) => m.valor);
  for (const p of permisos) {
    if (!modulosValidos.includes(p.modulo)) return `Módulo no reconocido: ${p.modulo}.`;
    if (!['consulta', 'edicion'].includes(p.nivel)) return `Nivel inválido para ${p.modulo}.`;
  }
  return null;
}

// Crea un usuario admin nuevo.
router.post('/admin/usuarios', async (req, res) => {
  const { nombre_completo, email, password, rol, permisos } = req.body;
  if (!nombre_completo || !email || !password || !rol) {
    return res.status(400).json({ error: 'Nombre, correo, contraseña y rol son obligatorios.' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: 'Rol no válido.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  const listaPermisos = rol === 'admin' ? (permisos || []) : [];
  const errorPermisos = validarPermisos(listaPermisos);
  if (errorPermisos) return res.status(400).json({ error: errorPermisos });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await cliente.query(
      `INSERT INTO usuarios_admin (email, password_hash, nombre_completo, rol, activo)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [email.toLowerCase().trim(), hash, nombre_completo, rol]
    );
    const usuarioId = rows[0].id;
    for (const p of listaPermisos) {
      await cliente.query(
        `INSERT INTO permisos_modulo (usuario_id, modulo, nivel) VALUES ($1, $2, $3)`,
        [usuarioId, p.modulo, p.nivel]
      );
    }
    await cliente.query('COMMIT');
    res.status(201).json({ id: usuarioId });
  } catch (err) {
    await cliente.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    }
    res.status(500).json({ error: 'No se pudo crear el usuario.' });
  } finally {
    cliente.release();
  }
});

// Edita un usuario existente (nombre, correo, rol, permisos, y
// opcionalmente la contraseña si se manda un valor nuevo).
router.put('/admin/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre_completo, email, rol, password, permisos } = req.body;
  if (!nombre_completo || !email || !rol) {
    return res.status(400).json({ error: 'Nombre, correo y rol son obligatorios.' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: 'Rol no válido.' });
  }
  if (password && password.length > 0 && password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  const listaPermisos = rol === 'admin' ? (permisos || []) : [];
  const errorPermisos = validarPermisos(listaPermisos);
  if (errorPermisos) return res.status(400).json({ error: errorPermisos });

  // No permitir que un super_admin se quite su propio rol (para no
  // quedarse fuera del panel de Usuarios sin nadie que lo regrese).
  if (String(req.usuario.id) === String(id) && rol !== 'super_admin') {
    return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de super_admin.' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Si va a dejar de ser super_admin, verificar que quede al menos otro activo.
    if (rol !== 'super_admin') {
      const { rows: otros } = await cliente.query(
        `SELECT COUNT(*) AS cant FROM usuarios_admin WHERE rol = 'super_admin' AND activo = true AND id != $1`,
        [id]
      );
      if (parseInt(otros[0].cant, 10) === 0) {
        await cliente.query('ROLLBACK');
        return res.status(400).json({ error: 'Debe quedar al menos un super_admin activo.' });
      }
    }

    let filas;
    if (password && password.length > 0) {
      const hash = await bcrypt.hash(password, 10);
      ({ rows: filas } = await cliente.query(
        `UPDATE usuarios_admin SET email=$1, nombre_completo=$2, rol=$3, password_hash=$4
         WHERE id=$5 RETURNING id`,
        [email.toLowerCase().trim(), nombre_completo, rol, hash, id]
      ));
    } else {
      ({ rows: filas } = await cliente.query(
        `UPDATE usuarios_admin SET email=$1, nombre_completo=$2, rol=$3
         WHERE id=$4 RETURNING id`,
        [email.toLowerCase().trim(), nombre_completo, rol, id]
      ));
    }
    if (filas.length === 0) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Reemplaza los permisos por completo (borra y vuelve a insertar) —
    // más simple y confiable que calcular diferencias.
    await cliente.query(`DELETE FROM permisos_modulo WHERE usuario_id = $1`, [id]);
    for (const p of listaPermisos) {
      await cliente.query(
        `INSERT INTO permisos_modulo (usuario_id, modulo, nivel) VALUES ($1, $2, $3)`,
        [id, p.modulo, p.nivel]
      );
    }

    await cliente.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await cliente.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  } finally {
    cliente.release();
  }
});

// Activa o desactiva un usuario (nunca se borra de verdad, para no
// perder la referencia histórica de quién hizo qué).
router.put('/admin/usuarios/:id/activo', async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'Falta indicar el nuevo estado (activo).' });
  }
  if (String(req.usuario.id) === String(id) && activo === false) {
    return res.status(400).json({ error: 'No puedes desactivarte a ti mismo.' });
  }
  try {
    if (activo === false) {
      const { rows: usuario } = await pool.query(`SELECT rol FROM usuarios_admin WHERE id = $1`, [id]);
      if (usuario.length > 0 && usuario[0].rol === 'super_admin') {
        const { rows: otros } = await pool.query(
          `SELECT COUNT(*) AS cant FROM usuarios_admin WHERE rol = 'super_admin' AND activo = true AND id != $1`,
          [id]
        );
        if (parseInt(otros[0].cant, 10) === 0) {
          return res.status(400).json({ error: 'Debe quedar al menos un super_admin activo.' });
        }
      }
    }
    const { rows } = await pool.query(
      `UPDATE usuarios_admin SET activo = $1 WHERE id = $2 RETURNING id`,
      [activo, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cambiar el estado del usuario.' });
  }
});

module.exports = router;
