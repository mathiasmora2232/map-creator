"""La misma interfaz que el servidor local (editor/local/servidor.py), pero por proyecto y con permisos:

- /api/db/<coleccion>[/<doc>]   GET (con ETag), POST, PUT, PATCH (fusión con {"__delete__": true}), DELETE
- /api/fotos, /api/assets        subidas (cuerpo crudo + cabecera X-Nombre)
- /_blob/<proyecto>/<archivo>    descarga de lo subido

El proyecto llega en la cabecera X-OO-Proyecto (la pone editor/js/nucleo/local.js en modo nube).
"""
import json
import re
import secrets
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse

from .. import config, db
from ..seguridad import exigir_rol, parsear_uuid, usuario_actual

router = APIRouter(tags=["editor"])
COLECCION = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")
DOC = re.compile(r"^[A-Za-z0-9_\-.~:@+]{1,200}$")
IMAGEN = re.compile(r"\.(jpe?g|png|webp|gif)$", re.I)
ASSET = re.compile(r"\.(glb|gltf|png|jpe?g|webp|bin)$", re.I)
TIPOS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
         ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream"}


def _proyecto(request: Request):
    pid = parsear_uuid(request.headers.get("x-oo-proyecto"))
    if pid is None:
        raise HTTPException(400, {"error": "Falta el proyecto (abre el editor desde «Mis mapas»).", "code": "invalid_argument"})
    return pid


def _validar(col, doc=None):
    if not COLECCION.match(col) or (doc is not None and not DOC.match(doc)):
        raise HTTPException(400, {"error": "ruta", "code": "invalid_argument"})


async def _cuerpo_json(request: Request):
    crudo = await request.body()
    if len(crudo) > config.MAX_DOC_MB * 1024 * 1024:
        raise HTTPException(413, {"error": "El documento pasa de %d MB." % config.MAX_DOC_MB, "code": "resource_exhausted"})
    try:
        datos = json.loads(crudo or b"{}")
    except ValueError:
        raise HTTPException(400, {"error": "JSON no válido", "code": "invalid_argument"})
    if not isinstance(datos, dict):
        raise HTTPException(400, {"error": "El documento tiene que ser un objeto", "code": "invalid_argument"})
    return datos


def fusionar(a, b):
    """Igual que el servidor local: los objetos se mezclan en profundidad y {"__delete__": true} quita la clave."""
    for k, v in b.items():
        if isinstance(v, dict) and v.get("__delete__") is True:
            a.pop(k, None)
        elif isinstance(v, dict) and isinstance(a.get(k), dict):
            fusionar(a[k], v)
        else:
            a[k] = v
    return a


async def _tras_escribir(con, pid, col):
    await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) VALUES ($1, $2, 1) "
                      "ON CONFLICT (proyecto_id, coleccion) DO UPDATE SET version = colecciones.version + 1", pid, col)
    # Al arrastrar llegan decenas de escrituras por segundo: la fecha del proyecto se toca como mucho cada 30 s.
    await con.execute("UPDATE proyectos SET actualizado = now() WHERE id = $1 AND actualizado < now() - interval '30 seconds'", pid)


async def _poner(pid, col, doc, datos, usuario_id):
    async with db.pool.acquire() as con, con.transaction():
        await con.execute(
            "INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) VALUES ($1, $2, $3, $4, $5) "
            "ON CONFLICT (proyecto_id, coleccion, doc_id) DO UPDATE SET datos = excluded.datos, actualizado = now(), "
            "actualizado_por = excluded.actualizado_por", pid, col, doc, json.dumps(datos, ensure_ascii=False), usuario_id)
        await _tras_escribir(con, pid, col)


