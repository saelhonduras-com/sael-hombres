-- Control de boletos físicos por evento: el admin define en qué número
-- arranca (boleto_inicio, según dónde quedó el evento anterior), y
-- boleto_siguiente avanza solo cada vez que alguien paga Alimentación.
ALTER TABLE eventos
  ADD COLUMN boleto_inicio INTEGER,
  ADD COLUMN boleto_siguiente INTEGER;

-- Costos configurables por evento (ej. "Alimentación" = L.500). Tabla
-- flexible a propósito, para poder agregar más conceptos a futuro sin
-- cambiar el esquema otra vez. Un mismo concepto no se repite dos veces
-- para el mismo evento (UNIQUE) — actualizar el monto es un upsert.
CREATE TABLE eventos_costos (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (evento_id, concepto)
);

-- El "módulo de cobro": captura qué pagó la persona al momento de
-- confirmarse presencialmente (Alimentación, Hotel, método de pago,
-- banco/recibo, boleto físico asignado, observaciones). Vive en
-- `inscripciones` porque es un dato por persona-por-evento, igual que
-- registrado_presencial.
ALTER TABLE inscripciones
  ADD COLUMN alimentacion_monto NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN hotel_modulo_id INTEGER REFERENCES modulos(id),
  ADD COLUMN hotel_monto NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN metodo_pago TEXT CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  ADD COLUMN banco_o_recibo TEXT,
  ADD COLUMN boleto_numero TEXT,
  ADD COLUMN observaciones_pago TEXT;
