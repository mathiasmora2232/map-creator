"""Biblioteca: assets (modelos GLB) que se publican y se añaden a cualquier proyecto, y los mapas publicados (plantillas).

- Assets del sistema: la carpeta api/biblioteca/ (configurable con OO_DIR_BIBLIOTECA). Cada .glb puede llevar un .json con el mismo nombre
  ({nombre, descripcion, categoria, etiquetas, escala, tamano_m}). Al arrancar se sincronizan como públicos (autor_id NULL): para hacer
  crecer la biblioteca basta con añadir archivos y reiniciar.
- Assets de los usuarios: privados al subirlos; el autor los publica para todo el servidor.
- Añadir un asset a un proyecto copia el archivo al proyecto y crea el documento «assets» que usa el catálogo del editor (Importados).
"""
import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import config, db, plataforma
from ..seguridad import exigir_rol, parsear_uuid, usuario_actual

router = APIRouter(prefix="/api/biblioteca", tags=["biblioteca"])
CARPETA = "_biblioteca"
MAX_GLB = 50 * 1024 * 1024
CAMPOS = "a.id, a.nombre, a.descripcion, a.categoria, a.etiquetas, a.visibilidad, a.tamano_m, a.escala, a.mini, a.bytes, a.usos, a.creado, a.actualizado, a.autor_id, u.nombre AS autor"


def _fila(r, uid=None) -> dict:
    d = dict(r)
    for k, v in list(d.items()):
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            d[k] = str(v)
    if isinstance(d.get("tamano_m"), str):
        d["tamano_m"] = json.loads(d["tamano_m"])
    d["autor"] = d.get("autor") or "Map Creator"
    d["mio"] = uid is not None and d.get("autor_id") == str(uid)
    d["url"] = "/api/biblioteca/assets/%s/archivo" % d["id"]
    return d


def _etiquetas(v) -> list[str]:
    if isinstance(v, str):
        v = v.split(",")
    return [str(x).strip()[:30] for x in (v or []) if str(x).strip()][:20]


async def sincronizar_sistema() -> int:
    """Carga los .glb de la carpeta de la biblioteca (autor del sistema). Devuelve cuántos hay."""
    origen = Path(config.DIR_BIBLIOTECA)
    if not origen.is_dir():
        return 0
    destino_dir = config.DIR_ARCHIVOS / CARPETA
    destino_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    async with db.pool.acquire() as con:
        for glb in sorted(origen.glob("*.glb")):
            meta = {}
            j = glb.with_suffix(".json")
            if j.is_file():
                try:
                    meta = json.loads(j.read_text(encoding="utf-8"))
                except ValueError:
                    meta = {}
            clave = "sistema/" + glb.name
            rel = "%s/sistema-%s" % (CARPETA, re.sub(r"[^A-Za-z0-9_.\-]", "_", glb.name))
            shutil.copyfile(glb, config.DIR_ARCHIVOS / rel)
            bruto = glb.read_bytes()
            tam = meta.get("tamano_m") or plataforma.tamano_glb(bruto)
            await con.execute(
                "INSERT INTO biblioteca_assets (clave, nombre, descripcion, categoria, etiquetas, visibilidad, tamano_m, escala, archivo, bytes) "
                "VALUES ($1, $2, $3, $4, $5, 'publica', $6, $7, $8, $9) ON CONFLICT (clave) DO UPDATE SET nombre = excluded.nombre, "
                "descripcion = excluded.descripcion, categoria = excluded.categoria, etiquetas = excluded.etiquetas, tamano_m = excluded.tamano_m, "
                "escala = excluded.escala, archivo = excluded.archivo, bytes = excluded.bytes, actualizado = now()",
                clave, str(meta.get("nombre") or glb.stem.replace("_", " "))[:80], str(meta.get("descripcion") or "")[:500],
                str(meta.get("categoria") or "general")[:40], _etiquetas(meta.get("etiquetas")), json.dumps(tam) if tam else None,
                float(meta.get("escala") or 1), rel, len(bruto))
            n += 1
    return n


# ───────────── operaciones (las usan las rutas y el MCP) ─────────────

