-- 032_cobro_habitaciones.sql
-- Rediseño de Habitaciones: el cobro pasa a ser por habitación completa,
-- no por persona. habitacion_reservas se convierte en la única fuente
-- del cobro (monto, método de pago, observaciones), tanto para bloqueos
-- (normal y de seguridad) como para asignaciones normales de ocupantes.
--
-- Ejecutado en desarrollo: 24 de agosto de 2026.
-- Pendiente de ejecutar en produccion-limpia cuando el módulo esté
-- terminado y probado — usar node scripts/aplicar_una_migracion.js
-- (nunca migrate_v2.js), apuntando el connection string a produccion-limpia.
--
-- No borra ni modifica nada existente: solo agrega columnas nuevas,
-- ambas nullable, sin default forzado. Las columnas monto/metodo_pago/
-- banco_o_recibo/observaciones que ya existen en habitacion_ocupantes
-- quedan sin uso a partir de este cambio, pero no se eliminan aquí.

ALTER TABLE habitacion_reservas ADD COLUMN metodo_pago text;
ALTER TABLE habitacion_reservas ADD COLUMN observaciones text;
