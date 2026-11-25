"""Operaciones sobre los datos de un proyecto desde el servidor (sin editor): objetos del mapa, catálogo, versiones, petición de terreno,
exportar e importar. Las usan el servidor MCP (mcp_servidor.py) y la API REST.

Los documentos tienen el mismo formato que escribe el editor (editor/src/nucleo/editor.ts → docNuevo, limpiarDatos, guardarVersion), y
cada escritura sube la versión de la colección, así un editor abierto en ese proyecto ve los cambios al momento.
"""
import base64
import json
import math
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from . import config, db

COLS_VERSION = ["terreno", "grupos", "zonas", "guias", "calcos", "etiquetas", "reglas"]   # = productividad.ts
MAX_EXPORTAR_ARCHIVOS = 25 * 1024 * 1024


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def error(msg: str, code: str = "invalid_argument", status: int = 400):
    return HTTPException(status, {"error": msg, "code": code})


def _b36(n: int) -> str:
    s, a = "", "0123456789abcdefghijklmnopqrstuvwxyz"
    while True:
        n, r = divmod(n, 36)
        s = a[r] + s
        if n == 0:
            return s


def nuevo_id(mapa: str) -> str:
    """Igual que nuevoId() del editor: n-<mapa>-<tiempo en base 36><azar>."""
    return "n-%s-%s%s" % (mapa, _b36(int(time.time() * 1000)), "".join(secrets.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(5)))


def r3(v):
    return round(v, 3) if isinstance(v, (int, float)) and not isinstance(v, bool) else v


def limpiar_datos(d: dict, tipo: str) -> dict:
    """= limpiarDatos() del editor para lo que se crea desde aquí (objetos y muros)."""
    o = {k: r3(v) for k, v in d.items() if v is not None}
    o.setdefault("giroY", 0)
    o.setdefault("origen", "base")
    if tipo.split(":")[0] == "muro":
        g, L = math.radians(o.get("giroY", 0)), o.get("sx", 0) / 2
        o["x1"], o["z1"] = r3(o["x"] - math.cos(g) * L), r3(o["z"] + math.sin(g) * L)
        o["x2"], o["z2"] = r3(o["x"] + math.cos(g) * L), r3(o["z"] - math.sin(g) * L)
    return o


def doc_nuevo(mapa: str, id_: str, tipo: str, datos: dict, autor: str, props: dict | None = None) -> dict:
    t = ahora_iso()
    d = {"esquema": 2, "mapa": mapa, "accion": "agregar", "ref": None, "id_objeto": id_, "tipo": tipo, "capa": "General",
         "datos": limpiar_datos(datos, tipo), "antes": None, "texto": "", "fotos": [], "creado": t, "actualizado": t, "autor": autor}
    if props:
        d["props"] = props
    return d


# ───────────── documentos ─────────────

async def leer_col(con, pid, col: str) -> dict:
    filas = await con.fetch("SELECT doc_id, datos FROM documentos WHERE proyecto_id = $1 AND coleccion = $2", pid, col)
    return {f["doc_id"]: json.loads(f["datos"]) for f in filas}


async def escribir(pid, cambios: dict[str, list[tuple[str, dict | None]]], usuario_id) -> None:
    """cambios = {coleccion: [(doc_id, datos o None para borrar)]}, todo en una transacción; sube la versión de cada colección."""
    async with db.pool.acquire() as con, con.transaction():
        for col, docs in cambios.items():
            for doc_id, datos in docs:
                if datos is None:
                    await con.execute("DELETE FROM documentos WHERE proyecto_id = $1 AND coleccion = $2 AND doc_id = $3", pid, col, doc_id)
                else:
                    crudo = json.dumps(datos, ensure_ascii=False)
                    if len(crudo) > config.MAX_DOC_MB * 1024 * 1024:
                        raise error("El documento %s pasa de %d MB." % (doc_id, config.MAX_DOC_MB), "resource_exhausted", 413)
                    await con.execute(
                        "INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) VALUES ($1, $2, $3, $4, $5) "
                        "ON CONFLICT (proyecto_id, coleccion, doc_id) DO UPDATE SET datos = excluded.datos, actualizado = now(), "
                        "actualizado_por = excluded.actualizado_por", pid, col, doc_id, crudo, usuario_id)
            await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) VALUES ($1, $2, 1) "
                              "ON CONFLICT (proyecto_id, coleccion) DO UPDATE SET version = colecciones.version + 1", pid, col)
        await con.execute("UPDATE proyectos SET actualizado = now() WHERE id = $1", pid)


