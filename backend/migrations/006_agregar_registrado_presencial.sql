-- Agrega el chequeo presencial a las inscripciones, igual que en SFL.
-- Default FALSE: una inscripción nueva empieza sin confirmar hasta que
-- el admin marque presencia el día del evento. Nunca se borra por
-- inasistencia, solo queda en FALSE para siempre y se excluye de conteos
-- (total_saeles, y a futuro reportería/diplomas).

ALTER TABLE inscripciones
  ADD COLUMN registrado_presencial BOOLEAN NOT NULL DEFAULT false;
