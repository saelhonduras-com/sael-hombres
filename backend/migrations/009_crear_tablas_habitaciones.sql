-- Catálogo fijo de habitaciones (no cambia entre eventos). La capacidad
-- la agrega el admin manualmente al crear cada habitación, y puede
-- editarla después si hace falta — no se infiere de ningún nombre/tipo.
CREATE TABLE habitaciones (
  id SERIAL PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  capacidad INTEGER NOT NULL,
  notas TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT now()
);

-- Ocupantes de una habitación, POR EVENTO. Esta es la parte que "se
-- reinicia" en cada evento nuevo — pero en realidad nunca se borra nada:
-- cada fila queda amarrada a su evento_id para siempre, así que el
-- historial de quién ocupó cada habitación en cada evento anterior queda
-- disponible para reportes futuros sin necesidad de ningún botón de
-- "reiniciar".
--
-- El ocupante puede ser un participante O un saelista (nunca ambos a la
-- vez) — el CHECK de abajo obliga a que coincida con tipo_ocupante.
--
-- Estado DISPONIBLE/NO DISPONIBLE de una habitación NO se guarda aquí —
-- se calcula en el momento: DISPONIBLE = cero ocupantes en el evento
-- actual, NO DISPONIBLE = uno o más (aunque no haya llegado a su
-- capacidad todavía).
CREATE TABLE habitacion_ocupantes (
  id SERIAL PRIMARY KEY,
  habitacion_id INTEGER NOT NULL REFERENCES habitaciones(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,

  tipo_ocupante TEXT NOT NULL CHECK (tipo_ocupante IN ('participante', 'saelista')),
  participante_id INTEGER REFERENCES participantes(id) ON DELETE CASCADE,
  saelista_id INTEGER REFERENCES saelistas(id) ON DELETE CASCADE,

  monto NUMERIC(10,2),
  banco_o_recibo TEXT,
  observaciones TEXT,

  creado_en TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT ocupante_coincide_con_tipo CHECK (
    (tipo_ocupante = 'participante' AND participante_id IS NOT NULL AND saelista_id IS NULL)
    OR
    (tipo_ocupante = 'saelista' AND saelista_id IS NOT NULL AND participante_id IS NULL)
  )
);

CREATE INDEX idx_habitacion_ocupantes_evento ON habitacion_ocupantes (evento_id);
CREATE INDEX idx_habitacion_ocupantes_habitacion ON habitacion_ocupantes (habitacion_id);
