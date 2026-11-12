# Editor del mapa: carteles, textos y puertas (2.1)

## Abrir el editor
`abrir_editor.bat` (o `python -I herramientas/editor_mapa/servidor.py`) y se abre http://127.0.0.1:7791/.
La vista 3D carga las **mallas reales del juego**: puertas con tableros, manijas y bisagras, coches, sillas y objetos. Antes se veían
como cajas. Las mallas salen de `unity/Assets/Resources/OperacionOficina/<Mapa>/Mallas` y el servidor las manda en `/_mallas/<mapa>`.
Si faltan (no se ha exportado el mapa desde Godot), se ven las cajas de antes.

## Poner un cartel o un texto
1. Catálogo → **Señalización**. Hay un cartel genérico, señales de salida, extintor, baño (azul, como el de las fotos), peligro, flecha,
   un cartel de pie y letras sueltas en la pared.
2. Haz clic donde quieras ponerlo y gíralo con el gizmo («Girar») para que mire hacia donde se lee. El texto mira a +Z del objeto.
3. En el panel de la derecha se cambia todo:
   - **Texto**: Enter hace otra línea.
   - **Señal o pictograma**: salida, salida a izquierda o derecha, punto de encuentro, primeros auxilios, extintor, baño hombres,
     mujeres o mixto, peligro, riesgo eléctrico, montacargas, prohibido y flechas.
   - **Alto de letra**: en metros. Es el alto de las mayúsculas; el cartel mide lo que pida el texto.
   - **Color del texto**, **color del fondo**, **borde** (cm) y **color del borde**.
   - **Placa**: con placa o sin placa (letras sueltas con borde oscuro, como pintadas en la pared).
   - **Alineación**.
   - **Montaje**: en la pared (pegado, 1 cm), de pie (con postes, se lee por las dos caras) o colgado del techo.
   - **Altura del centro**: en metros desde el suelo.
4. Se guarda solo, como el resto de cambios (`datos_usuario/cambios.json`).

## Llevarlo al juego
Cada vez que cambian los carteles del mapa abierto, el editor manda la imagen de cada cartel (la misma que ves) y su sitio al
servidor. El servidor los guarda en:
- `unity/Assets/OperacionOficina/Resources/Carteles/carteles_<mapa>.json`: sitio, giro, medidas, placa y postes, en coordenadas de
  Unity.
- `unity/Assets/OperacionOficina/Resources/Carteles/<Mapa>/<id>.bytes`: la imagen en PNG. Va con extensión `.bytes` para que Unity no
  la comprima.

Después **compila el juego**. Desde Unity: menú **Operación Oficina → Compilar juego (Windows)**. Desde la consola:
```
"C:\Program Files\Unity\Hub\Editor\6000.6.7f1\Editor\Unity.exe" -batchmode -projectPath unity -executeMethod OperacionOficina.Editor.MenuMapas.CompilarJuego -quit -logFile build.log
```
Al cargar el mapa, `Carteles.CrearDelEditor` (en `unity/Assets/OperacionOficina/Carteles.cs`) los pone con mipmaps y sin
parpadeo contra la pared. No hace falta volver a exportar el mapa desde Godot.

Notas:
- Hay que tener abierto en el editor el mapa de los carteles (Complejo o Parqueadero): se envían los del mapa abierto.
- Para quitar un cartel del juego, bórralo en el editor. Al abrirse, el editor no borra nada hasta que se carguen los cambios.
- La inclinación en X y Z del cartel no se lleva al juego: allí solo cuenta el giro en Y.
- En el juego los carteles no tienen colisión. Los postes de un cartel de pie sí la tienen.

## Letreros que ya tenía el mapa
Los textos del mapa (los Label3D de Godot: AUDITORÍA, SISTEMAS, BAÑO…) se dibujan con su tamaño real y nítidos, tanto en el editor
(`carteles.js`, `letrero`) como en el juego (`Carteles.DesdeTextMesh`). Usan las mismas reglas:
- los de baño llevan placa azul;
- los de salida o evacuación llevan placa verde;
- los que están sobre una pared son letras claras con borde oscuro;
- los que flotan sin nada detrás llevan una placa oscura.

## Puertas
- Con la herramienta **Puerta**, el campo **Tipo de puerta** elige entre: metálica de oficina con marco, vidrio con perfil de aluminio,
  baño gris con letrero azul, madera, corrediza de vidrio (comedor), portón o reja metálica, persiana enrollable de galpón y hoja simple.
- Las puertas del juego se ven en el editor con su malla real.
- Las puertas que se ponen en el editor todavía no pasan al juego. Solo pasan los carteles.

# Editor v2 (2.1): disposición nueva, zonas, prefabs, plano 2D y exportar

## Dónde está cada cosa
- **Barra superior**: mapa, 3D / Planta / Caminar / **Plano 2D**, botón **2D / 3D** (alterna al momento), deshacer, estado, atajos,
  ajustes, tema claro u oscuro, **paneles** (mostrar, ocultar y «Restablecer disposición») y el botón naranja **Exportar** (también importa).
- **Barra de la izquierda**: cada botón abre un menú con sus herramientas (Construir: pared, habitación, puerta, ventana, techo…;
  Terreno: suelos; Medir; Guías; **Zonas**; Notas). Otros archivos añaden menús con `OOEditor.agregarMenu({id, n, ic, items})`.
- **Paneles** (se arrastran por la cabecera a otra columna, se pliegan, se cierran y cambian de tamaño desde el borde; se guarda en el
  navegador): Jerarquía, Capas, Mini-mapa (izquierda); Inspector y Recursos (derecha); Catálogo (abajo); Zonas (se abre desde su menú).
- **Inspector**: pestañas Objeto (nombre, tipo, capa, transformación con escala por factor y candado, propiedades), Material,
  Iluminación y Más (comportamientos).
- **Vista**: barra flotante (seleccionar, mover, girar, escalar, encuadrar, imán), sol (ambiente: hora, orientación, clima),
  corte por altura, rejilla, capas; abajo escala gráfica, grilla, snap, colisiones, ejes y coordenadas.
- **Calco satelital**: Recursos → Referencias → «Mapa satelital (elegir en el mapa)»: mapa navegable con buscador; «Calcar esta zona».

## Plano 2D
Botón «Plano 2D» o «2D / 3D». Es la planta con aspecto de plano: paredes rellenas con su cota, habitaciones con nombre y área, puertas
con barrido, ventanas y la silueta de los objetos. Se dibuja con las mismas herramientas (Construir y el catálogo), así que todo se ve
también en 3D y en Caminar. Mientras se dibuja una pared se puede **escribir el largo** (p. ej. `4,5` y Enter): el tramo va hacia el
ratón. Las puertas y ventanas también se ponen desde arriba (clic sobre la pared).

### Plano 2D 2.1: ligero, legible, símbolos, cuartos, capas y mapa nuevo
- **Ligero** (`planner2d.js`): la geometría quieta se dibuja una vez en un lienzo aparte con margen; al desplazar se copia y al hacer
  zoom se estira y se rehace 110 ms después. Un trazado por estilo (no uno por pieza), índice por celdas de 24 m y nada de menos de
  1,5 px. Con el Complejo y los datos del usuario (21 556 piezas, 421 objetos): de ~40 900 llamadas de dibujo por cuadro a menos de 100.
- **Textos**: tamaño fijo en pantalla; se colocan por prioridad y el que choca con otro no se dibuja. De lejos, zonas y edificios; de
  cerca, nombres de habitaciones (y su área cuando caben). Cotas de las paredes solo de cerca o de lo elegido.
- **Etiquetas de zonas y edificios**: secciones del mapa, edificios del Complejo (galpones 1–5, nave blanca, administración, comedor,
  bar y enfermería, parqueadero, callejón, casetas, tendales; posiciones de `scripts/mapa_complejo.gd`), letreros del mapa con nombre de
  sitio y las propias (Construir → **Etiqueta de zona**). **Doble clic** en una etiqueta: renombrar u ocultar. Colección `etiquetas`.
- **Objetos**: contorno real orientado y símbolo por tipo (coche, escritorio o mesa, silla, estantería, tarima, caja, contenedor, barril,
  extintor, escalera, árbol, planta, equipo, luz). Un objeto automático del mapa o un objeto nuevo de varias piezas va como uno solo.
  Las placas pegadas a la pared no se dibujan y lo que cuelga por encima de 2 m va como contorno discontinuo (capa de techos).
- **Elegir en el plano**: manda lo que se ve encima (aberturas > objetos > paredes > habitaciones > pisos); los techos no tapan el clic y
  el suelo enorme del mapa no se coge. Las asas, el gizmo y las vistas previas se ven encima del plano (el lienzo se multiplica).
- **Barra de abajo**: `Objetos` (Alt+O) y `Nombres` (Alt+L) del plano, `Cotas` (de cerca → todas → ninguna); `Techos` (Alt+T) y
  `Paredes` (enteras → a media altura, 1,2 m → ocultas; Alt+W) también en 3D (`capas_vista.js`). Se recuerda en el navegador.
- **Cuartos** (`cuartos_pro.js` y el detector de `editor.js`): cerrar 4 paredes crea la habitación aunque los extremos no coincidan
  (15 cm de tolerancia), con paredes que acaban en mitad de otra o que se pasan; solo cuentan los recintos que toca la pared nueva y
  nunca un anillo que encierra otras paredes ni uno que engloba otra habitación. **Asas verdes** en las esquinas (mueven solo ese vértice)
  y Construir → **Mover un tramo de pared**: clic donde empieza, clic donde acaba y mover (o escribir la medida y Enter); la pared se
  parte, se mueve solo ese trozo y se añaden las dos paredes cortas del escalón (un paso de deshacer).
- **Nuevo mapa** (`mapas_nuevos.js`): selector de mapa → «＋ Nuevo mapa…»: nombre, ancho, fondo y terreno (césped, tierra, concreto o
  asfalto). Colección `mapas`, id `u-<nombre>`; sus cambios llevan `mapa: 'u-…'` y no tocan el Complejo. El suelo base queda bloqueado.
  Todavía no se juega en Unity.

