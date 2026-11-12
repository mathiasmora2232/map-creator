"""Claves (argon2id), sesiones por cookie y permisos por proyecto."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import HTTPException, Request, Response

from . import config, db

_ph = PasswordHasher()
# Hash de relleno para que «el correo no existe» tarde lo mismo que «la clave no coincide».
_HASH_FALSO = _ph.hash(secrets.token_hex(16))

ROLES_ESCRITURA = ("dueno", "editor")


def hashear_clave(clave: str) -> str:
    return _ph.hash(clave)


def verificar_clave(hash_: str | None, clave: str) -> bool:
    try:
        return _ph.verify(hash_ or _HASH_FALSO, clave) and hash_ is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def _hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


async def crear_sesion(respuesta: Response, request: Request, usuario_id) -> None:
    token = secrets.token_urlsafe(32)
    expira = datetime.now(timezone.utc) + timedelta(days=config.DIAS_SESION)
    ip = request.client.host if request.client else None
    async with db.pool.acquire() as con:
        await con.execute(
            "INSERT INTO sesiones (token_hash, usuario_id, expira, user_agent, ip) VALUES ($1, $2, $3, $4, $5::inet)",
            _hash_token(token), usuario_id, expira, (request.headers.get("user-agent") or "")[:300], ip)
        await con.execute("UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1", usuario_id)
        await asegurar_admin(con)
        # Limpieza perezosa de sesiones vencidas.
        await con.execute("DELETE FROM sesiones WHERE expira < now()")
    respuesta.set_cookie(config.COOKIE_SESION, token, max_age=config.DIAS_SESION * 86400, httponly=True,
                         secure=config.COOKIE_SEGURA, samesite="lax", path="/")


async def asegurar_admin(con) -> None:
    """Los correos de OO_ADMINS son administradores; si aun así no hay ninguno, lo es el usuario más antiguo."""
    if config.ADMINS:
        await con.execute("UPDATE usuarios SET es_admin = true WHERE lower(email) = ANY($1::text[]) AND NOT es_admin", list(config.ADMINS))
    await con.execute("UPDATE usuarios SET es_admin = true WHERE id = (SELECT id FROM usuarios ORDER BY creado LIMIT 1) "
                      "AND NOT EXISTS (SELECT 1 FROM usuarios WHERE es_admin)")


async def cerrar_sesion(respuesta: Response, request: Request) -> None:
    token = request.cookies.get(config.COOKIE_SESION)
    if token:
        async with db.pool.acquire() as con:
            await con.execute("DELETE FROM sesiones WHERE token_hash = $1", _hash_token(token))
    respuesta.delete_cookie(config.COOKIE_SESION, path="/")


async def usuario_opcional(request: Request):
    """Usuario de la cookie de sesión (un Record con id, email y nombre) o None."""
    if hasattr(request.state, "usuario"):
        return request.state.usuario
    token = request.cookies.get(config.COOKIE_SESION)
    usuario = None
    if token:
        async with db.pool.acquire() as con:
            usuario = await con.fetchrow(
                "SELECT u.id, u.email, u.nombre, u.es_admin, u.email_verificado, u.dos_pasos FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id "
                "WHERE s.token_hash = $1 AND s.expira > now()", _hash_token(token))
    request.state.usuario = usuario
    return usuario


def verificado(usuario) -> bool:
    """Sin correo configurado no se puede verificar nada, así que todos cuentan como verificados."""
    return usuario["email_verificado"] is not None or not config.CORREO_ACTIVO


async def usuario_sesion(request: Request):
    """Cualquier sesión válida, aunque el correo no esté verificado (para verificarlo, salir o ver «yo»)."""
    usuario = await usuario_opcional(request)
    if usuario is None:
        raise HTTPException(401, {"error": "Tienes que entrar con tu cuenta.", "code": "unauthenticated"})
    return usuario


async def usuario_actual(request: Request):
    """Sesión válida y correo verificado: lo que exige casi toda la API."""
    usuario = await usuario_sesion(request)
    if not verificado(usuario):
        raise HTTPException(403, {"error": "Verifica tu correo para continuar.", "code": "email_no_verificado"})
    return usuario


async def usuario_admin(request: Request):
    usuario = await usuario_actual(request)
    if not usuario["es_admin"]:
        raise HTTPException(403, {"error": "Solo el administrador puede hacer esto.", "code": "permission_denied"})
    return usuario


def parsear_uuid(valor) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(valor))
    except (ValueError, TypeError):
        return None


async def rol_en(proyecto_id, usuario_id) -> str | None:
    async with db.pool.acquire() as con:
        return await con.fetchval(
            "SELECT m.rol FROM miembros m JOIN proyectos p ON p.id = m.proyecto_id "
            "WHERE m.proyecto_id = $1 AND m.usuario_id = $2 AND p.archivado IS NULL AND (m.expira IS NULL OR m.expira > now())",
            proyecto_id, usuario_id)  # un acceso con plazo vencido ya no cuenta


async def exigir_rol(proyecto_id, usuario, escritura=False) -> str:
    """Rol del usuario en el proyecto. 404 si no es miembro (no se revela que el proyecto existe), 403 si solo puede leer."""
    pid = parsear_uuid(proyecto_id)
    rol = await rol_en(pid, usuario["id"]) if pid else None
    if rol is None:
        raise HTTPException(404, {"error": "Ese proyecto no existe o no tienes acceso.", "code": "not_found"})
    if escritura and rol not in ROLES_ESCRITURA:
        raise HTTPException(403, {"error": "Solo puedes ver este proyecto: pide al dueño que te haga editor.", "code": "permission_denied"})
    return rol
