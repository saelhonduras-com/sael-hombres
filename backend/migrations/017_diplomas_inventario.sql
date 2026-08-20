-- Inventario físico de diplomas impresos — standalone, no está asociado a
-- ningún otro dato del sistema (a diferencia de Boletería, que sí se
-- conecta con el conteo real de check-ins). Ambos números se capturan
-- 100% a mano: Inventario Inicial = cuántos diplomas ya se han usado
-- hasta ahora, Inventario Final = el total existente (el techo). Los
-- que quedan disponibles se calculan solos (Final - Inicial), igual
-- que en Boletería.
CREATE TABLE diplomas_inventario (
  id INTEGER PRIMARY KEY DEFAULT 1,
  inventario_usado INTEGER,
  inventario_existentes INTEGER,
  actualizado_en TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT diplomas_inventario_una_sola_fila CHECK (id = 1)
);
INSERT INTO diplomas_inventario (id) VALUES (1);
