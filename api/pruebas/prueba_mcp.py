"""Prueba de punta a punta del servidor MCP con el cliente MCP oficial (paquete `mcp`) y de los tokens de acceso y la biblioteca.

Contra un servidor de PRUEBA (crea usuarios y proyectos). Necesita el paquete `mcp`, que ya trae la imagen de la app:
    podman run --rm --pod <pod> -v ./api/pruebas:/pruebas:ro localhost/map-creator:dev python /pruebas/prueba_mcp.py http://127.0.0.1:8000
"""
import asyncio
import base64
import json
import struct
import sys
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import cliente  # noqa: E402
from cliente import BASE, Cliente, comprobar  # noqa: E402

from mcp import ClientSession  # noqa: E402
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client  # noqa: E402

sufijo = str(int(time.time() * 1000))


def glb_triangulo() -> bytes:
    """Un .glb mínimo válido: un triángulo de 2 × 1 m."""
    pos = struct.pack("<9f", 0, 0, 0, 2, 0, 0, 0, 1, 0)
    j = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "tri"}],
         "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
         "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [2, 1, 0]}],
         "bufferViews": [{"buffer": 0, "byteLength": 36}], "buffers": [{"byteLength": 36}]}
    js = json.dumps(j).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(pos)
    return b"glTF" + struct.pack("<II", 2, total) + struct.pack("<I", len(js)) + b"JSON" + js + struct.pack("<I", len(pos)) + b"BIN\0" + pos


def cuenta(nombre):
    c = Cliente()
    st, u = c.j("POST", "/api/cuenta/registro", {"nombre": nombre, "email": "%s-%s@prueba.test" % (nombre.lower(), sufijo), "clave": "clave-segura-1"})
    assert st == 200, (st, u)
    st, t = c.j("POST", "/api/cuenta/tokens", {"nombre": "Claude Code"})
    comprobar(st == 201 and t["token"].startswith("mc_") and len(t["token"]) > 30, "%s crea un token de acceso" % nombre)
    return c, t


class Mcp:
    """Una sesión MCP con un token."""
    def __init__(self, token):
        self.token = token

    async def __aenter__(self):
        self.http = create_mcp_http_client(headers={"Authorization": "Bearer " + self.token})
        self._t = streamable_http_client(BASE + "/mcp", http_client=self.http)
        r, w = (await self._t.__aenter__())[:2]
        self.s = ClientSession(r, w)
        await self.s.__aenter__()
        await self.s.initialize()
        return self

    async def __aexit__(self, *a):
        await self.s.__aexit__(*a)
        await self._t.__aexit__(*a)
        await self.http.aclose()

    async def llamar(self, _herramienta, **args):
        r = await self.s.call_tool(_herramienta, args)
        texto = "".join(getattr(c, "text", "") for c in r.content)
        if getattr(r, "is_error", False):
            return {"_error": texto}
        sc = getattr(r, "structured_content", None)
        if isinstance(sc, dict) and "result" in sc and len(sc) == 1:
            sc = sc["result"]
        return sc if isinstance(sc, dict) else json.loads(texto)


