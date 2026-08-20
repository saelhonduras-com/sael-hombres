// Crea (o actualiza la contraseña de) un usuario super_admin.
// Uso: node scripts/crear_super_admin.js correo@ejemplo.com "MiContraseñaSegura" "Nombre Completo"

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const [, , email, password, ...nombrePartes] = process.argv;
const nombre_completo = nombrePartes.join(' ');

if (!email || !password || !nombre_completo) {
  console.error('Uso: node scripts/crear_super_admin.js correo@ejemplo.com "Contraseña" "Nombre Completo"');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios_admin (email, password_hash, nombre_completo, rol)
       VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, nombre_completo = $3
       RETURNING id, email, nombre_completo, rol`,
      [email.toLowerCase().trim(), hash, nombre_completo]
    );
    console.log('Usuario super_admin listo:', rows[0]);
  } catch (err) {
    console.error('Error creando el usuario:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
