"""Registro, entrada, salida y datos de la cuenta."""
import re

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import config, db
from ..seguridad import _hash_token, cerrar_sesion, crear_sesion, hashear_clave, usuario_actual, verificar_clave

router = APIRouter(prefix="/api/cuenta", tags=["cuenta"])
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")


class Registro(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=254)
    clave: str = Field(min_length=8, max_length=200)


class Entrada(BaseModel):
    email: str = Field(max_length=254)
    clave: str = Field(max_length=200)


class CambioCuenta(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    clave_actual: str | None = Field(default=None, max_length=200)
    clave_nueva: str | None = Field(default=None, min_length=8, max_length=200)


def _publico(u):
    return {"id": str(u["id"]), "email": u["email"], "nombre": u["nombre"]}


@router.post("/registro")
async def registro(datos: Registro, request: Request, respuesta: Response):
    if not config.REGISTRO_ABIERTO:
        raise HTTPException(403, {"error": "El registro está cerrado en este servidor.", "code": "permission_denied"})
    email = datos.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(400, {"error": "Ese correo no parece válido.", "code": "invalid_argument"})
    try:
        async with db.pool.acquire() as con:
            u = await con.fetchrow("INSERT INTO usuarios (email, nombre, clave_hash) VALUES ($1, $2, $3) RETURNING id, email, nombre",
                                   email, datos.nombre.strip(), hashear_clave(datos.clave))
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, {"error": "Ya hay una cuenta con ese correo. ¿Quieres entrar?", "code": "already_exists"})
    await crear_sesion(respuesta, request, u["id"])
    return _publico(u)


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
    return _publico(usuario) | {"registro_abierto": config.REGISTRO_ABIERTO}


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
        u = await con.fetchrow("SELECT id, email, nombre FROM usuarios WHERE id = $1", usuario["id"])
    return _publico(u)
