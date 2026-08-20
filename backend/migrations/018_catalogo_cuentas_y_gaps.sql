-- ============================================================
-- CATÁLOGO DE CUENTAS
-- ============================================================
-- Estructura FIJA de categorías (los nodos "1", "1.1", "1.2"... que
-- vienen del Excel de Carlos). NO incluye los sub-renglones de
-- "Aportaciones de Espacios" por módulo (H7/H4 en el Excel) — esos se
-- generan solos a partir de los Módulos que existan en Habitaciones,
-- para no duplicar ni fijar algo que ya es flexible en otro lado.
--
-- origen:
--   'categoria'  = solo agrupa, no tiene valor propio (ej. "1 Ingresos")
--   'automatico' = su valor se calcula solo desde datos que ya existen
--                  en el sistema (ej. "Aportación por Boletos en Evento")
--   'manual'     = es una categoría bajo la cual el admin agrega
--                  renglones sueltos con nombre (ej. "Otros Ingresos")
CREATE TABLE catalogo_cuentas (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  cuenta_padre_id INTEGER REFERENCES catalogo_cuentas(id) ON DELETE CASCADE,
  origen TEXT NOT NULL CHECK (origen IN ('categoria', 'automatico', 'manual')),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden) VALUES
  ('1', 'Ingresos', 'ingreso', NULL, 'categoria', 1),
  ('2', 'Egresos', 'egreso', NULL, 'categoria', 2);

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.1', 'Inscripción', 'ingreso', id, 'categoria', 1 FROM catalogo_cuentas WHERE codigo = '1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.2', 'Aportaciones de Espacios', 'ingreso', id, 'categoria', 2 FROM catalogo_cuentas WHERE codigo = '1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.3', 'Ofrenda', 'ingreso', id, 'manual', 3 FROM catalogo_cuentas WHERE codigo = '1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.4', 'Otros Ingresos', 'ingreso', id, 'manual', 4 FROM catalogo_cuentas WHERE codigo = '1';

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.1.1', 'Aportación por Boletos en Evento', 'ingreso', id, 'automatico', 1 FROM catalogo_cuentas WHERE codigo = '1.1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.1.2', 'Aportación de Boletos en Bancos', 'ingreso', id, 'automatico', 2 FROM catalogo_cuentas WHERE codigo = '1.1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '1.1.3', 'Servidores', 'ingreso', id, 'automatico', 3 FROM catalogo_cuentas WHERE codigo = '1.1';

-- 1.2.x (por módulo) NO se guarda aquí — se genera dinámicamente.

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '2.1', 'Alimentación', 'egreso', id, 'manual', 1 FROM catalogo_cuentas WHERE codigo = '2';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '2.2', 'Vigilia Saelistas', 'egreso', id, 'manual', 2 FROM catalogo_cuentas WHERE codigo = '2';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '2.3', 'Ofrendas', 'egreso', id, 'manual', 3 FROM catalogo_cuentas WHERE codigo = '2';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '2.4', 'Otros Egresos', 'egreso', id, 'manual', 4 FROM catalogo_cuentas WHERE codigo = '2';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '2.5', 'Otros Pagos', 'egreso', id, 'manual', 5 FROM catalogo_cuentas WHERE codigo = '2';

-- ============================================================
-- MOVIMIENTOS MANUALES — renglones sueltos que el admin agrega bajo una
-- cuenta "manual" del catálogo (ej. "Anacleto Perez (espacio de
-- panadería)" bajo "1.4 Otros Ingresos"). Es por evento.
-- ============================================================
CREATE TABLE movimientos_financieros (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  cuenta_id INTEGER NOT NULL REFERENCES catalogo_cuentas(id),
  concepto TEXT NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
  valor NUMERIC(10,2) NOT NULL,
  notas TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_movimientos_evento ON movimientos_financieros (evento_id);

-- ============================================================
-- CHECK-IN DE SAELISTAS POR EVENTO (gap #1 — "Servidores")
-- ============================================================
-- Igual de simple que registrado_presencial en inscripciones, pero para
-- Saelistas: no pagan nada, solo se confirma que asistieron a este
-- evento específico.
CREATE TABLE saelista_asistencias (
  id SERIAL PRIMARY KEY,
  saelista_id INTEGER NOT NULL REFERENCES saelistas(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  registrado_presencial BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (saelista_id, evento_id)
);

-- ============================================================
-- MÉTODO DE PAGO EN HABITACIONES (gap #2 — "en Evento" vs "en Bancos")
-- ============================================================
ALTER TABLE habitacion_ocupantes
  ADD COLUMN metodo_pago TEXT CHECK (metodo_pago IN ('tarjeta', 'efectivo', 'transferencia'));
