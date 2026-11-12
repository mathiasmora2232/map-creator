/* Editor del mapa (2.1, editor v2): iconos, paneles acoplables y menús de la interfaz.
   - Paneles (<section class="pnl" data-pnl="…">) en tres columnas: izquierda, derecha y abajo (debajo de la vista 3D). Se arrastran
     por su cabecera para reordenarlos o llevarlos a otra columna, se pliegan y se cierran. Las columnas cambian de tamaño desde su borde.
   - La disposición se guarda en localStorage («oo-editor-disposicion»); «Restablecer disposición» vuelve a la de fábrica.
   - Menús flotantes ([data-menu]) y ventanas emergentes de la vista ([data-pop]).
   Se carga antes que editor.js (solo necesita el DOM); lo que depende del editor espera a window.OOEditor. */
(function () {
  'use strict';
  const $ = (s?) => document.querySelector(s), $$ = (s?) => Array.from(document.querySelectorAll(s));
  const ICONOS = {
    logo: '<path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z" fill="currentColor" fill-opacity=".18"/><path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M12 12l8.5-4.7M12 12v9.5M12 12L3.5 7.3"/>',
    capas: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/>',
    caminar: '<circle cx="13" cy="4" r="2"/><path d="M9 21l2.5-6 3 3v3M7 12l3.5-4 4 1 2.5 4M11.5 15l-1-6"/>',
    deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    rehacer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    teclado: '<path d="M2 6h20v12H2zM6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    tema: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
    panel: '<path d="M3 4h18v16H3zM15 4v16"/>',
    abajo: '<path d="M6 9l6 6 6-6"/>',
    derecha: '<path d="M9 6l6 6-6 6"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    sel: '<path d="M5 3l13 7.5-5.5 1.6L10 18z"/><path d="M13 13l5 6"/>',
    mover: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
    girar: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    escalar: '<path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"/><path d="M14 4h6v6M10 20H4v-6" opacity=".45"/>',
    objeto: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
    imantar: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    rejilla: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    estrella: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    estrellaLlena: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
    subir: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    bajar: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    recargar: '<path d="M20 11a8 8 0 1 0-2 5.3"/><path d="M20 4v7h-7"/>',
    mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ojoNo: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    abierto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1"/>',
    carpeta: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
    expandir: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    grip: '<circle cx="9" cy="6" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="18" r=".9"/>',
    construir: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    modelar: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h8M6 8v8M18 8v8M8 18h8"/>',
    terreno: '<path d="M2 20l7-11 4 6 3-4 6 9z"/>',
    guias: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
    zona: '<path d="M4 4h4M12 4h4M20 4v4M20 12v4M20 20h-4M12 20H8M4 20v-4M4 12V8"/><path d="M9 9h6v6H9z" opacity=".5"/>',
    exportar: '<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>',
    coche: '<path d="M3 13l2-5h14l2 5v5H3z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
    rompible: '<path d="M12 2l2 6-3 3 4 4-2 7M4 12l5-1M15 13l6-1"/>',
    mano: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.5-1.5L8 14"/>',
    bombilla: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    bandera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    sonido: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    prefab: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>',
    nube: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>',
    gota: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'
  };
  const svg = (k?, c?) => `<svg class="${c || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[k] || ICONOS.objeto}</svg>`;
  function pintarIconos(raiz?) { (raiz || document).querySelectorAll('[data-ic]:not([data-ic-ok])').forEach((el?) => { el.insertAdjacentHTML('afterbegin', svg(el.dataset.ic)); el.setAttribute('data-ic-ok', ''); }); }
  pintarIconos();

  /* ---------------- disposición de paneles ---------------- */
  const CLAVE = 'oo-editor-disposicion';
  const DEF = { izq: ['jerarquia', 'capas', 'minimapa'], der: ['inspector', 'recursos', 'zonas'], abajo: ['catalogo'], plegados: [], cerrados: ['zonas'], tam: { izq: 272, der: 340, abajo: 228 }, sinPaneles: false };
  const ls = (k?, v?) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; };
  let disp = null;
  const paneles = {}; $$('.pnl[data-pnl]').forEach((p?) => { paneles[p.dataset.pnl] = p; });
  const docks = { izq: $('#colIzq'), der: $('#colDer'), abajo: $('#colAbajo') };
  function leer() {
    let d = null; try { d = JSON.parse(ls(CLAVE) || 'null'); } catch (e) { d = null; }
    d = Object.assign(JSON.parse(JSON.stringify(DEF)), d || {}); d.tam = Object.assign({}, DEF.tam, d.tam || {});
    // Paneles nuevos que no estaban en lo guardado van a su columna de fábrica; los que ya no existen se quitan.
    const todos = new Set<any>(); for (const c of ['izq', 'der', 'abajo']) { d[c] = (d[c] || []).filter((id?) => paneles[id] && !todos.has(id)); d[c].forEach((id?) => todos.add(id)); }
    for (const c of ['izq', 'der', 'abajo']) for (const id of DEF[c]) if (!todos.has(id) && paneles[id]) { d[c].push(id); todos.add(id); if (DEF.cerrados.includes(id) && !d.cerrados.includes(id)) d.cerrados.push(id); }
    for (const id in paneles) if (!todos.has(id)) d[paneles[id].closest('.dock') ? paneles[id].closest('.dock').dataset.dock : 'der'].push(id);
    return d;
  }
  function guardar() { ls(CLAVE, JSON.stringify(disp)); }
  function cabecera(p?) {
    if (p.querySelector(':scope > .pnl-cab')) return;
    const cab = document.createElement('header'); cab.className = 'pnl-cab'; cab.draggable = true;
    cab.innerHTML = `<span class="pnl-grip" title="Arrastra para mover el panel">${svg('grip')}</span>`;
    const tabs = p.querySelector(':scope > .pestanas');
    if (tabs) cab.appendChild(tabs); else cab.insertAdjacentHTML('beforeend', `<span class="pnl-tit">${p.dataset.titulo || ''}</span>`);
    const acc = p.querySelector(':scope > .pnl-acc'); if (acc) cab.appendChild(acc);
    cab.insertAdjacentHTML('beforeend', `<button class="pnl-b" data-pnl-b="plegar" title="Plegar o desplegar" aria-label="Plegar">${svg('abajo')}</button><button class="pnl-b" data-pnl-b="cerrar" title="Cerrar el panel (vuelve desde el botón de paneles)" aria-label="Cerrar">${svg('cerrar')}</button>`);
    p.prepend(cab);
  }
  function aplicar() {
    for (const c of ['izq', 'der', 'abajo']) {
      const dk = docks[c]; for (const id of disp[c]) dk.appendChild(paneles[id]);
      const vis = disp[c].filter((id?) => !disp.cerrados.includes(id));
      dk.classList.toggle('vacio', !vis.length);
    }
    for (const id in paneles) { const p = paneles[id]; p.hidden = disp.cerrados.includes(id); p.classList.toggle('plegado', disp.plegados.includes(id)); }
    tamCols();
    $('#app').classList.toggle('sin-paneles', !!disp.sinPaneles);
    const b = $('#bPanel'); if (b) b.setAttribute('aria-expanded', String(!disp.sinPaneles));
    window.dispatchEvent(new Event('resize'));
  }
  function tamCols() {
    const cu = $('#cuerpo');
    cu.style.setProperty('--izqv', (docks.izq.classList.contains('vacio') ? 0 : disp.tam.izq) + 'px');
    cu.style.setProperty('--derv', (docks.der.classList.contains('vacio') ? 0 : disp.tam.der) + 'px');
    cu.style.setProperty('--abajo', disp.tam.abajo + 'px');
  }
  function plegar(id?, v?) { const i = disp.plegados.indexOf(id); if (v === undefined) v = i < 0; if (v && i < 0) disp.plegados.push(id); if (!v && i >= 0) disp.plegados.splice(i, 1); aplicar(); guardar(); }
  function cerrar(id?, v?) { const i = disp.cerrados.indexOf(id); if (v === undefined) v = i < 0; if (v && i < 0) disp.cerrados.push(id); if (!v && i >= 0) disp.cerrados.splice(i, 1); aplicar(); guardar(); }
  /* mostrar un panel (por id o por un elemento de dentro): lo despliega; con forzar también lo abre si estaba cerrado */
  function mostrarPanel(x?, forzar?) {
    const p = typeof x === 'string' ? paneles[x] : (x && x.closest ? x.closest('.pnl') : null); if (!p) return;
    const id = p.dataset.pnl; let cambio = false;
    if (disp.plegados.includes(id)) { disp.plegados.splice(disp.plegados.indexOf(id), 1); cambio = true; }
    if (forzar && disp.cerrados.includes(id)) { disp.cerrados.splice(disp.cerrados.indexOf(id), 1); cambio = true; }
    if (forzar && disp.sinPaneles) { disp.sinPaneles = false; cambio = true; }
    if (cambio) { aplicar(); guardar(); }
  }
  function restablecer() { disp = JSON.parse(JSON.stringify(DEF)); aplicar(); guardar(); }
  Object.values(paneles).forEach(cabecera);
  disp = leer(); aplicar();

  /* arrastrar paneles entre columnas */
  let arr = null; const hueco = document.createElement('div'); hueco.className = 'pnl-hueco';
  document.addEventListener('dragstart', (e?) => {
    const cab = e.target.closest && e.target.closest('.pnl-cab'); if (!cab) return;
    if (e.target.closest('button,input,select')) { e.preventDefault(); return; }
    arr = cab.parentElement.dataset.pnl; e.dataTransfer.setData('text/oo-panel', arr); e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('arrastrando-panel');
  });
  document.addEventListener('dragend', () => { arr = null; hueco.remove(); document.body.classList.remove('arrastrando-panel'); });
  function indiceDrop(dk?, e?) {
    const horiz = dk.dataset.dock === 'abajo'; const hijos = [...dk.querySelectorAll(':scope > .pnl:not([hidden])')].filter((p?) => p.dataset.pnl !== arr);
    for (let i = 0; i < hijos.length; i++) { const r = hijos[i].getBoundingClientRect(); if (horiz ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2) return { i, antes: hijos[i] }; }
    return { i: hijos.length, antes: null };
  }
  Object.values(docks).forEach((dk?) => {
    dk.addEventListener('dragover', (e?) => { if (!arr) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const { antes } = indiceDrop(dk, e); hueco.className = 'pnl-hueco' + (dk.dataset.dock === 'abajo' ? ' h' : ''); if (antes) dk.insertBefore(hueco, antes); else dk.appendChild(hueco); });
    dk.addEventListener('drop', (e?) => {
      if (!arr) return; e.preventDefault(); const id = arr; const { antes } = indiceDrop(dk, e); hueco.remove();
      for (const c of ['izq', 'der', 'abajo']) disp[c] = disp[c].filter((x?) => x !== id);
      const lista = disp[dk.dataset.dock]; const j = antes ? lista.indexOf(antes.dataset.pnl) : -1; if (j < 0) lista.push(id); else lista.splice(j, 0, id);
      if (disp.cerrados.includes(id)) disp.cerrados.splice(disp.cerrados.indexOf(id), 1);
      aplicar(); guardar();
    });
  });
  /* columnas vacías: mientras se arrastra un panel se ven para poder soltarlo en ellas */
  /* tamaño de las columnas desde su borde */
  for (const c of ['izq', 'der', 'abajo']) {
    const d = document.createElement('div'); d.className = 'divisor divisor-' + c; d.title = 'Arrastra para cambiar el tamaño'; docks[c].appendChild(d);
    d.addEventListener('pointerdown', (e?) => {
      e.preventDefault(); d.setPointerCapture(e.pointerId); const x0 = e.clientX, y0 = e.clientY, t0 = disp.tam[c];
      const mover = (ev?) => { let t = c === 'izq' ? t0 + ev.clientX - x0 : c === 'der' ? t0 - (ev.clientX - x0) : t0 - (ev.clientY - y0); t = Math.round(Math.max(c === 'abajo' ? 110 : 200, Math.min(c === 'abajo' ? innerHeight * 0.6 : 560, t))); disp.tam[c] = t; tamCols(); window.dispatchEvent(new Event('resize')); };
      const fin = () => { d.removeEventListener('pointermove', mover); d.removeEventListener('pointerup', fin); guardar(); };
      d.addEventListener('pointermove', mover); d.addEventListener('pointerup', fin);
    });
  }
  /* botones de la cabecera */
  document.addEventListener('click', (e?) => {
    const b = e.target.closest('[data-pnl-b]'); if (!b) return; const id = b.closest('.pnl').dataset.pnl;
    if (b.dataset.pnlB === 'plegar') plegar(id); else cerrar(id, true);
  });
  document.addEventListener('dblclick', (e?) => { const t = e.target.closest('.pnl-tit,.pnl-grip'); if (t) plegar(t.closest('.pnl').dataset.pnl); });

  /* ---------------- menús flotantes ---------------- */
  let menuAbierto = null;
  function cerrarMenus() { $$('.menu-flot').forEach((m?) => { m.hidden = true; }); $$('[data-menu].abierto').forEach((b?) => b.classList.remove('abierto')); menuAbierto = null; }
  function abrirMenu(id?, ancla?, opts?) {
    opts = opts || {}; const m = document.getElementById(id); if (!m) return;
    const yaAbierto = !m.hidden; cerrarMenus(); if (yaAbierto && !opts.siempre) return;
    if (id === 'menuPaneles') pintarMenuPaneles();
    m.hidden = false; menuAbierto = m;
    const r = ancla.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let x, y;
    if (opts.lado === 'derecha') { x = r.right + 6; y = r.top; } else { x = opts.izq ? r.left : r.right - w; y = r.bottom + 6; }
    x = Math.max(6, Math.min(innerWidth - w - 6, x)); y = Math.max(6, Math.min(innerHeight - h - 6, y));
    m.style.left = x + 'px'; m.style.top = y + 'px';
    if (ancla.dataset && ancla.dataset.menu) ancla.classList.add('abierto');
  }
  document.addEventListener('click', (e?) => {
    const b = e.target.closest('[data-menu]');
    if (b) { e.preventDefault(); e.stopPropagation(); abrirMenu(b.dataset.menu, b, { izq: b.dataset.menuIzq != null }); return; }
    if (menuAbierto && menuAbierto.contains(e.target) && e.target.closest('[data-a]') && !e.target.closest('[data-queda]')) setTimeout(cerrarMenus, 0);
  }, true);
  document.addEventListener('pointerdown', (e?) => { if (menuAbierto && !menuAbierto.contains(e.target) && !e.target.closest('[data-menu]') && !e.target.closest('[data-rail]')) cerrarMenus(); }, true);
  document.addEventListener('keydown', (e?) => { if (e.key === 'Escape' && menuAbierto) { cerrarMenus(); e.stopPropagation(); } }, true);

  function pintarMenuPaneles() {
    const m = $('#menuPaneles');
    m.innerHTML = `<div class="menu-tit">Paneles</div>` + Object.keys(paneles).map((id?) => `<label class="menu-chk" data-queda><input type="checkbox" data-pnl-ver="${id}" ${disp.cerrados.includes(id) ? '' : 'checked'}> ${paneles[id].dataset.titulo || id}</label>`).join('') +
      `<hr><label class="menu-chk" data-queda><input type="checkbox" data-pnl-todos ${disp.sinPaneles ? '' : 'checked'}> Mostrar las columnas de paneles</label><button role="menuitem" data-a="disp-restablecer">Restablecer disposición</button><p class="menu-nota">Arrastra un panel por su cabecera para llevarlo a otra columna.</p>`;
  }
  document.addEventListener('change', (e?) => {
    const el = e.target;
    if (el.dataset && el.dataset.pnlVer) cerrar(el.dataset.pnlVer, !el.checked);
    else if (el.dataset && el.dataset.pnlTodos !== undefined) { disp.sinPaneles = !el.checked; aplicar(); guardar(); }
  });
  document.addEventListener('click', (e?) => { if (e.target.closest('[data-a="disp-restablecer"]')) { restablecer(); } });

  /* ---------------- ventanas emergentes de la vista ---------------- */
  function cerrarPops(salvo?) { $$('.pop').forEach((p?) => { if (p !== salvo) p.hidden = true; }); $$('[data-pop]').forEach((b?) => b.classList.toggle('on', !!salvo && b.dataset.pop === salvo.id)); }
  document.addEventListener('click', (e?) => {
    const b = e.target.closest('[data-pop]');
    if (b) { const p = document.getElementById(b.dataset.pop); if (!p) return; const abrir = p.hidden; cerrarPops(abrir ? p : null); if (abrir) { p.hidden = false; const v = $('#vista').getBoundingClientRect(), r = b.getBoundingClientRect(); p.style.top = (r.bottom - v.top + 6) + 'px'; p.style.right = Math.max(8, v.right - r.right) + 'px'; window.dispatchEvent(new CustomEvent('oo-pop', { detail: p.id })); } return; }
    if (!e.target.closest('.pop') && !e.target.closest('.modal')) cerrarPops(null);
  });

  window.OOUI = { svg, ICONOS, pintarIconos, abrirMenu, cerrarMenus, mostrarPanel, plegar, cerrar, restablecer, paneles, disp: () => disp, cerrarPops };
})();
