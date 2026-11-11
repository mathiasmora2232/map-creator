"""(2.1) Referencias del usuario a piezas del mapa: comprobación y migración cuando mapa_<mapa>.json se regenera.

Los datos del editor nombran las piezas del mapa original por su ÍNDICE en mapa_<mapa>.json (`ref`, `p<i>`…). Cuando el mapa se vuelve
a exportar (Godot → Generado/<Mapa>/Mapa<Mapa>.cs → herramientas/exportar_mapa_web.py) y cambian piezas en medio, los índices se corren
y las ediciones caen sobre otras piezas. Pasó el 4/11/2026: el Complejo pasó de 20 312 a 21 556 piezas (alrededores: 3293 quitadas y
4537 nuevas) y el JSON para el juego de la 2.1.2 se generó con el mapa nuevo y los índices viejos: 659 de las 685 piezas editadas
cayeron en otras (la caja maciza de la administración que el usuario había borrado siguió en el juego).

COORDENADAS: el JSON del mapa está en ejes de Unity; el editor (y el `antes` de cada documento) usa x, y, −z y el cuaternión
(−qx, −qy, qz, qw). Comparar `antes` con el JSON sin invertir z da 25-250 m de diferencia aunque todo esté bien.

Cada documento de pieza guarda en `antes` cómo era la pieza (posición, tamaño, giro): es la prueba de a qué pieza se refiere. Para
migrar se resuelve cada índice usado así:
  1) si hay mapa viejo (el `_base_mapa_<mapa>.json` de la carpeta de datos) y `antes` casa con la pieza vieja, la pieza nueva con su
     misma FIRMA (tipo, sección, grupo, posición, tamaño, giro, material y malla; emparejar());
  2) si `antes` ya casa con la pieza nueva del mismo índice, se queda;
  3) si no, la pieza del mapa nuevo que está exactamente donde dice `antes` (2 cm, mismo tamaño y giro).
  Las referencias sin `antes` (puertas en paredes originales, rellenos, miembros de grupos, letreros) siguen el modo de la mayoría.
Lo que no se resuelve (pieza que ya no existe o que cambió) NO se apunta a otra: el documento (o la parte que nombra esa pieza) se
aparta a `sin_pieza.json` con su firma vieja, y se lista. Después de migrar se comprueba que todos los `antes` casan; si no, no se
escribe nada.

Lo usa servidor.py solo (guarda en la carpeta de datos `_base_mapa_<mapa>.json` y migra con respaldo cuando el mapa cambia) y se puede
usar a mano (sin --escribir solo cuenta; con --escribir hace respaldo en <datos>/respaldos_refs/<fecha>_<mapa>/ antes):

  python -I migrar_refs.py --nuevo mapa_complejo.json --datos carpeta [--viejo mapa_viejo.json] [--escribir]

Qué referencias se migran (de los documentos del mapa en cuestión):
  - cambios y los documentos guardados en cada versión de `versiones`: `ref` (número o lista), `antes.piezas[].ref`,
    `datos.piezas[].ref`, `datos.muro` numérico (puerta, ventana o hueco en una pared original), `datos.relleno.refs` y el id del
    documento (`m-`/`pr-<mapa>-p<i>`, `-s<hash de los refs>`, `-g<grupo>`), igual que los calcula editor.js;
  - grupos: `miembros` "p<i>";
  - etiquetas: `base` "txt:<i>" (letrero del mapa con nombre propio).
Comprobar una carpeta en segundos: verificar_refs.py.
"""
import bisect
import collections
import copy
import hashlib
import json
import math
import os
import re
import shutil
import sys
import time

COLECCIONES = ("cambios", "versiones", "grupos", "etiquetas")
APARTADOS = "sin_pieza"  # colección (no la carga el editor) con lo que nombraba piezas que ya no existen
_ID_PIEZA = re.compile(r"^(m|pr|nt)-(.+)-([psg])([0-9a-z]+)$")


# ------------------------------------------------------------------ firmas y emparejado
def _nombre(lista, i):
    return lista[i] if isinstance(i, int) and 0 <= i < len(lista) else ""


def _pos(a):
    """Posición para comparar: el pivote de las mallas reales (formato 2), que no depende de los límites de la malla."""
    if a[0] == 1 and len(a) >= 23 and isinstance(a[16], int) and a[16] >= 0:
        return (a[17], a[18], a[19])
    return (a[3], a[4], a[5])


def firma(d, a):
    return (a[0], _nombre(d["secciones"], a[1]), _nombre(d["grupos"], a[2]), tuple(round(v, 3) for v in a[3:13]),
            _nombre([m[0] for m in d["materiales"]], a[13]), _nombre(d["nombres"], a[15]))


