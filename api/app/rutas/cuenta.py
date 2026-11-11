"""Registro, entrada, salida y datos de la cuenta."""
import json
import re

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import config, db
from ..seguridad import _hash_token, cerrar_sesion, crear_sesion, hashear_clave, usuario_actual, verificar_clave
from .invitaciones import NO_VALIDA, consumir

router = APIRouter(prefix="/api/cuenta", tags=["cuenta"])
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")


class Registro(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=254)
    clave: str = Field(min_length=8, max_length=200)
    invitacion: str | None = Field(default=None, max_length=100)  # token de /invitacion/<token>: vale aunque el registro esté cerrado


class Entrada(BaseModel):
    email: str = Field(max_length=254)
    clave: str = Field(max_length=200)


class CambioCuenta(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    clave_actual: str | None = Field(default=None, max_length=200)
    clave_nueva: str | None = Field(default=None, min_length=8, max_length=200)
    preferencias: dict | None = None  # se fusiona con las guardadas; una clave con null se borra


MAX_PREFERENCIAS = 8000


def _publico(u):
    return {"id": str(u["id"]), "email": u["email"], "nombre": u["nombre"]}


def _completo(u):
    return _publico(u) | {"es_admin": u["es_admin"], "preferencias": json.loads(u["preferencias"] or "{}"),
                          "registro_abierto": config.REGISTRO_ABIERTO}


SQL_YO = "SELECT id, email, nombre, es_admin, preferencias FROM usuarios WHERE id = $1"


@router.post("/registro")
async def registro(datos: Registro, request: Request, respuesta: Response):
    if not config.REGISTRO_ABIERTO and not datos.invitacion:
        raise HTTPException(403, {"error": "El registro es solo por invitación: pide un enlace a quien te quiera dar acceso.",
                                  "code": "permission_denied"})
    email = datos.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(400, {"error": "Ese correo no parece válido.", "code": "invalid_argument"})
    proyecto = None
    try:
        async with db.pool.acquire() as con, con.transaction():
            u = await con.fetchrow("INSERT INTO usuarios (email, nombre, clave_hash) VALUES ($1, $2, $3) RETURNING id, email, nombre",
                                   email, datos.nombre.strip(), hashear_clave(datos.clave))
            if datos.invitacion:
                inv = await consumir(con, datos.invitacion, u["id"])
                if inv is None:
                    raise HTTPException(400, NO_VALIDA)
                if inv["proyecto_id"]:
                    proyecto = await con.fetchrow("SELECT id, mapa_inicial FROM proyectos WHERE id = $1", inv["proyecto_id"])
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, {"error": "Ya hay una cuenta con ese correo. ¿Quieres entrar?", "code": "already_exists"})
    await crear_sesion(respuesta, request, u["id"])
    return _publico(u) | {"proyecto": {"id": str(proyecto["id"]), "mapa_inicial": proyecto["mapa_inicial"]} if proyecto else None}


@router.post("/entrar")
async def entrar(datos: Entrada, request: Request, respuesta: Response):
    async with db.pool.acquire() as con:
        u = await con.fetchrow("SELECT id, email, nombre, clave_hash FROM usuarios WHERE lower(email) = lower($1)", datos.email.strip())
    if not verificar_clave(u["clave_hash"] if u else None, datos.clave):
        raise HTTPException(401, {"error": "Correo o contraseña incorrectos.", "code": "unauthenticated"})
    await crear_sesion(respuesta, request, u["id"])
    return _publico(u)


@router.post("/salir")
async def salir(request: Request, respuesta: Response):
    await cerrar_sesion(respuesta, request)
    return {"ok": True}


@router.get("/yo")
async def yo(usuario=Depends(usuario_actual)):
    async with db.pool.acquire() as con:
        return _completo(await con.fetchrow(SQL_YO, usuario["id"]))


@router.patch("/yo")
async def cambiar(datos: CambioCuenta, request: Request, usuario=Depends(usuario_actual)):
    async with db.pool.acquire() as con:
        if datos.clave_nueva:
            actual = await con.fetchval("SELECT clave_hash FROM usuarios WHERE id = $1", usuario["id"])
            if not verificar_clave(actual, datos.clave_actual or ""):
                raise HTTPException(400, {"error": "La contraseña actual no coincide.", "code": "invalid_argument"})
            await con.execute("UPDATE usuarios SET clave_hash = $2 WHERE id = $1", usuario["id"], hashear_clave(datos.clave_nueva))
            # Al cambiar la clave se cierran las demás sesiones (las de otros dispositivos).
            await con.execute("DELETE FROM sesiones WHERE usuario_id = $1 AND token_hash <> $2", usuario["id"],
                              _hash_token(request.cookies.get(config.COOKIE_SESION, "")))
        if datos.nombre:
            await con.execute("UPDATE usuarios SET nombre = $2 WHERE id = $1", usuario["id"], datos.nombre.strip())
        if datos.preferencias:
            texto = json.dumps(datos.preferencias, ensure_ascii=False)
            if len(texto) > MAX_PREFERENCIAS:
                raise HTTPException(400, {"error": "Demasiadas preferencias.", "code": "invalid_argument"})
            # Fusiona y luego quita las claves que llegaron con null.
            await con.execute("UPDATE usuarios SET preferencias = jsonb_strip_nulls(preferencias || $2::jsonb) WHERE id = $1",
                              usuario["id"], texto)
        u = await con.fetchrow(SQL_YO, usuario["id"])
    return _completo(u)


publico = APIRouter(prefix="/api", tags=["cuenta"])


@publico.get("/config")
async def config_publica():
    """Lo que el sitio necesita saber antes de entrar (p. ej. si mostrar «Crear cuenta»)."""
    return {"registro_abierto": config.REGISTRO_ABIERTO}
