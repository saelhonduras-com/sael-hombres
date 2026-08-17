// Aplica un solo archivo de migración SQL contra la base de datos.
// Uso: node scripts/aplicar_una_migracion.js nombre_del_archivo.sql
//
// El archivo debe existir dentro de la carpeta backend/migrations/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const nombreArchivo = process.argv[2];

if (!nombreArchivo) {
  console.error('Uso: node scripts/aplicar_una_migracion.js <nombre_del_archivo>.sql');
  process.exit(1);
}

const rutaArchivo = path.join(__dirname, '..', 'migrations', nombreArchivo);

if (!fs.existsSync(rutaArchivo)) {
  console.error(`No se encontró el archivo: ${rutaArchivo}`);
  process.exit(1);
}

const sql = fs.readFileSync(rutaArchivo, 'utf8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const cliente = await pool.connect();
  try {
    console.log(`Aplicando migración: ${nombreArchivo}`);
    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query('COMMIT');
    console.log('Migración aplicada con éxito.');
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('Error aplicando la migración, se revirtió todo:', err.message);
    process.exit(1);
  } finally {
    cliente.release();
    await pool.end();
  }
})();
