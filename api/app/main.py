"""Map Creator: API + sitio (landing, cuenta, panel) + editor, todo en un proceso.

    uvicorn app.main:app --reload            (desde api/, con DATABASE_URL apuntando a Postgres)
"""
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from . import config, db
from .rutas import admin, cuenta, editor_datos, invitaciones, plantillas, proyectos
from .seguridad import usuario_opcional, verificado

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
async def cabeceras_y_origen(request: Request, siguiente):
    """Un solo middleware (encadenar dos de Starlette a veces truncaba las respuestas que corta el primero):
    - defensa CSRF además de SameSite=Lax: lo que escribe tiene que venir de esta misma web;
    - los .js y .css de /sitio se revalidan siempre (con ?v= cambian de URL en cada despliegue y sin él no se quedan viejos)."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origen = request.headers.get("origin")
        if origen and urlparse(origen).netloc != request.headers.get("host"):
            return JSONResponse({"error": "Origen no permitido", "code": "permission_denied"}, 403)
    respuesta = await siguiente(request)
    if request.url.path.startswith("/sitio/"):
        respuesta.headers["Cache-Control"] = "no-cache"
    return respuesta


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
app.include_router(cuenta.publico)
app.include_router(invitaciones.router)
app.include_router(admin.router)
app.include_router(plantillas.router)
app.include_router(proyectos.router)
app.include_router(editor_datos.router)


@app.get("/api/salud")
async def salud():
    async with db.pool.acquire() as con:
        await con.fetchval("SELECT 1")
    return {"ok": True}


# ───────────────────────── Sitio ─────────────────────────
PAGINAS = {"/": "index.html", "/entrar": "entrar.html", "/registro": "registro.html", "/app": "app.html",
           "/verificar": "verificar.html", "/recuperar": "recuperar.html"}
PRIVADAS = {"/app", "/verificar"}


# Versión de los archivos del sitio: cambia con cada despliegue (fecha de modificación de sitio/ y editor/). Se añade como ?v= a los
# <script> y <link> de las páginas: así un proxy o CDN (Cloudflare guarda los .js y .css horas) nunca sirve una copia vieja.
def _version_estaticos() -> str:
    import hashlib
    h = hashlib.sha1()
    for raiz in (config.DIR_SITIO, config.DIR_EDITOR):
        for f in sorted(raiz.rglob("*")):
            if f.is_file() and f.suffix in (".js", ".css", ".html") and "local" not in f.parts:
                h.update(f.name.encode()); h.update(str(f.stat().st_mtime_ns).encode())
    return h.hexdigest()[:10]


VERSION_ESTATICOS = _version_estaticos()
_RE_RECURSO = re.compile(r'((?:src|href)=")(/sitio/[^"?#]+\.(?:js|css))(")')
_RE_EDITOR = re.compile(r'((?:src|href)=")((?:js|css)/[^"?#]+\.(?:js|css))(")')


def _html_versionado(ruta: Path, editor: bool = False) -> Response:
    html = ruta.read_text(encoding="utf-8")
    html = _RE_RECURSO.sub(lambda m: m.group(1) + m.group(2) + "?v=" + VERSION_ESTATICOS + m.group(3), html)
    if editor:
        html = _RE_EDITOR.sub(lambda m: m.group(1) + m.group(2) + "?v=" + VERSION_ESTATICOS + m.group(3), html)
    return Response(html, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-cache"})


def _pagina(nombre):
    return _html_versionado(config.DIR_SITIO / nombre)


def _siguiente_seguro(request: Request) -> str:
    """?siguiente= solo si es una ruta de esta misma web (evita redirigir a otro dominio)."""
    s = request.query_params.get("siguiente", "")
    return s if s.startswith("/") and not s.startswith("//") and "\\" not in s else "/app"


def _a_verificar(siguiente: str):
    return RedirectResponse("/verificar?siguiente=" + quote(siguiente, safe=""), 302)


for _ruta, _archivo in PAGINAS.items():
    async def _servir(request: Request, _r=_ruta, _a=_archivo):
        u = await usuario_opcional(request)
        if _r in PRIVADAS and u is None:
            return RedirectResponse("/entrar?siguiente=" + quote(_r), 302)
        if _r == "/app" and not verificado(u):
            return _a_verificar("/app")
        if _r == "/verificar" and verificado(u):
            return RedirectResponse(_siguiente_seguro(request), 302)
        if _r in ("/entrar", "/registro") and u is not None:
            return RedirectResponse(_siguiente_seguro(request) if verificado(u) else "/verificar", 302)
        return _pagina(_a)
    app.add_api_route(_ruta, _servir, methods=["GET"], include_in_schema=False)


@app.get("/invitacion/{token}", include_in_schema=False)
async def pagina_invitacion(token: str):
    # Pública: la página pide los datos a /api/invitacion/<token> y ofrece entrar, crear la cuenta o unirse.
    r = _html_versionado(config.DIR_SITIO / "invitacion.html")
    r.headers["Cache-Control"] = "no-store"; r.headers["Referrer-Policy"] = "no-referrer"
    return r

app.mount("/sitio", StaticFiles(directory=config.DIR_SITIO), name="sitio")


# ───────────────────────── Editor ─────────────────────────
# Solo lo que necesita el navegador. editor/local/ (servidor local, datos_usuario, herramientas del juego) no se sirve nunca.
CARPETAS_EDITOR = {"css", "js", "mapas", "img", "wasm"}
EXT_EDITOR = {".js", ".css", ".json", ".png", ".svg", ".webp", ".jpg", ".woff2", ".wasm"}


@app.get("/editor", include_in_schema=False)
async def editor_sin_barra(request: Request):
    return RedirectResponse("/editor/" + ("?" + request.url.query if request.url.query else ""), 301)


@app.get("/editor/", include_in_schema=False)
async def editor_index(request: Request):
    u = await usuario_opcional(request)
    siguiente = "/editor/" + ("?" + request.url.query if request.url.query else "")
    if u is None:
        return RedirectResponse("/entrar?siguiente=" + quote(siguiente, safe=""), 302)
    if not verificado(u):
        return _a_verificar(siguiente)
    return _html_versionado(config.DIR_EDITOR / "index.html", editor=True)


@app.get("/editor/{ruta:path}", include_in_schema=False)
async def editor_estatico(ruta: str):
    partes = Path(ruta).parts
    raiz = config.DIR_EDITOR.resolve()
    archivo = (raiz / ruta).resolve()
    if (not partes or partes[0] not in CARPETAS_EDITOR or archivo.suffix.lower() not in EXT_EDITOR
            or raiz not in archivo.parents or not archivo.is_file()):
        raise HTTPException(404, {"error": "No existe", "code": "not_found"})
    return FileResponse(archivo, headers={"Cache-Control": "no-cache"})
