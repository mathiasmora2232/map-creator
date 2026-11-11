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
│   │       └── editor_datos.py  /api/db, /api/fotos, /api/assets, /_blob: lo que usa el editor
│   ├── migraciones/          SQL en orden (001_esquema.sql…), se aplican solas al arrancar
│   ├── scripts/importar_local.py   pasa una carpeta datos_usuario del modo local a un proyecto
│   └── pruebas/prueba_api.py       prueba de punta a punta (83 comprobaciones)
├── sitio/                    landing, entrar, registro, invitación y panel (HTML + CSS + JS, sin build)
│   ├── index.html  entrar.html  registro.html  invitacion.html  app.html
│   ├── css/sitio.css
│   └── js/comun.js  cuenta.js  invitacion.js  panel.js  recorrido.js (recorrido guiado, también lo usa el editor)
├── editor/                   el editor 3D (three.js, JS sin build)
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── nucleo/           editor.js (motor), local.js (datos: modo local o nube), nube.js, paneles, geometría…
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

```bash
# Postgres local (o: docker compose up db)
cd api && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
DATABASE_URL=postgresql://mapcreator:clave@localhost:5432/mapcreator uvicorn app.main:app --reload
```

El sitio y el editor se sirven desde las carpetas del repo, así que los cambios en HTML, CSS y JS se ven al recargar.

## Pruebas

```bash
python api/pruebas/prueba_api.py http://127.0.0.1:8000     # contra una base de PRUEBA, crea usuarios y proyectos
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
