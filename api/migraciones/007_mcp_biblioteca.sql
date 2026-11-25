-- Tokens de acceso personales (para el servidor MCP y la API REST sin cookie): «Authorization: Bearer mc_…».
-- Solo se guarda el sha256 del token; el token completo se enseña una vez al crearlo. prefijo = los primeros caracteres, para reconocerlo.
CREATE TABLE tokens_api (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    nombre      text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
    hash        bytea NOT NULL UNIQUE,
    prefijo     text NOT NULL,
    creado      timestamptz NOT NULL DEFAULT now(),
    ultimo_uso  timestamptz,
    revocado    timestamptz
);
CREATE INDEX tokens_api_usuario ON tokens_api (usuario_id);

-- Biblioteca de assets (modelos GLB) que cualquiera puede añadir a sus proyectos. Los mapas de la biblioteca son las plantillas
-- publicadas (tabla plantillas). autor_id NULL = del sistema (carpeta api/biblioteca/, que el dueño del servidor puede ir llenando).
-- El archivo vive en <archivos>/_biblioteca/<id>.glb.
CREATE TABLE biblioteca_assets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    autor_id     uuid REFERENCES usuarios (id) ON DELETE CASCADE,
    clave        text UNIQUE,                     -- los del sistema: nombre del archivo en api/biblioteca/ (para sincronizar)
    nombre       text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
    descripcion  text NOT NULL DEFAULT '' CHECK (length(descripcion) <= 500),
    categoria    text NOT NULL DEFAULT 'general' CHECK (length(categoria) <= 40),
    etiquetas    text[] NOT NULL DEFAULT '{}',
    visibilidad  text NOT NULL DEFAULT 'privada' CHECK (visibilidad IN ('privada', 'publica')),
    tamano_m     jsonb,                           -- [ancho, alto, fondo] en metros, si se conoce
    escala       real NOT NULL DEFAULT 1,
    mini         text,                            -- miniatura (data URL), si se conoce
    archivo      text NOT NULL,                   -- ruta relativa dentro de la carpeta de archivos
    bytes        bigint NOT NULL DEFAULT 0,
    usos         integer NOT NULL DEFAULT 0,
    creado       timestamptz NOT NULL DEFAULT now(),
    actualizado  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX biblioteca_assets_autor ON biblioteca_assets (autor_id);
CREATE INDEX biblioteca_assets_publicos ON biblioteca_assets (visibilidad, usos DESC);
