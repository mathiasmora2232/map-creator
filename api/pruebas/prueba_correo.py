"""Prueba de los flujos con correo contra una instancia arrancada con OO_CORREO_ARCHIVO=<buzón> (los correos se escriben como JSON en
esa carpeta en vez de enviarse). Usa una base de PRUEBA, nunca la de producción:

    python api/pruebas/prueba_correo.py http://127.0.0.1:8000 /ruta/al/buzon

Cubre verificar el correo al registrarse, recuperar la contraseña, entrar en dos pasos, cambiar el correo, límites (reenvío, intentos)
e invitaciones por correo. Solo usa la biblioteca estándar. Sale con código 1 si algo falla.
"""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cliente  # noqa: E402
from cliente import Cliente, comprobar  # noqa: E402

BUZON = Path(sys.argv[2] if len(sys.argv) > 2 else "./buzon")
sufijo = "%x" % int(time.time() * 1000)


def correos(para):
    salida = []
    for f in sorted(BUZON.glob("*.json")):
        d = json.loads(f.read_text("utf-8"))
        if d["para"].lower() == para.lower():
            salida.append(d)
    return salida


def ultimo_codigo(para):
    lista = correos(para)
    if not lista:
        return None
    m = re.search(r"Código: (\d{6})", lista[-1]["texto"])
    return m.group(1) if m else None


def correo_de(nombre):
    return "%s-%s@prueba.test" % (nombre, sufijo)


st, cfg = Cliente().j("GET", "/api/config")
comprobar(cfg.get("correo") is True, "el servidor tiene el correo activo (OO_CORREO_ARCHIVO)")

# ── Registro y verificación ──
ana, ea = Cliente(), correo_de("ana")
st, u = ana.j("POST", "/api/cuenta/registro", {"nombre": "Ana", "email": ea, "clave": "clave-segura-1"})
comprobar(st == 200 and u["verificar"] is True, "registro pide verificar el correo")
cod = ultimo_codigo(ea)
comprobar(cod is not None and "Verifica tu correo" in correos(ea)[-1]["asunto"] + correos(ea)[-1]["texto"], "llega el correo con el código")
st, yo = ana.j("GET", "/api/cuenta/yo")
comprobar(st == 200 and yo["email_verificado"] is False, "«yo» funciona sin verificar y dice que falta")
st, r = ana.j("GET", "/api/proyectos")
comprobar(st == 403 and r["code"] == "email_no_verificado", "sin verificar, la API responde 403 email_no_verificado")
st, cab, d = ana.pedir("GET", "/app")
comprobar(st == 200 and b"verificar.js" in d, "/app lleva a /verificar")
st, cab, d = ana.pedir("GET", "/editor/?p=x")
comprobar(st == 200 and b"verificar.js" in d, "el editor también lleva a /verificar")
st, r = ana.j("POST", "/api/cuenta/verificar/reenviar")
comprobar(st == 429 and "Espera" in r["error"], "no se puede pedir otro código antes de 60 s")
st, r = ana.j("POST", "/api/cuenta/verificar", {"codigo": "000000" if cod != "000000" else "111111"})
comprobar(st == 400 and r["code"] == "codigo_incorrecto", "código incorrecto: 400")
st, r = ana.j("POST", "/api/cuenta/verificar", {"codigo": cod[:3] + " " + cod[3:]})
comprobar(st == 200 and r["email_verificado"] is True, "con el código (aunque lleve espacio) queda verificado")
st, _ = ana.j("GET", "/api/proyectos")
comprobar(st == 200, "ya verificada, la API responde")
st, r = ana.j("POST", "/api/cuenta/verificar", {"codigo": cod})
comprobar(st == 200, "verificar otra vez no falla")

# ── Intentos agotados ──
beto, eb = Cliente(), correo_de("beto")
beto.j("POST", "/api/cuenta/registro", {"nombre": "Beto", "email": eb, "clave": "clave-segura-2"})
cb = ultimo_codigo(eb)
malo = "000000" if cb != "000000" else "111111"
for _ in range(5):
    st, r = beto.j("POST", "/api/cuenta/verificar", {"codigo": malo})
st, r = beto.j("POST", "/api/cuenta/verificar", {"codigo": cb})
comprobar(st == 400 and r["code"] == "codigo_caducado", "tras 5 intentos fallidos ni el código bueno sirve")

# ── Olvidé mi contraseña ──
st, r = Cliente().j("POST", "/api/cuenta/recuperar", {"email": "nadie-%s@prueba.test" % sufijo})
comprobar(st == 200 and r == {"ok": True}, "recuperar un correo que no existe responde igual")
comprobar(correos("nadie-%s@prueba.test" % sufijo) == [], "y no envía nada")
otro = Cliente()
otro.j("POST", "/api/cuenta/entrar", {"email": ea, "clave": "clave-segura-1"})
st, r = Cliente().j("POST", "/api/cuenta/recuperar", {"email": ea.upper()})
cr = ultimo_codigo(ea)
comprobar(st == 200 and cr and "/recuperar?email=" in correos(ea)[-1]["texto"], "llega el código de recuperación con el enlace")
st, r = Cliente().j("POST", "/api/cuenta/recuperar/confirmar", {"email": ea, "codigo": cr, "clave_nueva": "corta"})
comprobar(st == 400, "contraseña nueva corta: 400")
nueva = Cliente()
st, r = nueva.j("POST", "/api/cuenta/recuperar/confirmar", {"email": ea, "codigo": cr, "clave_nueva": "clave-nueva-1"})
comprobar(st == 200, "con el código se cambia la contraseña y entra")
st, _ = otro.j("GET", "/api/proyectos")
comprobar(st == 401, "las demás sesiones se cerraron")
comprobar("contraseña cambió" in correos(ea)[-1]["asunto"], "llega el aviso de contraseña cambiada")
st, _ = Cliente().j("POST", "/api/cuenta/recuperar/confirmar", {"email": ea, "codigo": cr, "clave_nueva": "clave-nueva-2"})
comprobar(st == 400, "el código de recuperación no sirve dos veces")
ana = nueva

