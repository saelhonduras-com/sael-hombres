-- Reemplaza el modelo anterior de "Costos del evento" (texto libre en
-- eventos_costos, concepto+monto sin ninguna relación con el Catálogo de
-- Cuentas). Ahora cada valor configurado se amarra DIRECTAMENTE a una
-- cuenta real del catálogo — así lo que se ve en "Entradas & Salidas" y
-- lo que se usa en Control de Ingresos/Egresos es siempre lo mismo, sin
-- riesgo de que un nombre escrito a mano no coincida con el catálogo.
--
-- Es por evento — el mismo catálogo de cuentas puede tener un valor
-- distinto en cada evento (ej. Alimentación puede costar L.500 en un
-- evento y L.600 en el siguiente).
--
-- NOTA: esto NO reemplaza el costo de Hotel por módulo (que sigue
-- viviendo en eventos_costos con modulo_id) — ese es un caso aparte,
-- ligado a Habitaciones, no al Catálogo de Cuentas.
CREATE TABLE valores_cuenta (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  cuenta_id INTEGER NOT NULL REFERENCES catalogo_cuentas(id) ON DELETE CASCADE,
  monto NUMERIC(10,2) NOT NULL DEFAULT 0,
  es_boleto BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (evento_id, cuenta_id)
);