async def proyecto(con, pid) -> dict:
    p = await con.fetchrow("SELECT id, nombre, descripcion, plantilla, mapa_inicial, creado, actualizado FROM proyectos WHERE id = $1", pid)
    if not p:
        raise error("Ese proyecto no existe.", "not_found", 404)
    return dict(p)


# ───────────── catálogo (lo genera scripts/catalogo.mjs en el build) ─────────────

_catalogo: dict | None = None
_catalogo_mtime = 0.0


def catalogo() -> dict:
    global _catalogo, _catalogo_mtime
    ruta = Path(config.DIR_EDITOR) / "js" / "catalogo_items.json"
    try:
        m = ruta.stat().st_mtime
    except OSError:
        return {"categorias": {}, "items": []}
    if _catalogo is None or m != _catalogo_mtime:
        _catalogo, _catalogo_mtime = json.loads(ruta.read_text(encoding="utf-8")), m
    return _catalogo


def _sin_tilde(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn").lower()


def buscar_catalogo(texto: str = "", categoria: str = "", limite: int = 30) -> list[dict]:
    ws = _sin_tilde(texto).split()
    out = []
    for i in catalogo()["items"]:
        if categoria and i["categoria"] != categoria:
            continue
        t = _sin_tilde(" ".join([i["nombre"], i["categoria_nombre"], i["id"].replace("_", " ")]))
        if all(w in t for w in ws):
            d = i.get("datos") or {}
            out.append({"id": i["id"], "nombre": i["nombre"], "categoria": i["categoria_nombre"], "tipo": i["tipo"],
                        "tamano_m": [d.get("sx"), d.get("sy"), d.get("sz")]})
    return out[:max(1, min(200, limite))]


def item_catalogo(ident: str) -> dict | None:
    for i in catalogo()["items"]:
        if i["id"] == ident or i["tipo"] == ident:
            return i
    return None


# ───────────── objetos del mapa ─────────────

def _es_objeto(d: dict, mapa: str) -> bool:
    return isinstance(d, dict) and d.get("mapa") == mapa and d.get("accion") == "agregar" and d.get("tipo") != "nota"


async def objetos(pid, mapa: str, tipo: str = "", cerca: list | None = None, radio: float = 0, limite: int = 200) -> dict:
    async with db.pool.acquire() as con:
        docs = await leer_col(con, pid, "cambios")
    lista = []
    for doc_id, d in docs.items():
        if not _es_objeto(d, mapa):
            continue
        if tipo and not str(d.get("tipo", "")).startswith(tipo):
            continue
        x, z = d.get("datos", {}).get("x", 0), d.get("datos", {}).get("z", 0)
        if cerca and radio and math.hypot(x - cerca[0], z - cerca[1]) > radio:
            continue
        dd = d.get("datos", {})
        lista.append({"id": d.get("id_objeto") or doc_id, "doc": doc_id, "tipo": d.get("tipo"), "nombre": (d.get("props") or {}).get("nombre"),
                      "x": dd.get("x"), "y": dd.get("y"), "z": dd.get("z"), "giro": dd.get("giroY", 0),
                      "tamano_m": [dd.get("sx"), dd.get("sy"), dd.get("sz")], "capa": d.get("capa")})
    lista.sort(key=lambda o: o["id"])
    return {"total": len(lista), "objetos": lista[:max(1, min(2000, limite))]}


async def tipos_validos(pid) -> dict:
    """Tipos de modelos importados en el proyecto (modelo:<id> → nombre)."""
    async with db.pool.acquire() as con:
        assets = await leer_col(con, pid, "assets")
    return {"modelo:" + k: v.get("nombre", k) for k, v in assets.items() if isinstance(v, dict) and v.get("tipo") == "modelo"}


async def colocar(pid, mapa: str, objetos_: list[dict], usuario) -> dict:
    if not objetos_ or len(objetos_) > 500:
        raise error("Entre 1 y 500 objetos por llamada.")
    modelos = await tipos_validos(pid)
    docs, ids, errores = [], [], []
    for j, o in enumerate(objetos_):
        tipo = str(o.get("tipo", ""))
        it = item_catalogo(tipo)
        if not it and tipo not in modelos:
            errores.append("#%d: «%s» no está en el catálogo ni en los modelos del proyecto (usa buscar_catalogo)" % (j, tipo))
            continue
        try:
            x, z = float(o["x"]), float(o["z"])
        except (KeyError, TypeError, ValueError):
            errores.append("#%d: faltan x o z" % j)
            continue
        datos = dict(it["datos"]) if it else {"sx": 1, "sy": 1, "sz": 1}
        datos.update({"x": x, "y": float(o.get("y") or 0), "z": z, "giroY": float(o.get("giro") or 0)})
        f = o.get("escala")
        if isinstance(f, (int, float)) and f > 0 and f != 1:
            for k in ("sx", "sy", "sz"):
                if isinstance(datos.get(k), (int, float)):
                    datos[k] = datos[k] * f
        if isinstance(o.get("datos"), dict):
            datos.update({k: v for k, v in o["datos"].items() if k not in ("x", "z")})
        id_ = nuevo_id(mapa) + str(j)
        props = {"nombre": str(o["nombre"])[:80]} if o.get("nombre") else None
        docs.append((id_, doc_nuevo(mapa, id_, it["tipo"] if it else tipo, datos, usuario["nombre"], props)))
        ids.append(id_)
    if docs:
        await escribir(pid, {"cambios": docs}, usuario["id"])
    return {"colocados": len(ids), "ids": ids, "errores": errores}


async def paredes(pid, mapa: str, tramos: list[dict], usuario) -> dict:
    """Muros rectos de (x1, z1) a (x2, z2)."""
    if not tramos or len(tramos) > 500:
        raise error("Entre 1 y 500 paredes por llamada.")
    base = item_catalogo("muro") or {"tipo": "muro", "datos": {"sy": 2.6, "sz": 0.15, "color": "#d8d4cc"}}
    docs, ids = [], []
    for j, t in enumerate(tramos):
        try:
            x1, z1, x2, z2 = (float(t[k]) for k in ("x1", "z1", "x2", "z2"))
        except (KeyError, TypeError, ValueError):
            raise error("Pared #%d: faltan x1, z1, x2 o z2." % j)
        L = math.hypot(x2 - x1, z2 - z1)
        if L < 0.05:
            continue
        datos = dict(base["datos"])
        datos.update({"x": (x1 + x2) / 2, "y": float(t.get("y") or 0), "z": (z1 + z2) / 2, "sx": L,
                      "sy": float(t.get("alto") or datos.get("sy") or 2.6), "sz": float(t.get("grosor") or datos.get("sz") or 0.15),
                      "giroY": math.degrees(math.atan2(-(z2 - z1), x2 - x1))})
        if t.get("color"):
            datos["color"] = str(t["color"])[:9]
        id_ = nuevo_id(mapa) + "m" + str(j)
        docs.append((id_, doc_nuevo(mapa, id_, base["tipo"], datos, usuario["nombre"])))
        ids.append(id_)
    if docs:
        await escribir(pid, {"cambios": docs}, usuario["id"])
    return {"creadas": len(ids), "ids": ids}


async def _docs_por_ids(pid, ids: list[str]) -> dict:
    async with db.pool.acquire() as con:
        docs = await leer_col(con, pid, "cambios")
    pedidos, out = set(ids), {}
    for doc_id, d in docs.items():
        if isinstance(d, dict) and d.get("accion") == "agregar" and (doc_id in pedidos or d.get("id_objeto") in pedidos):
            out[doc_id] = d
    return out


async def editar(pid, cambios_: list[dict], usuario) -> dict:
    if not cambios_ or len(cambios_) > 500:
        raise error("Entre 1 y 500 cambios por llamada.")
    docs = await _docs_por_ids(pid, [str(c.get("id")) for c in cambios_])
    por_id = {d.get("id_objeto") or k: (k, d) for k, d in docs.items()}
    escritos, no = [], []
    for c in cambios_:
        k_d = por_id.get(str(c.get("id")))
        if not k_d:
            no.append(str(c.get("id")))
            continue
        doc_id, d = k_d
        dd = dict(d.get("datos") or {})
        for k, kd in (("x", "x"), ("y", "y"), ("z", "z"), ("giro", "giroY")):
            if isinstance(c.get(k), (int, float)):
                dd[kd] = float(c[k])
        if isinstance(c.get("escala"), (int, float)) and c["escala"] > 0:
            for k in ("sx", "sy", "sz"):
                if isinstance(dd.get(k), (int, float)):
                    dd[k] = dd[k] * c["escala"]
        if isinstance(c.get("datos"), dict):
            dd.update(c["datos"])
        nuevo = dict(d, datos=limpiar_datos(dd, d.get("tipo", "")), actualizado=ahora_iso())
        if c.get("nombre"):
            nuevo["props"] = dict(d.get("props") or {}, nombre=str(c["nombre"])[:80])
        escritos.append((doc_id, nuevo))
    if escritos:
        await escribir(pid, {"cambios": escritos}, usuario["id"])
    return {"editados": len(escritos), "no_encontrados": no}


async def borrar(pid, ids: list[str], usuario) -> dict:
    docs = await _docs_por_ids(pid, ids)
    if docs:
        await escribir(pid, {"cambios": [(k, None) for k in docs]}, usuario["id"])
    return {"borrados": len(docs), "no_encontrados": sorted(set(ids) - {d.get("id_objeto") for d in docs.values()} - set(docs))}


# ───────────── terreno (lo genera el editor con el motor de Rust) ─────────────

async def pedir_terreno(pid, mapa: str, params: dict, usuario) -> dict:
    """Deja una petición en terreno/gen-<mapa>; el editor la aplica al abrir el mapa (o al momento si está abierto) y la borra."""
    from .rutas.proyectos import ESTILOS_RELIEVE
    if params.get("estilo") not in ESTILOS_RELIEVE:
        raise error("estilo tiene que ser uno de: " + ", ".join(sorted(ESTILOS_RELIEVE)))
    limpio = {k: v for k, v in params.items() if v is not None and k in
              ("estilo", "semilla", "margen", "altura", "escala", "rugosidad", "erosion", "nivelAgua", "humedad", "nieve", "densidad", "rio", "anchoRio", "transicion")}
    await escribir(pid, {"terreno": [("gen-" + mapa, {"mapa": mapa, "generar": limpio, "pedido": ahora_iso(), "por": usuario["nombre"]})]}, usuario["id"])
    return {"pendiente": True, "mapa": mapa, "parametros": limpio,
            "nota": "El terreno lo calcula el editor con el motor de Rust: se genera en cuanto alguien con permiso de edición abra el mapa "
                    "(o al momento si ya está abierto). Antes guarda una versión automática."}


# ───────────── versiones (mismo formato que productividad.ts) ─────────────

async def guardar_version(pid, mapa: str, nombre: str, usuario, auto: bool = False) -> dict:
    async with db.pool.acquire() as con:
        cambios = await leer_col(con, pid, "cambios")
        cols = {c: {k: v for k, v in (await leer_col(con, pid, c)).items() if isinstance(v, dict) and v.get("mapa") == mapa} for c in COLS_VERSION}
    docs = {k: v for k, v in cambios.items() if isinstance(v, dict) and v.get("mapa") == mapa}
    vid = "v-%s-%s%s" % (mapa, _b36(int(time.time() * 1000)), "a" if auto else "")
    data = {"mapa": mapa, "nombre": (nombre or "").strip()[:100] or "Versión " + ahora_iso()[:16], "fecha": ahora_iso(), "auto": auto,
            "docs": docs, "cols": cols, "formato": 2, "por": usuario["nombre"]}
    await escribir(pid, {"versiones": [(vid, data)]}, usuario["id"])
    return {"id": vid, "nombre": data["nombre"], "objetos": len(docs)}


async def versiones(pid, mapa: str) -> list[dict]:
    async with db.pool.acquire() as con:
        vs = await leer_col(con, pid, "versiones")
    out = [{"id": k, "nombre": v.get("nombre"), "fecha": v.get("fecha"), "auto": v.get("auto", False), "objetos": len(v.get("docs") or {}),
            "con_terreno": bool((v.get("cols") or {}).get("terreno"))} for k, v in vs.items() if isinstance(v, dict) and v.get("mapa") == mapa]
    return sorted(out, key=lambda v: v["fecha"] or "", reverse=True)


async def restaurar_version(pid, mapa: str, vid: str, usuario) -> dict:
    async with db.pool.acquire() as con:
        v = (await leer_col(con, pid, "versiones")).get(vid)
        if not v or v.get("mapa") != mapa:
            raise error("Esa versión no existe en este mapa.", "not_found", 404)
        actuales = {k: d for k, d in (await leer_col(con, pid, "cambios")).items() if isinstance(d, dict) and d.get("mapa") == mapa}
        cols_act = {c: {k: d for k, d in (await leer_col(con, pid, c)).items() if isinstance(d, dict) and d.get("mapa") == mapa} for c in COLS_VERSION}
    foto = v.get("docs") or {}
    cambios = {"cambios": [(k, None) for k in actuales if k not in foto] + [(k, d) for k, d in foto.items() if actuales.get(k) != d]}
    if v.get("cols"):
        for c in COLS_VERSION:
            fc = v["cols"].get(c) or {}
            cambios[c] = [(k, None) for k in cols_act[c] if k not in fc] + [(k, d) for k, d in fc.items() if cols_act[c].get(k) != d]
    cambios = {c: l for c, l in cambios.items() if l}
    if cambios:
        await escribir(pid, cambios, usuario["id"])
    return {"restaurada": v.get("nombre"), "cambios": sum(len(l) for l in cambios.values())}


# ───────────── exportar / importar un proyecto entero ─────────────

async def exportar(pid, incluir_archivos: bool = True) -> dict:
    async with db.pool.acquire() as con:
        p = await proyecto(con, pid)
        docs = await con.fetch("SELECT coleccion, doc_id, datos FROM documentos WHERE proyecto_id = $1 ORDER BY coleccion, doc_id", pid)
        arch = await con.fetch("SELECT id, tipo, nombre, content_type, tamano, ruta FROM archivos WHERE proyecto_id = $1", pid)
    archivos, total = [], 0
    for a in arch:
        e = {"id": str(a["id"]), "tipo": a["tipo"], "nombre": a["nombre"], "content_type": a["content_type"], "tamano": a["tamano"]}
        ruta = config.DIR_ARCHIVOS / a["ruta"]
        if incluir_archivos and total + a["tamano"] <= MAX_EXPORTAR_ARCHIVOS and ruta.is_file():
            e["base64"] = base64.b64encode(ruta.read_bytes()).decode()
            total += a["tamano"]
        archivos.append(e)
    return {"formato": "map-creator-proyecto", "version": 1, "exportado": ahora_iso(), "origen": str(pid),
            "proyecto": {"nombre": p["nombre"], "descripcion": p["descripcion"], "plantilla": p["plantilla"], "mapa_inicial": p["mapa_inicial"]},
            "documentos": [{"coleccion": d["coleccion"], "doc_id": d["doc_id"], "datos": json.loads(d["datos"])} for d in docs],
            "archivos": archivos}


async def importar(datos: dict, usuario, nombre: str | None = None) -> dict:
    if not isinstance(datos, dict) or datos.get("formato") != "map-creator-proyecto":
        raise error("No es una exportación de Map Creator (formato «map-creator-proyecto»).")
    p = datos.get("proyecto") or {}
    mapa = str(p.get("mapa_inicial") or "")
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", mapa):
        raise error("mapa_inicial no válido en la exportación.")
    origen = str(datos.get("origen") or "")
    docs = datos.get("documentos") or []
    if len(docs) > 200000:
        raise error("Demasiados documentos.", "resource_exhausted", 413)
    async with db.pool.acquire() as con, con.transaction():
        n = await con.fetchval("SELECT count(*) FROM proyectos WHERE dueno_id = $1 AND archivado IS NULL", usuario["id"])
        if n >= config.MAX_PROYECTOS:
            raise error("Llegaste al máximo de %d proyectos." % config.MAX_PROYECTOS, "resource_exhausted")
        pid = await con.fetchval("INSERT INTO proyectos (nombre, descripcion, dueno_id, plantilla, mapa_inicial) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                                 (nombre or p.get("nombre") or "Importado")[:80], str(p.get("descripcion") or "")[:500], usuario["id"], "importado", mapa)
        await con.execute("INSERT INTO miembros (proyecto_id, usuario_id, rol) VALUES ($1, $2, 'dueno')", pid, usuario["id"])
        cols = set()
        for d in docs:
            col, did = str(d.get("coleccion", "")), str(d.get("doc_id", ""))
            if not re.fullmatch(r"[a-z_]{1,40}", col) or not did or len(did) > 200:
                continue
            crudo = json.dumps(d.get("datos"), ensure_ascii=False)
            if origen:
                crudo = crudo.replace(origen + "/", "%s/" % pid)      # referencias a archivos (/_blob/<proyecto>/<archivo>)
            await con.execute("INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) VALUES ($1, $2, $3, $4, $5) "
                              "ON CONFLICT DO NOTHING", pid, col, did, crudo, usuario["id"])
            cols.add(col)
        for col in cols:
            await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING", pid, col)
        n_arch = 0
        for a in datos.get("archivos") or []:
            if not a.get("base64"):
                continue
            try:
                aid, bruto = uuid.UUID(str(a["id"])), base64.b64decode(a["base64"])
            except (KeyError, ValueError):
                continue
            if len(bruto) > config.MAX_SUBIDA_MB * 1024 * 1024:
                continue
            nombre_a = re.sub(r"[^A-Za-z0-9_.\-]", "_", str(a.get("nombre") or "archivo"))[-80:]
            rel = "%s/%s%s" % (pid, aid, Path(nombre_a).suffix.lower())
            destino = config.DIR_ARCHIVOS / rel
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(bruto)
            await con.execute("INSERT INTO archivos (id, proyecto_id, tipo, nombre, content_type, tamano, ruta, subido_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                              aid, pid, str(a.get("tipo") or "asset")[:20], nombre_a, str(a.get("content_type") or "application/octet-stream")[:100], len(bruto), rel, usuario["id"])
            n_arch += 1
    return {"proyecto": str(pid), "mapa": mapa, "documentos": len(docs), "archivos": n_arch}


def tamano_glb(bruto: bytes) -> list[float] | None:
    """Caja aproximada de un .glb (unión de los min/max de POSITION, sin las transformaciones de los nodos)."""
    try:
        if bruto[:4] != b"glTF":
            return None
        n = int.from_bytes(bruto[12:16], "little")
        j = json.loads(bruto[20:20 + n])
        mn, mx = [math.inf] * 3, [-math.inf] * 3
        for m in j.get("meshes", []):
            for pr in m.get("primitives", []):
                a = j["accessors"][pr["attributes"]["POSITION"]]
                if "min" in a and "max" in a:
                    mn = [min(x, y) for x, y in zip(mn, a["min"])]
                    mx = [max(x, y) for x, y in zip(mx, a["max"])]
        if mn[0] == math.inf:
            return None
        return [round(mx[i] - mn[i], 3) for i in range(3)]
    except Exception:
        return None
