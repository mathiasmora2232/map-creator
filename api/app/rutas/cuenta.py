"""Cuenta: registro, entrada (con verificación en dos pasos opcional), salida, verificación del correo, recuperar la contraseña,
cambiar el correo y datos de la cuenta.

Con correo activo (SMTP_HOST): las cuentas nuevas verifican su dirección con un código de 6 dígitos antes de usar la app, y quien
olvida la contraseña la cambia con un código. Sin correo, las cuentas nuevas quedan verificadas y la recuperación no está disponible.
"""
import json
import re
from urllib.parse import quote

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import codigos, config, correo, db
from ..seguridad import (_hash_token, cerrar_sesion, crear_sesion, hashear_clave, parsear_uuid, usuario_actual, usuario_sesion,
                         verificado, verificar_clave)
from .invitaciones import NO_VALIDA, consumir

router = APIRouter(prefix="/api/cuenta", tags=["cuenta"])
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")
SIN_CORREO = {"error": "Este servidor no tiene el correo configurado. Pide ayuda al administrador.", "code": "failed_precondition"}


class Registro(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=254)
    clave: str = Field(min_length=8, max_length=200)
    invitacion: str | None = Field(default=None, max_length=100)  # token de /invitacion/<token>: vale aunque el registro esté cerrado


class Entrada(BaseModel):
    email: str = Field(max_length=254)
    clave: str = Field(max_length=200)


class EntradaCodigo(BaseModel):
    desafio: str = Field(max_length=64)
    codigo: str = Field(max_length=12)


class Desafio(BaseModel):
    desafio: str = Field(max_length=64)


class Codigo(BaseModel):
    codigo: str = Field(max_length=12)


class PedirRecuperar(BaseModel):
    email: str = Field(max_length=254)


class Recuperar(BaseModel):
    email: str = Field(max_length=254)
    codigo: str = Field(max_length=12)
    clave_nueva: str = Field(min_length=8, max_length=200)


class CambioCorreo(BaseModel):
    email_nuevo: str = Field(max_length=254)
    clave_actual: str = Field(max_length=200)