def describir(d, i):
    """Texto corto para listar una pieza a una persona: sección, malla o material, posición en coordenadas del editor y tamaño."""
    if not d or not (0 <= i < len(d["piezas"])):
        return "pieza %s (no existe)" % i
    a = d["piezas"][i]
    tipo = {0: "caja", 1: "malla", 2: "cilindro", 3: "tubo", 4: "bloque", 5: "luz", 6: "letrero", 7: "puerta"}.get(a[0], str(a[0]))
    nom = _nombre(d["nombres"], a[15]) or _nombre([m[0] for m in d["materiales"]], a[13])
    return "%s %s «%s» en (%.2f, %.2f, %.2f) de %.2f × %.2f × %.2f m" % (
        _nombre(d["secciones"], a[1]), tipo, nom, a[3], a[4], -a[5], a[6], a[7], a[8])


def emparejar(viejo, nuevo, metodo=None):
    """{índice viejo: índice nuevo} y la lista de piezas viejas sin pareja. `metodo` (dict opcional) recibe cómo se emparejó cada una.
    1) firma exacta (las repetidas, por orden); 2) la misma sin el grupo (cambió el número del grupo: foco_4 → foco_6) si es única;
    3) mismo tipo, sección, material y malla, mismo giro y a menos de 5 cm (los límites de una malla reexportada cambian el tamaño);
    4) mismo tipo y sección a menos de 10 cm. Ninguna pieza nueva se usa dos veces."""
    met = metodo if metodo is not None else {}
    idx = collections.defaultdict(list)
    idx2 = collections.defaultdict(list)
    for i, a in enumerate(nuevo["piezas"]):
        f = firma(nuevo, a)
        idx[f].append(i)
        idx2[(f[0], f[1], f[3], f[4], f[5])].append(i)
    m, usados, tomados, resto = {}, collections.Counter(), set(), []
    for i, a in enumerate(viejo["piezas"]):
        f = firma(viejo, a)
        lista = idx.get(f)
        if lista and usados[f] < len(lista):
            m[i] = lista[usados[f]]
            met[i] = "firma" if len(lista) == 1 else "firma repetida (por orden)"
            usados[f] += 1
            tomados.add(m[i])
        else:
            resto.append(i)
    perdidas = []
    for i in resto:
        f = firma(viejo, viejo["piezas"][i])
        g = [j for j in idx2.get((f[0], f[1], f[3], f[4], f[5]), []) if j not in tomados]
        if len(g) == 1:
            m[i] = g[0]
            met[i] = "firma sin el grupo"
            tomados.add(g[0])
        else:
            perdidas.append(i)
    if perdidas:
        celdas = collections.defaultdict(list)
        for j, b in enumerate(nuevo["piezas"]):
            if j not in tomados:
                p = _pos(b)
                celdas[(round(p[0]), round(p[1]), round(p[2]))].append(j)
        for pasada in (3, 4):
            quedan = []
            for i in perdidas:
                a = viejo["piezas"][i]
                fa = firma(viejo, a)
                pa = _pos(a)
                mejor, dmin = None, 0.05 if pasada == 3 else 0.1
                cx, cy, cz = round(pa[0]), round(pa[1]), round(pa[2])
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for dz in (-1, 0, 1):
                            for j in celdas.get((cx + dx, cy + dy, cz + dz), ()):
                                if j in tomados:
                                    continue
                                b = nuevo["piezas"][j]
                                fb = firma(nuevo, b)
                                if fb[0] != fa[0] or fb[1] != fa[1]:
                                    continue
                                if pasada == 3 and (fb[4] != fa[4] or fb[5] != fa[5] or fb[3][6:10] != fa[3][6:10]):
                                    continue
                                dd = math.dist(pa, _pos(b))
                                if dd < dmin:
                                    mejor, dmin = j, dd
                if mejor is not None:
                    m[i] = mejor
                    met[i] = "a menos de 5 cm" if pasada == 3 else "a menos de 10 cm (aproximada)"
                    tomados.add(mejor)
                else:
                    quedan.append(i)
            perdidas = quedan
    return m, perdidas


# ------------------------------------------------------------------ referencias de los documentos
def _es_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer()


def _lista_refs(r):
    if r is None:
        return []
    return [int(x) for x in (r if isinstance(r, list) else [r]) if _es_num(x)]


