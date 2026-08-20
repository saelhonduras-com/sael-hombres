-- El "evento anterior" (histórico, para mostrar cuánto se usó la última
-- vez, ej. SAEL Julio) es un dato MANUAL a propósito — decisión explícita
-- de Carlos: ese evento pasado no tiene por qué existir como registro
-- real en el módulo Eventos, así que se captura directo aquí, en
-- Boletería, sin depender de nada más ("aquí quiero controlar todo,
-- nada en otro lado").

ALTER TABLE boleteria_config
  ADD COLUMN evento_anterior_nombre TEXT,
  ADD COLUMN evento_anterior_inicio INTEGER,
  ADD COLUMN evento_anterior_fin INTEGER;
