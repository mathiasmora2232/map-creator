/* Editor del mapa (2.1, Map Editor Pro fase 2): fundaciones y plataformas elevables, como en Los Sims.
   Objeto `fundacion` en «cambios». Datos:
     x, y, z      centro de la fundación y altura del terreno donde se apoya (y)
     giroY        orientación
     forma        'rect' (sx × sz) o 'poligono' (puntos [[x, z]…] locales; sx y sz son su caja y escalan los puntos)
     elevacion    altura de la cara de arriba sobre y (0 = a ras del suelo). `sy` la repite para el gizmo y las cajas.
     espesor      grosor de la losa
     base         'macizo' (bloque hasta el suelo) o 'losa' (losa con pilotes debajo)
     borde        'recto', 'bordillo' (reborde de 12 cm) o 'moldura' (canto que sobresale 5 cm)
     matSup, colorSup   material y color de la cara de arriba;  matLat, colorLat  de los lados
   Al cambiar la elevación (inspector, botones 0 / 0,5 / 1 / 1,5 m o el asa con flecha) la fundación sube y, por anclajes.js, se trasladan
   en vertical las paredes, pisos, puertas, ventanas y objetos que tiene encima, sin cambiar su altura. Lo no anclado no se mueve.
   Herramientas: Construir → «Fundación (rectángulo)» (arrastrar) y «Fundación (polígono)» (clic por esquina, clic en la primera o Enter). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, B = OO.B, MAT = A.MATERIALES;
  A.ICON.fundacion = '<path d="M3 15l9-5 9 5-9 5z"/><path d="M3 15v3l9 5 9-5v-3"/><path d="M12 10V4"/><path d="M9.5 6.5L12 4l2.5 2.5"/>';
  const DEF = { forma: 'rect', elevacion: 0.5, espesor: 0.2, base: 'macizo', borde: 'recto', matSup: 'concreto', colorSup: (MAT.concreto || {}).c || '#b9b4aa', matLat: 'concreto', colorLat: '#8f8a80' };
  const P = Object.assign({ modo: 'rect' }, DEF);
  A.params.fundacion = P;

  /* ---------- geometría ---------- */
  function puntosLocales(e?) {
    if (e.forma !== 'poligono' || !Array.isArray(e.puntos) || e.puntos.length < 3) { const hx = Math.max(0.05, +e.sx || 4) / 2, hz = Math.max(0.05, +e.sz || 4) / 2; return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of e.puntos) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const kx = (+e.sx || (x1 - x0)) / ((x1 - x0) || 1), kz = (+e.sz || (z1 - z0)) / ((z1 - z0) || 1);
    return e.puntos.map(([x, z]) => [x * kx, z * kz]);
  }
  function huella(e?) { const g = (+e.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); return puntosLocales(e).map(([x, z]) => [(+e.x || 0) + x * c + z * s, (+e.z || 0) - x * s + z * c]); }
  const elev = (e?) => Math.max(0, isFinite(+e.elevacion) ? +e.elevacion : (+e.sy || 0));
  function partes(e?) {
    const el = elev(e), es = Math.max(0.02, Math.min(5, +e.espesor || 0.2)), top = el, bot = (e.base === 'losa' || e.base === 'columnas') ? top - es : Math.min(0, top - es); /* (2.1 pro f3) columnas: plataformas.js */
    const cS = e.colorSup || e.color || DEF.colorSup, cL = e.colorLat || DEF.colorLat, cap = Math.min(0.02, (top - bot) / 4);
    const pts = puntosLocales(e), out = [];
    if (e.forma === 'poligono') { out.push({ f: 'poly', pts, y: bot, grosor: Math.max(0.005, top - bot - cap), c: cL }, { f: 'poly', pts, y: top - cap, grosor: cap, c: cS }); }
    else { const sx = Math.max(0.05, +e.sx || 4), sz = Math.max(0.05, +e.sz || 4); out.push(B(0, bot + (top - bot - cap) / 2, 0, sx, Math.max(0.005, top - bot - cap), sz, cL), B(0, top - cap / 2, 0, sx, cap, sz, cS)); }
    /* bordes y pilotes por cada lado */
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const ang = Math.atan2(-dz, dx), nx = dz / L, nz = -dx / L; /* normal hacia fuera si los puntos van en sentido antihorario visto desde arriba */
      const orient = areaFirmada(pts) > 0 ? 1 : -1, ox = nx * orient, oz = nz * orient, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (e.borde === 'bordillo') out.push(B(mx - ox * 0.075, top + 0.06, mz - oz * 0.075, L, 0.12, 0.15, cL, { r: [0, ang, 0] }));
      if (e.borde === 'moldura') out.push(B(mx + ox * 0.025, top - 0.07, mz + oz * 0.025, L + 0.1, 0.14, 0.05, cL, { r: [0, ang, 0] }));
      if (e.base === 'losa' && bot > 0.05) { const n = Math.max(1, Math.ceil(L / 3)); for (let k = 0; k < n; k++) { const t = k / n; const px = a[0] + dx * t - ox * 0.2, pz = a[1] + dz * t - oz * 0.2; out.push(B(px, bot / 2, pz, 0.25, bot, 0.25, cL)); } }
    }
    if (window.OOPlataformas) OOPlataformas.extras(e, pts, top, bot, out); /* (2.1 pro f3) barandas, defensas, columnas, línea de seguridad */
    return out;
  }
  function areaFirmada(p?) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* sy y elevacion van juntas: lo que cambió manda (el gizmo cambia sy; el inspector, elevacion) */
  function normalizar(x?, prev?) {
    if (prev && Math.abs((+x.sy || 0) - (+prev.sy || 0)) > 1e-6 && Math.abs((+x.elevacion || 0) - (+prev.elevacion || 0)) < 1e-6) x.elevacion = r3(Math.max(0, +x.sy || 0));
    x.elevacion = r3(Math.max(0, isFinite(+x.elevacion) ? +x.elevacion : 0.5)); x.sy = r3(Math.max(0.02, x.elevacion));
    if (x.forma !== 'poligono') x.forma = 'rect';
    if (x.forma === 'poligono' && Array.isArray(x.puntos)) { const hu = huella(x); x.area = r3(Math.abs(areaFirmada(hu))); } else x.area = r3((+x.sx || 0) * (+x.sz || 0));
    if (!x.colorSup) x.colorSup = x.color || DEF.colorSup; x.color = x.colorSup; if (x.matSup) x.material = x.matSup;
  }
  function datosNuevos(extra?) {
    const d = Object.assign({ forma: P.forma, elevacion: P.elevacion, espesor: P.espesor, base: P.base, borde: P.borde, matSup: P.matSup, colorSup: P.colorSup, matLat: P.matLat, colorLat: P.colorLat, giroY: 0 }, extra || {});
    normalizar(d, null); return d;
  }
  /* crea una fundación rectangular (API y herramienta) */
  function crearRect(x0?, z0?, x1?, z1?, y?, extra?) {
    const d = datosNuevos(Object.assign({ forma: 'rect', x: (x0 + x1) / 2, y: y || 0, z: (z0 + z1) / 2, sx: Math.abs(x1 - x0), sz: Math.abs(z1 - z0) }, extra || {}));
    const id = A.crearNuevo('fundacion', d, null, { etiqueta: 'Crear fundación' }); if (id) A.pista('Fundación de ' + A.fmt(d.sx) + ' × ' + A.fmt(d.sz) + ' m a ' + A.fmt(d.elevacion) + ' m.'); return id;
  }
  function crearPoligono(ptsMundo?, y?, extra?) {
    if (!ptsMundo || ptsMundo.length < 3) return null; const [cx, cz] = A.centroide(ptsMundo);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of ptsMundo) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const d = datosNuevos(Object.assign({ forma: 'poligono', x: cx, y: y || 0, z: cz, puntos: ptsMundo.map(([x, z]) => [r3(x - cx), r3(z - cz)]), sx: x1 - x0, sz: z1 - z0 }, extra || {}));
    const id = A.crearNuevo('fundacion', d, null, { etiqueta: 'Crear fundación' }); if (id) A.pista('Fundación de ' + A.fmt(d.area, 1) + ' m² a ' + A.fmt(d.elevacion) + ' m.'); return id;
  }
  /* cambia la elevación (o cualquier dato) con deshacer y arrastra lo anclado */
  function cambiar(id?, cambios?, etiqueta?) {
    const o = E.nuevos().get(id); if (!o) return false; const v = o.datos; o.datos = Object.assign({}, v, cambios);
    if (cambios.elevacion != null) o.datos.sy = Math.max(0.02, +cambios.elevacion);
    if (cambios.matSup && MAT[cambios.matSup]) o.datos.colorSup = MAT[cambios.matSup].c; if (cambios.matLat && MAT[cambios.matLat]) o.datos.colorLat = MAT[cambios.matLat].c;
    const doc = A.docActualizado(o); o.datos = v; if (!doc) return false;
    A.guardar([doc], { etiqueta: etiqueta || 'Cambiar fundación' }); return true;
  }
  const elevar = (id?, el?) => cambiar(id, { elevacion: Math.max(0, +el || 0) }, 'Elevar fundación a ' + A.fmt(Math.max(0, +el || 0)) + ' m');

  /* ---------- herramienta ---------- */
  let est = null;
  function previa(d?) { A.mostrarPrevia('fundacion', d); A.etqVivas = [{ p: new V3(d.x, (d.y || 0) + elev(d) + 0.5, d.z), t: (d.forma === 'poligono' ? A.fmt(d.area, 1) + ' m²' : A.fmt(d.sx) + ' × ' + A.fmt(d.sz) + ' m · ' + A.fmt(d.sx * d.sz, 1) + ' m²') + ' · elevación ' + A.fmt(d.elevacion) + ' m', c: 'vivo' }]; }
  function terminarPol() { if (!est || !est.pts || est.pts.length < 3) { A.pista('Hacen falta al menos 3 esquinas.'); return; } const pts = est.pts.map((p?) => [p.x, p.z]), y = est.pts[0].y; est = null; A.limpiarPrevia(); A.etqVivas = []; A.ocultarInferencia(); const id = crearPoligono(pts, y); if (id) A.seleccionar(['n' + id]); }
  E.agregarHerramientaPropia('fundacion', {
    n: 'Fundación', ic: 'fundacion',
    pista: 'Rectángulo: arrastra en el suelo. Polígono: clic en cada esquina y clic en la primera (o Enter). Luego súbela con la flecha o en el inspector: lo que tenga encima sube con ella.',
    opciones: (it?) => { if (it.modo) P.modo = it.modo; est = null; },
    down: (e?) => { if (P.modo !== 'rect') return; const inf = A.inferir(e, null); if (inf) est = { a: inf.p.clone() }; },
    move: (e?) => {
      if (P.modo === 'rect') { if (!est || !est.a) { A.inferir(e, null); return; } const inf = A.inferir(e, est.a, { y: est.a.y }); if (!inf) return; const a = est.a, b = inf.p; if (Math.abs(b.x - a.x) < 0.1 || Math.abs(b.z - a.z) < 0.1) return; previa(datosNuevos({ forma: 'rect', x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2, sx: Math.abs(b.x - a.x), sz: Math.abs(b.z - a.z) })); return; }
      const ult = est && est.pts ? est.pts[est.pts.length - 1] : null; const inf = A.inferir(e, ult, ult ? { y: est.pts[0].y } : null); if (!inf || !est || !est.pts) return;
      const pts = est.pts.map((p?) => [p.x, p.z]).concat([[inf.p.x, inf.p.z]]);
      if (pts.length >= 3) { const [cx, cz] = A.centroide(pts); previa(datosNuevos({ forma: 'poligono', x: cx, y: est.pts[0].y, z: cz, puntos: pts.map(([x, z]) => [x - cx, z - cz]) })); }
      else A.mostrarPrevia('muro', Object.assign(A.datosMuro(est.pts[0], inf.p), { sy: 0.05, sz: 0.08 }));
    },
    up: (e?, mov?) => {
      if (P.modo === 'rect') {
        if (!est || !est.a) return; const a = est.a; est = null; A.limpiarPrevia(); A.etqVivas = []; const inf = A.inferir(e, a, { y: a.y }); A.ocultarInferencia(); if (!inf) return; const b = inf.p;
        if (Math.abs(b.x - a.x) < 0.3 || Math.abs(b.z - a.z) < 0.3) { A.pista('Arrastra un rectángulo más grande (mantén pulsado mientras mueves).'); return; }
        const id = crearRect(a.x, a.z, b.x, b.z, a.y); if (id) A.seleccionar(['n' + id], { sinTab: true }); return;
      }
      if (mov > 6) return; const ult = est && est.pts ? est.pts[est.pts.length - 1] : null; const inf = A.inferir(e, ult, ult ? { y: est.pts[0].y } : null); if (!inf) return;
      if (!est || !est.pts) { est = { pts: [inf.p.clone()] }; A.punto3D(inf.p); return; }
      if (est.pts.length >= 3 && inf.p.distanceTo(est.pts[0]) < Math.max(0.3, 10 * A.metrosPorPixel(inf.p))) { terminarPol(); return; }
      est.pts.push(inf.p.clone()); A.punto3D(inf.p);
    },
    fin: () => { est = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => `<div class="campos">
      <label class="campo ancho"><span>Forma</span><select data-fp="modo"><option value="rect"${P.modo === 'rect' ? ' selected' : ''}>Rectángulo (arrastrar)</option><option value="poligono"${P.modo === 'poligono' ? ' selected' : ''}>Polígono (clic por esquina)</option></select></label>
      ${num('fp', 'elevacion', 'Elevación (m)', P.elevacion)}${num('fp', 'espesor', 'Espesor de la losa (m)', P.espesor)}
      ${opc('fp', 'base', 'Base', P.base, [['macizo', 'Maciza hasta el suelo'], ['losa', 'Losa con pilotes'], ['columnas', 'Losa sobre columnas']])}
      ${opc('fp', 'borde', 'Borde', P.borde, [['recto', 'Recto'], ['bordillo', 'Con bordillo'], ['moldura', 'Con moldura']])}
      ${opc('fp', 'matSup', 'Material de arriba', P.matSup, A.MAT_SUELO.map((m?) => [m, MAT[m].n]))}${col('fp', 'colorSup', 'Color de arriba', P.colorSup)}
      ${opc('fp', 'matLat', 'Material de los lados', P.matLat, A.MAT_MURO.map((m?) => [m, MAT[m].n]))}${col('fp', 'colorLat', 'Color de los lados', P.colorLat)}</div>`
  });
  const num = (a?, k?, l?, v?) => `<label class="campo"><span>${l}</span><input type="number" step="0.05" data-${a}="${k}" value="${A.r3(v)}"></label>`;
  const opc = (a?, k?, l?, v?, lista?) => `<label class="campo ancho"><span>${l}</span><select data-${a}="${k}">${lista.map(([x, n]) => `<option value="${A.esc(x)}"${String(v) === String(x) ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label>`;
  const col = (a?, k?, l?, v?) => `<label class="campo"><span>${l}</span><input type="color" data-${a}="${k}" value="${A.esc(v || '#cccccc')}"></label>`;
  window.addEventListener('keydown', (e?) => { if (A.herramienta === 'fundacion' && P.modo === 'poligono' && est && est.pts && e.key === 'Enter' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); e.stopImmediatePropagation(); terminarPol(); } }, true);
  E.agregarHerramienta('construir', { h: 'fundacion', modo: 'rect', n: 'Fundación (rectángulo)' });
  E.agregarHerramienta('construir', { h: 'fundacion', modo: 'poligono', n: 'Fundación (polígono)' });

  /* ---------- inspector ---------- */
  function htmlInspector(o?) {
    const d = o.datos, deps = window.OOAnclajes ? OOAnclajes.dependientes(o.id, true).length : 0;
    const rapido = [0, 0.5, 1, 1.5].map((v?) => `<button data-fq="${v}" class="${Math.abs(elev(d) - v) < 1e-3 ? 'on' : ''}">${A.fmt(v, v % 1 ? 1 : 0)} m</button>`).join('');
    return `<details class="sec" open data-sec="fundacion"><summary>Fundación</summary><div class="campos">
      <p class="ayuda" style="margin:0 0 6px">${d.forma === 'poligono' ? 'Poligonal' : 'Rectangular'} · ${A.fmt(d.area || 0, 1)} m² · cara de arriba a <b>${A.fmt((+d.y || 0) + elev(d))} m</b>${deps ? ' · ' + deps + ' objetos encima' : ''}</p>
      <div class="fila" role="group" aria-label="Elevación rápida">${rapido}</div>
      ${num('fd', 'elevacion', 'Elevación (m)', elev(d))}${num('fd', 'espesor', 'Espesor (m)', d.espesor || 0.2)}
      ${num('fd', 'sx', 'Medida X (m)', d.sx)}${num('fd', 'sz', 'Medida Z (m)', d.sz)}
      ${opc('fd', 'base', 'Base', d.base || 'macizo', [['macizo', 'Maciza hasta el suelo'], ['losa', 'Losa con pilotes'], ['columnas', 'Losa sobre columnas']])}
      ${opc('fd', 'borde', 'Borde', d.borde || 'recto', [['recto', 'Recto'], ['bordillo', 'Con bordillo'], ['moldura', 'Con moldura']])}
      ${opc('fd', 'matSup', 'Material de arriba', d.matSup || 'concreto', A.MAT_SUELO.map((m?) => [m, MAT[m].n]))}${col('fd', 'colorSup', 'Color de arriba', d.colorSup)}
      ${opc('fd', 'matLat', 'Material de los lados', d.matLat || 'concreto', A.MAT_MURO.map((m?) => [m, MAT[m].n]))}${col('fd', 'colorLat', 'Color de los lados', d.colorLat)}
      <p class="ayuda">Al subirla o bajarla, las paredes, pisos, puertas, ventanas y muebles anclados se trasladan con ella sin cambiar su altura. La orientación se cambia con «Girar» del gizmo o en Rotación Y.</p></div></details>`;
  }
  function selFund() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && A.tipoBase(o.tipo) === 'fundacion' ? o : null; }
  E.on('panel', () => {
    const o = selFund(); if (!o) return; const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return;
    const ref = c.querySelector('[data-sec="transform"]'); const div = document.createElement('div'); div.innerHTML = htmlInspector(o);
    if (ref && ref.nextSibling) c.insertBefore(div.firstElementChild, ref.nextSibling); else c.appendChild(div.firstElementChild);
  });
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.fp) { const k = el.dataset.fp; let v = el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; P[k] = v; if (k === 'matSup' && MAT[v]) P.colorSup = MAT[v].c; if (k === 'matLat' && MAT[v]) P.colorLat = MAT[v].c; if (k === 'modo') est = null; A.renderPanel(); return; }
    if (el.dataset.fd) { const o = selFund(); if (!o) return; const k = el.dataset.fd; let v = el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; if (k === 'sx' || k === 'sz') v = Math.max(0.1, v); if (k === 'elevacion' || k === 'espesor') v = Math.max(k === 'espesor' ? 0.02 : 0, v); cambiar(o.id, { [k]: v }, k === 'elevacion' ? 'Elevar fundación a ' + A.fmt(v) + ' m' : 'Cambiar fundación'); }
  });
  document.addEventListener('click', (e?) => { const b = e.target.closest && e.target.closest('[data-fq]'); if (!b) return; const o = selFund(); if (o) elevar(o.id, parseFloat(b.dataset.fq)); });

  /* ---------- asa con flecha para subir y bajar ---------- */
  if (window.OOAsas) OOAsas.registrar((sel?) => {
    if (sel.length !== 1 || sel[0][0] !== 'n') return null; const o = E.nuevos().get(sel[0].slice(1)); if (!o || A.tipoBase(o.tipo) !== 'fundacion') return null;
    const d = o.datos, top = (+d.y || 0) + elev(d), el0 = elev(d); let ult = el0;
    return [{ id: 'elevar', tipo: 'vertical', color: 0x2fae5a, pos: new V3(+d.x || 0, top + 0.9, +d.z || 0), titulo: 'Arrastra para subir o bajar la fundación',
      mover: (p?) => {
        let el = Math.max(0, p.y - 0.9 - (+d.y || 0)); const s = A.AJ.ajuste ? (A.AJ.paso || 0.25) : 0.05; el = Math.round(el / s) * s; if (Math.abs(el - ult) < 1e-6) return; ult = el;
        o.datos = Object.assign({}, d, { elevacion: el, sy: Math.max(0.02, el) }); if (window.OOAnclajes) OOAnclajes.previsualizar(['n' + o.id]); A.renderTodo();
        A.etqVivas = [{ p: new V3(+d.x || 0, (+d.y || 0) + el + 1.6, +d.z || 0), t: 'Elevación ' + A.fmt(el) + ' m', c: 'vivo' }];
      },
      soltar: () => { A.etqVivas = []; o.datos = d; if (Math.abs(ult - el0) > 1e-6) elevar(o.id, ult); else A.recompute(); },
      cancelar: () => { A.etqVivas = []; o.datos = d; }
    }];
  });

  window.OOFundaciones = { partes, huella, normalizar, crearRect, crearPoligono, cambiar, elevar, puntosLocales, params: P, DEF };
})();