## Zonas
Herramienta Zonas: rectángulo (arrastrar) o polígono (clic por esquina, clic en el primer punto o «Cerrar zona»). En el panel Zonas:
nombre, color, seleccionar lo que contiene, encuadrar, **ocultar**, **aislar**, **replicar** (clic donde va la copia), crear prefab y
exportar solo esa zona (GLB, Godot, JSON). Se guardan en `datos_usuario/zonas.json` (`{mapa, nombre, puntos: [[x, z]…], color, oculta, aislada}`).

## Prefabs
«Crear prefab» con la selección (inspector o menú Modelar). Sale en el catálogo, en «Mis prefabs». Las copias guardan `datos.prefab`
con el id del prefab. «Actualizar el prefab…» lo cambia por la selección y ofrece actualizar todas las copias o desvincularlas. Botón
derecho en la tarjeta: colocar, renombrar, actualizar, seleccionar copias, exportar y borrar. Se guardan en `componentes.json`.

## Modelos y texturas importados
Exportar → Importar → «Modelo 3D al catálogo (.glb)» o «Textura». El archivo va a `referencias/assets_editor/` y su ficha a
`datos_usuario/assets.json`. Los modelos salen en el catálogo (Importados) y se colocan como objetos `modelo:<id>`.

## Exportar
| Opción | Archivos | Para qué |
|---|---|---|
| Todo el mapa / selección / zona (.glb) | `.glb` | Cualquier motor (glTF 2.0) |
| Godot 4.4 | `.glb` + `.tscn` | Abrir directamente en Godot |
| Unity | `.glb` + `_escena.json` + `LEEME_unity.txt` | Unity con glTFast o UnityGLTF |
| Escena del juego | `_escena.json` (`oo-escena`) | Reconstruir objetos, importar zonas |
| Cambios para el juego | `cambios_juego_<mapa>_<fecha>.json` (`oo-cambios-juego`) | Aplicarlos a los generadores |

**Coordenadas**: las del juego en Godot (X este, Y arriba, Z sur, metros). En Unity: `x = X, y = Y, z = −Z` y el cuaternión `(−qx, −qy, qz, qw)`.

**GLB**: nodos `<Mapa>/<Sección>/<Objeto>/piezas`, `Objetos_nuevos/<capa>/<objeto>` y `Luces` (luces puntuales KHR_lights_punctual).
Las piezas del juego llevan su malla real; las demás cajas, cilindros y esferas. Los nodos de objeto llevan en `extras`
(`userData`): `oo_refs` (índices de pieza) u `oo_key`, `oo_doc` (tipo y datos del objeto nuevo), `nombre`, `etiqueta`, `colision`,
`recibe_sombras`, `proyecta_sombras`, `material` y `comportamientos`. Las piezas que solo son colisión acaban en `-colonly`
(Godot las convierte en colisión al importar).

**Godot (.tscn)**: raíz `Node3D` con `metadata/oo_mapa`; `Modelo` instancia el .glb (misma carpeta); `Colisiones` tiene un
`StaticBody3D` con `CollisionShape3D` (caja o cilindro) por pieza con colisión (`metadata/oo_ref`); `Comportamientos` tiene un
`Marker3D` por objeto con comportamientos, con `metadata/oo_comportamientos` (JSON), `oo_claves` y `oo_tamano`. Probado con Godot 4.4.1.

**`oo-escena` (versión 1)**: `{formato, version, mapa, generado, unidades, coordenadas, zona, materiales, objetos[], luces[]}`. Cada
objeto: `id`, `nombre`, `origen` (`mapa` o `nuevo`), `tipo`, `seccion` o `capa`, `refs`, `posicion`, `rotacion` (cuaternión),
`tamano`, `props`, `comportamientos`; los del mapa traen `piezas[]` (`forma` caja/cilindro/esfera/malla/texto, `malla`, `pos` relativa
al objeto, `quat`, `escala`, `color`, `transparente`, `colision`, `solo_colision`) y los nuevos `doc` (`tipo`, `datos` tal como los guarda
el editor). Importar una escena crea objetos nuevos editables en una capa «Importado …», centrados donde mira la cámara.

**`oo-cambios-juego` (versión 1)**, pensado para un aplicador en `scripts/mapa_complejo.gd` / `mapa_parqueadero.gd` o en el
constructor de Unity:
- `piezas_modificadas[]`: `ref` (índice en `mapa_<mapa>.json`, mismo orden que genera `herramientas/exportar_mapa_web.py`), `seccion`,
  `grupo`, `nombre`, `malla`, `original` (`pos`, `escala`) para volver a encontrar la pieza si el mapa cambia, y lo nuevo: `pos`,
  `quat`, `giroY`, `tam`, `color`, `material`.
- `piezas_borradas[]`: mismas claves de identificación.
- `objetos_nuevos[]`: `id`, `tipo` (`muro`, `habitacion`, `puerta`, `ventana`, `techo`, `calle`, `objeto:<catálogo>`, `coche`,
  `copia`, `modelo:<asset>`…), `capa`, `datos` (como en `cambios.json`: en los nuevos `x, y, z` es el punto de apoyo en el suelo),
  `props`, `comportamientos`.
- `propiedades[]` (`refs`, `props`), `notas[]`, `zonas[]`, `materiales[]`.

**Importar GLB/GLTF**: Exportar → Importar → «Escena o zona». Cada nodo de objeto pasa a ser un objeto editable (`modelo:<asset>`
con `datos.nodo`); los objetos nuevos exportados por este editor vuelven como lo que eran (pared, habitación…) gracias a `oo_doc`.

## Materiales (pestaña Material)
Selecciona algo y elige: **Mis materiales** (propios), **Catálogo** (como la herramienta Pintar) o **Materiales del mapa** (los del juego,
por color). «Nuevo» crea un material con color, textura importada, rugosidad, metal, emisión, opacidad y escala UV (repeticiones por cara).
Se guardan en `materiales.json` y se asignan con `props.material = "u:<id>"` (con deshacer). En el GLB salen como materiales PBR; en
los JSON, en `materiales[]`. Las sombras por objeto (Propiedades: recibe / proyecta) también se respetan en la vista.

## Iluminación (pestaña Iluminación)
«Añadir luz puntual» o «Añadir foco» crea un objeto `luz` donde mira la cámara. Datos: `tipoLuz` (`puntual` o `foco`), `color`,
`intensidad`, `alcance`, `altura`, `angulo` y `inclinacion` (foco), `sombras`, `encendida`. En la vista se encienden las 12 más cercanas
(4 con sombra); «Encender las luces del mapa original» añade las del juego. Se aprecian de tarde o de noche (botón del sol).

## Comportamientos (pestaña Más)
Se guardan en `props.comportamientos` del objeto: una lista de `{tipo, ...parámetros}`.
| tipo | parámetros |
|---|---|
| `puerta` | `modo` (simple, doble, corrediza, enrollable, basculante), `hojas` (conjunto o individual), `bisagra`, `sentido` (adentro, afuera, ambos), `angulo`, `recorrido`, `tiempo`, `empieza_abierta`, `con_llave`, `automatica` |
| `coche` | `conducible`, `velocidad_max` (km/h), `aceleracion`, `asientos`, `vida`, `color_aleatorio`, `bocina` |
| `rompible` | `vida`, `material` (madera, vidrio, metal, concreto, plastico, botella), `destructible`, `explota`, `reaparece_s` |
| `interactuable` | `accion`, `texto`, `tecla`, `distancia`, `evento` |
| `luz_interruptor` | `grupo`, `radio`, `encendida`, `texto` |
| `aparicion` | `equipo`, `radio`, `max`, `modos`, `orientacion` |
| `sonido` | `archivo`, `volumen`, `alcance`, `bucle`, `al_entrar`, `aleatorio_s` |

**Cómo los leería Godot 4.4**: en el `.tscn` exportado, cada objeto con comportamientos tiene un `Marker3D` bajo `Comportamientos` con
`get_meta("oo_comportamientos")` (texto JSON: `JSON.parse_string(...)`), `oo_claves` y `oo_tamano`. Un script de importación recorre esos
nodos y, según `tipo`, añade la escena del juego (p. ej. la puerta de `scripts/` con su ángulo y sentido, un `VehicleBody3D`, un
`Area3D` de aparición o un `AudioStreamPlayer3D`). Al importar el .glb, Godot guarda los `extras` del nodo en sus metadatos (`extras`),
así que también se pueden leer directamente del modelo.
**Cómo los leería Unity**: con el `_escena.json` (fiable con cualquier importador): para cada objeto, buscar el GameObject por nombre e
ir añadiendo componentes según `comportamientos[].tipo` (`HingeJoint`/script de puerta, `WheelCollider`/script de coche, `AudioSource`…).
Con UnityGLTF también se pueden leer los `extras` en un plugin de importación. La importación en el juego queda para después.

## Terreno (menú Terreno de la barra)
Pintar suelo (pincel o polígono), subir, bajar, aplanar a una altura (Alt+clic toma la altura del terreno), suavizar, zanja o hueco y
rampa o talud (dos clics; alturas de inicio y fin opcionales). Es una rejilla de alturas alrededor del mapa que se crea al usarla y solo se
ve donde se ha tocado. Se guarda en `terreno.json` (`x0, z0, paso, nx, nz`, `alturas` en cm como Int16 en base64, `pintura` como índices
de `paleta`, 255 = sin tocar). El polígono crea un objeto suelo editable (habitación con `suelo: true`). «Deshacer trazo» deshace en el
terreno (no usa Ctrl+Z). Exportar → «Terreno: alturas» descarga un PNG de 8 bits, un RAW de 16 bits cuadrado (129/257/513/1025, para
Unity: Terrain → Import Raw, Windows) y un JSON con `altura_min`, `altura_max` y `lado_m`. Al exportar todo el mapa, el GLB lleva la
malla «Terreno» y el JSON de escena y el de cambios para el juego llevan `terreno`.