class CambioCuenta(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    clave_actual: str | None = Field(default=None, max_length=200)
    clave_nueva: str | None = Field(default=None, min_length=8, max_length=200)
    dos_pasos: bool | None = None                # cambiarlo pide la contraseña actual
    preferencias: dict | None = None             # se fusiona con las guardadas; una clave con null se borra


MAX_PREFERENCIAS = 8000
SQL_YO = "SELECT id, email, nombre, es_admin, preferencias, email_verificado, dos_pasos FROM usuarios WHERE id = $1"


def _publico(u):
    return {"id": str(u["id"]), "email": u["email"], "nombre": u["nombre"]}


def _completo(u):
    return _publico(u) | {"es_admin": u["es_admin"], "preferencias": json.loads(u["preferencias"] or "{}"),
                          "email_verificado": verificado(u), "dos_pasos": u["dos_pasos"],
                          "correo_activo": config.CORREO_ACTIVO, "registro_abierto": config.REGISTRO_ABIERTO}


def _normalizar(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(400, {"error": "Ese correo no parece válido.", "code": "invalid_argument"})
    return email


async def _enviar_codigo_verificar(con, u) -> None:
    _, codigo = await codigos.emitir(con, u["id"], "verificar", u["email"])
    await correo.enviar(u["email"], *correo.codigo_verificar(u["nombre"], codigo))


# ───────────────────────── Registro ─────────────────────────
@router.post("/registro")
async def registro(datos: Registro, request: Request, respuesta: Response):
    if not config.REGISTRO_ABIERTO and not datos.invitacion:
        raise HTTPException(403, {"error": "El registro es solo por invitación: pide un enlace a quien te quiera dar acceso.",
                                  "code": "permission_denied"})
    email = _normalizar(datos.email)
    proyecto = None
    try:
        async with db.pool.acquire() as con, con.transaction():
            u = await con.fetchrow(
                "INSERT INTO usuarios (email, nombre, clave_hash, email_verificado) VALUES ($1, $2, $3, CASE WHEN $4 THEN NULL ELSE now() END) "
                "RETURNING id, email, nombre", email, datos.nombre.strip(), hashear_clave(datos.clave), config.CORREO_ACTIVO)
            if datos.invitacion:
                inv = await consumir(con, datos.invitacion, u["id"])
                if inv is None:
                    raise HTTPException(400, NO_VALIDA)
                if inv["proyecto_id"]:
                    proyecto = await con.fetchrow("SELECT id, mapa_inicial FROM proyectos WHERE id = $1", inv["proyecto_id"])
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, {"error": "Ya hay una cuenta con ese correo. ¿Quieres entrar?", "code": "already_exists"})
    await crear_sesion(respuesta, request, u["id"])
    if config.CORREO_ACTIVO:
        async with db.pool.acquire() as con:
            await _enviar_codigo_verificar(con, u)
    return _publico(u) | {"verificar": config.CORREO_ACTIVO,
                          "proyecto": {"id": str(proyecto["id"]), "mapa_inicial": proyecto["mapa_inicial"]} if proyecto else None}


# ───────────────────────── Entrar (y dos pasos) ─────────────────────────
@router.post("/entrar")
async def entrar(datos: Entrada, request: Request, respuesta: Response):
    email, ip = datos.email.strip(), codigos.ip_cliente(request)
    async with db.pool.acquire() as con:
        await codigos.frenar(con, email, ip)
        u = await con.fetchrow("SELECT id, email, nombre, clave_hash, dos_pasos FROM usuarios WHERE lower(email) = lower($1)", email)
        if not verificar_clave(u["clave_hash"] if u else None, datos.clave):
            await codigos.anotar_fallo(con, email, ip)
            raise HTTPException(401, {"error": "Correo o contraseña incorrectos.", "code": "unauthenticated"})
        if u["dos_pasos"] and config.CORREO_ACTIVO:
            # La contraseña es correcta, pero falta el código: no hay sesión todavía.
            cid, codigo = await codigos.emitir(con, u["id"], "entrar", u["email"])
            await correo.enviar(u["email"], *correo.codigo_entrar(u["nombre"], codigo))
            return {"dos_pasos": True, "desafio": str(cid), "email": codigos.ocultar(u["email"])}
        await codigos.limpiar_fallos(con, email)
    await crear_sesion(respuesta, request, u["id"])
    return _publico(u)


@router.post("/entrar/codigo")
async def entrar_codigo(datos: EntradaCodigo, request: Request, respuesta: Response):
    cid = parsear_uuid(datos.desafio)
    if cid is None:
        raise HTTPException(400, {"error": "El código caducó o ya se usó. Vuelve a entrar.", "code": "codigo_caducado"})
    async with db.pool.acquire() as con:
        fila = await codigos.comprobar(con, "entrar", datos.codigo, cid=cid)
        u = await con.fetchrow("SELECT id, email, nombre FROM usuarios WHERE id = $1", fila["usuario_id"])
        await codigos.limpiar_fallos(con, u["email"])
    await crear_sesion(respuesta, request, u["id"])
    return _publico(u)


@router.post("/entrar/reenviar")
async def entrar_reenviar(datos: Desafio):
    """Otro código para el mismo intento de entrada (devuelve un desafío nuevo)."""
    cid = parsear_uuid(datos.desafio)
    async with db.pool.acquire() as con:
        fila = await con.fetchrow("SELECT c.usuario_id, u.email, u.nombre FROM codigos c JOIN usuarios u ON u.id = c.usuario_id "
                                  "WHERE c.id = $1 AND c.proposito = 'entrar' AND c.creado > now() - interval '30 minutes'", cid) if cid else None
        if fila is None:
            raise HTTPException(400, {"error": "Vuelve a escribir tu contraseña.", "code": "codigo_caducado"})
        nuevo, codigo = await codigos.emitir(con, fila["usuario_id"], "entrar", fila["email"])
    await correo.enviar(fila["email"], *correo.codigo_entrar(fila["nombre"], codigo))
    return {"desafio": str(nuevo)}


@router.post("/salir")
async def salir(request: Request, respuesta: Response):
    await cerrar_sesion(respuesta, request)
    return {"ok": True}


# ───────────────────────── Verificar el correo ─────────────────────────
@router.post("/verificar")
async def verificar(datos: Codigo, usuario=Depends(usuario_sesion)):
    async with db.pool.acquire() as con:
        if usuario["email_verificado"] is None:
            await codigos.comprobar(con, "verificar", datos.codigo, usuario_id=usuario["id"])
            await con.execute("UPDATE usuarios SET email_verificado = now() WHERE id = $1", usuario["id"])
        return _completo(await con.fetchrow(SQL_YO, usuario["id"]))


@router.post("/verificar/reenviar")
async def verificar_reenviar(usuario=Depends(usuario_sesion)):
    if not config.CORREO_ACTIVO:
        raise HTTPException(400, SIN_CORREO)
    if usuario["email_verificado"] is not None:
        return {"ok": True, "ya_verificado": True}
    async with db.pool.acquire() as con:
        await _enviar_codigo_verificar(con, usuario)
    return {"ok": True, "email": codigos.ocultar(usuario["email"])}


# ───────────────────────── Olvidé mi contraseña ─────────────────────────
@router.post("/recuperar")
async def recuperar(datos: PedirRecuperar, request: Request):
    """Siempre responde lo mismo, exista o no la cuenta (no revela qué correos están registrados)."""
    if not config.CORREO_ACTIVO:
        raise HTTPException(400, SIN_CORREO)
    email = datos.email.strip()
    async with db.pool.acquire() as con:
        u = await con.fetchrow("SELECT id, email, nombre FROM usuarios WHERE lower(email) = lower($1)", email)
        if u is not None:
            try:
                _, codigo = await codigos.emitir(con, u["id"], "recuperar", u["email"])
            except HTTPException as e:
                if e.status_code != 429:
                    raise
                codigo = None  # pidió demasiados: no se envía otro, pero la respuesta es la misma
            if codigo:
                url = "%s/recuperar?email=%s" % (correo.url_base(request), quote(u["email"]))
                await correo.enviar(u["email"], *correo.codigo_recuperar(u["nombre"], codigo, url))
    return {"ok": True}


@router.post("/recuperar/confirmar")
async def recuperar_confirmar(datos: Recuperar, request: Request, respuesta: Response):
    email, ip = datos.email.strip(), codigos.ip_cliente(request)
    async with db.pool.acquire() as con:
        await codigos.frenar(con, email, ip)
        u = await con.fetchrow("SELECT id, email, nombre FROM usuarios WHERE lower(email) = lower($1)", email)
        if u is None:
            await codigos.anotar_fallo(con, email, ip)
            raise HTTPException(400, {"error": "El código caducó o ya se usó. Pide otro.", "code": "codigo_caducado"})
        await codigos.comprobar(con, "recuperar", datos.codigo, usuario_id=u["id"])
        # Quien recibió el código demostró que el correo es suyo: queda verificado. Se cierran todas sus sesiones.
        await con.execute("UPDATE usuarios SET clave_hash = $2, email_verificado = coalesce(email_verificado, now()) WHERE id = $1",
                          u["id"], hashear_clave(datos.clave_nueva))
        await con.execute("DELETE FROM sesiones WHERE usuario_id = $1", u["id"])
        await codigos.limpiar_fallos(con, u["email"])
    await crear_sesion(respuesta, request, u["id"])
    await correo.enviar(u["email"], *correo.aviso_clave_cambiada(u["nombre"], correo.url_base(request) + "/recuperar"))
    return _publico(u)


# ───────────────────────── Cambiar el correo ─────────────────────────
@router.post("/correo")
async def pedir_cambio_correo(datos: CambioCorreo, usuario=Depends(usuario_actual)):
    if not config.CORREO_ACTIVO:
        raise HTTPException(400, SIN_CORREO)
    nuevo = _normalizar(datos.email_nuevo)
    async with db.pool.acquire() as con:
        actual = await con.fetchval("SELECT clave_hash FROM usuarios WHERE id = $1", usuario["id"])
        if not verificar_clave(actual, datos.clave_actual):
            raise HTTPException(400, {"error": "La contraseña actual no coincide.", "code": "invalid_argument"})
        if nuevo == usuario["email"].lower():
            raise HTTPException(400, {"error": "Ese ya es tu correo.", "code": "invalid_argument"})
        if await con.fetchval("SELECT 1 FROM usuarios WHERE lower(email) = $1", nuevo):
            raise HTTPException(409, {"error": "Ya hay una cuenta con ese correo.", "code": "already_exists"})
        _, codigo = await codigos.emitir(con, usuario["id"], "cambiar_correo", nuevo)
    await correo.enviar(nuevo, *correo.codigo_cambiar_correo(usuario["nombre"], codigo))
    return {"ok": True, "email": codigos.ocultar(nuevo)}


@router.post("/correo/confirmar")
async def confirmar_cambio_correo(datos: Codigo, request: Request, usuario=Depends(usuario_actual)):
    async with db.pool.acquire() as con:
        fila = await codigos.comprobar(con, "cambiar_correo", datos.codigo, usuario_id=usuario["id"])
        try:
            await con.execute("UPDATE usuarios SET email = $2, email_verificado = now() WHERE id = $1", usuario["id"], fila["email"])
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, {"error": "Ya hay una cuenta con ese correo.", "code": "already_exists"})
        u = await con.fetchrow(SQL_YO, usuario["id"])
    await correo.enviar(usuario["email"], *correo.aviso_correo_cambiado(usuario["nombre"], fila["email"], correo.url_base(request)))
    return _completo(u)


