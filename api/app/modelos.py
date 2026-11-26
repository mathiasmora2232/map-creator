"""Modelos 3D hechos con piezas simples (caja, cilindro, cono, esfera, cúpula, prisma): de una lista de piezas a un .glb y su miniatura.

Lo usan la herramienta `crear_modelo` (MCP y asistente) y `POST /api/biblioteca/modelos`. Sin dependencias: mallas, glTF binario y una
miniatura SVG isométrica (data URL) se calculan aquí en Python.

Pieza: {"forma": "caja"|"cilindro"|"cono"|"esfera"|"cupula"|"prisma", "centro": [x, y, z], "tamano": [ancho X, alto Y, fondo Z],
        "giro": [rx, ry, rz] (grados, orden XYZ), "color": "#rrggbb", "rugosidad": 0–1, "metal": 0–1, "opacidad": 0–1,
        "brillo": true (emite luz con su color), "arriba": 0–1 (solo cilindro: radio de arriba / radio de abajo)}
En metros. El modelo se recoloca con la base en y = 0 y centrado en X y Z, que es como lo coloca el editor.
"""
import base64
import json
import math
import re
import struct

FORMAS = ("caja", "cilindro", "cono", "esfera", "cupula", "prisma")
MAX_PIEZAS = 400
SEG = 20          # lados de cilindros y conos
SEG_ESF = (16, 10)
MAX_MINI = 190_000


class ErrorModelo(ValueError):
    pass


# ───────────── mallas unitarias (centradas, tamaño 1) ─────────────

def _caja():
    v, n, t = [], [], []
    caras = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1)),
             ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    for nn, u, w in caras:
        b = len(v)
        for su, sw in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v.append(tuple(0.5 * nn[k] + 0.5 * su * u[k] + 0.5 * sw * w[k] for k in range(3)))
            n.append(nn)
        t += [(b, b + 1, b + 2), (b, b + 2, b + 3)]
    return v, n, t


def _revolucion(r_abajo: float, r_arriba: float):
    v, n, t = [], [], []
    pend = (r_abajo - r_arriba)   # altura 1
    for i in range(SEG + 1):
        a = 2 * math.pi * i / SEG
        c, s = math.cos(a), math.sin(a)
        ln = math.hypot(1, pend)
        nn = (c / ln, pend / ln, s / ln)
        v += [(r_abajo * c, -0.5, r_abajo * s), (r_arriba * c, 0.5, r_arriba * s)]
        n += [nn, nn]
    for i in range(SEG):
        a, b = 2 * i, 2 * i + 2
        t += [(a, a + 1, b + 1), (a, b + 1, b)]
    for y, r, ny in ((-0.5, r_abajo, -1), (0.5, r_arriba, 1)):
        if r <= 1e-6:
            continue
        c0 = len(v)
        v.append((0, y, 0)); n.append((0, ny, 0))
        for i in range(SEG):
            a = 2 * math.pi * i / SEG
            v.append((r * math.cos(a), y, r * math.sin(a))); n.append((0, ny, 0))
        for i in range(SEG):
            p, q = c0 + 1 + i, c0 + 1 + (i + 1) % SEG
            t.append((c0, p, q) if ny < 0 else (c0, q, p))
    return v, n, t


def _esfera(mitad: bool):
    v, n, t = [], [], []
    seg, an = SEG_ESF
    filas = an // 2 if mitad else an
    for j in range(filas + 1):
        th = (math.pi / 2) * j / filas if mitad else math.pi * j / an
        for i in range(seg + 1):
            ph = 2 * math.pi * i / seg
            x, y, z = math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)
            # media esfera: base en y = -0.5, alto 1 (de -0.5 a 0.5), radio 0.5 en XZ
            v.append((0.5 * x, y - 0.5, 0.5 * z) if mitad else (0.5 * x, 0.5 * y, 0.5 * z))
            n.append((x, y, z))
    for j in range(filas):
        for i in range(seg):
            a, b = j * (seg + 1) + i, (j + 1) * (seg + 1) + i
            t += [(a, a + 1, b + 1), (a, b + 1, b)]
    if mitad:
        c0 = len(v)
        v.append((0, -0.5, 0)); n.append((0, -1, 0))
        for i in range(seg):
            ph = 2 * math.pi * i / seg
            v.append((0.5 * math.cos(ph), -0.5, 0.5 * math.sin(ph))); n.append((0, -1, 0))
        for i in range(seg):
            t.append((c0, c0 + 1 + i, c0 + 1 + (i + 1) % seg))
    return v, n, t


