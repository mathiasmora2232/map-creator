"""Prueba de punta a punta contra una instancia en marcha (con una base vacía o de pruebas, NUNCA la de producción):

    python api/pruebas/prueba_api.py http://127.0.0.1:8000

Cubre cuentas, proyectos desde plantilla, la interfaz /api/db del editor (ETag, PATCH con __delete__), permisos (dueño, editor,
lector, ajeno), subidas y /_blob, duplicar con reescritura de referencias, papelera y la lista blanca de estáticos del editor.
Solo usa la biblioteca estándar. Sale con código 1 si algo falla.
"""
import http.cookiejar
import json
import secrets
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
fallos = 0


def comprobar(cond, texto):
    global fallos
    print(("BIEN " if cond else "FALLA") + "  " + texto)
    fallos += 0 if cond else 1


class Cliente:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def pedir(self, metodo, ruta, json_=None, cuerpo=None, cab=None):
        cab = dict(cab or {})
        if json_ is not None:
            cuerpo = json.dumps(json_).encode()
            cab["Content-Type"] = "application/json"
        req = urllib.request.Request(BASE + ruta, data=cuerpo, method=metodo, headers=cab)
        try:
            with self.op.open(req) as r:
                datos = r.read()
                return r.status, dict(r.headers), datos
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def j(self, metodo, ruta, json_=None, **k):
        st, cab, d = self.pedir(metodo, ruta, json_, **k)
        try:
            return st, json.loads(d) if d else None
        except ValueError:
            return st, d


sufijo = secrets.token_hex(4)
ana, beto, carla = Cliente(), Cliente(), Cliente()

# ── Cuentas ──
st, u = ana.j("POST", "/api/cuenta/registro", {"nombre": "Ana", "email": "ana-%s@prueba.test" % sufijo, "clave": "clave-segura-1"})
comprobar(st == 200 and u["nombre"] == "Ana", "registro de Ana")
st, _ = Cliente().j("POST", "/api/cuenta/registro", {"nombre": "X", "email": "ANA-%s@prueba.test" % sufijo, "clave": "otra-clave-2"})
comprobar(st == 409, "el correo repetido (sin distinguir mayúsculas) da 409")
st, _ = Cliente().j("POST", "/api/cuenta/registro", {"nombre": "X", "email": "x-%s@prueba.test" % sufijo, "clave": "corta"})
comprobar(st == 400, "contraseña corta: 400")
st, _ = Cliente().j("POST", "/api/cuenta/entrar", {"email": "ana-%s@prueba.test" % sufijo, "clave": "mala"})
comprobar(st == 401, "clave equivocada: 401")
for c, n in ((beto, "Beto"), (carla, "Carla")):
    c.j("POST", "/api/cuenta/registro", {"nombre": n, "email": "%s-%s@prueba.test" % (n.lower(), sufijo), "clave": "clave-segura-1"})
st, yo = ana.j("GET", "/api/cuenta/yo")
comprobar(st == 200 and yo["email"] == "ana-%s@prueba.test" % sufijo, "/api/cuenta/yo con la cookie")
st, _ = Cliente().j("GET", "/api/proyectos")
comprobar(st == 401, "sin sesión: 401")

# ── Proyectos ──
st, plantillas = ana.j("GET", "/api/plantillas")
comprobar(st == 200 and {p["id"] for p in plantillas} >= {"vacio", "complejo"}, "plantillas")
st, p = ana.j("POST", "/api/proyectos", {"nombre": "Oficina Ñandú", "plantilla": "vacio", "ancho": 60, "largo": 40, "terreno": "concreto"})
comprobar(st == 201 and p["mapa_inicial"] == "u-oficina-nandu" and p["rol"] == "dueno", "proyecto en blanco con mapa u-oficina-nandu")
pid = p["id"]
P = {"X-OO-Proyecto": pid}
st, cab, d = ana.pedir("GET", "/api/db/mapas", cab=P)
docs = json.loads(d)["docs"]
comprobar(st == 200 and docs[0]["id"] == "u-oficina-nandu" and docs[0]["data"]["terreno"] == "concreto", "la colección mapas trae el mapa nuevo")
st, pc = ana.j("POST", "/api/proyectos", {"nombre": "Complejo", "plantilla": "complejo"})
comprobar(st == 201 and pc["mapa_inicial"] == "complejo", "proyecto desde la plantilla Complejo")

