-- 030_isv_alimentacion.sql
--
-- El impuesto de alimentación (5.1.6) se calcula 100% solo: 15% sobre
-- la suma de las 5 comidas del evento (5.1.1-5.1.5). NO aplica sobre
-- Vigilia Saelistas. No tiene precio que configurar — a diferencia de
-- comida_evento/comida_vigilia, esta cuenta nunca aparece en la
-- pantalla de "Precio por Comida", solo en el reporte.

ALTER TABLE catalogo_cuentas DROP CONSTRAINT IF EXISTS catalogo_cuentas_tipo_calculo_check;
ALTER TABLE catalogo_cuentas
  ADD CONSTRAINT catalogo_cuentas_tipo_calculo_check
  CHECK (tipo_calculo IS NULL OR tipo_calculo IN ('comida_evento', 'comida_vigilia', 'isv_alimentacion_evento'));

UPDATE catalogo_cuentas SET tipo_calculo = 'isv_alimentacion_evento' WHERE codigo = '5.1.6';
