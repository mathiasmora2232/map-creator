"""Servidor MCP de Map Creator (Model Context Protocol): Claude Code, Claude Desktop, Cursor o cualquier cliente MCP manejan la plataforma
con un token de acceso personal (Cuenta → Tokens de acceso). Transporte HTTP «streamable» en /mcp, sin estado.

    claude mcp add --transport http map-creator https://<servidor>/mcp --header "Authorization: Bearer mc_…"

Las herramientas trabajan sobre los datos del servidor con los mismos permisos que la web (dueño, editor, lector). Lo que necesita el
motor 3D del navegador (calcular el terreno, exportar GLB/Unity/Godot) se deja pedido y lo hace el editor al abrir el mapa.
"""
import json
from typing import Any, Literal

from fastapi import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations

from . import config, db, plataforma
from .rutas import biblioteca as BIB
from .seguridad import exigir_rol, parsear_uuid, usuario_de_token

INSTRUCCIONES = """Map Creator es un editor de mapas 3D para juegos (exporta a Unity y Godot) y planos. Un proyecto tiene un mapa
principal (`mapa_inicial`). Coordenadas en metros: X hacia el este, Z hacia el sur, Y es la altura; el giro es en grados alrededor de Y.

Flujo típico: listar_proyectos o crear_proyecto → ver_proyecto (límites y objetos) → buscar_catalogo → colocar_objetos / crear_paredes
→ guardar_version antes de cambios grandes. El terreno procedural (generar_terreno) y las exportaciones 3D los calcula el editor del
navegador: quedan pedidos y se hacen al abrir el mapa (enlace `editor` de ver_proyecto). La biblioteca tiene mapas (plantillas) y modelos
GLB que se pueden añadir a un proyecto y colocar con tipo `modelo:<id>`."""


class Verificador:
    async def verify_token(self, token: str) -> AccessToken | None:
        if not token.startswith("mc_"):
            return None
        u = await usuario_de_token(token)
        return AccessToken(token=token, client_id="map-creator", scopes=[], subject=str(u["id"])) if u else None


url_base = (config.URL_PUBLICA or "http://localhost:8000").rstrip("/")
mcp = MCPServer("Map Creator", title="Map Creator", instructions=INSTRUCCIONES, website_url=url_base, version="1.0",
                token_verifier=Verificador(),
                auth=AuthSettings(issuer_url=url_base, resource_server_url=url_base + "/mcp", required_scopes=[], validate_token_resource=False))

LEER = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)
CREAR = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)
CAMBIAR = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)


async def _usuario():
    t = get_access_token()
    uid = parsear_uuid(t.subject) if t else None
    async with db.pool.acquire() as con:
        u = await con.fetchrow("SELECT id, email, nombre, es_admin, email_verificado, dos_pasos FROM usuarios WHERE id = $1", uid) if uid else None
    if not u:
        raise ValueError("Token no válido o revocado.")
    return u


def _msg(e: HTTPException) -> str:
    d = e.detail
    return d.get("error") if isinstance(d, dict) else str(d)


async def _proy(proyecto: str, escritura: bool = False):
    u = await _usuario()
    try:
        rol = await exigir_rol(proyecto, u, escritura=escritura)
    except HTTPException as e:
        raise ValueError(_msg(e))
    pid = parsear_uuid(proyecto)
    async with db.pool.acquire() as con:
        p = await plataforma.proyecto(con, pid)
    return u, pid, p, rol


def _editor(p) -> str:
    return "%s/editor/?p=%s&m=%s" % (url_base, p["id"], p["mapa_inicial"])


async def _llamar(f, *a, **k):
    try:
        return await f(*a, **k)
    except HTTPException as e:
        raise ValueError(_msg(e))


def _sin_internos(d):
    return {k: v for k, v in d.items() if not k.startswith("_")} if isinstance(d, dict) else d


# ───────────── cuenta y proyectos ─────────────

@mcp.tool(description="Quién eres en Map Creator (nombre, correo, si eres administrador).", annotations=LEER)
async def quien_soy() -> dict:
    u = await _usuario()
    return {"id": str(u["id"]), "nombre": u["nombre"], "email": u["email"], "admin": u["es_admin"], "servidor": url_base}


