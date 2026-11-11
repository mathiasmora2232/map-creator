"""Envío de correo por SMTP (configurado con SMTP_* en el entorno) y plantillas de los mensajes de la app.

Sin SMTP_HOST no se envía nada (CORREO_ACTIVO es False) y quien llama decide qué hacer. Con OO_CORREO_ARCHIVO (pruebas) cada correo
se escribe como JSON en esa carpeta. El envío corre en un hilo para no bloquear el servidor.
"""
import asyncio
import html
import re
import json
import logging
import secrets
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from pathlib import Path

from fastapi import Request

from . import config

log = logging.getLogger("mapcreator.correo")
ACENTO = "#e2690b"


def url_base(request: Request | None) -> str:
    if config.URL_PUBLICA or request is None:
        return config.URL_PUBLICA
    esquema = "https" if config.COOKIE_SEGURA else request.url.scheme
    return "%s://%s" % (esquema, request.headers.get("host", "localhost"))


def _enviar_smtp(msg: EmailMessage) -> None:
    contexto = ssl.create_default_context()
    if config.SMTP_PORT == 465:
        servidor = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=20, context=contexto)
    else:
        servidor = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20)
    with servidor:
        if config.SMTP_PORT != 465:
            servidor.ehlo()
            if servidor.has_extn("starttls"):
                servidor.starttls(context=contexto)
                servidor.ehlo()
        if config.SMTP_USER:
            servidor.login(config.SMTP_USER, config.SMTP_PASS)
        servidor.send_message(msg)


def _guardar_archivo(para: str, asunto: str, texto: str, html_: str) -> None:
    carpeta = Path(config.CORREO_ARCHIVO)
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = "%d-%s.json" % (time.time_ns(), secrets.token_hex(3))
    (carpeta / nombre).write_text(json.dumps({"para": para, "asunto": asunto, "texto": texto, "html": html_}, ensure_ascii=False), "utf-8")


async def enviar(para: str, asunto: str, texto: str, html_: str) -> bool:
    """True si se envió. Nunca lanza: un fallo de SMTP se registra y quien llama sigue (el usuario puede pedir otro código)."""
    if not config.CORREO_ACTIVO:
        log.info("Correo desactivado (sin SMTP_HOST): no se envía «%s» a %s", asunto, para)
        return False
    try:
        if config.SMTP_HOST:
            msg = EmailMessage()
            nombre, direccion = parseaddr(config.SMTP_FROM)
            if "@" not in direccion:  # remitente mal formado: se usa la cuenta SMTP
                direccion = config.SMTP_USER
            msg["From"] = formataddr((nombre or "Map Creator", direccion))
            msg["To"] = para
            msg["Subject"] = asunto
            msg["Message-ID"] = make_msgid(domain=(direccion.split("@")[-1] or None))
            msg.set_content(texto)
            msg.add_alternative(html_, subtype="html")
            await asyncio.to_thread(_enviar_smtp, msg)
        else:
            await asyncio.to_thread(_guardar_archivo, para, asunto, texto, html_)
        return True
    except Exception:  # noqa: BLE001 — cualquier fallo del servidor de correo
        log.exception("No se pudo enviar «%s» a %s", asunto, para)
        return False


# ───────────────────────── Plantillas ─────────────────────────
def _plantilla(titulo: str, parrafos: list[str], codigo: str | None = None, boton: tuple[str, str] | None = None,
               pie: str = "") -> tuple[str, str]:
    """(texto plano, HTML). Los párrafos llegan ya escapados para HTML si llevan datos del usuario (usa _e)."""
    texto = [titulo, ""]
    for p in parrafos:
        texto += [html.unescape(_sin_etiquetas(p)), ""]
    if codigo:
        texto += ["Código: " + codigo, ""]
    if boton:
        texto += ["%s: %s" % boton, ""]
    if pie:
        texto += ["—", html.unescape(_sin_etiquetas(pie))]
    cuerpo = "".join('<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3b434d">%s</p>' % p for p in parrafos)
    if codigo:
        cuerpo += ('<div style="margin:22px 0;padding:18px;border-radius:10px;background:#f4f5f7;text-align:center;'
                   'font:600 32px/1 ui-monospace,Consolas,monospace;letter-spacing:10px;color:#161b22">%s</div>' % codigo)
    if boton:
        cuerpo += ('<p style="margin:22px 0"><a href="%s" style="display:inline-block;background:%s;color:#fff;text-decoration:none;'
                   'font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">%s</a></p>' % (_e(boton[1]), ACENTO, _e(boton[0])))
    html_ = f"""<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #dde1e6;border-radius:14px">
<tr><td style="padding:22px 28px;border-bottom:1px solid #eceef1"><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:{ACENTO};vertical-align:middle"></span>
<b style="font-size:15px;color:#161b22;vertical-align:middle;margin-left:8px">Map Creator</b></td></tr>
<tr><td style="padding:26px 28px 12px"><h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:#161b22">{_e(titulo)}</h1>{cuerpo}</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #eceef1;font-size:12.5px;line-height:1.5;color:#8a939d">{pie or 'Recibes este correo por tu cuenta de Map Creator.'}</td></tr>
</table></td></tr></table></body></html>"""
    return "\n".join(texto), html_


