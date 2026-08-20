-- Antes, "Bloquear" solo tenía un mensaje libre. Ahora captura datos
-- reales de un depósito/transferencia previa (3 semanas antes del
-- evento, cuando la persona todavía no existe como Participante en el
-- sistema): a nombre de quién, el número de la transferencia bancaria
-- (comprobante), y el monto — porque este depósito SÍ cuenta como
-- ingreso desde el momento del bloqueo, no hasta que la persona llegue.
ALTER TABLE habitacion_reservas
  ADD COLUMN nombre_reservado TEXT,
  ADD COLUMN numero_transferencia TEXT,
  ADD COLUMN monto NUMERIC(10,2);
