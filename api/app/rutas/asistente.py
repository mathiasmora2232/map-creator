"""Asistente del editor: Claude con herramientas que se ejecutan en el editor del usuario (generar terreno, colocar objetos…).

El bucle lo lleva el navegador (`editor/src/nucleo/asistente.ts`): manda la conversación, este endpoint llama a la API de Claude con
el prompt del sistema y las herramientas, y devuelve la respuesta tal cual. Si Claude pide herramientas, el editor las ejecuta y vuelve
a llamar con los resultados. Así la API key se queda en el servidor y el estado del mapa en el editor.

- Desactivado sin ANTHROPIC_API_KEY (config.ASISTENTE_ACTIVO).
- Solo para quien puede editar el proyecto. Límite de llamadas por usuario y hora (en memoria).
- La conversación se reenvía sin tocar (incluidos los bloques de razonamiento), como pide la API.
"""
import asyncio
import json
import re
import time
from collections import defaultdict, deque

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from .. import config, modelos
from ..mcp_servidor import INSTRUCCIONES_MODELO
from ..seguridad import exigir_rol, usuario_actual

router = APIRouter(prefix="/api/proyectos", tags=["asistente"])

MAX_CUERPO = 4 * 1024 * 1024      # la conversación entera (con resultados de herramientas)
MAX_MENSAJES = 400

SISTEMA = """Eres el asistente de Map Creator, un editor de mapas 3D en el navegador para juegos (se exportan a Unity y Godot) y para \
planos. Trabajas dentro del editor del usuario a través de las herramientas: puedes mirar el mapa, generar terreno procedural, colocar \
objetos del catálogo, pintar vegetación, guardar versiones y deshacer.

El mapa usa metros: X crece hacia el este, Z hacia el sur e Y es la altura. Lo construido del mapa (su suelo base y sus piezas) está \
protegido: el terreno generado lo rodea sin tocarlo. Usa estado_mapa para conocer los límites antes de colocar cosas, y buscar_catalogo \
para encontrar el identificador de un objeto antes de colocarlo. Si el catálogo no tiene lo que piden, diséñalo con crear_modelo y \
colócalo con el tipo que devuelve.

Antes de un cambio grande (generar terreno, colocar muchos objetos, borrar) guarda una versión con un nombre que diga qué vas a hacer, \
para que el usuario pueda volver atrás. Si una petición es ambigua y el cambio es grande, pregunta antes. Cuando termines, cuenta en \
pocas frases qué hiciste y cómo deshacerlo. Escribe todo en el idioma del usuario (normalmente español), también los comentarios breves entre herramientas."""

