-- 037_bitacora_identificacion.sql
-- Bitácora de cambios de identificación (DNI / pasaporte / código de menor)
-- hechos desde Participantes › Editar. Solo se agrega una tabla nueva:
-- no toca ni modifica ningún dato existente.

CREATE TABLE IF NOT EXISTS bitacora_identificacion (
  id SERIAL PRIMARY KEY,
  participante_id INTEGER REFERENCES participantes(id) ON DELETE SET NULL,
  participante_nombre TEXT NOT NULL,          -- copia del nombre al momento del cambio
  usuario_id INTEGER,
  usuario_nombre TEXT NOT NULL,
  tipo_identificacion_anterior TEXT,
  tipo_identificacion_nueva TEXT,
  identificacion_anterior TEXT NOT NULL,
  identificacion_nueva TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_ident_participante ON bitacora_identificacion (participante_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_ident_fecha ON bitacora_identificacion (creado_en DESC);
