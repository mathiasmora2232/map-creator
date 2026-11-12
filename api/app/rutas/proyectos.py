"""Proyectos (mapas de cada usuario): crear desde plantilla, listar, renombrar, duplicar, papelera y miembros."""
import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .. import config, correo, db
from ..seguridad import ROLES_ESCRITURA, exigir_rol, parsear_uuid, usuario_actual

router = APIRouter(prefix="/api", tags=["proyectos"])

TERRENOS = ("cesped", "tierra", "concreto", "asfalto")
from . import plantillas as PL  # noqa: E402  (plantillas del sistema, semillas y de usuarios)
PLANTILLAS = PL.BASE
NO_ENCONTRADO = {"error": "Ese proyecto no existe o no tienes acceso.", "code": "not_found"}


class NuevoProyecto(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    descripcion: str = Field(default="", max_length=500)
    plantilla: str = "vacio"
    ancho: float = Field(default=120, ge=10, le=2000)
    largo: float = Field(default=80, ge=10, le=2000)
    terreno: str = "cesped"


class CambioProyecto(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    descripcion: str | None = Field(default=None, max_length=500)


class Favorito(BaseModel):
    favorito: bool


class NuevoMiembro(BaseModel):
    email: str = Field(max_length=254)
    rol: str = Field(pattern="^(editor|lector)$")
    dias: int | None = Field(default=None, ge=1, le=3650)   # acceso con plazo (días); sin él, sin plazo


class CambioMiembro(BaseModel):
    rol: str | None = Field(default=None, pattern="^(editor|lector)$")
    extender_dias: int | None = Field(default=None, ge=1, le=3650)   # suma días al plazo (desde hoy si ya venció)
    plazo_dias: int | None = Field(default=None, ge=1, le=3650)      # pone un plazo desde hoy
    sin_plazo: bool = False                                           # quita el plazo


def _slug(texto):
    t = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40] or "mapa"


def _ahora_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _fila(r):
    d = dict(r)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif k.endswith("id") and v is not None and not isinstance(v, (str, int)):
            d[k] = str(v)
    return d


SQL_LISTA = """
SELECT p.id, p.nombre, p.descripcion, p.plantilla, p.mapa_inicial, p.creado, p.actualizado, p.archivado, m.rol,
       m.favorito, m.abierto, u.nombre AS dueno_nombre, p.dueno_id,
       (SELECT count(*) FROM miembros x WHERE x.proyecto_id = p.id AND (x.expira IS NULL OR x.expira > now())) AS n_miembros, m.expira AS acceso_expira,
       (SELECT count(*) FROM documentos d WHERE d.proyecto_id = p.id AND d.coleccion = 'cambios') AS n_cambios
FROM proyectos p
JOIN miembros m ON m.proyecto_id = p.id AND m.usuario_id = $1 AND (m.expira IS NULL OR m.expira > now())
JOIN usuarios u ON u.id = p.dueno_id
"""


@router.get("/plantillas")
async def plantillas(usuario=Depends(usuario_actual)):
    return await PL.lista(usuario)


@router.get("/proyectos")
async def listar(papelera: bool = Query(False), usuario=Depends(usuario_actual)):
    filtro = "WHERE p.archivado IS NOT NULL AND m.rol = 'dueno'" if papelera else "WHERE p.archivado IS NULL"
    async with db.pool.acquire() as con:
        filas = await con.fetch(SQL_LISTA + filtro + " ORDER BY p.actualizado DESC", usuario["id"])
    return [_fila(r) for r in filas]


@router.post("/proyectos", status_code=201)
async def crear(datos: NuevoProyecto, usuario=Depends(usuario_actual)):
    async with db.pool.acquire() as con, con.transaction():
        if not await PL.existe(con, datos.plantilla, usuario):
            raise HTTPException(400, {"error": "Esa plantilla no existe.", "code": "invalid_argument"})
        n = await con.fetchval("SELECT count(*) FROM proyectos WHERE dueno_id = $1 AND archivado IS NULL", usuario["id"])
        if n >= config.MAX_PROYECTOS:
            raise HTTPException(400, {"error": "Llegaste al máximo de %d proyectos. Borra alguno para crear otro." % config.MAX_PROYECTOS,
                                      "code": "resource_exhausted"})
        mapa = await PL.mapa_de(con, datos.plantilla, _slug(datos.nombre))
        p = await con.fetchrow(
            "INSERT INTO proyectos (nombre, descripcion, dueno_id, plantilla, mapa_inicial) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            datos.nombre.strip(), datos.descripcion.strip(), usuario["id"], "plantilla" if datos.plantilla.startswith("u:") else datos.plantilla, mapa)
        await con.execute("INSERT INTO miembros (proyecto_id, usuario_id, rol) VALUES ($1, $2, 'dueno')", p["id"], usuario["id"])
        await PL.aplicar(con, datos.plantilla, p["id"], usuario["id"], datos.nombre.strip())
        if datos.plantilla == "vacio":
            doc = {"nombre": datos.nombre.strip()[:60], "ancho": datos.ancho, "largo": datos.largo,
                   "terreno": datos.terreno if datos.terreno in TERRENOS else "cesped", "creado": _ahora_iso()}
            await con.execute("INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) VALUES ($1, 'mapas', $2, $3, $4)",
                              p["id"], mapa, json.dumps(doc, ensure_ascii=False), usuario["id"])
            await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) VALUES ($1, 'mapas', 1)", p["id"])
        fila = await con.fetchrow(SQL_LISTA + "WHERE p.id = $2", usuario["id"], p["id"])
    return _fila(fila)


@router.get("/proyectos/{pid}")
async def ver(pid: str, usuario=Depends(usuario_actual)):
    """Lo pide el editor al abrir el proyecto: queda como «abierto ahora» para Recientes y Continuar."""
    await exigir_rol(pid, usuario)
    async with db.pool.acquire() as con:
        await con.execute("UPDATE miembros SET abierto = now() WHERE proyecto_id = $1 AND usuario_id = $2", parsear_uuid(pid), usuario["id"])
        fila = await con.fetchrow(SQL_LISTA + "WHERE p.id = $2", usuario["id"], parsear_uuid(pid))
    return _fila(fila)


@router.put("/proyectos/{pid}/favorito")
async def marcar_favorito(pid: str, datos: Favorito, usuario=Depends(usuario_actual)):
    """Favorito de cada persona (no del proyecto): cada miembro tiene los suyos."""
    await exigir_rol(pid, usuario)
    async with db.pool.acquire() as con:
        await con.execute("UPDATE miembros SET favorito = $3 WHERE proyecto_id = $1 AND usuario_id = $2",
                          parsear_uuid(pid), usuario["id"], datos.favorito)
    return {"ok": True, "favorito": datos.favorito}


@router.patch("/proyectos/{pid}")
async def cambiar(pid: str, datos: CambioProyecto, usuario=Depends(usuario_actual)):
    await exigir_rol(pid, usuario, escritura=True)
    async with db.pool.acquire() as con:
        await con.execute("UPDATE proyectos SET nombre = coalesce($2, nombre), descripcion = coalesce($3, descripcion) WHERE id = $1",
                          parsear_uuid(pid), datos.nombre and datos.nombre.strip(), datos.descripcion)
        fila = await con.fetchrow(SQL_LISTA + "WHERE p.id = $2", usuario["id"], parsear_uuid(pid))
    return _fila(fila)


async def _exigir_dueno(pid, usuario, archivado=None):
    """El dueño puede actuar también sobre proyectos en la papelera (restaurar o borrar del todo)."""
    p = parsear_uuid(pid)
    async with db.pool.acquire() as con:
        fila = await con.fetchrow("SELECT archivado FROM proyectos WHERE id = $1 AND dueno_id = $2", p, usuario["id"]) if p else None
    if fila is None or (archivado is not None and (fila["archivado"] is not None) != archivado):
        raise HTTPException(404, NO_ENCONTRADO)
    return p


@router.delete("/proyectos/{pid}")
async def borrar(pid: str, definitivo: bool = Query(False), usuario=Depends(usuario_actual)):
    """Sin `definitivo` va a la papelera; con `definitivo` (solo desde la papelera) se borra con sus archivos."""
    p = await _exigir_dueno(pid, usuario, archivado=True if definitivo else False)
    async with db.pool.acquire() as con:
        if definitivo:
            await con.execute("DELETE FROM proyectos WHERE id = $1", p)
            shutil.rmtree(config.DIR_ARCHIVOS / str(p), ignore_errors=True)
        else:
            await con.execute("UPDATE proyectos SET archivado = now() WHERE id = $1", p)
    return {"ok": True}


@router.post("/proyectos/{pid}/restaurar")
async def restaurar(pid: str, usuario=Depends(usuario_actual)):
    p = await _exigir_dueno(pid, usuario, archivado=True)
    async with db.pool.acquire() as con:
        await con.execute("UPDATE proyectos SET archivado = NULL WHERE id = $1", p)
    return {"ok": True}


@router.post("/proyectos/{pid}/duplicar", status_code=201)
async def duplicar(pid: str, usuario=Depends(usuario_actual)):
    """Copia completa (documentos y archivos) a un proyecto nuevo del usuario. Sirve también a los lectores: «hacer una copia»."""
    await exigir_rol(pid, usuario)
    viejo = parsear_uuid(pid)
    async with db.pool.acquire() as con, con.transaction():
        o = await con.fetchrow("SELECT nombre, descripcion, plantilla, mapa_inicial FROM proyectos WHERE id = $1", viejo)
        nuevo = await con.fetchval(
            "INSERT INTO proyectos (nombre, descripcion, dueno_id, plantilla, mapa_inicial) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            ("Copia de " + o["nombre"])[:80], o["descripcion"], usuario["id"], o["plantilla"], o["mapa_inicial"])
        await con.execute("INSERT INTO miembros (proyecto_id, usuario_id, rol) VALUES ($1, $2, 'dueno')", nuevo, usuario["id"])
        await con.execute(
            "INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) "
            "SELECT $2, coleccion, doc_id, replace(datos::text, $3, $4)::jsonb, $5 FROM documentos WHERE proyecto_id = $1",
            viejo, nuevo, str(viejo) + "/", str(nuevo) + "/", usuario["id"])
        await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) "
                          "SELECT $2, coleccion, 1 FROM colecciones WHERE proyecto_id = $1", viejo, nuevo)
        await con.execute(
            "INSERT INTO archivos (id, proyecto_id, tipo, nombre, content_type, tamano, ruta, subido_por) "
            "SELECT id, $2, tipo, nombre, content_type, tamano, replace(ruta, $3, $4), subido_por FROM archivos WHERE proyecto_id = $1",
            viejo, nuevo, str(viejo) + "/", str(nuevo) + "/")
        origen = config.DIR_ARCHIVOS / str(viejo)
        if origen.is_dir():
            shutil.copytree(origen, config.DIR_ARCHIVOS / str(nuevo))
        fila = await con.fetchrow(SQL_LISTA + "WHERE p.id = $2", usuario["id"], nuevo)
    return _fila(fila)


