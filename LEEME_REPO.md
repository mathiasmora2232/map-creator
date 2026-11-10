# Editor del mapa de Operación Oficina (copia personal de Matías)

Copia privada del editor web del mapa y de mis datos reales del editor (9/11/2026).

- **El código del editor** (`*.js`, `index.html`, `servidor.py`, `migrar_refs.py`, `verificar_refs.py`, `enviar_al_juego.mjs`…) sale de
  `herramientas/editor_mapa/` del repo del juego (rama `version-2.1.0`, mapa de la 2.1.8). `LEEME.md` es su manual.
- **`mapa_complejo.json` y `mapa_parqueadero.json`**: los mapas que exporta el juego (en el repo del juego no se versionan).
- **`datos_usuario/`**: mis ediciones reales (cambios, versiones, grupos, capas, terreno, calcos, materiales y `sin_pieza.json`, los
  cambios apartados porque su pieza ya no existe). Hasta ahora solo vivían en una carpeta temporal de Windows. Los respaldos automáticos
  de la migración (`respaldos_refs/`) no se suben.
- **`al_juego/`**: lo que el editor manda al juego (`Resources/EditorMapa/cambios_complejo.json` y `Resources/Carteles/`).

## Abrirlo
`abrir_editor.bat`, o `python servidor.py` en esta carpeta (usa `datos_usuario/` de aquí). Antes de enviar algo al juego:
`python verificar_refs.py datos_usuario --mapa complejo` tiene que terminar en «BIEN».