# ── /api/db ──
st, cab, d = ana.pedir("GET", "/api/db/cambios", cab=P)
etag = cab.get("etag") or cab.get("ETag")
comprobar(st == 200 and json.loads(d) == {"docs": []} and etag, "colección vacía con ETag")
st, cab, d = ana.pedir("GET", "/api/db/cambios", cab=dict(P, **{"If-None-Match": etag}))
comprobar(st == 304, "misma versión: 304")
st, r = ana.j("PUT", "/api/db/cambios/n-1", {"tipo": "pared", "datos": {"a": 1, "b": {"c": 2, "d": 3}}, "mapa": "u-oficina-nandu"}, cab=P)
comprobar(st == 200 and r["id"] == "n-1", "PUT de un documento")
st, cab, d = ana.pedir("GET", "/api/db/cambios", cab=dict(P, **{"If-None-Match": etag}))
comprobar(st == 200 and len(json.loads(d)["docs"]) == 1, "tras escribir, el ETag viejo ya no vale")
st, r = ana.j("PATCH", "/api/db/cambios/n-1", {"datos": {"b": {"c": 9, "d": {"__delete__": True}}, "e": 5}}, cab=P)
st, cab, d = ana.pedir("GET", "/api/db/cambios", cab=P)
doc = json.loads(d)["docs"][0]["data"]
comprobar(doc["datos"] == {"a": 1, "b": {"c": 9}, "e": 5}, "PATCH fusiona en profundidad y __delete__ quita la clave")
st, r = ana.j("POST", "/api/db/notas", {"texto": "hola"}, cab=P)
comprobar(st == 200 and len(r["id"]) == 20, "POST sin id genera uno")
st, _ = ana.j("PUT", "/api/db/cambios/n-1", {"x": 1}, cab={"X-OO-Proyecto": pc["id"]})
st2, cab, d = ana.pedir("GET", "/api/db/cambios", cab={"X-OO-Proyecto": pc["id"]})
comprobar(len(json.loads(d)["docs"]) == 1 and json.loads(d)["docs"][0]["data"] == {"x": 1}, "los proyectos no se mezclan")
st, _ = ana.j("PUT", "/api/db/../x", {"x": 1}, cab=P)
comprobar(st in (400, 404), "colección con ruta rara: rechazada")
st, _ = ana.j("PUT", "/api/db/cambios/n-2", None, cuerpo=b"[1,2]", cab=dict(P, **{"Content-Type": "application/json"}))
comprobar(st == 400, "un documento que no es objeto: 400")
st, _ = ana.j("DELETE", "/api/db/cambios/n-1", cab=dict(P))
st, cab, d = ana.pedir("GET", "/api/db/cambios", cab=P)
comprobar(json.loads(d)["docs"] == [], "DELETE")
st, _ = ana.j("PUT", "/api/db/cambios/n-1", {"x": 1}, cab=dict(P, Origin="https://malo.example"))
comprobar(st == 403, "escritura desde otro origen: 403")

# ── Permisos ──
st, _ = beto.j("GET", "/api/db/cambios", cab=P)
comprobar(st == 404, "un ajeno no ve el proyecto (404)")
st, _ = beto.j("POST", "/api/proyectos/%s/miembros" % pid, {"email": "carla-%s@prueba.test" % sufijo, "rol": "editor"})
comprobar(st == 404, "un ajeno no puede invitar")
st, _ = ana.j("POST", "/api/proyectos/%s/miembros" % pid, {"email": "nadie@prueba.test", "rol": "editor"})
comprobar(st == 404, "invitar a un correo sin cuenta: 404")
ana.j("POST", "/api/proyectos/%s/miembros" % pid, {"email": "beto-%s@prueba.test" % sufijo, "rol": "editor"})
ana.j("POST", "/api/proyectos/%s/miembros" % pid, {"email": "carla-%s@prueba.test" % sufijo, "rol": "lector"})
st, _ = beto.j("PUT", "/api/db/cambios/b-1", {"de": "beto"}, cab=P)
comprobar(st == 200, "el editor escribe")
st, cab, d = carla.pedir("GET", "/api/db/cambios", cab=P)
comprobar(st == 200 and json.loads(d)["docs"][0]["id"] == "b-1", "la lectora lee")
st, r = carla.j("PUT", "/api/db/cambios/c-1", {"de": "carla"}, cab=P)
comprobar(st == 403 and r["code"] == "permission_denied", "la lectora no escribe (403)")
st, _ = beto.j("DELETE", "/api/proyectos/%s" % pid)
comprobar(st == 404, "el editor no puede borrar el proyecto")
st, lista = carla.j("GET", "/api/proyectos")
comprobar(any(x["id"] == pid and x["rol"] == "lector" for x in lista), "el proyecto sale en la lista de la lectora")
st, miembros = ana.j("GET", "/api/proyectos/%s/miembros" % pid)
comprobar([m["rol"] for m in miembros] == ["dueno", "editor", "lector"] or sorted(m["rol"] for m in miembros) == ["dueno", "editor", "lector"], "lista de miembros")
uid_ana = yo["id"]
st, _ = ana.j("DELETE", "/api/proyectos/%s/miembros/%s" % (pid, uid_ana))
st, miembros2 = ana.j("GET", "/api/proyectos/%s/miembros" % pid)
comprobar(len(miembros2) == 3, "el dueño no se puede quitar a sí mismo")

