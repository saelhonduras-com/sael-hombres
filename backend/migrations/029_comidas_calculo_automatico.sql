-- 029_comidas_calculo_automatico.sql
--
-- Agrega el mecanismo de "precio configurado × cantidad de gente" para
-- las cuentas de comida — igual patrón que Hotel por módulo, pero por
-- cuenta del catálogo en vez de por módulo de habitaciones.
--
-- tipo_calculo:
--   'comida_evento'  → cantidad = participantes registrados + Saelistas
--                       con asistencia (todos comen esas 5 comidas)
--   'comida_vigilia' → cantidad = solo Saelistas con asistencia

ALTER TABLE catalogo_cuentas
  ADD COLUMN IF NOT EXISTS tipo_calculo TEXT
  CHECK (tipo_calculo IS NULL OR tipo_calculo IN ('comida_evento', 'comida_vigilia'));

CREATE TABLE IF NOT EXISTS precios_cuenta (
  cuenta_id INTEGER NOT NULL REFERENCES catalogo_cuentas(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  precio NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (cuenta_id, evento_id)
);

-- Marca las 5 cuentas de comida del evento (Cenas Viernes, Desayunos
-- Sábado, Almuerzos Sábado, Cenas Sábado, Desayunos Domingo).
UPDATE catalogo_cuentas SET tipo_calculo = 'comida_evento'
WHERE id IN (15, 16, 17, 18, 19);

-- Marca las 3 cuentas de comida de Vigilia Saelistas (Cenas Jueves,
-- Desayunos Viernes, Almuerzos Viernes).
UPDATE catalogo_cuentas SET tipo_calculo = 'comida_vigilia'
WHERE id IN (20, 21, 22);
