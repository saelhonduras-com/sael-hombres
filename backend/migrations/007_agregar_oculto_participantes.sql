-- Permite "ocultar" a un participante de listados y estadísticas sin
-- borrar su fila ni su historial (Eliminar en "Todos los participantes").
-- No confundir con el borrado real de inscripciones sin confirmar, que
-- vive en el endpoint DELETE /admin/inscripciones/:id.

ALTER TABLE participantes
  ADD COLUMN oculto BOOLEAN NOT NULL DEFAULT false;
