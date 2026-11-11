-- Correo: verificación de la dirección, códigos de un solo uso (verificar, recuperar la contraseña, entrar en dos pasos, cambiar
-- el correo) y registro de intentos de entrada para frenar a quien prueba contraseñas.

-- Las cuentas que ya existían se dan por verificadas: no se bloquea a nadie al activar el correo.
ALTER TABLE usuarios ADD COLUMN email_verificado timestamptz;
UPDATE usuarios SET email_verificado = creado;
-- Verificación en dos pasos por correo (opcional, la activa cada usuario en «Cuenta»).
ALTER TABLE usuarios ADD COLUMN dos_pasos boolean NOT NULL DEFAULT false;

-- Códigos de 6 dígitos. Solo se guarda el SHA-256 de (id + código). Caducan en 15 minutos y admiten 5 intentos.
-- Para «entrar», el id hace de desafío: el navegador lo recibe tras la contraseña y lo devuelve junto con el código.
CREATE TABLE codigos (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposito    text NOT NULL CHECK (proposito IN ('verificar', 'recuperar', 'entrar', 'cambiar_correo')),
    usuario_id   uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    email        text NOT NULL,                 -- adonde se envió (en cambiar_correo, la dirección nueva)
    codigo_hash  bytea NOT NULL,
    creado       timestamptz NOT NULL DEFAULT now(),
    expira       timestamptz NOT NULL,
    intentos     integer NOT NULL DEFAULT 0,
    usado        timestamptz
);
CREATE INDEX codigos_usuario ON codigos (usuario_id, proposito, creado DESC);

-- Intentos fallidos de entrada (contraseña o código). Se limpian solos al pasar un día.
CREATE TABLE intentos_entrada (
    id      bigserial PRIMARY KEY,
    email   text NOT NULL,
    ip      inet,
    creado  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intentos_email ON intentos_entrada (lower(email), creado);
CREATE INDEX intentos_ip ON intentos_entrada (ip, creado);
