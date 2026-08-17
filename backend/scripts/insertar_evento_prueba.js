// Inserta UN evento de prueba en la tabla "eventos", para poder probar el
// wizard de inscripción y el contador regresivo de la página principal.
// Uso: node scripts/insertar_evento_prueba.js
//
// Este script es seguro de correr más de una vez: si ya existe un evento
// marcado como "es_actual", primero lo desmarca, para no violar la regla
// de "solo un evento actual a la vez".

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Desmarca cualquier evento "actual" previo
    await cliente.query(`UPDATE eventos SET es_actual = false WHERE es_actual = true`);

    const resultado = await cliente.query(
      `INSERT INTO eventos (nombre, anio, mes, fecha_inicio, fecha_fin, fecha_limite_registro, abierto, es_actual)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nombre`,
      [
        'SAEL Agosto 2026',
        2026,
        8,
        '2026-08-28', // viernes
        '2026-08-30', // domingo
        '2026-08-25', // fecha límite de registro (cerca de hoy, para ver el contador correr)
        true,          // abierto
        true,          // es_actual
      ]
    );

    await cliente.query('COMMIT');
    console.log('Evento de prueba creado:', resultado.rows[0]);
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('Error creando el evento de prueba:', err.message);
    process.exit(1);
  } finally {
    cliente.release();
    await pool.end();
  }
})();
