/* Editor del mapa (2.1, Map Editor Pro fase 4): modelos GLB/GLTF como assets reutilizables del catálogo.
   Amplía importar.js: antes de subir el archivo se elige nombre, categoría del catálogo (o una nueva), unidades del modelo (m, cm,
   mm, pulgadas) y si se apoya en el suelo. La ficha (colección «assets») guarda además `categoria`, `escala` y `etiquetas`; la tarjeta
   sale en esa categoría con su miniatura (y en «Importados» si no se elige otra). En la pestaña Catálogo, «Editar» cambia nombre,
   categoría y escala y vuelve a hacer la miniatura. Se puede soltar un .glb sobre la vista 3D para importarlo.
   Cada objeto colocado es «modelo:<id>»: todas las copias usan el mismo archivo (se carga una vez). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api || !window.OOImportados) return;
  const A = E.api, esc = A.esc, svg = A.svg, $ = (s?) => document.querySelector(s), IM = window.OOImportados;
  const UNIDADES = [['1', 'Metros'], ['0.01', 'Centímetros'], ['0.001', 'Milímetros'], ['0.0254', 'Pulgadas']];
  function categorias() { const l = A.CATEGORIAS.filter(([k]) => k !== 'componentes').map(([k, n]) => [k, n]); l.unshift(['importados', 'Importados']); return l; }
  function asegurarCategoria(k?, n?) { if (!k || k === 'importados') return; if (!A.CATEGORIAS.some((c?) => c[0] === k)) { const i = A.CATEGORIAS.findIndex((c?) => c[0] === 'componentes'); A.CATEGORIAS.splice(i < 0 ? A.CATEGORIAS.length : i, 0, [k, n || k]); } }
  /* las categorías propias de los assets ya guardados */
  function sincronizarCategorias() { for (const [, d] of IM.docs('modelo')) if (d.categoria && d.categoriaNombre) asegurarCategoria(d.categoria, d.categoriaNombre); }
  const claveCat = (n?) => String(n || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'importados';

  async function opciones(nombre?, previo?) {
    const o = Object.assign({ nombre, categoria: 'importados', escala: 1, etiquetas: '', nueva: '' }, previo || {});
    const pr = A.abrirModal(`<div class="cab">${svg('subir')} ${previo ? 'Editar el modelo' : 'Importar modelo 3D'}</div><div class="cont"><div class="ajustes">
      <label class="campo ancho"><span>Nombre en el catálogo</span><input type="text" id="impNombre" value="${esc(o.nombre)}" data-foco></label>
      <label class="campo"><span>Categoría</span><select id="impCat">${categorias().map(([k, n]) => `<option value="${esc(k)}"${k === o.categoria ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="__nueva">Nueva categoría…</option></select></label>
      <label class="campo"><span>Nueva categoría</span><input type="text" id="impCatNueva" placeholder="p. ej. Maquinaria" value=""></label>
      <label class="campo"><span>Unidades del modelo</span><select id="impEsc">${UNIDADES.map(([v, n]) => `<option value="${v}"${Math.abs(+v - o.escala) < 1e-9 ? ' selected' : ''}>${n}</option>`).join('')}${UNIDADES.some(([v]) => Math.abs(+v - o.escala) < 1e-9) ? '' : `<option value="${o.escala}" selected>× ${o.escala}</option>`}</select></label>
      <label class="campo ancho"><span>Etiquetas (para buscarlo)</span><input type="text" id="impEtq" value="${esc(o.etiquetas)}" placeholder="maquina, bodega"></label>
      <p class="ayuda">El archivo se guarda una vez en referencias/assets_editor y cada copia colocada lo reutiliza.</p></div></div>
      <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">${previo ? 'Guardar' : 'Importar'}</button></div>`);
    if (await pr !== true) return null;
    return o;
  }
  /* lee los campos del modal justo antes de cerrarse */
  function leerModal(o?) {
    const v = (id?) => { const el = $(id); return el ? el.value : ''; };
    o.nombre = v('#impNombre').trim() || o.nombre; o.escala = +v('#impEsc') || 1; o.etiquetas = v('#impEtq').trim();
    const c = v('#impCat'); if (c === '__nueva' || v('#impCatNueva').trim()) { const n = v('#impCatNueva').trim(); if (n) { o.categoria = claveCat(n); o.categoriaNombre = n; } else o.categoria = 'importados'; } else o.categoria = c || 'importados';
  }
  document.addEventListener('click', (e?) => { if (e.target.closest && e.target.closest('#modal [data-a="m-si"]') && $('#impNombre')) { const o = ultimoModal; if (o) leerModal(o); } }, true);
  let ultimoModal = null;
  async function preguntar(nombre?, previo?) { ultimoModal = Object.assign({ nombre, categoria: 'importados', escala: 1, etiquetas: '' }, previo || {}); const r = await opciones(nombre, previo); const o = ultimoModal; ultimoModal = null; return r ? o : null; }

  /* importar con opciones (opts sin preguntar: {nombre, categoria, categoriaNombre, escala, etiquetas}) */
  async function importar(archivos?, opts?) {
    archivos = archivos || await IM.pedirArchivo('.glb,.gltf,model/gltf-binary,model/gltf+json', true); if (!archivos || !archivos.length) return [];
    let ld; try { ld = window.OOCargar ? await OOCargar.cargador() : null; } catch (e) { ld = null; } if (!ld) { A.pista('No se pudo cargar el lector de glTF (¿sin internet?).'); return []; }
    const ids = [];
    for (const f of archivos) {
      const base = f.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' ');
      const o = opts ? Object.assign({ nombre: base, categoria: 'importados', escala: 1, etiquetas: '' }, opts) : await preguntar(base); if (!o) continue;
      A.pista('Importando ' + f.name + '…');
      try {
        const buf = await f.arrayBuffer(); const g = await new Promise<any>((ok?, mal?) => ld.parse(buf, '', ok, mal));
        const pr = IM.preparar(g.scene); const mini = IM.miniatura(g.scene); const r = await IM.subir(f);
        const id = 'as-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); let n = 0; g.scene.traverse((x?) => { if (x.isMesh) n++; });
        if (o.categoriaNombre) asegurarCategoria(o.categoria, o.categoriaNombre);
        A.guardarCol('assets', id, { tipo: 'modelo', nombre: o.nombre, archivo: r.id, url: r.url, d0: [A.r3(pr.size.x), A.r3(pr.size.y), A.r3(pr.size.z)], mini, mallas: n, categoria: o.categoria || 'importados', categoriaNombre: o.categoriaNombre || undefined, escala: +o.escala || 1, etiquetas: o.etiquetas || '', archivoOriginal: f.name, bytes: f.size, creado: A.ahora() });
        ids.push(id); const k = +o.escala || 1;
        A.pista('Modelo «' + o.nombre + '» en el catálogo: ' + A.fmt(pr.size.x * k) + ' × ' + A.fmt(pr.size.y * k) + ' × ' + A.fmt(pr.size.z * k) + ' m.');
      } catch (e) { A.pista('No se pudo importar ' + f.name + ': ' + (e.message || e) + (/\.gltf$/i.test(f.name) ? ' (un .gltf con archivos aparte no se puede: usa .glb)' : '')); }
    }
    IM.renderLista(); if (window.OOCatalogoUI) setTimeout(() => OOCatalogoUI.render(), 30);
    return ids;
  }
  /* editar la ficha: nombre, categoría, escala; la miniatura se rehace con el modelo cargado */
  async function editar(id?, cambios?) {
    const d = A.efectivos('assets').get(id); if (!d) return false;
    const o = cambios ? Object.assign({}, cambios) : await preguntar(d.nombre, { nombre: d.nombre, categoria: d.categoria || 'importados', escala: +d.escala || 1, etiquetas: d.etiquetas || '' }); if (!o) return false;
    if (o.categoriaNombre) asegurarCategoria(o.categoria, o.categoriaNombre);
    let mini = d.mini; try { const m = await IM.modelo(id); if (m && m.escena) mini = IM.miniatura(m.escena) || mini; } catch (e) { /* queda la de antes */ }
    A.guardarCol('assets', id, Object.assign({}, d, { nombre: o.nombre || d.nombre, categoria: o.categoria || d.categoria || 'importados', categoriaNombre: o.categoriaNombre || d.categoriaNombre, escala: +o.escala || +d.escala || 1, etiquetas: o.etiquetas != null ? o.etiquetas : d.etiquetas, mini, actualizado: A.ahora() }));
    IM.renderLista(); if (window.OOCatalogoUI) setTimeout(() => OOCatalogoUI.render(), 30); return true;
  }
  document.addEventListener('click', (e?) => { const b = e.target.closest && e.target.closest('[data-asset-editar]'); if (b) { e.preventDefault(); editar(b.dataset.assetEditar); } });
  /* soltar un .glb sobre la vista */
  const vista = A.dom;
  if (vista) {
    vista.addEventListener('dragover', (e?) => { if (e.dataTransfer && [...(e.dataTransfer.items || [])].some((i?) => i.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    vista.addEventListener('drop', (e?) => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f?) => /\.(glb|gltf)$/i.test(f.name)); if (!fs.length) return; e.preventDefault(); e.stopPropagation(); importar(fs); });
  }
  E.on('col', (c?) => { if (c === 'assets') sincronizarCategorias(); });
  E.on('mapa', sincronizarCategorias);
  window.OOImportarPro = { importar, editar, categorias, asegurarCategoria, claveCat };
})();
