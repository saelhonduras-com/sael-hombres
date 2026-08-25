-- 033_hora_limite_registro.sql
-- Agrega la hora de cierre de inscripciones, separada de la fecha
-- (fecha_limite_registro no se toca). Se guarda como texto "HH:MM" en
-- formato 24 horas, hora Honduras (mismo criterio fijo UTC-6 que ya usa
-- el resto del sistema) — sin zona horaria, sin complicaciones.
--
-- Default '23:59' para que los eventos ya existentes sigan comportándose
-- exactamente igual que hoy (cierre a medianoche) sin que nadie tenga que
-- tocar nada.

ALTER TABLE eventos ADD COLUMN hora_limite_registro TEXT NOT NULL DEFAULT '23:59';