## Muros con preset, vanos de puertas y ventanas, y huecos propios (2.1)
- **Construir → Muro exterior (como el del juego)**: la herramienta Pared con el preset `exterior` (también se elige en el panel de la
  herramienta, «Tipo de muro»). Cada tramo es un objeto `muro` con `datos.preset = "exterior"`: cuerpo de 3,6 × 0,5 m (`#ecebe4`, el
  Liso_Ecebe4 del perímetro), zócalo de 0,6 m (`#aaa69a`), franja azul de 0,48 m arriba (`#466879`), franja verde de 0,1 m con centro a
  2,98 m (`#83ad93`), las franjas de 5 cm de grueso en las dos caras, juntas verticales cada 2,5 m y albardilla de concreto de 0,7 × 0,1 m.
  Medidas sacadas de `scripts/mapa_parqueadero.gd` (muro perimetral y `_muro_diagonal`) y de la sección Perimetro de `mapa_complejo.json`.
  Se encadenan tramos con clics (también en diagonal), con cotas en vivo y largo tecleado, igual que la Pared. Otros presets:
  `tabique` (10 cm con zócalo), `bloque`, `malla` (valla de malla con postes) y `reja`. Las piezas las dibuja `presets_muro.js`; las
  puertas, ventanas y huecos también cortan las franjas y remates.
- **Puertas y ventanas originales** (`huecos.js`): el editor busca en el mapa los marcos que deja `muro(...)` de `scripts/mapa.gd`
  (cabecero de 7 cm entre dos jambas, alféizar en las ventanas) y, sin marco, los trozos de pared a los lados y encima de cada puerta.
  Cada vano conoce su marco, lo que tiene dentro (hoja y grupo `puerta:…`, vidrio, rejas, colisiones) y la pared que lo rodea. Un clic
  en la puerta o la ventana la coge entera (sin la pared). Al borrarla se borra el vano entero y, en el mismo paso de deshacer, se crea un
  `muro` de relleno con el color, el material, el grosor y la altura de la pared de al lado, que ocupa todo el vano (jambas, dintel y
  alféizar). Lleva `datos.relleno = {vano, tipo: "puerta"|"ventana", refs: [...]}` y sale en `cambios_juego` como objeto nuevo. Si las
  piezas vuelven (Ctrl+Z o revertir el borrado), el relleno se oculta. Las puertas y ventanas nuevas no necesitan relleno: al quitarlas
  la pared ya queda entera.
- **Construir → Hueco en pared** (tecla O): clic en la cara de una pared nueva u original. Crea un objeto `hueco` con `muro` (id de la
  pared nueva o índice de la pieza original), `sx` (ancho), `sy` (alto) y `alfeizar` (altura desde el suelo); usa los mismos cortes que
  las puertas. Se mueve con el gizmo y vuelve solo a la línea de su pared; las medidas se cambian en el inspector. Dentro se puede poner
  luego una puerta o una ventana (clic dentro del hueco). Si se borra, la pared queda entera. El borde naranja no se exporta.

## Reglas de destrucción (2.1)
Objetos → **Reglas de destrucción** (también desde el inspector, pestaña **Más**, sección «Destrucción»). Lo hace `destruccion.js`.
- **Reglas por tipo**: cada una tiene un filtro y propiedades. Filtro: `malla` (nombre de la malla, del grupo del mapa o del objeto
  automático: silla, monitor, tarima…), `material`, `seccion`, `tipo` (`pieza`, `puerta`, `ventana`, `tabique`, `suelo`, `muro`,
  `muro_exterior`, `coche`, o el tipo de un objeto nuevo) y `categoria` (catálogo). Cada lista que tenga algo tiene que coincidir con
  alguno de sus textos (sin mayúsculas, vale una parte del nombre); las listas vacías no filtran. **Gana la primera regla que coincide**
  (flechas para reordenar). Propiedades: `destructible`, `vida`, `modo` (`romper`, `volcar`, `vidrio`, `arrancar`, `ninguno`), `fisica`,
  `masa` (kg), `escombro` (`madera`, `metal`, `vidrio`, `yeso`, `plastico`, `concreto`) y `sonido`. Trae reglas por defecto (coches,
  suelo, muros exteriores y columnas indestructibles; ventanas, vidrios, puertas, sillas, escritorios, monitores, archivadores,
  estanterías, cajas, palés, barriles, tabiques, techo falso y objetos de oficina destructibles). Mientras el mapa no tenga reglas
  propias se usan esas; al cambiar cualquiera se guardan todas en `datos_usuario/reglas.json` (sin Ctrl+Z; «Restaurar por defecto»).
- **Excepción por objeto**: con algo elegido, «Este objeto»: según la regla, forzar destructible (con su vida, modo, física, masa,
  escombro y sonido) o forzar indestructible. Se guarda en `props.destruccion` del objeto (con Ctrl+Z).
- **Teñir la vista**: naranja lo destructible, gris lo indestructible, sin tinte lo que no cubre ninguna regla.
- **Al juego**, como los carteles: al cambiar una regla o una excepción (y con «Enviar al juego») el servidor escribe
  `unity/Assets/OperacionOficina/Resources/Reglas/reglas_<mapa>.json` (con `OO_REGLAS_UNITY` se cambia la carpeta, para pruebas):
```
{"version": 1, "mapa": "complejo",
 "reglas": [{"id", "nombre", "filtro": {"malla": [...], "material": [...], "seccion": [...], "tipo": [...]},
             "destructible": true, "vida": 60, "modo": "romper|volcar|vidrio|arrancar|ninguno", "fisica": true, "masa": 8,
             "escombro": "madera", "sonido": ""}],
 "objetos": [{"pos": [x, y, z], "tam": [sx, sy, sz], "malla": "silla", "destructible": true, "vida": 99, "modo": "romper",
              "fisica": true, "masa": 6, "escombro": "plastico", "sonido": ""}]}
```
  Coordenadas de Unity, las del JSON del mapa (`z` = −z del editor). `objetos` son las excepciones de piezas del mapa: `pos` es el centro
  y `tam` el tamaño de la caja (alineada a los ejes) de sus piezas en su sitio original, para que Unity las encuentre por posición y
  tamaño. El filtro solo lleva `categoria` si la regla la usa (los objetos del mapa no tienen categoría). Las excepciones de objetos
  nuevos del editor no se envían (todavía no pasan al juego).

# Map Editor Pro, fases 1 y 2 (2.1)
Especificación en `docs/editor_mapa/ESPEC_MAP_EDITOR_PRO.md`; auditoría y plan técnico en `docs/editor_mapa/AUDITORIA_EDITOR.md`.

## Dónde está cada herramienta
- **Construir → Fundación (rectángulo)** y **Fundación (polígono)** (`fundaciones.js`). Con la fundación elegida: flecha verde encima
  para subirla o bajarla arrastrando, y en el inspector la sección **Fundación** (botones 0 / 0,5 / 1 / 1,5 m, elevación, espesor,
  medidas, base maciza o con pilotes, borde recto, con bordillo o con moldura, material y color de arriba y de los lados).
- **Construir → Piso (rectángulo)** y **Agujero en piso** (`habitaciones.js`). **Construir → Dividir pared** (`paredes.js`).
- **Paredes**: al elegir una salen bolas azules en sus extremos para estirarla (las paredes unidas la siguen). Inspector →
  **Pared paramétrica**: inicio y fin, curvatura, dividir aquí o en el centro, partir en los cruces. Con dos paredes elegidas: **Unir**.
- **Habitaciones**: bolas naranjas en el centro de cada lado para estirarla. Inspector → **Habitación: medidas y piso**: lados, área,
  ancho y fondo exactos (rectangulares), elevación y grosor del piso, agujeros. «Alto de paredes» cambia también sus paredes y su techo.
- **Soporte y anclaje** (inspector, cualquier objeto nuevo): en qué se apoya (automático, libre, terreno o un soporte concreto), cuántos
  objetos tiene encima y botones para seleccionarlos.
- **Imán y selección**: botón del imán arriba a la derecha de la vista. A qué se imanta (rejilla, extremos, medios, ejes, guías,
  superficies), colocación libre, partir paredes en los cruces, qué se puede seleccionar, líneas de anclaje y revisión de anclajes.
- **Fantasma de colocación**: verde si vale, rojo si choca, amarillo si queda medio fuera de su soporte o debajo de una plataforma.
  La etiqueta dice en qué se va a apoyar.

## Formato (esquema 2)
- Los documentos nuevos o editados llevan `esquema: 2`. Los viejos (sin `esquema`) se leen como v2 sin reescribirlos (`entidades.js`).
- `datos.soporte` (anclaje, `anclajes.js`):
  `{tipo: 'fundacion' | 'piso' | 'pared' | 'techo', id: <id_objeto del soporte>, rel: {x, y, z, g}, auto: true | manual: true}`,
  `{tipo: 'terreno', manual: true, rel: {y}}` o `{tipo: 'libre'}`. Sin `soporte`: automático. `rel` es la posición y el giro en el marco
  del soporte (origen en la cara de arriba de la fundación, en `y + elevacion` del piso, en la base del techo; giro del soporte). Las
  puertas, ventanas y huecos con `datos.muro` (id de una pared nueva) llevan `{tipo: 'pared', id}`. La posición absoluta (`x, y, z,
  giroY`) se sigue guardando y es la que usan los exportadores y el juego.
- `fundacion`: `x, y` (suelo), `z`, `giroY`, `forma` (`rect` o `poligono` con `puntos` locales), `sx`, `sz`, `elevacion` (= `sy`), `espesor`,
  `base` (`macizo` o `losa`), `borde` (`recto`, `bordillo`, `moldura`), `matSup`, `colorSup`, `matLat`, `colorLat`, `area`.
- `habitacion`: además `elevacion` (sube el piso sobre `y`), `grosor` (3 cm por defecto) y `agujeros` (`[[[x, z]…]…]` locales).
  Un piso suelto es una habitación con `suelo: true`.
