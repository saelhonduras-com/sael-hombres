-- Módulos = agrupación física fija de habitaciones (edificio/sección),
-- cada uno con su propio precio por persona. El precio puede variar de
-- módulo a módulo y el admin lo puede editar manualmente en cualquier
-- momento (pensado para conectarse a futuro con el Resumen Financiero,
-- pero por ahora es solo un campo editable, sin cálculos automáticos
-- todavía).

CREATE TABLE modulos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_por_persona NUMERIC(10,2),
  notas TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE habitaciones
  ADD COLUMN modulo_id INTEGER REFERENCES modulos(id) ON DELETE SET NULL;
