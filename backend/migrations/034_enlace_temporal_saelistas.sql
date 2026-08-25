-- 034_enlace_temporal_saelistas.sql
-- Tabla de una sola fila que guarda cuándo vence el enlace público de
-- autoservicio para que los Saelistas llenen/completen su propia ficha
-- sin necesitar acceso al panel. Cada vez que el admin le da clic a
-- "Generar enlace", esta fila se actualiza con la nueva fecha de vencimiento
-- (ahora + 24 horas reales desde el clic, no medianoche ni día calendario).

CREATE TABLE IF NOT EXISTS saelistas_enlace_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  expira_en TIMESTAMPTZ,
  CONSTRAINT saelistas_enlace_config_una_fila CHECK (id = 1)
);