@mcp.tool(description="Tus proyectos y los compartidos contigo (id, nombre, rol, mapa, última edición). papelera=true lista los borrados.", annotations=LEER)
async def listar_proyectos(papelera: bool = False) -> dict:
    from .rutas import proyectos as P
    u = await _usuario()
    lista = await P.listar(papelera=papelera, usuario=u)
    return {"proyectos": [{"id": p["id"], "nombre": p["nombre"], "rol": p["rol"], "mapa": p["mapa_inicial"], "plantilla": p["plantilla"],
                           "actualizado": p["actualizado"], "editor": "%s/editor/?p=%s&m=%s" % (url_base, p["id"], p["mapa_inicial"])} for p in lista]}


@mcp.tool(description="Crea un proyecto. plantilla: 'vacio' (en blanco, con ancho/largo en metros), una plantilla del sistema (complejo, "
                      "parqueadero, casa, oficina…) o el id de un mapa de la biblioteca (buscar_biblioteca). relieve (solo en blanco): "
                      "'llanura'|'colinas'|'montanas'|'valle'|'isla'|'dunas' — el centro queda plano para construir y el relieve lo rodea; "
                      "se genera al abrir el mapa.", annotations=CREAR)
async def crear_proyecto(nombre: str, plantilla: str = "vacio", ancho: float = 120, largo: float = 80,
                         terreno: Literal["cesped", "tierra", "concreto", "asfalto"] = "cesped", relieve: str | None = None,
                         rio: bool = False, vegetacion: float = 3, humedad: float = 0, nieve: float = 0, semilla: int = 0) -> dict:
    from .rutas import proyectos as P
    u = await _usuario()
    gen = {"estilo": relieve, "rio": rio, "densidad": vegetacion, "humedad": humedad, "nieve": nieve, "semilla": semilla} if relieve else None
    try:
        p = await P.crear(P.NuevoProyecto(nombre=nombre, plantilla=plantilla, ancho=ancho, largo=largo, terreno=terreno, generar=gen), u)
    except HTTPException as e:
        raise ValueError(_msg(e))
    return {"id": p["id"], "nombre": p["nombre"], "mapa": p["mapa_inicial"], "editor": "%s/editor/?p=%s&m=%s" % (url_base, p["id"], p["mapa_inicial"]),
            "relieve": "se generará al abrir el editor" if gen else None}


@mcp.tool(description="Detalle de un proyecto: mapa, límites del suelo base (si es un mapa en blanco), cuántos objetos hay por tipo, "
                      "modelos importados, terreno, versiones y el enlace al editor.", annotations=LEER)
async def ver_proyecto(proyecto: str) -> dict:
    u, pid, p, rol = await _proy(proyecto)
    mapa = p["mapa_inicial"]
    async with db.pool.acquire() as con:
        mapas = await plataforma.leer_col(con, pid, "mapas")
        terr = await plataforma.leer_col(con, pid, "terreno")
    objs = await plataforma.objetos(pid, mapa, limite=100000)
    por_tipo: dict[str, int] = {}
    for o in objs["objetos"]:
        por_tipo[o["tipo"]] = por_tipo.get(o["tipo"], 0) + 1
    m = mapas.get(mapa) or {}
    hm = terr.get("hm-" + mapa)
    return {"id": str(pid), "nombre": p["nombre"], "descripcion": p["descripcion"], "tu_rol": rol, "mapa": mapa, "plantilla": p["plantilla"],
            "suelo_base_m": {"ancho": m.get("ancho"), "fondo": m.get("largo"), "centro": [0, 0]} if m else None,
            "relieve": m.get("generar"), "relieve_generado": bool(m.get("generado")),
            "terreno": {"x0": hm.get("x0"), "z0": hm.get("z0"), "paso_m": hm.get("paso"), "celdas": [hm.get("nx"), hm.get("nz")], "agua": hm.get("agua")} if hm else None,
            "terreno_pendiente": bool(terr.get("gen-" + mapa)),
            "objetos": {"total": objs["total"], "por_tipo": por_tipo}, "modelos_importados": await plataforma.tipos_validos(pid),
            "versiones": (await plataforma.versiones(pid, mapa))[:10], "editor": _editor(p)}


@mcp.tool(description="Cambia el nombre o la descripción de un proyecto (dueño o editor).", annotations=CAMBIAR)
async def renombrar_proyecto(proyecto: str, nombre: str | None = None, descripcion: str | None = None) -> dict:
    from .rutas import proyectos as P
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    r = await _llamar(P.cambiar, str(pid), P.CambioProyecto(nombre=nombre, descripcion=descripcion), u)
    return {"id": str(pid), "nombre": r["nombre"], "descripcion": r["descripcion"]}