# ───────────────────────── Miembros ─────────────────────────
@router.get("/proyectos/{pid}/miembros")
async def miembros(pid: str, usuario=Depends(usuario_actual)):
    await exigir_rol(pid, usuario)
    async with db.pool.acquire() as con:
        filas = await con.fetch("SELECT u.id, u.nombre, u.email, u.avatar_v, m.rol, m.creado, m.expira, (m.expira IS NOT NULL AND m.expira <= now()) AS vencido, m.invitacion_id FROM miembros m JOIN usuarios u ON u.id = m.usuario_id "
                                "WHERE m.proyecto_id = $1 ORDER BY (m.rol = 'dueno') DESC, u.nombre", parsear_uuid(pid))
    return [_fila(r) for r in filas]


@router.post("/proyectos/{pid}/miembros", status_code=201)
async def invitar(pid: str, datos: NuevoMiembro, request: Request, usuario=Depends(usuario_actual)):
    """Añade a alguien por correo. Si ya tiene cuenta entra en el acto (y se le avisa por correo). Si no, y el correo está
    configurado, se le envía una invitación de un solo uso para que cree su cuenta."""
    if await exigir_rol(pid, usuario) != "dueno":
        raise HTTPException(403, {"error": "Solo el dueño puede compartir el proyecto.", "code": "permission_denied"})
    p = parsear_uuid(pid)
    async with db.pool.acquire() as con:
        destino = await con.fetchrow("SELECT id, email FROM usuarios WHERE lower(email) = lower($1)", datos.email.strip())
        nombre = await con.fetchval("SELECT nombre FROM proyectos WHERE id = $1", p)
        if destino is not None:
            await con.execute("INSERT INTO miembros (proyecto_id, usuario_id, rol, expira) VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(days => $4::int) END) "
                              "ON CONFLICT (proyecto_id, usuario_id) DO UPDATE SET rol = excluded.rol, expira = excluded.expira WHERE miembros.rol <> 'dueno'",
                              p, destino["id"], datos.rol, datos.dias)
            mapa = await con.fetchval("SELECT mapa_inicial FROM proyectos WHERE id = $1", p)
    if destino is not None:
        if destino["id"] != usuario["id"]:
            url = "%s/editor/?p=%s&m=%s" % (correo.url_base(request), p, mapa)
            await correo.enviar(destino["email"], *correo.compartido(usuario["nombre"], nombre, datos.rol, url))
        return {"ok": True, "invitado": False}
    if not config.CORREO_ACTIVO:
        raise HTTPException(404, {"error": "No hay ninguna cuenta con ese correo. Crea un enlace de invitación y envíaselo.", "code": "not_found"})
    from .invitaciones import NuevaInvitacion, crear_de_proyecto
    ficha = await crear_de_proyecto(pid, NuevaInvitacion(rol=datos.rol, dias=7, email=datos.email, acceso_dias=datos.dias), request, usuario)
    return {"ok": True, "invitado": True, "enviado": ficha.get("enviado", False)}


