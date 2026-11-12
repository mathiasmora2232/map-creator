"""Plantillas para empezar un mapa:

- del sistema: «vacio» (terreno del tamaño que elijas), «complejo» y «parqueadero» (mapas base del editor) y las semillas de
  api/plantillas/*.json (casa, oficina, bodega…: documentos del editor listos para copiar);
- de los usuarios: cualquiera publica un mapa suyo como plantilla (solo para sí o para todo el servidor). Se guarda una instantánea
  de sus documentos y archivos; el autor la actualiza desde su mapa, la renombra o la borra, y el administrador puede borrar cualquiera.
Al crear un proyecto desde una plantilla, `aplicar()` copia sus documentos (y archivos) al proyecto nuevo.
"""
import json
import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import config, db
from ..seguridad import exigir_rol, parsear_uuid, usuario_actual

log = logging.getLogger("mapcreator.plantillas")
router = APIRouter(prefix="/api", tags=["plantillas"])
MARCA = "__PLANTILLA__/"
MAX_BYTES = 25 * 1024 * 1024

BASE = {
    "vacio": {"nombre": "En blanco", "descripcion": "Un terreno vacío del tamaño que elijas. Ideal para empezar desde cero.",
              "mapa": None, "etiqueta": "Desde cero"},
    "complejo": {"nombre": "Complejo industrial", "descripcion": "Galpones, oficinas, comedor y parqueadero: unas 27 000 piezas para "
                 "explorar todas las herramientas.", "mapa": "complejo", "etiqueta": "Ejemplo grande"},
    "parqueadero": {"nombre": "Parqueadero", "descripcion": "Un parqueadero con accesos, casetas y señalización.",
                    "mapa": "parqueadero", "etiqueta": "Ejemplo"},
}


def _cargar_semillas() -> dict:
    """api/plantillas/<clave>.json → {clave: {nombre, descripcion, etiqueta, mapa, documentos}} (orden por «orden»)."""
    carpeta = Path(__file__).resolve().parents[2] / "plantillas"
    out = []
    for f in sorted(carpeta.glob("*.json")) if carpeta.is_dir() else []:
        try:
            d = json.loads(f.read_text("utf-8"))
            out.append((d.get("orden", 99), f.stem, {"nombre": d["nombre"], "descripcion": d.get("descripcion", ""), "etiqueta": d.get("etiqueta", "Plantilla"),
                                                   "mapa": d["mapa"], "documentos": d["documentos"]}))
        except Exception:  # noqa: BLE001
            log.exception("Semilla de plantilla inválida: %s", f.name)
    return {k: v for _, k, v in sorted(out)}


SEMILLAS = _cargar_semillas()


def publica(k, v) -> dict:
    return {"id": k, "nombre": v["nombre"], "descripcion": v["descripcion"], "etiqueta": v["etiqueta"], "origen": "sistema"}


async def lista(usuario) -> list:
    out = [publica(k, v) for k, v in BASE.items()] + [publica(k, v) | {"n_documentos": len(v["documentos"])} for k, v in SEMILLAS.items()]
    async with db.pool.acquire() as con:
        filas = await con.fetch(
            "SELECT t.id, t.nombre, t.descripcion, t.visibilidad, t.usos, t.n_documentos, t.creado, t.actualizado, t.autor_id, u.nombre AS autor "
            "FROM plantillas t JOIN usuarios u ON u.id = t.autor_id WHERE t.visibilidad = 'publica' OR t.autor_id = $1 "
            "ORDER BY (t.autor_id = $1) DESC, t.usos DESC, t.creado DESC LIMIT 200", usuario["id"])
    for f in filas:
        mia = f["autor_id"] == usuario["id"]
        out.append({"id": "u:" + str(f["id"]), "nombre": f["nombre"], "descripcion": f["descripcion"],
                    "etiqueta": ("Tuya" if mia else "De " + f["autor"]) + (" · privada" if f["visibilidad"] == "privada" else ""),
                    "origen": "usuario", "mia": mia, "autor": f["autor"], "visibilidad": f["visibilidad"], "usos": f["usos"],
                    "n_documentos": f["n_documentos"], "creado": f["creado"].isoformat(), "actualizado": f["actualizado"].isoformat()})
    return out


