const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireModulo } = require('../middleware/auth');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const path = require('path');

// Todas las rutas de este módulo son de admin — Saelistas no tiene login
// propio ni portal público, a diferencia de "Servidores" en SFL.

// Construye el WHERE + valores a partir de los filtros — reutilizada por
// el listado, Excel y PDF, para que lo que se descarga siempre coincida
// con lo que se está viendo en pantalla en ese momento.
function condicionesFiltro(query) {
  const { buscar, zona, capitulo, es_aspirante } = query;
  const condiciones = [];
  const valores = [];

  if (buscar) {
    valores.push(`%${buscar}%`);
    condiciones.push(`(nombre_completo ILIKE $${valores.length} OR dni ILIKE $${valores.length})`);
  }
  if (zona) {
    valores.push(zona);
    condiciones.push(`zona = $${valores.length}`);
  }
  if (capitulo) {
    valores.push(`%${capitulo}%`);
    condiciones.push(`capitulo ILIKE $${valores.length}`);
  }
  if (es_aspirante) {
    valores.push(es_aspirante === 'true');
    condiciones.push(`es_aspirante = $${valores.length}`);
  }

  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', valores };
}

// Admin: listado con búsqueda y filtros. NUNCA trae la columna `foto` aquí
// — a propósito, para no cargar el listado con imágenes que no se van a
// mostrar. La foto solo se pide en el detalle individual. Aspirantes
// siempre quedan al final del orden.
router.get('/admin/saelistas', requireAuth, requireModulo('saelistas', 'consulta'), async (req, res) => {
  try {
    const { where, valores } = condicionesFiltro(req.query);
    const { rows } = await pool.query(
      `SELECT id, nombre_completo, dni, celular, capitulo, zona, cargo_actual, es_aspirante
       FROM saelistas
       ${where}
       ORDER BY es_aspirante ASC, nombre_completo ASC`,
      valores
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el listado de Saelistas.' });
  }
});

// IMPORTANTE: estas dos rutas (excel, pdf) deben ir ANTES de
// GET /admin/saelistas/:id — si no, Express interpretaría "excel" o "pdf"
// como si fueran el valor del parámetro :id, y estas rutas nunca se
// alcanzarían.

// Admin: descarga en Excel — mismas columnas que la tabla en pantalla,
// mismos filtros aplicados, aspirantes al final igual que el listado.
router.get('/admin/saelistas/excel', requireAuth, requireModulo('saelistas', 'consulta'), async (req, res) => {
  try {
    const { where, valores } = condicionesFiltro(req.query);
    const { rows } = await pool.query(
      `SELECT nombre_completo, dni, capitulo, zona, cargo_actual, es_aspirante
       FROM saelistas
       ${where}
       ORDER BY es_aspirante ASC, nombre_completo ASC`,
      valores
    );

    const datos = rows.map((r) => ({
      NOMBRE: r.nombre_completo,
      DNI: r.dni || '',
      CAPÍTULO: r.capitulo || '',
      ZONA: r.zona || '',
      'CARGO ACTUAL': r.cargo_actual || '',
      ASPIRANTE: r.es_aspirante ? 'Sí' : '',
    }));
    datos.push({});
    datos.push({ NOMBRE: 'Total Saelistas', DNI: rows.length });

    const hoja = xlsx.utils.json_to_sheet(datos);
    const libro = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(libro, hoja, 'Saelistas');
    const buffer = xlsx.write(libro, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="saelistas.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el Excel.' });
  }
});

// Admin: descarga en PDF — mismo diseño que el PDF de Diplomas (encabezado
// blanco con logo y línea navy, columnas centradas, vertical).
router.get('/admin/saelistas/pdf', requireAuth, requireModulo('saelistas', 'consulta'), async (req, res) => {
  try {
    const { where, valores } = condicionesFiltro(req.query);
    const { rows } = await pool.query(
      `SELECT nombre_completo, dni, capitulo, zona, cargo_actual, es_aspirante
       FROM saelistas
       ${where}
       ORDER BY es_aspirante ASC, nombre_completo ASC`,
      valores
    );

    const doc = new PDFDocument({ size: 'letter', margin: 0, layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="saelistas.pdf"');
    doc.pipe(res);

    const margenX = 40;
    const anchoPagina = doc.page.width;
    const rutaLogo = path.join(__dirname, '..', 'assets', 'logo-fihnec-emblema.png');

    function encabezadoPagina() {
      const alturaEncabezado = 70;
      const cajaLogo = 54;
      const cajaX = margenX;
      const cajaY = 8;
      try {
        const altoLogo = cajaLogo;
        const anchoLogo = altoLogo * (923 / 787);
        doc.image(rutaLogo, cajaX, cajaY, { height: altoLogo });
        var xTexto = cajaX + anchoLogo + 12;
      } catch (e) {
        var xTexto = cajaX;
      }
      doc.fillColor('#1F3464').fontSize(16).text('SAEL Hombres · FIHNEC', xTexto, 18, { lineBreak: false });
      doc.fontSize(10).fillColor('#E40521').text('Saelistas', xTexto, 40, { lineBreak: false });

      const anchoTotales = 220;
      const xTotales = anchoPagina - margenX - anchoTotales;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1F3464')
        .text(`TOTAL SAELISTAS: ${rows.length}`, xTotales, 26, { width: anchoTotales, align: 'right', lineBreak: false });
      doc.font('Helvetica');

      doc.moveTo(0, alturaEncabezado).lineTo(anchoPagina, alturaEncabezado).lineWidth(3).strokeColor('#1F3464').stroke();
      doc.lineWidth(1);
      doc.y = alturaEncabezado + 20;
    }

    const anchoTabla = 460;
    const inicioTabla = (anchoPagina - anchoTabla) / 2;
    const col = {
      nombre: inicioTabla,
      dni: inicioTabla + 150,
      capitulo: inicioTabla + 240,
      zona: inicioTabla + 320,
      aspirante: inicioTabla + 400,
    };
    const anchoCol = { nombre: 140, dni: 80, capitulo: 70, zona: 70, aspirante: 60 };

    function celda(texto, x, y, ancho) {
      doc.text(texto, x, y, { width: ancho, align: 'center', ellipsis: true, lineBreak: false });
    }

    function encabezadosTabla() {
      const y = doc.y;
      doc.fontSize(9).fillColor('#000000');
      celda('NOMBRE', col.nombre, y, anchoCol.nombre);
      celda('DNI', col.dni, y, anchoCol.dni);
      celda('CAPÍTULO', col.capitulo, y, anchoCol.capitulo);
      celda('ZONA', col.zona, y, anchoCol.zona);
      celda('ASPIRANTE', col.aspirante, y, anchoCol.aspirante);
      doc.y = y + 16;
      doc.moveTo(inicioTabla, doc.y).lineTo(inicioTabla + anchoTabla, doc.y).strokeColor('#cccccc').stroke();
      doc.y += 6;
    }

    encabezadoPagina();
    encabezadosTabla();

    const altoFila = 18;
    rows.forEach((r) => {
      if (doc.y + altoFila > doc.page.height - 40) {
        doc.addPage({ size: 'letter', margin: 0, layout: 'portrait' });
        encabezadoPagina();
        encabezadosTabla();
      }
      const y = doc.y;
      doc.fontSize(8).fillColor('#000000');
      celda(r.nombre_completo, col.nombre, y, anchoCol.nombre);
      celda(r.dni || '', col.dni, y, anchoCol.dni);
      celda(r.capitulo || '', col.capitulo, y, anchoCol.capitulo);
      celda(r.zona || '', col.zona, y, anchoCol.zona);
      celda(r.es_aspirante ? 'Sí' : '', col.aspirante, y, anchoCol.aspirante);
      doc.y = y + altoFila;
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el PDF.' });
  }
});

// Admin: detalle completo de un Saelista, incluyendo foto
router.get('/admin/saelistas/:id', requireAuth, requireModulo('saelistas', 'consulta'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM saelistas WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Saelista no encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el detalle del Saelista.' });
  }
});

// Admin: crea un Saelista nuevo
router.post('/admin/saelistas', requireAuth, requireModulo('saelistas', 'edicion'), async (req, res) => {
  const {
    nombre_completo, dni, celular, email, estado_civil,
    hijos_cantidad, nietos_cantidad, fecha_nacimiento, nombre_esposa, profesion,
    contacto_emergencia_telefono, foto,
    capitulo, zona, departamento, municipio,
    fecha_inscripcion_capitulo, tiempo_fihnec, cargo_actual, cargos_desempenados,
    tipo_testimonio, formacion_oficial, otras_participaciones,
    es_aspirante,
  } = req.body;

  if (!nombre_completo) {
    return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO saelistas (
        nombre_completo, dni, celular, email, estado_civil,
        hijos_cantidad, nietos_cantidad, fecha_nacimiento, nombre_esposa, profesion,
        contacto_emergencia_telefono, foto,
        capitulo, zona, departamento, municipio,
        fecha_inscripcion_capitulo, tiempo_fihnec, cargo_actual, cargos_desempenados,
        tipo_testimonio, formacion_oficial, otras_participaciones,
        es_aspirante
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING id`,
      [
        nombre_completo, dni || null, celular || null, email || null, estado_civil || null,
        hijos_cantidad || null, nietos_cantidad || null, fecha_nacimiento || null, nombre_esposa || null, profesion || null,
        contacto_emergencia_telefono || null, foto || null,
        capitulo || null, zona || null, departamento || null, municipio || null,
        fecha_inscripcion_capitulo || null, tiempo_fihnec || null, cargo_actual || null, cargos_desempenados || [],
        tipo_testimonio || [], formacion_oficial || [], otras_participaciones || [],
        !!es_aspirante,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo crear el Saelista.' });
  }
});

// Admin: edita un Saelista existente
router.put('/admin/saelistas/:id', requireAuth, requireModulo('saelistas', 'edicion'), async (req, res) => {
  const { id } = req.params;
  const {
    nombre_completo, dni, celular, email, estado_civil,
    hijos_cantidad, nietos_cantidad, fecha_nacimiento, nombre_esposa, profesion,
    contacto_emergencia_telefono, foto,
    capitulo, zona, departamento, municipio,
    fecha_inscripcion_capitulo, tiempo_fihnec, cargo_actual, cargos_desempenados,
    tipo_testimonio, formacion_oficial, otras_participaciones,
    es_aspirante,
  } = req.body;

  if (!nombre_completo) {
    return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE saelistas SET
        nombre_completo = $1, dni = $2, celular = $3, email = $4, estado_civil = $5,
        hijos_cantidad = $6, nietos_cantidad = $7, fecha_nacimiento = $8, nombre_esposa = $9, profesion = $10,
        contacto_emergencia_telefono = $11, foto = $12,
        capitulo = $13, zona = $14, departamento = $15, municipio = $16,
        fecha_inscripcion_capitulo = $17, tiempo_fihnec = $18, cargo_actual = $19, cargos_desempenados = $20,
        tipo_testimonio = $21, formacion_oficial = $22, otras_participaciones = $23,
        es_aspirante = $24, actualizado_en = now()
      WHERE id = $25
      RETURNING id`,
      [
        nombre_completo, dni || null, celular || null, email || null, estado_civil || null,
        hijos_cantidad || null, nietos_cantidad || null, fecha_nacimiento || null, nombre_esposa || null, profesion || null,
        contacto_emergencia_telefono || null, foto || null,
        capitulo || null, zona || null, departamento || null, municipio || null,
        fecha_inscripcion_capitulo || null, tiempo_fihnec || null, cargo_actual || null, cargos_desempenados || [],
        tipo_testimonio || [], formacion_oficial || [], otras_participaciones || [],
        !!es_aspirante,
        id,
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Saelista no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el Saelista.' });
  }
});

// Admin: elimina un Saelista. A diferencia de Participantes, aquí no hay
// historial de asistencias/inscripciones que proteger, así que es borrado
// directo (con confirmación en el frontend), no un "ocultar".
router.delete('/admin/saelistas/:id', requireAuth, requireModulo('saelistas', 'edicion'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`DELETE FROM saelistas WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Saelista no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar el Saelista.' });
  }
});

// ============================================================
// CHECK-IN DE SAELISTAS POR EVENTO ("Servidores" en Control de Ingresos)
// ============================================================
// Igual de simple que "Inscribiéndose ahora" de Participantes, pero sin
// módulo de cobro — los Saelistas no pagan nada, solo se confirma que
// asistieron a este evento específico.

// Admin: lista todos los saelistas con su estado de asistencia para el
// evento indicado (upsert implícito: si no existe fila en
// saelista_asistencias, se asume registrado_presencial = false).
router.get('/admin/eventos/:evento_id/saelistas-asistencia', requireAuth, requireModulo('saelistas', 'consulta'), async (req, res) => {
  const { evento_id } = req.params;
  const { buscar } = req.query;
  const condiciones = [];
  const valores = [evento_id];
  if (buscar) {
    valores.push(`%${buscar}%`);
    condiciones.push(`(s.nombre_completo ILIKE $${valores.length} OR s.dni ILIKE $${valores.length})`);
  }
  const where = condiciones.length ? `AND ${condiciones.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT s.id AS saelista_id, s.nombre_completo, s.dni, s.capitulo, s.zona,
              COALESCE(a.registrado_presencial, false) AS registrado_presencial
       FROM saelistas s
       LEFT JOIN saelista_asistencias a ON a.saelista_id = s.id AND a.evento_id = $1
       WHERE true ${where}
       ORDER BY COALESCE(a.registrado_presencial, false) ASC, s.nombre_completo ASC`,
      valores
    );
    const total = rows.length;
    const total_registrados = rows.filter((r) => r.registrado_presencial).length;
    res.json({ saelistas: rows, total, total_registrados });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener la asistencia de saelistas.' });
  }
});

// Admin: marca/desmarca la asistencia de un saelista a un evento (upsert)
router.put('/admin/saelista-asistencias/:saelista_id/presencial', requireAuth, requireModulo('saelistas', 'edicion'), async (req, res) => {
  const { saelista_id } = req.params;
  const { evento_id, registrado_presencial } = req.body;
  if (!evento_id) {
    return res.status(400).json({ error: 'Falta indicar el evento.' });
  }
  try {
    await pool.query(
      `INSERT INTO saelista_asistencias (saelista_id, evento_id, registrado_presencial)
       VALUES ($1, $2, $3)
       ON CONFLICT (saelista_id, evento_id) DO UPDATE SET registrado_presencial = EXCLUDED.registrado_presencial`,
      [saelista_id, evento_id, !!registrado_presencial]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar la asistencia.' });
  }
});

module.exports = router;
