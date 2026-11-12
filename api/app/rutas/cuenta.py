"""Cuenta: registro, entrada (con verificación en dos pasos opcional), salida, verificación del correo, recuperar la contraseña,
cambiar el correo y datos de la cuenta.

Con correo activo (SMTP_HOST): las cuentas nuevas verifican su dirección con un código de 6 dígitos antes de usar la app, y quien
olvida la contraseña la cambia con un código. Sin correo, las cuentas nuevas quedan verificadas y la recuperación no está disponible.
"""
import json
import re
import shutil
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


class Borrado(BaseModel):
    clave: str = Field(max_length=200)


class CambioCuenta(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    clave_actual: str | None = Field(default=None, max_length=200)
    clave_nueva: str | None = Field(default=None, min_length=8, max_length=200)
    dos_pasos: bool | None = None                # cambiarlo pide la contraseña actual
    bio: str | None = Field(default=None, max_length=280)
    empresa: str | None = Field(default=None, max_length=80)
    preferencias: dict | None = None             # se fusiona con las guardadas; una clave con null se borra


MAX_PREFERENCIAS = 8000
SQL_YO = "SELECT id, email, nombre, es_admin, preferencias, email_verificado, dos_pasos, bio, empresa, avatar_v FROM usuarios WHERE id = $1"


def _publico(u):
    return {"id": str(u["id"]), "email": u["email"], "nombre": u["nombre"]}


def _completo(u):
    return _publico(u) | {"es_admin": u["es_admin"], "preferencias": json.loads(u["preferencias"] or "{}"),
                          "email_verificado": verificado(u), "dos_pasos": u["dos_pasos"],
                          "bio": u["bio"], "empresa": u["empresa"], "avatar_v": u["avatar_v"],
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
        if datos.bio is not None:
            await con.execute("UPDATE usuarios SET bio = $2 WHERE id = $1", usuario["id"], datos.bio.strip())
        if datos.empresa is not None:
            await con.execute("UPDATE usuarios SET empresa = $2 WHERE id = $1", usuario["id"], datos.empresa.strip())
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


# ───────────────────────── Perfil: resumen, sesiones y borrar la cuenta ─────────────────────────
def _dispositivo(ua: str) -> str:
    ua = ua or ""
    nav = next((n for k, n in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari")) if k in ua), "Navegador")
    so = next((n for k, n in (("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"), ("Windows", "Windows"), ("Mac OS", "macOS"), ("Linux", "Linux")) if k in ua), "")
    return nav + (" en " + so if so else "")


@router.get("/perfil")
async def perfil(usuario=Depends(usuario_actual)):
    async with db.pool.acquire() as con:
        f = await con.fetchrow("""
            SELECT u.creado,
                   (SELECT count(*) FROM proyectos p WHERE p.dueno_id = u.id AND p.archivado IS NULL) AS mapas,
                   (SELECT count(*) FROM miembros m JOIN proyectos p ON p.id = m.proyecto_id WHERE m.usuario_id = u.id AND m.rol <> 'dueno' AND p.archivado IS NULL) AS compartidos,
                   (SELECT count(*) FROM documentos d JOIN proyectos p ON p.id = d.proyecto_id WHERE p.dueno_id = u.id AND d.coleccion = 'cambios') AS cambios,
                   (SELECT count(*) FROM invitaciones i WHERE i.creado_por = u.id) AS invitaciones
            FROM usuarios u WHERE u.id = $1""", usuario["id"])
    return {"creado": f["creado"].isoformat(), "mapas": f["mapas"], "compartidos": f["compartidos"], "cambios": f["cambios"], "invitaciones": f["invitaciones"]}


@router.get("/sesiones")
async def sesiones(request: Request, usuario=Depends(usuario_actual)):
    actual = _hash_token(request.cookies.get(config.COOKIE_SESION, ""))
    async with db.pool.acquire() as con:
        filas = await con.fetch("SELECT token_hash, creado, expira, user_agent, host(ip) AS ip FROM sesiones WHERE usuario_id = $1 AND expira > now() "
                                "ORDER BY creado DESC", usuario["id"])
    return [{"id": f["token_hash"].hex()[:32], "dispositivo": _dispositivo(f["user_agent"]), "ip": f["ip"], "creado": f["creado"].isoformat(),
             "expira": f["expira"].isoformat(), "actual": f["token_hash"] == actual} for f in filas]


@router.delete("/sesiones/{sid}")
async def cerrar_otra(sid: str, request: Request, usuario=Depends(usuario_actual)):
    """sid = primeros 32 caracteres hex del hash de la sesión, o «otras» para cerrar todas menos esta."""
    actual = _hash_token(request.cookies.get(config.COOKIE_SESION, ""))
    async with db.pool.acquire() as con:
        if sid == "otras":
            n = await con.execute("DELETE FROM sesiones WHERE usuario_id = $1 AND token_hash <> $2", usuario["id"], actual)
        elif re.fullmatch(r"[0-9a-f]{32}", sid):
            n = await con.execute("DELETE FROM sesiones WHERE usuario_id = $1 AND token_hash <> $2 AND left(encode(token_hash, 'hex'), 32) = $3",
                                  usuario["id"], actual, sid)
        else:
            raise HTTPException(400, {"error": "Sesión no válida.", "code": "invalid_argument"})
    return {"ok": True, "cerradas": int(n.split()[-1])}


@router.delete("")
async def borrar_cuenta(datos: Borrado, respuesta: Response, request: Request, usuario=Depends(usuario_actual)):
    """Borra la cuenta, sus mapas (con sus archivos) y su acceso a los mapas de otros. No se puede deshacer."""
    async with db.pool.acquire() as con, con.transaction():
        actual = await con.fetchval("SELECT clave_hash FROM usuarios WHERE id = $1", usuario["id"])
        if not verificar_clave(actual, datos.clave):
            raise HTTPException(400, {"error": "La contraseña no coincide.", "code": "invalid_argument"})
        if usuario["es_admin"] and await con.fetchval("SELECT count(*) FROM usuarios WHERE es_admin") <= 1 and await con.fetchval("SELECT count(*) FROM usuarios") > 1:
            raise HTTPException(400, {"error": "Eres el único administrador: nombra a otro antes de borrar tu cuenta.", "code": "failed_precondition"})
        pids = [r["id"] for r in await con.fetch("SELECT id FROM proyectos WHERE dueno_id = $1", usuario["id"])]
        await con.execute("DELETE FROM usuarios WHERE id = $1", usuario["id"])
    for pid in pids:
        shutil.rmtree(config.DIR_ARCHIVOS / str(pid), ignore_errors=True)
    _borrar_avatar(usuario["id"])
    respuesta.delete_cookie(config.COOKIE_SESION, path="/")
    return {"ok": True, "mapas_borrados": len(pids)}


# ───────────────────────── Foto de perfil y exportar mis datos ─────────────────────────
MAX_AVATAR = 400 * 1024
FIRMAS = {b"\x89PNG\r\n\x1a\n": "png", b"\xff\xd8\xff": "jpg", b"RIFF": "webp"}


def _dir_avatares():
    d = config.DIR_ARCHIVOS / "_avatares"; d.mkdir(parents=True, exist_ok=True); return d


def _borrar_avatar(uid) -> None:
    for ext in ("png", "jpg", "webp"):
        (_dir_avatares() / ("%s.%s" % (uid, ext))).unlink(missing_ok=True)


@router.post("/avatar")
async def subir_avatar(request: Request, usuario=Depends(usuario_actual)):
    """Cuerpo: la imagen tal cual (el panel la recorta a 256×256 y la manda en WebP). Máx. 400 KB; se comprueba la firma del archivo."""
    datos = await request.body()
    if not datos or len(datos) > MAX_AVATAR:
        raise HTTPException(400, {"error": "La foto tiene que pesar menos de 400 KB.", "code": "invalid_argument"})
    ext = next((e for f, e in FIRMAS.items() if datos.startswith(f) and (e != "webp" or datos[8:12] == b"WEBP")), None)
    if not ext:
        raise HTTPException(400, {"error": "La foto tiene que ser PNG, JPG o WebP.", "code": "invalid_argument"})
    _borrar_avatar(usuario["id"])
    (_dir_avatares() / ("%s.%s" % (usuario["id"], ext))).write_bytes(datos)
    async with db.pool.acquire() as con:
        v = await con.fetchval("UPDATE usuarios SET avatar_v = avatar_v + 1 WHERE id = $1 RETURNING avatar_v", usuario["id"])
    return {"ok": True, "avatar_v": v}


@router.delete("/avatar")
async def quitar_avatar(usuario=Depends(usuario_actual)):
    _borrar_avatar(usuario["id"])
    async with db.pool.acquire() as con:
        await con.execute("UPDATE usuarios SET avatar_v = 0 WHERE id = $1", usuario["id"])
    return {"ok": True, "avatar_v": 0}


@router.get("/exportar")
async def exportar_datos(usuario=Depends(usuario_actual)):
    """Todo lo tuyo en un JSON: cuenta, preferencias y tus mapas con sus documentos (los archivos subidos van como lista)."""
    from fastapi.responses import Response as R
    async with db.pool.acquire() as con:
        u = await con.fetchrow(SQL_YO, usuario["id"])
        ps = await con.fetch("SELECT id, nombre, descripcion, plantilla, mapa_inicial, creado, actualizado FROM proyectos WHERE dueno_id = $1 AND archivado IS NULL ORDER BY creado", usuario["id"])
        mapas = []
        for p in ps:
            docs = await con.fetch("SELECT coleccion, doc_id, datos, actualizado FROM documentos WHERE proyecto_id = $1 ORDER BY coleccion, doc_id", p["id"])
            arch = await con.fetch("SELECT id, tipo, nombre, content_type, tamano FROM archivos WHERE proyecto_id = $1", p["id"])
            mapas.append({"id": str(p["id"]), "nombre": p["nombre"], "descripcion": p["descripcion"], "plantilla": p["plantilla"], "mapa_inicial": p["mapa_inicial"],
                          "creado": p["creado"].isoformat(), "actualizado": p["actualizado"].isoformat(),
                          "documentos": [{"coleccion": d["coleccion"], "id": d["doc_id"], "datos": json.loads(d["datos"]), "actualizado": d["actualizado"].isoformat()} for d in docs],
                          "archivos": [{"id": str(a["id"]), "tipo": a["tipo"], "nombre": a["nombre"], "content_type": a["content_type"], "tamano": a["tamano"]} for a in arch]})
    salida = {"formato": "map-creator-mis-datos-1", "exportado": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
              "cuenta": _completo(u), "mapas": mapas}
    nombre = "mis_datos_map_creator_%s.json" % __import__("datetime").date.today().isoformat()
    return R(json.dumps(salida, ensure_ascii=False, indent=1), media_type="application/json",
             headers={"Content-Disposition": 'attachment; filename="%s"' % nombre})


publico = APIRouter(prefix="/api", tags=["cuenta"])


@publico.get("/avatar/{uid}")
async def ver_avatar(uid: str, _usuario=Depends(usuario_actual)):
    from fastapi.responses import FileResponse
    if not re.fullmatch(r"[0-9a-f\-]{36}", uid):
        raise HTTPException(404, {"error": "No existe", "code": "not_found"})
    for ext, tipo in (("webp", "image/webp"), ("png", "image/png"), ("jpg", "image/jpeg")):
        f = _dir_avatares() / ("%s.%s" % (uid, ext))
        if f.is_file():
            return FileResponse(f, media_type=tipo, headers={"Cache-Control": "private, max-age=31536000, immutable"})
    raise HTTPException(404, {"error": "Sin foto", "code": "not_found"})


@publico.get("/config")
async def config_publica():
    """Lo que el sitio necesita saber antes de entrar (p. ej. si mostrar «Crear cuenta» o «¿Olvidaste tu contraseña?»)."""
    return {"registro_abierto": config.REGISTRO_ABIERTO, "correo": config.CORREO_ACTIVO}