def hash_refs(refs):
    """El mismo hash que hashRefs() de editor.js (id de los documentos de varias piezas: m-<mapa>-s<hash>)."""
    s = ",".join(str(x) for x in sorted(refs))
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    dig = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        out = dig[h % 36] + out
        h //= 36
        if not h:
            break
    return out + "x" + str(len(refs))


def mapa_de(doc):
    """El mapa al que se refieren las piezas que nombra el documento (o None si no nombra piezas del mapa)."""
    if not isinstance(doc, dict):
        return None
    if isinstance(doc.get("docs"), dict):  # una versión: sus documentos
        for x in doc["docs"].values():
            if mapa_de(x):
                return doc.get("mapa") or mapa_de(x)
        return None
    if doc.get("ref") is not None:
        return doc.get("mapa")
    d = doc.get("datos") if isinstance(doc.get("datos"), dict) else {}
    if _es_num(d.get("muro")):
        return doc.get("mapa")
    rel = d.get("relleno")
    if isinstance(rel, dict) and rel.get("refs"):
        return doc.get("mapa")
    if any(isinstance(k, str) and re.match(r"^p\d+$", k) for k in (doc.get("miembros") or [])):
        return doc.get("mapa")
    if isinstance(doc.get("base"), str) and doc["base"].startswith("txt:"):
        return doc.get("mapa")
    return None


def entradas_antes(doc):
    """(ref, antes) de un documento de pieza (antes = transformación original en coordenadas del editor) o (ref, None)."""
    refs = doc.get("ref")
    antes = doc.get("antes") if isinstance(doc.get("antes"), dict) else {}
    if isinstance(refs, list):
        pz = {p.get("ref"): p for p in (antes.get("piezas") or []) if isinstance(p, dict)}
        return [(int(r), pz.get(r)) for r in refs if _es_num(r)]
    if _es_num(refs):
        return [(int(refs), antes if "x" in antes else None)]
    return []


def documentos(cols, mapa):
    """(colección, id de versión o None, id, doc) de cada documento del mapa, también los guardados dentro de las versiones."""
    for col in COLECCIONES:
        for id_doc, doc in (cols.get(col) or {}).items():
            if not isinstance(doc, dict) or doc.get("mapa") != mapa:
                continue
            if col == "versiones":
                for id2, d2 in (doc.get("docs") or {}).items() if isinstance(doc.get("docs"), dict) else ():
                    if isinstance(d2, dict) and d2.get("mapa") == mapa:
                        yield col, id_doc, id2, d2
            else:
                yield col, None, id_doc, doc


def refs_doc(doc):
    """Índices de pieza que nombra un documento (sin repetir)."""
    out = set(_lista_refs(doc.get("ref")))
    for k in ("antes", "datos"):
        v = doc.get(k)
        if isinstance(v, dict):
            for p in v.get("piezas") or []:
                if isinstance(p, dict):
                    out.update(_lista_refs(p.get("ref")))
    d = doc.get("datos") if isinstance(doc.get("datos"), dict) else {}
    if _es_num(d.get("muro")):
        out.add(int(d["muro"]))
    if isinstance(d.get("relleno"), dict):
        out.update(_lista_refs(d["relleno"].get("refs")))
    for k in doc.get("miembros") or []:
        if isinstance(k, str) and re.match(r"^p\d+$", k):
            out.add(int(k[1:]))
    if isinstance(doc.get("base"), str) and re.match(r"^txt:\d+$", doc["base"]):
        out.add(int(doc["base"][4:]))
    return out


def refs_usadas(cols, mapa):
    """Índices de pieza que usan los datos (cambios, versiones, grupos y etiquetas)."""
    out = set()
    for _c, _v, _i, doc in documentos(cols, mapa):
        out |= refs_doc(doc)
    return out


# ------------------------------------------------------------------ comprobar con `antes`
def _pieza_editor(a):
    """Posición, tamaño (las que tienen) y cuaternión de una pieza del JSON (coordenadas de Unity) en coordenadas del editor."""
    q = (-a[9], -a[10], a[11], a[12])
    return (a[3], a[4], -a[5]), ((a[6], a[7], a[8]) if a[0] <= 4 else None), q


def casa_antes(a, antes, tol=0.02):
    """¿La pieza `a` del JSON es la que describe `antes`? None si `antes` no tiene posición."""
    if not isinstance(antes, dict) or not all(isinstance(antes.get(k), (int, float)) for k in ("x", "y", "z")):
        return None
    p, s, q = _pieza_editor(a)
    if math.dist(p, (antes["x"], antes["y"], antes["z"])) > tol:
        return False
    if s is not None and all(isinstance(antes.get(k), (int, float)) for k in ("sx", "sy", "sz")):
        if max(abs(s[0] - antes["sx"]), abs(s[1] - antes["sy"]), abs(s[2] - antes["sz"])) > tol:
            return False
    qa = antes.get("q")
    if isinstance(qa, list) and len(qa) == 4 and a[0] not in (2, 3, 5):
        n = math.sqrt(sum(v * v for v in q)) or 1.0
        if abs(sum(qa[k] * q[k] / n for k in range(4))) < 0.999:
            return False
    return True


