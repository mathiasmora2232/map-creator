# Map Creator

Editor de mapas 3D en el navegador: plano 2D con cotas, vista 3D, modo caminar, catálogo de objetos y prefabs, materiales, terreno
y exportación a GLB, Godot y Unity. Multiusuario, con cuentas, proyectos y permisos por proyecto.

## Arrancar

Necesitas Docker (o Podman) con Compose.

```bash
cp .env.example .env          # cambia POSTGRES_PASSWORD
docker compose up --build
```

Abre http://localhost:8000. Crea una cuenta, crea un mapa (en blanco o desde una plantilla) y se abre el editor. La primera cuenta es
la del administrador (o las de `OO_ADMINS`).

**Registro cerrado** (`OO_REGISTRO_ABIERTO=false`): solo se entra con un enlace de invitación. Los dueños de los mapas los crean en
«Compartir» (dan acceso al mapa y permiten crear la cuenta) y el administrador crea enlaces de solo registro en «Administración».

**Correo** (opcional): con `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` la app envía códigos de 6 dígitos para
verificar el correo de las cuentas nuevas, recuperar la contraseña («¿Olvidaste tu contraseña?»), entrar en dos pasos (opcional en
«Cuenta») y cambiar el correo, además de invitaciones y avisos (contraseña cambiada, mapa compartido). Sin `SMTP_HOST` todo eso se
desactiva y la app sigue funcionando: las cuentas nuevas quedan verificadas. Pon `OO_URL_PUBLICA` para que los enlaces de los
correos apunten a tu dominio. En producción las variables SMTP las inyecta el panel desde la bóveda (ver `CLAUDE.md`).

**Producción** (HTTPS automático con Caddy): apunta el DNS del dominio al servidor, pon `DOMINIO=mapas.tudominio.com` y
`OO_COOKIE_SEGURA=true` en `.env`, y:

```bash
docker compose --profile produccion up -d --build
```

## Estructura

```
map-creator/
├── docker-compose.yml        db (PostgreSQL 17) + app (FastAPI) + caddy (perfil «produccion»)
├── .env.example
├── deploy/Caddyfile          proxy HTTPS
├── api/                      backend (Python 3.13, FastAPI, asyncpg)
│   ├── Dockerfile            imagen con la API, el sitio y el editor
│   ├── app/
│   │   ├── main.py           arranque, middlewares, errores, estáticos (sitio y editor con lista blanca)
│   │   ├── config.py         variables de entorno
│   │   ├── db.py             pool de conexiones y migraciones
│   │   ├── seguridad.py      contraseñas (argon2id), sesiones por cookie, roles
│   │   └── rutas/
│   │       ├── cuenta.py     /api/cuenta: registro, entrar, salir, yo
│   │       ├── proyectos.py  /api/proyectos y /api/plantillas: crear, duplicar, papelera, miembros, favoritos
│   │       ├── invitaciones.py  enlaces /invitacion/<token>: crear, listar, revocar, aceptar
│   │       ├── admin.py      /api/admin: resumen del servidor y usuarios
│   ├── app/correo.py         envío SMTP (desactivado sin SMTP_HOST) y plantillas de los correos
│   ├── app/codigos.py        códigos de 6 dígitos y límite de intentos de entrada
│   │       └── editor_datos.py  /api/db, /api/fotos, /api/assets, /_blob: lo que usa el editor
│   ├── migraciones/          SQL en orden (001_esquema.sql…), se aplican solas al arrancar
│   ├── scripts/importar_local.py   pasa una carpeta datos_usuario del modo local a un proyecto
│   └── pruebas/prueba_api.py       prueba de punta a punta (83 comprobaciones)
├── package.json              esbuild + TypeScript: npm run build | dev | tipos
├── tsconfig.json             tipos del sitio (estricto)
├── scripts/build.mjs         compila sitio/src → sitio/js y editor/src → editor/js
├── sitio/                    landing, entrar, registro, invitación y panel (HTML + CSS + TypeScript)
│   ├── index.html  entrar.html  registro.html  invitacion.html  verificar.html  recuperar.html  app.html
│   ├── css/sitio.css
│   ├── src/                  TypeScript (un bundle por página)
│   │   ├── comun.ts  dom.ts  tipos.ts (modelos de la API)  recorrido.ts (también lo carga el editor)
│   │   ├── paginas/          landing, cuenta (entrar/registro), verificar, recuperar, invitacion
│   │   └── panel/            index.ts (rutas y clics), estado.ts, piezas.ts, vistas/*, dialogos/*
│   └── js/                   (generado, no está en git)
├── editor/                   el editor 3D (three.js, TypeScript permisivo)
│   ├── index.html
│   ├── css/
│   ├── tsconfig.json
│   ├── js/                   (generado 1:1 desde src/, no está en git)
│   ├── src/                  scripts clásicos que comparten window.OO*; globales.d.ts declara esas globales y THREE
│   │   ├── nucleo/           editor.ts (motor), local.ts (datos: modo local o nube), nube.ts, paneles, geometría…
│   │   ├── construccion/     paredes, habitaciones, huecos, techos, escaleras, plataformas, anclajes…
│   │   ├── catalogo/         catálogo, prefabs, kits de edificios, vegetación
│   │   ├── mapa/             terreno, calco satelital, zonas, mapas nuevos
│   │   ├── apariencia/       materiales, texturas, iluminación, ambiente
│   │   ├── escena/           jerarquía, capas, plano 2D, modo caminar, vistas
│   │   ├── archivos/         importar y exportar (GLB, Godot, Unity, JSON)
│   │   ├── juego/            integración con el juego (mallas reales, carteles, reglas, Unity)
│   │   └── notas/
│   ├── mapas/                mapas base de las plantillas (mapa_complejo.json, mapa_parqueadero.json)
│   ├── LEEME.md              manual del editor
│   └── local/                modo local de un solo usuario (servidor.py, datos_usuario/…), ver LEEME_LOCAL.md
└── docs/ARQUITECTURA.md      decisiones, esquema y flujo de datos
```

