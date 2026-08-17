-- Tabla de inscripciones: enlaza un participante a un evento específico.
-- El registro del participante (datos personales) se hace una sola vez;
-- cada mes que asiste, se crea una nueva fila aquí.
CREATE TABLE IF NOT EXISTS inscripciones (
  id SERIAL PRIMARY KEY,
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un participante no puede inscribirse dos veces al mismo evento
CREATE UNIQUE INDEX IF NOT EXISTS idx_inscripciones_unica
  ON inscripciones (participante_id, evento_id);
