-- Método de pago ahora tiene 3 opciones en vez de 2 (se agregó Tarjeta).
ALTER TABLE inscripciones DROP CONSTRAINT IF EXISTS inscripciones_metodo_pago_check;
ALTER TABLE inscripciones
  ADD CONSTRAINT inscripciones_metodo_pago_check
  CHECK (metodo_pago IN ('tarjeta', 'efectivo', 'transferencia'));
