"""Asistente del editor: Claude con herramientas que se ejecutan en el editor del usuario (generar terreno, colocar objetos…).

El bucle lo lleva el navegador (`editor/src/nucleo/asistente.ts`): manda la conversación, este endpoint llama a la API de Claude con
el prompt del sistema y las herramientas, y devuelve la respuesta tal cual. Si Claude pide herramientas, el editor las ejecuta y vuelve
a llamar con los resultados. Así la API key se queda en el servidor y el estado del mapa en el editor.

- Desactivado sin ANTHROPIC_API_KEY (config.ASISTENTE_ACTIVO).
- Solo para quien puede editar el proyecto. Límite de llamadas por usuario y hora (en memoria).
- La conversación se reenvía sin tocar (incluidos los bloques de razonamiento), como pide la API.
"""
import json
import time
from collections import defaultdict, deque

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request

from .. import config
from ..seguridad import exigir_rol, usuario_actual

router = APIRouter(prefix="/api/proyectos", tags=["asistente"])

MAX_CUERPO = 4 * 1024 * 1024      # la conversación entera (con resultados de herramientas)
MAX_MENSAJES = 400

SISTEMA = """Eres el asistente de Map Creator, un editor de mapas 3D en el navegador para juegos (se exportan a Unity y Godot) y para \
planos. Trabajas dentro del editor del usuario a través de las herramientas: puedes mirar el mapa, generar terreno procedural, colocar \
objetos del catálogo, pintar vegetación, guardar versiones y deshacer.

El mapa usa metros: X crece hacia el este, Z hacia el sur e Y es la altura. Lo construido del mapa (su suelo base y sus piezas) está \
protegido: el terreno generado lo rodea sin tocarlo. Usa estado_mapa para conocer los límites antes de colocar cosas, y buscar_catalogo \
para encontrar el identificador de un objeto antes de colocarlo.

Antes de un cambio grande (generar terreno, colocar muchos objetos, borrar) guarda una versión con un nombre que diga qué vas a hacer, \
para que el usuario pueda volver atrás. Si una petición es ambigua y el cambio es grande, pregunta antes. Cuando termines, cuenta en \
pocas frases qué hiciste y cómo deshacerlo. Responde en el idioma del usuario (normalmente español)."""

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
    crudo = await request.body()
    if len(crudo) > MAX_CUERPO:
        raise HTTPException(413, {"error": "La conversación es demasiado grande: empieza una nueva.", "code": "resource_exhausted"})
    try:
        cuerpo = json.loads(crudo)
    except ValueError:
        raise HTTPException(400, {"error": "JSON no válido.", "code": "invalid_argument"})
    mensajes = _validar(cuerpo.get("mensajes"))
    _limitar(str(usuario["id"]))
    try:
        r = await cliente().beta.messages.create(
            model=config.ASISTENTE_MODELO,
            max_tokens=16000,
            system=SISTEMA,
            tools=HERRAMIENTAS,
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
