const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

// Este archivo es donde va a vivir todo lo financiero que sigue
// construyéndose (Control de Ingresos, Control de Egresos, Resumen
// Financiero) — empieza con el Catálogo de Cuentas.

// Admin: trae el catálogo completo, ya armado en árbol (padres con sus
// hijos anidados), para que el frontend no tenga que reconstruirlo.
router.get('/admin/catalogo-cuentas', requireAuth, requireModulo('catalogo_cuentas', 'consulta'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, nombre, tipo, cuenta_padre_id, origen, orden, clave_sistema, tipo_calculo FROM catalogo_cuentas ORDER BY codigo ASC`
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
    `SELECT id, codigo, nombre, tipo, cuenta_padre_id, origen, clave_sistema, tipo_calculo
     FROM catalogo_cuentas WHERE tipo = $1 ORDER BY codigo ASC`,
    [tipo]
  );

  // Los cálculos automáticos (boletos, servidores, espacios) solo
  // existen del lado de Ingresos. Del lado de Egresos, las comidas del
  // evento y de Vigilia Saelistas (tipo_calculo) también se calculan
  // solas — el resto de Egresos sigue siendo 100% manual.
  let b = { cant_evento: 0, monto_evento: 0, cant_bancos: 0, monto_bancos: 0, cant_tarjeta: 0, monto_tarjeta: 0, cant_cortesia: 0 };
  let totalServidores = 0;
  let hotelPorCuenta = {}; // { [cuenta_id]: { cant, monto } } — acumulado directo sobre cuentas reales del Catálogo
  let precioPorCuentaHotel = {}; // { [cuenta_id]: precio por persona configurado en Entradas & Salidas }
  let totalEventoHeadcount = 0;
  let totalVigiliaHeadcount = 0;
  let precioPorCuenta = {};

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
    //
    // Cada módulo tiene, configurada a mano en "Aquí se controla el
    // ingreso por persona de las habitaciones", una cuenta real del
    // Catálogo para Efectivo y otra para Bancos (cuenta_efectivo_id /
    // cuenta_bancos_id en eventos_costos) — el dinero de ese módulo se
    // suma DIRECTO a esas cuentas reales, con su código y su nombre tal
    // cual los tengas en el Catálogo. Nada de nombres inventados ni de
    // adivinar por el precio: si un módulo no tiene cuenta asociada,
    // simplemente no cuenta hasta que la asocies.
    const costosModulo = await pool.query(
      `SELECT modulo_id, monto, cuenta_efectivo_id, cuenta_bancos_id FROM eventos_costos WHERE evento_id = $1 AND concepto = 'Hotel'`,
      [evento_id]
    );
    const cuentasPorModulo = {};
    costosModulo.rows.forEach((c) => {
      cuentasPorModulo[c.modulo_id] = { efectivo: c.cuenta_efectivo_id, bancos: c.cuenta_bancos_id };
      if (c.cuenta_efectivo_id) precioPorCuentaHotel[c.cuenta_efectivo_id] = Number(c.monto);
      if (c.cuenta_bancos_id) precioPorCuentaHotel[c.cuenta_bancos_id] = Number(c.monto);
    });

    const combinadoHotel = await pool.query(
      `SELECT h.modulo_id, o.metodo_pago, o.monto
       FROM habitacion_ocupantes o
       JOIN habitaciones h ON h.id = o.habitacion_id
       WHERE o.evento_id = $1
       UNION ALL
       SELECT h.modulo_id, 'transferencia' AS metodo_pago, r.monto
       FROM habitacion_reservas r
       JOIN habitaciones h ON h.id = r.habitacion_id
       WHERE r.evento_id = $1 AND r.monto IS NOT NULL AND r.es_reserva_seguridad = false`,
      [evento_id]
    );
    // hotelPorCuenta = { [cuenta_id]: { cant, monto } } — se acumula
    // directo sobre la cuenta real asociada, no sobre un renglón inventado.
    combinadoHotel.rows.forEach((r) => {
      const asociadas = cuentasPorModulo[r.modulo_id];
      if (!asociadas) return; // módulo sin ninguna cuenta configurada todavía
      const grupo = r.metodo_pago === 'transferencia' ? 'bancos' : 'efectivo';
      const cuentaId = asociadas[grupo];
      if (!cuentaId) return; // ese método de pago específico no tiene cuenta asociada
      if (!hotelPorCuenta[cuentaId]) hotelPorCuenta[cuentaId] = { cant: 0, monto: 0 };
      hotelPorCuenta[cuentaId].cant += 1;
      hotelPorCuenta[cuentaId].monto += Number(r.monto || 0);
    });
  }

  if (tipo === 'egreso') {
    // Headcount para las comidas: "evento" = participantes registrados +
    // Saelistas con asistencia (todos comen esas 5 comidas). "vigilia" =
    // solo Saelistas con asistencia (comidas de jueves/viernes antes del
    // evento, que no come nadie más).
    const participantesReg = await pool.query(
      `SELECT COUNT(*) AS cant FROM inscripciones WHERE evento_id = $1 AND registrado_presencial = true`,
      [evento_id]
    );
    const saelistasAsist = await pool.query(
      `SELECT COUNT(*) AS cant FROM saelista_asistencias WHERE evento_id = $1 AND registrado_presencial = true`,
      [evento_id]
    );
    const cantSaelistas = parseInt(saelistasAsist.rows[0].cant, 10);
    totalEventoHeadcount = parseInt(participantesReg.rows[0].cant, 10) + cantSaelistas;
    totalVigiliaHeadcount = cantSaelistas;

    const precios = await pool.query(`SELECT cuenta_id, precio FROM precios_cuenta WHERE evento_id = $1`, [evento_id]);
    precios.rows.forEach((p) => { precioPorCuenta[p.cuenta_id] = Number(p.precio); });
  }

  // Valores capturados a mano en Entradas/Salidas de Efectivo — esto
  // reemplaza por completo lo que antes venía de movimientos_financieros.
  const valores = await pool.query(`SELECT cuenta_id, cantidad, valor, monto FROM valores_cuenta WHERE evento_id = $1`, [evento_id]);
  const valorPorCuenta = {};
  const cantidadCapturadaPorCuenta = {};
  const unitarioCapturadoPorCuenta = {};
  valores.rows.forEach((v) => {
    valorPorCuenta[v.cuenta_id] = Number(v.monto);
    cantidadCapturadaPorCuenta[v.cuenta_id] = Number(v.cantidad);
    unitarioCapturadoPorCuenta[v.cuenta_id] = Number(v.valor);
  });

  const porId = {};
  catalogo.rows.forEach((c) => { porId[c.id] = { ...c, hijos: [], monto: 0, cantidad: 0, valor: 0 }; });

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
    porClave.boletos_evento.valor = valorPorCuenta[porClave.boletos_evento.id] ?? 0;
  }
  if (porClave.boletos_bancos) {
    porClave.boletos_bancos.cantidad = parseInt(b.cant_bancos, 10);
    porClave.boletos_bancos.monto = Number(b.monto_bancos);
    porClave.boletos_bancos.valor = valorPorCuenta[porClave.boletos_bancos.id] ?? 0;
  }
  if (porClave.boletos_tarjeta) {
    porClave.boletos_tarjeta.cantidad = parseInt(b.cant_tarjeta, 10);
    porClave.boletos_tarjeta.monto = Number(b.monto_tarjeta);
    porClave.boletos_tarjeta.valor = valorPorCuenta[porClave.boletos_tarjeta.id] ?? 0;
  }
  if (porClave.cortesia) { porClave.cortesia.cantidad = parseInt(b.cant_cortesia, 10); porClave.cortesia.valor = 0; porClave.cortesia.monto = 0; }
  if (porClave.servidores) { porClave.servidores.cantidad = totalServidores; porClave.servidores.valor = 0; porClave.servidores.monto = 0; }

  // Cualquier cuenta SIN clave_sistema (no es de las 4 calculadas) Y SIN
  // hijos propios en el catálogo = es una hoja manual → su monto sale
  // directo de lo que se haya guardado en Entradas/Salidas de Efectivo.
  catalogo.rows.forEach((c) => {
    const nodo = porId[c.id];
    if (!c.clave_sistema && nodo.hijos.length === 0 && !c.tipo_calculo) {
      nodo.monto = valorPorCuenta[c.id] || 0;
      nodo.cantidad = cantidadCapturadaPorCuenta[c.id] ?? 0;
      nodo.valor = unitarioCapturadoPorCuenta[c.id] ?? 0;
    }
  });

  // Hotel: se suma directo sobre la cuenta REAL del Catálogo que hayas
  // asociado a cada módulo en Entradas & Salidas — corre después del
  // bloque de arriba a propósito, para que estas cuentas sí reflejen lo
  // calculado en vez de quedarse en 0 (que es lo que diría "Entradas de
  // Efectivo" para ellas, porque ahí ya nadie escribe nada a mano).
  Object.keys(hotelPorCuenta).forEach((cuentaId) => {
    const nodo = porId[cuentaId];
    if (!nodo) return; // por si la cuenta asociada se hubiera borrado del Catálogo
    nodo.cantidad = hotelPorCuenta[cuentaId].cant;
    nodo.monto = hotelPorCuenta[cuentaId].monto;
    nodo.valor = precioPorCuentaHotel[cuentaId] ?? 0; // precio por persona configurado en Entradas & Salidas
    nodo._esAutomatico = true; // no se debe podar aunque su origen diga "manual"
  });

  // Comidas del evento y de Vigilia Saelistas: precio configurado ×
  // cantidad de gente asistiendo — se recalculan solas cada vez que
  // alguien se marca/desmarca como Registrado o se le marca asistencia
  // como Saelista. Lo que hubiera guardado en valores_cuenta para estas
  // cuentas (de antes de tener este mecanismo) ya no se usa.
  catalogo.rows.forEach((c) => {
    if (c.tipo_calculo !== 'comida_evento' && c.tipo_calculo !== 'comida_vigilia') return;
    const nodo = porId[c.id];
    const cantidad = c.tipo_calculo === 'comida_vigilia' ? totalVigiliaHeadcount : totalEventoHeadcount;
    const precio = precioPorCuenta[c.id] || 0;
    nodo.cantidad = cantidad;
    nodo.valor = precio;
    nodo.monto = cantidad * precio;
  });

  // ISV de Alimentación: 15% sobre la suma de las 5 comidas del evento
  // ÚNICAMENTE (no aplica sobre Vigilia Saelistas). Sigue el mismo
  // patrón que las demás filas (Cantidad × Valor = Monto): Cantidad es
  // la misma gente que las 5 comidas, Valor es el 15% de la suma de los
  // 5 precios unitarios. No tiene precio que configurar — sale solo.
  const TASA_ISV_ALIMENTACION = 0.15;
  let sumaValoresComidaEvento = 0;
  catalogo.rows.forEach((c) => {
    if (c.tipo_calculo === 'comida_evento') sumaValoresComidaEvento += porId[c.id].valor;
  });
  catalogo.rows.forEach((c) => {
    if (c.tipo_calculo !== 'isv_alimentacion_evento') return;
    const nodo = porId[c.id];
    const valorIsv = Math.round(sumaValoresComidaEvento * TASA_ISV_ALIMENTACION * 100) / 100;
    nodo.cantidad = totalEventoHeadcount;
    nodo.valor = valorIsv;
    nodo.monto = totalEventoHeadcount * valorIsv;
  });

  // Poda: las cuentas manuales puras (sin clave_sistema, sin
  // tipo_calculo) que nunca se capturaron en Entradas/Salidas de
  // Efectivo para ESTE evento desaparecen del reporte por completo (ni
  // siquiera en 0) — para no ensuciarlo con cuentas que nadie ha
  // tocado todavía. Las automáticas (Boletos, Servidores, Hotel,
  // Comida, ISV) siempre se muestran, aunque estén en 0 — esas sí son
  // información real y en vivo del evento. Si una categoría se queda
  // sin ninguna hija visible después de podar, la categoría también
  // desaparece (no tiene sentido un encabezado vacío).
  function debePodarse(nodo) {
    if (nodo.hijos && nodo.hijos.length > 0) {
      nodo.hijos = nodo.hijos.filter((h) => !debePodarse(h));
      return nodo.hijos.length === 0;
    }
    if (nodo._esAutomatico) return false; // Hotel ya calculado — siempre se muestra, aunque su origen diga "manual"
    const esManualPura = !nodo.clave_sistema && !nodo.tipo_calculo && nodo.origen === 'manual';
    return esManualPura && !(nodo.id in valorPorCuenta);
  }
  if (raiz && debePodarse(raiz)) raiz = null;

  function recalcular(nodo) {
    if (nodo.hijos && nodo.hijos.length > 0) {
      nodo.hijos.forEach(recalcular);
      nodo.monto = nodo.hijos.reduce((s, h) => s + (h.monto || 0), 0);
      // También se totaliza la Cantidad y el Valor en las cuentas que
      // agrupan (categorías) — antes solo se sumaba el Monto.
      nodo.cantidad = nodo.hijos.reduce((s, h) => s + (Number(h.cantidad) || 0), 0);
      nodo.valor = nodo.hijos.reduce((s, h) => s + (Number(h.valor) || 0), 0);
    }
  }
  if (raiz) recalcular(raiz);

  return { raiz, total: raiz ? raiz.monto : 0 };
}

router.get('/admin/eventos/:evento_id/control-ingresos', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  // Sin caché: estos números cambian en vivo (asignaciones, pagos, etc.) —
  // nunca debe reutilizarse una respuesta vieja del navegador (304).
  res.set('Cache-Control', 'no-store');
  try {
    const data = await calcularControlFinanciero(req.params.evento_id, 'ingreso');
    res.json(data);
  } catch (err) {
    console.error('Error en GET /admin/eventos/:evento_id/control-ingresos:', err);
    res.status(500).json({ error: 'No se pudo calcular el Control de Ingresos.' });
  }
});

router.get('/admin/eventos/:evento_id/control-egresos', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const data = await calcularControlFinanciero(req.params.evento_id, 'egreso');
    res.json(data);
  } catch (err) {
    console.error('Error en GET /admin/eventos/:evento_id/control-egresos:', err);
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
              v.cantidad, v.valor, v.monto, v.es_boleto
       FROM catalogo_cuentas c
       LEFT JOIN valores_cuenta v ON v.cuenta_id = c.id AND v.evento_id = $1
       WHERE c.tipo = $2 AND c.tipo_calculo IS NULL
       ORDER BY c.codigo ASC`,
      [evento_id, tipo]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener los valores del catálogo.' });
  }
});