@router.patch("/proyectos/{pid}/miembros/{uid}")
async def cambiar_miembro(pid: str, uid: str, datos: CambioMiembro, usuario=Depends(usuario_actual)):
    """Rol y plazo de acceso de un miembro (solo el dueño). El dueño no tiene plazo."""
    if await exigir_rol(pid, usuario) != "dueno":
        raise HTTPException(403, {"error": "Solo el dueño puede cambiar los permisos.", "code": "permission_denied"})
    p, u = parsear_uuid(pid), parsear_uuid(uid)
    async with db.pool.acquire() as con:
        if datos.rol:
            await con.execute("UPDATE miembros SET rol = $3 WHERE proyecto_id = $1 AND usuario_id = $2 AND rol <> 'dueno'", p, u, datos.rol)
        if datos.sin_plazo:
            await con.execute("UPDATE miembros SET expira = NULL WHERE proyecto_id = $1 AND usuario_id = $2 AND rol <> 'dueno'", p, u)
        elif datos.plazo_dias:
            await con.execute("UPDATE miembros SET expira = now() + make_interval(days => $3) WHERE proyecto_id = $1 AND usuario_id = $2 AND rol <> 'dueno'", p, u, datos.plazo_dias)
        elif datos.extender_dias:
            await con.execute("UPDATE miembros SET expira = greatest(coalesce(expira, now()), now()) + make_interval(days => $3) "
                              "WHERE proyecto_id = $1 AND usuario_id = $2 AND rol <> 'dueno'", p, u, datos.extender_dias)
        fila = await con.fetchrow("SELECT expira FROM miembros WHERE proyecto_id = $1 AND usuario_id = $2", p, u)
    return {"ok": True, "expira": fila["expira"].isoformat() if fila and fila["expira"] else None}


@router.delete("/proyectos/{pid}/miembros/{uid}")
async def quitar_miembro(pid: str, uid: str, usuario=Depends(usuario_actual)):
    """El dueño quita a cualquiera menos a sí mismo; los demás solo pueden salirse."""
    rol = await exigir_rol(pid, usuario)
    objetivo = parsear_uuid(uid)
    if rol != "dueno" and objetivo != usuario["id"]:
        raise HTTPException(403, {"error": "Solo el dueño puede quitar miembros.", "code": "permission_denied"})
    async with db.pool.acquire() as con:
        await con.execute("DELETE FROM miembros WHERE proyecto_id = $1 AND usuario_id = $2 AND rol <> 'dueno'", parsear_uuid(pid), objetivo)
    return {"ok": True}


__all__ = ["router", "PLANTILLAS", "ROLES_ESCRITURA"]
