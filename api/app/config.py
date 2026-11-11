"""Configuración por variables de entorno (ver .env.example en la raíz)."""
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def _bool(nombre, defecto):
    return os.environ.get(nombre, str(defecto)).strip().lower() in ("1", "true", "si", "sí", "yes", "on")


DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://mapcreator:mapcreator@localhost:5432/mapcreator")
DIR_EDITOR = Path(os.environ.get("OO_DIR_EDITOR", RAIZ / "editor"))
DIR_SITIO = Path(os.environ.get("OO_DIR_SITIO", RAIZ / "sitio"))
DIR_ARCHIVOS = Path(os.environ.get("OO_DIR_ARCHIVOS", RAIZ / ".datos" / "archivos"))
DIR_MIGRACIONES = Path(__file__).resolve().parents[1] / "migraciones"

COOKIE_SESION = "mc_sesion"
COOKIE_SEGURA = _bool("OO_COOKIE_SEGURA", False)          # True detrás de HTTPS
DIAS_SESION = int(os.environ.get("OO_DIAS_SESION", "30"))
REGISTRO_ABIERTO = _bool("OO_REGISTRO_ABIERTO", True)
MAX_SUBIDA_MB = int(os.environ.get("OO_MAX_SUBIDA_MB", "50"))
MAX_DOC_MB = int(os.environ.get("OO_MAX_DOC_MB", "8"))       # un documento (p. ej. el mapa de alturas del terreno)
MAX_PROYECTOS = int(os.environ.get("OO_MAX_PROYECTOS", "50"))  # por usuario
# Correos de administradores, separados por comas. Si está vacío, el usuario más antiguo es el administrador.
ADMINS = {e.strip().lower() for e in os.environ.get("OO_ADMINS", "").split(",") if e.strip()}

# ── Correo (SMTP). Sin SMTP_HOST el envío queda desactivado: no se piden códigos y las cuentas nuevas quedan verificadas. ──
# En producción las inyecta el panel desde la bóveda (grupo map-creator-app → comun). Nunca en el código ni en el repo.
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "") or SMTP_USER
# Solo para pruebas: escribe cada correo como JSON en esta carpeta en vez de enviarlo (y cuenta como correo activo).
CORREO_ARCHIVO = os.environ.get("OO_CORREO_ARCHIVO", "").strip()
CORREO_ACTIVO = bool(SMTP_HOST or CORREO_ARCHIVO)
# Dirección pública para los enlaces de los correos (p. ej. https://map-creator.stellarcodestudio.com). Si falta, se deduce de la
# cabecera Host de la petición.
URL_PUBLICA = os.environ.get("OO_URL_PUBLICA", "").strip().rstrip("/")
# Cabecera con la IP real del visitante cuando hay un proxy delante (p. ej. cf-connecting-ip con Cloudflare). Vacía: la IP de la
# conexión. Solo se usa para limitar intentos.
IP_CABECERA = os.environ.get("OO_IP_CABECERA", "").strip().lower()
