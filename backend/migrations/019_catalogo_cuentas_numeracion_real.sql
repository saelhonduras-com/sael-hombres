-- Corrige la numeración del catálogo sembrado en la migración 018:
-- Carlos usa "4" para Ingresos y "5" para Egresos (no "1"/"2" como se
-- sembró antes) — probablemente porque 1-3 están reservados para otras
-- cuentas contables (activo/pasivo/patrimonio) que todavía no construimos.
-- Se actualiza por código exacto, así que si ya moviste algo a mano con
-- el CRUD nuevo, esto no lo pisa por accidente (solo toca las filas que
-- sigan con el código viejo).

UPDATE catalogo_cuentas SET codigo = '4' WHERE codigo = '1';
UPDATE catalogo_cuentas SET codigo = '4.1' WHERE codigo = '1.1';
UPDATE catalogo_cuentas SET codigo = '4.1.1' WHERE codigo = '1.1.1';
UPDATE catalogo_cuentas SET codigo = '4.1.2' WHERE codigo = '1.1.2';
UPDATE catalogo_cuentas SET codigo = '4.1.3' WHERE codigo = '1.1.3';
UPDATE catalogo_cuentas SET codigo = '4.2' WHERE codigo = '1.2';
UPDATE catalogo_cuentas SET codigo = '4.3' WHERE codigo = '1.3';
UPDATE catalogo_cuentas SET codigo = '4.4' WHERE codigo = '1.4';

UPDATE catalogo_cuentas SET codigo = '5' WHERE codigo = '2';
UPDATE catalogo_cuentas SET codigo = '5.1' WHERE codigo = '2.1';
UPDATE catalogo_cuentas SET codigo = '5.2' WHERE codigo = '2.2';
UPDATE catalogo_cuentas SET codigo = '5.3' WHERE codigo = '2.3';
UPDATE catalogo_cuentas SET codigo = '5.4' WHERE codigo = '2.4';
UPDATE catalogo_cuentas SET codigo = '5.5' WHERE codigo = '2.5';

-- IMPORTANTE: ahora que hay un CRUD para editar el catálogo libremente,
-- el cálculo automático de Control de Ingresos NO puede seguir
-- buscando cuentas por su código ("4.1.1", etc.) — si Carlos renombra o
-- reordena algo, se rompería en silencio. En vez de eso, se agrega una
-- "clave interna" fija (clave_sistema) que el backend usa para
-- encontrar estas cuentas específicas, separada del código/nombre que
-- se ve y se edita en pantalla. NO se muestra ni se edita normalmente
-- en el CRUD — es un enganche técnico, no un dato de negocio.
ALTER TABLE catalogo_cuentas ADD COLUMN clave_sistema TEXT UNIQUE;

UPDATE catalogo_cuentas SET clave_sistema = 'boletos_evento' WHERE codigo = '4.1.1';
UPDATE catalogo_cuentas SET clave_sistema = 'boletos_bancos' WHERE codigo = '4.1.2';
UPDATE catalogo_cuentas SET clave_sistema = 'servidores' WHERE codigo = '4.1.3';
UPDATE catalogo_cuentas SET clave_sistema = 'aportaciones_espacios' WHERE codigo = '4.2';
UPDATE catalogo_cuentas SET clave_sistema = 'ofrenda' WHERE codigo = '4.3';
UPDATE catalogo_cuentas SET clave_sistema = 'otros_ingresos' WHERE codigo = '4.4';

-- Cuentas fijas nuevas: turnos de comida bajo "5.1 Alimentación" y
-- "5.2 Vigilia Saelistas" — a diferencia de 5.3/5.4/5.5 (que son
-- "manual", renglones sueltos con nombre), estas son categorías fijas
-- que se repiten evento tras evento, así que quedan como "manual" TAMBIÉN
-- pero ya con la sub-cuenta creada — el renglón real (cuánto costó, a
-- quién se le pagó) se sigue agregando como movimiento bajo cada una.
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.1.1', 'Cenas Viernes', 'egreso', id, 'manual', 1 FROM catalogo_cuentas WHERE codigo = '5.1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.1.2', 'Desayunos Sábado', 'egreso', id, 'manual', 2 FROM catalogo_cuentas WHERE codigo = '5.1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.1.3', 'Almuerzos Sábado', 'egreso', id, 'manual', 3 FROM catalogo_cuentas WHERE codigo = '5.1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.1.4', 'Cenas Sábado', 'egreso', id, 'manual', 4 FROM catalogo_cuentas WHERE codigo = '5.1';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.1.5', 'Desayunos Domingo', 'egreso', id, 'manual', 5 FROM catalogo_cuentas WHERE codigo = '5.1';

INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.2.1', 'Cenas Jueves', 'egreso', id, 'manual', 1 FROM catalogo_cuentas WHERE codigo = '5.2';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.2.2', 'Desayunos Viernes', 'egreso', id, 'manual', 2 FROM catalogo_cuentas WHERE codigo = '5.2';
INSERT INTO catalogo_cuentas (codigo, nombre, tipo, cuenta_padre_id, origen, orden)
  SELECT '5.2.3', 'Almuerzos Viernes', 'egreso', id, 'manual', 3 FROM catalogo_cuentas WHERE codigo = '5.2';
