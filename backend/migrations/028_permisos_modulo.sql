-- 028_permisos_modulo.sql
--
-- Permisos configurables por módulo, solo para usuarios con rol 'admin'.
-- - super_admin: acceso total automático, no necesita filas aquí.
-- - admin: necesita una fila por cada módulo al que tenga acceso. Sin
--   fila = sin acceso a ese módulo (lo aplica requireModulo en
--   middleware/auth.js, que ya existía antes de esta migración).
-- - consulta / estandar / registro / cocina: su acceso es fijo, definido
--   directamente en el código de cada ruta (requireRole), no usan esta
--   tabla.
--
-- nivel 'edicion' incluye lectura (requireModulo así lo interpreta).

CREATE TABLE IF NOT EXISTS permisos_modulo (
  usuario_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('consulta', 'edicion')),
  PRIMARY KEY (usuario_id, modulo)
);
