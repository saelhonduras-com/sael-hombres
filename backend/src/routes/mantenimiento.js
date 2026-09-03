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
// Participantes: solo se ocultaban, así que restaurar es voltear el
// interruptor de vuelta. Saelistas: se borraban de verdad, así que
// restaurar significa volver a insertar la fila completa. Cuando
// conectemos Eventos, Habitaciones, Catálogo de Cuentas en fases
// futuras, cada uno se agrega aquí como un nuevo "case".
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
    } else if (item.tabla_origen === 'saelistas') {
      // A diferencia de Participantes (que solo se ocultan), aquí sí se
      // borró de verdad — restaurar significa volver a insertar la fila
      // completa, con su mismo id de siempre.
      const d = item.datos;
      const existente = await pool.query(`SELECT id FROM saelistas WHERE dni = $1`, [d.dni]);
      if (existente.rows.length > 0) {
        return res.status(400).json({ error: 'Ya existe un Saelista con este DNI — probablemente se creó uno nuevo mientras tanto. No se puede restaurar.' });
      }
      await pool.query(
        `INSERT INTO saelistas (
          id, nombre_completo, dni, celular, email, estado_civil,
          hijos_cantidad, nietos_cantidad, fecha_nacimiento, nombre_esposa, profesion,
          contacto_emergencia_telefono, foto,
          capitulo, zona, departamento, municipio,
          fecha_inscripcion_capitulo, tiempo_fihnec, cargo_actual, cargos_desempenados,
          tipo_testimonio, formacion_oficial, otras_participaciones,
          es_aspirante, creado_en, actualizado_en
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
        [
          d.id, d.nombre_completo, d.dni, d.celular, d.email, d.estado_civil,
          d.hijos_cantidad, d.nietos_cantidad, d.fecha_nacimiento, d.nombre_esposa, d.profesion,
          d.contacto_emergencia_telefono, d.foto,
          d.capitulo, d.zona, d.departamento, d.municipio,
          d.fecha_inscripcion_capitulo, d.tiempo_fihnec, d.cargo_actual, d.cargos_desempenados,
          d.tipo_testimonio, d.formacion_oficial, d.otras_participaciones,
          d.es_aspirante, d.creado_en, d.actualizado_en,
        ]
      );
      // Como se insertó con un id explícito, hay que "avisarle" a la
      // secuencia de autoincremento cuál es el número más alto real —
      // si no, el próximo Saelista creado normal podría chocar con este id.
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('saelistas', 'id'), (SELECT COALESCE(MAX(id), 1) FROM saelistas))`
      );
    } else if (item.tabla_origen === 'habitaciones') {
      // Se restaura vacía a propósito (decidido con Carlos): sus antiguos
      // ocupantes/cobro de ese momento NO vuelven — pudieron reasignarse
      // a otra habitación mientras estuvo eliminada, y traerlos de vuelta
      // chocaría con el candado contra asignaciones duplicadas.
      const d = item.datos;
      if (d.modulo_id) {
        const moduloExiste = await pool.query(`SELECT id FROM modulos WHERE id = $1`, [d.modulo_id]);
        if (moduloExiste.rows.length === 0) {
          d.modulo_id = null; // el módulo que tenía ya no existe — se restaura sin módulo, no se bloquea
        }
      }
      await pool.query(
        `INSERT INTO habitaciones (id, numero, capacidad, notas, creado_en, modulo_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [d.id, d.numero, d.capacidad, d.notas, d.creado_en, d.modulo_id]
      );
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('habitaciones', 'id'), (SELECT COALESCE(MAX(id), 1) FROM habitaciones))`
      );
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

// ============================================================
// RESPALDOS COMPLETOS DEL SISTEMA
// Genérico a propósito: consulta information_schema en vez de tener
// escrita a mano la lista de tablas — así nunca hay que actualizar este
// archivo si en el futuro se agrega una tabla nueva al sistema.
// ============================================================

async function listarTablas(cliente) {
  const { rows } = await cliente.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  return rows.map((r) => r.table_name);
}

// Calcula un orden seguro para restaurar (padres antes que hijas),
// leyendo las llaves foráneas reales de la base en ese momento.
async function ordenDeRestauracion(cliente, tablas) {
  const { rows } = await cliente.query(
    `SELECT tc.table_name AS hija, ccu.table_name AS padre
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
  );
  const dependeDe = {};
  tablas.forEach((t) => { dependeDe[t] = new Set(); });
  rows.forEach(({ hija, padre }) => {
    if (hija !== padre && dependeDe[hija]) dependeDe[hija].add(padre);
  });
  const orden = [];
  const restantes = new Set(tablas);
  while (restantes.size > 0) {
    const listas = [...restantes].filter((t) => [...dependeDe[t]].every((p) => !restantes.has(p)));
    if (listas.length === 0) {
      // Dependencia circular entre un grupo de tablas — se insertan tal
      // cual quedan, el resto del orden calculado sigue siendo correcto.
      orden.push(...restantes);
      break;
    }
    listas.forEach((t) => { orden.push(t); restantes.delete(t); });
  }
  return orden;
}

// Detecta si una tabla se referencia a sí misma (ej. catalogo_cuentas con
// cuenta_padre_id) y, si es así, reordena sus filas para que un "padre"
// siempre quede antes que su "hija" — si no, la llave foránea rechaza la
// inserción de la hija porque el padre todavía no existe.
async function ordenarFilasAutoReferencia(cliente, tabla, filas) {
  const { rows: fks } = await cliente.query(
    `SELECT kcu.column_name AS columna, ccu.column_name AS columna_padre
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
       AND tc.table_name = $1 AND ccu.table_name = $1`,
    [tabla]
  );
  if (fks.length === 0) return filas;

  const columna = fks[0].columna;
  const columnaPadre = fks[0].columna_padre;
  const porClave = new Map(filas.map((f) => [f[columnaPadre], f]));
  const insertadas = new Set();
  const resultado = [];
  function insertar(fila) {
    if (insertadas.has(fila[columnaPadre])) return;
    const idPadre = fila[columna];
    if (idPadre != null && porClave.has(idPadre) && !insertadas.has(idPadre)) {
      insertar(porClave.get(idPadre));
    }
    insertadas.add(fila[columnaPadre]);
    resultado.push(fila);
  }
  filas.forEach(insertar);
  return resultado;
}

// Genera y descarga un respaldo completo — un solo archivo JSON con
// TODAS las tablas del sistema, tal como están en este momento.
router.get('/admin/respaldo', async (req, res) => {
  try {
    const tablas = await listarTablas(pool);
    const datos = {};
    for (const tabla of tablas) {
      const { rows } = await pool.query(`SELECT * FROM "${tabla}"`);
      datos[tabla] = rows;
    }
    const respaldo = { version: 1, generado_en: new Date().toISOString(), tablas: datos };
    const nombreArchivo = `respaldo-sael-hombres-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(respaldo, null, 2));
  } catch (err) {
    console.error('Error al generar respaldo:', err);
    res.status(500).json({ error: 'No se pudo generar el respaldo.' });
  }
});

