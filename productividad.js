/* Editor del mapa (2.1, Map Editor Pro fase 5): productividad (sección 14 de la especificación).
   - Medir áreas: herramienta Medir → «Área» (clic en cada esquina, clic en la primera o Enter): área, perímetro y contorno en la vista.
     Las distancias y los ángulos siguen en la herramienta Medir de siempre.
   - Aislar la selección (solo se ve y se elige lo seleccionado), ocultar la selección un rato y mostrar todo. Un aviso arriba deja salir.
   - Buscar por tipo: ventana «Buscar y seleccionar» (lupa de la barra de la derecha de la vista): tipos presentes con cuántos hay, nombre o
     texto, y seleccionar todos los de un tipo (o solo los visibles).
   - Historial visible: botón del reloj junto a deshacer y rehacer. Lista de pasos con su nombre (los pasos sin nombre lo reciben solo:
     «Crear Pared», «Mover 3 objetos»…) y la hora; clic en un paso = volver a él (deshace o rehace hasta ahí).
   - Versiones: instantáneas de todos los cambios del mapa en la colección `versiones` del servidor. Guardar ahora (con nombre), restaurar
     (un paso de deshacer, así que restaurar también se puede deshacer) y borrar. Guardado automático controlado: cada N minutos si hubo
     cambios, conservando las últimas M automáticas.
   - Atajos configurables: ventana «Atajos personalizados» (desde Buscar y seleccionar o Mayús+?) con las herramientas, el gizmo y las
     acciones nuevas; se guardan en los ajustes (AJ.atajos). Cambiar el atajo de una herramienta libera su tecla de siempre.
   - Pantalla limpia: oculta barras y paneles (Mayús+F por defecto o el botón); queda un botón para volver.
   API: OOProductividad.aislar(keys | null), ocultar(keys), mostrarTodo(), seleccionarTipo(tipo, {visibles}), tipos(), irAPaso(i),
   guardarVersion(nombre, {auto}), versiones(), restaurarVersion(id), borrarVersion(id), pantallaLimpia(v), medirArea(puntos), atajo(id), ponerAtajo(id, tecla). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, AJ = A.AJ, esc = A.esc, tb = A.tipoBase, nv = () => E.nuevos(), $ = s => document.querySelector(s);
  const svg = k => (window.OOUI ? OOUI.svg(k) : '');

  /* ---------- nombre automático de los pasos del historial ---------- */
  function etiquetaAuto(entrada) {
    const L = entrada.filter(x => x && (x.antes || x.despues)); if (!L.length) return '';
    const tipo = x => (x.despues || x.antes || {}).tipo, nombreDe = l => { const ts = [...new Set(l.map(tipo).filter(Boolean))]; return l.length === 1 ? A.nombreTipo(ts[0] || 'objeto') : l.length + (ts.length === 1 ? ' × ' + A.nombreTipo(ts[0]) : ' objetos'); };
    if (L.every(x => !x.antes)) return 'Crear ' + nombreDe(L);
    if (L.every(x => !x.despues)) return 'Borrar ' + nombreDe(L);
    const mod = L.filter(x => x.antes && x.despues), soloPos = mod.every(x => { const a = x.antes.datos || {}, b = x.despues.datos || {}; return Object.keys(Object.assign({}, a, b)).every(k => ['x', 'y', 'z', 'x1', 'z1', 'x2', 'z2', 'puntos_mundo', 'soporte'].includes(k) || JSON.stringify(a[k]) === JSON.stringify(b[k])); });
    const soloGiro = !soloPos && mod.every(x => { const a = x.antes.datos || {}, b = x.despues.datos || {}; return Object.keys(Object.assign({}, a, b)).every(k => ['x', 'z', 'giroY', 'x1', 'z1', 'x2', 'z2', 'puntos_mundo', 'soporte'].includes(k) || JSON.stringify(a[k]) === JSON.stringify(b[k])); });
    const soloProps = mod.every(x => JSON.stringify(x.antes.datos) === JSON.stringify(x.despues.datos));
    return (soloPos ? 'Mover ' : soloGiro ? 'Girar ' : soloProps ? 'Propiedades de ' : 'Editar ') + nombreDe(L);
  }

  /* ---------- medir áreas ---------- */
  const areas = [], grupoA = new T.Group(); grupoA.renderOrder = 44; A.scene.add(grupoA);
  const matA = new T.LineBasicMaterial({ color: 0xffb020, depthTest: false });
  function areaPts(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.z - b.x * a.z; } return Math.abs(s / 2); }
  function perim(pts) { let s = 0; for (let i = 0; i < pts.length; i++) s += pts[i].distanceTo(pts[(i + 1) % pts.length]); return s; }
  function dibujarAreas() { while (grupoA.children.length) { const c = grupoA.children.pop(); c.geometry.dispose(); } for (const a of areas) { const l = new T.LineLoop(new T.BufferGeometry().setFromPoints(a.pts.map(p => p.clone().setY(p.y + 0.05))), matA); l.renderOrder = 44; l.frustumCulled = false; grupoA.add(l); } A.marcar(); }
  function medirArea(puntos) { const pts = puntos.map(p => Array.isArray(p) ? new V3(p[0], p.length > 2 ? p[1] : 0, p.length > 2 ? p[2] : p[1]) : p.clone()); if (pts.length < 3) return null; const r = { pts, area: areaPts(pts), perimetro: perim(pts) }; areas.push(r); dibujarAreas(); A.pista('Área: ' + A.fmt(r.area, 2) + ' m² · perímetro ' + A.fmt(r.perimetro, 2) + ' m.'); return { area: r.area, perimetro: r.perimetro }; }
  function etiquetas() { return areas.map(a => { const c = new V3(); a.pts.forEach(p => c.add(p)); c.multiplyScalar(1 / a.pts.length); return { p: c.setY(c.y + 0.3), t: A.fmt(a.area, 2) + ' m²', c: 'medida' }; }); }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-a="medidas-borrar"]')) { areas.length = 0; dibujarAreas(); } }, true);
  let medA = null;
  E.agregarHerramientaPropia('medir-area', { n: 'Medir área', ic: 'medir', pista: 'Clic en cada esquina; clic en la primera o Enter para cerrar. Se imanta a extremos y ejes.',
    move: e => { if (!medA) return; const inf = A.inferir(e, medA[medA.length - 1], { y: medA[0].y }); if (!inf) return; const L = medA.concat([inf.p]); A.etqVivas = L.length >= 3 ? [{ p: inf.p.clone().setY(inf.p.y + 0.5), t: A.fmt(areaPts(L), 2) + ' m²', c: 'vivo' }] : []; A.limpiarPrevia(); L.forEach(p => A.punto3D(p, 0xffb020)); },
    up: (e, mov) => { if (mov > 6) return; const inf = A.inferir(e, medA && medA[medA.length - 1], medA ? { y: medA[0].y } : null); if (!inf) return;
      if (medA && medA.length >= 3 && inf.p.distanceTo(medA[0]) < Math.max(0.3, 10 * A.metrosPorPixel(inf.p))) { cerrarArea(); return; } (medA = medA || []).push(inf.p.clone()); A.punto3D(inf.p, 0xffb020); },
    fin: () => { medA = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => `<ul class="lista">${areas.map((a, j) => `<li class="cambio"><span style="flex:1;font-family:var(--mono)">${j + 1}. ${A.fmt(a.area, 2)} m² · ${A.fmt(a.perimetro, 2)} m</span></li>`).join('')}</ul><div class="fila"><button data-a="medidas-borrar">Borrar medidas</button></div>` });
  function cerrarArea() { if (medA && medA.length >= 3) medirArea(medA); medA = null; A.limpiarPrevia(); A.etqVivas = []; A.renderPanel(); }
  window.addEventListener('keydown', e => { if (A.herramienta === 'medir-area' && e.key === 'Enter' && medA) { e.preventDefault(); e.stopImmediatePropagation(); cerrarArea(); } }, true);
  E.agregarHerramienta('medir', { h: 'medir-area', n: 'Área', ic: 'zona' });

  /* ---------- aislar, ocultar, mostrar ---------- */
  let aislado = null;
  E.filtrosVis.push(k => !aislado || aislado.has(k));
  E.bloqueos.push(k => !!aislado && !aislado.has(k));
  const aviso = document.createElement('div'); aviso.id = 'avisoAislado'; aviso.className = 'flot aviso-aislado'; aviso.hidden = true; const vistaEl = document.getElementById('vista'); if (vistaEl) vistaEl.appendChild(aviso);
  function pintarAviso() { aviso.hidden = !aislado; if (aislado) aviso.innerHTML = `<span>Aislado: ${aislado.size} objeto${aislado.size === 1 ? '' : 's'}</span><button data-pr="salir-aislar">Salir (${esc(atajo('aislar') || '')})</button>`; }
  function aislar(keys) { if (keys === undefined) keys = aislado ? null : A.expandirGrupos(A.sel); aislado = keys && keys.length ? new Set(keys) : null; pintarAviso(); A.seleccionar(A.sel.filter(A.seleccionable), { sinTab: true }); A.renderTodo(); if (aislado) A.pista('Selección aislada: lo demás no se ve ni se puede elegir.'); return aislado ? aislado.size : 0; }
  function ocultar(keys) { keys = keys || A.sel.slice(); if (!keys.length) return 0; A.ocultar(keys, true); A.seleccionar([], { sinTab: true }); A.pista(keys.length + ' ocultos un momento. «Mostrar todo» (' + (atajo('mostrar-todo') || '') + ') los recupera.'); return keys.length; }
  function mostrarTodo() { const n = A.ocultos.size; A.ocultar([...A.ocultos], false); if (aislado) aislar(null); return n; }

  /* ---------- buscar por tipo ---------- */
  function tipos() { const m = new Map(); for (const o of nv().values()) { const t = o.tipo; const e = m.get(t) || { tipo: t, nombre: A.nombreTipo(t), n: 0 }; e.n++; m.set(t, e); } return [...m.values()].sort((a, b) => b.n - a.n); }
  function seleccionarTipo(t, o) { o = o || {}; const base = t && t.indexOf(':') < 0; const ks = [...nv().values()].filter(x => (base ? tb(x.tipo) === t : x.tipo === t) && (!o.visibles || !A.ocultos.has('n' + x.id))).map(x => 'n' + x.id).filter(A.seleccionable); A.seleccionar(ks); A.pista(ks.length + ' seleccionados de tipo «' + A.nombreTipo(t) + '».'); return ks.length; }
  function buscarTexto(q) { q = String(q || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim(); if (!q) return []; return [...nv().values()].filter(o => (A.nombreEntidades(['n' + o.id]) + ' ' + o.tipo + ' ' + A.nombreTipo(o.tipo)).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes(q)).map(o => 'n' + o.id); }
  const pop = document.createElement('div'); pop.id = 'popProd'; pop.className = 'pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Buscar y seleccionar'); if (vistaEl) vistaEl.appendChild(pop);
  const barra = document.getElementById('barraFlotDer');
  if (barra) { const b = document.createElement('button'); b.dataset.pop = 'popProd'; b.title = 'Buscar y seleccionar por tipo, aislar, ocultar, pantalla limpia y atajos'; b.setAttribute('aria-label', 'Buscar y seleccionar'); b.innerHTML = svg('buscar'); barra.insertBefore(b, barra.firstChild); }
  let qBuscar = '';
  function htmlPop() {
    const L = tipos(), res = buscarTexto(qBuscar);
    return `<h3>Buscar</h3><label class="buscador-ic">${svg('buscar')}<input type="search" data-pr-q value="${esc(qBuscar)}" placeholder="Nombre o tipo…" aria-label="Buscar por nombre o tipo"></label>
      ${qBuscar ? `<p class="ayuda">${res.length} coinciden. <button data-pr="sel-busqueda"${res.length ? '' : ' disabled'}>Seleccionarlos</button></p>` : ''}
      <h3>Seleccionar por tipo</h3><ul class="lista tipos-prod">${L.map(t => `<li><button data-pr="tipo" data-v="${esc(t.tipo)}"><span>${esc(t.nombre)}</span><small>${t.n}</small></button></li>`).join('') || '<li class="vacio">No hay objetos nuevos.</li>'}</ul>
      <h3>Ver</h3><div class="fila"><button data-pr="aislar">${aislado ? 'Salir del aislamiento' : 'Aislar la selección'} <kbd>${esc(atajo('aislar'))}</kbd></button><button data-pr="ocultar">Ocultar la selección <kbd>${esc(atajo('ocultar-sel'))}</kbd></button><button data-pr="mostrar">Mostrar todo <kbd>${esc(atajo('mostrar-todo'))}</kbd></button></div>
      <div class="fila"><button data-pr="limpia">Pantalla limpia <kbd>${esc(atajo('pantalla-limpia'))}</kbd></button><button data-pr="area">Medir un área</button><button data-pr="atajos">Atajos personalizados…</button></div>`;
  }
  window.addEventListener('oo-pop', e => { if (e.detail === 'popProd') pop.innerHTML = htmlPop(); });
  pop.addEventListener('input', e => { if (e.target.matches('[data-pr-q]')) { qBuscar = e.target.value; const p = e.target.selectionStart; pop.innerHTML = htmlPop(); const i = pop.querySelector('[data-pr-q]'); i.focus(); try { i.setSelectionRange(p, p); } catch (er) { } } });

  /* ---------- historial y versiones ---------- */
  const popH = document.createElement('div'); popH.id = 'popHistorial'; popH.className = 'pop pop-historial'; popH.hidden = true; popH.setAttribute('role', 'dialog'); popH.setAttribute('aria-label', 'Historial y versiones'); if (vistaEl) vistaEl.appendChild(popH);
  const bRe = document.getElementById('bRehacer');
  if (bRe) { const b = document.createElement('button'); b.id = 'bHistorial'; b.dataset.pop = 'popHistorial'; b.title = 'Historial de cambios y versiones'; b.setAttribute('aria-label', 'Historial'); b.innerHTML = svg('reloj'); bRe.parentNode.insertBefore(b, bRe.nextSibling); }
  AJ.autoVersiones = Object.assign({ on: true, min: 10, max: 10 }, AJ.autoVersiones || {});
  const hora = t => t ? new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  function irAPaso(i) { /* i: índice en la lista de deshacer (0 = el más viejo); i < 0 = antes de todo; i ≥ largo: rehacer */
    const D = A.pasosDeshacer; let n = 0; while (D.length - 1 > i && D.length) { A.hacerDeshacer(); n++; } while (D.length - 1 < i && A.pasosRehacer.length) { A.hacerRehacer(); n++; } return n;
  }
  let listaVer = [];
  async function versiones() { try { const r = await fetch('/api/db/versiones', { cache: 'no-store' }); const j = await r.json(); listaVer = (j.docs || []).filter(d => d.data && d.data.mapa === A.mapa).map(d => Object.assign({ id: d.id }, d.data, { docs: undefined, n: Object.keys(d.data.docs || {}).length })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))); } catch (e) { listaVer = []; } return listaVer; }
  function fotoMapa() { const docs = {}; for (const [id, d] of A.efectivos()) if (d && d.mapa === A.mapa) docs[id] = d; return docs; }
  let ultimaVersion = 0, pasosEnVersion = -1;
  async function guardarVersion(nombre, o) {
    o = o || {}; const id = 'v-' + A.mapa + '-' + Date.now().toString(36) + (o.auto ? 'a' : ''), docs = fotoMapa(), data = { mapa: A.mapa, nombre: String(nombre || '').trim() || (o.auto ? 'Automática' : 'Versión') + ' ' + new Date().toLocaleString('es'), fecha: new Date().toISOString(), auto: !!o.auto, docs };
    const r = await fetch('/api/db/versiones/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!r.ok) { A.pista('No se pudo guardar la versión.'); return null; }
    ultimaVersion = Date.now(); pasosEnVersion = cuentaPasos(); if (o.auto) await podar(); if (!o.auto) A.pista('Versión guardada: ' + data.nombre + ' (' + Object.keys(docs).length + ' cambios).'); return id;
  }
  async function podar() { const L = (await versiones()).filter(v => v.auto); for (const v of L.slice(Math.max(1, +AJ.autoVersiones.max || 10))) await borrarVersion(v.id); }
  async function borrarVersion(id) { await fetch('/api/db/versiones/' + encodeURIComponent(id), { method: 'DELETE' }); listaVer = listaVer.filter(v => v.id !== id); return true; }
  async function restaurarVersion(id) {
    const r = await fetch('/api/db/versiones', { cache: 'no-store' }); const j = await r.json(); const v = (j.docs || []).find(d => d.id === id); if (!v || !v.data || v.data.mapa !== A.mapa) { A.pista('Esa versión no existe.'); return 0; }
    const foto = v.data.docs || {}, act = fotoMapa(), lista = [], canon = x => JSON.stringify(x);
    for (const id2 of Object.keys(act)) if (!(id2 in foto)) lista.push({ id: id2, data: null });
    for (const [id2, d] of Object.entries(foto)) if (!act[id2] || canon(act[id2]) !== canon(d)) lista.push({ id: id2, data: d });
    if (!lista.length) { A.pista('Ya estás en esa versión.'); return 0; }
    A.seleccionar([]); A.guardar(lista, { etiqueta: 'Restaurar la versión «' + v.data.nombre + '»', sinAnclajes: true }); A.pista('Versión restaurada (' + lista.length + ' cambios). Ctrl+Z la deshace.'); return lista.length;
  }
  const cuentaPasos = () => A.pasosDeshacer.reduce((s, e) => s + e.length, 0) + A.pasosDeshacer.length;
  setInterval(() => { const av = AJ.autoVersiones; if (!av.on || A.pendientes > 0) return; const n = cuentaPasos(); if (n === pasosEnVersion || !A.pasosDeshacer.length) return; if (Date.now() - (ultimaVersion || cargado) < Math.max(1, +av.min || 10) * 60000) return; guardarVersion('', { auto: true }); }, 30000);
  const cargado = Date.now();
  async function pintarHistorial() {
    const D = A.pasosDeshacer, R = A.pasosRehacer, av = AJ.autoVersiones;
    const filaD = D.map((e, i) => ({ i, e })).reverse().slice(0, 120).map(({ i, e }) => `<li class="paso${i === D.length - 1 ? ' actual' : ''}"><button data-pr="paso" data-v="${i}" title="Volver a este paso"><span>${esc(e.etiqueta || 'Cambio')}</span><small>${hora(e.t)} · ${e.length}</small></button></li>`).join('');
    const filaR = R.slice().reverse().map((e, j) => `<li class="paso rehacer"><button data-pr="paso" data-v="${D.length + j}" title="Rehacer hasta aquí"><span>${esc(e.etiqueta || 'Cambio')}</span><small>${hora(e.t)}</small></button></li>`).reverse().join('');
    popH.innerHTML = `<h3>Historial <small>${D.length} pasos</small></h3><ul class="lista historial">${filaR}${filaD || '<li class="vacio">Todavía no hay pasos.</li>'}<li class="paso"><button data-pr="paso" data-v="-1"><span>Al abrir el editor</span></button></li></ul>
      <h3>Versiones</h3><div class="fila"><input type="text" data-pr-nombre placeholder="Nombre de la versión" aria-label="Nombre de la versión" style="flex:1"><button data-pr="ver-guardar" class="prim">Guardar versión</button></div>
      <label class="chk"><input type="checkbox" data-pr-auto="on"${av.on ? ' checked' : ''}> Guardado automático de versiones</label>
      <div class="fila"><label class="campo"><span>Cada (min)</span><input type="number" min="1" step="1" data-pr-auto="min" value="${av.min}"></label><label class="campo"><span>Conservar</span><input type="number" min="1" step="1" data-pr-auto="max" value="${av.max}"></label></div>
      <ul class="lista versiones" data-pr-vers><li class="vacio">Cargando…</li></ul>`;
    const L = await versiones(); const ul = popH.querySelector('[data-pr-vers]'); if (!ul) return;
    ul.innerHTML = L.map(v => `<li class="cambio"><span style="flex:1"><b>${esc(v.nombre)}</b><small style="display:block">${new Date(v.fecha).toLocaleString('es')} · ${v.n} cambios${v.auto ? ' · automática' : ''}</small></span><button data-pr="ver-restaurar" data-v="${esc(v.id)}">Restaurar</button><button data-pr="ver-borrar" data-v="${esc(v.id)}" class="peligro" aria-label="Borrar">×</button></li>`).join('') || '<li class="vacio">Sin versiones guardadas.</li>';
  }
  window.addEventListener('oo-pop', e => { if (e.detail === 'popHistorial') pintarHistorial(); });
  E.on('recompute', () => { if (!popH.hidden && !popH.contains(document.activeElement)) pintarHistorial(); });
  popH.addEventListener('change', e => { const k = e.target.dataset.prAuto; if (!k) return; AJ.autoVersiones[k] = k === 'on' ? e.target.checked : Math.max(1, Math.round(+e.target.value || 1)); A.guardarAjustes(); });

  /* ---------- pantalla limpia ---------- */
  const salirLimpia = document.createElement('button'); salirLimpia.id = 'bSalirLimpia'; salirLimpia.className = 'flot'; salirLimpia.hidden = true; salirLimpia.textContent = 'Salir de la pantalla limpia'; salirLimpia.dataset.pr = 'limpia'; document.body.appendChild(salirLimpia);
  function pantallaLimpia(v) { const on = v == null ? !document.body.classList.contains('oo-limpia') : !!v; document.body.classList.toggle('oo-limpia', on); salirLimpia.hidden = !on; if (window.OOUI) OOUI.cerrarPops(null); window.dispatchEvent(new Event('resize')); A.marcar(); return on; }

  /* ---------- atajos configurables ---------- */
  const T5 = window.OOTransformar;
  const ACC = [
    ['aislar', 'Aislar la selección (o salir)', 'Shift+I', () => aislar()], ['ocultar-sel', 'Ocultar la selección un rato', 'Shift+H', () => ocultar()], ['mostrar-todo', 'Mostrar todo', 'Alt+H', () => mostrarTodo()],
    ['pantalla-limpia', 'Pantalla limpia', 'Shift+F', () => pantallaLimpia()], ['historial', 'Historial y versiones', 'Shift+Y', () => { const b = $('#bHistorial'); if (b) b.click(); }], ['buscar', 'Buscar y seleccionar', 'Shift+B', () => { const b = document.querySelector('[data-pop="popProd"]'); if (b) b.click(); }],
    ['medir-area', 'Medir un área', 'Shift+T', () => A.ponerHerramienta('medir-area', { forzar: true })], ['guardar-version', 'Guardar una versión', 'Ctrl+Shift+S', () => guardarVersion('')],
    ['reflejar-x', 'Reflejar en X', 'Shift+X', () => T5 && T5.reflejar(A.sel, 'x')], ['reflejar-z', 'Reflejar en Z', 'Shift+Z', () => T5 && T5.reflejar(A.sel, 'z')],
    ['bloquear-x', 'Bloquear el eje X', 'Alt+X', () => T5 && T5.bloquear('x')], ['bloquear-y', 'Bloquear el eje Y', 'Alt+Y', () => T5 && T5.bloquear('y')], ['bloquear-z', 'Bloquear el eje Z', 'Alt+Z', () => T5 && T5.bloquear('z')],
    ['repetir', 'Repetir a lo largo de un camino', 'Shift+R', () => { if (T5) T5.iniciarRepetir(); }],
    ['duplicar', 'Duplicar', 'Ctrl+D', () => A.sel.length && A.duplicar(), true], ['encuadrar', 'Encuadrar la selección', 'F', null, true],
    ['h:sel', 'Herramienta: seleccionar', 'Space', () => A.ponerHerramienta('sel'), true], ['h:pared', 'Herramienta: pared', 'L', () => A.ponerHerramienta('pared'), true], ['h:habitacion', 'Herramienta: habitación', 'H', () => A.ponerHerramienta('habitacion'), true],
    ['h:puerta', 'Herramienta: puerta', 'U', () => A.ponerHerramienta('puerta'), true], ['h:ventana', 'Herramienta: ventana', 'I', () => A.ponerHerramienta('ventana'), true], ['h:hueco', 'Herramienta: hueco', 'O', () => A.ponerHerramienta('hueco'), true],
    ['h:suelo', 'Herramienta: suelo / calle', 'J', () => A.ponerHerramienta('suelo'), true], ['h:techo', 'Herramienta: techo', 'X', () => A.ponerHerramienta('techo'), true], ['h:pintar', 'Herramienta: pintar', 'B', () => A.ponerHerramienta('pintar'), true],
    ['h:empujar', 'Herramienta: empujar', 'P', () => A.ponerHerramienta('empujar'), true], ['h:medir', 'Herramienta: medir', 'T', () => A.ponerHerramienta('medir'), true], ['h:nota', 'Herramienta: nota', 'N', () => A.ponerHerramienta('nota'), true],
    ['g:mover', 'Gizmo: mover', 'M', () => A.ponerGizmo('translate'), true], ['g:girar', 'Gizmo: girar', 'G', () => A.ponerGizmo('rotate'), true], ['g:escalar', 'Gizmo: escalar', 'K', () => A.ponerGizmo('scale'), true]
  ].map(([id, n, def, fn, nucleo]) => ({ id, n, def, fn, nucleo: !!nucleo }));
  AJ.atajos = Object.assign({}, AJ.atajos || {});
  function combo(e) { let k = e.key; if (k === ' ') k = 'Space'; else if (k.length === 1) k = k.toUpperCase(); if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return ''; if (e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3); if (e.code && /^Digit[0-9]$/.test(e.code)) k = e.code.slice(5); return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k; }
  const atajo = id => { const a = ACC.find(x => x.id === id); if (!a) return ''; return AJ.atajos[id] != null ? AJ.atajos[id] : a.def; };
  function ponerAtajo(id, tecla) { const a = ACC.find(x => x.id === id); if (!a) return false; if (tecla == null || tecla === a.def) delete AJ.atajos[id]; else { for (const b of ACC) if (b.id !== id && atajo(b.id) === tecla) AJ.atajos[b.id] = ''; AJ.atajos[id] = tecla; } A.guardarAjustes(); return true; }
  function ejecutar(id) { const a = ACC.find(x => x.id === id); if (a && a.fn) { a.fn(); return true; } return false; }
  window.addEventListener('keydown', e => {
    if (!$('#modal').hidden || capturando) return; if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    const c = combo(e); if (!c) return; if (A.vista === 'caminar' && c !== atajo('pantalla-limpia')) return;
    if (e.key === '?' && e.shiftKey && !e.ctrlKey) { /* Mayús+? sigue abriendo la hoja de atajos */ }
    const a = ACC.find(x => atajo(x.id) === c);
    if (a) { if (a.nucleo && !AJ.atajos[a.id]) return; /* tecla de siempre: la atiende editor.js */ if (!a.fn) return; e.preventDefault(); e.stopImmediatePropagation(); a.fn(); return; }
    if (ACC.some(x => x.nucleo && x.def === c && AJ.atajos[x.id] != null && AJ.atajos[x.id] !== x.def)) { e.preventDefault(); e.stopImmediatePropagation(); } /* tecla liberada al cambiar el atajo */
  }, true);
  let capturando = null;
  function htmlAtajos() { return `<div class="cab">Atajos personalizados</div><div class="cont"><p class="ayuda">Clic en un atajo y pulsa la tecla nueva (con Ctrl, Alt o Mayús si quieres). Supr lo deja sin tecla; Esc cancela.</p><table class="info atajos5">${ACC.map(a => `<tr><th>${esc(a.n)}</th><td><button data-pr-at="${esc(a.id)}" class="${AJ.atajos[a.id] != null ? 'mod' : ''}"><kbd>${esc(atajo(a.id) || '—')}</kbd></button></td></tr>`).join('')}</table></div><div class="pie"><button data-pr-at-reset>Restablecer todos</button><button class="prim" data-a="m-no">Cerrar</button></div>`; }
  function abrirAtajos() { A.abrirModal(htmlAtajos(), 'ancho'); }
  document.addEventListener('click', e => {
    const at = e.target.closest && e.target.closest('[data-pr-at]'); if (at) { capturando = at.dataset.prAt; at.innerHTML = '<kbd>Pulsa una tecla…</kbd>'; return; }
    if (e.target.closest && e.target.closest('[data-pr-at-reset]')) { AJ.atajos = {}; A.guardarAjustes(); const c = $('#modalCaja'); if (c) c.innerHTML = htmlAtajos(); return; }
    const b = e.target.closest && e.target.closest('[data-pr]'); if (!b) return; const a = b.dataset.pr;
    if (a === 'tipo') seleccionarTipo(b.dataset.v); if (a === 'sel-busqueda') A.seleccionar(buscarTexto(qBuscar).filter(A.seleccionable));
    if (a === 'aislar' || a === 'salir-aislar') aislar(a === 'salir-aislar' ? null : undefined); if (a === 'ocultar') ocultar(); if (a === 'mostrar') mostrarTodo();
    if (a === 'limpia') pantallaLimpia(); if (a === 'area') A.ponerHerramienta('medir-area', { forzar: true }); if (a === 'atajos') { if (window.OOUI) OOUI.cerrarPops(null); abrirAtajos(); }
    if (a === 'paso') { irAPaso(+b.dataset.v); pintarHistorial(); }
    if (a === 'ver-guardar') { const i = popH.querySelector('[data-pr-nombre]'); guardarVersion(i ? i.value : '').then(() => pintarHistorial()); }
    if (a === 'ver-restaurar') restaurarVersion(b.dataset.v).then(() => pintarHistorial());
    if (a === 'ver-borrar') borrarVersion(b.dataset.v).then(() => pintarHistorial());
    if (!pop.hidden && pop.contains(b) && a !== 'atajos') pop.innerHTML = htmlPop();
  });
  window.addEventListener('keydown', e => {
    if (!capturando) return; e.preventDefault(); e.stopImmediatePropagation();
    if (e.key === 'Escape') { capturando = null; const c = $('#modalCaja'); if (c) c.innerHTML = htmlAtajos(); return; }
    const c = e.key === 'Delete' ? '' : combo(e); if (c === null || (c === '' && e.key !== 'Delete')) return;
    ponerAtajo(capturando, c); capturando = null; const m = $('#modalCaja'); if (m) m.innerHTML = htmlAtajos();
  }, true);
  E.agregarHerramienta('seleccionar', { n: 'Aislar la selección', ic: 'objeto', k: 'Mayús+I', fn: () => aislar() });
  E.agregarHerramienta('seleccionar', { n: 'Buscar y seleccionar por tipo', ic: 'buscar', fn: () => { const b = document.querySelector('[data-pop="popProd"]'); if (b) b.click(); } });
  E.agregarHerramienta('seleccionar', { n: 'Pantalla limpia', ic: 'expandir', k: 'Mayús+F', fn: () => pantallaLimpia() });

  window.OOProductividad = { etiquetaAuto, etiquetas, medirArea, areas, aislar, ocultar, mostrarTodo, tipos, seleccionarTipo, buscarTexto, irAPaso, guardarVersion, versiones, restaurarVersion, borrarVersion, pantallaLimpia,
    atajo, ponerAtajo, ejecutar, acciones: ACC, combo, get aislado() { return aislado ? [...aislado] : null; } };
})();
