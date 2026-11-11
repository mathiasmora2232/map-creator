"""Map Creator: API + sitio (landing, cuenta, panel) + editor, todo en un proceso.

    uvicorn app.main:app --reload            (desde api/, con DATABASE_URL apuntando a Postgres)
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import config, db
from .rutas import cuenta, editor_datos, proyectos
from .seguridad import usuario_opcional

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def vida(_app):
    config.DIR_ARCHIVOS.mkdir(parents=True, exist_ok=True)
    await db.abrir()
    yield
    await db.cerrar()


app = FastAPI(title="Map Creator", version="1.0.0", lifespan=vida, docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
app.add_middleware(GZipMiddleware, minimum_size=2048)  # mapa_complejo.json: 2,3 MB → ~300 KB


@app.middleware("http")
async def mismo_origen(request: Request, siguiente):
    """Defensa CSRF además de SameSite=Lax: lo que escribe tiene que venir de esta misma web."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origen = request.headers.get("origin")
        if origen and urlparse(origen).netloc != request.headers.get("host"):
            return JSONResponse({"error": "Origen no permitido", "code": "permission_denied"}, 403)
    return await siguiente(request)


@app.exception_handler(HTTPException)
async def error_http(_request, exc: HTTPException):
    # El editor espera {error, code} en la raíz (como el servidor local), no {"detail": …}.
    cuerpo = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail), "code": "error"}
    return JSONResponse(cuerpo, exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def error_validacion(_request, exc: RequestValidationError):
    campos = ", ".join(str(e["loc"][-1]) for e in exc.errors())
    return JSONResponse({"error": "Revisa estos campos: %s." % campos, "code": "invalid_argument", "campos": exc.errors()}, 400)


app.include_router(cuenta.router)
app.include_router(proyectos.router)
app.include_router(editor_datos.router)


@app.get("/api/salud")
async def salud():
    async with db.pool.acquire() as con:
        await con.fetchval("SELECT 1")
    return {"ok": True}


# ───────────────────────── Sitio ─────────────────────────
PAGINAS = {"/": "index.html", "/entrar": "entrar.html", "/registro": "registro.html", "/app": "app.html"}
PRIVADAS = {"/app"}


def _pagina(nombre):
    return FileResponse(config.DIR_SITIO / nombre, headers={"Cache-Control": "no-cache"})


for _ruta, _archivo in PAGINAS.items():
    async def _servir(request: Request, _r=_ruta, _a=_archivo):
        if _r in PRIVADAS and await usuario_opcional(request) is None:
            return RedirectResponse("/entrar?siguiente=" + quote(_r), 302)
        if _r in ("/entrar", "/registro") and await usuario_opcional(request) is not None:
            return RedirectResponse("/app", 302)
        return _pagina(_a)
    app.add_api_route(_ruta, _servir, methods=["GET"], include_in_schema=False)

app.mount("/sitio", StaticFiles(directory=config.DIR_SITIO), name="sitio")


# ───────────────────────── Editor ─────────────────────────
# Solo lo que necesita el navegador. editor/local/ (servidor local, datos_usuario, herramientas del juego) no se sirve nunca.
CARPETAS_EDITOR = {"css", "js", "mapas", "img"}
EXT_EDITOR = {".js", ".css", ".json", ".png", ".svg", ".webp", ".jpg", ".woff2"}


@app.get("/editor", include_in_schema=False)
async def editor_sin_barra(request: Request):
    return RedirectResponse("/editor/" + ("?" + request.url.query if request.url.query else ""), 301)


@app.get("/editor/", include_in_schema=False)
async def editor_index(request: Request):
    if await usuario_opcional(request) is None:
        siguiente = "/editor/" + ("?" + request.url.query if request.url.query else "")
        return RedirectResponse("/entrar?siguiente=" + quote(siguiente, safe=""), 302)
    return FileResponse(config.DIR_EDITOR / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/editor/{ruta:path}", include_in_schema=False)
async def editor_estatico(ruta: str):
    partes = Path(ruta).parts
    raiz = config.DIR_EDITOR.resolve()
    archivo = (raiz / ruta).resolve()
    if (not partes or partes[0] not in CARPETAS_EDITOR or archivo.suffix.lower() not in EXT_EDITOR
            or raiz not in archivo.parents or not archivo.is_file()):
        raise HTTPException(404, {"error": "No existe", "code": "not_found"})
    return FileResponse(archivo, headers={"Cache-Control": "no-cache"})