@mcp.tool(description="Hace una copia completa de un proyecto (objetos, terreno y archivos) y devuelve la nueva.", annotations=CREAR)
async def duplicar_proyecto(proyecto: str) -> dict:
    from .rutas import proyectos as P
    u, pid, p, rol = await _proy(proyecto)
    r = await _llamar(P.duplicar, str(pid), u)
    return {"id": r["id"], "nombre": r["nombre"], "editor": "%s/editor/?p=%s&m=%s" % (url_base, r["id"], r["mapa_inicial"])}


@mcp.tool(description="Manda un proyecto tuyo a la papelera (se puede restaurar desde la web).", annotations=CAMBIAR)
async def mover_a_papelera(proyecto: str) -> dict:
    from .rutas import proyectos as P
    u, pid, p, rol = await _proy(proyecto)
    await _llamar(P.borrar, str(pid), False, u)
    return {"papelera": True, "id": str(pid)}


# ───────────── objetos del mapa ─────────────

@mcp.tool(description="Busca en el catálogo de objetos (muebles, vehículos, señalización, vegetación, estructuras…). Devuelve id, nombre, "
                      "categoría y tamaño en metros. Sin texto, lista por categoría.", annotations=LEER)
async def buscar_catalogo(texto: str = "", categoria: str = "", limite: int = 30) -> dict:
    await _usuario()
    cat = plataforma.catalogo()
    return {"categorias": cat.get("categorias", {}), "objetos": plataforma.buscar_catalogo(texto, categoria, limite)}


@mcp.tool(description="Lista los objetos añadidos al mapa (no las piezas del mapa base): id, tipo, nombre, posición, giro y tamaño. "
                      "Filtra por tipo (prefijo) o por cercanía (x, z, radio).", annotations=LEER)
async def listar_objetos(proyecto: str, tipo: str = "", x: float | None = None, z: float | None = None, radio: float = 0, limite: int = 200) -> dict:
    u, pid, p, rol = await _proy(proyecto)
    return await plataforma.objetos(pid, p["mapa_inicial"], tipo, [x, z] if x is not None and z is not None else None, radio, limite)


@mcp.tool(description="Coloca objetos (máx. 500). Cada uno: tipo (id del catálogo o 'modelo:<id>' de un modelo del proyecto), x, z, "
                      "y opcional (altura), giro (grados), escala (1 = normal), nombre y datos (campos propios del tipo, p. ej. color).", annotations=CREAR)
async def colocar_objetos(proyecto: str, objetos: list[dict[str, Any]]) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    return await _llamar(plataforma.colocar, pid, p["mapa_inicial"], objetos, u)


@mcp.tool(description="Crea paredes rectas de (x1, z1) a (x2, z2). Opcional por pared: alto (m, 2.6), grosor (m, 0.15), y (base), color (#rrggbb). "
                      "Para una habitación cerrada, encadena las esquinas.", annotations=CREAR)
async def crear_paredes(proyecto: str, paredes: list[dict[str, Any]]) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    return await _llamar(plataforma.paredes, pid, p["mapa_inicial"], paredes, u)


@mcp.tool(description="Mueve, gira, escala, renombra o cambia datos de objetos añadidos. Cada cambio: id y lo que cambia "
                      "(x, y, z, giro, escala multiplicativa, nombre, datos).", annotations=CAMBIAR)
async def editar_objetos(proyecto: str, cambios: list[dict[str, Any]]) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    return await _llamar(plataforma.editar, pid, cambios, u)


@mcp.tool(description="Borra objetos añadidos por id (no toca el mapa base). Se puede volver atrás restaurando una versión.", annotations=CAMBIAR)
async def borrar_objetos(proyecto: str, ids: list[str]) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    return await _llamar(plataforma.borrar, pid, ids, u)


@mcp.tool(description="Pide terreno procedural alrededor del mapa: estilo 'llanura'|'colinas'|'montanas'|'valle'|'isla'|'dunas' y opcionales "
                      "semilla, margen (m), altura (m), escala (m), rugosidad (0-1), erosion (0-1), nivelAgua (m, negativo), humedad (-1 a 1), "
                      "nieve (m), densidad (plantas/100 m²), rio, anchoRio, transicion. Lo calcula el editor (motor de Rust) al abrir el mapa.", annotations=CAMBIAR)
