# Arquitectura de Map Creator

## Visión general

```
 Navegador                                     Servidor (contenedor «app»)                PostgreSQL («db»)
 ─────────                                     ───────────────────────────                ─────────────────
 /            landing      ─┐                  FastAPI (uvicorn)
 /entrar /registro          ├── sitio/ ──────▶   estáticos con lista blanca
 /app         panel        ─┘                    /api/cuenta     ──────────────────────▶  usuarios, sesiones
 /editor/?p=<id>&m=<mapa>  ── editor/            /api/proyectos  ──────────────────────▶  proyectos, miembros
     local.js (modo nube) ── X-OO-Proyecto ──▶   /api/db/<col>   ──────────────────────▶  documentos, colecciones
                                                  /api/fotos, /_blob ── volumen archivos ─▶ archivos (ficha)
```

Un solo proceso sirve la API, el sitio y el editor: no hace falta CORS, la cookie de sesión vale para todo y el despliegue es un
contenedor. Caddy (opcional) pone HTTPS delante.

## Decisión clave: no tocar el editor

El editor (unos 60 archivos JS y 300 KB solo en `editor.js`) ya hablaba con sus datos a través de una capa pequeña:
`window.claude.use('db')`, una interfaz parecida a Firestore (`collection(c).doc(id).set/update/delete`, `onSnapshot`). En modo local la
implementa `editor/js/nucleo/local.js` contra `servidor.py`, que guarda colecciones JSON en disco.

La versión web **mantiene exactamente esa interfaz**: `local.js` detecta `?p=<proyecto>` en la URL y entonces:

- añade la cabecera `X-OO-Proyecto` a toda petición `/api/…`;
- pide cada colección con `If-None-Match` (ETag): casi siempre recibe un 304 vacío;
- toma el usuario de `/api/cuenta/yo` y el rol de `/api/proyectos/<id>`;
- si recibe un 401, lleva a `/entrar` y luego vuelve.

`js/nucleo/nube.js` añade la barra del proyecto (volver a «Mis mapas», nombre, rol y aviso de solo lectura). Fuera de eso, el editor
no sabe si está en local o en la nube.

## Esquema de base de datos

Archivo: `api/migraciones/001_esquema.sql`.

| Tabla | Para qué | Claves |
|---|---|---|
| `usuarios` | cuentas (correo único sin distinguir mayúsculas, clave argon2id) | `id` uuid |
| `sesiones` | cookies activas; se guarda el **SHA-256** del token, nunca el token | `token_hash` |
| `proyectos` | espacio de trabajo: nombre, plantilla, mapa que abre, `archivado` (papelera) | `id` uuid |
| `miembros` | quién entra y con qué rol: `dueno`, `editor`, `lector` | (`proyecto_id`, `usuario_id`) |
| `documentos` | **los datos del editor**: un documento JSONB por (proyecto, colección, id) | (`proyecto_id`, `coleccion`, `doc_id`) |
| `colecciones` | versión de cada colección; sube con cada escritura y es el ETag | (`proyecto_id`, `coleccion`) |
| `archivos` | ficha de fotos, calcos, GLB y texturas; el contenido va al volumen | (`proyecto_id`, `id`) |
| `invitaciones` | enlaces `/invitacion/<token>`: de un proyecto (con rol) o de registro (sin proyecto); caducidad, usos, revocada | `id`; `token_hash` único |

`002_invitaciones.sql` añade también `usuarios.es_admin`, `usuarios.preferencias` (JSONB pequeño: recorridos vistos, primeros pasos
ocultos) y, en `miembros`, `favorito` y `abierto` (última vez que esa persona abrió el proyecto), que son de cada persona y no del
proyecto.

**Por qué JSONB y no una tabla por colección.** El editor tiene unas 14 colecciones (`cambios`, `capas`, `grupos`, `zonas`, `terreno`,
`materiales`, `componentes`, `versiones`, `notas`…) y cada versión del editor les añade campos. Modelarlas como tablas obligaría a migrar la
base cada vez que cambia el editor, y la API tendría que conocer cada forma. Con JSONB la API es genérica, igual que el servidor local,
y PostgreSQL sigue pudiendo consultar dentro (`datos->>'mapa'`) y crear índices GIN si algún día hacen falta.

**Por qué `colecciones.version`.** El editor sondea cada colección cada 2 s por pestaña. Sin ETag serían unas 14 lecturas completas
cada 2 s por usuario (`cambios` pasa de 500 KB en un mapa real). Con la versión, cada sondeo es una sola fila por clave primaria y
devuelve 304.

**Por qué `archivos` usa (proyecto, id).** El editor guarda las referencias como `"<proyecto>/<archivo>"` dentro de los documentos y
las pide en `/_blob/<proyecto>/<archivo>`. Al duplicar un proyecto se copian las filas con el mismo `id` y basta reemplazar el prefijo
`<viejo>/` por `<nuevo>/` en el texto de los documentos.

## Seguridad

- Contraseñas con argon2id. Cuando el correo no existe se verifica igual contra un hash de relleno, así la respuesta tarda lo mismo
  y no revela qué correos están registrados.
- Cookie `mc_sesion` HttpOnly y SameSite=Lax, con `Secure` si `OO_COOKIE_SEGURA=true`. Además, toda escritura con un `Origin` de otro
  dominio se rechaza (`main.py`, `mismo_origen`).