- `muro`: además `curva` (flecha del arco en metros; 0 = recta). Las paredes curvas no abren huecos.
- `datos.nivel` y `datos.edificio`: planta y edificio del objeto (fase 3, ver abajo).

## Cómo se mueve lo anclado
`guardar()` llama a `OOAnclajes.propagar()`: lo que depende de lo que cambia se recalcula desde su `rel` (sin acumular errores), una
sola vez cada uno y en el mismo paso de deshacer. Al elevar una fundación suben sus paredes, pisos, puertas, ventanas y muebles sin
cambiar su altura; lo que no está anclado (carreteras, árboles…) no se mueve. Lo que ya estaba encima sin anclar (documentos viejos o
una fundación puesta debajo de algo hecho antes) se ancla la primera vez que la fundación se mueve. Al cambiar una pared, sus puertas
conservan la distancia al extremo que no se movió y no salen de ella; si no caben, se estrechan y se avisa. Al borrar un soporte, lo
de encima se queda donde está y pasa a libre.

## Pruebas
`herramientas/editor_mapa/pruebas/prueba_editor_pro.mjs` (casos A, B, C, E y F de la especificación, fantasma, migración y regresiones).
Necesita un servidor de PRUEBA con datos aparte (nunca el 7791/7792 ni `datos_usuario`):
```
set OO_PUERTO_EDITOR=7793& set OO_DATOS_EDITOR=%TEMP%\oo_prueba\datos& set OO_CARTELES_UNITY=%TEMP%\oo_prueba\carteles& set OO_REGLAS_UNITY=%TEMP%\oo_prueba\reglas
python herramientas/editor_mapa/servidor.py --sin-navegador
node herramientas/editor_mapa/pruebas/prueba_editor_pro.mjs --puerto 7793 --depuracion 9483 --perfil %TEMP%\oo_prueba\edge --limpiar [--capturas carpeta] [--resultado res.json]
```
`OO_CARTELES_UNITY` evita que un servidor de prueba con datos vacíos borre los carteles del juego.

# Map Editor Pro, fase 3 (2.1): rendimiento, plantas, cubiertas, escaleras, plataformas y revestimientos

## Rendimiento: actualización selectiva
`escribir()` (todo lo que guarda, deshace o rehace) llama primero a `recomputeParcial()` (`editor.js`): si el paso solo toca objetos
nuevos (documentos `agregar`), rehace esos objetos, sus dependientes de anclaje (que ya vienen en el paso) y las paredes cuyas esquinas
o huecos cambian, sin reescribir las ~20 000 piezas del mapa ni reconstruir los demás objetos. Las piezas del mapa original, las notas,
los borrados de piezas y las puertas en paredes originales siguen con `recompute()` completo. La lista de cambios solo se rehace si
su pestaña está a la vista. Con el Complejo y 320 objetos nuevos (Edge sin ventana): mover un objeto 84 → 1,5 ms, crear 54 → 1,3 ms,
elevar una fundación 56 → 4 ms, deshacer 57 → 2,5 ms (`recompute()` completo: 60-190 ms). `parcialStats` cuenta los parciales y los
completos.

## Dónde está cada herramienta
- **Plantas** (`niveles.js`): elige una fundación → inspector **Plantas del edificio** → «Convertir en edificio con plantas». Sale el
  selector **Nivel: Sótano | Planta baja | Piso 1 | Piso 2 | Azotea** arriba de la vista, con «Ver todos», «Solo este nivel»,
  «Ocultar superiores», **Corte** (a 1,2 m del suelo de la planta activa) y **Plantas…** (agregar encima, sótano, azotea, duplicar o
  quitar la planta activa, alto de cada planta y nombre). Con una planta activa se dibuja a su altura y lo que se crea dentro del
  edificio queda en ella. Lo que oculta el selector no se dibuja ni se puede elegir (ni con clic ni con rectángulo).
- **Construir → Cubierta: …** (`techos.js`): clic en una habitación, un edificio o una fundación. Formas: plano (con pretil), una
  pendiente, dos aguas, cuatro aguas, galpón, industrial (diente de sierra), pérgola, toldo (clic en una pared) y cobertizo. Inspector →
  **Cubierta**: forma, inclinación, orientación (y «Girar la cumbrera 90°»), espesor, voladizo, cubierta (chapa, tejas, transparente,
  losa, lona, madera), color, canaletas, cumbrera, estructura (postes, cerchas), altura de postes, pretil, dientes. Habitaciones,
  fundaciones y paredes tienen en el inspector «Poner cubierta» / «Poner un toldo».
- **Construir → Escalera** y **Rampa** (`escaleras.js`): clic en el pie y clic en el piso de arriba. Inspector: desnivel, ancho, forma
  (recta o en L), descanso, estilo (maciza o zancas), huella fija, barandas, pendiente y tramo plano (rampa), «Ajustar el desnivel al
  piso de arriba».
- **Construir → Plataforma: …** (`plataformas.js`): tarima, terraza, escenario, muelle de carga, andén, acera elevada, bordillo,
  plataforma industrial sobre columnas y plataforma sobre pilotes (arrastrar o clic). Son fundaciones: inspector **Plataforma** con
  baranda perimetral (tubos o vidrio, frente abierto), defensas, línea de seguridad, faldón y separación de columnas.
- **Construir → Baranda** y **Pretil** (`revestimientos.js`): clic a clic. Paredes → inspector **Revestimientos**: zócalo (alto, color,
  caras) y revestimiento de la cara A y de la cara B (material, color, alto).

## Formato
- Fundación-edificio: `datos.niveles = [{id, altura, sotano?, azotea?, nombre?}]` de abajo arriba. La planta baja (la primera que no es
  sótano) está en la cara de arriba de la fundación; las demás suman o restan alturas. Cada objeto de una planta lleva `nivel` (id de
  la planta) y `edificio` (id de la fundación); lo apoyado en algo de una planta hereda su planta. La estructura de cada planta se
  ancla a la fundación (`soporte` manual con `rel`), así que al elevar la fundación suben todas. Cada planta nueva trae su losa
  (`habitacion` con `suelo: true` y 20 cm de grosor).
- `techo`: además `forma`, `inclinacion`, `orientacion`, `espesor` (= `grosor`), `voladizo`, `cubierta`, `canaletas`, `cumbrera`,
  `estructura`, `alturaPostes`, `pretil`, `dientes`, `lado` (toldo). Sin `forma` es la losa plana de antes. `y` es la línea de aleros.
- `escalera`: `x, z` centro de su caja en planta, `y` altura del pie, `giroY` (sube hacia +X local), `alto`, `ancho`, `n`,
  `contrahuella`, `huella`, `huellaFija`, `forma` (`recta`, `L`), `giro` (`izq`, `der`), `descanso`, `largoDescanso`, `barandas`
  (`ambas`, `izq`, `der`, `ninguna`), `estilo` (`maciza`, `zanca`), `desde`, `hasta`. `rampa`: `alto`, `pendiente` (%), `largo`, `ancho`,
  `descanso`, `bordillos`, `barandas`. `sx, sy, sz` son su caja.
- `habitacion.agujeros_auto = {<id de escalera>[#k]: [[x, z]…]}`: agujeros que abre cada escalera en el piso o la losa que alcanza.
  Se dibujan y exportan con los `agujeros` normales. Se recalculan al mover o cambiar la escalera y se quitan al borrarla.
- `fundacion`: además `preset`, `baranda`, `frenteAbierto`, `estiloBaranda`, `defensas`, `lineaSeg`, `faldon`, `base: 'columnas'` y
  `sepColumnas`. El frente es su lado +Z local.
- `muro`: además `zocalo`, `colorZocalo`, `zocaloCaras` y `revA` / `revB` = `{material, color, alto}`. `baranda`: `x, y, z, giroY`, `sx`
  (largo), `sy` (alto), `sz`, `estilo` (`tubos`, `barrotes`, `vidrio`, `reja`, `pretil`), `color`.
- Piezas: un `poly` puede llevar `lm` (matriz local de 16 números) y `t` (transparente): así se dibujan y exportan los faldones
  inclinados y los perfiles de escaleras y rampas.

## Pruebas de la fase 3
El mismo script añade los casos D1-D2 (dos plantas), Techos, Escalera entre dos niveles, Plataformas y rampa a un muelle,
Revestimientos y barandas, y Rendimiento (imprime los tiempos). Al este del mapa hay edificios «Exterior» de hasta 10 m: los casos
usan franjas libres (z ≈ −30, 70-90 y 150-170).
Usa un puerto de depuración propio (`--depuracion`): si otro Edge sin ventana ya escucha en ese puerto, la prueba se conecta a él y se cuelga.

# Map Editor Pro, fase 4 (2.1): biblioteca de materiales, prefabs procedurales, edificios, miniaturas e importación

## Dónde está cada cosa
| Qué | Archivo | Cómo se usa |
|---|---|---|
| Texturas procedurales | `texturas_proc.js` | `OOTexturas.lienzos(patron, {color, tam, suciedad, desgaste, semilla})` → lienzo de color, normal map (de un mapa de alturas) y si tiene huecos. Se repiten sin costuras. |
| Biblioteca de materiales | `materiales_pro.js` (+ ganchos en `materiales.js`) | Pestaña **Material**: grupos de la **Biblioteca** (31 presets), «Editar este material», «Seleccionar todo lo que lo usa», «Reemplazo masivo». |
| Prefabs procedurales | `prefabs_proc.js` | Catálogo: **Estructura**, **Urbanismo**, **Industrial**, **Naturaleza** y **Primitivas**. Tipo `proc:<clave>`. |
| Edificios prefabricados | `kits_edificios.js` | Catálogo: **Edificios** (caseta, oficina modular, contenedor-oficina, bodega, baño público, casa pequeña, casa de dos plantas, local comercial). |
| Miniaturas, variantes y parámetros | `catalogo_pro.js` (+ ganchos en `catalogo_ui.js`) | Botón «N ▾» en las tarjetas; parámetros al colocar y en el inspector; tarjetas de fundaciones, plataformas, escaleras, rampas, barandas y cubiertas. |
| Modelos GLB reutilizables | `importar_pro.js` (+ ganchos en `importar.js`) | Importar pide nombre, categoría (o una nueva), unidades y etiquetas; «Editar» en la pestaña Catálogo; soltar un `.glb` sobre la vista. |
| Estilos | `estilo_pro_f4.css` | |

