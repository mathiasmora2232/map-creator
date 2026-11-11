/* Editor del mapa (2.1, editor v2): catálogo de abajo como en el concepto.
   Pestañas Catálogo / Piezas recientes / Favoritos; categorías con su cantidad a la izquierda; buscador; filtros (Todo, Pared, Puerta,
   Ventana, Techo, Suelo, Prop, Vegetación); vista de rejilla o lista; tamaño de las tarjetas; estrella de favorito.
   Se coloca con clic (y clic en el mapa) o arrastrando la tarjeta. Las tarjetas de «Construcción» activan la herramienta (pared, puerta
   de cada tipo, ventana, techo, suelos). «Mis prefabs» son los componentes guardados (prefabs.js añade sus acciones). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, $ = s => document.querySelector(s), esc = A.esc, svg = A.svg;
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; };
  const leerLista = k => { try { const l = JSON.parse(ls(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  let pestana = 'todo', cat = ls('oo-editor-catcat') || 'todo', filtroTipo = 'todo', modo = ls('oo-editor-catmodo') === 'lista' ? 'lista' : 'rejilla';
  let favs = new Set(leerLista('oo-editor-favoritos')), recientes = leerLista('oo-editor-recientes');
  const FILTROS = [['todo', 'Todo'], ['pared', 'Pared'], ['puerta', 'Puerta'], ['ventana', 'Ventana'], ['techo', 'Techo'], ['suelo', 'Suelo'], ['prop', 'Prop'], ['vegetacion', 'Vegetación']];
  const ICONO_CAT = { todo: 'carpeta', construccion: 'construir', componentes: 'prefab', importados: 'subir', vehiculos: 'coche', naturaleza: 'terreno', iluminacion: 'bombilla', senalizacion: 'info', seguridad: 'info' };
  /* tarjetas de construcción: activan una herramienta con sus parámetros */
  function herramientasCat() {
    const MAT = A.MATERIALES, l = [];
    const estilos = (window.OOCartel && OOCartel.OPCIONES && OOCartel.OPCIONES.estilo) || [['metal_oficina', 'Puerta metálica']];
    l.push({ id: 'herr:pared', n: 'Pared de bloque', cat: 'construccion', herr: { h: 'pared', p: { material: 'bloque', color: MAT.bloque.c } }, tipo: 'muro', datos: { sx: 2.4, sy: 2.6, sz: 0.2, material: 'bloque', color: MAT.bloque.c }, f: 'pared' });
    l.push({ id: 'herr:pared_ladrillo', n: 'Pared de ladrillo', cat: 'construccion', herr: { h: 'pared', p: { material: 'ladrillo', color: MAT.ladrillo.c } }, tipo: 'muro', datos: { sx: 2.4, sy: 2.6, sz: 0.2, material: 'ladrillo', color: MAT.ladrillo.c }, f: 'pared' });
    l.push({ id: 'herr:pared_vidrio', n: 'Mampara de vidrio', cat: 'construccion', herr: { h: 'pared', p: { material: 'vidrio', color: MAT.vidrio.c } }, tipo: 'muro', datos: { sx: 2.4, sy: 2.6, sz: 0.08, material: 'vidrio', color: MAT.vidrio.c }, f: 'pared' });
    l.push({ id: 'herr:habitacion', n: 'Habitación', cat: 'construccion', herr: { h: 'habitacion', p: { modo: 'rect' } }, tipo: 'calle', datos: { sx: 3, sy: 0.05, sz: 2.5, material: 'baldosa', color: MAT.baldosa.c }, f: 'suelo' });
    for (const [v, n] of estilos) l.push({ id: 'herr:puerta:' + v, n, cat: 'construccion', herr: { h: 'puerta', p: { estilo: v } }, tipo: 'puerta', datos: { estilo: v, sx: 0.9, sy: 2.1, sz: 0.2, color: '#5d666b', hoja: '#4a555a' }, f: 'puerta' });
    l.push({ id: 'herr:ventana', n: 'Ventana', cat: 'construccion', herr: { h: 'ventana', p: {} }, tipo: 'ventana', datos: { sx: 1.2, sy: 1.0, sz: 0.2, alfeizar: 0, color: '#3d7fbf' }, f: 'ventana' });
    for (const m of ['chapa', 'concreto', 'madera']) l.push({ id: 'herr:techo:' + m, n: 'Techo de ' + MAT[m].n.toLowerCase(), cat: 'construccion', herr: { h: 'techo', p: { material: m, color: MAT[m].c } }, tipo: 'calle', datos: { sx: 3, sy: 0.15, sz: 2, material: m, color: MAT[m].c }, f: 'techo' });
    for (const m of ['asfalto', 'concreto', 'adoquin', 'baldosa', 'cesped', 'tierra']) l.push({ id: 'herr:suelo:' + m, n: 'Suelo de ' + MAT[m].n.toLowerCase(), cat: 'construccion', herr: { h: 'suelo', p: { material: m, color: MAT[m].c } }, tipo: 'calle', datos: { sx: 3, sy: 0.05, sz: 3, material: m, color: MAT[m].c }, f: m === 'cesped' ? 'vegetacion' : 'suelo' });
    return l;
  }
  let HERR_CAT = null;
  const herrCat = () => HERR_CAT || (HERR_CAT = herramientasCat());
  function prefabs() { return A.itemsCategoria('componentes').map(it => Object.assign({}, it, { cat: 'componentes', prefab: true })); }
  function importados() { return window.OOImportados ? OOImportados.items() : []; }
  const herrPro = () => (window.OOCatalogoPro ? OOCatalogoPro.herramientas() : []); /* (2.1 pro f4) cubiertas con miniatura (catalogo_pro.js) */
  function todos() { return herrCat().concat(herrPro(), A.ITEMS, prefabs(), importados()); }
  function tipoFiltro(it) {
    if (it.f) return it.f;
    const t = A.tipoBase(it.tipo), txt = (it.id + ' ' + it.n).toLowerCase();
    if (t === 'muro' || /pared|muro|valla|cerca|reja|mampara/.test(txt)) return 'pared';
    if (t === 'puerta' || /puerta|port[oó]n/.test(txt)) return 'puerta';
    if (t === 'ventana' || /ventana/.test(txt)) return 'ventana';
    if (t === 'techo' || /techo|toldo|cubierta|cobertizo/.test(txt)) return 'techo';
    if (t === 'calle' || /suelo|piso|calle|vereda|alfombra|tapete|baldosa|reductor/.test(txt)) return 'suelo';
    if (t === 'arbol' || it.cat === 'naturaleza' || /arbol|árbol|planta|arbust|palmera|maceta|c[eé]sped/.test(txt)) return 'vegetacion';
    return 'prop';
  }
  const sinTilde = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function categorias() {
    const l = todos(); const cnt = new Map(); for (const it of l) cnt.set(it.cat, (cnt.get(it.cat) || 0) + 1);
    const out = [['todo', 'Todo', l.length], ['construccion', 'Construcción', cnt.get('construccion') || 0]];
    for (const [k, n] of A.CATEGORIAS) { if (k === 'componentes') continue; out.push([k, n, cnt.get(k) || 0]); }
    out.push(['componentes', 'Mis prefabs', cnt.get('componentes') || 0]);
    if (window.OOImportados) out.push(['importados', 'Importados', cnt.get('importados') || 0]);
    return out;
  }
  function itemsVisibles() {
    let l;
    if (pestana === 'recientes') { const t = todos(); l = recientes.map(id => t.find(x => x.id === id) || A.itemPorId(id)).filter(Boolean); }
    else if (pestana === 'favoritos') l = todos().filter(it => favs.has(it.id));
    else l = cat === 'todo' ? todos() : todos().filter(it => it.cat === cat);
    const q = sinTilde(($('#catBuscar') || {}).value || '').trim();
    if (q) { const base = pestana === 'todo' ? todos() : l; const nc = k => ((A.CATEGORIAS.find(c => c[0] === k) || [])[1] || ''); l = base.filter(i => q.split(/\s+/).every(w => sinTilde(i.n + ' ' + nc(i.cat) + ' ' + String(i.id).replace(/[_:]/g, ' ')).includes(w))); }
    if (filtroTipo !== 'todo') l = l.filter(it => tipoFiltro(it) === filtroTipo);
    return l;
  }
  function render() {
    const cc = $('#catCats'); if (!cc) return;
    cc.innerHTML = categorias().map(([k, n, c]) => `<li><button data-cat="${esc(k)}" class="${k === cat && pestana === 'todo' ? 'on' : ''}">${svg(ICONO_CAT[k] || 'carpeta')}<span>${esc(n)}</span><small>${A.fmtInt(c)}</small></button></li>`).join('');
    $('#catFiltros').innerHTML = FILTROS.map(([k, n]) => `<button class="chip${k === filtroTipo ? ' on' : ''}" data-filtro="${k}">${esc(n)}</button>`).join('');
    document.querySelectorAll('[data-ctab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ctab === pestana)));
    document.querySelectorAll('[data-a="cat-modo"]').forEach(b => b.classList.toggle('on', b.dataset.v === modo));
    const cont = $('#catItems'); cont.classList.toggle('lista', modo === 'lista');
    const its = itemsVisibles(); const activo = A.herramienta === 'colocar' ? A.params.colocar.item : null;
    cont.innerHTML = its.map(it => {
      const herr = !!it.herr;
      return `<div class="item${activo === it.id ? ' on' : ''}" role="button" tabindex="0" data-a="${herr ? 'cat-herr' : 'cat-item'}" data-v="${esc(it.id)}"${herr ? '' : ' draggable="true"'} title="${esc(it.n)}${herr ? ' · clic para usar la herramienta' : ' · clic y luego clic en el mapa, o arrástralo'}">${it.prefab ? '<span class="marca-prefab">Prefab</span>' : ''}${it.variantes && it.variantes.length ? `<button class="var" data-pvar="${esc(it.id)}" title="Variantes: ${esc(it.variantes.map(v => v.n).join(', '))}" aria-label="Variantes">${it.variantes.length} ▾</button>` : ''}<span class="ph" data-mini="${esc(it.id)}"></span><span class="n">${esc(it.n)}</span><button class="fav${favs.has(it.id) ? ' on' : ''}" data-fav="${esc(it.id)}" title="${favs.has(it.id) ? 'Quitar de favoritos' : 'Marcar como favorito'}" aria-label="Favorito">${svg(favs.has(it.id) ? 'estrellaLlena' : 'estrella')}</button></div>`;
    }).join('') || `<p class="ayuda">${pestana === 'favoritos' ? 'Marca objetos con la estrella para tenerlos aquí.' : pestana === 'recientes' ? 'Aquí salen las últimas piezas que colocaste.' : cat === 'componentes' ? 'Todavía no hay prefabs: selecciona algo (un coche, una casa, una zona) y pulsa «Crear prefab».' : 'Nada coincide.'}</p>`;
    const pend = its.slice();
    const paso = () => { const lote = pend.splice(0, 4); for (const it of lote) { const ph = cont.querySelector('[data-mini="' + CSS.escape(it.id) + '"]'); if (!ph) continue; const url = it.mini || A.miniatura(it); if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; im.loading = 'lazy'; ph.replaceWith(im); } } if (pend.length) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  function usarHerr(id) {
    const it = herrCat().concat(herrPro()).find(x => x.id === id); if (!it) return;
    const pr = A.params[it.herr.h]; if (pr) Object.assign(pr, it.herr.p || {});
    A.ponerHerramienta(it.herr.h, { forzar: true }); A.pista((it.n) + ': ' + (it.herr.pista ? it.herr.pista :it.herr.h === 'puerta' || it.herr.h === 'ventana' ? 'haz clic sobre la cara de una pared.' : it.herr.h === 'techo' ? 'haz clic dentro de una habitación o recinto.' : it.herr.h === 'pared' ? 'clic para empezar y clic en cada esquina.' : 'arrastra sobre el suelo.'));
    reciente(id);
  }
  function reciente(id) { if (!id) return; recientes = [id].concat(recientes.filter(x => x !== id)).slice(0, 40); ls('oo-editor-recientes', JSON.stringify(recientes)); }
  const panel = document.querySelector('.pnl[data-pnl="catalogo"]');
  panel.addEventListener('click', e => {
    const f = e.target.closest('[data-fav]'); if (f) { e.stopPropagation(); e.preventDefault(); const id = f.dataset.fav; if (favs.has(id)) favs.delete(id); else favs.add(id); ls('oo-editor-favoritos', JSON.stringify([...favs])); render(); return; }
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; pestana = 'todo'; ls('oo-editor-catcat', cat); if (cat !== 'todo' && A.CATEGORIAS.some(x => x[0] === cat)) A.catActual = cat; render(); return; }
    const fl = e.target.closest('[data-filtro]'); if (fl) { filtroTipo = fl.dataset.filtro; render(); return; }
    const t = e.target.closest('[data-ctab]'); if (t) { pestana = t.dataset.ctab; render(); return; }
    const m = e.target.closest('[data-a="cat-modo"]'); if (m) { modo = m.dataset.v; ls('oo-editor-catmodo', modo); render(); return; }
    const h = e.target.closest('[data-a="cat-herr"]'); if (h) { usarHerr(h.dataset.v); render(); }
  }, true);
  panel.addEventListener('keydown', e => { const it = e.target.closest('.item'); if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); it.click(); } });
  panel.addEventListener('contextmenu', e => { const it = e.target.closest('.item[data-v]'); if (it && window.OOPrefabs && OOPrefabs.menuTarjeta(it.dataset.v, e)) e.preventDefault(); });
  $('#catBuscar').addEventListener('input', render);
  const tam = $('#catTam'); const ponerTam = () => { $('#catItems').style.setProperty('--tam', tam.value + 'px'); ls('oo-editor-cattam', tam.value); };
  if (ls('oo-editor-cattam')) tam.value = ls('oo-editor-cattam'); ponerTam(); tam.addEventListener('input', ponerTam);
  E.on('herramienta', h => { if (h === 'colocar') reciente(A.params.colocar.item); render(); });
  E.on('col', c => { if (c === 'componentes' || c === 'assets') render(); });
  window.OOCatalogoUI = { render, todos, tipoFiltro, reciente };
  render();
})();
