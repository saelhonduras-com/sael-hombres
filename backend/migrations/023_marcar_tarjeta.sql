-- Marca "4.1.5 Tarjeta crédito/débito" con su clave interna, igual que
-- ya se hizo con boletos_evento/boletos_bancos/cortesia — así el módulo
-- de cobro y el cálculo de Control de Ingresos la encuentran de forma
-- confiable, sin depender del nombre/código exacto (que son libres de
-- editar).
UPDATE catalogo_cuentas
SET clave_sistema = 'boletos_tarjeta'
WHERE codigo = '4.1.5' AND clave_sistema IS NULL;
