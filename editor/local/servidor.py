"""Servidor local del editor del mapa (2.0.6): sirve el editor (index.html), los mapas exportados, las fotos de la carpeta de
referencias y guarda los cambios en archivos JSON de este repo, para que Claude los lea directamente.

Uso: python -I herramientas/editor_mapa/servidor.py   (o abrir_editor.bat) y abrir http://127.0.0.1:7791/

- Los mapas se exportan solos al arrancar si falta el JSON o si el C# generado es más nuevo (herramientas/exportar_mapa_web.py).
- Cambios y calcos: herramientas/editor_mapa/datos_usuario/<coleccion>.json ({id: documento}).
- Fotos: todas las imágenes de ../referencias (sin las carpetas de armas); las subidas van a referencias/subidas_editor/.
- (2.1) Referencias a piezas del mapa: si mapa_<mapa>.json cambia, los índices de pieza de los datos se migran solos (firma + `antes`),
  con respaldo y solo si después todo casa; lo que nombraba piezas que ya no existen va a sin_pieza.json (migrar_refs.py,
  revisar_mapa, GET /api/mapa_estado). Las pestañas que cargaron el mapa viejo no pueden escribir referencias (409: recargar).
  Comprobar una carpeta: verificar_refs.py. OO_MAPAS_EDITOR: carpeta de mapa_<mapa>.json (pruebas).
"""
import collections
import json
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # con -I la carpeta del script no está en sys.path
import migrar_refs  # noqa: E402  (2.1) migración de referencias a piezas cuando cambia mapa_<mapa>.json

AQUI = os.path.dirname(os.path.abspath(__file__))  # editor/local: servidor, herramientas y datos_usuario
EDITOR = os.path.dirname(AQUI)  # editor/: index.html, css/, js/, mapas/ (lo que se sirve)
# Repo del juego (Unity/Godot) para exportar mapas, mallas reales y «Enviar al juego». Fuera de él, esas funciones no hacen nada.
REPO = os.environ.get("OO_REPO_JUEGO") or os.path.dirname(os.path.dirname(EDITOR))
REFERENCIAS = os.path.join(os.path.dirname(REPO), "referencias")
DATOS = os.environ.get("OO_DATOS_EDITOR") or os.path.join(AQUI, "datos_usuario")  # otra carpeta para pruebas
# (2.1) Carpeta de mapa_<mapa>.json (por defecto la del editor; las pruebas de migración usan otra para cambiar el mapa sin tocar este).
MAPAS = os.environ.get("OO_MAPAS_EDITOR") or os.path.join(EDITOR, "mapas")


def ruta_mapa(mapa):
    return os.path.join(MAPAS, "mapa_%s.json" % mapa)


SUBIDAS = os.path.join(REFERENCIAS, "subidas_editor")
PUERTO = int(os.environ.get("OO_PUERTO_EDITOR", "7791"))
EXCLUIR = re.compile(r"^(teselas|assets_editor|armas23|revision_armas23|sniper)", re.I)
# (2.1, editor v2) modelos GLB/GLTF y texturas importados en el editor (catálogo y materiales)
ASSETS = os.path.join(REFERENCIAS, "assets_editor")
ASSET = re.compile(r"\.(glb|gltf|png|jpe?g|webp|bin)$", re.I)
IMAGEN = re.compile(r"\.(jpe?g|png|webp|gif)$", re.I)
COLECCION = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")
_cerrojo = threading.RLock()  # (2.1) reentrante: revisar_mapa compacta con el cerrojo puesto