// Admin: crea o actualiza cantidad + valor de una cuenta para este
// evento (upsert). El monto SIEMPRE se calcula aquí (cantidad × valor)
// — nunca se recibe directo del cliente, para que no se puedan
// desalinear entre sí.
router.put('/admin/eventos/:evento_id/valores-cuenta/:cuenta_id', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { evento_id, cuenta_id } = req.params;
  const { cantidad, valor } = req.body;
  if (cantidad === undefined || cantidad === null || cantidad === '' || valor === undefined || valor === null || valor === '') {
    return res.status(400).json({ error: 'Falta la cantidad o el valor.' });
  }
  const monto = Number(cantidad) * Number(valor);
  try {
    await pool.query(
      `INSERT INTO valores_cuenta (evento_id, cuenta_id, cantidad, valor, monto)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (evento_id, cuenta_id) DO UPDATE SET cantidad = EXCLUDED.cantidad, valor = EXCLUDED.valor, monto = EXCLUDED.monto`,
      [evento_id, cuenta_id, cantidad, valor, monto]
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

// ============================================================
// PRECIOS DE CUENTAS CON CÁLCULO AUTOMÁTICO (comida_evento /
// comida_vigilia) — el precio se configura por evento, igual que el
// costo de Hotel por módulo, pero por cuenta en vez de por módulo. La
// cantidad y el monto NUNCA se escriben a mano — salen solos del
// headcount real (ver calcularControlFinanciero arriba).
// ============================================================

// Admin: lista las cuentas con tipo_calculo (comida_evento/vigilia) y su
// precio configurado para este evento (0 si nunca se configuró).
router.get('/admin/eventos/:evento_id/precios-cuenta', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT c.id AS cuenta_id, c.codigo, c.nombre, c.tipo_calculo,
              COALESCE(p.precio, 0) AS precio
       FROM catalogo_cuentas c
       LEFT JOIN precios_cuenta p ON p.cuenta_id = c.id AND p.evento_id = $1
       WHERE c.tipo_calculo IN ('comida_evento', 'comida_vigilia')
       ORDER BY c.codigo ASC`,
      [evento_id]
    );
    const participantesReg = await pool.query(
      `SELECT COUNT(*) AS cant FROM inscripciones WHERE evento_id = $1 AND registrado_presencial = true`,
      [evento_id]
    );
    const saelistasAsist = await pool.query(
      `SELECT COUNT(*) AS cant FROM saelista_asistencias WHERE evento_id = $1 AND registrado_presencial = true`,
      [evento_id]
    );
    const cantSaelistas = parseInt(saelistasAsist.rows[0].cant, 10);
    const cantEvento = parseInt(participantesReg.rows[0].cant, 10) + cantSaelistas;
    const conCantidad = rows.map((r) => {
      const cantidad = r.tipo_calculo === 'comida_vigilia' ? cantSaelistas : cantEvento;
      return { ...r, cantidad, monto: cantidad * Number(r.precio) };
    });
    res.json(conCantidad);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron cargar los precios.' });
  }
});

// Admin: crea o actualiza el precio unitario de una cuenta para este evento
router.put('/admin/eventos/:evento_id/precios-cuenta/:cuenta_id', requireAuth, requireModulo('entradas_salidas', 'edicion'), async (req, res) => {
  const { evento_id, cuenta_id } = req.params;
  const { precio } = req.body;
  if (precio === undefined || precio === null || precio === '') {
    return res.status(400).json({ error: 'Falta el precio.' });
  }
  try {
    await pool.query(
      `INSERT INTO precios_cuenta (evento_id, cuenta_id, precio)
       VALUES ($1, $2, $3)
       ON CONFLICT (evento_id, cuenta_id) DO UPDATE SET precio = EXCLUDED.precio`,
      [evento_id, cuenta_id, precio]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el precio.' });
  }
});

// ============================================================
// EXPORTAR (Excel / PDF) — Control de Ingresos & Egresos completo:
// Ingresos + Egresos + Total Global, en un solo archivo cada vez.
// ============================================================

function formatoL(n) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Aplana el árbol (para Excel y PDF, que no pueden anidar como la tabla web)
function aplanarArbol(nodo, nivel, filas) {
  if (!nodo) return filas;
  filas.push({
    codigo: nodo.codigo || '',
    nombre: nodo.nombre,
    nivel,
    cantidad: nodo.cantidad,
    valor: nodo.valor,
    monto: nodo.monto,
    esCategoria: nodo.origen === 'categoria',
    // Negrita real: cualquier cuenta con hijos es un "padre", sin importar
    // su origen ni su nivel de profundidad — antes solo se ponía en negrita
    // por ser "categoria", dejando fuera a padres reales con otro origen.
    esPadre: !!(nodo.hijos && nodo.hijos.length > 0) || nivel === 0,
  });
  if (nodo.hijos) nodo.hijos.forEach((h) => aplanarArbol(h, nivel + 1, filas));
  return filas;
}

async function obtenerReporteCompleto(evento_id) {
  const evento = await pool.query(`SELECT nombre, anio FROM eventos WHERE id = $1`, [evento_id]);
  const ingresos = await calcularControlFinanciero(evento_id, 'ingreso');
  const egresos = await calcularControlFinanciero(evento_id, 'egreso');
  const totalGlobal = (ingresos.total || 0) - (egresos.total || 0);
  return { nombreEvento: evento.rows[0]?.nombre || '', anioEvento: evento.rows[0]?.anio || '', ingresos, egresos, totalGlobal };
}

router.get('/admin/eventos/:evento_id/control-financiero/excel', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  try {
    const { nombreEvento, anioEvento, ingresos, egresos, totalGlobal } = await obtenerReporteCompleto(evento_id);

    const filas = [
      ['Control de Ingresos & Egresos', `${nombreEvento} ${anioEvento}`],
      [],
      ['Total Ingresos', ingresos.total],
      ['Total Egresos', egresos.total],
      ['Total Global', totalGlobal],
      [],
      ['INGRESOS'],
      ['Código', 'Concepto', 'Cantidad', 'Valor', 'Monto'],
    ];
    aplanarArbol(ingresos.raiz, 0, []).forEach((f) => {
      filas.push([f.codigo, '  '.repeat(f.nivel) + f.nombre, f.cantidad ?? '', f.valor ?? '', f.monto]);
    });
    filas.push([], ['EGRESOS'], ['Código', 'Concepto', 'Cantidad', 'Valor', 'Monto']);
    aplanarArbol(egresos.raiz, 0, []).forEach((f) => {
      filas.push([f.codigo, '  '.repeat(f.nivel) + f.nombre, f.cantidad ?? '', f.valor ?? '', f.monto]);
    });

    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja['!cols'] = [{ wch: 10 }, { wch: 45 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Control Financiero');
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="control-ingresos-egresos-${evento_id}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el Excel.' });
  }
});

router.get('/admin/eventos/:evento_id/control-financiero/pdf', requireAuth, requireModulo('entradas_salidas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  const NAVY = '#1F3464';
  const GOLD = '#FDC41F';
  const EMBER = '#E40521';
  const GREEN = '#007334';
  try {
    const { nombreEvento, anioEvento, ingresos, egresos, totalGlobal } = await obtenerReporteCompleto(evento_id);

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="control-ingresos-egresos-${evento_id}.pdf"`);
    doc.pipe(res);

    const rutaLogo = require('path').join(__dirname, '..', 'assets', 'logo-fihnec-emblema.png');

    function encabezado() {
      doc.rect(0, 0, doc.page.width, 66).fill(NAVY);
      const altoLogo = 40;
      const anchoLogo = altoLogo * (923 / 787); // misma proporción real que usa Diplomas — el archivo no es cuadrado
      const radio = Math.max(altoLogo, anchoLogo) / 2 + 4;
      const centroX = 40 + radio;
      const centroY = 33;
      let xTexto = 40;
      try {
        // Círculo blanco de respaldo para que el logo tenga buen contraste
        // sobre el fondo navy, sea cual sea su combinación de colores.
        doc.circle(centroX, centroY, radio).fill('#ffffff');
        doc.image(rutaLogo, centroX - anchoLogo / 2, centroY - altoLogo / 2, { height: altoLogo });
        xTexto = centroX + radio + 14;
      } catch (e) {
        // Si el logo no está presente por alguna razón, seguimos sin tumbar el PDF.
      }
      doc.fillColor('#ffffff').fontSize(16).text('Control de Ingresos & Egresos', xTexto, 18);
      doc.fontSize(10).fillColor(GOLD).text(`${nombreEvento} ${anioEvento}`, xTexto, 40);
    }

    // Pie de página, fijo cerca del borde inferior sin importar cuánto
    // contenido haya arriba — se llama en cada página, incluida la última.
    // Se desactiva el margen inferior momentáneamente: PDFKit crea una
    // página nueva sola si detecta texto más allá del margen configurado,
    // aunque se le dé una coordenada Y explícita.
    function pie() {
      const margenInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#8a8a8a')
        .text('C.N.C. FIHNEC · Siguatepeque, Honduras C.A.', 0, doc.page.height - 30, { width: doc.page.width, align: 'center' });
      doc.page.margins.bottom = margenInferior;
    }

    encabezado();

    let y = 86;
    doc.rect(40, y, 155, 42).fill('#EAF3DE');
    doc.fillColor(GREEN).fontSize(9).text('Total Ingresos', 48, y + 7);
    doc.fontSize(13).text(formatoL(ingresos.total), 48, y + 21);

    doc.rect(205, y, 155, 42).fill('#FCEBEB');
    doc.fillColor(EMBER).fontSize(9).text('Total Egresos', 213, y + 7);
    doc.fontSize(13).text(formatoL(egresos.total), 213, y + 21);

    doc.rect(370, y, 165, 42).fill('#E6F1FB');
    doc.fillColor(NAVY).fontSize(9).text('Total Global', 378, y + 7);
    doc.fontSize(13).text(formatoL(totalGlobal), 378, y + 21);

    y += 62;

    function seccion(titulo, color, arbol) {
      if (y > 700) { pie(); doc.addPage(); y = 40; }
      doc.fillColor(color).font('Helvetica-Bold').fontSize(13).text(titulo, 40, y);
      y += 20;
      const filas = aplanarArbol(arbol.raiz, 0, []);
      doc.fontSize(9);
      filas.forEach((f) => {
        if (y > 730) { pie(); doc.addPage(); y = 40; encabezado(); y = 86; }
        doc.font(f.esPadre ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000000');
        const textoNombre = `${'   '.repeat(f.nivel)}${f.nombre}`;
        // El nombre puede envolverse a más de una línea si es largo — hay
        // que medir cuánto ocupa de verdad antes de decidir cuánto bajar
        // para la siguiente fila, o se encima con la que sigue.
        const alturaNombre = doc.heightOfString(textoNombre, { width: 230 });
        const alturaFila = Math.max(alturaNombre, 12) + 4;
        doc.text(f.codigo, 40, y, { width: 45 });
        doc.text(textoNombre, 90, y, { width: 230 });
        doc.text(f.cantidad !== undefined && f.cantidad !== null ? String(f.cantidad) : '', 320, y, { width: 45, align: 'right' });
        doc.text(f.valor !== undefined && f.valor !== null ? formatoL(f.valor) : '', 365, y, { width: 75, align: 'right' });
        doc.text(formatoL(f.monto), 445, y, { width: 90, align: 'right' });
        y += alturaFila;
      });
      y += 14;
    }

    seccion('Ingresos', GREEN, ingresos);
    seccion('Egresos', EMBER, egresos);

    // Espacio para firma al final del reporte.
    if (y > 700) { pie(); doc.addPage(); y = 40; }
    y += 40;
    const anchoFirma = 220;
    const xFirma = (doc.page.width - anchoFirma) / 2;
    doc.moveTo(xFirma, y).lineTo(xFirma + anchoFirma, y).strokeColor('#000000').lineWidth(1).stroke();
    y += 6;
    doc.font('Helvetica').fontSize(9).fillColor('#000000').text('Firma', xFirma, y, { width: anchoFirma, align: 'center' });

    pie();
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo generar el PDF.' });
  }
});

module.exports = router;
