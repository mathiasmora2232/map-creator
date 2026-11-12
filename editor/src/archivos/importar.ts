/* Editor del mapa (2.1, editor v2): modelos 3D (GLB/GLTF) y texturas importados.
   - El archivo se sube al servidor (POST /api/assets → referencias/assets_editor/) y se apunta en la colección «assets» con su
     tamaño, una miniatura y su tipo (modelo o textura).
   - Los modelos salen en el catálogo, categoría «Importados». Al colocarlos se crea un objeto de tipo «modelo:<id>»: para el editor
     es una caja invisible (se elige, mueve, gira y escala como cualquier objeto) que aquí se viste con la malla del GLB.
   - Las texturas sirven para los materiales propios (materiales.js).
   Se carga antes que editor.js porque envuelve OO.construir (editor.js lo copia al arrancar). Lo demás espera a OOEditor. */
(function () {
  'use strict';
  const T = window.THREE, OO = window.OO; if (!T || !OO) return;
  /* ---- cargar scripts de three (exportador/cargador glTF) solo cuando hacen falta ---- */
  const cargados = {};
  function script(url?) { if (cargados[url]) return cargados[url]; cargados[url] = new Promise<void>((ok?, mal?) => { const s = document.createElement('script'); s.src = url; s.onload = () => ok(); s.onerror = () => { delete cargados[url]; mal(new Error('No se pudo cargar ' + url)); }; document.head.appendChild(s); }); return cargados[url]; }
  const BASE = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/';
  const cargador = () => script(BASE + 'loaders/GLTFLoader.js').then(() => new T.GLTFLoader());
  window.OOCargar = { script, cargador, exportador: () => script(BASE + 'exporters/GLTFExporter.js').then(() => new T.GLTFExporter()) };

  /* ---- tipo «modelo:<id>»: caja invisible que se viste con el GLB ---- */
  const construirBase = OO.construir;
  OO.construir = function (o?) {
    const t = String((o && o.tipo) || '');
    if (t.startsWith('modelo:')) {
      const e = (o && o.datos) || {}, sx = Math.max(0.01, +e.sx || 1), sy = Math.max(0.01, +e.sy || 1), sz = Math.max(0.01, +e.sz || 1);
      return [OO.B(0, sy / 2, 0, sx, sy, sz, e.color || '#cccccc', { oculta: true, asset: t.slice(7), nodo: e.nodo || '' })];
    }
    return construirBase(o);
  };

  window.addEventListener('oo-editor-listo', () => {
    const E = window.OOEditor, A = E.api, esc = A.esc, svg = A.svg, $ = (s?) => document.querySelector(s);
    const modelos = new Map<any, any>(); // id del doc → {estado, escena, N}
    function docs(tipo?) { return [...A.efectivos('assets')].filter(([, d]) => d && (!tipo || d.tipo === tipo)); }
    function items() { return docs('modelo').map(([id, d]) => { const k = +d.escala > 0 ? +d.escala : 1; /* (2.1 pro f4) categoría y escala de importación (importar_pro.js) */ return { id: 'asset:' + id, n: d.nombre || 'Modelo', cat: d.categoria || 'importados', tipo: 'modelo:' + id, mini: d.mini || '', asset: id, datos: { sx: A.r3(((d.d0 || [1])[0] || 1) * k), sy: A.r3(((d.d0 || [1, 1])[1] || 1) * k), sz: A.r3(((d.d0 || [1, 1, 1])[2] || 1) * k), color: '#ffffff' } }; }); }
    E.fuentesItems.push((id?) => { if (!String(id).startsWith('asset:')) return null; return items().find((i?) => i.id === id) || null; });
    /* normalización: lleva la caja del modelo al cubo unidad centrado (la caja invisible del objeto es ese cubo escalado y colocado) */
    function preparar(escena?) {
      escena.updateMatrixWorld(true);
      const caja = new T.Box3().setFromObject(escena), size = caja.getSize(new T.Vector3()), c = caja.getCenter(new T.Vector3());
      const N = new T.Matrix4().makeScale(1 / Math.max(size.x, 1e-4), 1 / Math.max(size.y, 1e-4), 1 / Math.max(size.z, 1e-4)).multiply(new T.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      escena.traverse((m?) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((mt?) => { if (A.clip) mt.clippingPlanes = [A.clip]; }); } });
      return { size, N };
    }
    async function modelo(id?) {
      let m = modelos.get(id); if (m) return m.promesa;
      const d = A.efectivos('assets').get(id); if (!d) return null;
      m = { estado: 'cargando' }; modelos.set(id, m);
      m.promesa = (async () => { try { const ld = await cargador(); const g = await new Promise<any>((ok?, mal?) => ld.load(d.url || ('/_blob/' + d.archivo), ok, undefined, mal)); const pr = preparar(g.scene); Object.assign(m, { estado: 'listo', escena: g.scene, N: pr.N, size: pr.size }); A.marcar(); return m; } catch (e) { console.warn('No se pudo cargar el modelo', d.nombre, e); m.estado = 'error'; return null; } })();
      return m.promesa;
    }
    /* un nodo concreto del GLB (escenas importadas: cada nodo es un objeto editable). Se lleva a coordenadas del mundo del GLB. */
    function parteNodo(m?, nombre?) {
      m.nodos = m.nodos || new Map<any, any>(); if (m.nodos.has(nombre)) return m.nodos.get(nombre);
      const n = m.escena.getObjectByName(nombre); if (!n) { m.nodos.set(nombre, null); return null; }
      m.escena.updateMatrixWorld(true);
      const g = new T.Group(); const c = n.clone(true); c.matrixAutoUpdate = false; c.matrix.copy(n.matrixWorld); g.add(c); g.updateMatrixWorld(true);
      const caja = new T.Box3().setFromObject(g), size = caja.getSize(new T.Vector3()), cen = caja.getCenter(new T.Vector3());
      const N = new T.Matrix4().makeScale(1 / Math.max(size.x, 1e-4), 1 / Math.max(size.y, 1e-4), 1 / Math.max(size.z, 1e-4)).multiply(new T.Matrix4().makeTranslation(-cen.x, -cen.y, -cen.z));
      const r = { escena: g, N, size, caja }; m.nodos.set(nombre, r); return r;
    }
    /* vestir cada objeto «modelo:» con su GLB (como modelos_juego.js con los objetos del juego) */
    const vivos = new Map<any, any>(); let grupo = null;
    function sincronizar() {
      requestAnimationFrame(sincronizar);
      if (!grupo) { grupo = new T.Group(); grupo.name = 'modelosImportados'; A.scene.add(grupo); }
      let cambio = false; const vistos = new Set<any>();
      for (const o of E.nuevos().values()) {
        const an = o.partes && o.partes[0]; if (!an || !an.asset || !an.m) continue;
        const m = modelos.get(an.asset); if (!m) { modelo(an.asset); continue; } if (m.estado !== 'listo') continue;
        const fuente = an.nodo ? parteNodo(m, an.nodo) : m; if (!fuente) continue; const clave = an.asset + '#' + (an.nodo || '');
        vistos.add(o.id); let v = vivos.get(o.id);
        if (!v || v.clave !== clave) { if (v) grupo.remove(v.g); const g = fuente.escena.clone(true); g.matrixAutoUpdate = false; v = { g, clave, m: null }; vivos.set(o.id, v); grupo.add(g); }
        if (!v.m || !v.m.equals(an.m)) { v.m = an.m.clone(); v.g.matrix.multiplyMatrices(an.m, fuente.N); v.g.matrixWorldNeedsUpdate = true; cambio = true; }
      }
      for (const [id, v] of vivos) if (!vistos.has(id)) { grupo.remove(v.g); vivos.delete(id); cambio = true; }
      if (cambio) A.marcar();
    }
    requestAnimationFrame(sincronizar);
    /* miniatura de un objeto three (128 px) */
    let rend = null;
    function miniatura(obj?) {
      try {
        if (!rend) { rend = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rend.setSize(128, 128, false); }
        const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x777777, 0.9)); const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(-3, 5, 4); sc.add(dl);
        const g = obj.clone(true); sc.add(g); g.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(g), c = box.getCenter(new T.Vector3()), r = Math.max(0.05, box.getSize(new T.Vector3()).length() / 2);
        const cm = new T.PerspectiveCamera(30, 1, r / 100, r * 100); cm.position.copy(c).add(new T.Vector3(1, 0.75, 1.15).normalize().multiplyScalar(r / Math.sin(15 * Math.PI / 180) * 1.02)); cm.lookAt(c);
        rend.setClearColor(0x000000, 0); rend.render(sc, cm); return rend.domElement.toDataURL('image/png');
      } catch (e) { return ''; }
    }
    async function subir(archivo?) {
      const r = await fetch('/api/assets', { method: 'POST', body: archivo, headers: { 'Content-Type': archivo.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(archivo.name) } });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j;
    }
    function pedirArchivo(accept?, multiple?) { return new Promise<any>((ok?) => { const inp = $('#archivoGen'); inp.accept = accept; inp.multiple = !!multiple; inp.value = ''; inp.onchange = () => ok(Array.from(inp.files || [])); inp.click(); }); }
    async function importarModelo(archivos?) {
      archivos = archivos || await pedirArchivo('.glb,.gltf,model/gltf-binary,model/gltf+json', true); if (!archivos.length) return;
      let ld; try { ld = await cargador(); } catch (e) { A.pista('No se pudo cargar el lector de glTF (¿sin internet?).'); return; }
      for (const f of archivos) {
        A.pista('Importando ' + f.name + '…');
        try {
          const buf = await f.arrayBuffer();
          const g = await new Promise<any>((ok?, mal?) => ld.parse(buf, '', ok, mal));
          const pr = preparar(g.scene); const mini = miniatura(g.scene);
          const r = await subir(f);
          const id = 'as-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          A.guardarCol('assets', id, { tipo: 'modelo', nombre: f.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' '), archivo: r.id, url: r.url, d0: [A.r3(pr.size.x), A.r3(pr.size.y), A.r3(pr.size.z)], mini, mallas: (() => { let n = 0; g.scene.traverse((o?) => { if (o.isMesh) n++; }); return n; })(), creado: A.ahora() });
          A.pista('Modelo «' + f.name + '» en el catálogo (Importados): ' + A.fmt(pr.size.x) + ' × ' + A.fmt(pr.size.y) + ' × ' + A.fmt(pr.size.z) + ' m.');
          if (window.OOCatalogoUI) setTimeout(() => OOCatalogoUI.render(), 50);
        } catch (e) { A.pista('No se pudo importar ' + f.name + ': ' + (e.message || e) + (/\.gltf$/i.test(f.name) ? ' (un .gltf con archivos aparte no se puede: usa .glb)' : '')); }
      }
      renderLista();
    }
    async function importarTextura(archivos?) {
      archivos = archivos || await pedirArchivo('image/png,image/jpeg,image/webp', true); if (!archivos.length) return [];
      const ids = [];
      for (const f of archivos) {
        try {
          const r = await subir(f); const id = 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const url = URL.createObjectURL(f); const mini = await new Promise<any>((ok?) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 96; cv.getContext('2d').drawImage(im, 0, 0, 96, 96); ok(cv.toDataURL('image/jpeg', 0.8)); URL.revokeObjectURL(url); }; im.onerror = () => ok(''); im.src = url; });
          A.guardarCol('assets', id, { tipo: 'textura', nombre: f.name.replace(/\.\w+$/, ''), archivo: r.id, url: r.url, mini, creado: A.ahora() }); ids.push(id);
        } catch (e) { A.pista('No se pudo subir ' + f.name + ': ' + (e.message || e)); }
      }
      if (ids.length) A.pista(ids.length === 1 ? 'Textura importada: úsala en la pestaña Material.' : ids.length + ' texturas importadas.');
      renderLista(); return ids;
    }
    /* pestaña «Catálogo» de la columna derecha: lo importado */
    function renderLista() {
      const el = $('#listaAssets'); if (!el) return;
      const ms = docs('modelo'), ts = docs('textura');
      const tarjeta = ([id, d], tipo?) => `<div class="asset"><img src="${esc(d.mini || '')}" alt=""><span><b>${esc(d.nombre || id)}</b><small>${tipo === 'modelo' && d.d0 ? A.fmt(d.d0[0]) + ' × ' + A.fmt(d.d0[1]) + ' × ' + A.fmt(d.d0[2]) + ' m' : 'Textura'}</small></span>${tipo === 'modelo' ? `<button data-asset-colocar="${esc(id)}" title="Colocar en el mapa">Colocar</button>${window.OOImportarPro ? `<button data-asset-editar="${esc(id)}" title="Nombre, categoría, escala y miniatura">Editar</button>` : ''}` : ''}<button data-asset-quitar="${esc(id)}" title="Quitar del catálogo (el archivo queda en referencias/assets_editor)" aria-label="Quitar">${svg('cerrar')}</button></div>`;
      el.innerHTML = `<div class="fila"><button data-asset-imp="modelo" class="prim">${svg('subir')}Importar modelo (.glb)</button><button data-asset-imp="textura">${svg('subir')}Importar textura</button></div>
        <p class="ayuda">Los modelos van al catálogo de abajo (Importados) y las texturas a la pestaña Material. Se guardan en referencias/assets_editor.</p>
        <h3>Modelos (${ms.length})</h3>${ms.map((x?) => tarjeta(x, 'modelo')).join('') || '<p class="ayuda">Ninguno todavía.</p>'}
        <h3>Texturas (${ts.length})</h3>${ts.map((x?) => tarjeta(x, 'textura')).join('') || '<p class="ayuda">Ninguna todavía.</p>'}`;
    }
    document.addEventListener('click', async (e?) => {
      const b = e.target.closest('[data-asset-imp],[data-asset-colocar],[data-asset-quitar],[data-a="imp-modelo"],[data-a="imp-textura"]'); if (!b) return;
      if (b.dataset.a === 'imp-modelo' || b.dataset.assetImp === 'modelo') { if (window.OOImportarPro) OOImportarPro.importar(); else importarModelo(); } /* (2.1 pro f4) con nombre, categoría y escala */
      else if (b.dataset.a === 'imp-textura' || b.dataset.assetImp === 'textura') importarTextura();
      else if (b.dataset.assetColocar) { A.iniciarColocar('asset:' + b.dataset.assetColocar); }
      else if (b.dataset.assetQuitar) { const id = b.dataset.assetQuitar; if (await A.confirmar('¿Quitar del catálogo?', 'El archivo sigue en referencias/assets_editor; los objetos ya colocados dejarán de verse.', 'Quitar')) { A.guardarCol('assets', id, null); renderLista(); if (window.OOCatalogoUI) OOCatalogoUI.render(); } }
    });
    E.on('tab', (t?) => { if (t === 'assets') renderLista(); });
    E.on('col', (c?) => { if (c === 'assets') { renderLista(); A.renderTodo(); } });
    window.OOImportados = { items, modelo, modelos, importarModelo, importarTextura, docs, renderLista, miniatura, preparar, parteNodo, subir, pedirArchivo };
  });
})();
