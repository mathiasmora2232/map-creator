"""Pool de conexiones a PostgreSQL y migraciones en SQL plano (api/migraciones/NNN_nombre.sql, en orden, una sola vez)."""
import json
import logging

import asyncpg

from . import config

log = logging.getLogger("mapcreator.db")
pool: asyncpg.Pool | None = None


async def _init_conexion(con):
    # jsonb entra y sale como texto: los documentos pasan tal cual entre el editor y la base, sin decodificarlos en Python.
    await con.set_type_codec("jsonb", encoder=lambda v: v if isinstance(v, str) else json.dumps(v, ensure_ascii=False),
                             decoder=lambda v: v, schema="pg_catalog")


async def abrir():
    global pool
    pool = await asyncpg.create_pool(config.DATABASE_URL, min_size=1, max_size=10, init=_init_conexion)
    await migrar()


async def cerrar():
    if pool:
        await pool.close()


async def migrar():
    async with pool.acquire() as con:
        await con.execute("CREATE TABLE IF NOT EXISTS migraciones (nombre text PRIMARY KEY, aplicada timestamptz NOT NULL DEFAULT now())")
        # Un solo proceso migra a la vez aunque arranquen varias réplicas.
        await con.execute("SELECT pg_advisory_lock(7791)")
        try:
            hechas = {r["nombre"] for r in await con.fetch("SELECT nombre FROM migraciones")}
            for ruta in sorted(config.DIR_MIGRACIONES.glob("*.sql")):
                if ruta.name in hechas:
                    continue
                log.info("Aplicando migración %s", ruta.name)
                async with con.transaction():
                    await con.execute(ruta.read_text(encoding="utf-8"))
                    await con.execute("INSERT INTO migraciones (nombre) VALUES ($1)", ruta.name)
        finally:
            await con.execute("SELECT pg_advisory_unlock(7791)")
