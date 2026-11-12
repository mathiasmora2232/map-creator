# Imagen de Map Creator: API FastAPI + sitio + editor (estáticos). Se construye desde la raíz del repo:
#   docker build -f api/Dockerfile .
# Etapa 1: compila el TypeScript (sitio/src → sitio/js, editor/src → editor/js) con esbuild y comprueba los tipos con tsc.
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY scripts/build.mjs ./scripts/build.mjs
COPY sitio/src ./sitio/src
COPY editor/tsconfig.json ./editor/tsconfig.json
COPY editor/src ./editor/src
RUN npm run tipos && npm run build -- --min

# Etapa 2: la API con los estáticos ya compilados.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    OO_DIR_EDITOR=/srv/editor OO_DIR_SITIO=/srv/sitio OO_DIR_ARCHIVOS=/data/archivos

WORKDIR /srv/api
COPY api/requirements.txt .
RUN pip install -r requirements.txt

COPY api/app ./app
COPY api/migraciones ./migraciones
COPY api/scripts ./scripts
COPY api/plantillas ./plantillas
COPY sitio /srv/sitio
COPY --from=web /web/sitio/js /srv/sitio/js
# Solo lo que sirve el navegador: el modo local (editor/local: servidor.py, datos_usuario…) no entra en la imagen.
COPY editor/index.html /srv/editor/index.html
COPY editor/css /srv/editor/css
COPY --from=web /web/editor/js /srv/editor/js
COPY editor/mapas /srv/editor/mapas

RUN rm -rf /srv/sitio/src && useradd --system --uid 10001 mapcreator && mkdir -p /data/archivos && chown -R mapcreator /data
USER mapcreator
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/salud').status == 200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
