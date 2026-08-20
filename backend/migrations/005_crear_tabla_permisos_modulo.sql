-- Permisos por módulo para usuarios con rol "admin" (configurable).
-- super_admin no necesita filas aquí: tiene acceso total siempre.
CREATE TABLE IF NOT EXISTS permisos_modulo (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('consulta', 'edicion'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permisos_modulo_unico ON permisos_modulo (usuario_id, modulo);
