const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');

// Este archivo es donde va a vivir todo lo financiero que sigue
// construyéndose (Control de Ingresos, Control de Egresos, Resumen
// Financiero) — empieza con el Catálogo de Cuentas.

// Admin: trae el catálogo completo, ya armado en árbol (padres con sus
// hijos anidados), para que el frontend no tenga que reconstruirlo.
router.get('/admin/catalogo-cuentas', requireAuth, requireModulo('catalogo_cuentas', 'consulta'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, nombre, tipo, cuenta_padre_id, origen, orden, clave_sistema FROM catalogo_cuentas ORDER BY codigo ASC`
    );
    const porId = {};
    rows.forEach((r) => { porId[r.id] = { ...r, hijos: [] }; });
    const raiz = [];
    rows.forEach((r) => {
      if (r.cuenta_padre_id && porId[r.cuenta_padre_id]) {
        porId[r.cuenta_padre_id].hijos.push(porId[r.id]);
      } else {
        raiz.push(porId[r.id]);
      }
    });
    res.json(raiz);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el catálogo de cuentas.' });
  }
});

// Admin: crea una cuenta nueva en el catálogo
router.post('/admin/catalogo-cuentas', requireAuth, requireModulo('catalogo_cuentas', 'edicion'), async (req, res) => {
  const { codigo, nombre, tipo, cuenta_padre_id, origen, orden } = req.body;
  if (!codigo || !nombre || !tipo || !origen) {
    return res.status(400).json({ error: 'Código, nombre, tipo y origen son obligatorios.' });
  }
  if (!['ingreso', 'egreso'].includes(tipo)) {
    return res.status(400).json({ error: 'El tipo debe ser "ingreso" o "egreso".' });
  }
  if (!['categoria', 'automatico', 'manual'].includes(origen)) {
    return res.status(400).json({ error: 'El origen debe ser "categoria", "automatico" o "manual".' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [codigo, nombre, tipo, cuenta_padre_id || null, origen, orden || 0]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese código.' });
    }
    res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

// Admin: edita una cuenta existente (código, nombre, tipo, origen, orden
// — y opcionalmente el padre, por si hace falta reacomodar el árbol)
router.put('/admin/catalogo-cuentas/:id', requireAuth, requireModulo('catalogo_cuentas', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const { codigo, nombre, tipo, cuenta_padre_id, origen, orden } = req.body;
  if (!codigo || !nombre || !tipo || !origen) {
    return res.status(400).json({ error: 'Código, nombre, tipo y origen son obligatorios.' });
  }
  if (String(cuenta_padre_id) === String(id)) {
    return res.status(400).json({ error: 'Una cuenta no puede ser su propio padre.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE catalogo_cuentas SET codigo = $1, nombre = $2, tipo = $3, cuenta_padre_id = $4, origen = $5, orden = $6
       WHERE id = $7 RETURNING id`,
      [codigo, nombre, tipo, cuenta_padre_id || null, origen, orden || 0, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese código.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar la cuenta.' });
  }
});