def _prisma():
    """Sección triangular en XY (base abajo, vértice arriba en el centro), extruida en Z: un tejado a dos aguas."""
    A, B, C = (-0.5, -0.5), (0.5, -0.5), (0, 0.5)
    v, n, t = [], [], []

    def quad(p, nn):
        b = len(v)
        v.extend(p); n.extend([nn] * 4)
        t.extend([(b, b + 1, b + 2), (b, b + 2, b + 3)])

    ln = math.hypot(1, 0.5)
    quad([(A[0], A[1], 0.5), (A[0], A[1], -0.5), (B[0], B[1], -0.5), (B[0], B[1], 0.5)], (0, -1, 0))
    quad([(B[0], B[1], 0.5), (B[0], B[1], -0.5), (C[0], C[1], -0.5), (C[0], C[1], 0.5)], (1 / ln, 0.5 / ln, 0))
    quad([(C[0], C[1], 0.5), (C[0], C[1], -0.5), (A[0], A[1], -0.5), (A[0], A[1], 0.5)], (-1 / ln, 0.5 / ln, 0))
    for z, nz in ((0.5, 1), (-0.5, -1)):
        b = len(v)
        v += [(A[0], A[1], z), (B[0], B[1], z), (C[0], C[1], z)]; n += [(0, 0, nz)] * 3
        t.append((b, b + 1, b + 2) if nz > 0 else (b, b + 2, b + 1))
    return v, n, t


_CACHE: dict = {}


def _unitaria(forma: str, arriba: float):
    k = (forma, round(arriba, 3))
    if k not in _CACHE:
        if forma == "caja":
            m = _caja()
        elif forma == "cilindro":
            m = _revolucion(0.5, 0.5 * arriba)
        elif forma == "cono":
            m = _revolucion(0.5, 0.0)
        elif forma == "esfera":
            m = _esfera(False)
        elif forma == "cupula":
            m = _esfera(True)
        else:
            m = _prisma()
        _CACHE[k] = m
    return _CACHE[k]


# ───────────── validación ─────────────

def _num(v, defecto, lo, hi, campo):
    if v is None:
        return defecto
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ErrorModelo("%s tiene que ser un número." % campo)
    return min(hi, max(lo, float(v)))


def _vec(v, defecto, lo, hi, campo):
    if v is None:
        return defecto
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        v = [v, v, v]
    if not isinstance(v, (list, tuple)) or len(v) != 3:
        raise ErrorModelo("%s tiene que ser [x, y, z]." % campo)
    return tuple(_num(x, d, lo, hi, campo) for x, d in zip(v, defecto))


def _color(c) -> tuple:
    c = str(c or "#9a9a9a").strip()
    if not re.fullmatch(r"#?[0-9a-fA-F]{6}", c):
        raise ErrorModelo("color «%s» no es #rrggbb." % c[:20])
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def validar(piezas) -> list[dict]:
    if not isinstance(piezas, list) or not piezas:
        raise ErrorModelo("Hace falta al menos una pieza.")
    if len(piezas) > MAX_PIEZAS:
        raise ErrorModelo("Máximo %d piezas." % MAX_PIEZAS)
    out = []
    for i, p in enumerate(piezas):
        if not isinstance(p, dict):
            raise ErrorModelo("La pieza %d no es un objeto." % i)
        forma = str(p.get("forma") or "caja").lower().replace("ú", "u")
        if forma not in FORMAS:
            raise ErrorModelo("Pieza %d: forma «%s» no existe (%s)." % (i, forma, ", ".join(FORMAS)))
        try:
            out.append({
                "forma": forma,
                "centro": _vec(p.get("centro"), (0, 0, 0), -500, 500, "centro"),
                "tamano": _vec(p.get("tamano"), (1, 1, 1), 0.002, 500, "tamano"),
                "giro": _vec(p.get("giro"), (0, 0, 0), -360, 360, "giro"),
                "color": _color(p.get("color")),
                "rugosidad": _num(p.get("rugosidad"), 0.75, 0, 1, "rugosidad"),
                "metal": _num(p.get("metal"), 0, 0, 1, "metal"),
                "opacidad": _num(p.get("opacidad"), 1, 0.05, 1, "opacidad"),
                "brillo": bool(p.get("brillo")),
                "arriba": _num(p.get("arriba"), 1, 0, 4, "arriba"),
            })
        except ErrorModelo as e:
            raise ErrorModelo("Pieza %d: %s" % (i, e))
    return out


