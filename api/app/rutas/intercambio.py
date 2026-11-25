"""Exportar un proyecto entero a JSON («map-creator-proyecto») e importarlo como proyecto nuevo (también con un token de acceso)."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from .. import plataforma
from ..seguridad import exigir_rol, parsear_uuid, usuario_actual

router = APIRouter(prefix="/api/proyectos", tags=["intercambio"])
MAX_IMPORTAR = 200 * 1024 * 1024


@router.get("/{pid}/exportar")
async def exportar(pid: str, archivos: bool = False, usuario=Depends(usuario_actual)):
    await exigir_rol(pid, usuario)
    d = await plataforma.exportar(parsear_uuid(pid), archivos)
    nombre = "".join(c if c.isalnum() or c in "-_" else "_" for c in d["proyecto"]["nombre"])[:40] or "proyecto"
    return Response(json.dumps(d, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="%s.mapcreator.json"' % nombre})


@router.post("/importar", status_code=201)
async def importar(request: Request, nombre: str | None = None, usuario=Depends(usuario_actual)):
    if int(request.headers.get("content-length") or 0) > MAX_IMPORTAR:
        raise HTTPException(413, {"error": "La exportación es demasiado grande.", "code": "resource_exhausted"})
    try:
        datos = json.loads(await request.body())
    except ValueError:
        raise HTTPException(400, {"error": "JSON no válido.", "code": "invalid_argument"})
    return await plataforma.importar(datos, usuario, nombre)