## Materiales
- **Presets**: hormigón nuevo, envejecido y pintado, cemento pulido, asfalto y asfalto deteriorado, adoquín, baldosa, cerámica,
  porcelanato, madera clara y oscura, parqué, piedra, mármol, tierra, arena, césped, grava, pavimento industrial, suelo metálico (chapa
  estriada), rejilla metálica (con huecos), antideslizante, metal oxidado, acero galvanizado, pintura industrial, pared blanca, ladrillo,
  bloque, chapa ondulada y tejas rojas. Cada uno es un patrón dibujado en un lienzo (no hay archivos): las texturas de
  `unity/Assets/Resources/OperacionOficina/<Mapa>/Texturas` no se usan porque son atlas de colores planos, sin detalle.
- **Mapeo «mundo»** (triplanar, en el sombreador): la textura se repite cada `escala` metros en cualquier pieza (cajas, cilindros, pisos,
  cubiertas inclinadas, perfiles de escalera) sin estirarse con el tamaño. «Por cara» conserva el comportamiento de antes.
- **Editor de material**: base (preset), color con selector y hexadecimal, colores recientes (en el navegador) y paletas propias
  (documento `_paletas` de `materiales.json`; clic derecho quita un color), textura importada, mapeo, escala, rotación UV, rugosidad,
  metal, opacidad, relieve (normal map de la textura o uno importado), suciedad, desgaste, variación y emisión, con vista previa 3D.
- **Recursos compartidos**: elegir un preset crea una vez el material `preset-<clave>` y lo asigna a lo seleccionado (solo a eso: las
  demás superficies con el mismo material original no cambian). Al editar un material usado por varios objetos se elige **en todas las
  instancias** (cambia el recurso) o **solo en la selección** (copia local con `copia_de`, asignada a lo elegido).
- **Reemplazo masivo**: material de origen (los que están en uso, con su cantidad) → destino (biblioteca o mis materiales), en todo el
  mapa o en la selección. Los objetos nuevos cambian en un solo paso de deshacer; las piezas del mapa original reciben el material como
  propiedad.
- Formato: los materiales pueden llevar además `preset`, `patron`, `mapeo`, `escala`, `rotacionUV`, `relieve`, `normal`, `suciedad`,
  `desgaste` y `semilla`; la exportación (`materiales[]`) añade `preset`, `patron`, `mapeo`, `escala_m`, `rotacion_uv`, `relieve`,
  `normal`, `suciedad` y `desgaste`. En el GLB va la textura del lienzo como `baseColorTexture` (con las UV de cada pieza).

## Prefabs procedurales (`proc:<clave>`)
- Cada generador tiene parámetros (se guardan en `datos` junto a `x, y, z, giroY, sx, sy, sz`), variantes y ejes: en una carretera,
  `sx` es el largo y `sz` el ancho, así que estirarla con el gizmo cambia el parámetro y sigue con sus rayas cada 9 m; lo que no es
  parámetro se escala. `datos.prefab_proc` repite la clave.
- **Construcción**: columna cuadrada y redonda, viga (rectangular, perfil I, madera), losa, marquesina (con tirantes o de vidrio), balcón.
- **Urbanismo**: carretera recta (carriles, línea central, bordes), carretera en curva (radio, ángulo), intersección en cruz o en T con
  pasos de cebra, acera con bordillo (juntas, bordillo pintado), plazas de parqueo (90°, 60°, 45°, una o dos filas, discapacitados,
  topes), flechas viales, señales (pare, ceda, velocidad, no parquear, peligro, parqueadero, informativa), semáforo (con brazo o
  peatonal), tope, cuneta, alcantarilla, rejilla de drenaje, poste eléctrico y luminaria.
- **Industrial**: contenedor marítimo de 20 y 40 pies (apilados, abiertos), tanque vertical u horizontal, generador, transformador de
  pedestal o subestación, tubería (bridas, soportes, codo), conducto, aire split (usa las piezas del catálogo), cámara de seguridad,
  torre de reflectores y cerca perimetral (malla, reja, muro con malla, alambre, concertina).
- **Vegetación**: árbol (redondo, irregular, conífera, ciprés), palmera, arbusto (bola, mata, seto, flores), maceta (la variante «planta
  de oficina» usa la malla real del juego), jardinera, roca y tronco.
- **Primitivas**: cubo, prisma, cilindro, esfera, cono, plano, tubo, arco, escalón, cuña, polígono extruido (puntos en planta) y
  geometría por puntos (perfil extruido), con medidas numéricas.

## Edificios prefabricados (`kit:<clave>`)
Al colocarlos, una regla de `anclajes.js` cambia el objeto `kit:` por los objetos de las fases 2 y 3, en el mismo paso de deshacer:
fundación elevada, piso, cuatro paredes (y tabiques), puertas y ventanas en sus paredes, cubierta paramétrica, escalones o rampa de
acceso, y según el edificio: plantas con su losa y una escalera que abre su agujero (casa de dos plantas), portones enrollables y rampa
(bodega), esquineros (contenedor-oficina), letrero y toldo (local). Las paredes, los pisos y la cubierta usan materiales de la
biblioteca (acabado). Cada pieza lleva `datos.kit = {clave, grupo}`; el inspector ofrece «Seleccionar el edificio entero». Elevar la
fundación lo sube entero. Parámetros comunes: ancho, fondo, alto, elevación, acabado y color de las paredes, piso, cubierta y su color.

## Catálogo
- Categoría **Estructura**: fundaciones, las nueve plataformas, escaleras (recta, con descanso, en L, de zancas, escalones), rampas y
  barandas; se colocan como cualquier objeto. En **Construcción**, una tarjeta por forma de cubierta (activa la herramienta Cubierta).
- Todas las tarjetas nuevas tienen miniatura (se dibujan también los polígonos: pisos, faldones, perfiles). Las que tienen variantes
  muestran «N ▾»: la variante elegida se queda en la tarjeta y se coloca. Al colocar, el panel muestra los parámetros.
- Modelos importados: `assets` guarda además `categoria`, `categoriaNombre`, `escala`, `etiquetas`, `archivoOriginal` y `bytes`.

## Pruebas de la fase 4
El mismo script añade siete casos F4: biblioteca de materiales; pintar una selección, edición local o global, reemplazo masivo y
seleccionar iguales; cada prefab procedural colocado, con parámetros, estirar y variantes; los ocho edificios con sus anclajes, huecos,
plantas y escalera; una escena urbana; miniaturas y variantes de todas las tarjetas nuevas; importar un GLB con categoría y escala.
Usan las franjas z ≈ 190-350 al este del mapa. E2 (recargar) compara también todo lo que crean.

# Map Editor Pro, fase 5 (2.1): productividad y modelado

## Dónde está cada herramienta
| Herramienta | Dónde | Archivo |
|---|---|---|
| Mover y girar con valores exactos, alinear, distribuir, reflejar, duplicar con desplazamiento, matriz, repetir | Inspector → «Transformar» (con algo seleccionado); menú **Modelar** | `transformar.js` |
| Medida exacta tecleada tras mover o girar con el gizmo | Mover o girar con el gizmo, escribir el número y Enter (corrige el último movimiento) | `transformar.js` |
| Repetir a lo largo de un camino (línea o curva) | Modelar → «Repetir a lo largo de un camino» (Mayús+R): clic en cada vértice, Enter o doble clic | `transformar.js` |
| Ejes bloqueados, espacio del gizmo (automático, local, global) y pivote | Inspector → «Transformar» → Pivote y ejes; Alt+X / Alt+Y / Alt+Z | `transformar.js` |
| Medidas exactas | Inspector → «Medidas»: caja de la selección y tamaño en los ejes del objeto, editables | `transformar.js` |
| Alinear con otro objeto (copiar su giro), enderezar, imán de ángulo | Inspector → «Transformar» → Girar exacto; menú Modelar. El imán de ángulo (paso en grados) funciona aunque la rejilla esté apagada | `transformar.js` |
| Notas con vista previa | Tarjeta flotante sobre cada nota (miniatura, texto, pendiente/hecha): clic = seleccionar, otro clic = verla en grande; pestaña Notas → «Notas del mapa»; inspector → «Estado de la nota» | `notas_pro.js` (gancho en `catalogo.js`) |
| Vértices de fundaciones poligonales, pisos y cubiertas | Seleccionar: asas blancas (mover) y azules (añadir); inspector → «Vértices» | `geometria.js` |
| Extruir un piso o una cubierta plana; dividir cajas y polígonos | Inspector → «Geometría»; menú Modelar | `geometria.js` |
| Cubiertas a dos y cuatro aguas sobre contornos en L | Automático al poner la cubierta en una habitación en L | `cubiertas_l.js` (gancho en `techos.js`) |
| Escalera de caracol y en U | Construir → «Escalera de caracol» / «Escalera en U», o Forma en el inspector de la escalera | `escaleras_pro.js` (ganchos en `escaleras.js`) |
| Rampa con descansos intermedios | Inspector de la rampa → «Descansos de la rampa» | `escaleras_pro.js` |
| Baranda por el borde de un piso | Construir → «Baranda por el borde de un piso» (clic en el piso); inspector de pisos y fundaciones | `escaleras_pro.js` |
| Jerarquía por edificio → planta → habitación; grupos | Panel Jerarquía: nodos «Edificios» y «Grupos»; clic derecho en un nodo | `jerarquia_pro.js` (gancho en `jerarquia.js`) |
| Mover de planta, renombrar, duplicar, agrupar, mover entre grupos, dependencias y anclajes | Clic derecho en el árbol; inspector → «Jerarquía y dependencias» | `jerarquia_pro.js` |
| Pincel con radio, intensidad y suavidad | Herramienta Terreno (subir, bajar, aplanar, suavizar, zanja, pintar) | `terreno.js` |
| Nivelar el terreno con una plataforma, apoyar la plataforma, adaptar caminos, seguir el terreno en lote | Inspector → «Terreno» | `terreno_pro.js` |
| Pintar y borrar vegetación | Terreno → «Pintar vegetación» / «Borrar vegetación» | `terreno_pro.js` |
| Medir áreas | Medir → «Área» (Mayús+T) | `productividad.js` |
| Aislar la selección, ocultar un rato, mostrar todo | Mayús+I, Mayús+H, Alt+H; lupa de la barra derecha de la vista | `productividad.js` |
| Buscar y seleccionar por tipo o nombre | Lupa de la barra derecha de la vista (Mayús+B) | `productividad.js` |
| Historial con nombres y versiones (instantáneas) | Botón del reloj junto a deshacer/rehacer (Mayús+Y) | `productividad.js` |
| Atajos configurables | Lupa → «Atajos personalizados…» | `productividad.js` |
| Pantalla limpia | Mayús+F o lupa → «Pantalla limpia» | `productividad.js` + `estilo_pro_f5.css` |

