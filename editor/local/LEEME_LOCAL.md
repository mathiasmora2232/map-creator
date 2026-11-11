# Modo local del editor (Operación Oficina)

Es el editor tal como funciona en el repo del juego: un solo usuario, sin cuentas, con los datos en archivos JSON. La versión web
multiusuario (Map Creator) usa el mismo editor (`editor/index.html`, `css/`, `js/`, `mapas/`) pero guarda en PostgreSQL a través de la API
(`api/`). Ver el `README.md` de la raíz.

- **`servidor.py`**: servidor local en http://127.0.0.1:7791/. Sirve la carpeta `editor/` y guarda en `datos_usuario/`.
- **`migrar_refs.py`, `verificar_refs.py`**: migración y comprobación de las referencias a piezas cuando el juego regenera
  `mapas/mapa_<mapa>.json`.
- **`enviar_al_juego.mjs`**: escribe los cambios en el proyecto de Unity sin abrir el navegador.
- **`datos_usuario/`**: mis ediciones reales (cambios, versiones, grupos, capas, terreno, calcos, materiales y `sin_pieza.json`, los
  cambios apartados porque su pieza ya no existe). Los respaldos automáticos de la migración (`respaldos_refs/`) no se suben.
- **`al_juego/`**: lo que el editor manda al juego (`Resources/EditorMapa/cambios_complejo.json` y `Resources/Carteles/`).
- **`pruebas/`**: `prueba_migrar_refs.py` (levanta un servidor de prueba con datos aparte) y `prueba_editor_pro.mjs` (Edge sin ventana).

El código sale de `herramientas/editor_mapa/` del repo del juego (rama `version-2.1.0`, mapa de la 2.1.8). `../LEEME.md` es el manual
del editor.

## Abrirlo
```
python editor/local/servidor.py
```
(o `abrir_editor.bat`). Las funciones que tocan el juego (mallas reales, exportar mapas, «Enviar al juego») buscan el repo del juego
dos carpetas por encima de `editor/`, o en `OO_REPO_JUEGO`. Antes de enviar algo al juego,
`python editor/local/verificar_refs.py editor/local/datos_usuario --mapa complejo` tiene que terminar en «BIEN».

## Pasar estos datos a la versión web
```
docker compose run --rm -v ./editor/local/datos_usuario:/importar:ro app \
    python -m scripts.importar_local --email tu@correo.com --nombre "Complejo (mis cambios)" /importar
```
