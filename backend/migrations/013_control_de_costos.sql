-- Boletería: un solo registro con el "techo" de boletos impresos
-- disponibles (ej. 80701) y dónde están (CNC). Se actualiza cada vez que
-- se imprime un lote nuevo. El resto (cuánto se ha usado, cuánto queda)
-- se CALCULA a partir de eventos.boleto_inicio/boleto_siguiente, que ya
-- existían — no se duplica nada.
CREATE TABLE boleteria_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  rango_fin_impreso INTEGER,
  ubicacion TEXT,
  notas TEXT,
  actualizado_en TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT boleteria_config_una_sola_fila CHECK (id = 1)
);
INSERT INTO boleteria_config (id) VALUES (1);

-- Costos por módulo (Hotel): se agrega modulo_id para permitir varias
-- filas de "Hotel" en el mismo evento, una por cada módulo. Las demás
-- (Alimentación, Ofrenda, Renta de espacio, y lo que se agregue) siguen
-- siendo una fila única por evento, con modulo_id en NULL.
ALTER TABLE eventos_costos
  ADD COLUMN modulo_id INTEGER REFERENCES modulos(id) ON DELETE CASCADE;

-- La restricción UNIQUE anterior (evento_id, concepto) no distingue bien
-- cuando hay varias filas "Hotel" con distinto módulo — Postgres no trata
-- los NULL como iguales entre sí en un UNIQUE normal, así que hace falta
-- reemplazarla por dos índices parciales:
ALTER TABLE eventos_costos DROP CONSTRAINT IF EXISTS eventos_costos_evento_id_concepto_key;

CREATE UNIQUE INDEX eventos_costos_generico_unico
  ON eventos_costos (evento_id, concepto)
  WHERE modulo_id IS NULL;

CREATE UNIQUE INDEX eventos_costos_por_modulo_unico
  ON eventos_costos (evento_id, concepto, modulo_id)
  WHERE modulo_id IS NOT NULL;
