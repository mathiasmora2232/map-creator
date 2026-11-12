-- Plantillas publicadas por los usuarios: una instantánea de un mapa (documentos y archivos) que otros usan para empezar.
-- visibilidad: 'privada' (solo su autor) o 'publica' (todo el servidor). Los archivos se copian a _plantillas/<id>/ y en los documentos
-- las referencias «<proyecto>/» pasan a «__PLANTILLA__/» (al usarla se cambian por el proyecto nuevo).
CREATE TABLE plantillas (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    autor_id       uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    origen_id      uuid REFERENCES proyectos (id) ON DELETE SET NULL,
    nombre         text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
    descripcion    text NOT NULL DEFAULT '' CHECK (length(descripcion) <= 300),
    visibilidad    text NOT NULL DEFAULT 'publica' CHECK (visibilidad IN ('privada', 'publica')),
    mapa           text NOT NULL,
    documentos     jsonb NOT NULL,          -- [{coleccion, doc_id, datos}]
    archivos       jsonb NOT NULL DEFAULT '[]',
    n_documentos   integer NOT NULL DEFAULT 0,
    usos           integer NOT NULL DEFAULT 0,
    creado         timestamptz NOT NULL DEFAULT now(),
    actualizado    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plantillas_autor ON plantillas (autor_id);
CREATE INDEX plantillas_publicas ON plantillas (visibilidad, usos DESC);