## Formato (solo campos nuevos)
- `escalera`: `forma` admite `'U'` (con `hueco`, separación entre tramos) y `'caracol'` (con `radio`, `anguloPeldano`, `giroTotal`; `x, z`
  es el centro). `giro` es el sentido.
- `rampa`: `descansos` (0–6) y `largoDescansoRampa` (m). `sx` cuenta los descansos.
- `baranda`: `borde_de` (id del piso o la fundación de cuyo borde sale).
- `techo`: igual que antes; si `puntos` es una L se construye con dos alas (no se guarda nada nuevo). `lsimple: true` obliga al rectángulo.
- Vegetación pintada: objetos `proc:arbol_proc`, `proc:palmera_proc`, `proc:arbusto_proc` con `vegetacion: true` y soporte `terreno`.
- Caminos adaptados: `incX` / `incZ` (pendiente) y soporte `libre`.
- Colección nueva `versiones` (`datos_usuario/versiones.json`): `{mapa, nombre, fecha, auto, docs: {id: documento de cambios}}`.
- Ajustes del navegador: `AJ.bloqueoEjes`, `AJ.espacio`, `AJ.atajos`, `AJ.autoVersiones` (`on`, `min`, `max`).

## Notas
- Las copias (duplicar, matriz, repetir, reflejar una copia) reasignan dentro del conjunto copiado el soporte, la pared de las puertas
  (`muro`), el techo de una habitación (`de_habitacion`) y `desde`/`hasta` de las escaleras. Una puerta copiada a lo largo de su pared
  sigue en ella.
- Reflejar cambia el giro (180° − g en X, −g en Z), invierte el contorno local de los polígonos y el sentido de las escaleras en L/U/caracol.
  Las piezas del mapa original se reflejan con una matriz (posición y orientación).
- Restaurar una versión es un paso de deshacer más (Ctrl+Z la deshace). Las automáticas se guardan cada N minutos solo si hubo cambios.
- Booleanas (unión, diferencia, intersección): **no están**; quedan para cuando haya CSG con mallas cerradas (ver la auditoría).
- Giro y grupos: agrupar y desagrupar no cambian los datos de los objetos (el grupo es solo una lista de miembros), así que no se pierde
  ni se acumula giro; un grupo gira como un sólido alrededor de su pivote. Con varios objetos y «Coordenadas locales», el gizmo usa los
  ejes del primero elegido (útil para mover una ventana girada a lo largo de su pared). «Alinear con…» copia el giro de otro objeto
  (exacto o el equivalente más cercano cada 90°); «Enderezar» redondea el giro de cada objeto al paso del imán.
- Notas: `datos.estado` = 'pendiente' | 'hecha'. El pin lleva una caja invisible de 1,4 m para el clic.

## Pruebas de la fase 5
Catorce casos «F5 ·» en `pruebas/prueba_editor_pro.mjs` (`--solo "F5 ·"`): notas (tarjeta con clic real del ratón, lista, estado,
gizmo); giro y grupos (espacio local con varios, girar un grupo y desagrupar sin perder giro, alinear con, enderezar, imán de ángulo,
piezas del mapa); repetir 20 postes a 3 m, en curva y en línea; duplicar con
desplazamiento y matriz; alinear, distribuir, reflejar, mover y girar exactos, ejes, pivote y medidas; vértices (también arrastrando un
asa con el ratón), extruir y dividir; cubierta en L a dos y cuatro aguas y su contorno; caracol, U, rampa con descansos y baranda por el
borde; jerarquía y mover de planta; terreno; productividad (aislar, buscar, historial, versiones, áreas, atajos, pantalla limpia).
Usan la franja al sur del mapa (z ≈ max + 10 … + 60), donde no hay piezas.

# Map Editor Pro, fase 6 (2.1): calidad y exportación al juego

## Llevar lo del editor al juego: edito → Enviar al juego → compilo
1. **Edito** en el editor (cualquier cosa: paredes, pisos, fundaciones, cubiertas, escaleras, rampas, puertas, objetos del catálogo,
   piezas del mapa movidas, escaladas, borradas o cortadas por un hueco).
2. **Enviar al juego**: menú naranja **Exportar → Enviar al juego (Unity)**. El editor escribe
   `unity/Assets/OperacionOficina/Resources/EditorMapa/cambios_<mapa>.json` y enseña qué sale y qué no. Si el servidor del editor es
   anterior a esta versión (no conoce `/api/juego`), descarga el archivo: hay que copiarlo a esa carpeta (o reiniciar el servidor).
   Desde la consola, sin abrir nada (sobre una copia de los datos; nunca escribe en `datos_usuario`):
   ```
   node herramientas/editor_mapa/enviar_al_juego.mjs [--mapa complejo|parqueadero] [--datos carpeta] [--salida carpeta]
   ```
3. **Compilo**: en Unity, **Operación Oficina → Compilar juego (Windows)**, o
   `Unity.exe -batchmode -projectPath unity -executeMethod OperacionOficina.Editor.MenuMapas.CompilarJuego -quit`.
   `MenuMapas.Construir` llama a `EditorMapaJuego.Aplicar` justo después de construir el mapa y **antes** de corregir caras, preparar la
   destrucción, fundir mallas y calcular la malla de navegación: los bots cuentan con lo nuevo, lo rompible se decide con lo nuevo y lo
   nuevo se funde con el resto. El registro de compilación dice cuántas piezas encontró (`[unity] Complejo: editor del mapa: …`; si
   alguna sale como NO ENCONTRADA es que el mapa se regeneró y esa pieza ya no está igual).

Sin el archivo, el juego se construye como siempre («sin cambios del editor del mapa»). Para quitarlo todo: borrar el JSON y compilar.

### Qué sale en el juego
| Del editor | En Unity |
|---|---|
| Pieza del mapa borrada, movida, girada o escalada | Se busca por su **firma** (tipo de llamada de `Mapa<Mapa>.cs`, posición y tamaño originales con 3 cm de tolerancia, malla y material), no por el índice: sobrevive a regenerar el mapa mientras la pieza no cambie. Se borra o se lleva a su sitio con la matriz `delta`. Las cajas se rehacen con sus UV y su colisión. |
| Pared original cortada por un hueco del editor | Se quita y se ponen sus tramos con el mismo material, colisión y sección (sigue siendo rompible). |
| Pieza pintada | Material con el color del editor y el relieve de su material. |
| Paredes, cajas, cilindros, esferas | Cajas del constructor (`ConstructorMapa.Caja`, con BoxCollider), cilindros con colisión convexa, esferas. |
| Pisos, fundaciones, cubiertas, escaleras, rampas | Triángulos con **MeshCollider caminable** (escalones de 17-18 cm: el jugador sube hasta 30 cm y los bots 35 cm; pendientes hasta 45°). |
| Suelo / calle (losa de 10 cm) | (2.1.2) **A ras del piso del mapa**: cada losa fina y horizontal baja hasta que su cara de arriba queda 5 mm sobre el piso que tiene debajo (si lo hay a ≤ 35 cm), con su colisión. Sin escalón en el borde (el coche y el jugador pasan sin tropezar). |
| Hoja de puerta del mapa (de edificio o de coche) a la que se le borró toda la colisión | (2.1.2) Si aún le quedan mallas, recibe una caja de colisión a la medida de lo que queda (sigue chocando, parando balas y abriéndose con F); si no le queda nada, se quita. El registro de compilación lo avisa (`[editor] Puerta …`). |
| Puertas (tipo puerta: metal, baño, madera, vidrio y aluminio, simple) | Marco fijo y hoja con `Puerta.cs` en la capa de puertas: se abre con **F**, los bots la abren y la malla de navegación la deja pasar. Objetos con el comportamiento «puerta» (simple o doble, como el portón): una o dos hojas con bisagra en los lados de su caja. |
| Objeto del catálogo con malla real del juego (caja de madera, silla, barril, coches…) | La misma malla y material del juego (`ConstructorMapa.Malla`) y su caja de colisión. |
| Letreros con texto | Placa y TextMesh: `Letreros` los cambia por carteles nítidos al empezar la partida. |
| Luces | Luz puntual. |
| Materiales | Color del editor + relieve, rugosidad y escala del material del juego de la misma familia (bloque, concreto, asfalto, baldosa, madera, metal, chapa…); vidrio transparente. |

### Qué no sale (lo lista el diálogo de «Enviar al juego»)
- El **terreno** esculpido o pintado (se exporta aparte con Exportar → Terreno).
- **Comportamientos** que no son puerta (coche conducible, interactuable, luz con interruptor, zona de aparición, sonido) y los
  comportamientos puestos en piezas del mapa original.
- Puertas **corredizas, enrollables y basculantes** (quedan fijas).
- **Modelos GLB importados** (van como su caja; para verlos hay que importar el .glb en Unity).
- Las **capas ocultas** (no se envían) y las **zonas** (son del editor).
- Los **carteles** del editor siguen yendo por su camino (`Resources/Carteles`, se guardan solos al editarlos).