def revisar_antes(cols, d):
    """Cada (colección, versión, id, ref, antes, casa) de las referencias con `antes` contra el mapa `d` (casa: True, False o None)."""
    P = d["piezas"]
    out = []
    for col, ver, id_doc, doc in documentos(cols, d.get("mapa")):
        if col not in ("cambios", "versiones"):
            continue
        for r, antes in entradas_antes(doc):
            c = casa_antes(P[r], antes) if 0 <= r < len(P) else (False if antes is not None else None)
            out.append((col, ver, id_doc, r, antes, c))
    return out


def comprobar_antes(cols, d, solo_cambios=False):
    """Cuántas referencias con `antes` casan con la pieza a la que apuntan en el mapa `d` (ok, mal, sin_antes)."""
    ok = mal = sin = 0
    for col, _v, _i, _r, _a, c in revisar_antes(cols, d):
        if solo_cambios and col != "cambios":
            continue
        if c is None:
            sin += 1
        elif c:
            ok += 1
        else:
            mal += 1
    return ok, mal, sin


def _contiene(a, punto, margen=0.3):
    """¿El punto (coordenadas del editor) cae dentro de la caja de la pieza `a` (con margen)? Para las paredes de los huecos."""
    if a[0] > 4:
        return False
    p, s, q = _pieza_editor(a)
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = -x / n, -y / n, -z / n, w / n  # inverso: lleva el punto a los ejes de la pieza
    v = (punto[0] - p[0], punto[1] - p[1], punto[2] - p[2])
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    loc = (v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx))
    return abs(loc[0]) <= s[0] / 2 + margen and abs(loc[2]) <= s[2] / 2 + margen and abs(loc[1]) <= s[1] / 2 + 1.5


def _celdas(d):
    celdas = collections.defaultdict(list)
    for j, a in enumerate(d["piezas"]):
        p = _pieza_editor(a)[0]
        celdas[(round(p[0]), round(p[1]), round(p[2]))].append(j)
    return celdas


def _buscar_antes(d, celdas, antes, cerca):
    cx, cy, cz = round(antes["x"]), round(antes["y"]), round(antes["z"])
    cand = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1)
            for j in celdas.get((cx + dx, cy + dy, cz + dz), ()) if casa_antes(d["piezas"][j], antes)]
    return min(cand, key=lambda k: abs(k - cerca)) if cand else None