- Cambiar la contraseña cierra las demás sesiones.
- Permisos en cada petición: si no eres miembro recibes un 404 (no se revela que el proyecto existe); si eres lector, un 403 al
  escribir. Los proyectos en la papelera no se abren.
- Estáticos del editor con lista blanca (`css/`, `js/`, `mapas/`, `img/` y extensiones concretas): `editor/local/` (servidor local,
  `datos_usuario`) no se sirve nunca y ni siquiera entra en la imagen de Docker (`.dockerignore`).
- Límites: 8 MB por documento, 50 MB por subida (por trozos, sin cargarla entera en memoria) y 50 proyectos por usuario (configurables).

## Invitaciones por enlace

- **De un proyecto** (las crea su dueño desde «Compartir»): rol editor o lector, caducidad (1, 7, 30 días o nunca) y número de usos.
  Quien abre el enlace entra al proyecto; si no tiene cuenta, la crea en la misma página **aunque el registro esté cerrado**.
- **De registro** (las crea el administrador en «Administración»): solo permiten crear una cuenta.
- Como con las sesiones, solo se guarda el SHA-256 del token: el enlace se muestra una vez, al crearlo. Se puede revocar.
- Usar un enlace es atómico (`UPDATE … SET usos = usos + 1 WHERE <válida> RETURNING`), así dos personas no se cuelan en el último uso;
  si el registro falla, la transacción deshace también el uso. Aceptar un enlace nunca baja el rol de quien ya es miembro, y si ya
  tiene ese acceso no gasta un uso.
- **Administrador**: `usuarios.es_admin`. Los correos de `OO_ADMINS` lo son; si no hay ninguno, el usuario más antiguo pasa a serlo
  al entrar.

## Correo y códigos de verificación

- `app/correo.py` envía por SMTP (STARTTLS en 587, TLS directo en 465) en un hilo aparte. Sin `SMTP_HOST` no envía nada y
  `CORREO_ACTIVO` es falso: las cuentas nuevas quedan verificadas y la recuperación de contraseña dice que no está disponible.
- `app/codigos.py`: códigos de 6 dígitos en la tabla `codigos` (`003_correo.sql`), con solo el SHA-256 de (id + código). Caducan en
  15 minutos, admiten 5 intentos, hay que esperar 60 s entre uno y otro y como mucho 6 por hora. Pedir uno nuevo anula el anterior.
- **Verificar el correo**: con correo activo, la cuenta nueva recibe un código y hasta verificarlo la API responde 403
  `email_no_verificado` (salvo `/api/cuenta/yo`, verificar, reenviar y salir); `/app` y el editor llevan a `/verificar`. Las cuentas
  que existían antes de la migración quedan verificadas.
- **Olvidé mi contraseña** (`/recuperar`): la respuesta es la misma exista o no la cuenta. Con el código se cambia la contraseña, se
  cierran todas las sesiones, el correo queda verificado y llega un aviso.
- **Dos pasos** (opcional, `usuarios.dos_pasos`): tras la contraseña correcta no hay sesión; se devuelve un `desafio` (el id del
  código) y la sesión se crea con `/api/cuenta/entrar/codigo`.
- **Cambiar el correo**: pide la contraseña, envía el código a la dirección nueva y avisa a la vieja.
- **Límite de intentos**: 8 fallos por correo en 15 minutos (contraseña o recuperación) → 429. Por IP solo si `OO_IP_CABECERA` dice
  de qué cabecera leerla (detrás de Cloudflare, `cf-connecting-ip`); sin ella, la IP es la del proxy y limitarla bloquearía a todos.
- Avisos: contraseña cambiada, correo cambiado, te compartieron un mapa, e invitaciones por correo (a quien no tiene cuenta se le
  crea un enlace de un solo uso).

## Ayuda en la interfaz

- `sitio/js/recorrido.js`: recorrido guiado sin dependencias (resalta un elemento y pone una ficha; teclado ← → Esc). Lo usan el
  panel (primera visita, Ayuda → Recorrido guiado o tecla `?`) y el editor en modo nube (`nube.js`: primera vez, `?recorrido=1` o
  botón «Guía»). Lo visto se guarda en `usuarios.preferencias`, así no se repite en otro dispositivo.
- Panel: **Inicio** con «Continuar» (lo último que abriste) y **Primeros pasos**, que se deducen de los datos (crear, abrir, recorrido,
  compartir, favorito). Favoritos, orden (editado, abierto, nombre, creado) y vista en cuadrícula o lista.

## Funciones solo del modo local

Dependen del repo del juego (Unity/Godot) o de descargar teselas, así que en la nube responden 501 y el editor sigue funcionando:
mallas reales (`/_mallas`, `/_modelos`: se ven cajas), «Enviar al juego» (`/api/juego`, `/api/carteles`, `/api/reglas`) y el calco
satelital automático (`/api/satelital`). La exportación a GLB, Godot y Unity funciona igual en la nube, porque se hace en el navegador.

## Siguientes pasos recomendados

1. **Tiempo real**: cambiar el sondeo cada 2 s por SSE o WebSocket con `LISTEN/NOTIFY` de Postgres (ya hay versión por colección para
   notificar solo lo que cambió).
2. **Archivos en S3/MinIO** en vez del volumen, si hay más de una réplica de `app`.
3. **Copias del volumen `archivos`** (la base ya se respalda con `pg_dump` en cada despliegue de Actions).
4. **Mapas base en la base de datos** (tabla `mapas_base`) para que los usuarios suban sus propias plantillas.