async def main():
    ana, ta = cuenta("Ana")
    beto, tb = cuenta("Beto")

    # ── tokens en la API REST ──
    st, ps = Cliente().j("GET", "/api/proyectos", cab={"Authorization": "Bearer " + ta["token"]})
    comprobar(st == 200 and isinstance(ps, list), "la API REST acepta el token")
    st, _ = Cliente().j("POST", "/api/cuenta/tokens", {"nombre": "otro"}, cab={"Authorization": "Bearer " + ta["token"]})
    comprobar(st == 403, "un token no puede crear más tokens")
    st, lst = ana.j("GET", "/api/cuenta/tokens")
    comprobar(st == 200 and len(lst) == 1 and "token" not in lst[0] and lst[0]["prefijo"] == ta["token"][:10], "la lista de tokens no enseña el token")
    st, _ = Cliente().j("GET", "/api/proyectos", cab={"Authorization": "Bearer mc_inventado"})
    comprobar(st == 401, "token inventado: 401")

    async with Mcp(ta["token"]) as m:
        herramientas = [t.name for t in (await m.s.list_tools()).tools]
        comprobar(len(herramientas) >= 25 and {"crear_proyecto", "colocar_objetos", "buscar_biblioteca", "exportar_proyecto"} <= set(herramientas),
                  "MCP: %d herramientas" % len(herramientas))
        yo = await m.llamar("quien_soy")
        comprobar(yo.get("nombre") == "Ana", "MCP: quien_soy")

        p = await m.llamar("crear_proyecto", nombre="Plaza MCP", ancho=200, largo=160, relieve="colinas", rio=True)
        pid = p.get("id")
        comprobar(bool(pid) and p.get("relieve"), "MCP: crear_proyecto con relieve")
        v = await m.llamar("ver_proyecto", proyecto=pid)
        comprobar(v.get("relieve", {}).get("estilo") == "colinas" and v["suelo_base_m"]["ancho"] == 70 and "/editor/?p=" in v["editor"], "MCP: ver_proyecto (zona plana 70 m)")

        cat = await m.llamar("buscar_catalogo", texto="banca")
        banca = next((o["id"] for o in cat["objetos"] if o["id"] == "banca"), None)
        comprobar(banca == "banca" and cat["categorias"], "MCP: buscar_catalogo")
        r = await m.llamar("colocar_objetos", proyecto=pid, objetos=[{"tipo": "banca", "x": 0, "z": -3, "giro": 0, "nombre": "Banca norte"},
                                                                      {"tipo": "banca", "x": 0, "z": 3, "giro": 180}, {"tipo": "no_existe", "x": 0, "z": 0}])
        comprobar(r.get("colocados") == 2 and len(r["errores"]) == 1, "MCP: colocar_objetos (2 y un error explicado)")
        bancas = r["ids"]
        r = await m.llamar("crear_paredes", proyecto=pid, paredes=[{"x1": -5, "z1": -5, "x2": 5, "z2": -5}, {"x1": 5, "z1": -5, "x2": 5, "z2": 5, "alto": 3},
                                                                   {"x1": 5, "z1": 5, "x2": -5, "z2": 5}, {"x1": -5, "z1": 5, "x2": -5, "z2": -5}])
        comprobar(r.get("creadas") == 4, "MCP: crear_paredes (habitación de 10 × 10)")
        lo = await m.llamar("listar_objetos", proyecto=pid)
        muro = next(o for o in lo["objetos"] if o["tipo"].startswith("muro") and abs(o["z"] + 5) < 0.01)
        comprobar(lo["total"] == 6 and abs(muro["tamano_m"][0] - 10) < 0.01 and abs(muro["giro"]) < 0.01, "MCP: listar_objetos (6, muro de 10 m)")
        r = await m.llamar("editar_objetos", proyecto=pid, cambios=[{"id": bancas[0], "x": 2, "giro": 90, "nombre": "Banca movida"}])
        lo2 = await m.llamar("listar_objetos", proyecto=pid, tipo="objeto:banca")
        movida = next(o for o in lo2["objetos"] if o["id"] == bancas[0])
        comprobar(r.get("editados") == 1 and movida["x"] == 2 and movida["giro"] == 90 and movida["nombre"] == "Banca movida", "MCP: editar_objetos")

        ver = await m.llamar("guardar_version", proyecto=pid, nombre="Con bancas y habitación")
        comprobar(ver.get("objetos") == 6, "MCP: guardar_version")
        r = await m.llamar("borrar_objetos", proyecto=pid, ids=[bancas[1]])
        comprobar(r.get("borrados") == 1, "MCP: borrar_objetos")
        r = await m.llamar("restaurar_version", proyecto=pid, version=ver["id"])
        lo3 = await m.llamar("listar_objetos", proyecto=pid)
        comprobar(lo3["total"] == 6, "MCP: restaurar_version devuelve el objeto borrado")
        vs = await m.llamar("listar_versiones", proyecto=pid)
        comprobar(len(vs["versiones"]) >= 2, "MCP: listar_versiones (la suya y la automática)")

        t = await m.llamar("generar_terreno", proyecto=pid, estilo="montanas", nieve=20)
        v2 = await m.llamar("ver_proyecto", proyecto=pid)
        comprobar(t.get("pendiente") and v2["terreno_pendiente"], "MCP: generar_terreno queda pedido para el editor")
        mal = await m.llamar("generar_terreno", proyecto=pid, estilo="volcanes")
        comprobar("_error" in mal, "MCP: estilo de terreno inválido da error")

        ex = await m.llamar("exportar_proyecto", proyecto=pid)
        comprobar(ex.get("exportacion", {}).get("formato") == "map-creator-proyecto" and ex["documentos"] > 6, "MCP: exportar_proyecto")
        im = await m.llamar("importar_proyecto", exportacion_json=json.dumps(ex["exportacion"]), nombre="Plaza importada")
        lo4 = await m.llamar("listar_objetos", proyecto=im["proyecto"])
        comprobar(lo4["total"] == 6, "MCP: importar_proyecto (mismos 6 objetos)")
        st, cab, d = Cliente().pedir("GET", "/api/proyectos/%s/exportar" % pid, cab={"Authorization": "Bearer " + ta["token"]})
        comprobar(st == 200 and json.loads(d)["formato"] == "map-creator-proyecto", "REST: exportar con el token")

        # ── biblioteca ──
        a = await m.llamar("subir_asset", nombre="Triángulo de prueba", glb_base64=base64.b64encode(glb_triangulo()).decode(), categoria="pruebas", etiquetas=["test"])
        comprobar(a.get("id") and a["visibilidad"] == "privada" and a["tamano_m"] == [2, 1, 0], "MCP: subir_asset (privado, tamaño leído del GLB)")
        mal = await m.llamar("subir_asset", nombre="x", glb_base64=base64.b64encode(b"no soy un glb").decode())
        comprobar("_error" in mal, "MCP: subir_asset rechaza lo que no es GLB")
        async with Mcp(tb["token"]) as mb:
            b1 = await mb.llamar("buscar_biblioteca", tipo="assets", texto="triángulo")
            comprobar(not any(x["id"] == a["id"] for x in b1["assets"]), "otro usuario no ve el asset privado")
            nop = await mb.llamar("ver_proyecto", proyecto=pid)
            comprobar("_error" in nop, "otro usuario no ve un proyecto ajeno")
        e = await m.llamar("editar_asset", asset=a["id"], publicar=True, descripcion="Triángulo para pruebas")
        comprobar(e.get("visibilidad") == "publica", "MCP: editar_asset (publicar)")
        async with Mcp(tb["token"]) as mb:
            b2 = await mb.llamar("buscar_biblioteca", tipo="assets", texto="triángulo")
            comprobar(any(x["id"] == a["id"] for x in b2["assets"]), "otro usuario ve el asset publicado")
            nop = await mb.llamar("editar_asset", asset=a["id"], nombre="mío")
            comprobar("_error" in nop, "otro usuario no puede cambiar un asset ajeno")
        st, cab, d = Cliente().pedir("GET", "/api/biblioteca/assets/%s/archivo" % a["id"], cab={"Authorization": "Bearer " + tb["token"]})
        comprobar(st == 200 and d[:4] == b"glTF", "REST: descargar el GLB publicado")
        r = await m.llamar("anadir_asset_a_proyecto", asset=a["id"], proyecto=pid)
        comprobar(r.get("tipo_para_colocar", "").startswith("modelo:as-"), "MCP: anadir_asset_a_proyecto")
        r2 = await m.llamar("colocar_objetos", proyecto=pid, objetos=[{"tipo": r["tipo_para_colocar"], "x": 10, "z": 10}])
        comprobar(r2.get("colocados") == 1, "MCP: colocar el modelo de la biblioteca")
        r3 = await m.llamar("publicar_asset_de_proyecto", proyecto=pid, asset=r["tipo_para_colocar"], nombre="Triángulo republicado", publicar=False)
        comprobar(r3.get("nombre") == "Triángulo republicado" and r3["visibilidad"] == "privada", "MCP: publicar_asset_de_proyecto")

        piezas = [{"forma": "caja", "centro": [0, 0.45, 0], "tamano": [1.8, 0.06, 0.5], "color": "#8a5a2b"},
                  {"forma": "cilindro", "centro": [-0.8, 0.22, 0], "tamano": [0.06, 0.44, 0.06], "color": "#333333", "metal": 0.8},
                  {"forma": "prisma", "centro": [0, 1.2, 0], "tamano": [2, 0.5, 1], "giro": [0, 90, 0], "color": "#aa3322"},
                  {"forma": "esfera", "centro": [0.5, 1.6, 0], "tamano": 0.3, "color": "#88ccff", "opacidad": 0.4, "brillo": True},
                  {"forma": "cupula", "centro": [0, 2, 0], "tamano": [0.4, 0.2, 0.4]}, {"forma": "cono", "centro": [0.8, 0.3, 0], "tamano": [0.2, 0.6, 0.2]}]
        cm = await m.llamar("crear_modelo", nombre="Banca IA", piezas=piezas, proyecto=pid, categoria="pruebas")
        comprobar(cm.get("tipo_para_colocar", "").startswith("modelo:as-") and cm["asset"]["visibilidad"] == "privada"
                  and abs(cm["resumen"]["tamano_m"][1] - 2.1) < 0.01, "MCP: crear_modelo (piezas → GLB en la biblioteca y en el proyecto)")
        st, cab, d = Cliente().pedir("GET", "/api/biblioteca/assets/%s/archivo" % cm["asset"]["id"], cab={"Authorization": "Bearer " + ta["token"]})
        comprobar(st == 200 and d[:4] == b"glTF" and len(d) == cm["resumen"]["bytes"], "crear_modelo: el GLB se descarga")
        st, ax = Cliente().j("GET", "/api/biblioteca/assets/%s" % cm["asset"]["id"], cab={"Authorization": "Bearer " + ta["token"]})
        comprobar(st == 200 and str(ax.get("mini", "")).startswith("data:image/svg+xml;base64,"), "crear_modelo: miniatura SVG")
        r4 = await m.llamar("colocar_objetos", proyecto=pid, objetos=[{"tipo": cm["tipo_para_colocar"], "x": -10, "z": 5}])
        comprobar(r4.get("colocados") == 1, "MCP: colocar el modelo creado")
        # creador de assets: las piezas se guardan, el autor las cambia, otro solo las copia
        A, B = {"Authorization": "Bearer " + ta["token"]}, {"Authorization": "Bearer " + tb["token"]}
        st, pz = Cliente().j("GET", "/api/biblioteca/assets/%s/piezas" % cm["asset"]["id"], cab=A)
        comprobar(st == 200 and len(pz["piezas"]) == 6 and pz["mio"] and pz["piezas"][3].get("brillo") is True
                  and pz["piezas"][0]["color"] == "#8a5a2b" and "rugosidad" not in pz["piezas"][0], "creador: las piezas se guardan con el modelo")
        cambio = pz["piezas"][:2] + [{"forma": "caja", "centro": [0, 1.5, 0], "tamano": [0.4, 3, 0.4], "color": "#123456", "nombre": "Torre"}]
        st, up = Cliente().j("PUT", "/api/biblioteca/modelos/%s" % cm["asset"]["id"], {"piezas": cambio, "nombre": "Banca IA v2"}, cab=A)
        comprobar(st == 200 and up["asset"]["nombre"] == "Banca IA v2" and abs(up["resumen"]["tamano_m"][1] - 3) < 0.01 and up["asset"]["con_piezas"],
                  "creador: el autor actualiza el modelo (%s)" % (up if st != 200 else "ok"))
        st, d = Cliente().pedir("GET", "/api/biblioteca/assets/%s/archivo" % cm["asset"]["id"], cab=A)[::2]
        comprobar(st == 200 and len(d) == up["resumen"]["bytes"], "creador: el GLB nuevo sustituye al anterior")
        st, pz2 = Cliente().j("GET", "/api/biblioteca/assets/%s/piezas" % cm["asset"]["id"], cab=A)
        comprobar(st == 200 and len(pz2["piezas"]) == 3 and pz2["piezas"][2]["nombre"] == "Torre", "creador: las piezas nuevas (con nombre) quedan guardadas")
        st, _ = Cliente().j("PUT", "/api/biblioteca/modelos/%s" % cm["asset"]["id"], {"piezas": cambio}, cab=B)
        comprobar(st in (403, 404), "creador: otro usuario no puede cambiar el modelo (%d)" % st)
        st, _ = Cliente().j("GET", "/api/biblioteca/assets/%s/piezas" % cm["asset"]["id"], cab=B)
        comprobar(st == 404, "creador: las piezas de un modelo privado no se ven desde otra cuenta")
        st, _ = Cliente().j("PUT", "/api/biblioteca/modelos/%s" % cm["asset"]["id"], {"piezas": [{"forma": "toro"}]}, cab=A)
        comprobar(st == 400, "creador: actualizar con piezas no válidas da 400")
        st, cab_, d = Cliente().pedir("POST", "/api/biblioteca/modelos/glb", {"piezas": cambio, "nombre": "Vista"}, cab=A)
        comprobar(st == 200 and d[:4] == b"glTF", "creador: descargar el .glb sin guardar")
        st, _ = Cliente().j("GET", "/api/biblioteca/assets/%s/piezas" % a["id"], cab=A)
        comprobar(st == 409, "creador: un .glb subido no se abre en el creador (409)")

        mal = await m.llamar("crear_modelo", nombre="Mala", piezas=[{"forma": "toro"}])
        comprobar("_error" in mal and "toro" in mal["_error"], "crear_modelo rechaza formas que no existen")

        n_objs = (await m.llamar("listar_objetos", proyecto=pid))["total"]
        pm = await m.llamar("publicar_mapa", proyecto=pid, nombre="Plaza con habitación %s" % sufijo[-4:], descripcion="Desde MCP")
        bm = await m.llamar("buscar_biblioteca", tipo="mapas", texto="habitación")
        comprobar(pm.get("id", "").startswith("u:") and any(x["id"] == pm["id"] for x in bm["mapas"]), "MCP: publicar_mapa y buscarlo en la biblioteca")
        async with Mcp(tb["token"]) as mb:
            np_ = await mb.llamar("crear_proyecto", nombre="Desde la biblioteca", plantilla=pm["id"])
            lo5 = await mb.llamar("listar_objetos", proyecto=np_["id"])
            comprobar(lo5["total"] == n_objs, "otro usuario crea un proyecto desde el mapa publicado (%d objetos)" % n_objs)

        r = await m.llamar("duplicar_proyecto", proyecto=pid)
        comprobar(r.get("id") and r["id"] != pid, "MCP: duplicar_proyecto")
        r = await m.llamar("renombrar_proyecto", proyecto=pid, nombre="Plaza MCP renombrada")
        comprobar(r.get("nombre") == "Plaza MCP renombrada", "MCP: renombrar_proyecto")
        r = await m.llamar("mover_a_papelera", proyecto=r["id"] if False else im["proyecto"])
        lp = await m.llamar("listar_proyectos", papelera=True)
        comprobar(any(x["id"] == im["proyecto"] for x in lp["proyectos"]), "MCP: mover_a_papelera")

    # ── revocar ──
    st, _ = ana.j("DELETE", "/api/cuenta/tokens/%s" % ta["id"])
    try:
        async with Mcp(ta["token"]) as m:
            await m.llamar("quien_soy")
        comprobar(False, "token revocado: el MCP lo rechaza")
    except BaseException:
        comprobar(st == 200, "token revocado: el MCP lo rechaza")
    st, _ = Cliente().j("GET", "/api/proyectos", cab={"Authorization": "Bearer " + ta["token"]})
    comprobar(st == 401, "token revocado: la API REST lo rechaza")


asyncio.run(main())
print("fallos=%d" % cliente.fallos)
sys.exit(1 if cliente.fallos else 0)
