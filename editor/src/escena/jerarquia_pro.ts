/* Editor del mapa (2.1, Map Editor Pro fase 5): jerarquía por edificio, planta, habitación, capa y objeto.
   Añade al árbol de jerarquia.js:
   - «Edificios»: cada fundación con plantas → sus plantas (de abajo arriba) → «Estructura» (paredes, losas, techos, escaleras, aberturas),
     cada habitación con lo que tiene dentro y «Sin habitación». Clic = seleccionar todo lo del nodo; ojo y candado funcionan igual.
   - «Grupos»: los grupos del usuario con sus miembros.
   Clic derecho en un nodo (o en la sección «Jerarquía» del inspector): renombrar, duplicar, agrupar con la selección, mover a otro grupo o
   sacarlo, mover a otra planta (con lo que lleva encima y las puertas de sus paredes, en un paso de deshacer), activar la planta y ver las
   dependencias y anclajes (de qué se apoya y qué se apoya en él, con enlaces para seleccionarlos).
   API: OOJerarquiaPro.renombrar(id, nombre), moverAPlanta(ids, fid, nid), moverAGrupo(keys, gid | null), dependencias(id), arbol(). */
(function () {
  'use strict';
  const E = window.OOEditor, J = window.OOJerarquia; if (!E || !J) return;
  const A = E.api, r3 = A.r3, tb = A.tipoBase, clon = A.clon, esc = A.esc, nv = () => E.nuevos();
  const N = () => window.OONiveles;
  const ESTR = ['muro', 'techo', 'escalera', 'rampa', 'baranda', 'puerta', 'ventana', 'hueco'];
  const nombre = (o?) => A.nombreEntidades(['n' + o.id]);

  /* ---------- modelo: edificio → planta → habitación → objetos ---------- */
  function arbol() {
    const Nv = N(); if (!Nv) return [];
    return Nv.edificios().map((f?) => {
      const plantas = Nv.plantas(f).map((p?) => {
        const objs = Nv.deNivel(f.id, p.id), habs = objs.filter((o?) => tb(o.tipo) === 'habitacion' && !o.datos.suelo);
        const estructura = objs.filter((o?) => ESTR.includes(tb(o.tipo)) || (tb(o.tipo) === 'habitacion' && o.datos.suelo));
        const resto = objs.filter((o?) => !estructura.includes(o) && !habs.includes(o)), porHab = new Map<any, any>(habs.map((h?) => [h.id, []])), sueltos = [];
        for (const o of resto) { const h = habs.find((hh?) => A.dentroPoligono(+o.datos.x || 0, +o.datos.z || 0, A.puntosMundoHab(hh))); if (h) porHab.get(h.id).push(o); else sueltos.push(o); }
        return { p, objs, estructura, habs: habs.map((h?) => ({ h, objs: porHab.get(h.id) })), sueltos };
      });
      return { f, plantas };
    });
  }
  const ks = (l?) => l.map((o?) => 'n' + o.id);
  function hoja(o?) { const k = 'n' + o.id; J.nodos.set('n:' + o.id, [k]); return J.nodoHTML('n:' + o.id, nombre(o), { ic: J.iconoTipo(o.tipo), ojo: !A.ocultos.has(k), cand: J.bloqueados.has(k), oculto: A.ocultos.has(k), comp: J.compIconos(k) }); }
  function carpeta(id?, nom?, lista?, ic?, contenido?, extra?) { const k = ks(lista); J.nodos.set(id, k); return J.nodoHTML(id, nom, Object.assign({ hijos: lista.length > 0, n: lista.length, ic: ic || 'carpeta', ojo: k.length ? !k.every((x?) => A.ocultos.has(x)) : null, cand: k.length ? k.every((x?) => J.bloqueados.has(x)) : null, contenido: contenido || (() => lista.slice(0, 400).map(hoja).join('')) }, extra || {})); }
  function htmlEdificios() {
    const T = arbol(); if (!T.length) return '';
    const todos = T.flatMap((e?) => [e.f].concat(e.plantas.flatMap((p?) => p.objs)));
    return carpeta('edificios', 'Edificios', todos, 'construir', () => T.map((e?) => {
      const lista = [e.f].concat(e.plantas.flatMap((p?) => p.objs));
      return carpeta('ed:' + e.f.id, nombre(e.f), lista, 'fundacion', () => hoja(e.f) + e.plantas.slice().reverse().map((P?) => carpeta('pl:' + e.f.id + ':' + P.p.id, P.p.etiqueta, P.objs, 'niveles', () =>
        (P.estructura.length ? carpeta('es:' + e.f.id + ':' + P.p.id, 'Estructura', P.estructura, 'pared') : '') +
        P.habs.map((H?) => carpeta('hb:' + H.h.id, nombre(H.h) + (H.h.datos.area ? ' · ' + A.fmt(+H.h.datos.area, 1) + ' m²' : ''), [H.h].concat(H.objs), 'habitacion')).join('') +
        (P.sueltos.length ? carpeta('su:' + e.f.id + ':' + P.p.id, 'Sin habitación', P.sueltos, 'objeto') : ''))).join(''));
    }).join(''));
  }
  function grupos() { return [...A.efectivos('grupos')].filter(([, g]) => g && g.mapa === A.mapa && Array.isArray(g.miembros)); }
  function htmlGrupos() {
    const G = grupos(); if (!G.length) return '';
    return J.nodoHTML('grupos', 'Grupos', { hijos: true, n: G.length, ic: 'capas', contenido: () => G.map(([gid, g]) => { const m = g.miembros.filter(A.existe); J.nodos.set('grp:' + gid, m); return J.nodoHTML('grp:' + gid, g.nombre || 'Grupo', { hijos: m.length > 0, n: m.length, ic: 'capas', ojo: !m.every((k?) => A.ocultos.has(k)), contenido: () => m.map((k?) => k[0] === 'n' && nv().get(k.slice(1)) ? hoja(nv().get(k.slice(1))) : J.nodoHTML('pk:' + k, A.nombreEntidades([k]), { ic: 'objeto' })).join('') }); }).join('') });
  }
  J.agregarSeccion(htmlEdificios); J.agregarSeccion(htmlGrupos);
  E.on('col', (c?) => { if (c === 'grupos') J.programar(); });

  /* ---------- operaciones ---------- */
  function guardarDatos(pares?, etiqueta?) { const lista = []; for (const [o, d, extra] of pares) { const v = o.datos; o.datos = d; const doc = A.docActualizado(o, extra); o.datos = v; if (doc) lista.push(doc); } if (lista.length) A.guardar(lista, { etiqueta }); return lista.length; }
  function renombrar(id?, nom?) {
    const o = nv().get(id); if (!o) return false; const props = Object.assign({}, o.props || {}); if (nom && String(nom).trim()) props.nombre = String(nom).trim(); else delete props.nombre;
    if (tb(o.tipo) === 'habitacion') { const d = clon(o.datos); if (props.nombre) d.nombre = props.nombre; return guardarDatos([[o, d, { props }]], 'Renombrar «' + (props.nombre || '') + '»') > 0; }
    return guardarDatos([[o, o.datos, { props }]], 'Renombrar «' + (props.nombre || '') + '»') > 0;
  }
  function renombrarGrupo(gid?, nom?) { const g = A.efectivos('grupos').get(gid); if (!g) return false; A.guardarCol('grupos', gid, Object.assign({}, g, { nombre: String(nom || '').trim() || g.nombre })); return true; }
  /* saca las claves de sus grupos y las mete en gid (o en ninguno); un grupo con menos de dos miembros desaparece */
  function moverAGrupo(keys?, gid?) {
    keys = keys.filter(A.existe); if (!keys.length) return false; const S = new Set<any>(keys);
    for (const [id, g] of grupos()) { if (id === gid) continue; const m = g.miembros.filter((k?) => !S.has(k)); if (m.length === g.miembros.length) continue; A.guardarCol('grupos', id, m.length >= 2 ? Object.assign({}, g, { miembros: m }) : null); }
    if (gid) { const g = A.efectivos('grupos').get(gid); if (!g) return false; A.guardarCol('grupos', gid, Object.assign({}, g, { miembros: [...new Set<any>(g.miembros.concat(keys))] })); }
    J.programar(); return true;
  }
  /* mueve a otra planta lo elegido, lo que lleva encima y las aberturas de sus paredes (un paso) */
  function moverAPlanta(ids?, fid?, nid?) {
    const Nv = N(); if (!Nv) return 0; const F = nv().get(fid); const yN = Nv.yPlanta(fid, nid); if (!F || yN == null) return 0;
    const set = new Set<any>(ids.filter((id?) => nv().get(id)));
    for (const id of [...set]) for (const d of OOAnclajes.dependientes(id, true)) set.add(d);
    for (const o of nv().values()) if (typeof o.datos.muro === 'string' && set.has(o.datos.muro)) set.add(o.id);
    const pares = [];
    for (const id of set) {
      const o = nv().get(id), d = clon(o.datos), n = Nv.nivelDe(o); if (tb(o.tipo) === 'fundacion' && id === fid) continue;
      const y0 = n ? Nv.yPlanta(n.fid, n.nid) : (window.OOTerreno ? OOTerreno.alturaEn(+d.x || 0, +d.z || 0) : 0); if (n && n.fid === fid && n.nid === nid) continue;
      d.y = r3((+d.y || 0) + yN - (y0 || 0)); d.nivel = nid; d.edificio = fid;
      const s = d.soporte; if (s && s.id && set.has(s.id)) { d.soporte = Object.assign({}, s); delete d.soporte.rel; }
      else if (typeof d.muro === 'string') { /* sigue a su pared */ }
      else if (s && s.tipo === 'fundacion' && s.manual) d.soporte = { tipo: 'fundacion', id: fid, manual: true };
      else if (!s || (s.tipo !== 'libre')) d.soporte = { tipo: 'auto' };
      pares.push([o, d]);
    }
    const p = Nv.plantas(fid).find((x?) => x.id === nid); return guardarDatos(pares, 'Mover a ' + (p ? p.etiqueta.toLowerCase() : 'otra planta') + ' (' + pares.length + ')');
  }
  function dependencias(id?) {
    const o = nv().get(id); if (!o) return null; const sop = [], vis = new Set<any>([id]); let s = OOAnclajes.soporte(id);
    while (s && s.id && !vis.has(s.id)) { vis.add(s.id); const S = nv().get(s.id); sop.push({ id: s.id, tipo: s.tipo, nombre: S ? nombre(S) : '¿borrado?', auto: !!s.auto }); s = S ? OOAnclajes.soporte(s.id) : null; }
    const directos = OOAnclajes.dependientes(id, false), todos = OOAnclajes.dependientes(id, true), so = OOAnclajes.soporte(id);
    return { soporte: so ? { tipo: so.tipo, id: so.id || null, auto: !!so.auto, terreno: so.tipo === 'terreno' } : null, cadena: sop, directos, todos, nivel: N() ? N().nivelDe(o) : null };
  }
  function htmlDependencias(id?) {
    const D = dependencias(id); if (!D) return ''; const lnk = (i?) => { const o = nv().get(i); return `<button class="lnk" data-jp-ir="${esc(i)}">${esc(o ? nombre(o) : i)}</button>`; };
    const pl = D.nivel && N() ? (N().plantas(D.nivel.fid).find((p?) => p.id === D.nivel.nid) || {}).etiqueta : null;
    return `<p class="ayuda" style="margin:0 0 4px">${pl ? 'Planta: <b>' + esc(pl) + '</b>. ' : ''}${D.soporte ? (D.soporte.terreno ? 'Sigue el terreno.' : D.soporte.tipo === 'libre' ? 'Libre (no se ancla).' : 'Se apoya en: ' + D.cadena.map((c?) => lnk(c.id)).join(' → ')) : 'No se apoya en nada.'}</p>
      <p class="ayuda" style="margin:0">${D.todos.length ? 'Se apoyan en él ' + D.todos.length + ' (' + D.directos.length + ' directos): ' + D.todos.slice(0, 12).map(lnk).join(', ') + (D.todos.length > 12 ? '…' : '') : 'Nada se apoya en él.'}</p>`;
  }

  /* ---------- menú contextual del árbol ---------- */
  const menu = document.createElement('div'); menu.id = 'menuJer'; menu.className = 'menu-flot'; menu.setAttribute('role', 'menu'); menu.hidden = true; document.body.appendChild(menu);
  let ctxNodo = null;
  function plantasMenu() { const Nv = N(); if (!Nv) return []; return Nv.edificios().flatMap((f?) => Nv.plantas(f).map((p?) => [f.id + '|' + p.id, (Nv.edificios().length > 1 ? nombre(f) + ' · ' : '') + p.etiqueta])); }
  function abrirMenuNodo(id?, x?, y?) {
    ctxNodo = id; const ksN = (J.nodos.get(id) || []).filter(A.existe), obj = id.startsWith('n:') ? nv().get(id.slice(2)) : null, G = grupos();
    let h = `<div class="menu-tit">${esc(obj ? nombre(obj) : id.startsWith('grp:') ? ((A.efectivos('grupos').get(id.slice(4)) || {}).nombre || 'Grupo') : ksN.length + ' objetos')}</div>`;
    if (obj) h += `<button role="menuitem" data-jp="renombrar">Renombrar…</button>`;
    if (id.startsWith('grp:')) h += `<button role="menuitem" data-jp="renombrar-grupo">Renombrar el grupo…</button><button role="menuitem" data-jp="desagrupar">Desagrupar</button>`;
    if (id.startsWith('pl:')) h += `<button role="menuitem" data-jp="activar-planta">Trabajar en esta planta</button><button role="menuitem" data-jp="renombrar-planta">Renombrar la planta…</button>`;
    if (ksN.length) {
      h += `<button role="menuitem" data-jp="seleccionar">Seleccionar</button><button role="menuitem" data-jp="duplicar">Duplicar</button>`;
      if (A.sel.length) h += `<button role="menuitem" data-jp="agrupar-sel">Agrupar con la selección</button>`; else if (ksN.length > 1) h += `<button role="menuitem" data-jp="agrupar">Agrupar</button>`;
      if (G.length) h += `<div class="menu-tit">Mover al grupo</div>` + G.map(([gid, g]) => `<button role="menuitem" data-jp="grupo" data-v="${esc(gid)}">${esc(g.nombre || 'Grupo')}</button>`).join('') + (ksN.some((k?) => A.grupoDeMapa.has(k)) ? `<button role="menuitem" data-jp="sin-grupo">Sacar del grupo</button>` : '');
      const PL = plantasMenu(); if (PL.length && ksN.some((k?) => k[0] === 'n')) h += `<div class="menu-tit">Mover a la planta</div>` + PL.map(([v, n]) => `<button role="menuitem" data-jp="planta" data-v="${esc(v)}">${esc(n)}</button>`).join('');
    }
    if (obj) h += `<button role="menuitem" data-jp="deps">Ver dependencias y anclajes</button>`;
    menu.innerHTML = h; menu.hidden = false; menu.style.position = 'fixed'; menu.style.left = Math.min(x, innerWidth - 240) + 'px'; menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 8) + 'px';
  }
  const arbolEl = document.getElementById('jerArbol');
  if (arbolEl) arbolEl.addEventListener('contextmenu', (e?) => { const n = e.target.closest('.nodo'); if (!n) return; e.preventDefault(); abrirMenuNodo(n.dataset.nodo, e.clientX, e.clientY); });
  document.addEventListener('pointerdown', (e?) => { if (!menu.hidden && !e.target.closest('#menuJer')) menu.hidden = true; }, true);
  async function pedirTexto(titulo?, valor?) {
    const r = await A.abrirModal(`<div class="cab">${esc(titulo)}</div><div class="cont"><input type="text" id="jpTexto" value="${esc(valor || '')}" style="width:100%"></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Aceptar</button></div>`);
    return r === true ? (document.getElementById('jpTexto') as any || {}).value : null;
  }
  menu.addEventListener('click', async (e?) => {
    const b = e.target.closest('[data-jp]'); if (!b) return; menu.hidden = true; const id = ctxNodo, a = b.dataset.jp, ksN = (J.nodos.get(id) || []).filter(A.existe), obj = id && id.startsWith('n:') ? nv().get(id.slice(2)) : null;
    if (a === 'seleccionar') A.seleccionar(ksN.filter(A.seleccionable));
    if (a === 'duplicar') { A.seleccionar(ksN); A.duplicar(); }
    if (a === 'agrupar') { A.seleccionar(ksN); A.agrupar(); }
    if (a === 'agrupar-sel') { A.seleccionar([...new Set<any>(A.sel.concat(ksN))]); A.agrupar(); }
    if (a === 'grupo') moverAGrupo(ksN, b.dataset.v);
    if (a === 'sin-grupo') moverAGrupo(ksN, null);
    if (a === 'planta') { const [f, n] = b.dataset.v.split('|'); moverAPlanta(ksN.filter((k?) => k[0] === 'n').map((k?) => k.slice(1)), f, n); }
    if (a === 'deps' && obj) A.abrirModal(`<div class="cab">Dependencias y anclajes · ${esc(nombre(obj))}</div><div class="cont">${htmlDependencias(obj.id)}</div><div class="pie"><button class="prim" data-a="m-no">Cerrar</button></div>`);
    if (a === 'renombrar' && obj) { const t = await pedirTexto('Renombrar', nombre(obj)); if (t != null) renombrar(obj.id, t); }
    if (a === 'renombrar-grupo') { const g = A.efectivos('grupos').get(id.slice(4)); const t = await pedirTexto('Renombrar el grupo', g && g.nombre); if (t != null) renombrarGrupo(id.slice(4), t); }
    if (a === 'desagrupar') A.guardarCol('grupos', id.slice(4), null);
    if (a === 'activar-planta' || a === 'renombrar-planta') { const [, f, n] = id.split(':'); if (a === 'activar-planta') N().activar(f, n); else { const p = N().plantas(f).find((x?) => x.id === n); const t = await pedirTexto('Renombrar la planta', p && p.etiqueta); if (t != null) N().renombrarPlanta(f, n, t); } }
  });
  document.addEventListener('click', (e?) => { const b = e.target.closest && e.target.closest('[data-jp-ir]'); if (!b) return; A.cerrarModal(null); const k = 'n' + b.dataset.jpIr; if (A.existe(k)) { A.seleccionar([k]); A.encuadrarCaja(A.cajaEntidades([k])); } });

  /* ---------- inspector: sección «Jerarquía» ---------- */
  E.on('panel', () => {
    if (A.herramienta !== 'sel' || !A.sel.length) return; const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return; const ids = A.sel.filter((k?) => k[0] === 'n').map((k?) => k.slice(1)); if (!ids.length) return;
    const PL = plantasMenu(), G = grupos(), g1 = A.grupoDeMapa.get(A.sel[0]);
    const div = document.createElement('div');
    div.innerHTML = `<details class="sec" data-sec="jerarquia"><summary>Jerarquía y dependencias</summary><div class="campos">
      ${PL.length ? `<label class="campo ancho"><span>Mover a la planta</span><select data-jpi="planta"><option value="">—</option>${PL.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></label>` : ''}
      ${G.length ? `<label class="campo ancho"><span>Grupo</span><select data-jpi="grupo"><option value="">Sin grupo</option>${G.map(([gid, g]) => `<option value="${esc(gid)}"${gid === g1 ? ' selected' : ''}>${esc(g.nombre || 'Grupo')}</option>`).join('')}</select></label>` : ''}
      ${ids.length === 1 ? htmlDependencias(ids[0]) : ''}</div></details>`;
    c.appendChild(div.firstElementChild);
  });
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el.dataset || !el.dataset.jpi) return; const ids = A.sel.filter((k?) => k[0] === 'n').map((k?) => k.slice(1));
    if (el.dataset.jpi === 'planta' && el.value) { const [f, n] = el.value.split('|'); moverAPlanta(ids, f, n); }
    if (el.dataset.jpi === 'grupo') moverAGrupo(A.sel.slice(), el.value || null);
  });

  window.OOJerarquiaPro = { arbol, renombrar, renombrarGrupo, moverAGrupo, moverAPlanta, dependencias, grupos };
})();
