-- Restaura la estructura de cuentas de Ingresos que se eliminó por
-- accidente (borrado en cascada al eliminar la cuenta raíz "4 Ingresos"
-- desde la pantalla de Entradas de Efectivo). Usa ON CONFLICT (codigo)
-- DO NOTHING, así que es seguro correrla exista o no ya cada fila —
-- no duplica nada si alguna sobrevivió.
--
-- IMPORTANTE: esto solo restaura la ESTRUCTURA (las cuentas). Cualquier
-- monto que ya hubieras capturado en "Entradas de Efectivo" para esas
-- cuentas se perdió también (por la misma cascada) y hay que volver a
-- escribirlo a mano — no hay forma de recuperar ese dato específico.

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  VALUES ('4', 'Ingresos', 'ingreso', NULL, 'categoria', 1)
  ON CONFLICT (codigo) DO NOTHING;

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.1', 'Inscripción', 'ingreso', id, 'categoria', 1 FROM catalogo_cuentas WHERE codigo = '4'
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.2', 'Aportaciones de Espacios', 'ingreso', id, 'categoria', 2 FROM catalogo_cuentas WHERE codigo = '4'
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.3', 'Ofrenda', 'ingreso', id, 'manual', 3 FROM catalogo_cuentas WHERE codigo = '4'
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.4', 'Otros Ingresos', 'ingreso', id, 'manual', 4 FROM catalogo_cuentas WHERE codigo = '4'
  ON CONFLICT (codigo) DO NOTHING;

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.1.1', 'Aportación por Boletos en Evento', 'ingreso', id, 'automatico', 1 FROM catalogo_cuentas WHERE codigo = '4.1'
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.1.2', 'Aportación de Boletos en Bancos', 'ingreso', id, 'automatico', 2 FROM catalogo_cuentas WHERE codigo = '4.1'
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '4.1.3', 'Servidores', 'ingreso', id, 'automatico', 3 FROM catalogo_cuentas WHERE codigo = '4.1'
  ON CONFLICT (codigo) DO NOTHING;

-- Vuelve a poner las claves internas (por si la fila sobrevivió pero sin
-- clave por alguna razón, o si se acaba de recrear arriba)
UPDATE catalogo_cuentas SET clave_sistema = 'boletos_evento' WHERE codigo = '4.1.1' AND clave_sistema IS NULL;
UPDATE catalogo_cuentas SET clave_sistema = 'boletos_bancos' WHERE codigo = '4.1.2' AND clave_sistema IS NULL;
UPDATE catalogo_cuentas SET clave_sistema = 'servidores' WHERE codigo = '4.1.3' AND clave_sistema IS NULL;
UPDATE catalogo_cuentas SET clave_sistema = 'aportaciones_espacios' WHERE codigo = '4.2' AND clave_sistema IS NULL;
UPDATE catalogo_cuentas SET clave_sistema = 'ofrenda' WHERE codigo = '4.3' AND clave_sistema IS NULL;
UPDATE catalogo_cuentas SET clave_sistema = 'otros_ingresos' WHERE codigo = '4.4' AND clave_sistema IS NULL;