N = {"type": "number"}
HERRAMIENTAS = [
    {"name": "estado_mapa", "description": "Resumen del mapa abierto: nombre, límites del suelo base, cuántos objetos hay por tipo, el terreno (área, agua, zonas) y la selección.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "buscar_catalogo", "description": "Busca objetos del catálogo por texto (p. ej. «banca», «árbol», «farola», «coche»). Devuelve hasta 20 con su id, nombre, categoría y tamaño en metros.",
     "input_schema": {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"], "additionalProperties": False}},
    {"name": "generar_terreno", "description": "Genera el terreno procedural alrededor del mapa: relieve, erosión, zonas (agua, arena, césped, bosque, tierra, roca, nieve) y vegetación. Sustituye el terreno y la vegetación generados antes; guarda solo una versión automática antes.",
     "input_schema": {"type": "object", "properties": {
         "estilo": {"type": "string", "enum": ["llanura", "colinas", "montanas", "valle", "isla", "dunas"]},
         "semilla": {"type": "integer", "description": "0 = al azar; la misma semilla repite el mismo terreno"},
         "margen": {**N, "description": "metros de terreno alrededor del mapa (20–1000, normal 120)"},
         "altura": {**N, "description": "amplitud del relieve en metros"},
         "escala": {**N, "description": "tamaño típico de las formas en metros"},
         "rugosidad": {**N, "description": "0 suave – 1 accidentado"},
         "erosion": {**N, "description": "0–1"},
         "nivelAgua": {**N, "description": "altura del agua en metros, negativa (el mapa está en 0)"},
         "humedad": {**N, "description": "-1 desierto – 1 muy húmedo (más bosque)"},
         "nieve": {**N, "description": "altura desde la que hay nieve; 0 sin nieve"},
         "densidad": {**N, "description": "plantas por 100 m² en el bosque; 0 sin vegetación"},
         "rio": {"type": "boolean"},
         "anchoRio": N,
         "transicion": {**N, "description": "metros de transición suave entre el mapa y el relieve"}},
         "required": ["estilo"], "additionalProperties": False}},
    {"name": "colocar_objetos", "description": "Coloca objetos del catálogo (máximo 200 por llamada). La altura se ajusta al terreno si no se da y.",
     "input_schema": {"type": "object", "properties": {"objetos": {"type": "array", "items": {"type": "object", "properties": {
         "tipo": {"type": "string", "description": "id del catálogo (de buscar_catalogo)"}, "x": N, "z": N, "y": N,
         "giro": {**N, "description": "grados alrededor de Y"}, "escala": {**N, "description": "multiplica el tamaño (1 = normal)"},
         "nombre": {"type": "string"}},
         "required": ["tipo", "x", "z"], "additionalProperties": False}}},
         "required": ["objetos"], "additionalProperties": False}},
    {"name": "pintar_vegetacion", "description": "Pinta vegetación en un círculo (un objeto «vegetación» con todas las plantas).",
     "input_schema": {"type": "object", "properties": {"x": N, "z": N, "radio": N,
         "tipo": {"type": "string", "enum": ["arbol", "arbusto", "palmera", "mezcla"]}, "densidad": {**N, "description": "plantas por 100 m²"}},
         "required": ["x", "z", "radio"], "additionalProperties": False}},
    {"name": "borrar_objetos", "description": "Borra objetos añadidos al mapa (ids «n…» que devuelven colocar_objetos o estado_mapa). No borra piezas del mapa base.",
     "input_schema": {"type": "object", "properties": {"ids": {"type": "array", "items": {"type": "string"}}}, "required": ["ids"], "additionalProperties": False}},
    {"name": "guardar_version", "description": "Guarda una versión del mapa (objetos y terreno) a la que el usuario puede volver desde Historial → Versiones.",
     "input_schema": {"type": "object", "properties": {"nombre": {"type": "string"}}, "required": ["nombre"], "additionalProperties": False}},
    {"name": "crear_modelo", "description": "Diseña un objeto que no está en el catálogo con piezas simples: lo guarda en la biblioteca del usuario "
     "(privado), lo añade al proyecto y devuelve el tipo para colocar_objetos. " + INSTRUCCIONES_MODELO.replace("con proyecto, lo añade", "aquí siempre lo añade"),
     "input_schema": {"type": "object", "properties": {
         "nombre": {"type": "string"}, "descripcion": {"type": "string"}, "categoria": {"type": "string"},
         "piezas": {"type": "array", "items": {"type": "object", "properties": {
             "forma": {"type": "string", "enum": ["caja", "cilindro", "cono", "esfera", "cupula", "prisma"]},
             "centro": {"type": "array", "items": N}, "tamano": {"type": "array", "items": N}, "giro": {"type": "array", "items": N},
             "color": {"type": "string"}, "rugosidad": N, "metal": N, "opacidad": N, "brillo": {"type": "boolean"}, "arriba": N},
             "required": ["forma", "centro", "tamano"]}}},
         "required": ["nombre", "piezas"], "additionalProperties": False}},
    {"name": "deshacer", "description": "Deshace el último paso del editor (Ctrl+Z). Para el terreno, deshace la última generación o trazo.",
     "input_schema": {"type": "object", "properties": {"que": {"type": "string", "enum": ["objetos", "terreno"]}}, "required": ["que"], "additionalProperties": False}},
]

_cliente: anthropic.AsyncAnthropic | None = None
_llamadas: dict[str, deque] = defaultdict(deque)


def cliente() -> anthropic.AsyncAnthropic:
    global _cliente
    if _cliente is None:
        _cliente = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY, timeout=300.0, max_retries=2)
    return _cliente


def _limitar(uid: str):
    ahora, cola = time.monotonic(), _llamadas[uid]
    while cola and ahora - cola[0] > 3600:
        cola.popleft()
    if len(cola) >= config.ASISTENTE_LIMITE_HORA:
        espera = int(3600 - (ahora - cola[0])) + 1
        raise HTTPException(429, {"error": f"Llegaste al límite del asistente ({config.ASISTENTE_LIMITE_HORA} llamadas por hora). Prueba en {espera // 60 + 1} min.",
                                  "code": "resource_exhausted"})
    cola.append(ahora)


def _validar(mensajes) -> list:
    if not isinstance(mensajes, list) or not mensajes or len(mensajes) > MAX_MENSAJES:
        raise HTTPException(400, {"error": "Conversación vacía o demasiado larga: empieza una nueva.", "code": "invalid_argument"})
    for m in mensajes:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant") or "content" not in m:
            raise HTTPException(400, {"error": "Mensaje con formato no válido.", "code": "invalid_argument"})
    if mensajes[0]["role"] != "user":
        raise HTTPException(400, {"error": "La conversación tiene que empezar con un mensaje del usuario.", "code": "invalid_argument"})
    return mensajes


@router.post("/{pid}/asistente")
async def asistente(pid: str, request: Request, usuario=Depends(usuario_actual)):
    if not config.ASISTENTE_ACTIVO:
        raise HTTPException(503, {"error": "El asistente no está configurado en este servidor (falta ANTHROPIC_API_KEY).", "code": "unavailable"})
    await exigir_rol(pid, usuario, escritura=True)
    cuerpo = await _cuerpo(request)
    mensajes = _validar(cuerpo.get("mensajes"))
    _limitar(str(usuario["id"]))
    return await _llamar_claude(SISTEMA, HERRAMIENTAS, mensajes)


async def _cuerpo(request: Request) -> dict:
    crudo = await request.body()
    if len(crudo) > MAX_CUERPO:
        raise HTTPException(413, {"error": "La conversación es demasiado grande: empieza una nueva.", "code": "resource_exhausted"})
    try:
        return json.loads(crudo)
    except ValueError:
        raise HTTPException(400, {"error": "JSON no válido.", "code": "invalid_argument"})


async def _llamar_claude(sistema: str, herramientas: list, mensajes: list) -> dict:
    try:
        r = await cliente().beta.messages.create(
            model=config.ASISTENTE_MODELO,
            max_tokens=16000,
            system=sistema,
            tools=herramientas,
            messages=mensajes,
            output_config={"effort": config.ASISTENTE_ESFUERZO},
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise HTTPException(503, {"error": "La API key del asistente no es válida. Revísala en la bóveda del panel.", "code": "unavailable"})
    except anthropic.PermissionDeniedError:
        raise HTTPException(503, {"error": "La API key del asistente no tiene permiso para este modelo.", "code": "unavailable"})
    except anthropic.RateLimitError:
        raise HTTPException(429, {"error": "La API de Claude está saturada o se acabó el saldo. Prueba en un momento.", "code": "resource_exhausted"})
    except anthropic.BadRequestError as e:
        raise HTTPException(400, {"error": "La API de Claude rechazó la petición: " + str(e.message)[:300], "code": "invalid_argument"})
    except anthropic.APIStatusError as e:
        raise HTTPException(502, {"error": f"Error de la API de Claude ({e.status_code}). Prueba otra vez.", "code": "unavailable"})
    except anthropic.APIConnectionError:
        raise HTTPException(502, {"error": "No se pudo conectar con la API de Claude.", "code": "unavailable"})
    d = r.model_dump(mode="json", exclude_none=True)
    return {"content": d.get("content", []), "stop_reason": d.get("stop_reason"), "stop_details": d.get("stop_details"),
            "model": d.get("model"), "usage": d.get("usage")}


# ───────────── asistente del panel ─────────────
# Mismo bucle (lo lleva el navegador), pero las herramientas son las del servidor MCP y se ejecutan aquí, con la sesión del usuario:
# crear proyectos y mapas con relieve, colocar objetos y paredes, versiones, biblioteca, publicar y crear modelos con piezas.

panel = APIRouter(prefix="/api/asistente", tags=["asistente"])

SISTEMA_PANEL = """Eres el asistente de Map Creator, una plataforma para crear mapas 3D de juegos (se exportan a Unity y Godot) y planos. \
Estás en el panel del usuario y trabajas con las herramientas de la plataforma, con sus mismos permisos: crear y organizar proyectos \
(mapas en blanco con relieve, desde plantillas o desde la biblioteca), colocar objetos del catálogo, levantar paredes, pedir terreno \
procedural, guardar y restaurar versiones, buscar y publicar en la biblioteca, y crear modelos 3D nuevos (assets) con piezas simples.

Cómo trabajar:
- Para cosas de un mapa: identifica el proyecto (listar_proyectos; si hay varios posibles, pregunta), mira ver_proyecto (tamaño del suelo \
base, centrado en 0,0) y busca los ids en buscar_catalogo antes de colocar. Distribuye con criterio (separaciones reales, alineado a \
caminos o paredes, sin amontonar) y respeta los límites del mapa.
- Si el catálogo no tiene lo que pide, diseña el objeto con crear_modelo (pasa proyecto para añadirlo y colócalo con su tipo modelo:<id>). \
Piensa las medidas reales y compón con bastantes piezas para que se reconozca: patas, respaldos, marcos, tejados, detalles.
- Antes de cambios grandes en un mapa existente (muchos objetos, borrar, restaurar) guarda una versión. Pregunta antes de borrar o mandar \
a la papelera algo que el usuario no haya nombrado claramente.
- El terreno y las exportaciones 3D los calcula el editor del navegador: dilo y da el enlace del editor que devuelven las herramientas.
- Responde en el idioma del usuario (normalmente español), breve y claro, también en los comentarios entre herramientas. Al terminar, \
resume qué hiciste y deja los enlaces al editor en formato [texto](url). No inventes ids: salen de las herramientas."""

# Herramientas del MCP que no tienen sentido en el chat (JSON enormes o archivos en base64)
FUERA_DEL_PANEL = {"exportar_proyecto", "importar_proyecto", "subir_asset"}
MAX_RESULTADO = 60_000
_herr_panel: list | None = None


async def herramientas_panel() -> list:
    global _herr_panel
    if _herr_panel is None:
        from .. import mcp_servidor
        _herr_panel = []
        for t in await mcp_servidor.mcp.list_tools():
            if t.name in FUERA_DEL_PANEL:
                continue
            esquema = dict(t.input_schema or {"type": "object", "properties": {}})
            esquema.pop("title", None)
            _herr_panel.append({"name": t.name, "description": (t.description or "")[:4000], "input_schema": esquema})
    return _herr_panel


async def ejecutar_herramienta(uid: str, nombre: str, entrada: dict) -> tuple[str, bool]:
    from .. import mcp_servidor
    if nombre in FUERA_DEL_PANEL or nombre not in {h["name"] for h in await herramientas_panel()}:
        return "Esa herramienta no existe.", True
    marca = mcp_servidor.usuario_sesion.set(uid)
    try:
        r = await mcp_servidor.mcp.call_tool(nombre, entrada if isinstance(entrada, dict) else {})
    except Exception as e:      # ToolError (mensaje para el usuario) o UnexpectedToolError (fallo interno: el detalle va en la causa)
        causa = e if type(e).__name__ == "ToolError" else (e.__cause__ or e)
        return re.sub(r"^Error executing tool \w+: ", "", str(causa))[:2000] or "La herramienta falló.", True
    finally:
        mcp_servidor.usuario_sesion.reset(marca)
    if getattr(r, "structured_content", None) is not None:
        texto = json.dumps(r.structured_content, ensure_ascii=False, default=str)
    else:
        texto = "\n".join(getattr(c, "text", "") for c in (getattr(r, "content", None) or []))
    if len(texto) > MAX_RESULTADO:
        texto = texto[:MAX_RESULTADO] + "… (recortado)"
    return texto, bool(getattr(r, "is_error", False))


@panel.post("")
async def asistente_panel(request: Request, usuario=Depends(usuario_actual)):
    """Una vuelta: llama a Claude y, si pide herramientas, las ejecuta. Devuelve la respuesta y los resultados (el navegador los añade
    a la conversación y vuelve a llamar mientras stop_reason sea tool_use)."""
    if not config.ASISTENTE_ACTIVO:
        raise HTTPException(503, {"error": "El asistente no está configurado en este servidor (falta ANTHROPIC_API_KEY).", "code": "unavailable"})
    cuerpo = await _cuerpo(request)
    mensajes = _validar(cuerpo.get("mensajes"))
    uid = str(usuario["id"])
    _limitar(uid)
    sistema = SISTEMA_PANEL + "\n\nUsuario: %s. Hoy es %s." % (usuario["nombre"] or "sin nombre", time.strftime("%Y-%m-%d"))
    r = await _llamar_claude(sistema, await herramientas_panel(), mensajes)
    resultados, acciones = [], []
    if r.get("stop_reason") == "tool_use":
        for b in r.get("content") or []:
            if b.get("type") != "tool_use":
                continue
            texto, error = await ejecutar_herramienta(uid, b.get("name", ""), b.get("input") or {})
            resultados.append({"type": "tool_result", "tool_use_id": b.get("id"), "content": texto, **({"is_error": True} if error else {})})
            acciones.append({"herramienta": b.get("name"), "ok": not error, "detalle": texto[:300] if error else ""})
    return dict(r, resultados=resultados, acciones=acciones)


# ───────────── IA del creador de assets ─────────────
# Una petición = un modelo: el usuario describe un objeto nuevo o un cambio y Claude devuelve la lista completa de piezas con la
# herramienta definir_modelo (no se guarda nada: el creador la pinta y el usuario decide). Si las piezas no valen, se le devuelve el
# error una vez para que las corrija. La respuesta va con «latidos» (espacios) mientras Claude piensa: así Cloudflare no corta a los 100 s.

SISTEMA_PIEZAS = """Eres el diseñador 3D del creador de assets de Map Creator. Construyes objetos para mapas de juegos con piezas simples y \
respondes SIEMPRE llamando a la herramienta definir_modelo con el modelo completo.

""" + INSTRUCCIONES_MODELO + """

Cómo diseñar:
- Piensa primero en las medidas reales del objeto (una puerta mide 2 m, una silla 0,45 m de asiento, un coche 4,2 × 1,8 m) y en sus partes \
reconocibles. Compón con suficientes piezas para que se entienda a primera vista (entre 6 y 120), sin piezas sueltas flotando: las que \
se tocan se solapan un poco.
- La base del objeto en y = 0, centrado en X y Z, el frente mirando a +Z.
- Pon a cada pieza un nombre corto en el idioma del usuario («Pata delantera izq.», «Tejado»): se ven en la lista del editor.
- Colores con matices realistas; metal para metales, opacidad 0,35 para vidrio, brillo para luces.
- Si te dan el modelo actual y piden un cambio, devuelve el modelo ENTERO con el cambio aplicado y conserva lo demás igual (mismas piezas, \
medidas y colores). Si hay piezas seleccionadas y el cambio es ambiguo («hazlo rojo», «más grande»), aplícalo solo a esas.
- En mensaje cuenta en una o dos frases, en el idioma del usuario, qué hiciste."""

_PIEZA = next(h for h in HERRAMIENTAS if h["name"] == "crear_modelo")["input_schema"]["properties"]["piezas"]["items"]
HERRAMIENTA_PIEZAS = {
    "name": "definir_modelo",
    "description": "Entrega el modelo completo (todas las piezas) para que el creador lo pinte.",
    "input_schema": {"type": "object", "properties": {
        "nombre": {"type": "string", "description": "nombre corto del objeto"},
        "mensaje": {"type": "string", "description": "qué hiciste, en una o dos frases"},
        "piezas": {"type": "array", "items": {"type": "object", "properties": dict(_PIEZA["properties"], nombre={"type": "string"}),
                                              "required": _PIEZA["required"]}}},
        "required": ["nombre", "mensaje", "piezas"], "additionalProperties": False},
}
MAX_PIEZAS_IA = 200


async def _disenar(pedido: str, piezas: list | None, nombre: str, seleccion: list) -> dict:
    texto = "Pedido: " + pedido
    if piezas:
        texto = ("Modelo actual «%s» (%d piezas):\n%s\n\n" % (nombre or "Modelo", len(piezas), json.dumps(piezas, ensure_ascii=False, separators=(",", ":")))
                 + ("Piezas seleccionadas (índices desde 0): %s\n\n" % seleccion if seleccion else "") + texto)
    mensajes = [{"role": "user", "content": texto}]
    for intento in range(2):
        r = await _llamar_claude(SISTEMA_PIEZAS, [HERRAMIENTA_PIEZAS], mensajes)
        uso = next((b for b in r.get("content") or [] if b.get("type") == "tool_use" and b.get("name") == "definir_modelo"), None)
        if uso is None:
            charla = " ".join(b.get("text", "") for b in r.get("content") or [] if b.get("type") == "text").strip()
            return {"piezas": None, "mensaje": charla or "La IA no devolvió un modelo. Prueba a describirlo de otra forma."}
        e = uso.get("input") or {}
        try:
            ps = e.get("piezas") or []
            if len(ps) > MAX_PIEZAS_IA:
                raise modelos.ErrorModelo("Máximo %d piezas." % MAX_PIEZAS_IA)
            limpias = modelos.a_json(modelos.validar(ps))
        except modelos.ErrorModelo as err:
            if intento:
                return {"piezas": None, "mensaje": "La IA devolvió piezas no válidas (%s). Prueba otra vez." % err}
            mensajes += [{"role": "assistant", "content": r["content"]},
                         {"role": "user", "content": [{"type": "tool_result", "tool_use_id": uso.get("id"), "is_error": True,
                                                       "content": "Piezas no válidas: %s. Corrígelo y vuelve a llamar a definir_modelo." % err}]}]
            continue
        return {"piezas": limpias, "nombre": str(e.get("nombre") or nombre or "Modelo")[:80], "mensaje": str(e.get("mensaje") or "")[:600]}
    return {"piezas": None, "mensaje": "No se pudo generar el modelo."}


def _con_latidos(tarea_coro) -> StreamingResponse:
    async def flujo():
        tarea = asyncio.ensure_future(tarea_coro)
        while True:
            hecho, _ = await asyncio.wait({tarea}, timeout=10)
            if hecho:
                break
            yield b" "
        try:
            res = tarea.result()
        except HTTPException as e:
            d = e.detail if isinstance(e.detail, dict) else {"error": str(e.detail)}
            res = dict(d, status=e.status_code)
        except Exception:
            res = {"error": "Falló la generación. Prueba otra vez.", "code": "internal", "status": 500}
        yield json.dumps(res, ensure_ascii=False).encode()
    return StreamingResponse(flujo(), media_type="application/json", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@panel.post("/piezas")
async def asistente_piezas(request: Request, usuario=Depends(usuario_actual)):
    """{pedido, piezas?, nombre?, seleccion?} → {piezas, nombre, mensaje} (o {error, status} si falla a mitad)."""
    if not config.ASISTENTE_ACTIVO:
        raise HTTPException(503, {"error": "La IA no está configurada en este servidor (falta ANTHROPIC_API_KEY).", "code": "unavailable"})
    cuerpo = await _cuerpo(request)
    pedido = str(cuerpo.get("pedido") or "").strip()[:2000]
    if not pedido:
        raise HTTPException(400, {"error": "Describe qué quieres crear o cambiar.", "code": "invalid_argument"})
    piezas = cuerpo.get("piezas") or None
    if piezas is not None and (not isinstance(piezas, list) or len(piezas) > modelos.MAX_PIEZAS):
        raise HTTPException(400, {"error": "Piezas no válidas.", "code": "invalid_argument"})
    seleccion = [i for i in (cuerpo.get("seleccion") or []) if isinstance(i, int)][:200]
    _limitar(str(usuario["id"]))
    return _con_latidos(_disenar(pedido, piezas, str(cuerpo.get("nombre") or "")[:80], seleccion))
