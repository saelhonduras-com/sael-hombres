-- Tabla de eventos mensuales del SAEL (11 encuentros al año, Enero a Noviembre)
CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 11),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  fecha_limite_registro DATE NOT NULL,
  abierto BOOLEAN NOT NULL DEFAULT true,
  es_actual BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo un evento puede estar marcado como "actual" a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_un_solo_actual
  ON eventos (es_actual)
  WHERE es_actual = true;
