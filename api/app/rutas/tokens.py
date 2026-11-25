"""Tokens de acceso personales (para el servidor MCP y la API REST): se crean y se revocan desde Cuenta.
El token completo se devuelve una sola vez; en la base solo queda su sha256. Solo se gestionan con la sesión del navegador (no con otro
token), así un token robado no puede fabricar más."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import config, db
from ..seguridad import nuevo_token_api, parsear_uuid, usuario_actual

router = APIRouter(prefix="/api/cuenta/tokens", tags=["tokens"])


class NuevoToken(BaseModel):
    nombre: str = Field(min_length=1, max_length=60)


def _solo_navegador(request: Request):
    if getattr(request.state, "con_token", False):
        raise HTTPException(403, {"error": "Los tokens se gestionan desde la cuenta en el navegador.", "code": "permission_denied"})


def _fila(r) -> dict:
    return {"id": str(r["id"]), "nombre": r["nombre"], "prefijo": r["prefijo"], "creado": r["creado"].isoformat(),
            "ultimo_uso": r["ultimo_uso"].isoformat() if r["ultimo_uso"] else None}


@router.get("")
async def listar(request: Request, usuario=Depends(usuario_actual)):
    async with db.pool.acquire() as con:
        filas = await con.fetch("SELECT id, nombre, prefijo, creado, ultimo_uso FROM tokens_api WHERE usuario_id = $1 AND revocado IS NULL ORDER BY creado DESC", usuario["id"])
    return [_fila(f) for f in filas]


@router.post("", status_code=201)
async def crear(datos: NuevoToken, request: Request, usuario=Depends(usuario_actual)):
    _solo_navegador(request)
    token, h, prefijo = nuevo_token_api()
    async with db.pool.acquire() as con:
        n = await con.fetchval("SELECT count(*) FROM tokens_api WHERE usuario_id = $1 AND revocado IS NULL", usuario["id"])
        if n >= config.MAX_TOKENS_USUARIO:
            raise HTTPException(400, {"error": "Tienes %d tokens: revoca alguno para crear otro." % n, "code": "resource_exhausted"})
        f = await con.fetchrow("INSERT INTO tokens_api (usuario_id, nombre, hash, prefijo) VALUES ($1, $2, $3, $4) RETURNING id, nombre, prefijo, creado, ultimo_uso",
                               usuario["id"], datos.nombre.strip(), h, prefijo)
    return dict(_fila(f), token=token)


@router.delete("/{tid}")
async def revocar(tid: str, request: Request, usuario=Depends(usuario_actual)):
    _solo_navegador(request)
    async with db.pool.acquire() as con:
        r = await con.execute("UPDATE tokens_api SET revocado = now() WHERE id = $1 AND usuario_id = $2 AND revocado IS NULL", parsear_uuid(tid), usuario["id"])
    if r.endswith(" 0"):
        raise HTTPException(404, {"error": "Ese token no existe.", "code": "not_found"})
    return {"ok": True}
