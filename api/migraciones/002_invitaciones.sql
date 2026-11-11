-- Invitaciones por enlace, administrador, preferencias de usuario, favoritos y «abierto hace poco».

-- El administrador crea enlaces de registro y ve la lista de usuarios. Si no hay ninguno, el usuario más antiguo pasa a serlo
-- al entrar (seguridad.py, crear_sesion); OO_ADMINS añade más por correo.
ALTER TABLE usuarios ADD COLUMN es_admin boolean NOT NULL DEFAULT false;
-- Preferencias de la interfaz que deben seguir al usuario entre dispositivos (p. ej. recorridos ya vistos). Pequeñas: máx. 8 KB.
ALTER TABLE usuarios ADD COLUMN preferencias jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Por usuario y proyecto: marcado como favorito y última vez que lo abrió (vista «Recientes» y «Continuar»).
ALTER TABLE miembros ADD COLUMN favorito boolean NOT NULL DEFAULT false;
ALTER TABLE miembros ADD COLUMN abierto timestamptz;

-- Un enlace /invitacion/<token>. Con proyecto: quien lo abre entra al proyecto con ese rol (y puede crear su cuenta aunque el
-- registro esté cerrado). Sin proyecto: solo permite crear una cuenta (los crea el administrador).
-- Como con las sesiones, solo se guarda el SHA-256 del token: el enlace completo se muestra una vez, al crearlo.
CREATE TABLE invitaciones (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash   bytea NOT NULL UNIQUE,
    proyecto_id  uuid REFERENCES proyectos (id) ON DELETE CASCADE,
    rol          text CHECK (rol IN ('editor', 'lector')),
    creado_por   uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    nota         text NOT NULL DEFAULT '' CHECK (length(nota) <= 120),
    creado       timestamptz NOT NULL DEFAULT now(),
    expira       timestamptz,                               -- NULL: no caduca
    usos_max     integer CHECK (usos_max > 0),              -- NULL: sin límite
    usos         integer NOT NULL DEFAULT 0,
    revocada     timestamptz,
    CHECK ((proyecto_id IS NULL) = (rol IS NULL))
);
CREATE INDEX invitaciones_proyecto ON invitaciones (proyecto_id);
CREATE INDEX invitaciones_creado_por ON invitaciones (creado_por);