async def existe(con, plantilla: str, usuario) -> bool:
    if plantilla in BASE or plantilla in SEMILLAS:
        return True
    tid = parsear_uuid(plantilla[2:]) if plantilla.startswith("u:") else None
    return bool(tid and await con.fetchval("SELECT 1 FROM plantillas WHERE id = $1 AND (visibilidad = 'publica' OR autor_id = $2)", tid, usuario["id"]))


async def mapa_de(con, plantilla: str, nombre_slug: str) -> str:
    if plantilla in BASE:
        return BASE[plantilla]["mapa"] or ("u-" + nombre_slug)
    if plantilla in SEMILLAS:
        return SEMILLAS[plantilla]["mapa"]
    return await con.fetchval("SELECT mapa FROM plantillas WHERE id = $1", parsear_uuid(plantilla[2:]))


async def aplicar(con, plantilla: str, pid, usuario_id, nombre: str | None = None) -> None:
    """Copia los documentos (y archivos) de una semilla o de una plantilla de usuario al proyecto nuevo, dentro de su transacción."""
    if plantilla in SEMILLAS:
        docs, archivos, carpeta = SEMILLAS[plantilla]["documentos"], [], None
    elif plantilla.startswith("u:"):
        tid = parsear_uuid(plantilla[2:])
        t = await con.fetchrow("UPDATE plantillas SET usos = usos + 1 WHERE id = $1 RETURNING documentos, archivos", tid)
        docs, archivos, carpeta = json.loads(t["documentos"]), json.loads(t["archivos"]), config.DIR_ARCHIVOS / "_plantillas" / str(tid)
    else:
        return
    nuevo = str(pid) + "/"
    colecciones = set()
    for d in docs:
        datos = d["datos"]
        if nombre and d["coleccion"] == "mapas" and isinstance(datos, dict):  # el mapa se llama como el proyecto nuevo
            datos = dict(datos, nombre=nombre[:60])
        texto = json.dumps(datos, ensure_ascii=False).replace(MARCA, nuevo)
        await con.execute("INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) VALUES ($1, $2, $3, $4, $5) "
                          "ON CONFLICT (proyecto_id, coleccion, doc_id) DO UPDATE SET datos = excluded.datos",
                          pid, d["coleccion"], d["doc_id"], texto, usuario_id)
        colecciones.add(d["coleccion"])
    for c in colecciones:
        await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) VALUES ($1, $2, 1) ON CONFLICT (proyecto_id, coleccion) "
                          "DO UPDATE SET version = colecciones.version + 1", pid, c)
    if archivos and carpeta and carpeta.is_dir():
        shutil.copytree(carpeta, config.DIR_ARCHIVOS / str(pid), dirs_exist_ok=True)
        for a in archivos:
            await con.execute("INSERT INTO archivos (id, proyecto_id, tipo, nombre, content_type, tamano, ruta, subido_por) "
                              "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING",
                              parsear_uuid(a["id"]), pid, a["tipo"], a["nombre"], a["content_type"], a["tamano"], a["ruta"].replace(MARCA, nuevo), usuario_id)


# ───────────────────────── Publicar y gestionar plantillas de usuario ─────────────────────────
class Publicar(BaseModel):
    nombre: str = Field(min_length=1, max_length=60)
    descripcion: str = Field(default="", max_length=300)
    visibilidad: str = Field(default="publica", pattern="^(privada|publica)$")


class CambioPlantilla(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=60)
    descripcion: str | None = Field(default=None, max_length=300)
    visibilidad: str | None = Field(default=None, pattern="^(privada|publica)$")
    actualizar: bool = False   # volver a copiar el mapa de origen tal como está ahora


async def _instantanea(con, pid, tid):
    """Documentos y archivos del proyecto pid, con «<pid>/» → MARCA; copia los archivos a _plantillas/<tid>/."""
    viejo = str(pid) + "/"
    docs = [{"coleccion": r["coleccion"], "doc_id": r["doc_id"], "datos": json.loads(r["datos"].replace(viejo, MARCA))}
            for r in await con.fetch("SELECT coleccion, doc_id, datos FROM documentos WHERE proyecto_id = $1 ORDER BY coleccion, doc_id", pid)]
    texto = json.dumps(docs, ensure_ascii=False)
    if len(texto.encode()) > MAX_BYTES:
        raise HTTPException(400, {"error": "El mapa es demasiado grande para publicarlo como plantilla (máx. 25 MB).", "code": "resource_exhausted"})
    arch = [{"id": str(r["id"]), "tipo": r["tipo"], "nombre": r["nombre"], "content_type": r["content_type"], "tamano": r["tamano"],
             "ruta": r["ruta"].replace(viejo, MARCA)} for r in await con.fetch("SELECT * FROM archivos WHERE proyecto_id = $1", pid)]
    destino = config.DIR_ARCHIVOS / "_plantillas" / str(tid)
    shutil.rmtree(destino, ignore_errors=True)
    origen = config.DIR_ARCHIVOS / str(pid)
    if arch and origen.is_dir():
        shutil.copytree(origen, destino)
    return texto, json.dumps(arch, ensure_ascii=False), len(docs)


