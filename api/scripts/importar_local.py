"""Importa una carpeta del modo local (editor/local/datos_usuario: cambios.json, capas.json…) a un proyecto nuevo de un usuario.

    docker compose run --rm -v ./editor/local/datos_usuario:/importar:ro app \
        python -m scripts.importar_local --email tu@correo.com --nombre "Complejo (mis cambios)" /importar

- Cada <coleccion>.json ({id: documento}) pasa a `documentos`. Se saltan los archivos que empiezan por «_» (bases internas del
  servidor local) y los diarios .jsonl sin compactar (abre y cierra el servidor local antes para compactarlos).
- El mapa que abre el proyecto es el que más aparece en `cambios` (complejo, parqueadero o u-…).
- Las fotos y calcos que apuntan a la carpeta «referencias» del juego no se copian: en el editor saldrán sin imagen.
"""
import argparse
import asyncio
import collections
import json
import sys
from pathlib import Path

import asyncpg

from app import config

COLECCION_VALIDA = __import__("re").compile(r"^[A-Za-z0-9_\-]{1,40}$")


async def importar(carpeta: Path, email: str, nombre: str):
    con = await asyncpg.connect(config.DATABASE_URL)
    try:
        uid = await con.fetchval("SELECT id FROM usuarios WHERE lower(email) = lower($1)", email)
        if uid is None:
            sys.exit("No hay ninguna cuenta con el correo %s: regístrate primero en la web." % email)
        colecciones = {}
        for ruta in sorted(carpeta.glob("*.json")):
            col = ruta.stem
            if col.startswith("_") or not COLECCION_VALIDA.match(col):
                continue
            docs = json.loads(ruta.read_text(encoding="utf-8"))
            if isinstance(docs, dict) and docs:
                colecciones[col] = docs
        if (carpeta / "cambios.diario.jsonl").exists():
            print("Aviso: hay diarios sin compactar (*.diario.jsonl); esos últimos cambios no se importan.")
        mapas = collections.Counter(d.get("mapa") for d in colecciones.get("cambios", {}).values() if isinstance(d, dict) and d.get("mapa"))
        mapa = mapas.most_common(1)[0][0] if mapas else "complejo"
        plantilla = mapa if mapa in ("complejo", "parqueadero") else "importado"
        async with con.transaction():
            pid = await con.fetchval("INSERT INTO proyectos (nombre, descripcion, dueno_id, plantilla, mapa_inicial) "
                                     "VALUES ($1, $2, $3, $4, $5) RETURNING id",
                                     nombre, "Importado de %s" % carpeta.name, uid, plantilla, mapa)
            await con.execute("INSERT INTO miembros (proyecto_id, usuario_id, rol) VALUES ($1, $2, 'dueno')", pid, uid)
            total = 0
            for col, docs in colecciones.items():
                filas = [(pid, col, str(k), json.dumps(v, ensure_ascii=False), uid) for k, v in docs.items() if isinstance(v, dict)]
                await con.executemany("INSERT INTO documentos (proyecto_id, coleccion, doc_id, datos, actualizado_por) "
                                      "VALUES ($1, $2, $3, $4::jsonb, $5)", filas)
                await con.execute("INSERT INTO colecciones (proyecto_id, coleccion, version) VALUES ($1, $2, 1)", pid, col)
                total += len(filas)
                print("  %-12s %5d documentos" % (col, len(filas)))
        print("Proyecto «%s» creado (%s) con %d documentos; abre el mapa «%s»." % (nombre, pid, total, mapa))
    finally:
        await con.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("carpeta", type=Path)
    ap.add_argument("--email", required=True)
    ap.add_argument("--nombre", default="Importado")
    a = ap.parse_args()
    if not a.carpeta.is_dir():
        sys.exit("No existe la carpeta %s" % a.carpeta)
    asyncio.run(importar(a.carpeta, a.email, a.nombre))


if __name__ == "__main__":
    main()
