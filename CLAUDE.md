# Map Creator — notas para agentes

## Correo (SMTP)

La app usa el SMTP compartido de la bóveda del panel. **No pidas ni pongas credenciales en el código ni en el repo.**

En producción (VPS, stack `map-creator`) el panel inyecta estas variables de entorno en el `.env` del stack al redesplegar.
Vienen del grupo `map-creator-app` de la bóveda, que las toma por referencia del grupo `comun`:

| Variable | Qué es |
|---|---|
| `SMTP_HOST` | servidor SMTP |
| `SMTP_PORT` | puerto (587 = STARTTLS) |
| `SMTP_USER` | usuario |
| `SMTP_PASS` | contraseña |
| `SMTP_FROM` | remitente («Nombre <correo@dominio>») |

- Léelas en `api/app/config.py` como las demás (`os.environ.get`).
- Si `SMTP_HOST` está vacío, el envío de correo queda **desactivado** sin romper nada (útil en desarrollo).
- Añádelas a `.env.example` **sin valores** y documéntalas en el README.
- También existen como archivo en el servidor y en la PC del dueño: `~/.config/panel-vault/map-creator-app.env`
  (permisos 600). Un despliegue que no pase por el panel (p. ej. GitHub Actions) puede usarlo con
  `env_file: /root/.config/panel-vault/map-creator-app.env` en el compose de producción.
- Para cambiar el SMTP no se toca el código: se cambia en el panel (Secretos → `comun`) y se redespliega.

## Producción

- Stack `map-creator` en el VPS, publicado en https://map-creator.stellarcodestudio.com (Cloudflare Tunnel).
- `OO_COOKIE_SEGURA=true` y `OO_REGISTRO_ABIERTO=false`: solo entran las cuentas ya creadas.
- Recomendado en el `.env` de producción: `OO_URL_PUBLICA=https://map-creator.stellarcodestudio.com` (enlaces de los correos) y
  `OO_IP_CABECERA=cf-connecting-ip` (IP real detrás de Cloudflare, para limitar intentos de entrada por IP).
- GitHub Actions (`.github/workflows/deploy.yml`) despliega solo lo que llega a la rama **`production`**, no `main`. Antes de tocar
  la base hace un `pg_dump` en `/opt/map-creator/backups`.

## Cómo está hecho el correo

- `api/app/correo.py` (envío SMTP en un hilo, plantillas) y `api/app/codigos.py` (códigos de 6 dígitos, límite de intentos).
- Con correo activo: verificación del correo al registrarse, «¿Olvidaste tu contraseña?», dos pasos opcional, cambiar el correo,
  invitaciones por correo y avisos. Detalles en `docs/ARQUITECTURA.md` → «Correo y códigos de verificación».
- Pruebas: `api/pruebas/prueba_correo.py` contra un servidor con `OO_CORREO_ARCHIVO=<carpeta>` (escribe los correos como JSON en
  vez de enviarlos). Nunca pruebes contra el SMTP real enviando correos sin que el dueño lo pida.
