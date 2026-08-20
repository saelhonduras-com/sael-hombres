-- Antes, el módulo de cobro buscaba el costo literal "Alimentación" por
-- nombre — pero como ahora los conceptos se pueden renombrar en Control
-- de Costos, ese amarre se rompía. En su lugar, el admin marca
-- explícitamente CUÁL costo genérico es el que alimenta el campo
-- "Inscripciones (Alimentación)" del módulo de cobro (y por lo tanto
-- el que dispara la asignación de boleto), sin importar cómo se llame.
-- Solo puede haber UNO marcado a la vez por evento (se controla en el
-- backend, no con un UNIQUE — permitir temporalmente ninguno marcado
-- mientras se configura).
ALTER TABLE eventos_costos
  ADD COLUMN es_boleto BOOLEAN NOT NULL DEFAULT false;