@router.get("/api/db/{col}")
async def leer(col: str, request: Request, usuario=Depends(usuario_actual)):
    _validar(col)
    pid = _proyecto(request)
    await exigir_rol(pid, usuario)
    async with db.pool.acquire() as con:
        version = await con.fetchval("SELECT version FROM colecciones WHERE proyecto_id = $1 AND coleccion = $2", pid, col) or 0
        etag = '"%s-%s-%d"' % (pid.hex[:12], col, version)
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "no-cache"})
        docs = await con.fetchval(
            "SELECT coalesce(json_agg(json_build_object('id', doc_id, 'data', datos))::text, '[]') FROM documentos "
            "WHERE proyecto_id = $1 AND coleccion = $2", pid, col)
    return Response('{"docs":%s}' % docs, media_type="application/json", headers={"ETag": etag, "Cache-Control": "no-cache"})


@router.post("/api/db/{col}")
async def agregar(col: str, request: Request, usuario=Depends(usuario_actual)):
    return await poner(col, secrets.token_hex(10), request, usuario)


@router.post("/api/db/{col}/{doc}")
@router.put("/api/db/{col}/{doc}")
async def poner(col: str, doc: str, request: Request, usuario=Depends(usuario_actual)):
    _validar(col, doc)
    pid = _proyecto(request)
    await exigir_rol(pid, usuario, escritura=True)
    await _poner(pid, col, doc, await _cuerpo_json(request), usuario["id"])
    return {"id": doc}


@router.patch("/api/db/{col}/{doc}")
async def actualizar(col: str, doc: str, request: Request, usuario=Depends(usuario_actual)):
    _validar(col, doc)
    pid = _proyecto(request)
    await exigir_rol(pid, usuario, escritura=True)
    cambios = await _cuerpo_json(request)
    async with db.pool.acquire() as con, con.transaction():
        actual = await con.fetchval("SELECT datos FROM documentos WHERE proyecto_id = $1 AND coleccion = $2 AND doc_id = $3 FOR UPDATE",
                                    pid, col, doc)
        if actual is None:
            raise HTTPException(400, {"error": "no existe", "code": "invalid_argument"})
        nuevo = fusionar(json.loads(actual), cambios)
        await con.execute("UPDATE documentos SET datos = $4, actualizado = now(), actualizado_por = $5 "
                          "WHERE proyecto_id = $1 AND coleccion = $2 AND doc_id = $3",
                          pid, col, doc, json.dumps(nuevo, ensure_ascii=False), usuario["id"])
        await _tras_escribir(con, pid, col)
    return {"id": doc}


@router.delete("/api/db/{col}/{doc}")
async def borrar(col: str, doc: str, request: Request, usuario=Depends(usuario_actual)):
    _validar(col, doc)
    pid = _proyecto(request)
    await exigir_rol(pid, usuario, escritura=True)
    async with db.pool.acquire() as con, con.transaction():
        hecho = await con.execute("DELETE FROM documentos WHERE proyecto_id = $1 AND coleccion = $2 AND doc_id = $3", pid, col, doc)
        if hecho != "DELETE 0":
            await _tras_escribir(con, pid, col)
    return {"id": doc}


