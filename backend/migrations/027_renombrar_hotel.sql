-- Renombra la categoría "4.2 Aportaciones de Espacios" a "Hotel" — el
-- clave_sistema no cambia, así que el cálculo automático sigue
-- funcionando igual, solo cambia lo que se ve en pantalla.
UPDATE catalogo_cuentas SET nombre = 'Hotel' WHERE clave_sistema = 'aportaciones_espacios';