# ───────────────────────── Datos de la cuenta ─────────────────────────
@router.get("/yo")
async def yo(usuario=Depends(usuario_sesion)):
    async with db.pool.acquire() as con:
        return _completo(await con.fetchrow(SQL_YO, usuario["id"]))


@router.patch("/yo")
async def cambiar(datos: CambioCuenta, request: Request, usuario=Depends(usuario_actual)):
    aviso_clave = False
    async with db.pool.acquire() as con:
        if datos.clave_nueva or datos.dos_pasos is not None:
            actual = await con.fetchval("SELECT clave_hash FROM usuarios WHERE id = $1", usuario["id"])
            if not verificar_clave(actual, datos.clave_actual or ""):
                raise HTTPException(400, {"error": "La contraseña actual no coincide.", "code": "invalid_argument"})
        if datos.clave_nueva:
            await con.execute("UPDATE usuarios SET clave_hash = $2 WHERE id = $1", usuario["id"], hashear_clave(datos.clave_nueva))
            # Al cambiar la clave se cierran las demás sesiones (las de otros dispositivos).
            await con.execute("DELETE FROM sesiones WHERE usuario_id = $1 AND token_hash <> $2", usuario["id"],
                              _hash_token(request.cookies.get(config.COOKIE_SESION, "")))
            aviso_clave = True
        if datos.dos_pasos is not None:
            if datos.dos_pasos and not config.CORREO_ACTIVO:
                raise HTTPException(400, SIN_CORREO)
            await con.execute("UPDATE usuarios SET dos_pasos = $2 WHERE id = $1", usuario["id"], datos.dos_pasos)
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
    if aviso_clave:
        await correo.enviar(u["email"], *correo.aviso_clave_cambiada(u["nombre"], correo.url_base(request) + "/recuperar"))
    return _completo(u)


publico = APIRouter(prefix="/api", tags=["cuenta"])


@publico.get("/config")
async def config_publica():
    """Lo que el sitio necesita saber antes de entrar (p. ej. si mostrar «Crear cuenta» o «¿Olvidaste tu contraseña?»)."""
    return {"registro_abierto": config.REGISTRO_ABIERTO, "correo": config.CORREO_ACTIVO}