async def buscar(usuario, texto: str = "", categoria: str = "", solo_mios: bool = False, limite: int = 60) -> list[dict]:
    cond, args = ["(a.visibilidad = 'publica' OR a.autor_id = $1)"], [usuario["id"]]
    if solo_mios:
        cond = ["a.autor_id = $1"]
    if categoria:
        args.append(categoria)
        cond.append("a.categoria = $%d" % len(args))
    for w in str(texto).split()[:6]:
        args.append("%" + w.lower() + "%")
        cond.append("(lower(a.nombre) LIKE $%d OR lower(a.descripcion) LIKE $%d OR lower(array_to_string(a.etiquetas, ' ')) LIKE $%d)" % ((len(args),) * 3))
    args.append(max(1, min(200, limite)))
    async with db.pool.acquire() as con:
        filas = await con.fetch("SELECT %s FROM biblioteca_assets a LEFT JOIN usuarios u ON u.id = a.autor_id WHERE %s ORDER BY a.usos DESC, a.creado DESC LIMIT $%d"
                                % (CAMPOS, " AND ".join(cond), len(args)), *args)
    return [_fila(f, usuario["id"]) for f in filas]


async def obtener(aid, usuario, para_editar: bool = False) -> dict:
    u = parsear_uuid(aid)
    async with db.pool.acquire() as con:
        f = await con.fetchrow("SELECT %s, a.archivo FROM biblioteca_assets a LEFT JOIN usuarios u ON u.id = a.autor_id WHERE a.id = $1" % CAMPOS, u) if u else None
    if not f or (f["visibilidad"] != "publica" and f["autor_id"] != usuario["id"] and not usuario["es_admin"]):
        raise HTTPException(404, {"error": "Ese asset no existe o no es público.", "code": "not_found"})
    if para_editar and f["autor_id"] != usuario["id"] and not usuario["es_admin"]:
        raise HTTPException(403, {"error": "Solo su autor (o el administrador) puede cambiarlo.", "code": "permission_denied"})
    d = _fila(f, usuario["id"])
    d["_archivo"] = f["archivo"]
    return d