def resolver(cols, mapa, nuevo, viejo=None):
    """Decide a qué pieza de `nuevo` va cada índice que usan los datos. Devuelve un informe:
    {m: {índice: índice nuevo}, sin: [índices sin pieza], metodo: {índice: cómo}, modo: 'viejo'|'nuevo'|'mezcla', conflictos: […]}."""
    P = nuevo["piezas"]
    V = viejo["piezas"] if viejo else None
    mf, met_f = ({}, {})
    if viejo is not None:
        mf, _ = emparejar(viejo, nuevo, met_f)
    ant = collections.defaultdict(list)
    for col, _v, _i, doc in documentos(cols, mapa):
        if col in ("cambios", "versiones"):
            for r, a in entradas_antes(doc):
                if a is not None:
                    ant[r].append(a)
    usadas = refs_usadas(cols, mapa)
    celdas = None
    m, metodo, conflictos = {}, {}, []
    votos = collections.Counter()
    for r in sorted(ant):
        opciones = set()
        como = set()
        for a in ant[r]:
            cv = V is not None and 0 <= r < len(V) and r in mf and casa_antes(V[r], a)
            cn = 0 <= r < len(P) and casa_antes(P[r], a)
            if cv and cn and mf[r] == r:
                opciones.add(r)
                como.add("ambos")  # la pieza no se movió en la lista: no dice nada de con qué mapa se hicieron los datos
            elif cv:
                opciones.add(mf[r])
                como.add("viejo")
            elif cn:
                opciones.add(r)
                como.add("nuevo")
            else:
                if celdas is None:
                    celdas = _celdas(nuevo)
                j = _buscar_antes(nuevo, celdas, a, r)
                opciones.add(j)
                como.add("posicion")
        if len(opciones) == 1 and None not in opciones:
            j = opciones.pop()
            m[r] = j
            c = como.pop() if len(como) == 1 else "mezcla"
            metodo[r] = {"viejo": "firma (" + met_f.get(r, "?") + ")", "nuevo": "ya casaba", "ambos": "igual en los dos mapas",
                         "posicion": "por posición de `antes`"}.get(c, c)
            votos[c] += 1
        else:
            conflictos.append(r)
    v, n, p = votos["viejo"], votos["nuevo"], votos["posicion"]
    if v and not n and not p:
        modo = "viejo"
    elif n and not v and not p:
        modo = "nuevo"
    elif not (v or n or p):
        modo = "viejo" if viejo is not None else "nuevo"
    else:
        modo = "mezcla"
    # Referencias sin `antes`: siguen el modo de los datos. Con el mapa viejo y datos del mapa viejo, su firma; con datos del mapa nuevo,
    # el mismo índice; si no, si las resueltas más cercanas por debajo y por encima se corrieron lo mismo, entre ellas no se quitó ni se
    # añadió nada y se corre igual. Las paredes originales de puertas, ventanas y huecos se comprueban además con su posición: la pared
    # elegida tiene que contener el hueco (si no, se prueba con las otras candidatas).
    pistas = collections.defaultdict(list)
    for col, _v, _i, doc in documentos(cols, mapa):
        d = doc.get("datos") if isinstance(doc.get("datos"), dict) else {}
        if _es_num(d.get("muro")) and all(isinstance(d.get(k), (int, float)) for k in ("x", "z")):
            pistas[int(d["muro"])].append((d["x"], float(d.get("y") or 0) + float(d.get("sy") or 0) / 2, d["z"]))
    claves = sorted(m)
    for u in sorted(i for i in usadas if i not in m and i not in conflictos):
        cand = []
        if modo == "viejo" and u in mf:
            cand.append((mf[u], "firma (" + met_f.get(u, "?") + "), sin `antes`"))
        if modo == "nuevo" and 0 <= u < len(P):
            cand.append((u, "ya casaba (sin `antes`)"))
        k = bisect.bisect_left(claves, u)
        if 0 < k < len(claves) and m[claves[k - 1]] - claves[k - 1] == m[claves[k]] - claves[k]:
            cand.append((u + m[claves[k]] - claves[k], "interpolada entre vecinas (sin `antes`)"))
        if u in pistas:
            for j, como in ((u, "mismo índice"), (mf.get(u), "firma")):
                if j is not None and all(c[0] != j for c in cand):
                    cand.append((j, como + " (sin `antes`)"))
            cand = [(j, como + ", contiene su hueco") for j, como in cand
                    if 0 <= j < len(P) and all(_contiene(P[j], pt) for pt in pistas[u])]
        if cand:
            m[u], metodo[u] = cand[0]
    # Dos índices viejos en la misma pieza nueva: ninguno de los dos está claro.
    cuenta = collections.Counter(m.values())
    for r in [r for r, j in m.items() if cuenta[j] > 1]:
        conflictos.append(r)
        m.pop(r)
    sin = sorted(i for i in usadas if i not in m)
    return {"m": m, "sin": sin, "metodo": metodo, "modo": modo, "conflictos": sorted(set(conflictos)), "usadas": len(usadas),
            "votos": dict(votos)}


def emparejar_por_antes(cols, nuevo):
    """(compatibilidad) resolver() sin mapa viejo: ({índice: índice nuevo}, índices sin resolver)."""
    r = resolver(cols, nuevo.get("mapa"), nuevo)
    return r["m"], r["sin"]


# ------------------------------------------------------------------ reescribir
def _grupo_nuevo(g, viejo, nuevo, m):
    for i, a in enumerate(viejo["piezas"]):
        if a[2] == g and i in m:
            return nuevo["piezas"][m[i]][2]
    return None


def _nuevo_id(id_doc, refs_viejos, doc, mapa, m, viejo, nuevo):
    """Id del documento con los índices nuevos, como lo calcularía editor.js (claveOrig). Los «s<hash>» solo se renombran si el id
    casaba con sus refs viejos (un documento al que luego se le añadieron piezas conserva su id: el editor tampoco lo recalcula)."""
    mm = _ID_PIEZA.match(id_doc)
    if not mm or mm.group(2) != mapa:
        return id_doc
    pre, clase, resto = mm.group(1), mm.group(3), mm.group(4)
    refs = _lista_refs(doc.get("ref")) if isinstance(doc, dict) else []
    if clase == "p" and resto.isdigit():
        i = int(resto)
        return "%s-%s-p%d" % (pre, mapa, m.get(i, i))
    if clase == "s" and refs and refs_viejos and resto == hash_refs(refs_viejos):
        return "%s-%s-s%s" % (pre, mapa, hash_refs(refs))
    if clase == "g" and resto.isdigit() and viejo is not None:
        g = _grupo_nuevo(int(resto), viejo, nuevo, m)
        return "%s-%s-g%d" % (pre, mapa, g) if g is not None and g >= 0 else id_doc
    return id_doc