# ── Archivos ──
png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
st, f = ana.j("POST", "/api/fotos", None, cuerpo=png, cab=dict(P, **{"X-Nombre": "plano%20de%20planta.png", "Content-Type": "image/png"}))
comprobar(st == 200 and f["id"].startswith(pid + "/") and f["url"] == "/_blob/" + f["id"], "subir foto")
st, cab, d = carla.pedir("GET", f["url"])
comprobar(st == 200 and d == png and cab.get("content-type", cab.get("Content-Type")) == "image/png", "la lectora descarga la foto")
st, cab, d = beto.pedir("GET", "/_blob/%s/%s" % (pc["id"], f["id"].split("/")[1]))
comprobar(st == 404, "/_blob de otro proyecto: 404")
st, r = carla.j("POST", "/api/fotos", None, cuerpo=png, cab=dict(P, **{"X-Nombre": "x.png"}))
comprobar(st == 403, "la lectora no sube")
st, r = ana.j("POST", "/api/assets", None, cuerpo=b"x", cab=dict(P, **{"X-Nombre": "virus.exe"}))
comprobar(st == 400, "asset con extensión no admitida: 400")
st, r = ana.j("GET", "/api/fotos", cab=P)
comprobar(st == 200 and r["assets"][0]["id"] == f["id"], "listar fotos")
ana.j("PUT", "/api/db/calcos/k-1", {"asset": f["id"], "mapa": "u-oficina-nandu"}, cab=P)

# ── Duplicar ──
st, copia = carla.j("POST", "/api/proyectos/%s/duplicar" % pid)
comprobar(st == 201 and copia["rol"] == "dueno" and copia["nombre"].startswith("Copia de"), "la lectora hace una copia y es su dueña")
st, cab, d = carla.pedir("GET", "/api/db/calcos", cab={"X-OO-Proyecto": copia["id"]})
asset = json.loads(d)["docs"][0]["data"]["asset"]
comprobar(asset.startswith(copia["id"] + "/"), "la copia reescribe las referencias a archivos")
st, cab, d = carla.pedir("GET", "/_blob/" + asset)
comprobar(st == 200 and d == png, "el archivo copiado se descarga")
st, _ = carla.j("PUT", "/api/db/cambios/c-1", {"de": "carla"}, cab={"X-OO-Proyecto": copia["id"]})
comprobar(st == 200, "en su copia sí escribe")

# ── Papelera ──
st, _ = ana.j("DELETE", "/api/proyectos/%s?definitivo=true" % pid)
comprobar(st == 404, "no se borra para siempre sin pasar por la papelera")
ana.j("DELETE", "/api/proyectos/%s" % pid)
st, _ = beto.j("GET", "/api/db/cambios", cab=P)
comprobar(st == 404, "en la papelera nadie lo abre")
st, papelera = ana.j("GET", "/api/proyectos?papelera=true")
comprobar([x["id"] for x in papelera] == [pid], "sale en la papelera de la dueña")
ana.j("POST", "/api/proyectos/%s/restaurar" % pid)
st, _ = beto.j("GET", "/api/db/cambios", cab=P)
comprobar(st == 200, "restaurado")
ana.j("DELETE", "/api/proyectos/%s" % pid)
st, _ = ana.j("DELETE", "/api/proyectos/%s?definitivo=true" % pid)
st2, cab, d = ana.pedir("GET", f["url"])
comprobar(st == 200 and st2 == 404, "borrado para siempre, con sus archivos")

# ── Estáticos ──
st, cab, d = ana.pedir("GET", "/")
comprobar(st == 200 and b"Map Creator" in d, "landing")
st, cab, d = Cliente().pedir("GET", "/app")
comprobar(st == 200 and b"Hola de nuevo" in d, "/app sin sesión lleva a entrar")
st, cab, d = ana.pedir("GET", "/editor/?p=x")
comprobar(st == 200 and b"js/nucleo/local.js" in d, "editor con sesión")
st, cab, d = ana.pedir("GET", "/editor/js/nucleo/editor.js")
comprobar(st == 200 and len(d) > 100000, "script del editor")
st, cab, d = ana.pedir("GET", "/editor/mapas/mapa_parqueadero.json", cab={"Accept-Encoding": "gzip"})
comprobar(st == 200 and cab.get("content-encoding", cab.get("Content-Encoding")) == "gzip", "mapa base comprimido con gzip")
for ruta in ("/editor/local/servidor.py", "/editor/local/datos_usuario/cambios.json", "/editor/LEEME.md", "/editor/js/../local/servidor.py",
             "/editor/%2e%2e/api/app/config.py"):
    st, _, _ = ana.pedir("GET", ruta)
    comprobar(st == 404, "no se sirve " + ruta)

print("fallos=%d" % fallos)
sys.exit(1 if fallos else 0)
