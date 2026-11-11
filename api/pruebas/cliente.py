"""Cliente HTTP mínimo para las pruebas de punta a punta (solo biblioteca estándar)."""
import http.cookiejar
import json
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


