"""(2.1) ¿Casan las referencias a piezas de una carpeta de datos del editor con el mapa actual? En segundos y sin escribir nada.

  python -I herramientas/editor_mapa/verificar_refs.py [carpeta de datos] [--mapa complejo|parqueadero] [--mapas carpeta] [--lista 20] [--json]
                                                       [--base mapa_viejo.json]   (otra copia vieja del mapa, p. ej. la de un respaldo)

Por defecto la carpeta es herramientas/editor_mapa/datos_usuario y los mapas los de herramientas/editor_mapa (mapa_<mapa>.json).
Para cada mapa dice:
  - si la copia del mapa con la que casan los datos (`_base_mapa_<mapa>.json`, la guarda servidor.py) es el mapa actual;
  - cuántas referencias con `antes` (cambios y versiones guardadas) casan con la pieza a la que apuntan, cuántas no y, de las que no,
    cuántas casarían con la copia vieja (falta migrar) o con nada;
  - documentos cuyo id no corresponde con su pieza, miembros de grupo y paredes fuera del mapa.
Recuerda: el `antes` está en coordenadas del editor (x, y, −z del JSON del mapa, que está en ejes de Unity).
Código de salida: 0 todo casa; 1 hay referencias que no casan (no edites ni envíes al juego: reinicia el servidor del editor, que migra
con respaldo, o usa migrar_refs.py); 2 error de uso.
"""
import collections
import json
import math
import os
import re
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import migrar_refs as mr  # noqa: E402


