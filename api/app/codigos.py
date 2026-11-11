"""Códigos de 6 dígitos por correo (verificar, recuperar, entrar, cambiar_correo) y límite de intentos de entrada."""
import hashlib
import hmac
import ipaddress
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from . import config

MINUTOS_VALIDEZ = 15
MAX_INTENTOS = 5
ESPERA_REENVIO = 60          # segundos entre dos códigos del mismo tipo
MAX_POR_HORA = 6
FALLOS_EMAIL = 8             # intentos fallidos de entrada por correo en 15 min
FALLOS_IP = 40               # y por IP (solo si OO_IP_CABECERA dice de dónde sacar la IP real)


def _hash(cid: uuid.UUID, codigo: str) -> bytes:
    return hashlib.sha256(cid.bytes + codigo.encode()).digest()


async def emitir(con, usuario_id, proposito: str, email: str) -> tuple[uuid.UUID, str]:
    """Crea un código nuevo (anula los anteriores sin usar del mismo tipo). 429 si se piden demasiado seguido."""
    ultimos = await con.fetch("SELECT creado FROM codigos WHERE usuario_id = $1 AND proposito = $2 AND creado > now() - interval '1 hour' "
                              "ORDER BY creado DESC", usuario_id, proposito)
    if ultimos:
        espera = ESPERA_REENVIO - (datetime.now(timezone.utc) - ultimos[0]["creado"]).total_seconds()
        if espera > 0:
            raise HTTPException(429, {"error": "Espera %d s antes de pedir otro código." % (int(espera) + 1), "code": "resource_exhausted",
                                      "espera": int(espera) + 1})
        if len(ultimos) >= MAX_POR_HORA:
            raise HTTPException(429, {"error": "Pediste demasiados códigos. Vuelve a intentarlo en una hora.", "code": "resource_exhausted"})
    await con.execute("UPDATE codigos SET usado = now() WHERE usuario_id = $1 AND proposito = $2 AND usado IS NULL", usuario_id, proposito)
    cid, codigo = uuid.uuid4(), "%06d" % secrets.randbelow(1_000_000)
    await con.execute("INSERT INTO codigos (id, proposito, usuario_id, email, codigo_hash, expira) VALUES ($1, $2, $3, $4, $5, $6)",
                      cid, proposito, usuario_id, email, _hash(cid, codigo), datetime.now(timezone.utc) + timedelta(minutes=MINUTOS_VALIDEZ))
    return cid, codigo


async def comprobar(con, proposito: str, codigo: str, usuario_id=None, cid=None):
    """Devuelve la fila del código (id, usuario_id, email) y lo marca usado; si no, 400. Los intentos fallidos se guardan aunque
    quien llama esté dentro de una transacción que luego se deshaga, así que no la uses alrededor de esta función."""
    codigo = "".join(c for c in str(codigo) if c.isdigit())
    filtro, arg = ("id = $2", cid) if cid else ("usuario_id = $2", usuario_id)
    fila = await con.fetchrow("SELECT id, usuario_id, email, codigo_hash, intentos FROM codigos WHERE proposito = $1 AND " + filtro +
                              " AND usado IS NULL AND expira > now() ORDER BY creado DESC LIMIT 1", proposito, arg)
    if fila is None:
        raise HTTPException(400, {"error": "El código caducó o ya se usó. Pide otro.", "code": "codigo_caducado"})
    if fila["intentos"] >= MAX_INTENTOS:
        raise HTTPException(400, {"error": "Demasiados intentos con este código. Pide otro.", "code": "codigo_caducado"})
    if len(codigo) != 6 or not hmac.compare_digest(fila["codigo_hash"], _hash(fila["id"], codigo)):
        quedan = MAX_INTENTOS - fila["intentos"] - 1
        await con.execute("UPDATE codigos SET intentos = intentos + 1 WHERE id = $1", fila["id"])
        raise HTTPException(400, {"error": "Código incorrecto." + (" Te quedan %d intentos." % quedan if quedan > 0 else " Pide otro."),
                                  "code": "codigo_incorrecto" if quedan > 0 else "codigo_caducado"})
    await con.execute("UPDATE codigos SET usado = now() WHERE id = $1", fila["id"])
    return fila


# ───────────────────────── Límite de intentos de entrada ─────────────────────────
def ip_cliente(request: Request) -> str | None:
    if config.IP_CABECERA:
        valor = request.headers.get(config.IP_CABECERA, "").split(",")[0].strip()
        try:
            return str(ipaddress.ip_address(valor))
        except ValueError:
            return None
    return None  # sin cabecera de confianza, la IP de la conexión es la del proxy: no sirve para limitar por persona


async def frenar(con, email: str, ip: str | None) -> None:
    n = await con.fetchval("SELECT count(*) FROM intentos_entrada WHERE lower(email) = lower($1) AND creado > now() - interval '15 minutes'", email)
    m = await con.fetchval("SELECT count(*) FROM intentos_entrada WHERE ip = $1::inet AND creado > now() - interval '15 minutes'", ip) if ip else 0
    if n >= FALLOS_EMAIL or m >= FALLOS_IP:
        raise HTTPException(429, {"error": "Demasiados intentos fallidos. Espera 15 minutos o recupera tu contraseña.", "code": "resource_exhausted"})


async def anotar_fallo(con, email: str, ip: str | None) -> None:
    await con.execute("INSERT INTO intentos_entrada (email, ip) VALUES ($1, $2::inet)", email[:254], ip)
    await con.execute("DELETE FROM intentos_entrada WHERE creado < now() - interval '1 day'")


async def limpiar_fallos(con, email: str) -> None:
    await con.execute("DELETE FROM intentos_entrada WHERE lower(email) = lower($1)", email)


def ocultar(email: str) -> str:
    """ana.torres@dominio.com → an•••••@dominio.com (para decir adónde se envió el código sin mostrarlo entero)."""
    usuario, _, dominio = email.partition("@")
    return usuario[:2] + "•" * max(3, len(usuario) - 2) + "@" + dominio
