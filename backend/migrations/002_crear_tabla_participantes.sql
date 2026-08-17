-- Tabla de participantes (nacionales y extranjeros).
-- Cada persona se registra UNA sola vez; las siguientes inscripciones a
-- eventos futuros solo enlazan a esta ficha existente (vía tabla inscripciones).
CREATE TABLE IF NOT EXISTS participantes (
  id SERIAL PRIMARY KEY,
  tipo_participante TEXT NOT NULL DEFAULT 'nacional' CHECK (tipo_participante IN ('nacional', 'extranjero')),
  tipo_identificacion TEXT NOT NULL DEFAULT 'DNI' CHECK (tipo_identificacion IN ('DNI', 'Pasaporte')),
  numero_identificacion TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  fecha_nacimiento DATE,
  telefono_movil TEXT,
  departamento TEXT,
  municipio TEXT,
  capitulo TEXT,
  zona TEXT,
  cargo_fihnec TEXT,
  estado_civil TEXT,
  ha_recibido_saeles BOOLEAN NOT NULL DEFAULT false,
  veces_saeles_previas INTEGER,
  contacto_emergencia_nombre TEXT,
  contacto_emergencia_telefono TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un mismo número de identificación no puede repetirse
CREATE UNIQUE INDEX IF NOT EXISTS idx_participantes_identificacion
  ON participantes (numero_identificacion);
