-- Tabla de Saelistas (servidores voluntarios de SAEL Hombres), inspirada
-- en la ficha de Servidor de SFL, pero simplificada: SIN login propio,
-- SIN PIN, y SIN asistencia por día (viernes/sábado/domingo) — todo eso
-- solo lo administra el admin desde el panel. En vez de esos campos, se
-- agregó es_aspirante (booleano simple).
--
-- cargos_desempenados, tipo_testimonio, formacion_oficial y
-- otras_participaciones son listas de selección múltiple (checkboxes en
-- el formulario), guardadas como arreglo de texto de Postgres.
--
-- foto se guarda en base64 directo en la base de datos (mismo patrón que
-- SFL) — decisión explícita para no depender de almacenamiento externo,
-- ya que el sistema de archivos de Render no es permanente entre
-- redespliegues. El frontend debe comprimir/redimensionar la imagen
-- (máx. 300-400px de lado) antes de enviarla.

CREATE TABLE saelistas (
  id SERIAL PRIMARY KEY,

  -- Datos personales
  nombre_completo TEXT NOT NULL,
  dni TEXT,
  celular TEXT,
  email TEXT,
  estado_civil TEXT,
  hijos_cantidad INTEGER,
  nietos_cantidad INTEGER,
  fecha_nacimiento DATE,
  nombre_esposa TEXT,
  profesion TEXT,
  contacto_emergencia_telefono TEXT,
  foto TEXT, -- base64 (data URL), NULL si no tiene foto

  -- Ubicación
  capitulo TEXT,
  zona TEXT,
  departamento TEXT,
  municipio TEXT,

  -- Organizacional / FIHNEC
  fecha_inscripcion_capitulo DATE,
  tiempo_fihnec TEXT,
  cargo_actual TEXT,
  cargos_desempenados TEXT[] DEFAULT '{}',

  -- Testimonio y formación
  tipo_testimonio TEXT[] DEFAULT '{}',
  formacion_oficial TEXT[] DEFAULT '{}',
  otras_participaciones TEXT[] DEFAULT '{}',

  -- Sistema/control (versión SAEL: sin PIN ni asistencia por día)
  es_aspirante BOOLEAN NOT NULL DEFAULT false,

  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_saelistas_dni ON saelistas (dni);
CREATE INDEX idx_saelistas_nombre ON saelistas (nombre_completo);
