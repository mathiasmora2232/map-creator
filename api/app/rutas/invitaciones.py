"""Invitaciones por enlace (/invitacion/<token>).

- Del dueño de un proyecto: quien abre el enlace entra al proyecto con el rol elegido. Si no tiene cuenta, puede crearla aunque el
  registro esté cerrado (cuenta.py, registro con `invitacion`).
- Del administrador, sin proyecto: solo permiten crear una cuenta.

Cada enlace puede caducar (días) y tener un máximo de usos; se puede revocar. Del token solo se guarda el SHA-256, así que el
enlace completo se devuelve una sola vez, al crearlo.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import config, correo, db
from ..seguridad import _hash_token, exigir_rol, parsear_uuid, usuario_actual, usuario_admin
from .proyectos import _fila as _fila_base
import json as _json


def _fila(r):
    d = _fila_base(r)
    if isinstance(d.get("usado_por"), str):
        d["usado_por"] = _json.loads(d["usado_por"])
    return d

router = APIRouter(prefix="/api", tags=["invitaciones"])

# Condición de «se puede usar»: ni revocada, ni caducada, ni agotada, y su proyecto (si tiene) no está en la papelera.
VALIDA = ("i.revocada IS NULL AND (i.expira IS NULL OR i.expira > now()) AND (i.usos_max IS NULL OR i.usos < i.usos_max) "
          "AND (i.proyecto_id IS NULL OR EXISTS (SELECT 1 FROM proyectos p WHERE p.id = i.proyecto_id AND p.archivado IS NULL))")
NO_VALIDA = {"error": "Esta invitación ya no sirve: caducó, se usó todas las veces o la revocaron. Pide un enlace nuevo.",
             "code": "failed_precondition"}
RANGO = {"editor": 2, "lector": 1}

SQL_FICHA = """
SELECT i.id, i.proyecto_id, i.rol, i.nota, i.creado, i.expira, i.usos_max, i.usos, i.revocada, i.acceso_dias, u.nombre AS creado_por_nombre,
       coalesce((SELECT json_agg(json_build_object('id', x.id, 'nombre', x.nombre, 'email', x.email, 'fecha', iu.creado) ORDER BY iu.creado)
                 FROM invitaciones_usos iu JOIN usuarios x ON x.id = iu.usuario_id WHERE iu.invitacion_id = i.id), '[]') AS usado_por,
       CASE WHEN i.revocada IS NOT NULL THEN 'revocada'
            WHEN i.expira IS NOT NULL AND i.expira <= now() THEN 'caducada'
            WHEN i.usos_max IS NOT NULL AND i.usos >= i.usos_max THEN 'agotada'
            ELSE 'activa' END AS estado