// Admin: elimina una cuenta — también elimina sus cuentas hijas y
// cualquier movimiento manual que tuviera registrado (ON DELETE CASCADE
// en la migración), así que se pide confirmación fuerte en el frontend.
router.delete('/admin/catalogo-cuentas/:id', requireAuth, requireModulo('catalogo_cuentas', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`DELETE FROM catalogo_cuentas WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar la cuenta.' });
  }
});

// Calcula el árbol completo (Ingresos O Egresos, según `tipo`) con los
// montos ya resueltos — función compartida, usada por los dos endpoints
// de abajo. Es 100% de LECTURA: todo lo que muestra viene de datos que
// ya se capturaron en otro lado (módulo de cobro, Habitaciones,
// Asistencia de Saelistas, o Entradas/Salidas de Efectivo) — este
// reporte no tiene ningún botón de editar, es solo el resultado.
async function calcularControlFinanciero(evento_id, tipo) {
  const catalogo = await pool.query(
    `SELECT id, codigo, nombre, tipo, cuenta_padre_id, origen, clave_sistema
     FROM catalogo_cuentas WHERE tipo = $1 ORDER BY codigo ASC`,
    [tipo]
  );

  // Los cálculos automáticos (boletos, servidores, espacios) solo
  // existen del lado de Ingresos — Egresos es 100% manual por ahora.
  let b = { cant_evento: 0, monto_evento: 0, cant_bancos: 0, monto_bancos: 0, cant_tarjeta: 0, monto_tarjeta: 0, cant_cortesia: 0 };
  let totalServidores = 0;
  let espacios = { rows: [] };

  if (tipo === 'ingreso') {
    // Tarjeta va aparte, en su propio bloque — ya no se mezcla con
    // Efectivo, porque ahora hay una cuenta real (4.1.5) dedicada a ella.
    // Cortesía se identifica porque su monto siempre queda en 0 (es la
    // única forma de llegar a 0 ahora que "Alimentación" ya no tiene
    // opción "No") — no tiene metodo_pago porque no se paga nada.
    const boletos = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE metodo_pago = 'efectivo') AS cant_evento,
         COALESCE(SUM(alimentacion_monto) FILTER (WHERE metodo_pago = 'efectivo'), 0) AS monto_evento,
         COUNT(*) FILTER (WHERE metodo_pago = 'transferencia') AS cant_bancos,
         COALESCE(SUM(alimentacion_monto) FILTER (WHERE metodo_pago = 'transferencia'), 0) AS monto_bancos,
         COUNT(*) FILTER (WHERE metodo_pago = 'tarjeta') AS cant_tarjeta,
         COALESCE(SUM(alimentacion_monto) FILTER (WHERE metodo_pago = 'tarjeta'), 0) AS monto_tarjeta,
         COUNT(*) FILTER (WHERE alimentacion_monto = 0) AS cant_cortesia
       FROM inscripciones
       WHERE evento_id = $1 AND alimentacion_monto IS NOT NULL AND registrado_presencial = true`,
      [evento_id]
    );
    b = boletos.rows[0];

    const servidores = await pool.query(
      `SELECT COUNT(*) AS cant FROM saelista_asistencias WHERE evento_id = $1 AND registrado_presencial = true`,
      [evento_id]
    );
    totalServidores = parseInt(servidores.rows[0].cant, 10);

    // "Hotel" combina dos fuentes: los ocupantes reales ya asignados
    // (habitacion_ocupantes), y los bloqueos con depósito ya capturado
    // (habitacion_reservas) — un apartado previo con transferencia
    // bancaria cuenta como ingreso desde que se bloquea, aunque la
    // persona todavía no exista como Participante. Los bloqueos siempre
    // caen en "Bancos" (transferencia), porque así es como se capturan.
    // OJO: si más adelante alguien bloqueado se asigna también como
    // ocupante real, ambos se sumarían — hay que desbloquear a mano
    // cuando eso pase, para no contar el mismo depósito dos veces.
    espacios = await pool.query(
      `WITH combinado AS (
         SELECT h.modulo_id, o.metodo_pago, o.monto
         FROM habitacion_ocupantes o
         JOIN habitaciones h ON h.id = o.habitacion_id
         WHERE o.evento_id = $1
         UNION ALL
         SELECT h.modulo_id, 'transferencia' AS metodo_pago, r.monto
         FROM habitacion_reservas r
         JOIN habitaciones h ON h.id = r.habitacion_id
         WHERE r.evento_id = $1 AND r.monto IS NOT NULL
       )
       SELECT m.id AS modulo_id, m.nombre AS modulo_nombre,
              COUNT(*) FILTER (WHERE c.metodo_pago IN ('efectivo','tarjeta')) AS cant_evento,
              COALESCE(SUM(c.monto) FILTER (WHERE c.metodo_pago IN ('efectivo','tarjeta')), 0) AS monto_evento,
              COUNT(*) FILTER (WHERE c.metodo_pago = 'transferencia') AS cant_bancos,
              COALESCE(SUM(c.monto) FILTER (WHERE c.metodo_pago = 'transferencia'), 0) AS monto_bancos
       FROM combinado c
       JOIN modulos m ON m.id = c.modulo_id
       GROUP BY m.id, m.nombre
       ORDER BY m.nombre ASC`,
      [evento_id]
    );
  }

  // Valores capturados a mano en Entradas/Salidas de Efectivo — esto
  // reemplaza por completo lo que antes venía de movimientos_financieros.
  const valores = await pool.query(`SELECT cuenta_id, monto FROM valores_cuenta WHERE evento_id = $1`, [evento_id]);
  const valorPorCuenta = {};
  valores.rows.forEach((v) => { valorPorCuenta[v.cuenta_id] = Number(v.monto); });

  const porId = {};
  catalogo.rows.forEach((c) => { porId[c.id] = { ...c, hijos: [], monto: 0 }; });

  let raiz = null;
  catalogo.rows.forEach((c) => {
    if (c.cuenta_padre_id && porId[c.cuenta_padre_id]) {
      porId[c.cuenta_padre_id].hijos.push(porId[c.id]);
    } else if (!c.cuenta_padre_id) {
      raiz = porId[c.id];
    }
  });

  const porClave = {};
  catalogo.rows.forEach((c) => { if (c.clave_sistema) porClave[c.clave_sistema] = porId[c.id]; });

  if (porClave.boletos_evento) {
    porClave.boletos_evento.cantidad = parseInt(b.cant_evento, 10);
    porClave.boletos_evento.monto = Number(b.monto_evento);
    porClave.boletos_evento.valor = valorPorCuenta[porClave.boletos_evento.id] ?? null;
  }
  if (porClave.boletos_bancos) {
    porClave.boletos_bancos.cantidad = parseInt(b.cant_bancos, 10);
    porClave.boletos_bancos.monto = Number(b.monto_bancos);
    porClave.boletos_bancos.valor = valorPorCuenta[porClave.boletos_bancos.id] ?? null;
  }
  if (porClave.boletos_tarjeta) {
    porClave.boletos_tarjeta.cantidad = parseInt(b.cant_tarjeta, 10);
    porClave.boletos_tarjeta.monto = Number(b.monto_tarjeta);
    porClave.boletos_tarjeta.valor = valorPorCuenta[porClave.boletos_tarjeta.id] ?? null;
  }
  if (porClave.cortesia) { porClave.cortesia.cantidad = parseInt(b.cant_cortesia, 10); porClave.cortesia.valor = 0; porClave.cortesia.monto = 0; }
  if (porClave.servidores) { porClave.servidores.cantidad = totalServidores; porClave.servidores.valor = 0; porClave.servidores.monto = 0; }

  if (porClave.aportaciones_espacios) {
    const hijosEspacios = [];
    espacios.rows.forEach((m) => {
      if (Number(m.cant_evento) > 0 || Number(m.monto_evento) > 0) {
        hijosEspacios.push({
          id: `modulo-${m.modulo_id}-evento`, origen: 'automatico',
          nombre: `Hotel en Evento - ${m.modulo_nombre}`,
          cantidad: parseInt(m.cant_evento, 10), monto: Number(m.monto_evento), hijos: [],
        });
      }
      if (Number(m.cant_bancos) > 0 || Number(m.monto_bancos) > 0) {
        hijosEspacios.push({
          id: `modulo-${m.modulo_id}-bancos`, origen: 'automatico',
          nombre: `Hotel en Bancos - ${m.modulo_nombre}`,
          cantidad: parseInt(m.cant_bancos, 10), monto: Number(m.monto_bancos), hijos: [],
        });
      }
    });
    porClave.aportaciones_espacios.hijos = hijosEspacios;
  }

  // Cualquier cuenta SIN clave_sistema (no es de las 4 calculadas) Y SIN
  // hijos propios en el catálogo = es una hoja manual → su monto sale
  // directo de lo que se haya guardado en Entradas/Salidas de Efectivo.
  catalogo.rows.forEach((c) => {
    const nodo = porId[c.id];
    if (!c.clave_sistema && nodo.hijos.length === 0) {
      nodo.monto = valorPorCuenta[c.id] || 0;
    }
  });

  function recalcular(nodo) {
    if (nodo.hijos && nodo.hijos.length > 0) {
      nodo.hijos.forEach(recalcular);
      nodo.monto = nodo.hijos.reduce((s, h) => s + (h.monto || 0), 0);
      // También se totaliza la Cantidad en las cuentas que agrupan
      // (categorías) — antes solo se sumaba el Monto.
      nodo.cantidad = nodo.hijos.reduce((s, h) => s + (Number(h.cantidad) || 0), 0);
    }
  }
  if (raiz) recalcular(raiz);

  return { raiz, total: raiz ? raiz.monto : 0 };
}

