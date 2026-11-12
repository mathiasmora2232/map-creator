-- Quién usó cada enlace de invitación y permisos con plazo.
CREATE TABLE invitaciones_usos (
    invitacion_id  uuid NOT NULL REFERENCES invitaciones (id) ON DELETE CASCADE,
    usuario_id     uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    creado         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (invitacion_id, usuario_id)
);
CREATE INDEX invitaciones_usos_usuario ON invitaciones_usos (usuario_id);
-- Un enlace puede dar acceso por un tiempo (días desde que se usa). NULL: sin plazo.
ALTER TABLE invitaciones ADD COLUMN acceso_dias integer CHECK (acceso_dias > 0);
-- Acceso de un miembro hasta una fecha (NULL: sin plazo) y el enlace por el que entró.
ALTER TABLE miembros ADD COLUMN expira timestamptz;
ALTER TABLE miembros ADD COLUMN invitacion_id uuid REFERENCES invitaciones (id) ON DELETE SET NULL;