### Formato `oo-editor-unity` (versión 1)
Todo en coordenadas de Unity (`x = X`, `y = Y`, `z = −Z` del editor; cuaterniones `(−qx, −qy, qz, qw)`; matrices 4 × 4 por filas):
```
{ formato: "oo-editor-unity", version: 1, mapa, generado,
  originales: [{ firma: {ref, uid, t, sec, pos, tam, mat, malla?}, borrar? | delta?: [16] | cajas?: [{p, q, s}], color?, mat?, colision? }],
  mats: [{ c: "#rrggbb", f?: familia, t?: transparente, r?, m?, e? }],
  modelos: { clave: [{ malla, mat, rel: [16] }] },
  objetos: [{ id, nombre, tipo, capa, colision?, partes: [parte], hojas?: [{ p, q, sentido, tipo, partes: [parte] }], par? }],
  no_soportado: [{ id, nombre, motivo }], resumen: {...}, avisos? }
parte: { f: "b"|"c"|"s", p, q, s, k } | { f: "m", v: [x, y, z, …], k } | { f: "t", texto, p, q, w, h, fg, bg }
     | { f: "l", p, c, alcance, energia } | { f: "mod", mod, m: [16], caja: {p, q, s} }
```
`firma.t` es la llamada del código generado (0 caja, 1 malla, 2 cilindro, 3 tubo, 4 bloque, 5 luz, 6 letrero, 7 puerta); `pos` y `tam`
son los de `mapa_<mapa>.json` (para las mallas, el pivote y la escala). `ConstructorMapa.Registro` guarda la misma firma de cada pieza.

## Revisar el mapa (validación)
**Exportar → Revisar el mapa** o **Seleccionar → Revisar el mapa (avisos)**. Avisos agrupados con **Ir** (selecciona y encuadra),
**Corregir** cuando hay una corrección segura (un paso de deshacer) e **Ignorar** (no vuelve a salir en este navegador):
- **Escaleras y rampas sin conexión**: el pie no apoya en el suelo, en un piso o en una pieza del mapa, o al final no hay nada a su
  altura (Corregir = «Ajustar el desnivel» si hay una superficie más alta). Las de forma L, U y caracol solo revisan sus referencias.
- **Pendientes**: rampa de más del 12 % (aviso) o del 100 % (error); Corregir la deja al 10 %.
- **Flotando / enterrado**: muebles, objetos del catálogo, paredes, pisos, fundaciones, árboles y coches sin soporte (no los de pared o
  techo: letreros, extintores, lámparas…). Corregir los apoya en la superficie de debajo.
- **Anclajes**: soporte que ya no existe (Corregir lo quita), ciclos, puerta sin pared, objeto que atraviesa una plataforma (Corregir lo sube).
- **Materiales**: material propio borrado (Corregir lo quita), textura que ya no está, material desconocido (pasa a pintura).
- **Duplicados**: dos objetos iguales en el mismo sitio (Corregir borra uno).
API: `OOValidacion.revisar()`, `corregir(lista)`, `pintar()`.

## Rendimiento
- **Servidor por diario** (`servidor.py`): cada colección vive en memoria; cada escritura añade una línea a `<col>.diario.jsonl` y el
  JSON entero se reescribe un segundo después de la última escritura (o cada 200 líneas) y al cerrar. `<col>.json` no cambia de formato
  y se puede seguir leyendo y editando por fuera (si cambia, el servidor lo relee y le aplica lo pendiente). Un diario que quedó de un
  cierre brusco se aplica al arrancar. `OO_COMPACTAR_TRAS` cambia el segundo de espera.
- **Vegetación instanciada** (`vegetacion.js`): un trazo del pincel «Pintar vegetación» es un solo objeto `vegetacion` con
  `datos.plantas = [{t: tipo, d: datos}]` (posiciones relativas a su origen): un documento y un paso de deshacer por trazo, piezas en las
  mallas instanciadas y un solo grupo al exportar. «Borrar vegetación» quita plantas dentro de los grupos.
  `OOTerrenoPro.pintarVegetacion` (una planta por objeto) sigue existiendo para quien la use.
- **Compactar en reposo**: cuando el usuario para 2,5 s y los huecos del búfer de instancias pasan del 10 % (o de 2000), se junta todo
  (`compactarSiHace`, `huecosInstancias` en la API).
- **Escala del inspector**: la base de la escala va con la selección que la midió; una selección única ya no hereda la de una múltiple
  (antes podía mostrar 0,007).

## Vistas de depuración
**Seleccionar → Vista: …**: normal, sin materiales, alambre, normales (color = normal de la cara), colisiones (lo que no choca se oculta y
se ven las colisiones del mapa) y anclajes (líneas de soporte). Solo cambian el dibujo. API: `OOVistasRender.poner(modo)`.

## Pruebas de la fase 6
Casos «F6 ·» en `pruebas/prueba_editor_pro.mjs` (`--solo "F6 ·"`): validación (flotando, enterrado, rampa empinada, escalera sin
llegada, material que falta, duplicado, corregir y panel), enviar al juego (firma de piezas borradas y movidas, delta, superficies,
puerta con bisagra y hoja cerrada, guardado en el servidor; con `--juego carpeta` comprueba el archivo), vegetación agrupada, escala,
compactar, servidor por diario (con `--datos-prueba carpeta` comprueba los archivos) y vistas. El servidor de prueba necesita también
`OO_EDITORMAPA_UNITY` apuntando a una carpeta temporal.

# Notas fáciles y primera persona para interiores (2.1)

## Notas (`notas_editor.js`, lista en `notas_pro.js`)
- **Crear**: botón grande **＋ Nota** arriba de la pestaña Notas, botón **＋ Nota** en la barra de la vista o tecla **N**. Un clic en el
  mapa la deja y abre al momento su editor en la pestaña Notas con el cursor puesto: se escribe directamente.
- **Editor fijo** arriba de la pestaña Notas: texto, fotos (**＋ Subir foto**, **De la galería**, × para quitar), **Marcar hecha /
  pendiente**, **Ir a**, **Ver en grande**, **Borrar** y **Cerrar**. Se guarda solo al dejar de escribir (0,7 s), al salir del campo y
  con **Guardar** (o Ctrl+Enter). Lo escrito seguido en la misma nota es un solo paso de deshacer. Esc sale del texto.
- **Lista**: cada nota con **Editar**, **Ir a**, **Pendiente / ✔ Hecha** y **Borrar**; clic en el texto = editar. La que se edita va
  marcada. Las notas escritas sobre piezas del mapa salen debajo, plegadas («Notas en piezas del mapa»).
- **Tarjeta 3D**: un clic la selecciona y abre su edición; otro clic (o doble clic) la abre en grande.
- **Inspector**: con una nota elegida, «Nota y fotos» sale abierta y la primera; también guarda sola y se copia al editor de la pestaña.
- Fallo arreglado: al crear una nota el foco iba a un textarea que estaba dentro de la sección «Nota y fotos» **plegada** (se abría
  solo si la nota ya tenía texto o fotos), así que no se veía dónde escribir; y lo escrito solo se guardaba con «Guardar nota».

## Primera persona («Caminar», `caminar_pro.js`; editor.js deja el gancho en `moverAndar`)
| Tecla | Qué hace |
| --- | --- |
| W A S D, flechas | andar (choca con paredes y objetos y se desliza a lo largo de la pared) |
| Mayús | correr (× 2,5) |
| Rueda, + / − | velocidad (0,5 a 40 m/s, se recuerda) |
| Espacio | saltar; volando, subir |
| Ctrl o C | agacharse (ojos a 1,0 m; de pie a 1,65 m); volando, bajar. Ctrl+W lo cierra el navegador: mejor C para agacharse andando |
| E o clic | abrir o cerrar la puerta que se mira (o la más cercana a 2 m). Empujar una puerta cerrada ¼ s la abre sola |
| G | atravesar paredes (vuelo libre, como antes) |
| F | linterna |
| T | ocultar el techo de encima al entrar (por defecto sí): corte justo debajo del techo o techo falso; al salir vuelve el corte de antes |
| [ ] | campo de visión (40° a 110°, también con el deslizador del panel) |
| Clic | elegir lo que se mira y verlo en el inspector sin salir |
| N | nota donde se mira, con su editor abierto |
| Tab o Esc | soltar el ratón; Esc otra vez sale de la primera persona |

- Punto de mira con el nombre de lo que se mira y la distancia («E abre» si es una puerta a mano).
- **Teletransportarse aquí**: clic derecho en la vista 3D o en la planta → entra en primera persona en ese punto, mirando hacia donde
  miraba la cámara (en planta, hacia arriba de la pantalla).
- Panel abajo a la izquierda (modo, velocidad, botones, campo de visión y teclas plegables) y minimapa con la posición.
- Puertas: las del mapa (grupo `puerta:…` más su marco y lo que huecos.js junta con ella) y las del editor (hoja = piezas después del
  marco). Abrir solo cambia el dibujo y la colisión mientras se camina; no se guarda.
- API: `OOCaminar.estado()`, `teletransportar(p, yaw)`, `usar()`, `alternarPuerta(key, abrir)`, `abierta(key)`, `ponerAtravesar(v)`,
  `ponerLinterna(v)`, `ponerTechos(v)`, `ponerVel(v)`, `ponerFov(v)`, `notaAqui()`, `mirando()`. Ajustes en `localStorage['oo-caminar']`.

## Pruebas
Casos «Notas 2.1 ·» y «Caminar 2.1 ·» en `pruebas/prueba_editor_pro.mjs` (`--solo "(Notas|Caminar) 2\.1"`): crear una nota vacía con
clic real y escribirle con el teclado, varias notas con los botones de la lista, deshacer, fotos, borrar, clic en la tarjeta, editar una
vieja tras recargar la página (corre tras E2 o, con `--solo`, recargando al final); ojos y agacharse, colisión y deslizamiento, atravesar,
puertas (E, empujar, la de Sistemas del mapa, hoja girada), techo oculto dentro, clic que elige, N y teletransporte desde el menú.