FROM invitaciones i JOIN usuarios u ON u.id = i.creado_por
"""


class NuevaInvitacion(BaseModel):
    rol: str = Field(default="editor", pattern="^(editor|lector)$")
    dias: int | None = Field(default=7, ge=1, le=365)          # None: no caduca
    usos_max: int | None = Field(default=None, ge=1, le=1000)  # None: sin límite
    nota: str = Field(default="", max_length=120)
    email: str | None = Field(default=None, max_length=254)    # si viene, se le envía el enlace por correo
    acceso_dias: int | None = Field(default=None, ge=1, le=3650)  # el acceso que da dura estos días (None: sin plazo)


class CambioInvitacion(BaseModel):
    dias: int | None = Field(default=None, ge=1, le=365)        # caduca dentro de N días desde ahora
    sin_caducidad: bool = False
    mas_usos: int | None = Field(default=None, ge=1, le=1000)    # suma usos al máximo
    sin_limite: bool = False                                     # usos sin límite
    acceso_dias: int | None = Field(default=None, ge=1, le=3650)
    acceso_sin_plazo: bool = False
    reactivar: bool = False                                      # deshace la revocación


class NuevaInvitacionRegistro(BaseModel):
    dias: int | None = Field(default=7, ge=1, le=365)
    usos_max: int | None = Field(default=1, ge=1, le=1000)
    nota: str = Field(default="", max_length=120)
    email: str | None = Field(default=None, max_length=254)


async def _crear(usuario, proyecto_id, rol, dias, usos_max, nota, acceso_dias=None):
    token = secrets.token_urlsafe(18)
    expira = datetime.now(timezone.utc) + timedelta(days=dias) if dias else None
    async with db.pool.acquire() as con:
        iid = await con.fetchval(
            "INSERT INTO invitaciones (token_hash, proyecto_id, rol, creado_por, nota, expira, usos_max, acceso_dias) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
            _hash_token(token), proyecto_id, rol, usuario["id"], nota.strip(), expira, usos_max, acceso_dias)
        fila = await con.fetchrow(SQL_FICHA + "WHERE i.id = $1", iid)
    return _fila(fila) | {"token": token, "ruta": "/invitacion/" + token}


async def _exigir_dueno(pid, usuario):
    if await exigir_rol(pid, usuario) != "dueno":
        raise HTTPException(403, {"error": "Solo el dueño puede crear o ver los enlaces de invitación.", "code": "permission_denied"})
    return parsear_uuid(pid)


# ───────────────────────── Enlaces de un proyecto ─────────────────────────
async def enviar_invitacion(request, usuario, ficha, email, proyecto_nombre=None) -> bool:
    """Manda por correo el enlace recién creado. Lanza 400 si el correo no está configurado o la dirección no vale."""
    if not config.CORREO_ACTIVO:
        raise HTTPException(400, {"error": "Este servidor no tiene el correo configurado: copia el enlace y envíalo tú.", "code": "failed_precondition"})
    url = correo.url_base(request) + ficha["ruta"]
    dias = None
    if ficha.get("expira"):
        dias = max(1, round((datetime.fromisoformat(ficha["expira"]) - datetime.now(timezone.utc)).total_seconds() / 86400))
    return await correo.enviar(email, *correo.invitacion(usuario["nombre"], proyecto_nombre, ficha["rol"], url, dias))


def _email_valido(email: str) -> str:
    from .cuenta import EMAIL
    e = email.strip().lower()
    if not EMAIL.match(e):
        raise HTTPException(400, {"error": "Ese correo no parece válido.", "code": "invalid_argument"})
    return e


@router.post("/proyectos/{pid}/invitaciones", status_code=201)
async def crear_de_proyecto(pid: str, datos: NuevaInvitacion, request: Request, usuario=Depends(usuario_actual)):
    p = await _exigir_dueno(pid, usuario)
    email = _email_valido(datos.email) if datos.email else None
    if email and not config.CORREO_ACTIVO:
        raise HTTPException(400, {"error": "Este servidor no tiene el correo configurado: copia el enlace y envíalo tú.", "code": "failed_precondition"})
    async with db.pool.acquire() as con:
        n = await con.fetchval("SELECT count(*) FROM invitaciones i WHERE i.proyecto_id = $1 AND " + VALIDA, p)
        nombre = await con.fetchval("SELECT nombre FROM proyectos WHERE id = $1", p)
    if n >= 50:
        raise HTTPException(400, {"error": "Este mapa ya tiene 50 enlaces activos. Revoca alguno.", "code": "resource_exhausted"})
    ficha = await _crear(usuario, p, datos.rol, datos.dias, 1 if email else datos.usos_max, datos.nota or (email or ""), datos.acceso_dias)
    if email:
        ficha["enviado"] = await enviar_invitacion(request, usuario, ficha, email, nombre)
    return ficha


@router.get("/proyectos/{pid}/invitaciones")
async def listar_de_proyecto(pid: str, usuario=Depends(usuario_actual)):
    p = await _exigir_dueno(pid, usuario)
    async with db.pool.acquire() as con:
        filas = await con.fetch(SQL_FICHA + "WHERE i.proyecto_id = $1 AND (" + VALIDA + " OR i.creado > now() - interval '60 days') ORDER BY i.creado DESC LIMIT 100", p)
    return [_fila(r) for r in filas]


# ───────────────────────── Enlaces de registro (administrador) ─────────────────────────
@router.post("/invitaciones", status_code=201)
async def crear_de_registro(datos: NuevaInvitacionRegistro, request: Request, usuario=Depends(usuario_admin)):
    email = _email_valido(datos.email) if datos.email else None
    if email and not config.CORREO_ACTIVO:
        raise HTTPException(400, {"error": "Este servidor no tiene el correo configurado: copia el enlace y envíalo tú.", "code": "failed_precondition"})
    ficha = await _crear(usuario, None, None, datos.dias, 1 if email else datos.usos_max, datos.nota or (email or ""))
    if email:
        ficha["enviado"] = await enviar_invitacion(request, usuario, ficha, email)
    return ficha


@router.get("/invitaciones")
async def listar_de_registro(usuario=Depends(usuario_admin)):
    async with db.pool.acquire() as con:
        filas = await con.fetch(SQL_FICHA + "WHERE i.proyecto_id IS NULL ORDER BY i.creado DESC LIMIT 100")
    return [_fila(r) for r in filas]


@router.delete("/invitaciones/{iid}")
async def revocar(iid: str, usuario=Depends(usuario_actual)):
    """La revoca quien la creó, el dueño del proyecto o el administrador."""
    i = parsear_uuid(iid)
    async with db.pool.acquire() as con:
        fila = await con.fetchrow("SELECT i.creado_por, p.dueno_id FROM invitaciones i LEFT JOIN proyectos p ON p.id = i.proyecto_id "
                                  "WHERE i.id = $1", i) if i else None
        if fila is None or usuario["id"] not in (fila["creado_por"], fila["dueno_id"]) and not usuario["es_admin"]:
            raise HTTPException(404, {"error": "Esa invitación no existe.", "code": "not_found"})
        await con.execute("UPDATE invitaciones SET revocada = coalesce(revocada, now()) WHERE id = $1", i)
    return {"ok": True}


@router.patch("/invitaciones/{iid}")
async def cambiar(iid: str, datos: CambioInvitacion, usuario=Depends(usuario_actual)):
    """Extender o cambiar un enlace: caducidad, usos, plazo del acceso que da o reactivarlo. Quien lo creó, el dueño o el admin."""
    i = parsear_uuid(iid)
    async with db.pool.acquire() as con:
        fila = await con.fetchrow("SELECT i.creado_por, p.dueno_id FROM invitaciones i LEFT JOIN proyectos p ON p.id = i.proyecto_id WHERE i.id = $1", i) if i else None
        if fila is None or usuario["id"] not in (fila["creado_por"], fila["dueno_id"]) and not usuario["es_admin"]:
            raise HTTPException(404, {"error": "Esa invitación no existe.", "code": "not_found"})
        if datos.sin_caducidad:
            await con.execute("UPDATE invitaciones SET expira = NULL WHERE id = $1", i)
        elif datos.dias:
            await con.execute("UPDATE invitaciones SET expira = greatest(coalesce(expira, now()), now()) + make_interval(days => $2) WHERE id = $1", i, datos.dias)
        if datos.sin_limite:
            await con.execute("UPDATE invitaciones SET usos_max = NULL WHERE id = $1", i)
        elif datos.mas_usos:
            await con.execute("UPDATE invitaciones SET usos_max = greatest(coalesce(usos_max, 0), usos) + $2 WHERE id = $1", i, datos.mas_usos)
        if datos.acceso_sin_plazo:
            await con.execute("UPDATE invitaciones SET acceso_dias = NULL WHERE id = $1", i)
        elif datos.acceso_dias:
            await con.execute("UPDATE invitaciones SET acceso_dias = $2 WHERE id = $1", i, datos.acceso_dias)
        if datos.reactivar:
            await con.execute("UPDATE invitaciones SET revocada = NULL WHERE id = $1", i)
        f = await con.fetchrow(SQL_FICHA + "WHERE i.id = $1", i)
    return _fila(f)


# ───────────────────────── Abrir y aceptar un enlace ─────────────────────────
async def buscar(con, token: str):
    """Invitación válida con los datos que ve quien abre el enlace, o None."""
    return await con.fetchrow(
        "SELECT i.id, i.proyecto_id, i.rol, i.acceso_dias, u.nombre AS invita, p.nombre AS proyecto, p.descripcion, p.plantilla "
        "FROM invitaciones i JOIN usuarios u ON u.id = i.creado_por LEFT JOIN proyectos p ON p.id = i.proyecto_id "
        "WHERE i.token_hash = $1 AND " + VALIDA, _hash_token(token))


async def consumir(con, token: str, usuario_id):
    """Gasta un uso y da acceso al proyecto (dentro de la transacción de quien llama). Devuelve la invitación o None si ya no vale.
    Nunca baja el rol de quien ya es miembro (un enlace de «solo ver» no quita la edición a un editor)."""
    inv = await con.fetchrow("UPDATE invitaciones i SET usos = usos + 1 WHERE i.token_hash = $1 AND " + VALIDA +
                             " RETURNING i.id, i.proyecto_id, i.rol, i.acceso_dias", _hash_token(token))
    if inv:
        await con.execute("INSERT INTO invitaciones_usos (invitacion_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", inv["id"], usuario_id)
    if inv and inv["proyecto_id"]:
        # acceso con plazo si el enlace lo dice; nunca acorta un plazo vigente ni quita «sin plazo»
        await con.execute(
            "INSERT INTO miembros (proyecto_id, usuario_id, rol, expira, invitacion_id) "
            "VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(days => $4::int) END, $5) "
            "ON CONFLICT (proyecto_id, usuario_id) DO UPDATE SET "
            "  rol = CASE WHEN miembros.rol = 'lector' AND excluded.rol = 'editor' THEN 'editor' ELSE miembros.rol END, "
            "  expira = CASE WHEN miembros.expira IS NULL THEN NULL WHEN excluded.expira IS NULL THEN NULL ELSE greatest(miembros.expira, excluded.expira) END, "
            "  invitacion_id = coalesce(miembros.invitacion_id, excluded.invitacion_id) "
            "WHERE miembros.rol <> 'dueno'",
            inv["proyecto_id"], usuario_id, inv["rol"], inv["acceso_dias"], inv["id"])
    return inv


@router.get("/invitacion/{token}")
async def ver_enlace(token: str):
    """Público: lo que muestra la página de la invitación antes de entrar o crear la cuenta."""
    async with db.pool.acquire() as con:
        inv = await buscar(con, token[:100])
    if inv is None:
        raise HTTPException(404, NO_VALIDA)
    return {"tipo": "proyecto" if inv["proyecto_id"] else "registro", "invita": inv["invita"], "proyecto": inv["proyecto"],
            "descripcion": inv["descripcion"] or "", "plantilla": inv["plantilla"], "rol": inv["rol"], "acceso_dias": inv["acceso_dias"],
            "registro_abierto": config.REGISTRO_ABIERTO}


@router.post("/invitacion/{token}/aceptar")
async def aceptar(token: str, usuario=Depends(usuario_actual)):
    token = token[:100]
    async with db.pool.acquire() as con, con.transaction():
        inv = await buscar(con, token)
        if inv is None:
            raise HTTPException(404, NO_VALIDA)
        if inv["proyecto_id"] is None:
            return {"proyecto": None}  # enlace de registro: quien ya tiene cuenta no necesita nada más
        actual = await con.fetchval("SELECT rol FROM miembros WHERE proyecto_id = $1 AND usuario_id = $2 AND (expira IS NULL OR expira > now())", inv["proyecto_id"], usuario["id"])
        # Si ya tiene ese acceso (o más), no gasta un uso del enlace.
        if actual is None or (actual != "dueno" and RANGO[inv["rol"]] > RANGO.get(actual, 0)):
            if await consumir(con, token, usuario["id"]) is None:
                raise HTTPException(404, NO_VALIDA)
        fila = await con.fetchrow("SELECT id, mapa_inicial FROM proyectos WHERE id = $1", inv["proyecto_id"])
    return {"proyecto": {"id": str(fila["id"]), "mapa_inicial": fila["mapa_inicial"]}}
