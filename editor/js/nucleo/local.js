/* Editor del mapa en local (2.0.6): imita las capacidades db, assets y user del visor de claude.ai con el servidor local
   (servidor.py), para que el mismo editor funcione abierto en el navegador. Los cambios quedan en datos_usuario/*.json del repo y
   las fotos son las de la carpeta referencias. */
(function () {
  /* Modo nube (Map Creator): con ?p=<proyecto> en la URL el editor trabaja contra la API (api/app/rutas/editor_datos.py) con la sesión
     del usuario. Cada petición a /api/ lleva X-OO-Proyecto; las colecciones se piden con ETag (304 si no cambió nada); un 401 manda a
     entrar. ?m=<mapa> elige el mapa que se abre (editor.js lo lee de localStorage al arrancar, por eso se pone aquí, antes). */
  const qs = new URLSearchParams(location.search);
  const PROYECTO = qs.get('p');
  const NUBE = !!PROYECTO;
  if (NUBE && /^[A-Za-z0-9_\-]{1,64}$/.test(qs.get('m') || '')) { try { localStorage.setItem('oo-editor-mapa', qs.get('m')); } catch (e) { } }
  const etags = new Map(), ultimos = new Map();
  /* (2.1) Versión del mapa que cargó esta pestaña (editor.js la apunta en OOVersionMapa al descargar mapa_<mapa>.json). Toda escritura en
     /api/db la manda en X-OO-Mapas: si el mapa se regeneró y el servidor migró las referencias a piezas, rechaza (409) lo que esta pestaña
     escriba con índices del mapa viejo, y aquí sale un aviso para recargar. También avisa si una lectura trae otra versión vigente. */
  window.OOVersionMapa = window.OOVersionMapa || {};
  const fetchOriginal = window.fetch.bind(window);
  let avisoRecarga = null;
  function avisarRecarga(texto) {
    if (avisoRecarga) { avisoRecarga.querySelector('span').textContent = texto; return; }
    const pon = () => {
      avisoRecarga = document.createElement('div'); avisoRecarga.id = 'avisoRecarga';
      avisoRecarga.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99999;max-width:min(720px,94vw);background:#b4441b;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:12px;align-items:center';
      avisoRecarga.innerHTML = '<span></span><button style="flex:none;background:#fff;color:#b4441b;border:0;border-radius:6px;padding:6px 12px;font-weight:700;cursor:pointer">Recargar</button>';
      avisoRecarga.querySelector('span').textContent = texto;
      avisoRecarga.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(avisoRecarga);
    };
    if (document.body) pon(); else document.addEventListener('DOMContentLoaded', pon, { once: true });
  }
  const cabeceraMapas = () => Object.entries(window.OOVersionMapa).map(([k, v]) => k + '=' + v).join(',');
  window.fetch = function (url, opt) {
    const u = typeof url === 'string' ? url : (url && url.url) || '';
    const rel = u.replace(location.origin, '');
    if (NUBE && /^\/?api\//.test(rel)) {
      opt = Object.assign({}, opt); const h = new Headers(opt.headers || {}); h.set('X-OO-Proyecto', PROYECTO); opt.headers = h;
    }
    if (!/^\/?api\/db\//.test(rel)) return NUBE ? fetchOriginal(url, opt).then(sinSesion) : fetchOriginal(url, opt);
    const metodo = String((opt && opt.method) || 'GET').toUpperCase();
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      opt = Object.assign({}, opt); const h = new Headers(opt.headers || {}); const c = cabeceraMapas(); if (c) h.set('X-OO-Mapas', c); opt.headers = h;
    }
    return fetchOriginal(url, opt).then(sinSesion).then(r => {
      if (r.status === 409) r.clone().json().then(j => { if (j && j.code === 'failed_precondition') avisarRecarga(j.error); }).catch(() => { });
      const vig = r.headers.get('X-OO-Mapas-Vigentes');
      if (vig) for (const parte of vig.split(',')) {
        const [k, v] = parte.split('='); const mia = window.OOVersionMapa[k];
        if (mia && v && mia !== v) avisarRecarga('El mapa «' + k + '» del juego se regeneró y las referencias a sus piezas se migraron. Recarga la página (F5) para seguir editando sin pisar nada.');
      }
      return r;
    });
  };
  function sinSesion(r) {
    if (r.status === 401) location.href = '/entrar?siguiente=' + encodeURIComponent(location.pathname + location.search);
    if (r.status === 404 && NUBE && /^\/api\//.test(new URL(r.url).pathname)) r.clone().json().then(j => { if (j && j.code === 'not_found' && /proyecto/.test(j.error || '')) location.href = '/app'; }).catch(() => { });
    return r;
  }
  /* Lee una colección entera. En la nube manda el ETag de la última lectura: si no cambió, el servidor responde 304 sin cuerpo. */
  async function leerColeccion(c) {
    const h = {}; if (NUBE && etags.has(c)) h['If-None-Match'] = etags.get(c);
    const r = await fetch('/api/db/' + c, { cache: 'no-store', headers: h });
    if (r.status === 304 && ultimos.has(c)) return ultimos.get(c);
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw { code: j.code || 'unavailable', message: j.error || ('Error ' + r.status) }; }
    const docs = (await r.json()).docs;
    if (NUBE) { const e = r.headers.get('ETag'); if (e) { etags.set(c, e); ultimos.set(c, docs); } }
    return docs;
  }
  window.OOAvisoRecarga = avisarRecarga;
  const avisos = new Set(); let tAvisos = null;
  const rnd = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  async function pedir(metodo, col, id, datos) {
    const r = await fetch('/api/db/' + col + (id ? '/' + encodeURIComponent(id) : ''), {
      method: metodo, headers: { 'Content-Type': 'application/json' }, body: datos === undefined ? undefined : JSON.stringify(datos)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: j.code || 'unavailable', message: j.error || ('Error ' + r.status) };
    /* (2.1 pro f6) antes cada escritura volvía a pedir enteras todas las colecciones (cambios.json pasa de 500 KB): al arrastrar, decenas de lecturas compitiendo con las escrituras. Ahora una sola relectura 300 ms después de la última escritura. */
    clearTimeout(tAvisos); tAvisos = setTimeout(() => avisos.forEach(f => f()), 300);
    return j;
  }
  function instantanea(docs) {
    const lista = docs.map(d => ({ id: d.id, exists: true, data: () => d.data, metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs: lista, size: lista.length, empty: !lista.length, metadata: { fromCache: false, hasPendingWrites: false },
      docChanges: () => lista.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })) };
  }
  function documento(col, id) {
    return {
      id, path: col + '/' + id,
      set: d => pedir('PUT', col, id, d).then(() => undefined),
      update: d => pedir('PATCH', col, id, d).then(() => undefined),
      delete: () => pedir('DELETE', col, id).then(() => undefined),
      get: async () => {
        const d = (await leerColeccion(col)).find(x => x.id === id);
        return { id, exists: !!d, data: () => d && d.data, metadata: { fromCache: false, hasPendingWrites: false } };
      },
      collection: sub => coleccion(col + '/' + id + '/' + sub)
    };
  }
  function coleccion(col) {
    const c = col.replace(/\//g, '__');
    const q = {
      path: col,
      where: () => q, orderBy: () => q, limit: () => q,
      get: async () => instantanea(await leerColeccion(c)),
      onSnapshot(next, error) {
        let ultimo = '', vivo = true;
        const tirar = async () => {
          if (!vivo) return;
          try {
            const docs = await leerColeccion(c);
            const s = JSON.stringify(docs);
            if (s !== ultimo) { ultimo = s; next(instantanea(docs)); }
          } catch (e) { if (error && !ultimo) error({ code: e.code || 'unavailable', message: e.message || 'El servidor no responde' }); }
        };
        tirar();
        const t = setInterval(tirar, 2000);
        avisos.add(tirar);
        return () => { vivo = false; clearInterval(t); avisos.delete(tirar); };
      },
      doc: id => documento(c, id || rnd()),
      add: async d => { const j = await pedir('POST', c, null, d); return documento(c, j.id); }
    };
    return q;
  }
  const db = { collection: coleccion, doc: ruta => { const p = ruta.split('/'); return documento(p.slice(0, -1).join('__'), p[p.length - 1]); } };
  const assets = {
    upload: async (blob, opts) => {
      const r = await fetch('/api/fotos', { method: 'POST', body: blob, headers: {
        'Content-Type': (opts && opts.type) || blob.type || 'image/jpeg', 'X-Nombre': encodeURIComponent(blob.name || 'foto.jpg') } });
      if (!r.ok) throw { code: 'unavailable', message: 'No se pudo guardar la foto' };
      return r.json();
    },
    list: async () => (await fetch('/api/fotos', { cache: 'no-store' })).json(),
    delete: async () => { throw { code: 'not_granted', message: 'Borra la foto desde la carpeta de referencias' }; }
  };
  const user = NUBE ? usuarioNube() : {
    id: async () => 'local', me: async () => ({ id: 'local', name: 'Matías' }), profiles: async () => ({}),
    isOwner: () => true, canEdit: () => true, can: () => true, search: async () => []
  };
  function usuarioNube() {
    let rol = null;
    const yo = fetch('/api/cuenta/yo', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    const proyecto = fetch('/api/proyectos/' + encodeURIComponent(PROYECTO), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    proyecto.then(p => { if (p) rol = p.rol; });
    window.OONube = { proyecto: PROYECTO, info: proyecto, yo };
    return {
      id: async () => (await yo).id || null, me: async () => { const u = await yo; return { id: u.id, name: u.nombre }; }, profiles: async () => ({}),
      isOwner: () => rol === 'dueno', canEdit: () => rol !== 'lector', can: () => rol !== 'lector', search: async () => []
    };
  }
  const capacidades = { db, assets, user };
  window.claude = { use: n => Promise.resolve(capacidades[n] || null) };
})();
