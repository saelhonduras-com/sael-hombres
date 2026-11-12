-- 036_menores.sql
-- Permite registrar MENORES de edad (sin DNI) como caso especial desde el panel.
-- Les asigna un código interno propio (MEN-00001, MEN-00002…) en lugar de DNI.

-- 1) Quitar los CHECK que limitan tipo_participante y tipo_identificacion
--    (se buscan por columna, sin depender del nombre que les puso Postgres).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'participantes' AND c.contype = 'c'
      AND (pg_get_constraintdef(c.oid) ILIKE '%tipo_participante%'
        OR pg_get_constraintdef(c.oid) ILIKE '%tipo_identificacion%')
  LOOP
    EXECUTE format('ALTER TABLE participantes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2) Volver a crearlos aceptando los valores nuevos.
ALTER TABLE participantes
  ADD CONSTRAINT participantes_tipo_participante_check
  CHECK (tipo_participante IN ('nacional', 'extranjero', 'menor'));
ALTER TABLE participantes
  ADD CONSTRAINT participantes_tipo_identificacion_check
  CHECK (tipo_identificacion IN ('DNI', 'Pasaporte', 'Código interno'));

-- 3) Contador de códigos de menores.
CREATE SEQUENCE IF NOT EXISTS menores_codigo_seq START 1;