async def crear(usuario, bruto: bytes, nombre: str, descripcion: str = "", categoria: str = "general", etiquetas=None,
                visibilidad: str = "privada", escala: float = 1, mini: str | None = None) -> dict:
    if len(bruto) > MAX_GLB:
        raise HTTPException(413, {"error": "El modelo pasa de %d MB." % (MAX_GLB // 1048576), "code": "resource_exhausted"})
    if bruto[:4] != b"glTF":
        raise HTTPException(400, {"error": "Tiene que ser un modelo .glb (glTF binario).", "code": "invalid_argument"})
    nombre = (nombre or "").strip()[:80] or "Modelo"
    aid = uuid.uuid4()
    rel = "%s/%s.glb" % (CARPETA, aid)
    (config.DIR_ARCHIVOS / CARPETA).mkdir(parents=True, exist_ok=True)
    (config.DIR_ARCHIVOS / rel).write_bytes(bruto)
    tam = plataforma.tamano_glb(bruto)
    if mini and (not mini.startswith("data:image/") or len(mini) > 200_000):
        mini = None
    async with db.pool.acquire() as con:
        await con.execute(
            "INSERT INTO biblioteca_assets (id, autor_id, nombre, descripcion, categoria, etiquetas, visibilidad, tamano_m, escala, mini, archivo, bytes) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
            aid, usuario["id"], nombre, (descripcion or "")[:500], (categoria or "general")[:40], _etiquetas(etiquetas),
            "publica" if visibilidad == "publica" else "privada", json.dumps(tam) if tam else None, float(escala or 1), mini, rel, len(bruto))
    return await obtener(aid, usuario)


async def cambiar(aid, usuario, cambios: dict) -> dict:
    a = await obtener(aid, usuario, para_editar=True)
    sets, args = [], [parsear_uuid(a["id"])]
    for k, conv in (("nombre", lambda v: str(v).strip()[:80] or a["nombre"]), ("descripcion", lambda v: str(v)[:500]),
                    ("categoria", lambda v: str(v)[:40] or "general"), ("etiquetas", _etiquetas),
                    ("visibilidad", lambda v: "publica" if v == "publica" else "privada"), ("escala", lambda v: float(v) or 1)):
        if cambios.get(k) is not None:
            args.append(conv(cambios[k]))
            sets.append("%s = $%d" % (k, len(args)))
    if sets:
        async with db.pool.acquire() as con:
            await con.execute("UPDATE biblioteca_assets SET %s, actualizado = now() WHERE id = $1" % ", ".join(sets), *args)
    return await obtener(aid, usuario)


async def borrar_asset(aid, usuario) -> None:
    a = await obtener(aid, usuario, para_editar=True)
    async with db.pool.acquire() as con:
        await con.execute("DELETE FROM biblioteca_assets WHERE id = $1", parsear_uuid(a["id"]))
    if not a["_archivo"].startswith(CARPETA + "/sistema-"):
        (config.DIR_ARCHIVOS / a["_archivo"]).unlink(missing_ok=True)


async def a_proyecto(aid, pid: str, usuario) -> dict:
    """Copia el asset al proyecto y crea su documento «assets» (catálogo del editor → Importados → Biblioteca)."""
    await exigir_rol(pid, usuario, escritura=True)
    a = await obtener(aid, usuario)
    p = parsear_uuid(pid)
    fid = uuid.uuid4()
    rel = "%s/%s.glb" % (p, fid)
    destino = config.DIR_ARCHIVOS / rel
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(config.DIR_ARCHIVOS / a["_archivo"], destino)
    nombre_arch = re.sub(r"[^A-Za-z0-9_.\-]", "_", a["nombre"])[:70] + ".glb"
    async with db.pool.acquire() as con:
        await con.execute("INSERT INTO archivos (id, proyecto_id, tipo, nombre, content_type, tamano, ruta, subido_por) VALUES ($1, $2, 'asset', $3, 'model/gltf-binary', $4, $5, $6)",
                          fid, p, nombre_arch, a["bytes"], rel, usuario["id"])
        await con.execute("UPDATE biblioteca_assets SET usos = usos + 1 WHERE id = $1", parsear_uuid(a["id"]))
    doc_id = "as-" + uuid.uuid4().hex[:12]
    ident = "%s/%s" % (p, fid)
    doc = {"tipo": "modelo", "nombre": a["nombre"], "archivo": ident, "url": "/_blob/" + ident, "d0": a.get("tamano_m") or [1, 1, 1],
           "mini": a.get("mini") or "", "mallas": 0, "categoria": "biblioteca", "categoriaNombre": "Biblioteca", "escala": a.get("escala") or 1,
           "etiquetas": " ".join(a.get("etiquetas") or []), "archivoOriginal": nombre_arch, "bytes": a["bytes"], "creado": plataforma.ahora_iso(),
           "biblioteca": a["id"]}
    await plataforma.escribir(p, {"assets": [(doc_id, doc)]}, usuario["id"])
    return {"asset_proyecto": doc_id, "tipo_para_colocar": "modelo:" + doc_id, "nombre": a["nombre"]}


async def desde_proyecto(pid: str, asset_doc: str, usuario, visibilidad: str = "publica", nombre: str | None = None,
                         descripcion: str = "", categoria: str = "general", etiquetas=None) -> dict:
    """Publica en la biblioteca un modelo importado en un proyecto."""
    await exigir_rol(pid, usuario, escritura=True)
    p = parsear_uuid(pid)
    async with db.pool.acquire() as con:
        docs = await plataforma.leer_col(con, p, "assets")
        d = docs.get(asset_doc)
        if not d or d.get("tipo") != "modelo":
            raise HTTPException(404, {"error": "Ese modelo no está en el proyecto.", "code": "not_found"})
        aid = str(d.get("archivo", "")).split("/")[-1]
        f = await con.fetchrow("SELECT ruta FROM archivos WHERE proyecto_id = $1 AND id = $2", p, parsear_uuid(aid))
    if not f or not (config.DIR_ARCHIVOS / f["ruta"]).is_file():
        raise HTTPException(404, {"error": "No encuentro el archivo del modelo.", "code": "not_found"})
    bruto = (config.DIR_ARCHIVOS / f["ruta"]).read_bytes()
    a = await crear(usuario, bruto, nombre or d.get("nombre") or "Modelo", descripcion, categoria, etiquetas or d.get("etiquetas"),
                    visibilidad, d.get("escala") or 1, d.get("mini"))
    if d.get("d0"):
        async with db.pool.acquire() as con:
            await con.execute("UPDATE biblioteca_assets SET tamano_m = $2 WHERE id = $1", parsear_uuid(a["id"]), json.dumps(d["d0"]))
    return await obtener(a["id"], usuario)


# ───────────── rutas REST ─────────────

class CambioAsset(BaseModel):
    nombre: str | None = Field(default=None, max_length=80)
    descripcion: str | None = Field(default=None, max_length=500)
    categoria: str | None = Field(default=None, max_length=40)
    etiquetas: list[str] | str | None = None
    visibilidad: str | None = Field(default=None, pattern="^(privada|publica)$")
    escala: float | None = None


class AProyecto(BaseModel):
    proyecto: str


class DesdeProyecto(BaseModel):
    proyecto: str
    asset: str
    nombre: str | None = Field(default=None, max_length=80)
    descripcion: str = Field(default="", max_length=500)
    categoria: str = Field(default="general", max_length=40)
    visibilidad: str = Field(default="publica", pattern="^(privada|publica)$")


def _publico(a: dict) -> dict:
    return {k: v for k, v in a.items() if not k.startswith("_")}


@router.get("/assets")
async def listar(q: str = "", categoria: str = "", mios: bool = False, limite: int = Query(60, ge=1, le=200), usuario=Depends(usuario_actual)):
    return await buscar(usuario, q, categoria, mios, limite)


@router.post("/assets")
async def subir(request: Request, usuario=Depends(usuario_actual)):
    """Cuerpo: el .glb en bruto. Metadatos en la query: nombre, descripcion, categoria, etiquetas (coma), visibilidad."""
    if int(request.headers.get("content-length") or 0) > MAX_GLB:
        raise HTTPException(413, {"error": "El modelo pasa de %d MB." % (MAX_GLB // 1048576), "code": "resource_exhausted"})
    bruto = await request.body()
    q = request.query_params
    a = await crear(usuario, bruto, q.get("nombre", ""), q.get("descripcion", ""), q.get("categoria", "general"), q.get("etiquetas", ""), q.get("visibilidad", "privada"))
    return _publico(a)


@router.post("/assets/desde-proyecto")
async def publicar_desde_proyecto(datos: DesdeProyecto, usuario=Depends(usuario_actual)):
    return _publico(await desde_proyecto(datos.proyecto, datos.asset, usuario, datos.visibilidad, datos.nombre, datos.descripcion, datos.categoria))


@router.get("/assets/{aid}")
async def ver(aid: str, usuario=Depends(usuario_actual)):
    return _publico(await obtener(aid, usuario))


@router.get("/assets/{aid}/archivo")
async def archivo(aid: str, usuario=Depends(usuario_actual)):
    a = await obtener(aid, usuario)
    nombre = re.sub(r"[^A-Za-z0-9_.\-]", "_", a["nombre"])[:70] + ".glb"
    return FileResponse(config.DIR_ARCHIVOS / a["_archivo"], media_type="model/gltf-binary", filename=nombre)


@router.patch("/assets/{aid}")
async def editar(aid: str, datos: CambioAsset, usuario=Depends(usuario_actual)):
    return _publico(await cambiar(aid, usuario, datos.model_dump()))


@router.delete("/assets/{aid}")
async def eliminar(aid: str, usuario=Depends(usuario_actual)):
    await borrar_asset(aid, usuario)
    return {"ok": True}


@router.post("/assets/{aid}/a-proyecto")
async def anadir(aid: str, datos: AProyecto, usuario=Depends(usuario_actual)):
    return await a_proyecto(aid, datos.proyecto, usuario)


@router.get("/mapas")
async def mapas(q: str = "", usuario=Depends(usuario_actual)):
    """Los mapas de la biblioteca son las plantillas (las del sistema y las publicadas)."""
    from . import plantillas as PL
    ws = [plataforma._sin_tilde(w) for w in q.split()]
    lista = await PL.lista(usuario)
    return [p for p in lista if all(w in plataforma._sin_tilde(p.get("nombre", "") + " " + p.get("descripcion", "")) for w in ws)]
