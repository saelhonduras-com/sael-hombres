-- Permite "apartar" una habitación para alguien específico ANTES de que
-- tenga un ocupante real asignado (ej. mientras se confirma su depósito).
-- Es por evento — la misma habitación puede estar bloqueada en un evento
-- y libre en otro. Solo puede haber una reserva activa por habitación por
-- evento (constraint UNIQUE); "desbloquear" simplemente borra la fila.

CREATE TABLE habitacion_reservas (
  id SERIAL PRIMARY KEY,
  habitacion_id INTEGER NOT NULL REFERENCES habitaciones(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  mensaje TEXT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (habitacion_id, evento_id)
);
