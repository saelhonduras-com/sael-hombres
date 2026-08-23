-- 031_cantidad_valor_manual.sql
--
-- Las cuentas manuales de Entradas/Salidas de Efectivo dejan de tener
-- un solo "monto" fijo — ahora se capturan como Cantidad × Valor
-- unitario = Monto, igual patrón que Hotel y Comida, pero aquí AMBOS
-- (cantidad y valor) los escribe el usuario a mano.

ALTER TABLE valores_cuenta ADD COLUMN IF NOT EXISTS cantidad NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE valores_cuenta ADD COLUMN IF NOT EXISTS valor NUMERIC NOT NULL DEFAULT 0;

-- Todo lo que ya existía de antes se trata como si hubiera sido
-- "1 x el monto que ya tenía" — para no perder ni alterar datos reales
-- ya capturados.
UPDATE valores_cuenta SET valor = monto, cantidad = 1 WHERE cantidad = 1 AND valor = 0;
