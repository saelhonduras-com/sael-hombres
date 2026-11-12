-- 035_papelera_e_inscripciones_historial.sql
-- Estas dos tablas ya existían en desarrollo/producción (se crearon con
-- SQL directo en una sesión anterior), pero nunca quedaron guardadas
-- como una migración numerada — por eso faltaban al reconstruir el
-- esquema completo desde cero para SAEL Jóvenes. Este archivo las deja
-- documentadas formalmente para ambos sistemas.
--
-- IF NOT EXISTS: en SAEL-Hombres (donde ya existen) no hace nada; en
-- SAEL-Jóvenes (donde faltan) las crea.

CREATE TABLE IF NOT EXISTS inscripciones_historial (
  id SERIAL PRIMARY KEY,
  inscripcion_id INTEGER,
  participante_id INTEGER,
  evento_id INTEGER,
  motivo TEXT NOT NULL,
  datos JSONB NOT NULL,
  eliminado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS papelera (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tabla_origen TEXT NOT NULL,
  datos JSONB NOT NULL,
  eliminado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
