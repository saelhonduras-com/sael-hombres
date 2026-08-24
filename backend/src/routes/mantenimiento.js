const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Todo este módulo es exclusivo de Super Admin — sin excepción, ni
// siquiera para "admin" con permisos de edición en otros módulos. Se
// aplica una sola vez aquí arriba, para todas las rutas de este archivo.
router.use(requireAuth, requireRole('super_admin'));

// Lista todo lo que hay en la Papelera, más reciente primero.
router.get('/admin/papelera', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM papelera ORDER BY eliminado_en DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar la Papelera.' });
  }
});

// Restaura un elemento — el comportamiento exacto depende de tabla_origen.
// Fase 1: solo sabe restaurar Participantes. Cuando conectemos Eventos,
// Habitaciones, etc. en fases futuras, cada uno se agrega aquí como un
// nuevo "case".
router.post('/admin/papelera/:id/restaurar', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM papelera WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ese elemento ya no está en la Papelera.' });
    }
    const item = rows[0];

    if (item.tabla_origen === 'participantes') {
      const resultado = await pool.query(
        `UPDATE participantes SET oculto = false WHERE id = $1 RETURNING id`,
        [item.datos.id]
      );
      if (resultado.rows.length === 0) {
        return res.status(400).json({ error: 'Ese participante ya no existe — no se puede restaurar.' });
      }
    } else {
      return res.status(400).json({ error: `Restaurar "${item.tabla_origen}" todavía no está soportado — llega en una fase futura.` });
    }

    await pool.query(`DELETE FROM papelera WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo restaurar.' });
  }
});

// Elimina definitivamente — esta sí ya no se puede deshacer.
router.delete('/admin/papelera/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM papelera WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ese elemento ya no está en la Papelera.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar definitivamente.' });
  }
});

module.exports = router;