router.get('/admin/eventos/:evento_id/control-ingresos', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  try {
    const data = await calcularControlFinanciero(req.params.evento_id, 'ingreso');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo calcular el Control de Ingresos.' });
  }
});

router.get('/admin/eventos/:evento_id/control-egresos', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  try {
    const data = await calcularControlFinanciero(req.params.evento_id, 'egreso');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo calcular el Control de Egresos.' });
  }
});

// ============================================================
// VALORES POR CUENTA — "Entradas de Efectivo" / "Salidas de Efectivo".
// Un valor configurado por evento para CADA cuenta real del catálogo
// (no texto libre) — esto es lo que reemplaza el viejo "Costos del
// evento". El Hotel-por-módulo sigue aparte, sin tocar.
// ============================================================

// Admin: lista las cuentas de un tipo (ingreso|egreso), con su valor
// configurado para este evento si ya lo tiene (LEFT JOIN — si nunca se
// configuró, monto sale null, no 0, para distinguir "sin configurar" de
// "configurado en cero").
router.get('/admin/eventos/:evento_id/valores-cuenta', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  const { tipo } = req.query;
  if (!tipo || !['ingreso', 'egreso'].includes(tipo)) {
    return res.status(400).json({ error: 'Falta indicar el tipo ("ingreso" o "egreso").' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.id AS cuenta_id, c.codigo, c.nombre, c.origen, c.cuenta_padre_id, c.clave_sistema,
              v.monto, v.es_boleto
       FROM catalogo_cuentas c
       LEFT JOIN valores_cuenta v ON v.cuenta_id = c.id AND v.evento_id = $1
       WHERE c.tipo = $2
       ORDER BY c.codigo ASC`,
      [evento_id, tipo]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener los valores del catálogo.' });
  }
});

// Admin: crea o actualiza el valor de una cuenta para este evento (upsert)
router.put('/admin/eventos/:evento_id/valores-cuenta/:cuenta_id', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { evento_id, cuenta_id } = req.params;
  const { monto } = req.body;
  if (monto === undefined || monto === null || monto === '') {
    return res.status(400).json({ error: 'Falta el monto.' });
  }
  try {
    await pool.query(
      `INSERT INTO valores_cuenta (evento_id, cuenta_id, monto)
       VALUES ($1, $2, $3)
       ON CONFLICT (evento_id, cuenta_id) DO UPDATE SET monto = EXCLUDED.monto`,
      [evento_id, cuenta_id, monto]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el valor.' });
  }
});

// Admin: marca esta cuenta (debe ser tipo=ingreso) como la que alimenta
// "Inscripciones (Alimentación)" en el módulo de cobro — desmarca
// cualquier otra del mismo evento (solo una a la vez).
router.put('/admin/eventos/:evento_id/valores-cuenta/:cuenta_id/marcar-boleto', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { evento_id, cuenta_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Asegura que exista una fila de valor para poder marcarla (si el
    // admin le da "Usar en módulo de cobro" antes de haberle puesto un
    // monto, se crea con monto 0 para que la marca tenga dónde vivir).
    await client.query(
      `INSERT INTO valores_cuenta (evento_id, cuenta_id, monto)
       VALUES ($1, $2, 0)
       ON CONFLICT (evento_id, cuenta_id) DO NOTHING`,
      [evento_id, cuenta_id]
    );
    await client.query(`UPDATE valores_cuenta SET es_boleto = false WHERE evento_id = $1`, [evento_id]);
    await client.query(`UPDATE valores_cuenta SET es_boleto = true WHERE evento_id = $1 AND cuenta_id = $2`, [evento_id, cuenta_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'No se pudo marcar la cuenta.' });
  } finally {
    client.release();
  }
});

// Admin: quita el VALOR de una cuenta para este evento — NUNCA toca la
// cuenta del catálogo en sí, solo la fila de valores_cuenta. Esta es la
// única forma de "quitar" algo desde Entradas/Salidas de Efectivo — para
// borrar la cuenta de verdad hay que ir a Catálogo de Cuentas a propósito.
router.delete('/admin/eventos/:evento_id/valores-cuenta/:cuenta_id', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { evento_id, cuenta_id } = req.params;
  try {
    await pool.query(`DELETE FROM valores_cuenta WHERE evento_id = $1 AND cuenta_id = $2`, [evento_id, cuenta_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo quitar el valor.' });
  }
});

module.exports = router;