def _e(t) -> str:
    return html.escape(str(t), quote=True)


def _sin_etiquetas(t: str) -> str:
    return re.sub(r"<[^>]+>", "", t)


NO_FUISTE = "Si no fuiste tú, ignora este correo: nadie puede usar el código sin acceso a tu buzón."


def codigo_verificar(nombre, codigo):
    return "Tu código para verificar el correo: " + codigo, *_plantilla(
        "Verifica tu correo", ["Hola, %s. Escribe este código en Map Creator para confirmar que este correo es tuyo:" % _e(nombre)],
        codigo, pie="El código caduca en 15 minutos. " + NO_FUISTE)


def codigo_recuperar(nombre, codigo, url):
    return "Código para cambiar tu contraseña: " + codigo, *_plantilla(
        "Cambia tu contraseña", ["Hola, %s. Pediste cambiar la contraseña de tu cuenta. Usa este código:" % _e(nombre)],
        codigo, ("Cambiar la contraseña", url), pie="El código caduca en 15 minutos. " + NO_FUISTE + " Tu contraseña actual sigue igual.")


def codigo_entrar(nombre, codigo):
    return "Tu código para entrar: " + codigo, *_plantilla(
        "Código para entrar", ["Hola, %s. Alguien (seguramente tú) escribió bien tu contraseña. Para terminar de entrar, usa este código:" % _e(nombre)],
        codigo, pie="Caduca en 15 minutos. Si no estabas entrando, cambia tu contraseña: alguien la conoce.")


def codigo_cambiar_correo(nombre, codigo):
    return "Código para confirmar tu nuevo correo: " + codigo, *_plantilla(
        "Confirma tu nuevo correo", ["Hola, %s. Para usar esta dirección en tu cuenta de Map Creator, escribe este código:" % _e(nombre)],
        codigo, pie="Caduca en 15 minutos. " + NO_FUISTE)


def aviso_clave_cambiada(nombre, url):
    return "Tu contraseña cambió", *_plantilla(
        "Tu contraseña cambió", ["Hola, %s. La contraseña de tu cuenta se acaba de cambiar y se cerraron las sesiones en otros dispositivos." % _e(nombre),
                                 "Si fuiste tú, no tienes que hacer nada. Si no, recupérala ahora:"],
        boton=("Recuperar mi cuenta", url))


def aviso_correo_cambiado(nombre, nuevo, url):
    return "El correo de tu cuenta cambió", *_plantilla(
        "El correo de tu cuenta cambió", ["Hola, %s. Tu cuenta de Map Creator ahora usa <b>%s</b>. Este correo ya no sirve para entrar." % (_e(nombre), _e(nuevo)),
                                          "Si no fuiste tú, escríbele al administrador del servidor cuanto antes."],
        boton=("Ir a Map Creator", url))


def invitacion(invita, proyecto, rol, url, dias):
    puede = "editar" if rol == "editor" else "ver"
    caduca = ("El enlace caduca en %d días y sirve para una persona." % dias) if dias else "El enlace sirve para una persona."
    if proyecto:
        asunto = "%s te invita a %s «%s»" % (invita, puede, proyecto)
        parrafos = ["<b>%s</b> te invita a %s el mapa <b>%s</b> en Map Creator, un editor de mapas 3D en el navegador." % (_e(invita), puede, _e(proyecto)),
                    "Si no tienes cuenta, la creas al abrir el enlace."]
    else:
        asunto = "%s te invita a Map Creator" % invita
        parrafos = ["<b>%s</b> te invita a crear una cuenta en Map Creator, un editor de mapas 3D en el navegador." % _e(invita)]
    return asunto, *_plantilla(asunto, parrafos, boton=("Aceptar la invitación", url), pie=caduca + " Si no esperabas esta invitación, ignórala.")


def compartido(invita, proyecto, rol, url):
    puede = "editar" if rol == "editor" else "ver"
    asunto = "%s compartió «%s» contigo" % (invita, proyecto)
    return asunto, *_plantilla(asunto, ["<b>%s</b> te dio permiso para %s el mapa <b>%s</b>. Ya lo tienes en «Compartidos conmigo»." % (_e(invita), puede, _e(proyecto))],
                               boton=("Abrir el mapa", url))
