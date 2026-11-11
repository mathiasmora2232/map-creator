/* Editor del mapa (2.1, Map Editor Pro fase 4): catálogo de los tipos nuevos.
   - Miniaturas de todo lo nuevo de las fases 2 a 4 (fundaciones, plataformas, escaleras, rampas, barandas, cubiertas, prefabs
     procedurales y edificios): se dibujan con todas sus piezas, también los polígonos (pisos, faldones, perfiles), que las miniaturas
     de editor.js no dibujan.
   - Categoría «Estructura» con fundaciones, plataformas, escaleras, rampas y barandas que se colocan como cualquier objeto, y tarjetas
     de cubierta (una por forma) que activan la herramienta Cubierta.
   - Variantes: las tarjetas con variantes llevan un botón «N ▾»; la variante elegida se coloca (y se queda en la tarjeta).
   - Parámetros: al colocar un prefab o un edificio, el panel muestra sus parámetros (medidas, carriles, plazas, colores…); con un
     prefab ya colocado, el inspector tiene «Parámetros» y sus variantes (con deshacer). Las piezas de un edificio prefabricado
     tienen «Seleccionar el edificio entero». */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s), OO = window.OO;
  const PP = window.OOPrefabsProc, KT = window.OOKits;

  /* ---------- miniaturas ---------- */
  const GEO = { b: new T.BoxGeometry(1, 1, 1), c: new T.CylinderGeometry(0.5, 0.5, 1, 20), s: new T.SphereGeometry(0.5, 20, 14) };
  let rend = null; const cache = new Map();
  function miniaturaPartes(parts) {
    if (!rend) { rend = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rend.setSize(128, 128, false); rend.setPixelRatio(1); }
    const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x777777, 0.85)); const dl = new T.DirectionalLight(0xffffff, 0.65); dl.position.set(-3, 5, 4); sc.add(dl);
    const g = new T.Group(), q = new T.Quaternion(), tirar = []; let modelo = null;
    for (const pt of parts || []) {
      if (pt.f === 't' || pt.ayuda) continue;
      if (pt.oculta) { if (pt.modelo) modelo = pt; continue; }
      const mat = new T.MeshLambertMaterial({ color: pt.c || '#cccccc', transparent: !!pt.t, opacity: pt.t ? 0.45 : 1, side: T.DoubleSide }); tirar.push(mat);
      let m;
      if (pt.f === 'poly') {
        if (!pt.pts || pt.pts.length < 3) continue;
        const sh = new T.Shape(pt.pts.map(([x, z]) => new T.Vector2(x, -z))); if (Array.isArray(pt.agujeros)) for (const ag of pt.agujeros) if (Array.isArray(ag) && ag.length >= 3) sh.holes.push(new T.Path(ag.map(([x, z]) => new T.Vector2(x, -z))));
        const geo = new T.ExtrudeGeometry(sh, { depth: pt.grosor || 0.03, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, pt.y || 0, 0); tirar.push(geo);
        m = new T.Mesh(geo, mat); m.matrixAutoUpdate = false; if (Array.isArray(pt.lm) && pt.lm.length === 16) m.matrix.fromArray(pt.lm);
      } else {
        const geo = GEO[pt.f === 'l' ? 's' : pt.f] || GEO.b; m = new T.Mesh(geo, mat);
        if (pt.q) q.fromArray(pt.q).normalize(); else if (pt.r) q.setFromEuler(new T.Euler(pt.r[0], pt.r[1], pt.r[2])); else q.set(0, 0, 0, 1);
        m.position.fromArray(pt.p); m.quaternion.copy(q); m.scale.set(Math.abs(pt.s[0]) || 1e-4, Math.abs(pt.s[1]) || 1e-4, Math.abs(pt.s[2]) || 1e-4);
      }
      g.add(m);
    }
    if (!g.children.length) { if (modelo && window.OOModelos && OOModelos.listo(modelo.modelo)) return OOModelos.miniatura(modelo.modelo, modelo.c); return ''; }
    sc.add(g); g.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(g), size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3()), r = Math.max(0.05, size.length() / 2);
    const plano = size.y < 0.25 * Math.max(size.x, size.z), dir = plano ? new T.Vector3(0.9, 1.5, 1.1) : new T.Vector3(1, 0.75, 1.15);
    const cm = new T.PerspectiveCamera(30, 1, r / 200, r * 100); cm.position.copy(c).add(dir.normalize().multiplyScalar(r / Math.sin(15 * Math.PI / 180) * 1.02)); cm.lookAt(c);
    rend.setClearColor(0x000000, 0); rend.render(sc, cm); const url = rend.domElement.toDataURL('image/png');
    for (const x of tirar) x.dispose();
    return url;
  }
  function partesDe(it) { try { return OO.construir({ tipo: it.tipo, datos: Object.assign({ x: 0, y: 0, z: 0, giroY: 0 }, A.clon(it.datos)), huecos: [], ext: [0, 0], fotos: [] }); } catch (e) { console.warn('miniatura', it.id, e); return []; } }
  function miniatura(it) { const k = it.id + '|' + JSON.stringify(it.datos); if (cache.has(k)) return cache.get(k); let url = ''; try { url = miniaturaPartes(it.partesMini ? it.partesMini() : partesDe(it)); } catch (e) { console.warn('miniatura', it.id, e); } cache.set(k, url); return url; }
  /* tarjetas con miniatura propia: getter perezoso (catalogo_ui.js usa it.mini si existe) */
  function conMini(it) { if (Object.getOwnPropertyDescriptor(it, 'mini')) return it; let url = null; const datos0 = A.clon(it.datos); Object.defineProperty(it, 'mini', { configurable: true, enumerable: false, get: () => url != null ? url : (url = miniatura({ id: it.id, tipo: it.tipo, datos: datos0, partesMini: it.partesMini })) }); return it; }

  /* ---------- estructura: fundaciones, plataformas, escaleras, rampas y barandas (se colocan como objetos) ---------- */
  const MAT = A.MATERIALES, nuevosItems = [];
  const item = (id, n, tipo, datos, extra) => { const it = Object.assign({ id, n, cat: 'estructura', tipo, datos }, extra || {}); nuevosItems.push(it); return it; };
  const F = window.OOFundaciones ? OOFundaciones.DEF : { forma: 'rect', elevacion: 0.5, espesor: 0.2, base: 'macizo', borde: 'recto', matSup: 'concreto', colorSup: '#b9b4aa', matLat: 'concreto', colorLat: '#8f8a80' };
  item('est_fundacion', 'Fundación 4 × 4 m', 'fundacion', Object.assign({}, F, { forma: 'rect', sx: 4, sz: 4, elevacion: 0.5, sy: 0.5 }));
  item('est_fundacion_alta', 'Fundación elevada 6 × 5 m', 'fundacion', Object.assign({}, F, { forma: 'rect', sx: 6, sz: 5, elevacion: 1.2, sy: 1.2, borde: 'moldura' }));
  if (window.OOPlataformas) for (const k in OOPlataformas.PRESETS) { const P = OOPlataformas.PRESETS[k]; item('est_plat_' + k, 'Plataforma: ' + P.n.toLowerCase(), 'fundacion', Object.assign({}, F, { forma: 'rect', sx: P.sx, sz: P.sz, preset: k }, P.d, { sy: Math.max(0.02, P.d.elevacion || 0.5) })); }
  if (window.OOEscaleras) {
    const ES = OOEscaleras, PE = ES.params, PR = ES.paramsRampa;
    item('est_escalera', 'Escalera recta (2,8 m)', 'escalera', ES.normalizar(Object.assign({ giroY: 0 }, PE, { alto: 2.8, ancho: 1.2, forma: 'recta', descanso: false })));
    item('est_escalera_desc', 'Escalera con descanso (3,2 m)', 'escalera', ES.normalizar(Object.assign({ giroY: 0 }, PE, { alto: 3.2, ancho: 1.2, forma: 'recta', descanso: true })));
    item('est_escalera_l', 'Escalera en L (2,8 m)', 'escalera', ES.normalizar(Object.assign({ giroY: 0 }, PE, { alto: 2.8, ancho: 1.1, forma: 'L', giro: 'izq' })));
    item('est_escalera_zanca', 'Escalera metálica de zancas', 'escalera', ES.normalizar(Object.assign({ giroY: 0 }, PE, { alto: 3, ancho: 1, estilo: 'zanca', color: '#7d858c' })));
    item('est_escalones', 'Escalones (3 peldaños)', 'escalera', ES.normalizar(Object.assign({ giroY: 0 }, PE, { alto: 0.5, ancho: 1.5, barandas: 'ninguna' })));
    item('est_rampa', 'Rampa accesible (8 %)', 'rampa', ES.normalizarRampa(Object.assign({ giroY: 0 }, PR, { alto: 0.6, pendiente: 8, ancho: 1.5 })));
    item('est_rampa_carga', 'Rampa de carga (12 %)', 'rampa', ES.normalizarRampa(Object.assign({ giroY: 0 }, PR, { alto: 1.2, pendiente: 12, ancho: 3, barandas: 'ninguna' })));
  }
  for (const [k, n, c] of [['tubos', 'Baranda de tubos', '#3a3f44'], ['vidrio', 'Baranda de vidrio', '#9aa1a8'], ['barrotes', 'Baranda de barrotes', '#202428'], ['reja', 'Reja baja', '#202428'], ['pretil', 'Pretil de obra', '#d8d4cb']]) item('est_baranda_' + k, n, 'baranda', { sx: 3, sy: k === 'pretil' ? 1.1 : 1.0, sz: k === 'pretil' ? 0.15 : 0.06, estilo: k, color: c });
  for (const it of nuevosItems) { if (!A.ITEMS.some(x => x.id === it.id)) A.ITEMS.push(it); }
  /* cubiertas: una tarjeta por forma (herramienta Cubierta: clic en una habitación, edificio o fundación) */
  const herr = [];
  if (window.OOTechos) for (const [forma, n] of OOTechos.FORMAS) {
    const d = OOTechos.datosForma(forma, {}); const W = 4, D = 3;
    const datos = Object.assign({ x: 0, y: forma === 'pergola' || forma === 'cobertizo' ? 0 : 0, z: 0, giroY: 0, puntos: [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], sx: W, sz: D }, d, { orientacion: 0, grosor: d.espesor, sy: d.espesor });
    herr.push(conMini({ id: 'herr:cubierta:' + forma, n: 'Cubierta: ' + n.toLowerCase(), cat: 'construccion', f: 'techo', tipo: 'techo', datos, herr: { h: forma === 'toldo' ? 'cubierta' : 'cubierta', p: Object.assign({}, OOTechos.DEF[forma] || {}, { forma }), pista: forma === 'toldo' ? 'haz clic en una pared para ponerle el toldo.' : 'haz clic dentro de una habitación, un edificio o una fundación.' } }));
  }
  /* miniaturas para todo lo nuevo (estructura, prefabs y edificios) */
  for (const it of A.ITEMS) { const t = A.tipoBase(it.tipo); if (it.proc || it.kit || ['fundacion', 'escalera', 'rampa', 'baranda'].includes(t)) conMini(it); }

  /* ---------- variantes ---------- */
  const itemDe = id => A.ITEMS.find(x => x.id === id) || null;
  function datosVariante(it, i) {
    const v = it.variantes && it.variantes[i]; if (!v) return null;
    if (it.proc) return PP.datosDe(it.proc, A.clon(v.extra));
    if (it.kit) { const K = KT.KITS[it.kit]; return Object.assign({}, K.def, A.clon(v.extra), { sx: it.datos.sx, sy: it.datos.sy, sz: it.datos.sz }); }
    return Object.assign({}, it.datos, A.clon(v.extra));
  }
  function aplicarVariante(id, i, colocar) {
    const it = itemDe(id); const d = it && datosVariante(it, i); if (!d) return false;
    it.datos = d; it.varActual = i; if (colocar !== false) { A.params.colocar.giro = 0; A.iniciarColocar(id); A.pista(it.n + ' · ' + it.variantes[i].n + ': clic en el mapa para colocarlo.'); }
    if (window.OOCatalogoUI) OOCatalogoUI.render(); return true;
  }
  E.fuentesItems.push(id => { const m = /^(.+)@(\d+)$/.exec(String(id)); if (!m) return null; const it = itemDe(m[1]); const d = it && datosVariante(it, +m[2]); return d ? Object.assign({}, it, { id, n: it.n + ' · ' + it.variantes[+m[2]].n, datos: d, variantes: null }) : null; });
  let menu = null;
  function abrirVariantes(id, ancla) {
    const it = itemDe(id); if (!it || !it.variantes) return;
    if (!menu) { menu = document.createElement('div'); menu.className = 'menu-flot menu-var'; menu.id = 'menuVariantes'; menu.hidden = true; document.body.appendChild(menu); }
    menu.innerHTML = `<div class="menu-tit">${esc(it.n)} · variantes</div>` + it.variantes.map((v, i) => `<button data-pvi="${esc(id)}|${i}" class="${it.varActual === i ? 'on' : ''}"><img alt="" data-pvmini="${i}">${esc(v.n)}</button>`).join('');
    if (window.OOUI) OOUI.abrirMenu('menuVariantes', ancla, { izq: true, siempre: true }); else menu.hidden = false;
    let i = 0; const paso = () => { const im = menu.querySelector(`[data-pvmini="${i}"]`); if (!im) return; im.src = miniatura({ id: id + '@' + i, tipo: it.tipo, datos: datosVariante(it, i) }); i++; requestAnimationFrame(paso); }; requestAnimationFrame(paso);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-pvar]'); if (b) { e.stopPropagation(); e.preventDefault(); abrirVariantes(b.dataset.pvar, b); return; }
    const v = e.target.closest && e.target.closest('[data-pvi]'); if (v) { e.stopPropagation(); e.preventDefault(); if (window.OOUI) OOUI.cerrarMenus(); else menu.hidden = true; const [id, i] = v.dataset.pvi.split('|'); aplicarVariante(id, +i); }
  }, true);

  /* ---------- campos de parámetros ---------- */
  function campo(c, v, attr) {
    const [k, n, tipo] = c, a = `data-${attr}="${esc(k)}"`;
    if (tipo === 'n') return `<label class="campo"><span>${esc(n)}</span><input type="number" ${a} min="${c[3]}" max="${c[4]}" step="${c[5]}" value="${A.r3(+v || 0)}"></label>`;
    if (tipo === 's') return `<label class="campo ancho"><span>${esc(n)}</span><select ${a}>${c[3].map(([x, t]) => `<option value="${esc(x)}"${String(v) === String(x) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    if (tipo === 'c') return `<label class="campo"><span>${esc(n)}</span><input type="color" ${a} value="${esc(v || '#cccccc')}"></label>`;
    if (tipo === 'b') return `<label class="chk"><input type="checkbox" ${a}${v ? ' checked' : ''}> ${esc(n)}</label>`;
    return `<label class="campo ancho"><span>${esc(n)}</span><input type="text" ${a} value="${esc(v == null ? '' : v)}"></label>`;
  }
  const valorDe = (el, c) => c[2] === 'n' ? parseFloat(el.value) : c[2] === 'b' ? !!el.checked : el.value;
  const camposDe = it => it.proc ? (PP.DEFS[it.proc].campos || []) : it.kit ? (KT.KITS[it.kit].campos || []) : [];
  /* datos nuevos de un prefab al cambiar parámetros: los ejes que son parámetros siguen al parámetro; los demás conservan la escala */
  function actualizarProc(clave, viejo, cambios, conservar) {
    const D = PP.DEFS[clave], ej = D.ejes || {}; const ex = Object.assign({}, viejo, cambios);
    for (const ax of ['sx', 'sy', 'sz']) { if (ej[ax]) { if (ej[ax] in cambios) ex[ax] = +cambios[ej[ax]]; } else delete ex[ax]; }
    const nat0 = PP.natural(clave, PP.parametros(clave, viejo)).size; const d = PP.datosDe(clave, ex);
    if (conservar) ['sx', 'sy', 'sz'].forEach((ax, i) => { if (!ej[ax] && +viejo[ax] > 0) d[ax] = A.r3(d[ax] * (+viejo[ax] / nat0[i])); });
    return d;
  }

  /* panel al colocar */
  E.on('panel', () => {
    if (A.herramienta !== 'colocar') return; const it = A.itemPorId(A.params.colocar.item); if (!it || (!it.proc && !it.kit) || String(it.id).includes('@')) return;
    const c = $('#objCuerpo [data-scope="tool"]') || $('#objCuerpo'); if (!c) return; const p = it.proc ? PP.parametros(it.proc, it.datos) : KT.parametros(it.kit, it.datos);
    const vars = (it.variantes || []).map((v, i) => `<button data-pcolvar="${i}" class="${it.varActual === i ? 'on' : ''}">${esc(v.n)}</button>`).join('');
    c.insertAdjacentHTML('beforeend', `<details class="sec" open data-sec="pparam"><summary>${it.kit ? 'Edificio: ' : 'Parámetros: '}${esc(it.n)}</summary><div class="campos">${vars ? `<div class="fila var-fila">${vars}</div>` : ''}${camposDe(it).map(cc => campo(cc, p[cc[0]], 'pcol')).join('')}<p class="ayuda">${it.kit ? 'Se crean la fundación, el piso, las paredes, las puertas, las ventanas y la cubierta: después se editan por separado (la fundación lo mueve entero).' : 'Se guardan con el objeto: luego se cambian en el inspector.'}</p></div></details>`);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || el.dataset.pcol == null) return; const it = A.itemPorId(A.params.colocar.item); if (!it) return;
    const c = camposDe(it).find(x => x[0] === el.dataset.pcol); if (!c) return; let v = valorDe(el, c); if (c[2] === 'n' && !isFinite(v)) return; if (c[2] === 'n') v = Math.max(c[3], Math.min(c[4], v));
    if (it.proc) it.datos = actualizarProc(it.proc, it.datos, { [c[0]]: v }, false); else it.datos = Object.assign({}, it.datos, { [c[0]]: v });
    it.varActual = null; A.renderPanel();
  });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pcolvar]'); if (!b) return; e.preventDefault(); const it = A.itemPorId(A.params.colocar.item); if (it) { aplicarVariante(it.id, +b.dataset.pcolvar, false); A.renderPanel(); } });

  /* inspector: prefab colocado y piezas de un edificio */
  const selUna = () => A.sel.length === 1 && A.sel[0][0] === 'n' ? E.nuevos().get(A.sel[0].slice(1)) : null;
  function cambiarParam(o, cambios, etiqueta) {
    const clave = String(o.tipo).slice(5); if (!PP.DEFS[clave]) return false; const v = o.datos;
    o.datos = actualizarProc(clave, v, cambios, true); for (const k of ['x', 'y', 'z', 'giroY', 'incX', 'incZ', 'soporte', 'nivel', 'edificio', 'origen']) if (v[k] !== undefined) o.datos[k] = v[k];
    const doc = A.docActualizado(o); o.datos = v; if (!doc) return false; A.guardar([doc], { etiqueta: etiqueta || 'Cambiar ' + PP.DEFS[clave].n.toLowerCase() }); return true;
  }
  function varianteObjeto(o, i) { const clave = String(o.tipo).slice(5), D = PP.DEFS[clave]; const v = D && D.variantes && D.variantes[i]; if (!v) return false; const base = Object.assign({}, D.def, v[1]); return cambiarParam(o, base, 'Variante ' + v[0]); }
  E.on('panel', () => {
    if (A.herramienta !== 'sel') return; const o = selUna(); if (!o) return; const c = $('#objCuerpo [data-scope="sel"]'); if (!c) return; const ref = c.querySelector('[data-sec="transform"]');
    let html = '';
    if (String(o.tipo).startsWith('proc:') && PP.DEFS[o.tipo.slice(5)]) {
      const clave = o.tipo.slice(5), D = PP.DEFS[clave], p = PP.parametros(clave, o.datos);
      const vars = (D.variantes || []).map(([n], i) => `<button data-pinsvar="${i}">${esc(n)}</button>`).join('');
      html = `<details class="sec" open data-sec="pparam"><summary>Parámetros: ${esc(D.n)}</summary><div class="campos">${(D.campos || []).map(cc => campo(cc, p[cc[0]], 'pins')).join('')}${vars ? `<p class="ayuda" style="margin:6px 0 2px">Variantes</p><div class="fila var-fila">${vars}</div>` : ''}<p class="ayuda">${Object.keys(D.ejes || {}).length ? 'Estirar con el gizmo cambia ' + Object.entries(D.ejes).map(([ax, k]) => ({ sx: 'X', sy: 'Y', sz: 'Z' })[ax] + ' → ' + k).join(', ') + '; lo demás se escala.' : 'Estirar con el gizmo lo escala.'}</p></div></details>`;
    }
    if (o.datos && o.datos.kit && o.datos.kit.grupo) { const K = KT && KT.KITS[o.datos.kit.clave]; const n = [...E.nuevos().values()].filter(x => x.datos && x.datos.kit && x.datos.kit.grupo === o.datos.kit.grupo).length; html += `<div class="aviso pf-aviso">${svg('prefab')} Parte de <b>${esc(K ? K.n : 'un edificio prefabricado')}</b> (${n} piezas). <div class="fila"><button data-kitsel="${esc(o.datos.kit.grupo)}">Seleccionar el edificio entero</button></div></div>`; }
    if (!html) return; const div = document.createElement('div'); div.innerHTML = html;
    for (const n of [...div.children]) { if (ref && ref.nextSibling) c.insertBefore(n, ref.nextSibling); else c.appendChild(n); }
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || el.dataset.pins == null) return; const o = selUna(); if (!o || !String(o.tipo).startsWith('proc:')) return; const D = PP.DEFS[o.tipo.slice(5)]; if (!D) return;
    const c = (D.campos || []).find(x => x[0] === el.dataset.pins); if (!c) return; let v = valorDe(el, c); if (c[2] === 'n' && !isFinite(v)) return; if (c[2] === 'n') v = Math.max(c[3], Math.min(c[4], v));
    cambiarParam(o, { [c[0]]: v });
  });
  function seleccionarKit(grupo) { const ks = [...E.nuevos().values()].filter(x => x.datos && x.datos.kit && x.datos.kit.grupo === grupo).map(x => 'n' + x.id); A.seleccionar(ks); return ks; }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-pinsvar],[data-kitsel]'); if (!b) return; e.preventDefault();
    if (b.dataset.kitsel) { seleccionarKit(b.dataset.kitsel); return; }
    const o = selUna(); if (o) varianteObjeto(o, +b.dataset.pinsvar);
  });

  window.OOCatalogoPro = { herramientas: () => herr, miniatura, miniaturaPartes, aplicarVariante, datosVariante, actualizarProc, cambiarParam, varianteObjeto, seleccionarKit, items: () => nuevosItems };
  if (window.OOCatalogoUI) OOCatalogoUI.render();
})();
