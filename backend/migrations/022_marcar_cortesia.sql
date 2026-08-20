-- Marca con clave_sistema la cuenta "Cortesía" (4.1.4) que Carlos ya
-- creó a mano en Catálogo de Cuentas — así el módulo de cobro puede
-- encontrarla de forma confiable, igual que ya hace con boletos_evento,
-- boletos_bancos y boletos_tarjeta, sin importar si el nombre/código
-- cambian después. Busca solo por código (no por nombre, por si acaso
-- hay algún acento o espacio distinto al esperado).
UPDATE catalogo_cuentas
SET clave_sistema = 'cortesia'
WHERE codigo = '4.1.4' AND clave_sistema IS NULL;
