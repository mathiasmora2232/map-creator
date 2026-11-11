-- Esquema inicial de Map Creator (PostgreSQL 15+).
--
-- Idea central: el editor ya guarda todo como colecciones de documentos JSON ({coleccion}/{id} -> objeto), igual que Firestore.
-- En vez de partir cada colección en tablas (cambios, capas, grupos, zonas…, que cambian con cada versión del editor), se guardan
-- como JSONB en `documentos`, aislados por proyecto. Lo relacional (usuarios, proyectos, permisos, archivos) sí va en tablas.

-- ───────────────────────── Usuarios y sesiones ─────────────────────────
CREATE TABLE usuarios (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email          text NOT NULL,
    nombre         text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
    clave_hash     text NOT NULL,                       -- argon2id
    creado         timestamptz NOT NULL DEFAULT now(),
    ultimo_acceso  timestamptz
);
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));

-- El token de la cookie no se guarda: solo su SHA-256. Si se filtra la tabla, no sirve para entrar.
CREATE TABLE sesiones (
    token_hash  bytea PRIMARY KEY,
    usuario_id  uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    creado      timestamptz NOT NULL DEFAULT now(),
    expira      timestamptz NOT NULL,
    user_agent  text,
    ip          inet
);
CREATE INDEX sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX sesiones_expira ON sesiones (expira);

-- ───────────────────────── Proyectos y permisos ─────────────────────────
-- Un proyecto es un espacio de trabajo con sus propias colecciones. Dentro puede haber varios mapas
-- (los de plantilla, como «complejo», o los propios «u-<nombre>» de la colección `mapas`).
CREATE TABLE proyectos (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
    descripcion   text NOT NULL DEFAULT '',
    dueno_id      uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    plantilla     text NOT NULL DEFAULT 'vacio',        -- vacio | complejo | parqueadero | importado | copia
    mapa_inicial  text NOT NULL,                        -- mapa que abre el editor (?m=)
    creado        timestamptz NOT NULL DEFAULT now(),
    actualizado   timestamptz NOT NULL DEFAULT now(),   -- última escritura de cualquier documento
    archivado     timestamptz                           -- papelera: no se borra en el acto
);
CREATE INDEX proyectos_dueno ON proyectos (dueno_id);

CREATE TABLE miembros (
    proyecto_id  uuid NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
    usuario_id   uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    rol          text NOT NULL CHECK (rol IN ('dueno', 'editor', 'lector')),
    creado       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (proyecto_id, usuario_id)
);
CREATE INDEX miembros_usuario ON miembros (usuario_id);

-- ───────────────────────── Datos del editor ─────────────────────────
CREATE TABLE documentos (
    proyecto_id      uuid NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
    coleccion        text NOT NULL CHECK (coleccion ~ '^[A-Za-z0-9_\-]{1,40}$'),
    doc_id           text NOT NULL CHECK (length(doc_id) BETWEEN 1 AND 200),
    datos            jsonb NOT NULL,
    creado           timestamptz NOT NULL DEFAULT now(),
    actualizado      timestamptz NOT NULL DEFAULT now(),
    actualizado_por  uuid REFERENCES usuarios (id) ON DELETE SET NULL,
    PRIMARY KEY (proyecto_id, coleccion, doc_id)
);

-- Versión de cada colección: sube con cada escritura. El editor pregunta cada 2 s por colección; con la versión como ETag la
-- respuesta es un 304 vacío casi siempre, sin leer los documentos.
CREATE TABLE colecciones (
    proyecto_id  uuid NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
    coleccion    text NOT NULL,
    version      bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (proyecto_id, coleccion)
);

-- ───────────────────────── Archivos subidos ─────────────────────────
-- Fotos de referencia, calcos satelitales, modelos GLB y texturas. El contenido va al volumen de archivos (o a S3 más adelante);
-- aquí solo la ficha.
-- La clave es (proyecto, id): al duplicar un proyecto se copian las filas con el mismo id y basta cambiar el prefijo
-- «<proyecto>/» en los documentos que las nombran (el editor guarda «<proyecto>/<archivo>» y lo pide en /_blob/<proyecto>/<archivo>).
CREATE TABLE archivos (
    id            uuid NOT NULL DEFAULT gen_random_uuid(),
    proyecto_id   uuid NOT NULL REFERENCES proyectos (id) ON DELETE CASCADE,
    tipo          text NOT NULL CHECK (tipo IN ('foto', 'asset')),
    nombre        text NOT NULL,
    content_type  text NOT NULL,
    tamano        bigint NOT NULL CHECK (tamano >= 0),
    ruta          text NOT NULL,                         -- relativa a la carpeta de archivos
    subido_por    uuid REFERENCES usuarios (id) ON DELETE SET NULL,
    creado        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (proyecto_id, id)
);
CREATE INDEX archivos_proyecto ON archivos (proyecto_id, tipo);
