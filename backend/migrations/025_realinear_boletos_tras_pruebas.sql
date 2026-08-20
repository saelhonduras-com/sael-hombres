-- Úsala DESPUÉS de haber desregistrado a todas las personas de prueba
-- (para que quede en 0 confirmados con boleto real). Vuelve a alinear
-- boleto_siguiente con boleto_inicio para el evento actual — limpio,
-- sin números viejos de por medio.
UPDATE eventos
SET boleto_siguiente = boleto_inicio
WHERE es_actual = true AND boleto_inicio IS NOT NULL;

-- De paso, limpia cualquier boleto_numero que haya quedado "pegado" en
-- inscripciones que ya NO están registradas (registrado_presencial =
-- false) — así no quedan números fantasma en los datos, aunque ya no
-- afecten ningún cálculo (Control de Ingresos ya los excluye).
UPDATE inscripciones
SET boleto_numero = NULL
WHERE registrado_presencial = false AND boleto_numero IS NOT NULL;
