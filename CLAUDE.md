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

## Asistente (bot con Claude)

- Variable `ANTHROPIC_API_KEY` o `CLAUDE_API` (así se llama en el grupo `comun` de la bóveda; `map-creator-app` tiene que
  referenciarla, como las SMTP) (más opcionales `OO_ASISTENTE_MODELO`, `OO_ASISTENTE_ESFUERZO`, `OO_ASISTENTE_LIMITE_HORA`). Igual que el
  SMTP: **nunca en el código ni en el repo**; en producción la inyecta el panel desde la bóveda (grupo `map-creator-app`). Sin ella el
  asistente queda desactivado y el botón no aparece.
- Servidor: `api/app/rutas/asistente.py` (prompt del sistema, herramientas, llamada a la API). Editor: `editor/src/nucleo/asistente.ts`
  (panel, bucle y ejecución de las herramientas en el mapa).
- Pruebas sin gastar: un servidor que imita la API (`ANTHROPIC_BASE_URL=http://127.0.0.1:<puerto>`) y `ANTHROPIC_API_KEY` falsa. No
  pruebes contra la API real sin que el dueño lo pida (cuesta dinero).

## MCP y biblioteca

- Servidor MCP en `/mcp` (`api/app/mcp_servidor.py`) con tokens de acceso personales (`tokens_api`, Cuenta → Conexiones). Las
  operaciones sobre datos van en `api/app/plataforma.py` (mismo formato de documentos que el editor). Detalles en `docs/MCP.md`.
- Una herramienta nueva: función en `plataforma.py` (o en la ruta que toque) + `@mcp.tool` en `mcp_servidor.py` + comprobación en
  `api/pruebas/prueba_mcp.py`. Lo que necesite el motor del navegador (terreno, exportar 3D) se deja pedido para el editor.
- Biblioteca de assets: `api/app/rutas/biblioteca.py`; los `.glb` de `api/biblioteca/` se publican al arrancar. Modelos con piezas
  (`crear_modelo`): `api/app/modelos.py` (GLB y miniatura SVG sin dependencias).
- El chat del panel (`sitio/src/panel/vistas/asistente.ts` → `POST /api/asistente`) usa las herramientas del MCP: una herramienta nueva
  del MCP aparece sola en el chat. Lanza `ToolError` (no `ValueError`) para que el mensaje llegue al cliente.

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

## TypeScript

- El código del navegador está en `sitio/src` (estricto) y `editor/src` (permisivo). **No edites `sitio/js` ni `editor/js`**: los
  genera `npm run build` (o `npm run dev`, que vigila) y no están en git.
- Antes de dar algo por terminado: `npm run tipos` sin errores y `npm run build`. La imagen de Docker hace las dos cosas y falla si
  los tipos fallan.
- Modelos de la API en `sitio/src/tipos.ts`. Globales del editor (`window.OO*`, `THREE`) en `editor/src/globales.d.ts`: si un módulo
  nuevo publica `window.OOAlgo`, decláralo ahí.
- Probar con el contenedor montando el repo: compila primero (`npm run build`), porque el servidor sirve `editor/js` y `sitio/js`.

## Rust (motor/)

- `motor/` se compila a `editor/wasm/motor.wasm` (generado, fuera de git) con `npm run build`. Sin Rust instalado en el equipo se usa
  un contenedor `rust:1-alpine` con podman; no instales rustup en la PC del dueño sin preguntar.
- Lo que el motor acelera de algo que ya existía necesita su versión en TypeScript de respaldo; una función nueva que solo existe en el
  motor (p. ej. el terreno procedural) puede no tenerla, pero tiene que avisar sin romper si el motor no carga. Siempre con pruebas en Rust (`cargo test`). Si cambias la interfaz, sube
  `VERSION` en `motor/src/lib.rs` y `VERSION_INTERFAZ` en `editor/src/nucleo/motor.ts`.