## Desarrollo sin Docker

El sitio y el editor están en TypeScript. Se necesita Node 20 o más nuevo:

```bash
npm ci                 # una vez: esbuild y typescript
npm run dev            # compila y vigila sitio/src y editor/src (deja este terminal abierto)
npm run tipos          # comprueba los tipos con tsc (sitio estricto, editor permisivo)
npm run build          # compilación única (la imagen de Docker la hace sola, minificada)

# Postgres local (o: docker compose up db)
cd api && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
DATABASE_URL=postgresql://mapcreator:clave@localhost:5432/mapcreator uvicorn app.main:app --reload
```

El servidor sirve `sitio/` y `editor/` desde las carpetas del repo: con `npm run dev` abierto, los cambios en `.ts`, HTML y CSS se ven
al recargar. El modo local del editor (`editor/local/servidor.py`) también necesita `npm run build` antes de abrirlo.

- **Sitio** (`sitio/src`): TypeScript estricto. Los modelos de la API están en `tipos.ts`: si cambia un endpoint, cámbialo ahí y
  `npm run tipos` dice qué hay que tocar. Cada página carga un solo archivo (`/sitio/js/<página>.js`).
- **Editor** (`editor/src`): los 68 scripts de antes, ahora `.ts`, cargados en orden por `index.html`. Siguen siendo scripts clásicos
  que se hablan por `window.OO*` (declaradas en `globales.d.ts`), con tipos permisivos (`strict: false`). Para tipar un módulo a fondo,
  ve sustituyendo `any` por interfaces a partir de `nucleo/`.

## Pruebas

```bash
python api/pruebas/prueba_api.py http://127.0.0.1:8000     # contra una base de PRUEBA, crea usuarios y proyectos (sin correo)
python api/pruebas/prueba_correo.py http://127.0.0.1:8000 /ruta/buzon   # con OO_CORREO_ARCHIVO=/ruta/buzon en el servidor
python -I editor/local/pruebas/prueba_migrar_refs.py       # modo local: migración de referencias
```

## Pasar los datos del modo local a la web

```bash
docker compose run --rm -v ./editor/local/datos_usuario:/importar:ro app \
    python -m scripts.importar_local --email tu@correo.com --nombre "Complejo (mis cambios)" /importar
```

La cuenta tiene que existir antes (regístrate en la web).

## API

Documentación interactiva en `/api/docs` (OpenAPI). Detalles en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