async def generar_terreno(proyecto: str, estilo: str, semilla: int | None = None, margen: float | None = None, altura: float | None = None,
                          escala: float | None = None, rugosidad: float | None = None, erosion: float | None = None, nivelAgua: float | None = None,
                          humedad: float | None = None, nieve: float | None = None, densidad: float | None = None, rio: bool | None = None,
                          anchoRio: float | None = None, transicion: float | None = None) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    params = dict(estilo=estilo, semilla=semilla, margen=margen, altura=altura, escala=escala, rugosidad=rugosidad, erosion=erosion,
                  nivelAgua=nivelAgua, humedad=humedad, nieve=nieve, densidad=densidad, rio=rio, anchoRio=anchoRio, transicion=transicion)
    r = await _llamar(plataforma.pedir_terreno, pid, p["mapa_inicial"], params, u)
    r["editor"] = _editor(p)
    return r


# ───────────── versiones ─────────────

@mcp.tool(description="Guarda una versión del mapa (objetos, terreno, grupos, zonas…) para poder volver a ella.", annotations=CREAR)
async def guardar_version(proyecto: str, nombre: str) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    return await plataforma.guardar_version(pid, p["mapa_inicial"], nombre, u)


@mcp.tool(description="Versiones guardadas del mapa (las más nuevas primero).", annotations=LEER)
async def listar_versiones(proyecto: str) -> dict:
    u, pid, p, rol = await _proy(proyecto)
    return {"versiones": await plataforma.versiones(pid, p["mapa_inicial"])}


@mcp.tool(description="Vuelve el mapa a una versión guardada (objetos y colecciones del mapa). Guarda antes una versión automática de lo actual.", annotations=CAMBIAR)
async def restaurar_version(proyecto: str, version: str) -> dict:
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    await plataforma.guardar_version(pid, p["mapa_inicial"], "Antes de restaurar (MCP)", u, auto=True)
    return await _llamar(plataforma.restaurar_version, pid, p["mapa_inicial"], version, u)


# ───────────── exportar / importar ─────────────

@mcp.tool(description="Exporta un proyecto entero (documentos y archivos) en JSON «map-creator-proyecto», para copia de seguridad o para importarlo "
                      "en otro servidor. Si pasa de ~1 MB devuelve solo el resumen y la URL de descarga (GET con el mismo token). "
                      "Las exportaciones 3D (GLB, Unity, Godot) se hacen desde el menú Exportar del editor.", annotations=LEER)
async def exportar_proyecto(proyecto: str, incluir_archivos: bool = False) -> dict:
    u, pid, p, rol = await _proy(proyecto)
    d = await plataforma.exportar(pid, incluir_archivos)
    url = "%s/api/proyectos/%s/exportar%s" % (url_base, pid, "?archivos=1" if incluir_archivos else "")
    crudo = json.dumps(d, ensure_ascii=False)
    resumen = {"documentos": len(d["documentos"]), "archivos": len(d["archivos"]), "bytes": len(crudo), "url_descarga": url}
    return dict(resumen, exportacion=d) if len(crudo) <= 1_000_000 else resumen


@mcp.tool(description="Crea un proyecto nuevo a partir de una exportación «map-creator-proyecto» (el JSON en texto).", annotations=CREAR)
async def importar_proyecto(exportacion_json: str, nombre: str | None = None) -> dict:
    u = await _usuario()
    try:
        datos = json.loads(exportacion_json)
    except ValueError:
        raise ValueError("exportacion_json no es JSON válido.")
    r = await _llamar(plataforma.importar, datos, u, nombre)
    r["editor"] = "%s/editor/?p=%s&m=%s" % (url_base, r["proyecto"], r["mapa"])
    return r


# ───────────── biblioteca ─────────────

@mcp.tool(description="Busca en la biblioteca: tipo 'assets' (modelos GLB publicados por todos y los tuyos) o 'mapas' (plantillas para crear proyectos).", annotations=LEER)
async def buscar_biblioteca(tipo: Literal["assets", "mapas"] = "assets", texto: str = "", categoria: str = "", solo_mios: bool = False, limite: int = 30) -> dict:
    u = await _usuario()
    if tipo == "mapas":
        from .rutas import plantillas as PL
        ws = [plataforma._sin_tilde(w) for w in texto.split()]
        lista = [p for p in await PL.lista(u) if all(w in plataforma._sin_tilde(p.get("nombre", "") + " " + p.get("descripcion", "")) for w in ws)]
        return {"mapas": [{"id": p["id"], "nombre": p["nombre"], "descripcion": p.get("descripcion"), "origen": p.get("origen"), "mia": p.get("mia", False),
                           "usos": p.get("usos")} for p in lista][:limite], "uso": "crear_proyecto(nombre, plantilla=<id>)"}
    assets = await BIB.buscar(u, texto, categoria, solo_mios, limite)
    for a in assets:
        a.pop("mini", None)
        a["url"] = url_base + a["url"]
    return {"assets": assets, "uso": "anadir_asset_a_proyecto(asset, proyecto) y luego colocar_objetos con tipo 'modelo:<id>'"}


