/* Editor del mapa (2.1, Map Editor Pro fase 5): edición geométrica.
   - Vértices de los polígonos: fundaciones poligonales, pisos y suelos (habitacion) y cubiertas (techo, también las inclinadas: su contorno).
     Con uno seleccionado salen asas: una blanca por vértice (arrastrar = moverlo, con imán) y una azul en el medio de cada lado (arrastrar =
     añadir un vértice ahí). En el inspector, «Vértices»: coordenadas exactas de cada vértice y botón para quitarlo. Las fundaciones
     rectangulares se pueden convertir en polígono para editarlas igual.
   - Extruir: un piso, un suelo o una cubierta plana se convierte en un prisma macizo (fundación poligonal) de la altura que se pida.
   - Dividir: cajas (suelos y calles, fundaciones rectangulares, barandas, objetos con largo) en dos por su eje X o Z, y polígonos cortados
     por una recta (los dos trozos conservan material y anclajes). Las paredes usan su propio «Dividir» (paredes.js).
   - Booleanas (unión, diferencia, intersección): NO están. Para hacerlas bien hace falta CSG con mallas cerradas y triangulación robusta;
     un truco visual daría geometría incorrecta al exportar. Queda pendiente (ver docs/editor_mapa/AUDITORIA_EDITOR.md §9).
   API: OOGeometria.vertices(id) (mundo), moverVertice(id, i, [x, z]), insertarVertice(id, i, [x, z]), quitarVertice(id, i), aPoligono(id),
   extruir(id, alto, {reemplazar}), dividir(id, eje, t), cortarPoligono(pts, punto, normal), area(o), perimetro(o). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon, nv = () => E.nuevos();
  const editable = o => { if (!o) return false; const b = tb(o.tipo); return (b === 'habitacion' || b === 'techo' || (b === 'fundacion' && o.datos.forma === 'poligono')) && Array.isArray(o.datos.puntos) && o.datos.puntos.length >= 3; };
  /* las fundaciones poligonales escalan sus puntos a sx × sz: se trabaja con los puntos ya escalados */
  function locales(o) { return tb(o.tipo) === 'fundacion' && window.OOFundaciones ? OOFundaciones.puntosLocales(o.datos) : o.datos.puntos.map(p => p.slice()); }
  const aMundo = (d, [x, z]) => { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); return [(+d.x || 0) + x * c + z * s, (+d.z || 0) - x * s + z * c]; };
  const aLocal = (d, [x, z]) => { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), dx = x - (+d.x || 0), dz = z - (+d.z || 0); return [dx * c - dz * s, dx * s + dz * c]; };
  function areaF(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function cajaPts(p) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1, sx: x1 - x0, sz: z1 - z0 }; }
  const area = o => Math.abs(areaF(locales(o)));
  const perimetro = o => { const p = locales(o); let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; };
  const vertices = id => { const o = nv().get(id); return editable(o) ? locales(o).map(p => aMundo(o.datos, p).map(r3)) : []; };
  /* datos con un contorno nuevo (locales ya escalados): ajusta caja, área y lo de cada tipo */
  function conPuntos(o, pts) {
    const d = clon(o.datos), b = tb(o.tipo), cb = cajaPts(pts); d.puntos = pts.map(([x, z]) => [r3(x), r3(z)]);
    if (b === 'fundacion') { d.sx = r3(Math.max(0.05, cb.sx)); d.sz = r3(Math.max(0.05, cb.sz)); d.area = r3(Math.abs(areaF(pts))); }
    else { d.sx = r3(cb.sx); d.sz = r3(cb.sz); if (b === 'habitacion') d.area = r3(Math.abs(areaF(pts))); }
    return d;
  }
  function guardarDatos(o, d, etiqueta) { const v = o.datos; o.datos = d; const doc = A.docActualizado(o); o.datos = v; if (!doc) return false; A.guardar([doc], { etiqueta }); return true; }
  function moverVertice(id, i, p, etiqueta) { const o = nv().get(id); if (!editable(o)) return false; const L = locales(o); if (i < 0 || i >= L.length) return false; L[i] = aLocal(o.datos, p); return guardarDatos(o, conPuntos(o, L), etiqueta || 'Mover vértice'); }
  function insertarVertice(id, i, p) { const o = nv().get(id); if (!editable(o)) return false; const L = locales(o); L.splice(i + 1, 0, aLocal(o.datos, p)); return guardarDatos(o, conPuntos(o, L), 'Añadir vértice'); }
  function quitarVertice(id, i) { const o = nv().get(id); if (!editable(o)) return false; const L = locales(o); if (L.length <= 3) { A.pista('Un polígono necesita al menos 3 vértices.'); return false; } L.splice(i, 1); return guardarDatos(o, conPuntos(o, L), 'Quitar vértice'); }
  function aPoligono(id) {
    const o = nv().get(id); if (!o || tb(o.tipo) !== 'fundacion' || o.datos.forma === 'poligono') return false; const hx = (+o.datos.sx || 4) / 2, hz = (+o.datos.sz || 4) / 2;
    const d = clon(o.datos); d.forma = 'poligono'; d.puntos = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]; return guardarDatos(o, d, 'Convertir la fundación en polígono');
  }

  /* ---------- asas de vértices y de lados ---------- */
  if (window.OOAsas) OOAsas.registrar(sel => {
    if (sel.length !== 1 || sel[0][0] !== 'n') return null; const o = nv().get(sel[0].slice(1)); if (!editable(o)) return null;
    const d = o.datos, b = tb(o.tipo), L0 = locales(o), y = b === 'fundacion' && window.OOAnclajes ? OOAnclajes.tope('fundacion', d) + 0.05 : b === 'habitacion' && window.OOAnclajes ? OOAnclajes.tope('habitacion', d) + 0.05 : (+d.y || 0) + 0.05;
    const out = []; let ult = null;
    const previa = L => { o.datos = conPuntos(o, L); A.renderNuevo(o); A.actualizarContorno(); A.marcar(); };
    const fin = (etq) => { const L = ult; o.datos = d; ult = null; A.etqVivas = []; if (L) guardarDatos(o, conPuntos(o, L), etq); else A.renderNuevo(o); };
    L0.forEach((p, i) => { const w = aMundo(d, p);
      out.push({ id: 'v' + i, tipo: 'plano', color: 0xffffff, pos: new V3(w[0], y, w[1]), inferir: true, titulo: 'Vértice ' + (i + 1) + ': arrastra para moverlo',
        mover: q => { const L = L0.map(x => x.slice()); L[i] = aLocal(d, [q.x, q.z]); ult = L; previa(L); A.etqVivas = [{ p: new V3(q.x, y + 0.6, q.z), t: A.fmt(Math.abs(areaF(L)), 1) + ' m²', c: 'vivo' }]; },
        soltar: () => fin('Mover vértice'), cancelar: () => { o.datos = d; ult = null; A.etqVivas = []; } }); });
    L0.forEach((p, i) => { const q2 = L0[(i + 1) % L0.length], m = aMundo(d, [(p[0] + q2[0]) / 2, (p[1] + q2[1]) / 2]);
      out.push({ id: 'm' + i, tipo: 'plano', color: 0x3b8bff, pos: new V3(m[0], y, m[1]), inferir: true, titulo: 'Arrastra para añadir un vértice en este lado',
        mover: q => { const L = L0.map(x => x.slice()); L.splice(i + 1, 0, aLocal(d, [q.x, q.z])); ult = L; previa(L); },
        soltar: () => fin('Añadir vértice'), cancelar: () => { o.datos = d; ult = null; } }); });
    return out;
  });

  /* ---------- extruir ---------- */
  function extruir(id, alto, opts) {
    opts = opts || {}; const o = nv().get(id); if (!editable(o) || tb(o.tipo) === 'fundacion') return null; const h = Math.max(0.02, +alto || 1), d = o.datos;
    const w = locales(o).map(p => aMundo(d, p)), [cx, cz] = A.centroide(w), b = tb(o.tipo);
    const y0 = b === 'habitacion' ? (+d.y || 0) + (+d.elevacion || 0) : (+d.y || 0), pts = w.map(([x, z]) => [r3(x - cx), r3(z - cz)]), cb = cajaPts(pts);
    const fd = { x: r3(cx), y: r3(y0), z: r3(cz), giroY: 0, forma: 'poligono', puntos: pts, sx: r3(cb.sx), sz: r3(cb.sz), elevacion: r3(h), sy: r3(h), espesor: Math.min(0.2, h), base: 'macizo', borde: 'recto',
      matSup: d.material || 'concreto', colorSup: d.color || '#b9b4aa', matLat: d.material || 'concreto', colorLat: d.color || '#8f8a80', area: r3(Math.abs(areaF(pts))), soporte: { tipo: 'libre' } };
    if (d.nivel) { fd.nivel = d.nivel; fd.edificio = d.edificio; }
    const nid = A.nuevoId() + 'x', lista = [{ id: nid, data: A.docNuevo(nid, 'fundacion', fd, { props: { nombre: 'Prisma extruido' } }) }];
    if (opts.reemplazar) lista.push({ id: o.docId, data: null });
    A.guardar(lista, { etiqueta: 'Extruir ' + A.fmt(h) + ' m' }); return nid;
  }

  /* ---------- dividir ---------- */
  /* Sutherland–Hodgman con un semiplano: lado n·(p − p0) ≤ 0 */
  function cortarPoligono(pts, p0, n) {
    const dentro = p => (p[0] - p0[0]) * n[0] + (p[1] - p0[1]) * n[1] <= 1e-9, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], da = dentro(a), db = dentro(b);
      if (da) out.push(a);
      if (da !== db) { const fa = (a[0] - p0[0]) * n[0] + (a[1] - p0[1]) * n[1], fb = (b[0] - p0[0]) * n[0] + (b[1] - p0[1]) * n[1], t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out.length >= 3 && Math.abs(areaF(out)) > 1e-4 ? out : null;
  }
  const DIV_CAJA = ['calle', 'baranda', 'objeto', 'copia', 'contenedor', 'proc', 'fundacion'];
  function dividir(id, eje, t) {
    const o = nv().get(id); if (!o) return null; const b = tb(o.tipo); eje = eje === 'z' ? 'z' : 'x'; t = Math.max(0.05, Math.min(0.95, +t || 0.5));
    if (b === 'muro') { if (window.OOParedes && OOParedes.dividir) return OOParedes.dividir(id, t * (+o.datos.sx || 0)); A.pista('Las paredes se dividen desde su propia sección.'); return null; }
    const ef = A.efectivos(), prev = ef.get(o.docId) || {}, ext = { capa: prev.capa || A.capaActiva }; if (o.props) ext.props = clon(o.props);
    if (editable(o)) {
      const L = locales(o), cb = cajaPts(L), p0 = eje === 'x' ? [cb.x0 + cb.sx * t, 0] : [0, cb.z0 + cb.sz * t], nn = eje === 'x' ? [1, 0] : [0, 1];
      const a = cortarPoligono(L, p0, nn), c = cortarPoligono(L, p0, [-nn[0], -nn[1]]); if (!a || !c) { A.pista('La recta de corte no parte el polígono.'); return null; }
      const da = conPuntos(o, a), dc = conPuntos(o, c); delete dc.agujeros_auto; const v = o.datos; o.datos = da; const doc = A.docActualizado(o); o.datos = v;
      const nid = A.nuevoId() + 'd'; A.guardar([doc, { id: nid, data: A.docNuevo(nid, o.tipo, dc, ext) }], { etiqueta: 'Dividir ' + A.nombreTipo(o.tipo).toLowerCase() }); return nid;
    }
    if (!DIV_CAJA.includes(b) && !(+o.datos.sx > 0)) return null;
    const d = o.datos, k = eje === 'x' ? 'sx' : 'sz', S = +d[k] || 1, g = (+d.giroY || 0) * DEG, ux = eje === 'x' ? Math.cos(g) : Math.sin(g), uz = eje === 'x' ? -Math.sin(g) : Math.cos(g);
    const L1 = S * t, L2 = S - L1, o1 = -S / 2 + L1 / 2, o2 = S / 2 - L2 / 2;
    const d1 = Object.assign(clon(d), { [k]: r3(L1), x: r3((+d.x || 0) + ux * o1), z: r3((+d.z || 0) + uz * o1) }), d2 = Object.assign(clon(d), { [k]: r3(L2), x: r3((+d.x || 0) + ux * o2), z: r3((+d.z || 0) + uz * o2) });
    for (const x of [d1, d2]) for (const [pk, ak] of [['largo', 'sx'], ['ancho', 'sz']]) if (ak === k && x[pk] != null) x[pk] = x[k]; /* prefabs con el largo como parámetro */
    const v = o.datos; o.datos = d1; const doc = A.docActualizado(o); o.datos = v; const nid = A.nuevoId() + 'd';
    A.guardar([doc, { id: nid, data: A.docNuevo(nid, o.tipo, d2, ext) }], { etiqueta: 'Dividir ' + A.nombreTipo(o.tipo).toLowerCase() }); return nid;
  }

  /* ---------- inspector ---------- */
  function sel1() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; return nv().get(A.sel[0].slice(1)) || null; }
  E.on('panel', () => {
    if (A.herramienta !== 'sel') return; const o = sel1(); const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c) return; const b = tb(o.tipo);
    const div = document.createElement('div'); let h = '';
    if (editable(o)) {
      const V = vertices(o.id), L = window.OOCubiertasL && b === 'techo' ? OOCubiertasL.analizar(o.datos.puntos) : null;
      h += `<details class="sec" data-sec="vertices"><summary>Vértices <small>${V.length}</small></summary><div class="campos"><p class="ayuda" style="margin:0 0 4px">Arrastra las asas blancas (vértices) o las azules (añadir un vértice en el lado). Coordenadas del mapa:</p>
        <table class="info vert">${V.map((p, i) => `<tr><th>${i + 1}</th><td><input type="number" step="0.05" data-gv="${i}" data-c="0" value="${p[0]}" aria-label="X ${i + 1}"></td><td><input type="number" step="0.05" data-gv="${i}" data-c="1" value="${p[1]}" aria-label="Z ${i + 1}"></td><td><button data-ga="quitar" data-i="${i}" title="Quitar el vértice" aria-label="Quitar">×</button></td></tr>`).join('')}</table>
        ${b === 'techo' && ['dos_aguas', 'cuatro_aguas', 'galpon'].includes(o.datos.forma) ? `<p class="ayuda">${L ? 'Contorno en L: la cubierta se hace con dos alas que se cortan en una limahoya.' : 'Contorno no rectangular: la cubierta inclinada usa su rectángulo (las formas en L sí se resuelven con dos alas).'}</p>` : ''}</div></details>`;
    }
    if (b === 'fundacion' && o.datos.forma !== 'poligono') h += `<details class="sec" data-sec="geom"><summary>Geometría</summary><div class="fila"><button data-ga="poligono">Convertir en polígono (editar vértices)</button></div><div class="fila"><button data-ga="div-x">Dividir en X</button><button data-ga="div-z">Dividir en Z</button></div></details>`;
    else if (editable(o) || DIV_CAJA.includes(b) || (+o.datos.sx > 0 && !['muro', 'puerta', 'ventana', 'hueco', 'escalera', 'rampa', 'nota', 'luz'].includes(b))) {
      h += `<details class="sec" data-sec="geom"><summary>Geometría</summary><div class="campos">${editable(o) && b !== 'fundacion' ? `<label class="campo"><span>Altura al extruir (m)</span><input type="number" step="0.1" data-gx="alto" value="${r3(PX.alto)}"></label><label class="chk"><input type="checkbox" data-gx="reemplazar"${PX.reemplazar ? ' checked' : ''}> Quitar el original</label><div class="fila"><button data-ga="extruir">Extruir como prisma</button></div>` : ''}
        <label class="campo"><span>Dividir en (fracción)</span><input type="number" step="0.05" min="0.05" max="0.95" data-gx="t" value="${PX.t}"></label><div class="fila"><button data-ga="div-x">Dividir en X</button><button data-ga="div-z">Dividir en Z</button></div>
        <p class="ayuda">Operaciones booleanas: pendientes (necesitan CSG con mallas cerradas para exportar bien).</p></div></details>`;
    }
    if (!h) return; div.innerHTML = h; for (const n of [...div.children]) c.appendChild(n);
  });
  const PX = { alto: 1, reemplazar: false, t: 0.5 };
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.gx) { const k = el.dataset.gx; PX[k] = el.type === 'checkbox' ? el.checked : parseFloat(el.value); return; }
    if (el.dataset.gv != null && el.dataset.gv !== undefined && el.matches('[data-gv]')) { const o = sel1(); if (!o) return; const i = +el.dataset.gv, V = vertices(o.id), v = parseFloat(el.value); if (!isFinite(v) || !V[i]) return; V[i][+el.dataset.c] = v; moverVertice(o.id, i, V[i]); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ga]'); if (!b) return; const o = sel1(); if (!o) return; const a = b.dataset.ga;
    if (a === 'quitar') quitarVertice(o.id, +b.dataset.i);
    if (a === 'poligono') aPoligono(o.id);
    if (a === 'extruir') { const id = extruir(o.id, PX.alto, { reemplazar: PX.reemplazar }); if (id) A.seleccionar(['n' + id]); }
    if (a === 'div-x' || a === 'div-z') { const id = dividir(o.id, a.slice(4), PX.t); if (id) A.seleccionar(['n' + o.id, 'n' + id]); }
  });
  E.agregarHerramienta('modelar', { n: 'Extruir el piso o la cubierta plana', ic: 'empujar', fn: () => { const o = sel1(); if (!o || !editable(o)) { A.pista('Selecciona un piso, un suelo o una cubierta.'); return; } const id = extruir(o.id, PX.alto); if (id) A.seleccionar(['n' + id]); } });
  E.agregarHerramienta('modelar', { n: 'Dividir en dos (eje X)', ic: 'modelar', fn: () => { const o = sel1(); if (o) dividir(o.id, 'x', PX.t); } });

  window.OOGeometria = { vertices, moverVertice, insertarVertice, quitarVertice, aPoligono, extruir, dividir, cortarPoligono, area, perimetro, editable, locales };
})();
