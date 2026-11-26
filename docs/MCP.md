# Servidor MCP de Map Creator

Map Creator tiene un servidor [MCP](https://modelcontextprotocol.io) en `https://<servidor>/mcp` (HTTP «streamable», sin estado). Con él,
Claude Code, Claude Desktop, Cursor o cualquier cliente MCP manejan la plataforma: crear y editar mapas, colocar objetos, pedir terreno,
guardar versiones, exportar e importar proyectos y usar la biblioteca. Cada herramienta tiene los mismos permisos que tu cuenta en la web.

## Conectar

1. En el panel: **Cuenta → Conexiones (MCP) → Crear token**. Copia el token (`mc_…`): solo se ve una vez.
2. Según el cliente:

**Claude Code**

```bash
claude mcp add --transport http map-creator https://map-creator.stellarcodestudio.com/mcp \
  --header "Authorization: Bearer mc_…"
```

**Claude Desktop, Cursor, Windsurf…** (los que solo hablan stdio, con el puente `mcp-remote`):

```json
{ "mcpServers": { "map-creator": { "command": "npx",
  "args": ["-y", "mcp-remote", "https://map-creator.stellarcodestudio.com/mcp", "--header", "Authorization: Bearer mc_…"] } } }
```

**ChatGPT y los conectores web de Claude.ai** piden OAuth para servidores remotos: todavía no está (de momento, token en cabecera).

Los tokens se revocan en la misma pestaña y dejan de funcionar al momento. El mismo token sirve para la API REST
(`Authorization: Bearer mc_…`), pero no para crear más tokens.

## Herramientas

| Grupo | Herramientas |
|---|---|
| Cuenta | `quien_soy` |
| Proyectos | `listar_proyectos`, `crear_proyecto` (en blanco con relieve, desde plantilla o desde un mapa de la biblioteca), `ver_proyecto`, `renombrar_proyecto`, `duplicar_proyecto`, `mover_a_papelera` |
| Mapa | `buscar_catalogo`, `listar_objetos`, `colocar_objetos`, `crear_paredes`, `editar_objetos`, `borrar_objetos`, `generar_terreno` |
| Versiones | `guardar_version`, `listar_versiones`, `restaurar_version` (guarda antes una automática) |
| Intercambio | `exportar_proyecto` (JSON «map-creator-proyecto»; si es grande, URL de descarga), `importar_proyecto` |
| Biblioteca | `buscar_biblioteca` (assets o mapas), `crear_modelo` (diseña un modelo 3D con piezas: caja, cilindro, cono, esfera, cúpula, prisma; GLB y miniatura en el servidor), `subir_asset` (GLB por URL https o base64), `anadir_asset_a_proyecto`, `editar_asset` (publicar, nombre…), `publicar_asset_de_proyecto`, `publicar_mapa` |

Coordenadas en metros: X hacia el este, Z hacia el sur, Y es la altura; giro en grados alrededor de Y.

### Lo que hace el editor del navegador

El terreno procedural y las exportaciones 3D (GLB, Unity, Godot) los calcula el motor del editor (three.js y Rust/WebAssembly):

- `generar_terreno` deja la petición en `terreno/gen-<mapa>`. Se genera en cuanto alguien con permiso de edición abre el mapa, o al momento si ya está abierto (antes guarda una versión automática).
- Los objetos que crea o cambia el MCP aparecen al momento en un editor abierto en ese proyecto.
- Para un GLB o un .zip de Unity, abre el enlace `editor` que devuelven las herramientas y usa **Exportar**.

## Asistente del panel

El panel tiene un chat (**Asistente IA**, `#asistente`) que usa estas mismas herramientas (menos `exportar_proyecto`, `importar_proyecto`
y `subir_asset`) con la sesión del usuario: `POST /api/asistente` (en `api/app/rutas/asistente.py`) hace una vuelta (Claude + herramientas
ejecutadas en el servidor) y el navegador repite mientras haga falta. Necesita `CLAUDE_API`/`ANTHROPIC_API_KEY`, como el asistente del editor,
que también tiene `crear_modelo` (por `POST /api/biblioteca/modelos`).

## Biblioteca

- **Mapas**: las plantillas (del sistema y las publicadas). `publicar_mapa` publica el mapa de un proyecto; `crear_proyecto(plantilla=<id>)` crea uno desde él.
- **Assets**: modelos GLB. Al subirlos son privados; `editar_asset(publicar=true)` los publica para todo el servidor. `anadir_asset_a_proyecto` los copia al proyecto (catálogo del editor → Importados → Biblioteca) y devuelve el tipo `modelo:<id>` para `colocar_objetos`.
- **Assets del sistema**: cada `.glb` de `api/biblioteca/` (o `OO_DIR_BIBLIOTECA`) se publica al arrancar. Para hacer crecer la biblioteca, añade modelos ahí (con un `.json` opcional de metadatos, ver `api/biblioteca/LEEME.md`) y reinicia.

## Implementación

- `api/app/mcp_servidor.py`: el servidor (`mcp` 2.3, `MCPServer`), montado en `/mcp` dentro de FastAPI; el verificador de tokens usa `tokens_api`.
- `api/app/plataforma.py`: las operaciones sobre los datos (mismo formato de documentos que el editor; cada escritura sube la versión de la colección para que un editor abierto la vea).
- `api/app/rutas/biblioteca.py`, `tokens.py`, `intercambio.py`: biblioteca, tokens y exportar/importar por REST.
- `api/migraciones/007_mcp_biblioteca.sql`: tablas `tokens_api` y `biblioteca_assets`.
- El catálogo lo extrae `scripts/catalogo.mjs` en el build (`editor/js/catalogo_items.json`).
- Prueba: `api/pruebas/prueba_mcp.py` (42 comprobaciones con el cliente MCP oficial; ver su cabecera para lanzarla).