@mcp.tool(description="Sube un modelo .glb a la biblioteca (privado salvo publicar=true). Pasa url (descarga pública https) o glb_base64.", annotations=CREAR)
async def subir_asset(nombre: str, url: str | None = None, glb_base64: str | None = None, descripcion: str = "", categoria: str = "general",
                      etiquetas: list[str] | None = None, publicar: bool = False) -> dict:
    import base64
    u = await _usuario()
    if glb_base64:
        try:
            bruto = base64.b64decode(glb_base64)
        except ValueError:
            raise ValueError("glb_base64 no es base64 válido.")
    elif url:
        if not url.startswith("https://"):
            raise ValueError("La url tiene que ser https.")
        import urllib.request
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "MapCreator"}), timeout=30) as r:
                bruto = r.read(BIB.MAX_GLB + 1)
        except Exception as e:
            raise ValueError("No se pudo descargar: %s" % e)
    else:
        raise ValueError("Pasa url o glb_base64.")
    a = await _llamar(BIB.crear, u, bruto, nombre, descripcion, categoria, etiquetas, "publica" if publicar else "privada")
    return _sin_internos(dict(a, url=url_base + a["url"], mini=None))


@mcp.tool(description="Añade un asset de la biblioteca a un proyecto. Devuelve el tipo 'modelo:<id>' para colocarlo con colocar_objetos.", annotations=CREAR)
async def anadir_asset_a_proyecto(asset: str, proyecto: str) -> dict:
    u = await _usuario()
    return await _llamar(BIB.a_proyecto, asset, proyecto, u)


@mcp.tool(description="Publica (o vuelve privado) un asset tuyo de la biblioteca, o cambia su nombre, descripción, categoría o etiquetas.", annotations=CAMBIAR)
async def editar_asset(asset: str, publicar: bool | None = None, nombre: str | None = None, descripcion: str | None = None,
                       categoria: str | None = None, etiquetas: list[str] | None = None) -> dict:
    u = await _usuario()
    cambios = {"nombre": nombre, "descripcion": descripcion, "categoria": categoria, "etiquetas": etiquetas,
               "visibilidad": None if publicar is None else ("publica" if publicar else "privada")}
    a = await _llamar(BIB.cambiar, asset, u, cambios)
    return _sin_internos(dict(a, url=url_base + a["url"], mini=None))


@mcp.tool(description="Publica en la biblioteca un modelo importado en un proyecto (su id de modelos_importados en ver_proyecto, sin 'modelo:').", annotations=CREAR)
async def publicar_asset_de_proyecto(proyecto: str, asset: str, nombre: str | None = None, descripcion: str = "", categoria: str = "general", publicar: bool = True) -> dict:
    u = await _usuario()
    a = await _llamar(BIB.desde_proyecto, proyecto, asset.removeprefix("modelo:"), u, "publica" if publicar else "privada", nombre, descripcion, categoria)
    return _sin_internos(dict(a, url=url_base + a["url"], mini=None))


@mcp.tool(description="Publica el mapa de un proyecto en la biblioteca de mapas (como plantilla para que otros creen proyectos desde él). "
                      "visibilidad 'publica' (todo el servidor) o 'privada' (solo tú).", annotations=CREAR)
async def publicar_mapa(proyecto: str, nombre: str, descripcion: str = "", visibilidad: Literal["publica", "privada"] = "publica") -> dict:
    from .rutas import plantillas as PL
    u, pid, p, rol = await _proy(proyecto, escritura=True)
    r = await _llamar(PL.publicar, str(pid), PL.Publicar(nombre=nombre, descripcion=descripcion, visibilidad=visibilidad), u)
    return {"id": r.get("id"), "nombre": nombre, "objetos": r.get("n_documentos"), "visibilidad": visibilidad,
            "uso": "crear_proyecto(nombre, plantilla=<id>)"}


app = mcp.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True,
                              transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))