def _cargar(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def revisar(carpeta, mapa, ruta_mapa, lista=20, ruta_base=None):
    nuevo = _cargar(ruta_mapa)
    P = nuevo["piezas"]
    cols = mr.cargar_datos(carpeta)
    ruta_base = ruta_base or os.path.join(carpeta, "_base_mapa_%s.json" % mapa)
    v_mapa = mr.version_archivo(ruta_mapa)
    v_base = mr.version_archivo(ruta_base)
    base = _cargar(ruta_base) if v_base and v_base != v_mapa else None
    filas = mr.revisar_antes(cols, nuevo)
    ok = sum(1 for f in filas if f[5] is True)
    sin = sum(1 for f in filas if f[5] is None)
    malas = [f for f in filas if f[5] is False]
    con_base = 0
    for f in malas:
        if base is not None and 0 <= f[3] < len(base["piezas"]) and mr.casa_antes(base["piezas"][f[3]], f[4]):
            con_base += 1
    usadas = mr.refs_usadas(cols, mapa)
    fuera = sorted(i for i in usadas if not 0 <= i < len(P))
    ids_mal = []
    for col, ver, id_doc, doc in mr.documentos(cols, mapa):
        mm = re.match(r"^(m|pr|nt)-%s-p(\d+)$" % re.escape(mapa), id_doc)
        if mm and mr._es_num(doc.get("ref")) and int(doc["ref"]) != int(mm.group(2)):
            ids_mal.append((col, ver, id_doc, doc.get("ref")))
    apartados = [a for a in (cols.get(mr.APARTADOS) or {}).values() if isinstance(a, dict) and a.get("mapa") == mapa]
    docs_mapa = sum(1 for _ in mr.documentos(cols, mapa))
    return {"mapa": mapa, "carpeta": carpeta, "version_mapa": v_mapa, "piezas": len(P), "version_base": v_base,
            "base": "igual" if v_base == v_mapa else ("distinta" if v_base else "sin copia"),
            "documentos": docs_mapa, "referencias_usadas": len(usadas), "antes_casan": ok, "antes_no_casan": len(malas),
            "sin_antes": sin, "no_casan_pero_casan_con_la_copia_vieja": con_base, "fuera_del_mapa": fuera, "ids_que_no_casan": ids_mal,
            "apartados_sin_pieza": len(apartados),
            "ejemplos": [{"coleccion": c, "version": v, "id": i, "ref": r,
                          "antes": [round(a.get(k, 0), 3) for k in ("x", "y", "z")],
                          "pieza_actual": mr.describir(nuevo, r),
                          "distancia": round(math.dist(mr._pieza_editor(P[r])[0], (a["x"], a["y"], a["z"])), 2) if 0 <= r < len(P) else None}
                         for c, v, i, r, a, _ in malas[:lista]]}


def texto(r):
    lin = ["== %s (%s)" % (r["mapa"], r["carpeta"]),
           "  mapa actual %s, %d piezas; copia con la que casan los datos: %s%s" % (
               r["version_mapa"], r["piezas"], r["base"], (" (%s)" % r["version_base"]) if r["version_base"] else ""),
           "  %d documentos, %d piezas nombradas; `antes`: %d casan, %d NO casan, %d sin posición" % (
               r["documentos"], r["referencias_usadas"], r["antes_casan"], r["antes_no_casan"], r["sin_antes"])]
    if r["antes_no_casan"] and r["base"] == "sin copia":
        lin.append("  no hay copia vieja del mapa en la carpeta: el servidor del editor (o migrar_refs.py) las emparejará por su `antes`")
    elif r["antes_no_casan"]:
        lin.append("  de las que no casan, %d sí casan con la copia vieja del mapa: faltó migrar (reinicia el servidor del editor o "
                   "migrar_refs.py --escribir)" % r["no_casan_pero_casan_con_la_copia_vieja"])
        for e in r["ejemplos"]:
            lin.append("    %s%s %s ref %s: antes en %s, ahí está %s (a %s m)" % (
                e["coleccion"], ("/" + e["version"]) if e["version"] else "", e["id"], e["ref"], tuple(e["antes"]), e["pieza_actual"],
                e["distancia"]))
    if r["fuera_del_mapa"]:
        lin.append("  %d índices fuera del mapa: %s" % (len(r["fuera_del_mapa"]), r["fuera_del_mapa"][:20]))
    if r["ids_que_no_casan"]:
        lin.append("  %d documentos con un id «p<i>» que no es su pieza: %s" % (len(r["ids_que_no_casan"]), r["ids_que_no_casan"][:8]))
    if r["apartados_sin_pieza"]:
        lin.append("  %d cambios apartados en %s.json (nombraban piezas que ya no existen)" % (r["apartados_sin_pieza"], mr.APARTADOS))
    if r["base"] == "distinta" and not r["antes_no_casan"]:
        lin.append("  aviso: el mapa cambió desde la copia, pero todo lo comprobable casa (el servidor actualizará la copia al abrir)")
    lin.append("  → " + ("BIEN" if not r["antes_no_casan"] and not r["fuera_del_mapa"] else "MAL: no edites ni envíes al juego hasta migrar"))
    return "\n".join(lin)


def main(argv):
    def arg(n, d=None):
        return argv[argv.index("--" + n) + 1] if "--" + n in argv else d
    con_valor = ("--mapa", "--mapas", "--lista", "--base")
    sueltos = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] not in con_valor)]
    carpeta = sueltos[0] if sueltos else os.path.join(AQUI, "datos_usuario")
    if not os.path.isdir(carpeta):
        print("No existe la carpeta de datos:", carpeta)
        return 2
    mapas_dir = arg("mapas", os.path.join(os.path.dirname(AQUI), "mapas"))
    mapas = [arg("mapa")] if arg("mapa") else ["complejo", "parqueadero"]
    t0 = time.time()
    res, mal = [], False
    for m in mapas:
        ruta = os.path.join(mapas_dir, "mapa_%s.json" % m)
        if not os.path.exists(ruta):
            print("(no hay %s)" % ruta)
            continue
        r = revisar(carpeta, m, ruta, int(arg("lista", 20)), arg("base") if len(mapas) == 1 else None)
        res.append(r)
        mal = mal or bool(r["antes_no_casan"] or r["fuera_del_mapa"])
    if "--json" in argv:
        print(json.dumps(res, ensure_ascii=False, indent=1))
    else:
        for r in res:
            print(texto(r))
        print("(%.1f s)" % (time.time() - t0))
    return 1 if mal else 0


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):  # la consola de Windows (cp1252) no puede con «», ≈, ✓…
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main(sys.argv[1:]))