def _quitar_perdidas(doc, m):
    """Quita del documento lo que nombra piezas sin pareja. Devuelve (doc o None si no queda nada útil, índices quitados)."""
    perdidas = sorted(i for i in refs_doc(doc) if i not in m)
    if not perdidas:
        return doc, []
    fuera = set(perdidas)
    r = doc.get("ref")
    if _es_num(r) and int(r) in fuera:
        return None, perdidas
    if isinstance(doc.get("base"), str) and re.match(r"^txt:\d+$", doc["base"]) and int(doc["base"][4:]) in fuera:
        return None, perdidas
    if isinstance(r, list):
        doc["ref"] = [x for x in r if not (_es_num(x) and int(x) in fuera)]
        if not doc["ref"]:
            return None, perdidas
    for k in ("antes", "datos"):
        v = doc.get(k)
        if isinstance(v, dict) and isinstance(v.get("piezas"), list):
            v["piezas"] = [p for p in v["piezas"] if not (isinstance(p, dict) and _es_num(p.get("ref")) and int(p["ref"]) in fuera)]
    d = doc.get("datos") if isinstance(doc.get("datos"), dict) else None
    if d is not None:
        if _es_num(d.get("muro")) and int(d["muro"]) in fuera:
            d["muro"] = None  # la pared original ya no existe: la puerta o el hueco quedan sueltos
        rel = d.get("relleno")
        if isinstance(rel, dict) and isinstance(rel.get("refs"), list):
            rel["refs"] = [x for x in rel["refs"] if not (_es_num(x) and int(x) in fuera)]
    if isinstance(doc.get("miembros"), list):
        doc["miembros"] = [k for k in doc["miembros"] if not (isinstance(k, str) and re.match(r"^p\d+$", k) and int(k[1:]) in fuera)]
        if not doc["miembros"]:
            return None, perdidas
    return doc, perdidas


def _migrar_doc(doc, m, est):
    """Cambia los índices de un documento en su sitio (todos sus índices tienen pareja en `m`)."""
    def tr(i):
        i = int(i)
        if m[i] != i:
            est["cambiadas"] += 1
        else:
            est["iguales"] += 1
        return m[i]

    r = doc.get("ref")
    if isinstance(r, list):
        doc["ref"] = [tr(x) if _es_num(x) else x for x in r]
    elif _es_num(r):
        doc["ref"] = tr(r)
    for k in ("antes", "datos"):
        v = doc.get(k)
        if isinstance(v, dict) and isinstance(v.get("piezas"), list):
            for p in v["piezas"]:
                if isinstance(p, dict) and _es_num(p.get("ref")):
                    p["ref"] = tr(p["ref"])
    d = doc.get("datos") if isinstance(doc.get("datos"), dict) else None
    if d is not None:
        if _es_num(d.get("muro")):
            d["muro"] = tr(d["muro"])
        rel = d.get("relleno")
        if isinstance(rel, dict) and isinstance(rel.get("refs"), list):
            rel["refs"] = sorted(tr(x) if _es_num(x) else x for x in rel["refs"])
    if isinstance(doc.get("miembros"), list):
        doc["miembros"] = ["p%d" % tr(k[1:]) if isinstance(k, str) and re.match(r"^p\d+$", k) else k for k in doc["miembros"]]
    b = doc.get("base")
    if isinstance(b, str) and re.match(r"^txt:\d+$", b):
        doc["base"] = "txt:%d" % tr(b[4:])
    return doc