@router.post("/proyectos/{pid}/publicar", status_code=201)
async def publicar(pid: str, datos: Publicar, usuario=Depends(usuario_actual)):
    if await exigir_rol(pid, usuario) != "dueno":
        raise HTTPException(403, {"error": "Solo el dueño del mapa puede publicarlo como plantilla.", "code": "permission_denied"})
    p = parsear_uuid(pid)
    async with db.pool.acquire() as con, con.transaction():
        if await con.fetchval("SELECT count(*) FROM plantillas WHERE autor_id = $1", usuario["id"]) >= 30:
            raise HTTPException(400, {"error": "Ya tienes 30 plantillas. Borra alguna para publicar otra.", "code": "resource_exhausted"})
        mapa = await con.fetchval("SELECT mapa_inicial FROM proyectos WHERE id = $1", p)
        tid = await con.fetchval("INSERT INTO plantillas (autor_id, origen_id, nombre, descripcion, visibilidad, mapa, documentos) "
                                 "VALUES ($1, $2, $3, $4, $5, $6, '[]') RETURNING id", usuario["id"], p, datos.nombre.strip(), datos.descripcion.strip(), datos.visibilidad, mapa)
        docs, arch, n = await _instantanea(con, p, tid)
        await con.execute("UPDATE plantillas SET documentos = $2, archivos = $3, n_documentos = $4 WHERE id = $1", tid, docs, arch, n)
    return {"id": "u:" + str(tid), "n_documentos": n}


async def _mia(con, tid, usuario, admin_vale=True):
    f = await con.fetchrow("SELECT autor_id, origen_id FROM plantillas WHERE id = $1", tid) if tid else None
    if f is None or (f["autor_id"] != usuario["id"] and not (admin_vale and usuario["es_admin"])):
        raise HTTPException(404, {"error": "Esa plantilla no existe.", "code": "not_found"})
    return f


@router.patch("/plantillas/{tid}")
async def cambiar(tid: str, datos: CambioPlantilla, usuario=Depends(usuario_actual)):
    t = parsear_uuid(tid[2:] if tid.startswith("u:") else tid)
    async with db.pool.acquire() as con, con.transaction():
        f = await _mia(con, t, usuario, admin_vale=False)
        if datos.nombre is not None or datos.descripcion is not None or datos.visibilidad:
            await con.execute("UPDATE plantillas SET nombre = coalesce($2, nombre), descripcion = coalesce($3, descripcion), visibilidad = coalesce($4, visibilidad), "
                              "actualizado = now() WHERE id = $1", t, datos.nombre and datos.nombre.strip(), datos.descripcion, datos.visibilidad)
        if datos.actualizar:
            if not f["origen_id"] or await exigir_rol(str(f["origen_id"]), usuario) != "dueno":
                raise HTTPException(400, {"error": "El mapa del que salió esta plantilla ya no existe o no es tuyo.", "code": "failed_precondition"})
            docs, arch, n = await _instantanea(con, f["origen_id"], t)
            await con.execute("UPDATE plantillas SET documentos = $2, archivos = $3, n_documentos = $4, actualizado = now() WHERE id = $1", t, docs, arch, n)
    return {"ok": True}


@router.delete("/plantillas/{tid}")
async def borrar(tid: str, usuario=Depends(usuario_actual)):
    """La borra su autor o el administrador. Los mapas ya creados con ella no cambian."""
    t = parsear_uuid(tid[2:] if tid.startswith("u:") else tid)
    async with db.pool.acquire() as con:
        await _mia(con, t, usuario)
        await con.execute("DELETE FROM plantillas WHERE id = $1", t)
    shutil.rmtree(config.DIR_ARCHIVOS / "_plantillas" / str(t), ignore_errors=True)
    return {"ok": True}