// Restaura el sistema COMPLETO desde un archivo de respaldo — borra todo
// lo que hay ahora mismo y lo reemplaza con el contenido del archivo.
// Todo en una sola transacción: si algo falla a medio camino, se revierte
// por completo, no queda nada a medias.
router.post('/admin/respaldo/restaurar', async (req, res) => {
  const { respaldo } = req.body;
  if (!respaldo || !respaldo.tablas || typeof respaldo.tablas !== 'object') {
    return res.status(400).json({ error: 'El archivo no tiene el formato de un respaldo válido.' });
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const tablasReales = await listarTablas(cliente);
    const orden = await ordenDeRestauracion(cliente, tablasReales);

    // Se valida cada columna contra el esquema real de esa tabla ahora
    // mismo — así, si el respaldo es viejo y trae una columna que ya no
    // existe (por una migración posterior), simplemente se ignora esa
    // columna en vez de que la restauración entera falle. También se
    // guarda el TIPO de cada columna, porque las de tipo json/jsonb
    // necesitan convertirse a texto antes de insertarse.
    const columnasReales = {};
    for (const tabla of tablasReales) {
      const { rows } = await cliente.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tabla]
      );
      columnasReales[tabla] = new Map(rows.map((r) => [r.column_name, r.data_type]));
    }

    // Se vacía todo primero (CASCADE evita choques por llaves foráneas
    // sin importar el orden en que se llame aquí).
    for (const tabla of tablasReales) {
      await cliente.query(`TRUNCATE TABLE "${tabla}" RESTART IDENTITY CASCADE`);
    }

    // Se reinserta en el orden correcto (padres antes que hijas), solo
    // las tablas que sí vienen en el archivo del respaldo.
    let totalFilas = 0;
    for (const tabla of orden) {
      let filas = respaldo.tablas[tabla];
      if (!filas || filas.length === 0) continue;
      // Algunas tablas se referencian a SÍ MISMAS (ej. catalogo_cuentas
      // con cuenta_padre_id) — dentro de esa misma tabla, la fila "padre"
      // tiene que insertarse antes que su "hija", si no, la llave foránea
      // falla aunque el orden entre tablas ya esté bien.
      filas = await ordenarFilasAutoReferencia(cliente, tabla, filas);
      for (const fila of filas) {
        const columnas = Object.keys(fila).filter((c) => columnasReales[tabla].has(c));
        if (columnas.length === 0) continue;
        const marcadores = columnas.map((_, i) => `$${i + 1}`);
        const valores = columnas.map((c) => {
          const tipo = columnasReales[tabla].get(c);
          const valor = fila[c];
          if ((tipo === 'json' || tipo === 'jsonb') && valor !== null && typeof valor === 'object') {
            return JSON.stringify(valor);
          }
          return valor;
        });
        await cliente.query(
          `INSERT INTO "${tabla}" (${columnas.map((c) => `"${c}"`).join(',')}) VALUES (${marcadores.join(',')})`,
          valores
        );
        totalFilas += 1;
      }
      // Reajusta la secuencia de autoincremento al valor más alto real
      // insertado — primero se confirma que la columna "id" exista de
      // verdad en esta tabla (algunas, como precios_cuenta, no la
      // tienen), porque pg_get_serial_sequence truena con error si le
      // preguntas por una columna que no existe, no regresa null.
      if (columnasReales[tabla].has('id')) {
        const seqRes = await cliente.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [tabla]);
        const seq = seqRes.rows[0]?.seq;
        if (seq) {
          await cliente.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${tabla}"), 1))`, [seq]);
        }
      }
    }

    await cliente.query('COMMIT');
    res.json({ ok: true, totalFilas });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('Error al restaurar respaldo:', err);
    res.status(500).json({
      error: 'No se pudo restaurar el respaldo — no se cambió nada, se revirtió todo.',
      detalle: err.message,
    });
  } finally {
    cliente.release();
  }
});

module.exports = router;
