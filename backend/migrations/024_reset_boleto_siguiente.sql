-- Reinicia boleto_siguiente al mismo valor que boleto_inicio, SOLO para
-- el evento marcado como actual — corrige el conteo inflado (13 en vez
-- de 6) causado por el bug donde cada "Guardar" repetido en el módulo
-- de cobro asignaba un boleto nuevo, incluso para la misma persona.
-- Ese bug ya está corregido en el código; esto solo limpia el dato que
-- quedó mal mientras el bug estuvo activo.
--
-- Después de correr esto, el contador vuelve a arrancar limpio desde el
-- boleto inicial que ya tenías configurado, y de aquí en adelante debe
-- avanzar de uno en uno, correctamente.
UPDATE eventos
SET boleto_siguiente = boleto_inicio
WHERE es_actual = true AND boleto_inicio IS NOT NULL;