# ───────────────────────── Archivos ─────────────────────────
async def _subir(request: Request, usuario, tipo: str, patron):
    pid = _proyecto(request)
    await exigir_rol(pid, usuario, escritura=True)
    from urllib.parse import unquote
    nombre = re.sub(r"[^A-Za-z0-9_.\-]", "_", unquote(request.headers.get("x-nombre") or ("foto.jpg" if tipo == "foto" else "modelo.glb")))[-80:]
    if not patron.search(nombre):
        if tipo == "foto":
            nombre += ".jpg"
        else:
            raise HTTPException(400, {"error": "Tipo de archivo no admitido (glb, gltf, bin, png, jpg, webp).", "code": "invalid_argument"})
    limite = config.MAX_SUBIDA_MB * 1024 * 1024
    if int(request.headers.get("content-length") or 0) > limite:
        raise HTTPException(413, {"error": "El archivo pasa de %d MB." % config.MAX_SUBIDA_MB, "code": "resource_exhausted"})
    aid = uuid.uuid4()
    ext = Path(nombre).suffix.lower()
    rel = "%s/%s%s" % (pid, aid, ext)
    destino = config.DIR_ARCHIVOS / rel
    destino.parent.mkdir(parents=True, exist_ok=True)
    tamano = 0
    with open(destino, "wb") as f:  # por trozos: un GLB grande no se carga entero en memoria
        async for trozo in request.stream():
            tamano += len(trozo)
            if tamano > limite:
                f.close()
                destino.unlink(missing_ok=True)
                raise HTTPException(413, {"error": "El archivo pasa de %d MB." % config.MAX_SUBIDA_MB, "code": "resource_exhausted"})
            f.write(trozo)
    ctype = TIPOS.get(ext, "application/octet-stream")
    async with db.pool.acquire() as con:
        await con.execute("INSERT INTO archivos (id, proyecto_id, tipo, nombre, content_type, tamano, ruta, subido_por) "
                          "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", aid, pid, tipo, nombre, ctype, tamano, rel, usuario["id"])
    ident = "%s/%s" % (pid, aid)
    return {"id": ident, "url": "/_blob/" + ident, "nombre": nombre, "sizeBytes": tamano, "contentType": ctype}


@router.post("/api/fotos")
async def subir_foto(request: Request, usuario=Depends(usuario_actual)):
    return await _subir(request, usuario, "foto", IMAGEN)


@router.post("/api/assets")
async def subir_asset(request: Request, usuario=Depends(usuario_actual)):
    return await _subir(request, usuario, "asset", ASSET)


@router.get("/api/fotos")
async def listar_fotos(request: Request, usuario=Depends(usuario_actual)):
    pid = _proyecto(request)
    await exigir_rol(pid, usuario)
    async with db.pool.acquire() as con:
        filas = await con.fetch("SELECT id, nombre, content_type, tamano FROM archivos WHERE proyecto_id = $1 AND tipo = 'foto' "
                                "ORDER BY creado DESC", pid)
    return {"assets": [{"id": "%s/%s" % (pid, r["id"]), "url": "/_blob/%s/%s" % (pid, r["id"]), "nombre": r["nombre"],
                        "contentType": r["content_type"], "sizeBytes": r["tamano"]} for r in filas], "usage": {}}


@router.get("/_blob/{pid}/{aid}")
async def blob(pid: str, aid: str, usuario=Depends(usuario_actual)):
    await exigir_rol(pid, usuario)
    async with db.pool.acquire() as con:
        fila = await con.fetchrow("SELECT ruta, content_type FROM archivos WHERE proyecto_id = $1 AND id = $2",
                                  parsear_uuid(pid), parsear_uuid(aid))
    if fila is None or not (config.DIR_ARCHIVOS / fila["ruta"]).is_file():
        raise HTTPException(404, {"error": "No existe", "code": "not_found"})
    return FileResponse(config.DIR_ARCHIVOS / fila["ruta"], media_type=fila["content_type"],
                        headers={"Cache-Control": "private, max-age=86400"})


# ───────────────────────── Solo en el modo local ─────────────────────────
# Enviar al juego (Unity), mallas reales y calco satelital dependen del repo del juego o de descargar teselas: en la nube
# responden 501 y el editor sigue con cajas en vez de mallas.
@router.api_route("/api/carteles/{mapa}", methods=["POST"])
@router.api_route("/api/juego/{mapa}", methods=["POST"])
@router.api_route("/api/reglas/{mapa}", methods=["POST"])
@router.get("/api/satelital")
@router.get("/api/mapa_estado")
async def solo_local():
    raise HTTPException(501, {"error": "Esta función solo está en el modo local (editor/local/servidor.py).", "code": "unimplemented"})


@router.get("/_modelos")
@router.get("/_mallas/{mapa}")
async def sin_mallas():
    raise HTTPException(404, {"error": "Las mallas del juego solo están en el modo local.", "code": "not_found"})