# ── Dos pasos ──
st, r = ana.j("PATCH", "/api/cuenta/yo", {"dos_pasos": True, "clave_actual": "mala"})
comprobar(st == 400, "activar dos pasos pide la contraseña")
st, r = ana.j("PATCH", "/api/cuenta/yo", {"dos_pasos": True, "clave_actual": "clave-nueva-1"})
comprobar(st == 200 and r["dos_pasos"] is True, "dos pasos activados")
c2 = Cliente()
st, r = c2.j("POST", "/api/cuenta/entrar", {"email": ea, "clave": "clave-nueva-1"})
comprobar(st == 200 and r.get("dos_pasos") and r["desafio"] and "•" in r["email"], "con dos pasos, entrar devuelve un desafío y no la sesión")
st, _ = c2.j("GET", "/api/proyectos")
comprobar(st == 401, "sin el código no hay sesión")
ce = ultimo_codigo(ea)
st, _ = c2.j("POST", "/api/cuenta/entrar/codigo", {"desafio": r["desafio"], "codigo": "000000" if ce != "000000" else "111111"})
comprobar(st == 400, "código de entrada incorrecto: 400")
st, _ = c2.j("POST", "/api/cuenta/entrar/codigo", {"desafio": r["desafio"], "codigo": ce})
st2, _ = c2.j("GET", "/api/proyectos")
comprobar(st == 200 and st2 == 200, "con el código entra")
st, _ = c2.j("POST", "/api/cuenta/entrar/codigo", {"desafio": r["desafio"], "codigo": ce})
comprobar(st == 400, "el código de entrada no sirve dos veces")
ana.j("PATCH", "/api/cuenta/yo", {"dos_pasos": False, "clave_actual": "clave-nueva-1"})

# ── Límite de intentos de entrada ──
codes = []
for _ in range(9):
    st, _ = Cliente().j("POST", "/api/cuenta/entrar", {"email": eb, "clave": "mala-mala"})
    codes.append(st)
comprobar(codes[:8] == [401] * 8 and codes[8] == 429, "tras 8 contraseñas malas en 15 min: 429")
st, _ = Cliente().j("POST", "/api/cuenta/entrar", {"email": eb, "clave": "clave-segura-2"})
comprobar(st == 429, "ni siquiera con la buena, hasta que pase el tiempo")

# ── Cambiar el correo ──
nuevo_email = correo_de("ana-nueva")
st, r = ana.j("POST", "/api/cuenta/correo", {"email_nuevo": eb, "clave_actual": "clave-nueva-1"})
comprobar(st == 409, "no se puede cambiar a un correo que ya usa otra cuenta")
st, r = ana.j("POST", "/api/cuenta/correo", {"email_nuevo": nuevo_email, "clave_actual": "clave-nueva-1"})
comprobar(st == 200 and ultimo_codigo(nuevo_email), "el código llega al correo nuevo")
st, r = ana.j("POST", "/api/cuenta/correo/confirmar", {"codigo": ultimo_codigo(nuevo_email)})
comprobar(st == 200 and r["email"] == nuevo_email, "correo cambiado")
comprobar("cambió" in correos(ea)[-1]["asunto"], "al correo viejo le llega el aviso")
st, _ = Cliente().j("POST", "/api/cuenta/entrar", {"email": nuevo_email, "clave": "clave-nueva-1"})
comprobar(st == 200, "se entra con el correo nuevo")

# ── Invitaciones por correo ──
st, p = ana.j("POST", "/api/proyectos", {"nombre": "Con correo", "plantilla": "vacio"})
ec = correo_de("carla")
st, r = ana.j("POST", "/api/proyectos/%s/miembros" % p["id"], {"email": ec, "rol": "editor"})
comprobar(st == 201 and r["invitado"] and r["enviado"], "invitar a quien no tiene cuenta le envía una invitación")
inv = correos(ec)[-1]
m = re.search(r"/invitacion/([A-Za-z0-9_\-]+)", inv["texto"])
comprobar(m and "Con correo" in inv["asunto"], "el correo trae el enlace y el nombre del mapa")
carla = Cliente()
st, u = carla.j("POST", "/api/cuenta/registro", {"nombre": "Carla", "email": ec, "clave": "clave-segura-3", "invitacion": m.group(1)})
comprobar(st == 200 and u["proyecto"]["id"] == p["id"] and u["verificar"], "Carla se registra con el enlace (y debe verificar)")
carla.j("POST", "/api/cuenta/verificar", {"codigo": ultimo_codigo(ec)})
st, lista = carla.j("GET", "/api/proyectos")
comprobar(any(x["id"] == p["id"] and x["rol"] == "editor" for x in lista), "Carla es editora del mapa")
n_antes = len(correos(eb))
st, r = ana.j("POST", "/api/proyectos/%s/miembros" % p["id"], {"email": eb, "rol": "lector"})
comprobar(st == 201 and r["invitado"] is False and len(correos(eb)) == n_antes + 1 and "compartió" in correos(eb)[-1]["asunto"],
          "a quien ya tiene cuenta se le añade y se le avisa")
for f in BUZON.glob("*.json"):
    d = json.loads(f.read_text("utf-8"))
    if "<script" in d["html"].lower():
        comprobar(False, "ningún correo lleva <script>")
        break

print("fallos=%d" % cliente.fallos)
sys.exit(1 if cliente.fallos else 0)