# ───────────── geometría ─────────────

def _rot(giro):
    rx, ry, rz = (math.radians(a) for a in giro)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    # three.js Euler 'XYZ': R = Rx · Ry · Rz
    return ((cy * cz, -cy * sz, sy),
            (cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy),
            (sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy))


def _aplicar(m, v):
    return (m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2])


def _lin(c: int) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def construir(piezas: list[dict]) -> dict:
    """Mallas agrupadas por material: {clave_material: {"mat":…, "v":[], "n":[], "t":[]}} ya recolocadas (base en 0)."""
    grupos: dict = {}
    for p in piezas:
        uv, un, ut = _unitaria(p["forma"], p["arriba"])
        R, s, c = _rot(p["giro"]), p["tamano"], p["centro"]
        mat = (p["color"], round(p["rugosidad"], 2), round(p["metal"], 2), round(p["opacidad"], 2), p["brillo"])
        g = grupos.setdefault(mat, {"mat": mat, "v": [], "n": [], "t": []})
        base = len(g["v"])
        for x in uv:
            w = _aplicar(R, (x[0] * s[0], x[1] * s[1], x[2] * s[2]))
            g["v"].append((w[0] + c[0], w[1] + c[1], w[2] + c[2]))
        for nn in un:
            w = _aplicar(R, (nn[0] / s[0], nn[1] / s[1], nn[2] / s[2]))
            ln = math.sqrt(w[0] ** 2 + w[1] ** 2 + w[2] ** 2) or 1
            g["n"].append((w[0] / ln, w[1] / ln, w[2] / ln))
        g["t"] += [(a + base, b + base, cc + base) for a, b, cc in ut]
    todos = [v for g in grupos.values() for v in g["v"]]
    mn = [min(v[k] for v in todos) for k in range(3)]
    mx = [max(v[k] for v in todos) for k in range(3)]
    dx, dy, dz = -(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2
    for g in grupos.values():
        g["v"] = [(v[0] + dx, v[1] + dy, v[2] + dz) for v in g["v"]]
    return grupos


def glb(grupos: dict, nombre: str = "Modelo") -> bytes:
    bin_ = bytearray()
    vistas, accesores, materiales, prims = [], [], [], []

    def vista(datos: bytes, objetivo: int) -> int:
        while len(bin_) % 4:
            bin_.append(0)
        vistas.append({"buffer": 0, "byteOffset": len(bin_), "byteLength": len(datos), "target": objetivo})
        bin_.extend(datos)
        return len(vistas) - 1

    for g in grupos.values():
        (r, gg, b), rug, met, opa, brillo = g["mat"]
        m = {"name": "#%02x%02x%02x" % (r, gg, b), "pbrMetallicRoughness": {
            "baseColorFactor": [_lin(r), _lin(gg), _lin(b), opa], "metallicFactor": met, "roughnessFactor": rug}}
        if opa < 1:
            m["alphaMode"] = "BLEND"
            m["doubleSided"] = True
        if brillo:
            m["emissiveFactor"] = [_lin(r), _lin(gg), _lin(b)]
        materiales.append(m)
        v, n, t = g["v"], g["n"], g["t"]
        pos = struct.pack("<%df" % (3 * len(v)), *[c for p in v for c in p])
        nor = struct.pack("<%df" % (3 * len(n)), *[c for p in n for c in p])
        idx = [i for tri in t for i in tri]
        corto = len(v) < 65536
        ind = struct.pack("<%d%s" % (len(idx), "H" if corto else "I"), *idx)
        accesores.append({"bufferView": vista(pos, 34962), "componentType": 5126, "count": len(v), "type": "VEC3",
                          "min": [min(p[k] for p in v) for k in range(3)], "max": [max(p[k] for p in v) for k in range(3)]})
        accesores.append({"bufferView": vista(nor, 34962), "componentType": 5126, "count": len(n), "type": "VEC3"})
        accesores.append({"bufferView": vista(ind, 34963), "componentType": 5123 if corto else 5125, "count": len(idx), "type": "SCALAR"})
        k = len(accesores)
        prims.append({"attributes": {"POSITION": k - 3, "NORMAL": k - 2}, "indices": k - 1, "material": len(materiales) - 1})
    while len(bin_) % 4:
        bin_.append(0)
    gltf = {"asset": {"version": "2.0", "generator": "Map Creator (piezas)"}, "scene": 0, "scenes": [{"nodes": [0]}],
            "nodes": [{"name": nombre[:80], "mesh": 0}], "meshes": [{"name": nombre[:80], "primitives": prims}],
            "materials": materiales, "accessors": accesores, "bufferViews": vistas, "buffers": [{"byteLength": len(bin_)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(bin_), b"BIN\x00") + bytes(bin_))


def miniatura(grupos: dict, px: int = 256) -> str | None:
    """Vista isométrica en SVG (triángulos de cara a la cámara, ordenados por profundidad, con sombreado simple)."""
    ca, sa = math.cos(math.radians(45)), math.sin(math.radians(45))
    el = math.radians(30)
    ce, se = math.cos(el), math.sin(el)
    cam = (sa * ce, se, ca * ce)          # dirección hacia la cámara (desde +X+Z, arriba)
    luz = (0.35, 0.85, 0.4)
    ll = math.sqrt(sum(c * c for c in luz))
    luz = tuple(c / ll for c in luz)
    tris = []
    for g in grupos.values():
        (r, gg, b), _rug, _met, opa, brillo = g["mat"]
        v, n = g["v"], g["n"]
        for a, bb, c in g["t"]:
            p0, p1, p2 = v[a], v[bb], v[c]
            e1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
            e2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
            nn = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
            ln = math.sqrt(nn[0] ** 2 + nn[1] ** 2 + nn[2] ** 2)
            if ln < 1e-12:
                continue
            nn = (nn[0] / ln, nn[1] / ln, nn[2] / ln)
            if nn[0] * cam[0] + nn[1] * cam[1] + nn[2] * cam[2] <= 0 and opa >= 1:
                continue
            sm = [n[a], n[bb], n[c]]
            ns = tuple(sum(q[k] for q in sm) / 3 for k in range(3))
            f = 1.0 if brillo else 0.45 + 0.55 * max(0.0, ns[0] * luz[0] + ns[1] * luz[1] + ns[2] * luz[2])
            pts, prof = [], 0.0
            for p in (p0, p1, p2):
                x = p[0] * ca - p[2] * sa
                zr = p[0] * sa + p[2] * ca
                y = p[1] * ce - zr * se
                prof += zr * ce + p[1] * se
                pts.append((x, -y))
            tris.append((prof / 3, pts, "#%02x%02x%02x" % tuple(min(255, int(q * f)) for q in (r, gg, b)), opa))
    if not tris:
        return None
    xs = [p[0] for t in tris for p in t[1]]
    ys = [p[1] for t in tris for p in t[1]]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    esc = (px * 0.86) / max(w, h, 1e-6)
    ox, oy = px / 2 - (min(xs) + w / 2) * esc, px / 2 - (min(ys) + h / 2) * esc
    tris.sort(key=lambda t: t[0])
    partes = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d"><rect width="%d" height="%d" fill="#eef1f4"/>' % (px, px, px, px)]
    for _, pts, col, opa in tris:
        s = " ".join("%.1f,%.1f" % (p[0] * esc + ox, p[1] * esc + oy) for p in pts)
        partes.append('<polygon points="%s" fill="%s" stroke="%s" stroke-width=".4"%s/>' % (s, col, col, ' fill-opacity="%.2f"' % opa if opa < 1 else ""))
    partes.append("</svg>")
    svg = "".join(partes)
    url = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
    return url if len(url) <= MAX_MINI else None


def generar(piezas, nombre: str = "Modelo") -> tuple[bytes, str | None, dict]:
    """Valida, construye y devuelve (glb, miniatura, resumen)."""
    ps = validar(piezas)
    grupos = construir(ps)
    datos = glb(grupos, nombre)
    todos = [v for g in grupos.values() for v in g["v"]]
    tam = [round(max(v[k] for v in todos) - min(v[k] for v in todos), 3) for k in range(3)]
    return datos, miniatura(grupos), {"piezas": len(ps), "materiales": len(grupos), "triangulos": sum(len(g["t"]) for g in grupos.values()),
                                      "tamano_m": tam, "bytes": len(datos)}
