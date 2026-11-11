/* Editor del mapa (2.1, editor v2): panel «Jerarquía (Escena)» y panel «Capas».
   Jerarquía: Complejo > Entorno, Infraestructura (Edificios, Patios, Contenedores, Vías, Cerramiento), Decoración, Referencias,
   Objetos nuevos (por capa de trabajo) y Zonas. Sale de las secciones del mapa, de los objetos automáticos (calcularAuto) y de los
   objetos nuevos. Ojo = mostrar u ocultar; candado = no se puede seleccionar. Los iconos de la derecha son los comportamientos.
   Capas: visibilidad por categoría (geometría, construcción, vegetación, props, colisiones, iluminación, referencias, etiquetas, guías). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, $ = s => document.querySelector(s);
  const esc = A.esc, svg = A.svg;
  const CATS = [
    ['entorno', 'Entorno', null, /^(Suelo|Entorno|Exterior)$/i],
    ['infra', 'Infraestructura', [
      ['edificios', 'Edificios', /Torre|Caseta|Oficina|Fachada|Sistemas|Rrhh|Interior|Cobertizo|Toldo|Edificio|Bodega|Galp/i],
      ['contenedores', 'Contenedores', /Contenedor/i],
      ['patios', 'Patios', /Patio/i],
      ['vias', 'Vías', /Avenida|Parqueadero|Camell|Calle|Via|Vereda/i],
      ['cerramiento', 'Cerramiento', /Perimetro|Porton|Puerta|Cerca|Muro|Valla/i]]],
    ['decoracion', 'Decoración', null, /Objetos|Letrero|Luces|Autos|Decor/i],
    ['referencias', 'Referencias', null, /Referencia|Colision/i]
  ];
  const ICONO_COMP = { puerta: 'puerta', coche: 'coche', rompible: 'rompible', interactuable: 'mano', luz_interruptor: 'bombilla', aparicion: 'bandera', sonido: 'sonido' };
  const abiertos = new Set(['raiz', 'infra']);
  const bloq = new Set(); E.bloqueos.push(k => bloq.has(k));
  let modelo = null, nodos = new Map(), pend = 0, filtro = '';
  const seccionesExtra = []; /* (2.1 pro f5) */

  function seccionACat(nombre) {
    for (const [id, , sub, re] of CATS) { if (sub) { for (const [sid, , sre] of sub) if (sre.test(nombre)) return sid; } else if (re.test(nombre)) return id; }
    return 'entorno';
  }
  /* modelo estático del mapa: secciones con sus objetos automáticos agrupados por nombre */
  function construirModelo() {
    const D = A.D, P = A.P, N = A.N; if (!D) return null;
    const secs = D.secciones.map((n, j) => ({ j, n, cat: seccionACat(n), autos: new Map(), sueltas: 0, total: 0 }));
    const vistoAuto = new Set();
    for (let i = 0; i < N; i++) {
      const z = P[i]; const s = secs[z.sec]; if (!s) continue; s.total++;
      const a = A.autoDe('p' + i);
      if (a == null) { s.sueltas++; continue; }
      if (vistoAuto.has(a)) continue; vistoAuto.add(a);
      const g = A.autos[a]; const nom = g.nombre || 'Objeto';
      if (!s.autos.has(nom)) s.autos.set(nom, []); s.autos.get(nom).push(a);
    }
    return { secs };
  }
  const nombreSec = n => String(n).replace(/([a-z])([A-Z])/g, '$1 $2');
  function claves(id) { return nodos.get(id) || []; }
  /* ---- dibujo del árbol ---- */
  function nodoHTML(id, nombre, opts) {
    opts = opts || {};
    const hijos = !!opts.hijos, ab = abiertos.has(id);
    const ojo = opts.ojo === undefined ? null : opts.ojo, cand = opts.cand === undefined ? null : opts.cand;
    return `<li role="treeitem"${hijos ? ` aria-expanded="${ab}"` : ''}><div class="nodo${opts.oculto ? ' oculto' : ''}" data-nodo="${esc(id)}">` +
      `<button class="tg${hijos ? (ab ? ' abierto' : '') : ' hoja'}" data-jer="tg" tabindex="-1" aria-label="Desplegar">${svg('derecha')}</button>` +
      `<button class="nom" data-jer="sel" title="${esc(opts.titulo || nombre)}">${svg(opts.ic || 'carpeta')}<span>${esc(nombre)}</span>${opts.comp || ''}${opts.n != null ? `<small>${A.fmtInt(opts.n)}</small>` : ''}</button>` +
      (cand !== null ? `<button class="bi${cand ? '' : ' off'}" data-jer="cand" title="${cand ? 'Bloqueado: no se puede seleccionar' : 'Bloquear'}" aria-label="Bloquear">${svg(cand ? 'candado' : 'abierto')}</button>` : '') +
      (ojo !== null ? `<button class="bi${ojo ? '' : ' off'}" data-jer="ojo" title="${ojo ? 'Ocultar' : 'Mostrar'}" aria-label="Mostrar u ocultar">${svg(ojo ? 'ojo' : 'ojoNo')}</button>` : '') +
      `</div>${hijos && ab ? '<ul role="group">' + opts.contenido() + '</ul>' : ''}</li>`;
  }
  function compIconos(k) {
    const pr = A.propsDe(k); const cs = pr && Array.isArray(pr.comportamientos) ? pr.comportamientos : [];
    let h = cs.map(c => `<span class="comp" title="${esc(c.tipo)}">${svg(ICONO_COMP[c.tipo] || 'info')}</span>`).join('');
    if (pr && pr.material) h += `<span class="comp" title="Material propio">${svg('pintar')}</span>`;
    return h;
  }
  function seccionesDeCat(cat) { return modelo ? modelo.secs.filter(s => s.cat === cat) : []; }
  function htmlSeccion(s) {
    const id = 's' + s.j, on = A.secOn[s.j + 1] !== false, lk = !!A.secLock[s.j + 1];
    return nodoHTML(id, nombreSec(s.n), { hijos: s.autos.size > 0, n: s.total, ojo: on, cand: lk, oculto: !on, ic: 'carpeta', contenido: () => {
      const grupos = [...s.autos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
      let h = '';
      for (const [nom, lista] of grupos.slice(0, 250)) {
        if (lista.length === 1) h += htmlAuto(lista[0]);
        else { const gid = 'g' + s.j + ':' + nom; const ks = []; lista.forEach(a => ks.push(...A.autos[a].keys)); nodos.set(gid, ks);
          h += nodoHTML(gid, nom, { hijos: true, n: lista.length, ic: 'capas', ojo: !ks.every(k => A.ocultos.has(k)), contenido: () => lista.slice(0, 300).map(htmlAuto).join('') + (lista.length > 300 ? `<li class="mas-items">y ${lista.length - 300} más…</li>` : '') }); }
      }
      if (grupos.length > 250) h += `<li class="mas-items">y ${grupos.length - 250} tipos más (usa el buscador)…</li>`;
      if (s.sueltas) h += `<li class="mas-items">${A.fmtInt(s.sueltas)} piezas sueltas (paredes, suelos…)</li>`;
      return h;
    } });
  }
  function htmlAuto(a) {
    const g = A.autos[a], id = 'a' + a; nodos.set(id, g.keys);
    const oc = g.keys.every(k => A.ocultos.has(k)), lk = g.keys.every(k => bloq.has(k));
    const pr = A.propsDe(g.keys[0]);
    return nodoHTML(id, (pr && pr.nombre) || g.nombre, { ic: 'objeto', ojo: !oc, cand: lk, oculto: oc, comp: compIconos(g.keys[0]), titulo: g.nombre + ' · ' + g.keys.length + ' piezas' });
  }
  function htmlCat(cat, nombre) {
    const ss = seccionesDeCat(cat); const n = ss.reduce((t, s) => t + s.total, 0);
    const on = ss.some(s => A.secOn[s.j + 1] !== false);
    return nodoHTML('c' + cat, nombre, { hijos: ss.length > 0, n, ojo: ss.length ? on : null, oculto: ss.length && !on, contenido: () => ss.map(htmlSeccion).join('') });
  }
  function htmlNuevos() {
    const porCapa = new Map();
    for (const o of A.capasLista ? E.nuevos().values() : []) { if (A.tipoBase(o.tipo) === 'nota') continue; const c = A.capaDeNuevo(o); if (!porCapa.has(c)) porCapa.set(c, []); porCapa.get(c).push(o); }
    const total = [...porCapa.values()].reduce((t, l) => t + l.length, 0);
    return nodoHTML('nuevos', 'Objetos nuevos', { hijos: total > 0, n: total, ic: 'construir', contenido: () => [...porCapa.entries()].map(([capa, l]) => {
      const cid = 'capa:' + capa; const info = A.capaInfo(capa);
      return nodoHTML(cid, capa, { hijos: true, n: l.length, ic: 'capas', ojo: info.visible !== false, cand: !!info.bloqueada, contenido: () => l.slice(0, 400).map(o => {
        const k = 'n' + o.id; nodos.set('n:' + o.id, [k]);
        return nodoHTML('n:' + o.id, A.nombreEntidades([k]), { ic: iconoTipo(o.tipo), ojo: !A.ocultos.has(k), cand: bloq.has(k), oculto: A.ocultos.has(k), comp: compIconos(k) });
      }).join('') });
    }).join('') });
  }
  function iconoTipo(t) { const b = A.tipoBase(t); return { muro: 'pared', habitacion: 'habitacion', puerta: 'puerta', ventana: 'ventana', calle: 'suelo', techo: 'techo', nota: 'nota', luz: 'bombilla', coche: 'coche', copia: 'prefab' }[b] || 'objeto'; }
  function htmlReferencias() {
    const ss = seccionesDeCat('referencias');
    const calcos = [...A.efectivos('calcos')].filter(([, d]) => d && d.mapa === A.mapa);
    const notas = [...E.nuevos().values()].filter(o => A.tipoBase(o.tipo) === 'nota');
    const guias = [...A.efectivos('guias')].filter(([, g]) => g && g.mapa === A.mapa).length;
    const n = ss.reduce((t, s) => t + s.total, 0) + calcos.length + notas.length;
    return nodoHTML('creferencias', 'Referencias', { hijos: true, n, ojo: ss.some(s => A.secOn[s.j + 1] !== false) || A.verNotas, contenido: () =>
      ss.map(htmlSeccion).join('') +
      nodoHTML('calcos', 'Calcos (mapas e imágenes)', { hijos: calcos.length > 0, n: calcos.length, ic: 'mapa', contenido: () => calcos.map(([id, d]) => nodoHTML('k:' + id, d.nombre || 'Calco', { ic: 'mapa', ojo: d.visible !== false })).join('') }) +
      nodoHTML('notas', 'Notas con fotos', { hijos: notas.length > 0, n: notas.length, ic: 'nota', ojo: A.verNotas, contenido: () => notas.map(o => { nodos.set('n:' + o.id, ['n' + o.id]); return nodoHTML('n:' + o.id, (o.texto || 'Nota').slice(0, 40), { ic: 'nota' }); }).join('') }) +
      nodoHTML('guias', 'Guías', { n: guias, ic: 'guias' })
    });
  }
  function htmlZonas() {
    const Z = window.OOZonas; if (!Z) return '';
    const l = Z.lista();
    return nodoHTML('zonas', 'Zonas', { hijos: l.length > 0, n: l.length, ic: 'zona', contenido: () => l.map(z => nodoHTML('z:' + z.id, z.nombre, { ic: 'zona', ojo: !z.oculta, n: z.n })).join('') });
  }
  function htmlBusqueda() {
    const q = filtro.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); const res = []; const norm = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (modelo) for (const s of modelo.secs) {
      if (norm(s.n).includes(q)) res.push(htmlSeccion(s));
      for (const [nom, l] of s.autos) if (norm(nom).includes(q)) for (const a of l) { if (res.length > 300) break; res.push(htmlAuto(a)); }
    }
    for (const o of E.nuevos().values()) { const k = 'n' + o.id; const n = A.nombreEntidades([k]); if (norm(n + ' ' + o.tipo).includes(q)) { nodos.set('n:' + o.id, [k]); res.push(nodoHTML('n:' + o.id, n, { ic: iconoTipo(o.tipo), ojo: !A.ocultos.has(k), comp: compIconos(k) })); } }
    return res.length ? res.slice(0, 300).join('') : '<li class="mas-items">Nada coincide.</li>';
  }
  function render() {
    pend = 0; const el = $('#jerArbol'); if (!el || !A.D) return;
    if (!modelo) modelo = construirModelo();
    nodos = new Map();
    const scroll = el.scrollTop;
    const mapaU = /^u-/.test(A.mapa) && A.efectivos ? A.efectivos('mapas').get(A.mapa) : null; // mapa propio (mapas_nuevos.js)
    const nombreMapa = mapaU ? (mapaU.nombre || A.mapa) : A.mapa === 'parqueadero' ? 'Parqueadero' : 'Complejo';
    if (filtro) el.innerHTML = '<ul>' + htmlBusqueda() + '</ul>';
    else el.innerHTML = '<ul>' + nodoHTML('raiz', nombreMapa, { hijos: true, ic: 'carpeta', contenido: () =>
      htmlCat('entorno', 'Entorno') +
      nodoHTML('infra', 'Infraestructura', { hijos: true, ic: 'carpeta', ojo: CATS[1][2].some(([c]) => seccionesDeCat(c).some(s => A.secOn[s.j + 1] !== false)), contenido: () => CATS[1][2].map(([c, n]) => htmlCat(c, n)).join('') }) +
      htmlCat('decoracion', 'Decoración') + htmlReferencias() + seccionesExtra.map(f => { try { return f(); } catch (e) { console.warn('jerarquía', e); return ''; } }).join('') + htmlNuevos() + htmlZonas() /* (2.1 pro f5) edificios, plantas y grupos: jerarquia_pro.js */
    }) + '</ul>';
    el.scrollTop = scroll; marcarSel();
  }
  function programar() { if (pend) return; pend = setTimeout(render, 120); }
  function marcarSel() {
    const s = new Set(A.sel); const el = $('#jerArbol'); if (!el) return;
    el.querySelectorAll('.nodo').forEach(n => { const ks = nodos.get(n.dataset.nodo); n.classList.toggle('sel', !!ks && ks.length > 0 && ks.length === s.size && ks.every(k => s.has(k))); });
  }
  /* ---- interacción ---- */
  function catSecciones(id) {
    if (id[0] === 's') return [modelo.secs[+id.slice(1)]];
    if (id === 'infra') return modelo.secs.filter(s => CATS[1][2].some(([c]) => c === s.cat));
    if (id[0] === 'c') return seccionesDeCat(id.slice(1));
    return [];
  }
  $('#jerArbol').addEventListener('click', e => {
    const b = e.target.closest('[data-jer]'); if (!b) return; const nodo = b.closest('.nodo'); const id = nodo.dataset.nodo; const acc = b.dataset.jer;
    if (acc === 'tg' || (acc === 'sel' && !nodos.has(id) && !/^(k:|z:)/.test(id))) { if (abiertos.has(id)) abiertos.delete(id); else abiertos.add(id); render(); return; }
    if (acc === 'sel') {
      if (id.startsWith('k:')) { A.seleccionarCalco(id.slice(2)); return; }
      if (id.startsWith('z:')) { if (window.OOZonas) OOZonas.seleccionar(id.slice(2)); return; }
      const ks = claves(id).filter(A.seleccionable); if (!ks.length) { A.pista('Está bloqueado u oculto.'); return; }
      A.seleccionar(ks); if (e.detail >= 2) A.encuadrarCaja(A.cajaEntidades(ks)); return;
    }
    if (acc === 'ojo') {
      if (id.startsWith('k:')) { const cid = id.slice(2), d = A.efectivos('calcos').get(cid); if (d) A.guardarCol('calcos', cid, Object.assign({}, d, { visible: d.visible === false, actualizado: A.ahora() })); setTimeout(render, 60); return; }
      if (id.startsWith('z:')) { if (window.OOZonas) OOZonas.alternarOculta(id.slice(2)); render(); return; }
      if (id.startsWith('capa:')) { const n = id.slice(5); A.guardarCapa(n, { visible: A.capaInfo(n).visible === false }); setTimeout(render, 60); return; }
      if (id === 'notas') { A.ponerVerNotas(!A.verNotas); render(); return; }
      if (id === 'creferencias') { const ss = catSecciones('creferencias'); const v = !(ss.some(s => A.secOn[s.j + 1] !== false) || A.verNotas); ss.forEach(s => { A.secOn[s.j + 1] = v; }); A.ponerVerNotas(v); A.renderSecciones(); A.renderTodo(); render(); return; }
      const ss = catSecciones(id);
      if (ss.length) { const v = !ss.some(s => A.secOn[s.j + 1] !== false); ss.forEach(s => { A.secOn[s.j + 1] = v; }); A.renderSecciones(); A.renderTodo(); render(); return; }
      const ks = claves(id); if (!ks.length) return; const ocultar = !ks.every(k => A.ocultos.has(k)); A.ocultar(ks, ocultar); if (ocultar) A.seleccionar(A.sel.filter(k => !ks.includes(k)), { sinTab: true }); render(); return;
    }
    if (acc === 'cand') {
      if (id.startsWith('capa:')) { const n = id.slice(5); A.guardarCapa(n, { bloqueada: !A.capaInfo(n).bloqueada }); setTimeout(render, 60); return; }
      if (id[0] === 's') { const j = +id.slice(1) + 1; A.ponerSecLock(j, !A.secLock[j]); render(); return; }
      const ks = claves(id); if (!ks.length) return; const v = !ks.every(k => bloq.has(k)); ks.forEach(k => { if (v) bloq.add(k); else bloq.delete(k); }); if (v) A.seleccionar(A.sel.filter(k => !bloq.has(k)), { sinTab: true }); render();
    }
  });
  $('#jerBuscar').addEventListener('input', e => { filtro = e.target.value.trim(); render(); });

  /* ---------------- Capas por categoría ---------------- */
  const CAPAS = [['geometria', 'Geometría', 'objeto'], ['construccion', 'Construcción', 'construir'], ['vegetacion', 'Vegetación', 'terreno'], ['props', 'Props / Detalle', 'prefab'], ['colisiones', 'Colisiones', 'rejilla'], ['iluminacion', 'Iluminación', 'bombilla'], ['referencias', 'Referencias (Fotos)', 'mapa'], ['etiquetas', 'Etiquetas', 'info'], ['guias', 'Guías / Grilla', 'guias']];
  let capOn = { geometria: true, construccion: true, vegetacion: true, props: true, colisiones: false, iluminacion: true, referencias: true, etiquetas: true, guias: true };
  try { Object.assign(capOn, JSON.parse(localStorage.getItem('oo-editor-capascat') || '{}')); } catch (e) { }
  let catPieza = null; const CODIGO = { geometria: 1, vegetacion: 2, props: 3, colisiones: 4, iluminacion: 5, referencias: 6, etiquetas: 7 }, DE_COD = Object.keys(CODIGO).reduce((o, k) => { o[CODIGO[k]] = k; return o; }, {});
  const VEG = /arbol|árbol|arbust|planta|palmera|copa|tronco|seto|hoja|cesped|césped/i;
  function clasificar() {
    const P = A.P, N = A.N, D = A.D; catPieza = new Uint8Array(N);
    const refSec = new Set(); D.secciones.forEach((n, j) => { if (/Referencia/i.test(n)) refSec.add(j); });
    for (let i = 0; i < N; i++) {
      const z = P[i]; let c = 'geometria';
      if (z.cat === 'col') c = 'colisiones'; else if (z.cat === 'luz') c = 'iluminacion'; else if (z.cat === 'txt') c = 'etiquetas';
      else if (refSec.has(z.sec)) c = 'referencias';
      else {
        const a = A.autoActivo('p' + i), nom = a ? a.nombre : '';
        if (VEG.test(nom) || VEG.test(z.nom || '')) c = 'vegetacion';
        else if (a && !/^(Muro|Valla|Piso de baldosas)/.test(nom)) c = 'props';
        else if (Math.max(z.b.s.x, z.b.s.y, z.b.s.z) < 1.2 && z.t !== 7) c = 'props';
      }
      catPieza[i] = CODIGO[c];
    }
  }
  function catNuevo(o) { const b = A.tipoBase(o.tipo); if (b === 'nota') return 'referencias'; if (b === 'luz' || b === 'poste') return 'iluminacion'; if (b === 'arbol') return 'vegetacion'; if (b === 'cartel') return 'etiquetas'; return 'construccion'; }
  E.filtrosVis.push((k, z) => {
    if (k[0] === 'p') { if (!catPieza || catPieza.length !== A.N) return true; const c = DE_COD[catPieza[+k.slice(1)]]; if (c === 'colisiones' || c === 'iluminacion') return true; /* las controla verCol / verLuces */ return capOn[c] !== false; }
    return capOn[catNuevo(z)] !== false;
  });
  function aplicarCapasExtra() {
    if (A.verCol !== capOn.colisiones) A.ponerVerCol(capOn.colisiones);
    if (A.verLuces !== capOn.iluminacion) A.ponerVerLuces(capOn.iluminacion);
    A.grupoCalcos.visible = capOn.referencias; A.grupoGuias.visible = capOn.guias;
    if (A.verRejilla !== capOn.guias) A.ponerVerRejilla(capOn.guias);
    if (A.AJ.etiquetas !== capOn.etiquetas) { A.AJ.etiquetas = capOn.etiquetas; A.guardarAjustes(); }
    A.grupoTextos.visible = capOn.etiquetas;
    A.marcar();
  }
  function renderCapasCat() {
    const ul = $('#capasCat'); if (!ul) return;
    ul.innerHTML = CAPAS.map(([k, n, ic]) => `<li><label><input type="checkbox" data-capcat="${k}" ${capOn[k] !== false ? 'checked' : ''}>${svg(ic)}<span>${esc(n)}</span></label></li>`).join('');
  }
  $('#capasCat').addEventListener('change', e => {
    const k = e.target.dataset.capcat; if (!k) return; capOn[k] = e.target.checked; try { localStorage.setItem('oo-editor-capascat', JSON.stringify(capOn)); } catch (er) { }
    aplicarCapasExtra(); A.renderTodo();
  });
  /* sincronizar si cambian desde otro sitio (barra inferior: Colisiones; vista: luces, rejilla) */
  document.addEventListener('change', e => {
    const id = e.target.id; const m = { verCol: 'colisiones', verLuces: 'iluminacion', verRejilla: 'guias' }[id];
    if (m) { capOn[m] = e.target.checked; try { localStorage.setItem('oo-editor-capascat', JSON.stringify(capOn)); } catch (er) { } renderCapasCat(); }
  });

  /* ---------------- pestaña «Notas»: todas las notas del mapa con sus fotos ---------------- */
  function renderNotas() {
    const el = $('#listaNotas'); if (!el) return;
    /* (2.1) las notas con pin (objeto «nota») ya salen arriba con su editor (notas_editor.js y notas_pro.js): aquí solo las notas escritas
       sobre piezas del mapa o en un cambio, plegadas */
    const docs = [...A.efectivos()].filter(([, d]) => d && d.mapa === A.mapa && !(d.accion === 'nota' && d.id_objeto) && (d.accion === 'nota' || (d.texto && String(d.texto).trim()) || (Array.isArray(d.fotos) && d.fotos.length)));
    docs.sort((a, b) => String(b[1].actualizado || '').localeCompare(String(a[1].actualizado || '')));
    el.innerHTML = !docs.length ? '' : `<details class="sec notas-piezas"><summary>Notas en piezas del mapa <small>${docs.length}</small></summary><p class="ayuda">Notas escritas al seleccionar piezas del mapa (inspector → «Nota y fotos»). Clic para ir al sitio.</p><ul class="lista">` +
      docs.map(([id, d]) => `<li class="cambio"><button class="ir" data-a="ir" data-id="${esc(id)}"><span><b>${esc(A.nombreTipo(d.tipo))}</b></span>${d.texto ? `<small class="txt">${esc(String(d.texto).slice(0, 160))}</small>` : ''}${(d.fotos || []).length ? `<span class="fotos">${d.fotos.slice(0, 4).map(f => `<img src="/_blob/${String(f).split('/').map(encodeURIComponent).join('/')}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:5px" loading="lazy">`).join('')}</span>` : ''}</button></li>`).join('') + '</ul></details>';
  }
  E.on('tab', t => { if (t === 'notas') renderNotas(); });
  E.on('recompute', () => { const p = document.querySelector('[data-panel="notas"]'); if (p && !p.hidden) renderNotas(); });
  E.on('mapa', () => { modelo = null; clasificar(); aplicarCapasExtra(); A.renderTodo(); render(); });
  E.on('recompute', programar); E.on('col', programar); E.on('calcos', programar); E.on('seleccion', marcarSel);
  renderCapasCat();
  window.OOJerarquia = { agregarSeccion: f => { seccionesExtra.push(f); programar(); }, nodoHTML, iconoTipo, compIconos, get nodos() { return nodos; }, abiertos, /* (2.1 pro f5) */
    render, programar, bloqueados: bloq, capas: () => capOn, categoria: i => catPieza ? DE_COD[catPieza[i]] : null };
})();
