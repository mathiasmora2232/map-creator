"""Administración: resumen del servidor y lista de usuarios. Solo para administradores (usuarios.es_admin)."""
from fastapi import APIRouter, Depends

from .. import config, db
from ..seguridad import usuario_admin
from .proyectos import _fila

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/resumen")
async def resumen(_usuario=Depends(usuario_admin)):
    async with db.pool.acquire() as con:
        fila = await con.fetchrow("""
            SELECT (SELECT count(*) FROM usuarios) AS usuarios,
                   (SELECT count(*) FROM usuarios WHERE ultimo_acceso > now() - interval '7 days') AS activos_7d,
                   (SELECT count(*) FROM proyectos WHERE archivado IS NULL) AS proyectos,
                   (SELECT count(*) FROM documentos) AS documentos,
                   (SELECT coalesce(sum(tamano), 0) FROM archivos) AS bytes_archivos,
                   pg_database_size(current_database()) AS bytes_base""")
    return dict(fila) | {"registro_abierto": config.REGISTRO_ABIERTO, "correo": config.CORREO_ACTIVO}


@router.get("/usuarios")
async def usuarios(_usuario=Depends(usuario_admin)):
    async with db.pool.acquire() as con:
        filas = await con.fetch("""
            SELECT u.id, u.nombre, u.email, u.es_admin, u.creado, u.ultimo_acceso,
                   (SELECT count(*) FROM proyectos p WHERE p.dueno_id = u.id AND p.archivado IS NULL) AS proyectos
            FROM usuarios u ORDER BY u.creado DESC LIMIT 500""")
    return [_fila(r) for r in filas]
