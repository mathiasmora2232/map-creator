"""(2.1) Prueba de la migración de referencias a piezas (migrar_refs.py) y de su uso en servidor.py, con datos inventados.

  python -I herramientas/editor_mapa/pruebas/prueba_migrar_refs.py [--servidor] [--puerto 7792] [--carpeta tmp]

Toma herramientas/editor_mapa/mapa_complejo.json como mapa «viejo» y fabrica uno «nuevo» quitando 300 piezas del principio, metiendo
250 en medio y moviendo 1 m una pieza editada. Inventa datos como los del editor (pieza movida, borrado de varias, grupo, hueco en una
pared original, versión guardada) y comprueba que cada referencia acaba en la misma pieza, que lo que nombraba piezas que ya no existen
(la del bloque quitado y la que cambió) se aparta en vez de apuntar a otra, y que los `antes` casan después.
Con --servidor arranca además servidor.py (puerto 7792 si está libre; datos, mapas, carteles, reglas y juego en una carpeta temporal),
cambia el mapa con el servidor en marcha y comprueba: la escritura de una pestaña con el mapa viejo recibe 409, los datos se migran con
respaldo e informe, la copia `_base_mapa` se actualiza y una pestaña con el mapa nuevo escribe bien. Sale con 0 si todo pasa.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, AQUI)
MAPAS_EDITOR = os.path.join(os.path.dirname(AQUI), "mapas")
import migrar_refs as mr  # noqa: E402

fallos = 0


def comprobar(ok, que):
    global fallos
    print(("BIEN  " if ok else "FALLO ") + que, flush=True)
    if not ok:
        fallos += 1


def r3(v):
    return round(v * 1000) / 1000


def antes_de(a):
    """Lo que guarda editor.js en `antes` (estadoDatos(i, true)), en coordenadas del editor."""
    o = {"x": r3(a[3]), "y": r3(a[4]), "z": r3(-a[5])}
    if a[0] <= 4:
        o.update(sx=r3(a[6]), sy=r3(a[7]), sz=r3(a[8]), escala=[1, 1, 1])
    else:
        o.update(sx=a[6], sy=a[7], sz=a[8])
    o["q"] = [round(v * 1e5) / 1e5 for v in (-a[9], -a[10], a[11], a[12])]
    o["giroY"] = 0
    o["color"] = "#888888"
    return o


def fabricar():
    with open(os.path.join(MAPAS_EDITOR, "mapa_complejo.json"), encoding="utf-8") as f:
        viejo = json.load(f)
    V = viejo["piezas"]
    n = len(V)
    # mapa nuevo: [0,100) + [400,5000) + 250 piezas nuevas + [5000, n); la pieza `cambia` se mueve 1 m
    extra = []
    for a in V[:250]:
        b = list(a)
        b[3] += 1000.0
        extra.append(b)
    orden = list(range(0, 100)) + list(range(400, 5000)) + [None] * 250 + list(range(5000, n))
    nuevo = copy.deepcopy(viejo)
    nuevo["piezas"] = []
    k = 0
    for i in orden:
        if i is None:
            nuevo["piezas"].append(extra[k])
            k += 1
        else:
            nuevo["piezas"].append(copy.deepcopy(V[i]))
    pos_nueva = {i: j for j, i in enumerate(orden) if i is not None}

    def elegir(rango, cond, cuantas):
        out = []
        for i in rango:
            if cond(V[i]) and V[i][3] < 900:
                out.append(i)
                if len(out) == cuantas:
                    break
        return out
    cajas = elegir(range(6000, n), lambda a: a[0] == 0 and a[7] < 1.5, 6)
    mallas = elegir(range(450, 5000), lambda a: a[0] == 1, 4)
    luces = elegir(range(5000, n), lambda a: a[0] == 5, 2)
    bajas = elegir(range(0, 100), lambda a: a[0] in (0, 1), 2)
    perdida = elegir(range(150, 400), lambda a: a[0] in (0, 1), 1)[0]
    pared = elegir(range(7000, n), lambda a: a[0] == 0 and a[7] > 2 and max(a[6], a[8]) > 3 and min(a[6], a[8]) < 0.6, 1)[0]
    cambia = cajas[-1]
    nuevo["piezas"][pos_nueva[cambia]][3] += 1.0
    t = "2026-11-08T10:00:00.000Z"
    cambios, grupos = {}, {}
    for i in cajas[:3] + mallas[:2] + luces[:1] + bajas[:1] + [cambia]:
        a = V[i]
        ant = antes_de(a)
        dat = dict(ant, x=r3(ant["x"] + 0.5), origen="centro")
        cambios["m-complejo-p%d" % i] = {"mapa": "complejo", "accion": "modificar", "ref": i, "tipo": "pieza:caja", "antes": ant,
                                          "datos": dat, "creado": t, "actualizado": t, "capa": "General", "autor": "prueba"}
    varias = [cajas[3], mallas[2], perdida, bajas[1]]
    cambios["m-complejo-s" + mr.hash_refs(varias)] = {
        "mapa": "complejo", "accion": "borrar", "ref": varias, "tipo": "seleccion:4", "datos": {"x": 0, "y": 0, "z": 0},
        "antes": {"piezas": [dict(antes_de(V[i]), ref=i) for i in varias]}, "creado": t, "actualizado": t}
    cambios["m-complejo-p%d" % perdida] = {"mapa": "complejo", "accion": "borrar", "ref": perdida, "tipo": "pieza:caja",
                                           "antes": antes_de(V[perdida]), "datos": {}, "creado": t, "actualizado": t}
    a = V[pared]
    cambios["n-complejo-hueco1"] = {"mapa": "complejo", "accion": "agregar", "ref": None, "id_objeto": "n-complejo-hueco1", "tipo": "hueco",
                                    "datos": {"x": a[3], "y": a[4] - a[7] / 2, "z": -a[5], "sx": 1, "sy": 2, "sz": 0.3, "muro": pared},
                                    "antes": None, "creado": t, "actualizado": t}
    cambios["n-complejo-silla1"] = {"mapa": "complejo", "accion": "agregar", "ref": None, "id_objeto": "silla1", "tipo": "objeto:silla",
                                    "datos": {"x": 1, "y": 0, "z": 2}, "antes": None, "creado": t, "actualizado": t}
    miembros = [cajas[4], mallas[3], luces[1]]
    grupos["grp-complejo-1"] = {"mapa": "complejo", "nombre": "Grupo 1", "miembros": ["p%d" % i for i in miembros]}
    grupos["grp-complejo-2"] = {"mapa": "complejo", "nombre": "Grupo 2", "miembros": ["p%d" % perdida]}
    versiones = {"v-complejo-1": {"mapa": "complejo", "nombre": "prueba", "fecha": t, "docs": copy.deepcopy(cambios)}}
    cols = {"cambios": cambios, "grupos": grupos, "versiones": versiones, "etiquetas": {}}
    esperado = {i: pos_nueva[i] for i in pos_nueva if i != cambia}
    return viejo, nuevo, cols, esperado, {"perdida": perdida, "cambia": cambia, "pared": pared, "varias": varias, "cajas": cajas, "miembros": miembros}


def revisar_resultado(nuevas, nuevo, viejo, esperado, info, que, exacto=True):
    ok, mal, _sin = mr.comprobar_antes(nuevas, nuevo)
    comprobar(mal == 0 and ok > 0, "%s: todos los `antes` casan con el mapa nuevo (%d casan, %d no)" % (que, ok, mal))
    c = nuevas["cambios"]
    p, cb = info["perdida"], info["cambia"]
    comprobar("m-complejo-p%d" % p not in c and not any(d.get("ref") == p for d in c.values()),
              "%s: el borrado de la pieza que ya no existe no apunta a ninguna otra" % que)
    comprobar(not any(d.get("ref") in (cb, esperado.get(cb)) and d.get("accion") == "modificar" and d["antes"]["x"] == r3(viejo["piezas"][cb][3])
                      for d in c.values()), "%s: el cambio de la pieza que se movió en el mapa queda apartado" % que)
    bien = 0
    total = 0
    for id_doc, d in c.items():
        if d.get("accion") == "modificar":
            total += 1
            r = d["ref"]
            bien += int(id_doc == "m-complejo-p%d" % r and mr.casa_antes(nuevo["piezas"][r], d["antes"]))
    comprobar(total == 7 and bien == total, "%s: %d de %d piezas movidas en su pieza y con su id «p<i>» nuevo" % (que, bien, total))
    s = [d for d in c.values() if d.get("accion") == "borrar" and isinstance(d.get("ref"), list)]
    quedan = [esperado[i] for i in info["varias"] if i != p]
    comprobar(len(s) == 1 and sorted(s[0]["ref"]) == sorted(quedan) and len(s[0]["antes"]["piezas"]) == 3,
              "%s: el borrado de 4 piezas queda con las 3 que existen" % que)
    ids = [k for k, d in c.items() if d is (s[0] if s else None)]
    comprobar(bool(ids) and ids[0] == "m-complejo-s" + mr.hash_refs(s[0]["ref"]), "%s: id «s<hash>» recalculado como editor.js" % que)
    h = c.get("n-complejo-hueco1", {})
    comprobar(h.get("datos", {}).get("muro") == esperado[info["pared"]], "%s: el hueco sigue en su pared original" % que)
    comprobar("n-complejo-silla1" in c, "%s: los objetos nuevos siguen ahí" % que)
    g = nuevas["grupos"]
    if exacto:
        comprobar(g["grp-complejo-1"]["miembros"] == ["p%d" % esperado[i] for i in info["miembros"]], "%s: miembros del grupo migrados" % que)
    else:  # sin mapa viejo los miembros no tienen `antes`: o van a su pieza o se apartan, nunca a otra
        quedan = g.get("grp-complejo-1", {}).get("miembros", [])
        bien = set("p%d" % esperado[i] for i in info["miembros"])
        comprobar(all(k in bien for k in quedan), "%s: miembros del grupo en su pieza o apartados (%d de 3 resueltos)" % (que, len(quedan)))
    comprobar("grp-complejo-2" not in g or not exacto, "%s: el grupo de una sola pieza que ya no existe se aparta" % que)
    v = nuevas["versiones"]["v-complejo-1"]["docs"]
    comprobar(len(v) == len(c) and mr.comprobar_antes({"versiones": nuevas["versiones"]}, nuevo)[1] == 0,
              "%s: la versión guardada se migra igual (%d documentos)" % (que, len(v)))


def prueba_unidad():
    viejo, nuevo, cols, esperado, info = fabricar()
    for nombre, vj in (("con el mapa viejo", viejo), ("sin el mapa viejo (por `antes`)", None)):
        t0 = time.time()
        p = mr.plan(copy.deepcopy(cols), "complejo", nuevo, vj)
        comprobar(p["valida"], "%s: migración válida (%.1f s)" % (nombre, time.time() - t0))
        ap = p["est"]["apartados"]
        comprobar(len([a for a in ap if a["coleccion"] == "cambios"]) == 3,
                  "%s: 3 documentos de cambios apartados (borrado de la pieza quitada, la pieza movida y parte del borrado múltiple): %s" % (
                      nombre, [(a["id"], a["refs_viejas"]) for a in ap if a["coleccion"] == "cambios"]))
        revisar_resultado(p["nuevas"], nuevo, viejo, esperado, info, nombre, exacto=vj is not None)
    return viejo, nuevo, cols, info


# ------------------------------------------------------------------ servidor
def pedir(url, metodo="GET", datos=None, cabeceras=None):
    req = urllib.request.Request(url, method=metodo, data=json.dumps(datos).encode() if datos is not None else None,
                                 headers=dict({"Content-Type": "application/json"}, **(cabeceras or {})))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def prueba_servidor(viejo, nuevo, cols, info, puerto, raiz):
    import socket
    with socket.socket() as so:
        so.settimeout(3)
        ocupado = so.connect_ex(("127.0.0.1", puerto)) == 0
    if ocupado:
        comprobar(False, "el puerto %d está ocupado: no se prueba el servidor" % puerto)
        return
    datos, mapas = os.path.join(raiz, "datos"), os.path.join(raiz, "mapas")
    for d in (datos, mapas):
        os.makedirs(d, exist_ok=True)
    for col in ("cambios", "grupos", "versiones"):
        with open(os.path.join(datos, col + ".json"), "w", encoding="utf-8") as f:
            json.dump(cols[col], f, ensure_ascii=False)
    with open(os.path.join(mapas, "mapa_complejo.json"), "w", encoding="utf-8") as f:
        json.dump(viejo, f)
    shutil.copyfile(os.path.join(MAPAS_EDITOR, "mapa_parqueadero.json"), os.path.join(mapas, "mapa_parqueadero.json"))
    env = dict(os.environ, OO_PUERTO_EDITOR=str(puerto), OO_DATOS_EDITOR=datos, OO_MAPAS_EDITOR=mapas,
               OO_CARTELES_UNITY=os.path.join(raiz, "carteles"), OO_REGLAS_UNITY=os.path.join(raiz, "reglas"),
               OO_EDITORMAPA_UNITY=os.path.join(raiz, "juego"))
    srv = subprocess.Popen([sys.executable, "-I", os.path.join(AQUI, "servidor.py"), "--sin-navegador"], env=env,
                           stdout=open(os.path.join(raiz, "servidor.log"), "w", encoding="utf-8"), stderr=subprocess.STDOUT)
    url = "http://127.0.0.1:%d" % puerto
    try:
        for _ in range(120):
            if srv.poll() is not None:
                comprobar(False, "el servidor no arrancó (ver servidor.log)")
                return
            try:
                pedir(url + "/api/db/capas")
                break
            except OSError:
                time.sleep(0.25)
        st, cab, _ = pedir(url + "/mapas/mapa_complejo.json")
        v_viejo = cab.get("X-OO-Version-Mapa")
        comprobar(st == 200 and v_viejo == mr.version_archivo(os.path.join(mapas, "mapa_complejo.json")),
                  "el servidor da la versión del mapa en X-OO-Version-Mapa (%s)" % v_viejo)
        comprobar(mr.version_archivo(os.path.join(datos, "_base_mapa_complejo.json")) == v_viejo,
                  "sin copia previa y con todo casando, guarda la copia del mapa con la que van los datos")
        # el mapa se regenera con el servidor en marcha
        tmp = os.path.join(mapas, "mapa_complejo.json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nuevo, f)
        os.replace(tmp, os.path.join(mapas, "mapa_complejo.json"))
        v_nuevo = mr.version_archivo(os.path.join(mapas, "mapa_complejo.json"))
        i = info["cajas"][5]
        doc = {"mapa": "complejo", "accion": "modificar", "ref": i, "antes": antes_de(viejo["piezas"][i]), "datos": {"x": 0, "y": 0, "z": 0}}
        st, _, cuerpo = pedir(url + "/api/db/cambios/m-complejo-p%d" % i, "PUT", doc, {"X-OO-Mapas": "complejo=" + v_viejo})
        comprobar(st == 409, "una pestaña con el mapa viejo no puede escribir índices viejos (HTTP %d: %s)" % (st, cuerpo[:80].decode("utf-8", "replace")))
        respaldos = os.listdir(os.path.join(datos, "respaldos_refs")) if os.path.isdir(os.path.join(datos, "respaldos_refs")) else []
        comprobar(len(respaldos) == 1 and os.path.exists(os.path.join(datos, "respaldos_refs", respaldos[0], "informe.json"))
                  and os.path.exists(os.path.join(datos, "respaldos_refs", respaldos[0], "mapa_viejo_complejo.json"))
                  and os.path.exists(os.path.join(datos, "respaldos_refs", respaldos[0], "cambios.json")),
                  "migración con respaldo (colecciones, mapa viejo e informe): %s" % respaldos)
        en_disco = mr.cargar_datos(datos)
        p = mr.plan(copy.deepcopy(cols), "complejo", nuevo, viejo)
        comprobar(all(en_disco[c] == p["nuevas"][c] for c in ("cambios", "grupos", "versiones")),
                  "lo escrito por el servidor es lo mismo que migrar_refs.plan")
        comprobar(len(en_disco[mr.APARTADOS]) == len(p["est"]["apartados"]) > 0,
                  "lo que nombraba piezas que ya no existen está en %s.json (%d)" % (mr.APARTADOS, len(en_disco[mr.APARTADOS])))
        comprobar(mr.version_archivo(os.path.join(datos, "_base_mapa_complejo.json")) == v_nuevo, "la copia `_base_mapa` es ahora el mapa nuevo")
        st, cab, _ = pedir(url + "/mapas/mapa_complejo.json")
        comprobar(cab.get("X-OO-Version-Mapa") == v_nuevo, "el mapa se sirve con la versión nueva")
        st, _, _ = pedir(url + "/api/db/cambios/m-complejo-p1", "PUT", {"mapa": "complejo", "accion": "nota", "ref": 1, "texto": "x"},
                         {"X-OO-Mapas": "complejo=" + v_nuevo})
        comprobar(st == 200, "una pestaña con el mapa nuevo escribe bien (HTTP %d)" % st)
        st, _, cuerpo = pedir(url + "/api/mapa_estado")
        est = json.loads(cuerpo)
        comprobar(est["complejo"].get("migracion", {}).get("antes_casan_despues", [0, 1])[1] == 0 and "aviso" in est["complejo"],
                  "/api/mapa_estado cuenta la migración y avisa de lo apartado")
        st, _, _ = pedir(url + "/api/db/capas/c1", "PUT", {"nombre": "x"})
        comprobar(st == 200, "lo que no nombra piezas se escribe sin cabecera (HTTP %d)" % st)
    finally:
        srv.terminate()
        try:
            srv.wait(10)
        except subprocess.TimeoutExpired:
            srv.kill()


def main(argv):
    viejo, nuevo, cols, info = prueba_unidad()
    if "--servidor" in argv:
        puerto = int(argv[argv.index("--puerto") + 1]) if "--puerto" in argv else 7792
        if puerto == 7777:
            print("el 7777 es del juego")
            return 2
        raiz = argv[argv.index("--carpeta") + 1] if "--carpeta" in argv else tempfile.mkdtemp(prefix="oo_prueba_refs_")
        prueba_servidor(viejo, nuevo, cols, info, puerto, raiz)
        print("carpeta de la prueba:", raiz)
    print("fallos=%d" % fallos)
    return 0 if fallos == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