def _formato(ruta):
    """Versión del JSON del mapa (2: con `archivos`, las mallas reales para la vista 3D)."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return int(json.load(f).get("formato", 1))
    except (OSError, ValueError):
        return 0


def exportar_mapas():
    for mapa in ("complejo", "parqueadero"):
        destino = ruta_mapa(mapa)
        cs = os.path.join(REPO, "unity", "Assets", "OperacionOficina", "Generado", mapa.capitalize(), "Mapa%s.cs" % mapa.capitalize())
        if os.path.exists(destino) and os.path.exists(cs) and os.path.getmtime(destino) >= os.path.getmtime(cs) and _formato(destino) >= 2:
            continue
        print("Exportando", mapa, "…", flush=True)
        subprocess.run([sys.executable, "-I", os.path.join(REPO, "herramientas", "exportar_mapa_web.py"), mapa, destino], check=False)


MALLAS_UNITY = os.path.join(REPO, "unity", "Assets", "Resources", "OperacionOficina")
# (2.1) OO_CARTELES_UNITY permite probar el editor con datos vacíos sin borrar los carteles del juego.
CARTELES_UNITY = os.environ.get("OO_CARTELES_UNITY") or os.path.join(REPO, "unity", "Assets", "OperacionOficina", "Resources", "Carteles")
# (2.1) Reglas de destrucción del editor para el juego (destruccion.js). OO_REGLAS_UNITY permite probar sin tocar el repositorio.
REGLAS_UNITY = os.environ.get("OO_REGLAS_UNITY") or os.path.join(REPO, "unity", "Assets", "OperacionOficina", "Resources", "Reglas")
# (2.1 pro f6) «Enviar al juego»: cambios del editor horneados para Unity (juego_unity.js → EditorMapaJuego.cs). OO_EDITORMAPA_UNITY
# permite probar sin tocar el repositorio.
EDITORMAPA_UNITY = os.environ.get("OO_EDITORMAPA_UNITY") or os.path.join(REPO, "unity", "Assets", "OperacionOficina", "Resources", "EditorMapa")
MAPA = re.compile(r"^(complejo|parqueadero)$")


_mallas_cache = {}


def mallas_mapa_rapido(mapa):
    """(2.1) mallas_mapa() tarda ~1,3 s (lee cientos de .bytes): se guarda en memoria hasta que cambie el JSON del mapa o la carpeta."""
    ruta_json = ruta_mapa(mapa)
    carpeta = os.path.join(MALLAS_UNITY, mapa.capitalize(), "Mallas")
    firma = (os.path.getmtime(ruta_json), os.path.getmtime(carpeta) if os.path.isdir(carpeta) else 0)
    c = _mallas_cache.get(mapa)
    if not c or c[0] != firma:
        c = (firma, mallas_mapa(mapa))
        _mallas_cache[mapa] = c
    return c[1]


def mallas_mapa(mapa):
    """(2.1) Las mallas reales del mapa (puertas, coches, objetos) en un solo binario para la vista 3D del editor:
    u32 cuántas, u32 tamaño de cada una (0 si falta) y los archivos OOM1 seguidos, en el orden de `archivos` del JSON del mapa."""
    import struct
    ruta_json = ruta_mapa(mapa)
    with open(ruta_json, encoding="utf-8") as f:
        archivos = json.load(f).get("archivos", [])
    carpeta = os.path.join(MALLAS_UNITY, mapa.capitalize(), "Mallas")
    datos = []
    for a in archivos:
        try:
            with open(os.path.join(carpeta, os.path.basename(a) + ".bytes"), "rb") as f:
                datos.append(f.read())
        except OSError:
            datos.append(b"")
    return struct.pack("<I", len(datos)) + struct.pack("<%dI" % len(datos), *[len(d) for d in datos]) + b"".join(datos)


# (2.1) Modelos reales del juego para el catálogo del editor (modelos_juego.js): objetos sueltos y coches completos.
MODELOS_JUEGO = ("silla", "monitor", "taza", "telefono", "disco_duro", "impresora", "planta", "dispensador_agua", "archivador",
                 "armario", "barril", "tarima", "caja_madera", "caja_carton", "pilsener", "paulaner", "sedan", "suv", "pickup", "hatchback")
COCHES_JUEGO = ("sedan", "suv", "pickup", "hatchback")
RESOURCES_UNITY = os.path.join(REPO, "unity", "Assets", "Resources", "OperacionOficina")  # <Mapa>/Mallas/*.bytes (OOM1)
_modelos_cache = {}


def _mat_unity(p, q, s):
    """Matriz 4x4 (filas) de T(p)·R(q)·S(s), q = (x, y, z, w)."""
    x, y, z, w = q
    n = (x * x + y * y + z * z + w * w) ** 0.5 or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[i][0] * s[0], r[i][1] * s[1], r[i][2] * s[2], p[i]] for i in range(3)] + [[0.0, 0.0, 0.0, 1.0]]


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def _mat_inv_rt(m):
    """Inversa de una matriz de giro + traslación (sin escala)."""
    r = [[m[j][i] for j in range(3)] for i in range(3)]
    t = [-sum(r[i][k] * m[k][3] for k in range(3)) for i in range(3)]
    return [r[i] + [t[i]] for i in range(3)] + [[0.0, 0.0, 0.0, 1.0]]


def modelos_juego():
    """Binario: b'OOMJ', u32 largo del JSON, JSON ({modelos: {clave: {pintura, piezas: [{g, c, p, v, m}]}}}), relleno a 4 bytes,
    u32 cuántas mallas, u32 tamaño de cada una y los archivos OOM1 seguidos. `m` es la matriz local de la pieza en coordenadas del
    editor (Z invertida, columnas como three.js) respecto al origen del objeto; `p` es el tinte si la pieza lleva la pintura del coche."""
    import struct
    rutas = [ruta_mapa(m) for m in ("complejo", "parqueadero")]
    firma = tuple(os.path.getmtime(r) for r in rutas if os.path.exists(r))
    if _modelos_cache.get("firma") == firma:
        return _modelos_cache["datos"]
    zf = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]]
    pinta = re.compile(r"^Metal_([0-9a-fA-F]{6})_([0-9a-fA-F]{6})$")
    modelos, blobs, indice = {}, [], {}
    for mapa, ruta in zip(("complejo", "parqueadero"), rutas):
        if not os.path.exists(ruta):
            continue
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        arch, piezas, mats, grupos = d.get("archivos", []), d.get("piezas", []), d.get("materiales", []), d.get("grupos", [])
        carpeta = os.path.join(RESOURCES_UNITY, mapa.capitalize(), "Mallas")
        por_clave = {}
        for a in piezas:
            if len(a) < 23 or a[16] < 0 or a[16] >= len(arch):
                continue
            clave = re.sub(r"(_\d+)+$", "", arch[a[16]])
            if clave in MODELOS_JUEGO and clave not in modelos:
                por_clave.setdefault(clave, []).append(a)
        for clave, lista in por_clave.items():
            a0 = lista[0]
            base = _mat_unity(a0[17:20], a0[9:13], (1, 1, 1))
            inv = _mat_inv_rt(base)
            elegidas = [a0]
            if clave in COCHES_JUEGO:
                elegidas = []
                for a in lista:
                    loc = [sum(inv[i][k] * v for k, v in enumerate((a[17], a[18], a[19], 1.0))) for i in range(3)]
                    if abs(loc[0]) < 3.2 and abs(loc[1]) < 3.0 and abs(loc[2]) < 1.6:
                        elegidas.append(a)
            salida, pintura = [], None
            for a in elegidas:
                nombre = arch[a[16]]
                if nombre not in indice:
                    try:
                        with open(os.path.join(carpeta, os.path.basename(nombre) + ".bytes"), "rb") as f:
                            blobs.append(f.read())
                    except OSError:
                        continue
                    indice[nombre] = len(blobs) - 1
                rel = _mat_mul(zf, _mat_mul(_mat_mul(inv, _mat_unity(a[17:20], a[9:13], a[20:23])), zf))
                mat = mats[a[13]] if 0 <= a[13] < len(mats) else ["", "#9a9a9a"]
                grp = str(grupos[a[2]]) if 0 <= a[2] < len(grupos) else ""
                vidrio = bool(re.search(r"vidrio|cristal", str(mat[0]) + " " + grp, re.I))
                tinte = None
                mp = pinta.match(str(mat[0]))
                if clave in COCHES_JUEGO and mp and re.match(r"^v:(carroceria|panel_auto)", grp):
                    tinte = "#" + mp.group(2).lower()
                    pintura = pintura or "#" + mp.group(1).lower()
                salida.append({"g": indice[nombre], "c": str(mat[1]), "p": tinte, "v": vidrio,
                               "m": [round(rel[i][j], 6) for j in range(4) for i in range(4)]})
            if salida:
                modelos[clave] = {"pintura": pintura, "piezas": salida, "mapa": mapa}
    js = json.dumps({"modelos": modelos}, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    datos = (b"OOMJ" + struct.pack("<I", len(js)) + js + struct.pack("<I", len(blobs)) +
             struct.pack("<%dI" % len(blobs), *[len(b) for b in blobs]) + b"".join(blobs))
    _modelos_cache.update(firma=firma, datos=datos)
    return datos


def guardar_carteles(mapa, lista):
    """(2.1) Carteles del editor para el juego: Resources/Carteles/carteles_<mapa>.json y la imagen de cada uno en
    Resources/Carteles/<Mapa>/<id>.bytes (PNG; con .bytes Unity no la comprime y Carteles.cs la carga con mipmaps)."""
    import base64
    if not lista:
        # Al abrir el editor la lista llega vacía antes que los cambios: solo se borra si ya no queda ningún cartel guardado.
        quedan = [d for d in leer("cambios").values() if isinstance(d, dict) and d.get("tipo") == "cartel" and d.get("mapa") == mapa]
        if quedan:
            return {"guardados": 0, "ignorado": "quedan %d carteles en cambios.json" % len(quedan)}
        if not os.path.exists(os.path.join(CARTELES_UNITY, "carteles_%s.json" % mapa)):
            return {"guardados": 0, "ignorado": "sin carteles"}  # no se crea un archivo vacío cada vez que se abre el editor
    carpeta = os.path.join(CARTELES_UNITY, mapa.capitalize())
    os.makedirs(carpeta, exist_ok=True)
    salida, nombres = [], set()
    for c in lista:
        cid = re.sub(r"[^A-Za-z0-9_\-]", "_", str(c.get("id", "")))[:60] or secrets.token_hex(6)
        png = str(c.pop("png", ""))
        if png.startswith("data:image/png;base64,"):
            with open(os.path.join(carpeta, cid + ".bytes"), "wb") as f:
                f.write(base64.b64decode(png.split(",", 1)[1]))
        c["id"] = cid
        nombres.add(cid + ".bytes")
        salida.append(c)
    for viejo in os.listdir(carpeta):
        if viejo.endswith(".bytes") and viejo not in nombres:
            os.remove(os.path.join(carpeta, viejo))
            meta = os.path.join(carpeta, viejo + ".meta")
            if os.path.exists(meta):
                os.remove(meta)
    ruta = os.path.join(CARTELES_UNITY, "carteles_%s.json" % mapa)
    texto = json.dumps({"mapa": mapa, "carteles": salida}, ensure_ascii=False, indent=1)
    anterior = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else None
    if anterior != texto:
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
    return {"guardados": len(salida), "ruta": ruta}


def guardar_juego(mapa, datos):
    """(2.1 pro f6) Resources/EditorMapa/cambios_<mapa>.json para Unity (formato «oo-editor-unity», ver LEEME.md)."""
    if not isinstance(datos, dict) or datos.get("formato") != "oo-editor-unity" or datos.get("mapa") != mapa:
        raise ValueError("no es un JSON «oo-editor-unity» de este mapa")
    os.makedirs(EDITORMAPA_UNITY, exist_ok=True)
    ruta = os.path.join(EDITORMAPA_UNITY, "cambios_%s.json" % mapa)
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    with open(ruta + ".tmp", "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(ruta + ".tmp", ruta)
    return {"ruta": ruta, "bytes": len(texto.encode("utf-8")), "objetos": len(datos.get("objetos") or []),
            "originales": len(datos.get("originales") or [])}


def guardar_reglas(mapa, datos):
    """(2.1) Reglas de destrucción del editor: Resources/Reglas/reglas_<mapa>.json (formato en LEEME.md, «Reglas de destrucción»)."""
    reglas = [r for r in (datos.get("reglas") or []) if isinstance(r, dict)]
    objetos = [o for o in (datos.get("objetos") or []) if isinstance(o, dict)]
    os.makedirs(REGLAS_UNITY, exist_ok=True)
    ruta = os.path.join(REGLAS_UNITY, "reglas_%s.json" % mapa)
    texto = json.dumps({"version": 1, "mapa": mapa, "reglas": reglas, "objetos": objetos}, ensure_ascii=False, indent=1)
    anterior = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else None
    if anterior != texto:
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
    return {"reglas": len(reglas), "objetos": len(objetos), "ruta": ruta}


# (2.1) Mapa satelital real para calcar: mosaico de teselas de Esri World Imagery (sin clave) centrado en unas coordenadas,
# recortado a un cuadrado de 2 x radio metros. Las teselas se guardan en referencias/subidas_editor/teselas (sirven sin conexión).
TESELAS = os.path.join(SUBIDAS, "teselas")
URL_TESELA = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"


def _tesela(z, x, y):
    import urllib.request
    ruta = os.path.join(TESELAS, str(z), str(x), "%d.jpg" % y)
    if not os.path.exists(ruta):
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        pet = urllib.request.Request(URL_TESELA.format(z=z, x=x, y=y), headers={"User-Agent": "OperacionOficina-editor/2.1"})
        with urllib.request.urlopen(pet, timeout=20) as r:
            datos = r.read()
        with open(ruta + ".tmp", "wb") as f:
            f.write(datos)
        os.replace(ruta + ".tmp", ruta)
    return ruta


def satelital(lat, lon, radio, z):
    import math
    from concurrent.futures import ThreadPoolExecutor
    from PIL import Image
    if not (-85 < lat < 85 and -180 <= lon <= 180):
        raise ValueError("coordenadas fuera de rango")
    radio = max(30.0, min(800.0, radio))
    z = max(15, min(20, z))
    # Que la imagen no pase de 4096 px (el máximo seguro de una textura).
    while z > 15 and 2 * radio / (156543.03392 * math.cos(math.radians(lat)) / 2 ** z) > 4096:
        z -= 1
    n = 2 ** z
    mpp = 156543.03392 * math.cos(math.radians(lat)) / n
    fx = (lon + 180.0) / 360.0 * n * 256
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n * 256
    rpx = radio / mpp
    x0, x1 = int((fx - rpx) // 256), int((fx + rpx) // 256)
    y0, y1 = int((fy - rpx) // 256), int((fy + rpx) // 256)
    lienzo = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256), (40, 40, 40))
    pares = [(tx, ty) for tx in range(x0, x1 + 1) for ty in range(y0, y1 + 1)]
    with ThreadPoolExecutor(8) as ex:
        rutas = list(ex.map(lambda t: (t, _tesela(z, t[0] % n, t[1])), pares))
    for (tx, ty), ruta in rutas:
        try:
            lienzo.paste(Image.open(ruta).convert("RGB"), ((tx - x0) * 256, (ty - y0) * 256))
        except OSError:
            pass
    cx, cy = fx - x0 * 256, fy - y0 * 256
    img = lienzo.crop((round(cx - rpx), round(cy - rpx), round(cx + rpx), round(cy + rpx)))
    os.makedirs(SUBIDAS, exist_ok=True)
    nombre = "satelital_%.6f_%.6f_z%d_r%d.jpg" % (lat, lon, z, round(radio))
    img.save(os.path.join(SUBIDAS, nombre), quality=90)
    rel = "subidas_editor/" + nombre
    return {"id": rel, "url": "/_blob/" + urllib.parse.quote(rel), "nombre": nombre, "ancho_m": round(img.width * mpp, 3),
            "metros_por_pixel": round(mpp, 4), "zoom": z, "teselas": len(pares), "lat": lat, "lon": lon}


# (2.1 pro f6) Rendimiento: antes cada escritura releía y reescribía el JSON entero de la colección (cambios.json pasa de 500 KB y el
# editor escribe varias veces por segundo al arrastrar). Ahora cada colección vive en memoria; cada escritura añade una línea al diario
# <col>.diario.jsonl ({"id", "data"}; data null = borrado) y el JSON completo se reescribe («compacta») un segundo después de la última
# escritura o cada 200 líneas. Compatible: el formato de <col>.json no cambia, otros programas lo pueden seguir leyendo (como mucho con
# un segundo de retraso) y escribiendo (si el archivo cambia por fuera, se vuelve a leer y se le aplica el diario pendiente).
COMPACTAR_TRAS = float(os.environ.get("OO_COMPACTAR_TRAS", "1.0"))
COMPACTAR_CADA = 200
_cols = {}


def _ruta(col):
    return os.path.join(DATOS, col + ".json")


def _firma(ruta):
    try:
        st = os.stat(ruta)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def _leer_disco(col):
    ruta = _ruta(col)
    docs = {}
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            docs = json.load(f)
    diario = ruta[:-5] + ".diario.jsonl"
    pendientes = 0
    if os.path.exists(diario):
        with open(diario, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea:
                    continue
                try:
                    e = json.loads(linea)
                except ValueError:
                    break  # última línea a medio escribir (corte de luz): lo anterior vale
                if e.get("data") is None:
                    docs.pop(e.get("id"), None)
                else:
                    docs[e.get("id")] = e["data"]
                pendientes += 1
    return docs, pendientes


def _coleccion(col):
    c = _cols.get(col)
    firma = _firma(_ruta(col))
    if c is None or c["firma"] != firma:
        docs, pendientes = _leer_disco(col)
        c = {"docs": docs, "firma": firma, "pendientes": pendientes, "temporizador": None, "respuesta": None}
        _cols[col] = c
        if pendientes:
            _programar(col, c)
    return c


def leer(col):
    """Documentos de la colección (el diccionario vivo: solo se modifica con el cerrojo y luego escribir_doc o escribir)."""
    return _coleccion(col)["docs"]


def _compactar(col):
    with _cerrojo:
        c = _cols.get(col)
        if c is None:
            return
        if c["temporizador"] is not None:
            c["temporizador"].cancel()
            c["temporizador"] = None
        if not c["pendientes"]:
            return
        os.makedirs(DATOS, exist_ok=True)
        ruta = _ruta(col)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(c["docs"], f, ensure_ascii=False, indent=1, sort_keys=True)
        os.replace(tmp, ruta)
        diario = ruta[:-5] + ".diario.jsonl"
        if os.path.exists(diario):
            os.remove(diario)
        c["firma"] = _firma(ruta)
        c["pendientes"] = 0


def _programar(col, c):
    if c["temporizador"] is not None:
        c["temporizador"].cancel()
    t = threading.Timer(COMPACTAR_TRAS, _compactar, args=(col,))
    t.daemon = True
    c["temporizador"] = t
    t.start()


def escribir_doc(col, doc, datos):
    """Pone (o borra, con datos None) un documento: una línea en el diario, sin reescribir el JSON entero."""
    c = _coleccion(col)
    c["respuesta"] = None
    if datos is None:
        c["docs"].pop(doc, None)
    else:
        c["docs"][doc] = datos
    os.makedirs(DATOS, exist_ok=True)
    diario = _ruta(col)[:-5] + ".diario.jsonl"
    with open(diario, "a", encoding="utf-8") as f:
        f.write(json.dumps({"id": doc, "data": datos}, ensure_ascii=False, separators=(",", ":")) + "\n")
    c["pendientes"] += 1
    if c["pendientes"] >= COMPACTAR_CADA:
        threading.Thread(target=_compactar, args=(col,), daemon=True).start()
    else:
        _programar(col, c)


def escribir(col, docs):
    """Reescribe la colección entera (compatibilidad)."""
    c = _coleccion(col)
    c["respuesta"] = None
    c["docs"] = docs
    c["pendientes"] = max(1, c["pendientes"])
    _programar(col, c)


def respuesta_coleccion(col):
    """(2.1 pro f6) Cuerpo JSON de GET /api/db/<col>, guardado hasta la próxima escritura: el editor lo pide cada 2 s por colección
    y pestaña; antes cada lectura volvía a leer y serializar el archivo entero con el cerrojo puesto y las escrituras esperaban."""
    c = _coleccion(col)
    if c.get("respuesta") is None:
        c["respuesta"] = json.dumps({"docs": [{"id": k, "data": v} for k, v in c["docs"].items()]}, ensure_ascii=False).encode("utf-8")
    return c["respuesta"]


def compactar_todo():
    for col in list(_cols):
        _compactar(col)


# (2.1) Referencias a piezas del mapa. Los datos guardan las piezas del mapa original por su índice en mapa_<mapa>.json; si el mapa se
# regenera (Godot → Generado/<Mapa>/Mapa<Mapa>.cs → exportar_mapa_web.py) los índices se corren (pasó el 4/11/2026 y el JSON del juego de la
# 2.1.2 salió con 659 de 685 piezas equivocadas). En la carpeta de datos se guarda `_base_mapa_<mapa>.json`, copia del mapa con el que
# casan los datos. Al arrancar y cada vez que una pestaña pide el mapa, revisar_mapa() compara: si el mapa cambió, resuelve cada índice
# usado (migrar_refs.plan: `antes` de cada documento + firma de la pieza en el mapa viejo), y SOLO si después todos los `antes` casan con
# el mapa nuevo guarda un respaldo en `respaldos_refs/<fecha>_<mapa>/` (colecciones tal cual, mapa viejo e informe.json) y reescribe
# cambios, versiones, grupos y etiquetas. Lo que nombraba piezas que ya no existen se aparta a `sin_pieza.json` (y se lista en el aviso);
# nunca se deja apuntando a otra pieza. Si la migración no sale limpia no se toca nada y queda el aviso (GET /api/mapa_estado).
# Cada pestaña manda en sus escrituras la versión del mapa que cargó (cabecera X-OO-Mapas, local.js): si nombran piezas y la versión
# no es la vigente, se rechazan con 409 para que una pestaña con el mapa viejo no escriba índices viejos.
_ver_archivo = {}   # ruta -> (firma de os.stat, sha1 corto)
_vigente = {}       # mapa -> versión del mapa con la que casan los datos
_estado_mapa = {}   # mapa -> {aviso, migracion}


def version_archivo(ruta):
    st = _firma(ruta)
    if st is None:
        return None
    c = _ver_archivo.get(ruta)
    if c and c[0] == st:
        return c[1]
    import hashlib
    with open(ruta, "rb") as f:
        h = hashlib.sha1(f.read()).hexdigest()[:16]
    _ver_archivo[ruta] = (st, h)
    return h


def _ruta_base(mapa):
    return os.path.join(DATOS, "_base_mapa_%s.json" % mapa)


def _poner_base(mapa, ruta):
    import shutil
    os.makedirs(DATOS, exist_ok=True)
    tmp = _ruta_base(mapa) + ".tmp"
    shutil.copyfile(ruta, tmp)
    os.replace(tmp, _ruta_base(mapa))


def revisar_mapa(mapa):
    """Versión vigente del mapa para los datos (migra las referencias si el mapa cambió). None si no hay JSON del mapa."""
    ruta = ruta_mapa(mapa)
    with _cerrojo:
        actual = version_archivo(ruta)
        if actual is None:
            return None
        if _vigente.get(mapa) == actual:
            return actual
        v_base = version_archivo(_ruta_base(mapa))
        if v_base == actual:
            _vigente[mapa] = actual
            return actual
        cols = {c: leer(c) for c in migrar_refs.COLECCIONES}
        if not migrar_refs.refs_usadas(cols, mapa):
            _poner_base(mapa, ruta)  # los datos no nombran piezas de este mapa: solo se apunta con qué mapa van
            _vigente[mapa] = actual
            return actual
        with open(ruta, encoding="utf-8") as f:
            nuevo = json.load(f)
        viejo = None
        if v_base is not None:
            with open(_ruta_base(mapa), encoding="utf-8") as f:
                viejo = json.load(f)
        p = migrar_refs.plan(cols, mapa, nuevo, viejo)
        _vigente[mapa] = actual
        if p["identidad"]:
            _poner_base(mapa, ruta)  # el mapa cambió pero ninguna pieza usada se movió de sitio en la lista
            _estado_mapa[mapa] = {"comprobacion": {"antes": p["despues"], "fecha": time.strftime("%Y-%m-%d %H:%M:%S")}}
            return actual
        if not p["valida"]:
            _estado_mapa[mapa] = {"aviso": "El mapa %s cambió y %d referencias a piezas no se pudieron migrar con seguridad: no se ha tocado "
                                           "nada. Revisa con herramientas/editor_mapa/verificar_refs.py antes de editar o enviar al juego. %s" % (
                                               mapa, p["despues"][1], migrar_refs.informe_texto(p, viejo, nuevo).splitlines()[0])}
            print("AVISO:", _estado_mapa[mapa]["aviso"], flush=True)
            return actual
        carpeta = migrar_refs.respaldar(DATOS, mapa, _ruta_base(mapa) if v_base is not None else None)
        for col, docs in p["nuevas"].items():
            c = _coleccion(col)
            if not docs and not c["docs"]:
                continue
            c["docs"] = docs
            c["respuesta"] = None
            c["pendientes"] = max(1, c["pendientes"])
            _compactar(col)
        est = p["est"]
        if est["apartados"]:
            for k, v in migrar_refs.apartados_como_docs(est, actual).items():
                escribir_doc(migrar_refs.APARTADOS, k, v)
            _compactar(migrar_refs.APARTADOS)
        _poner_base(mapa, ruta)
        res = p["res"]
        informe = {"fecha": time.strftime("%Y-%m-%d %H:%M:%S"), "mapa": mapa, "modo_de_los_datos": res["modo"], "version_vieja": v_base,
                   "version_nueva": actual, "piezas_nuevas": len(nuevo["piezas"]), "piezas_viejas": len(viejo["piezas"]) if viejo else None,
                   "referencias_usadas": res["usadas"], "metodos": dict(collections.Counter(res["metodo"].values())),
                   "cambiadas": est["cambiadas"], "iguales": est["iguales"], "documentos_renombrados": est["renombrados"],
                   "sin_pieza": res["sin"], "conflictos": res["conflictos"], "choques": est["choques"],
                   "apartados": [{k: a[k] for k in ("coleccion", "version", "id", "refs_viejas", "piezas_viejas", "entero")} for a in est["apartados"]],
                   "antes_casan_despues": p["despues"], "respaldo": carpeta}
        with open(os.path.join(carpeta, "informe.json"), "w", encoding="utf-8") as f:
            json.dump(informe, f, ensure_ascii=False, indent=1)
        _estado_mapa[mapa] = {"migracion": informe}
        if est["apartados"]:
            _estado_mapa[mapa]["aviso"] = ("%d cambios nombraban piezas que ya no existen en el mapa %s: se apartaron a %s.json (respaldo en %s)" % (
                len(est["apartados"]), mapa, migrar_refs.APARTADOS, carpeta))
        print("Mapa %s regenerado: %d referencias migradas (datos del mapa %s), %d documentos renombrados%s. Respaldo: %s" % (
            mapa, est["cambiadas"], res["modo"], est["renombrados"],
            (", %d apartados por piezas que ya no existen" % len(est["apartados"])) if est["apartados"] else "", carpeta), flush=True)
        return actual


def fusionar(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and v.get("__delete__") is True:
            a.pop(k, None)
        elif isinstance(v, dict) and isinstance(a.get(k), dict):
            fusionar(a[k], v)
        else:
            a[k] = v
    return a


def fotos():
    lista = []
    for raiz, dirs, archivos in os.walk(REFERENCIAS):
        rel_raiz = os.path.relpath(raiz, REFERENCIAS)
        dirs[:] = [d for d in dirs if not EXCLUIR.match(d)]
        for a in archivos:
            if not IMAGEN.search(a):
                continue
            rel = os.path.normpath(os.path.join(rel_raiz, a)).replace(os.sep, "/")
            if rel.startswith("./"):
                rel = rel[2:]
            ruta = os.path.join(raiz, a)
            lista.append({"id": rel, "url": "/_blob/" + urllib.parse.quote(rel), "nombre": rel, "contentType": mimetypes.guess_type(a)[0] or "image/jpeg",
                          "sizeBytes": os.path.getsize(ruta), "creado": os.path.getmtime(ruta)})
    lista.sort(key=lambda x: x["creado"])
    return lista


class Servidor(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True
    # (2.1) En Windows SO_REUSEADDR deja que dos servidores escuchen a la vez en el mismo puerto y las peticiones van a cualquiera de
    # los dos (pasó el 7/11: un servidor colgado en el 7792 se quedaba las peticiones de otro nuevo). Puerto exclusivo o error.
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        import socket
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=EDITOR, **k)

    def log_message(self, formato, *args):
        if "/api/" in self.path and self.command != "GET":
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    def _json(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _binario(self, datos):
        import hashlib
        etiqueta = '"%s"' % hashlib.blake2b(datos, digest_size=12).hexdigest()
        if self.headers.get("If-None-Match") == etiqueta:
            self.send_response(304)
            self.send_header("ETag", etiqueta)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("ETag", etiqueta)
        self.end_headers()
        self.wfile.write(datos)

    def _cuerpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _ruta_db(self):
        partes = urllib.parse.urlparse(self.path).path.strip("/").split("/")
        if len(partes) < 3 or partes[0] != "api" or partes[1] != "db" or not COLECCION.match(partes[2]):
            return None, None
        doc = urllib.parse.unquote(partes[3]) if len(partes) > 3 else None
        if doc is not None and not re.match(r"^[A-Za-z0-9_\-.~:@+]{1,200}$", doc):
            return None, None
        return partes[2], doc

    def _rechazo_refs(self, col, doc, datos):
        """(2.1) Si lo que se escribe (o lo que había en ese documento) nombra piezas del mapa por índice y la pestaña no cargó la
        versión vigente del mapa, responde 409 y devuelve True: sus índices son de otro mapa y caerían en piezas equivocadas."""
        if col not in migrar_refs.COLECCIONES:
            return False
        mapas = set()
        for d in (datos, leer(col).get(doc) if doc else None):
            m = migrar_refs.mapa_de(d)
            if m and MAPA.match(str(m)):
                mapas.add(m)
        if not mapas:
            return False
        dadas = {}
        for parte in (self.headers.get("X-OO-Mapas") or "").split(","):
            k, _, v = parte.strip().partition("=")
            if k:
                dadas[k] = v
        for mapa in mapas:
            vig = revisar_mapa(mapa)
            if vig and dadas.get(mapa) != vig:
                self._json({"error": "El mapa «%s» del juego se regeneró y las referencias a sus piezas se migraron. Recarga la página (F5) "
                                     "para seguir editando: esta pestaña tiene el mapa viejo y sus cambios caerían en otras piezas." % mapa,
                            "code": "failed_precondition", "mapa": mapa, "vigente": vig}, 409)
                return True
        return False

    def do_GET(self):
        ruta = urllib.parse.urlparse(self.path).path
        if ruta.startswith("/api/db/"):
            col, _ = self._ruta_db()
            if not col:
                return self._json({"error": "ruta"}, 400)
            with _cerrojo:
                cuerpo = respuesta_coleccion(col)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            if _vigente:  # (2.1) la pestaña compara con la versión del mapa que cargó y avisa si hay que recargar
                self.send_header("X-OO-Mapas-Vigentes", ",".join("%s=%s" % kv for kv in sorted(_vigente.items())))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        m_json = re.match(r"^/mapas/mapa_(complejo|parqueadero)\.json$", ruta)
        if m_json:  # (2.1) antes de dar el mapa se migran las referencias si cambió; la versión va en una cabecera
            mapa = m_json.group(1)
            try:
                version = revisar_mapa(mapa)
                with open(ruta_mapa(mapa), "rb") as f:
                    datos = f.read()
            except OSError:
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(datos)))
            self.send_header("Cache-Control", "no-cache")
            if version:
                self.send_header("X-OO-Version-Mapa", version)
            self.end_headers()
            self.wfile.write(datos)
            return
        if ruta == "/api/mapa_estado":
            out = {}
            for mapa in ("complejo", "parqueadero"):
                try:
                    v = revisar_mapa(mapa)
                except (OSError, ValueError) as e:
                    out[mapa] = {"error": str(e)}
                    continue
                out[mapa] = dict(_estado_mapa.get(mapa) or {}, version=v, vigente=_vigente.get(mapa))
            return self._json(out)
        if ruta == "/api/fotos":
            return self._json({"assets": fotos(), "usage": {}})
        if ruta == "/_modelos":
            try:
                with _cerrojo:
                    datos = modelos_juego()
            except (OSError, ValueError, KeyError, IndexError, TypeError):
                return self.send_error(404)
            return self._binario(datos)
        if ruta.startswith("/_mallas/"):
            mapa = ruta[len("/_mallas/"):]
            if not MAPA.match(mapa):
                return self.send_error(404)
            try:
                with _cerrojo:
                    datos = mallas_mapa_rapido(mapa)
            except (OSError, ValueError):
                return self.send_error(404)
            return self._binario(datos)
        if ruta == "/api/satelital":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            try:
                return self._json(satelital(float(q["lat"][0]), float(q["lon"][0]), float(q.get("radio", ["250"])[0]), int(q.get("z", ["19"])[0])))
            except Exception as e:  # sin conexión, coordenadas malas…
                return self._json({"error": str(e)}, 400)
        if ruta.startswith("/_blob/"):
            rel = urllib.parse.unquote(ruta[len("/_blob/"):])
            completo = os.path.realpath(os.path.join(REFERENCIAS, rel))
            if not completo.startswith(os.path.realpath(REFERENCIAS) + os.sep) or not os.path.isfile(completo):
                return self.send_error(404)
            with open(completo, "rb") as f:
                datos = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(completo)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(datos)))
            self.send_header("Cache-Control", "max-age=3600")
            self.end_headers()
            self.wfile.write(datos)
            return
        if ruta == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        ruta = urllib.parse.urlparse(self.path).path
        if ruta == "/api/fotos":
            nombre = re.sub(r"[^A-Za-z0-9_.\-]", "_", urllib.parse.unquote(self.headers.get("X-Nombre") or "foto.jpg"))[-80:]
            if not IMAGEN.search(nombre):
                nombre += ".jpg"
            os.makedirs(SUBIDAS, exist_ok=True)
            final = time.strftime("%Y%m%d_%H%M%S_") + nombre
            with open(os.path.join(SUBIDAS, final), "wb") as f:
                f.write(self._cuerpo())
            rel = "subidas_editor/" + final
            return self._json({"id": rel, "url": "/_blob/" + urllib.parse.quote(rel), "sizeBytes": os.path.getsize(os.path.join(SUBIDAS, final)),
                               "contentType": mimetypes.guess_type(final)[0] or "image/jpeg"})
        if ruta == "/api/assets":
            nombre = re.sub(r"[^A-Za-z0-9_.\-]", "_", urllib.parse.unquote(self.headers.get("X-Nombre") or "modelo.glb"))[-80:]
            if not ASSET.search(nombre):
                return self._json({"error": "tipo de archivo no admitido (glb, gltf, bin, png, jpg, webp)"}, 400)
            os.makedirs(ASSETS, exist_ok=True)
            final = time.strftime("%Y%m%d_%H%M%S_") + nombre
            with open(os.path.join(ASSETS, final), "wb") as f:
                f.write(self._cuerpo())
            rel = "assets_editor/" + final
            return self._json({"id": rel, "url": "/_blob/" + urllib.parse.quote(rel), "nombre": nombre, "sizeBytes": os.path.getsize(os.path.join(ASSETS, final))})
        if ruta.startswith("/api/carteles/"):
            mapa = ruta[len("/api/carteles/"):]
            if not MAPA.match(mapa):
                return self._json({"error": "mapa"}, 400)
            datos = json.loads(self._cuerpo() or b"{}")
            with _cerrojo:
                res = guardar_carteles(mapa, list(datos.get("carteles") or []))
            return self._json(res)
        if ruta.startswith("/api/juego/"):
            mapa = ruta[len("/api/juego/"):]
            if not MAPA.match(mapa):
                return self._json({"error": "mapa"}, 400)
            try:
                datos = json.loads(self._cuerpo() or b"{}")
                res = guardar_juego(mapa, datos)
            except (ValueError, OSError) as e:
                return self._json({"error": str(e)}, 400)
            return self._json(res)
        if ruta.startswith("/api/reglas/"):
            mapa = ruta[len("/api/reglas/"):]
            if not MAPA.match(mapa):
                return self._json({"error": "mapa"}, 400)
            datos = json.loads(self._cuerpo() or b"{}")
            with _cerrojo:
                res = guardar_reglas(mapa, datos if isinstance(datos, dict) else {})
            return self._json(res)
        col, doc = self._ruta_db()
        if not col:
            return self._json({"error": "ruta"}, 400)
        datos = json.loads(self._cuerpo() or b"{}")
        doc = doc or secrets.token_hex(10)
        with _cerrojo:
            if self._rechazo_refs(col, doc, datos):
                return
            escribir_doc(col, doc, datos)
        return self._json({"id": doc})

    def do_PUT(self):
        col, doc = self._ruta_db()
        if not col or not doc:
            return self._json({"error": "ruta"}, 400)
        datos = json.loads(self._cuerpo() or b"{}")
        with _cerrojo:
            if self._rechazo_refs(col, doc, datos):
                return
            escribir_doc(col, doc, datos)
        return self._json({"id": doc})

    def do_PATCH(self):
        col, doc = self._ruta_db()
        if not col or not doc:
            return self._json({"error": "ruta"}, 400)
        datos = json.loads(self._cuerpo() or b"{}")
        with _cerrojo:
            docs = leer(col)
            if doc not in docs:
                return self._json({"error": "no existe", "code": "invalid_argument"}, 400)
            if self._rechazo_refs(col, doc, datos):
                return
            fusionar(docs[doc], datos)
            escribir_doc(col, doc, docs[doc])  # (invalida la respuesta guardada)
        return self._json({"id": doc})

    def do_DELETE(self):
        col, doc = self._ruta_db()
        if not col or not doc:
            return self._json({"error": "ruta"}, 400)
        with _cerrojo:
            if doc in leer(col):
                if self._rechazo_refs(col, doc, None):
                    return
                escribir_doc(col, doc, None)
        return self._json({"id": doc})


if __name__ == "__main__":
    # El editor está en TypeScript (editor/src); el navegador carga lo compilado en editor/js.
    if not os.path.isfile(os.path.join(EDITOR, "js", "nucleo", "editor.js")):
        print("Falta compilar el editor: en la raíz del repo ejecuta `npm ci` y `npm run build` (o `npm run dev` mientras editas).")
        sys.exit(1)
    if MAPAS == os.path.join(EDITOR, "mapas"):
        exportar_mapas()
    # Un diario que quedó de un cierre brusco se aplica y se compacta al arrancar.
    if os.path.isdir(DATOS):
        for nombre in os.listdir(DATOS):
            if nombre.endswith(".diario.jsonl"):
                with _cerrojo:
                    _coleccion(nombre[:-len(".diario.jsonl")])
                _compactar(nombre[:-len(".diario.jsonl")])
    # (2.1) Si el mapa se regeneró desde la última vez, las referencias a sus piezas se migran ahora (con respaldo).
    for _m in ("complejo", "parqueadero"):
        try:
            revisar_mapa(_m)
        except (OSError, ValueError, KeyError, IndexError, TypeError) as e:
            print("No se pudieron revisar las referencias del mapa %s: %s" % (_m, e), flush=True)
    try:
        servidor = Servidor(("127.0.0.1", PUERTO), Manejador)
    except OSError as e:
        print("No se puede abrir el editor en el puerto %d (%s): ¿hay otro editor abierto? Ciérralo o usa OO_PUERTO_EDITOR." % (PUERTO, e),
              flush=True)
        compactar_todo()
        sys.exit(1)
    print("Editor del mapa en http://127.0.0.1:%d/  (Ctrl+C para cerrar)" % PUERTO, flush=True)
    if "--sin-navegador" not in sys.argv:
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:%d/" % PUERTO)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        compactar_todo()