def _migrar_dict(docs, col, version, mapa, m, viejo, nuevo, est):
    """Documentos {id: doc} → diccionario nuevo con los índices y los ids nuevos (mismo orden). Lo que nombraba piezas sin pareja va
    a est['apartados'] con el documento original entero."""
    out = {}
    for id_doc, doc in docs.items():
        if not isinstance(doc, dict) or doc.get("mapa") != mapa or not refs_doc(doc):
            if id_doc in out:
                est["choques"].append(id_doc)
            out[id_doc] = doc
            continue
        original = copy.deepcopy(doc)
        viejos = _lista_refs(doc.get("ref"))
        doc, perdidas = _quitar_perdidas(doc, m)
        if perdidas:
            est["apartados"].append({"coleccion": col, "version": version, "id": id_doc, "mapa": mapa, "refs_viejas": perdidas,
                                     "piezas_viejas": [describir(viejo, i) for i in perdidas] if viejo else None,
                                     "entero": doc is None, "documento": original})
        if doc is None:
            continue
        _migrar_doc(doc, m, est)
        nid = _nuevo_id(id_doc, viejos, doc, mapa, m, viejo, nuevo)
        if nid != id_doc:
            est["renombrados"] += 1
        if nid in out:
            est["choques"].append(nid)
            nid = id_doc if id_doc not in out else nid + "~" + str(len(out))
        out[nid] = doc
    return out


def migrar(cols, mapa, m, viejo=None, nuevo=None):
    """Reescribe las referencias de las colecciones `cols` ({nombre: {id: doc}}) con `m` ({índice: índice nuevo}). Lo que nombra
    índices fuera de `m` se aparta (nunca se deja apuntando a otra pieza). Devuelve (colecciones nuevas, informe)."""
    est = {"cambiadas": 0, "iguales": 0, "choques": [], "renombrados": 0, "apartados": []}
    out = {}
    for col, docs in cols.items():
        if col not in COLECCIONES or not isinstance(docs, dict):
            continue
        docs = copy.deepcopy(docs)
        if col == "versiones":
            nd = {}
            for id_v, v in docs.items():
                if isinstance(v, dict) and v.get("mapa") == mapa and isinstance(v.get("docs"), dict):
                    v["docs"] = _migrar_dict(v["docs"], col, id_v, mapa, m, viejo, nuevo, est)
                nd[id_v] = v
            out[col] = nd
        else:
            out[col] = _migrar_dict(docs, col, None, mapa, m, viejo, nuevo, est)
    return out, est


def plan(cols, mapa, nuevo, viejo=None):
    """Resolución + migración en memoria + comprobación. Devuelve un informe con `nuevas` (colecciones migradas) y `valida`: True si
    después de migrar todos los `antes` casan con el mapa nuevo (si no, no hay que escribir nada)."""
    res = resolver(cols, mapa, nuevo, viejo)
    nuevas, est = migrar(cols, mapa, res["m"], viejo, nuevo)
    ok, mal, sin = comprobar_antes(nuevas, nuevo)
    identidad = not res["sin"] and all(j == i for i, j in res["m"].items())
    return {"res": res, "est": est, "nuevas": nuevas, "despues": (ok, mal, sin), "valida": mal == 0, "identidad": identidad,
            "antes_nuevo": comprobar_antes(cols, nuevo), "antes_viejo": comprobar_antes(cols, viejo) if viejo else None}


# ------------------------------------------------------------------ carpetas de datos
def version_archivo(ruta):
    """Versión de un JSON de mapa: sha1 corto de sus bytes (la que usa servidor.py en X-OO-Version-Mapa)."""
    try:
        with open(ruta, "rb") as f:
            return hashlib.sha1(f.read()).hexdigest()[:16]
    except OSError:
        return None