# Referencias a piezas del mapa: que las ediciones apunten a su pieza (2.1, 08-11-2026)

Los cambios sobre piezas del mapa original (mover, borrar, pintar, cortar con un hueco, agrupar) guardan la pieza por su **índice** en
`mapa_<mapa>.json` (`ref`, ids `m-<mapa>-p<i>`, `s<hash>`, miembros `p<i>`, `datos.muro`). Cuando el mapa se regenera (Godot →
`Generado/<Mapa>/Mapa<Mapa>.cs` → `exportar_mapa_web.py`, también solo al arrancar el servidor si el C# es más nuevo) los índices se
corren. **Pasó el 4/11/2026**: el Complejo pasó de 20 312 a 21 556 piezas (alrededores) y el JSON para el juego de la 2.1.2 (el de los
zips 2.1.2, 2.1.3 y 2.1.4) se generó con el mapa nuevo y los índices viejos: **659 de las 685 piezas editadas cayeron en otras** (se
borraron árboles de los alrededores y la caja maciza de la administración que el usuario había borrado siguió en el juego; sus «281
pintadas» eran el color de la pieza buena puesto en otra). Los datos se migraron bien el 7/11 (`migrar_refs.py`, método firma).

**Coordenadas** (trampa): el `antes` de cada documento está en coordenadas del editor (`x, y, −z` del JSON, cuaternión
`(−qx, −qy, qz, qw)`); el JSON del mapa está en ejes de Unity. Comparar sin invertir z da 25-250 m de diferencia aunque todo esté bien.

Lo que lo protege ahora:
- **`servidor.py` migra solo, con respaldo.** Guarda en la carpeta de datos `_base_mapa_<mapa>.json` (el mapa con el que casan los
  datos). Al arrancar y cada vez que una pestaña pide el mapa compara versiones; si el mapa cambió, `migrar_refs.plan` resuelve cada
  índice (firma de la pieza en la copia vieja si `antes` casa con ella; si no, `antes` contra el mapa nuevo; las refs sin `antes` siguen
  el modo de los datos y las paredes de los huecos tienen que contener su hueco) y **solo si después todos los `antes` casan** guarda un
  respaldo en `respaldos_refs/<fecha>_<mapa>/` (colecciones, mapa viejo, `informe.json`) y reescribe cambios, versiones, grupos y
  etiquetas. Lo que nombraba piezas que ya no existen o que cambiaron se **aparta** a `sin_pieza.json` (documento entero, refs viejas y
  descripción de la pieza) y se avisa; nunca se deja apuntando a otra pieza. Estado: `GET /api/mapa_estado`.
- **Pestañas con el mapa viejo**: el mapa se sirve con `X-OO-Version-Mapa`; `local.js` manda `X-OO-Mapas: complejo=<versión>` en cada
  escritura y el servidor rechaza con **409** lo que nombre piezas con otra versión (sale un aviso naranja con «Recargar»). Un script que
  escriba en `/api/db` documentos con `ref` tiene que mandar esa cabecera.
- **Exportar al juego comprueba**: «Enviar al juego» (y `enviar_al_juego.mjs`) compara cada pieza cambiada con el `antes` de su documento;
  si alguna no casa, **no escribe nada** (diálogo con las primeras piezas; `enviar_al_juego.mjs` sale con código 1; `--forzar` lo salta).
  Al cargar, el editor avisa arriba si hay cambios descuadrados. `enviar_al_juego.mjs` trabaja sobre una copia: si los datos son de un
  mapa viejo, el servidor migra la copia al arrancar y exporta bien.
- **Puerto exclusivo**: en Windows el servidor ya no comparte puerto (antes, con `SO_REUSEADDR`, un servidor colgado en el 7792 se
  quedaba las peticiones de otro nuevo); si está ocupado, lo dice y sale. `OO_MAPAS_EDITOR` usa los `mapa_<mapa>.json` de otra carpeta
  (pruebas).

Herramientas:
```
python -I herramientas/editor_mapa/verificar_refs.py [carpeta] [--mapa complejo] [--base mapa_viejo.json]   (segundos; 0 bien, 1 mal)
python -I herramientas/editor_mapa/migrar_refs.py --nuevo mapa_complejo.json --datos carpeta [--viejo mapa.json] [--escribir]
python -I herramientas/editor_mapa/pruebas/prueba_migrar_refs.py [--servidor --puerto 7791]
```
`verificar_refs.py` dice si la copia `_base_mapa` es el mapa actual y cuántos `antes` (cambios y versiones) casan; de los que no, cuántos
casan con la copia vieja (falta migrar) y cuáles son, con la pieza que hay ahora en su lugar. `migrar_refs.py` sin `--escribir` solo
cuenta; con `--escribir` hace respaldo, aparta lo que no tiene pieza y actualiza la copia. La prueba fabrica un mapa con 300 piezas
quitadas, 250 metidas y una pieza movida, y datos de todos los tipos; con `--servidor` cambia el mapa con el servidor en marcha (409,
migración con respaldo, apartados, copia nueva).

# Escaleras: huecos automáticos, escalera libre y diseños

- **Huecos automáticos (como en los Sims)**: una escalera abre sola el hueco de cada losa que alcanza o atraviesa: pisos de
  habitación, losas de planta y **techos planos** (`techo` sin forma o con forma `plano`). Una losa se abre si su altura está entre el
  pie + 0,5 m y lo alto de la escalera + 0,16 m y su contorno toca la huella. Funciona en los dos sentidos: al poner o mover la
  escalera, y al **construir o mover la losa después**. Se desactiva por escalera con «Abrir huecos en pisos y techos» (`sinHueco`).
  Los huecos van en `agujeros_auto` (pisos y techos) y se exportan como los demás agujeros.
- **Construir → Escalera libre** (`escaleras_libres.js`): clic en el pie y un clic en cada esquina. En cada esquina va un descanso:
  si giras es una **virada** (el giro se imanta cada 15°, hasta 135°; con Mayús, libre); si sigues recto es una **pausa** de
  `largoDescanso`. Termina con Enter, doble clic o un clic sobre el piso de arriba (toma su altura y abre el hueco). Retroceso quita el
  último punto. Datos: `forma: 'libre'`, `tramos: [{largo, giro}]` (giro al final del tramo: + izquierda, − derecha, 0 pausa).
  Los peldaños (contrahuella ≤ 18 cm) se reparten entre los tramos según su largo; un tramo sin sitio queda como pasillo plano.
  Inspector «Tramos y descansos»: largo y giro de cada tramo, añadir tramo a la izquierda, a la derecha o una pausa, quitar el último,
  **Ajustar a peldaños cómodos** (huellas de 28 cm) y **Girar al otro lado**. Una recta, L o U se pasa a libre eligiendo esa forma.
- **Peldaños** (`estilo`): maciza (hormigón), zanca (dos vigas), zanca_central, flotante (peldaños volados con pletina en la pared),
  madera (huella, tabica y zancas) y metalica (vigas de acero y peldaños de rejilla).
- **Barandas** (`estiloBaranda`): tubo, barrotes, cables, vidrio (paneles transparentes) y muro (antepecho). `colorBaranda`.
- **Diseños** listos en la herramienta y en el inspector: Hormigón, Madera clásica, Flotante moderna, Zanca central, Metálica
  industrial, Con antepecho y Zancas de acero. Aplican estilo, barandas y colores de una vez.

# Huecos, guías de alineación, puertas y exportación

- **Construir → Hueco en suelo o techo** (`huecos_losas.js`): arrastra un rectángulo sobre un piso, una losa o un techo plano, o
  haz clic para uno del tamaño del panel (rectangular o redondo). En techos puede llevar vidrio (claraboya: `datos.claraboyas`).
  Los huecos van en `datos.agujeros` y se quitan desde el inspector («Huecos»). Para paredes sigue «Hueco en pared» (tecla O).
- **Guías de alineación** (`guias_alineacion.js`): al mover con el gizmo, una línea rosa (X) o azul (Z) marca cuándo un borde o el
  centro coincide con otro objeto cercano, y se imanta a menos de 8 cm. Al girar, la pista dice el ángulo y «Recto ✓»; a menos de 2°
  se imanta a 0/90/180/270°. Ctrl: sin imán. Se apaga con «Guías» en «Imán y selección».
- **Puertas**: se colocan cerradas. Campo «Apertura (°)» para mostrarlas abiertas.
- **Exportar**: menú por destino (Unity, Godot, Blender/glTF) con «¿Cómo lo abro?» y la guía de pasos al terminar cada exportación.
  La raíz de la escena lleva el nombre del mapa (antes salía siempre «Complejo»). Lo del juego Operación Oficina solo sale en local.

# Escalón por escalón (escalera totalmente libre)

- **Construir → Escalón por escalón** (`escaleras_pasos.js`): clic en el punto de partida y cada clic añade escalones hacia el
  ratón: cerca, uno; lejos, todos los que caben hasta ese punto en línea recta. Cada escalón sube la «altura de cada escalón»
  (18 cm por defecto) y gira hacia donde apuntas (imán cada 15°, Mayús libre). Ctrl+clic: descanso plano. Retroceso quita el último
  escalón; Enter o doble clic termina; Esc descarta. No necesita paredes, pisos ni una altura final: sube lo que vayas poniendo.
- Datos: `forma: 'peldanos'`, `pasos: [{x, z, r, sube, fondo?}]` en el marco del pie y `paso: {c, h}`. La altura de cada escalón
  sale de contar los que suben, así que cambiar `paso.c` sube o baja todos a la vez.
- Inspector «Escalones»: altura y fondo de cada escalón, **Seguir añadiendo escalones** (retoma la herramienta desde el último),
  quitar el último y reflejar. Usa los mismos estilos de peldaño, barandas y diseños que las demás escaleras y abre los huecos de
  las losas que alcanza.
- La escalera normal tampoco exige terminar sobre algo más alto: si no hay nada, sube la «altura si no hay nada arriba» del panel.
