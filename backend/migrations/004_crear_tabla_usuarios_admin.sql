-- Usuarios del panel administrativo, con el mismo esquema de roles que SFL.
CREATE TABLE IF NOT EXISTS usuarios_admin (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('super_admin', 'admin', 'consulta', 'estandar', 'registro')),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_admin_email ON usuarios_admin (email);