def cargar_datos(carpeta):
    cols = {}
    for col in COLECCIONES + (APARTADOS,):
        ruta = os.path.join(carpeta, col + ".json")
        docs = {}
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as f:
                docs = json.load(f)
        diario = os.path.join(carpeta, col + ".diario.jsonl")
        if os.path.exists(diario):
            with open(diario, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea:
                        continue
                    try:
                        e = json.loads(linea)
                    except ValueError:
                        break
                    if e.get("data") is None:
                        docs.pop(e.get("id"), None)
                    else:
                        docs[e.get("id")] = e["data"]
        cols[col] = docs
    return cols


def respaldar(carpeta, mapa, ruta_viejo=None):
    """Copia las colecciones (y su diario) y el mapa viejo en <carpeta>/respaldos_refs/<fecha>_<mapa>/. Devuelve la ruta."""
    destino = os.path.join(carpeta, "respaldos_refs", time.strftime("%Y%m%d_%H%M%S") + "_" + mapa)
    os.makedirs(destino, exist_ok=True)
    for col in COLECCIONES + (APARTADOS,):
        for nombre in (col + ".json", col + ".diario.jsonl"):
            if os.path.exists(os.path.join(carpeta, nombre)):
                shutil.copy2(os.path.join(carpeta, nombre), os.path.join(destino, nombre))
    if ruta_viejo and os.path.exists(ruta_viejo):
        shutil.copy2(ruta_viejo, os.path.join(destino, "mapa_viejo_%s.json" % mapa))
    return destino


def apartados_como_docs(est, version_nueva):
    """Entradas para la colección sin_pieza ({id: entrada}), con la fecha y la versión del mapa nuevo."""
    fecha = time.strftime("%Y-%m-%dT%H:%M:%S")
    out = {}
    for k, a in enumerate(est["apartados"]):
        clave = "%s-%s-%s%s" % (a["mapa"], time.strftime("%Y%m%d%H%M%S"), a["id"], ("-" + a["version"]) if a["version"] else "")
        out[clave if clave not in out else clave + "-" + str(k)] = dict(a, fecha=fecha, version_mapa=version_nueva)
    return out


def informe_texto(p, viejo, nuevo):
    res, est = p["res"], p["est"]
    lin = ["referencias usadas %d; resueltas %d (%s); sin pieza %d; conflictos %d; modo de los datos: %s" % (
        res["usadas"], len(res["m"]), ", ".join("%s %d" % kv for kv in collections.Counter(res["metodo"].values()).most_common()),
        len(res["sin"]), len(res["conflictos"]), res["modo"])]
    lin.append("antes de migrar, `antes` contra el mapa nuevo (casan, no casan, sin antes): %s%s" % (
        p["antes_nuevo"], ("; contra el viejo: %s" % (p["antes_viejo"],)) if p["antes_viejo"] else ""))
    lin.append("migración: %d índices cambiados, %d iguales, %d documentos renombrados, %d choques de id, %d apartados" % (
        est["cambiadas"], est["iguales"], est["renombrados"], len(est["choques"]), len(est["apartados"])))
    lin.append("después: `antes` contra el mapa nuevo (casan, no casan, sin antes): %s → %s" % (
        p["despues"], "VÁLIDA" if p["valida"] else "NO VÁLIDA: no se escribe"))
    for a in est["apartados"][:40]:
        lin.append("  apartado %s%s %s: %s" % (a["coleccion"], ("/" + a["version"]) if a["version"] else "", a["id"],
                                             "; ".join(a["piezas_viejas"] or [str(x) for x in a["refs_viejas"]])))
    return "\n".join(lin)


def _main(argv):
    def arg(n, d=None):
        return argv[argv.index("--" + n) + 1] if "--" + n in argv else d
    if not arg("nuevo") or not arg("datos"):
        print(__doc__)
        return 2
    with open(arg("nuevo"), encoding="utf-8") as f:
        nuevo = json.load(f)
    carpeta = arg("datos")
    cols = cargar_datos(carpeta)
    mapa = nuevo["mapa"]
    ruta_viejo = arg("viejo")
    if not ruta_viejo and os.path.exists(os.path.join(carpeta, "_base_mapa_%s.json" % mapa)):
        ruta_viejo = os.path.join(carpeta, "_base_mapa_%s.json" % mapa)
        print("mapa viejo: la copia de la carpeta de datos (%s)" % ruta_viejo)
    viejo = None
    if ruta_viejo:
        with open(ruta_viejo, encoding="utf-8") as f:
            viejo = json.load(f)
    p = plan({c: cols[c] for c in COLECCIONES}, mapa, nuevo, viejo)
    print(informe_texto(p, viejo, nuevo))
    if "--escribir" not in argv:
        return 0 if p["valida"] else 1
    if not p["valida"]:
        print("No se escribe nada: la migración dejaría referencias que no casan.")
        return 1
    if p["identidad"]:
        print("Nada que migrar: los índices ya son los del mapa nuevo.")
    else:
        destino = respaldar(carpeta, mapa, ruta_viejo)
        print("respaldo en", destino)
        for col, docs in p["nuevas"].items():
            ruta = os.path.join(carpeta, col + ".json")
            if not docs and not os.path.exists(ruta):
                continue
            tmp = ruta + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(docs, f, ensure_ascii=False, indent=1, sort_keys=True)
            os.replace(tmp, ruta)
            d = os.path.join(carpeta, col + ".diario.jsonl")
            if os.path.exists(d):
                os.remove(d)
        if p["est"]["apartados"]:
            ap = dict(cols.get(APARTADOS) or {})
            ap.update(apartados_como_docs(p["est"], version_archivo(arg("nuevo"))))
            with open(os.path.join(carpeta, APARTADOS + ".json"), "w", encoding="utf-8") as f:
                json.dump(ap, f, ensure_ascii=False, indent=1, sort_keys=True)
    shutil.copyfile(arg("nuevo"), os.path.join(carpeta, "_base_mapa_%s.json" % mapa))
    print("escrito en", carpeta)
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
