/* Editor del mapa (2.1, Map Editor Pro fase 2): paredes paramétricas.
   Una pared es un objeto `muro` (x, z centro, giroY, sx largo, sy alto, sz grosor, preset, curva…), no una caja fija:
   - Asas en sus dos extremos: se arrastran (con imán a otros extremos, ejes y rejilla) y las paredes unidas a ese extremo y el piso de la
     habitación lo siguen. Las puertas y ventanas conservan su distancia al extremo que no se mueve y no salen de la pared.
   - Inspector: inicio y fin numéricos, curvatura (flecha en m: 0 recta), dividir en el centro o a una distancia, unir dos paredes en línea.
   - Herramienta «Dividir pared» (Construir): clic sobre una pared nueva y se parte por ahí.
   - Cruces: al dibujar una pared que corta a otra o que acaba en mitad de otra, las dos se parten en ese punto en el mismo paso de deshacer
     (así se detectan las habitaciones con divisiones interiores). Se desactiva en Imán y selección → «Partir paredes en los cruces».
   La altura y el grosor se cambian en el inspector sin rehacer la pared (Alto, Grosor). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon;
  const ABERTURAS = ['puerta', 'ventana', 'hueco'], MARCO = OO.MARCO || 0.08, EPS = 0.08;
  A.ICON.dividir = '<path d="M3 7h18v10H3z"/><path d="M12 3v18" stroke-dasharray="2 2"/>';

  /* ---------- geometría ---------- */
  function seg(d?) { const g = (+d.giroY || 0) * DEG, ux = Math.cos(g), uz = -Math.sin(g), L = +d.sx || 0; return { a: [d.x - ux * L / 2, d.z - uz * L / 2], b: [d.x + ux * L / 2, d.z + uz * L / 2], ux, uz, L, y: +d.y || 0 }; }
  function desdeExtremos(d?, a?, b?) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    return Object.assign({}, d, { x: r3((a[0] + b[0]) / 2), z: r3((a[1] + b[1]) / 2), sx: r3(Math.max(0.05, L)), giroY: r3(Math.atan2(-dz, dx) / DEG) });
  }
  function interseccion(s1?, s2?) {
    const rx = s1.b[0] - s1.a[0], rz = s1.b[1] - s1.a[1], qx = s2.b[0] - s2.a[0], qz = s2.b[1] - s2.a[1], den = rx * qz - rz * qx;
    if (Math.abs(den) < 1e-9 * (s1.L * s2.L + 1)) return null;
    const wx = s2.a[0] - s1.a[0], wz = s2.a[1] - s1.a[1], t = (wx * qz - wz * qx) / den, u = (wx * rz - wz * rx) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { t1: t * s1.L, t2: u * s2.L };
  }
  /* pared curva (catalogo.js la llama si datos.curva ≠ 0): arco de flecha `curva` sobre la cuerda del largo, en tramos de unos 40 cm */
  function partesCurva(e?, col?, ext?, h?) {
    const L = +e.sx, H = +e.sy || 2.6, G = +e.sz || 0.2; let f = +e.curva; if (!(L > 0.1) || !(Math.abs(f) >= 0.01)) return null;
    f = Math.sign(f) * Math.min(Math.abs(f), L / 2 * 0.98); const af = Math.abs(f), R = (L * L / 4 + f * f) / (2 * af), sg = Math.sign(f), zc = sg * (af - R);
    const th = Math.asin(Math.min(1, L / 2 / R)), n = Math.max(6, Math.min(64, Math.ceil(2 * th * R / 0.4))), out = [];
    let prev = null;
    for (let k = 0; k <= n; k++) { const ph = -th + 2 * th * k / n, p = [R * Math.sin(ph), zc + sg * R * Math.cos(ph)]; if (prev) { const dx = p[0] - prev[0], dz = p[1] - prev[1], len = Math.hypot(dx, dz); out.push(h.B((p[0] + prev[0]) / 2, H / 2, (p[1] + prev[1]) / 2, len + G * Math.tan(th / n) + 0.004, H, G, col, { r: [0, Math.atan2(-dz, dx), 0], t: e.material === 'vidrio' })); } prev = p; }
    return out;
  }
  const esMuro = (d?) => d && d.accion === 'agregar' && d.mapa === A.mapa && d.datos && tb(d.tipo) === 'muro';
  const uEn = (s?, x?, z?) => (x - s.a[0]) * s.ux + (z - s.a[1]) * s.uz;
  function medioAncho(d?, b?) { return b === 'hueco' ? Math.max(0.05, +d.sx || 1) / 2 : (+d.sx || 0.9) / 2 + MARCO; }
  /* aberturas de la pared oid en un mapa de documentos */
  function aberturasDe(oid?, docs?) { const out = []; for (const [id, d] of docs) if (d && d.accion === 'agregar' && d.datos && ABERTURAS.includes(tb(d.tipo)) && d.datos.muro === oid) out.push([id, d]); return out; }

  /* ---------- partir paredes por puntos (cortes en metros desde el inicio) ---------- */
  function partir(wid?, W?, cortes?, docs?, nuevoIdF?) {
    const s = seg(W.datos), abs = aberturasDe(W.id_objeto, docs).map(([id, d]) => ({ id, d, u: uEn(s, +d.datos.x, +d.datos.z), h: medioAncho(d.datos, tb(d.tipo)) }));
    const us = [...new Set<any>(cortes.map((u?) => Math.round(u * 1000) / 1000))].filter((u?) => u > EPS && u < s.L - EPS && !abs.some((a?) => Math.abs(a.u - u) < a.h + 0.02)).sort((p?, q?) => p - q);
    const limpios = []; for (const u of us) if (!limpios.length || u - limpios[limpios.length - 1] > 0.1) limpios.push(u);
    if (!limpios.length) return null;
    const lim = [0].concat(limpios, [s.L]), salida = [], piezas = [];
    for (let k = 0; k + 1 < lim.length; k++) {
      const a = [s.a[0] + s.ux * lim[k], s.a[1] + s.uz * lim[k]], b = [s.a[0] + s.ux * lim[k + 1], s.a[1] + s.uz * lim[k + 1]];
      const datos = desdeExtremos(clon(W.datos), a, b);
      if (k === 0) { piezas.push({ id: wid, oid: W.id_objeto, ini: lim[k], fin: lim[k + 1] }); salida.push({ id: wid, data: Object.assign({}, W, { datos: A.limpiarDatos(datos, W.tipo), actualizado: A.ahora() }), propio: true }); }
      else { const nid = nuevoIdF(k); const doc = A.docNuevo(nid, W.tipo, datos, { capa: W.capa, props: W.props ? clon(W.props) : null }); piezas.push({ id: nid, oid: nid, ini: lim[k], fin: lim[k + 1] }); salida.push({ id: nid, data: doc }); }
    }
    for (const a of abs) { const p = piezas.find((pz?) => a.u >= pz.ini && a.u <= pz.fin); if (!p || p.oid === W.id_objeto) continue; const nd = Object.assign({}, a.d, { datos: Object.assign(clon(a.d.datos), { muro: p.oid, soporte: { tipo: 'pared', id: p.oid } }), actualizado: A.ahora() }); salida.push({ id: a.id, data: nd }); }
    return salida;
  }
  /* cortes que hacen falta para las paredes `ids` (doc ids) contra todas las demás de la misma altura */
  function cortesPara(ids?, docs?) {
    const muros = []; for (const [id, d] of docs) if (esMuro(d) && !(+d.datos.curva)) muros.push([id, d]);
    const cortes = new Map<any, any>(); const add = (id?, u?) => { let l = cortes.get(id); if (!l) cortes.set(id, l = []); l.push(u); };
    for (const nid of ids) {
      const N = docs.get(nid); if (!esMuro(N) || +N.datos.curva) continue; const sN = seg(N.datos);
      for (const [wid, W] of muros) {
        if (wid === nid || Math.abs((+W.datos.y || 0) - sN.y) > 0.05) continue; const sW = seg(W.datos); const it = interseccion(sN, sW); if (!it) continue;
        const intN = it.t1 > EPS && it.t1 < sN.L - EPS, intW = it.t2 > EPS && it.t2 < sW.L - EPS;
        if (intW) add(wid, it.t2); if (intN) add(nid, it.t1);
      }
    }
    return cortes;
  }
  /* regla de anclajes.js: las paredes nuevas parten y se parten en los cruces, en el mismo paso */
  if (window.OOAnclajes) OOAnclajes.reglas.push((id?, d?, prev?, ctx?) => {
    if (prev || tb(d.tipo) !== 'muro' || ctx.hechos.has(id) || A.AJ.cruces === false || +d.datos.curva) return;
    const docs = ctx.todos(); docs.set(id, d); const cortes = cortesPara([id], docs); let n = 0;
    for (const [wid, us] of cortes) {
      const W = wid === id ? d : docs.get(wid); const res = partir(wid, W, us, docs, (k?) => A.nuevoId() + 'c' + (n++)); if (!res) continue;
      for (const it of res) {
        ctx.hechos.add(it.id);
        if (it.id === id) { Object.assign(d.datos, it.data.datos); continue; }
        if (!ctx.cambios.has(it.id)) ctx.orden.push(it.id); ctx.cambios.set(it.id, it.data); if (it.data && it.data.id_objeto) ctx.docDe.set(it.data.id_objeto, it.id);
      }
    }
  });
  function guardarRes(res?, etiqueta?) { if (!res || !res.length) return false; A.guardar(res.map((r?) => ({ id: r.id, data: r.data })), { etiqueta }); return true; }
  function docDeObjeto(oid?) { const o = E.nuevos().get(oid); return o ? A.efectivos().get(o.docId) : null; }
  function dividir(oid?, u?) {
    const o = E.nuevos().get(oid), W = docDeObjeto(oid); if (!o || !esMuro(W)) return null; if (+W.datos.curva) { A.pista('Las paredes curvas no se dividen.'); return null; }
    const L = +W.datos.sx || 0, uu = u == null ? L / 2 : Math.max(0.1, Math.min(L - 0.1, +u)); let n = 0;
    const res = partir(o.docId, W, [uu], A.efectivos(), () => A.nuevoId() + 'd' + (n++));
    if (!res) { A.pista('No se puede dividir ahí (demasiado cerca de un extremo o dentro de una puerta o ventana).'); return null; }
    guardarRes(res, 'Dividir pared'); A.pista('Pared dividida en dos tramos de ' + A.fmt(uu) + ' y ' + A.fmt(L - uu) + ' m.');
    return res.filter((r?) => r.data && tb(r.data.tipo) === 'muro').map((r?) => r.data.id_objeto);
  }
  function cruces(oids?) {
    const ef = A.efectivos(), ids = (oids || [...E.nuevos().values()].filter((o?) => tb(o.tipo) === 'muro').map((o?) => o.id)).map((i?) => (E.nuevos().get(i) || {}).docId).filter(Boolean);
    const cortes = cortesPara(ids, ef); const todos = []; let n = 0;
    for (const [wid, us] of cortes) { const res = partir(wid, ef.get(wid), us, ef, () => A.nuevoId() + 'x' + (n++)); if (res) todos.push(...res); }
    if (!todos.length) { A.pista('No hay cruces que partir.'); return 0; }
    guardarRes(todos, 'Partir paredes en los cruces'); A.detectarHabitaciones(true); return todos.length;
  }
  function unir(oids?) {
    if (!oids || oids.length !== 2) return null; const ef = A.efectivos();
    const [o1, o2] = oids.map((i?) => E.nuevos().get(i)); if (!o1 || !o2) return null; const W1 = ef.get(o1.docId), W2 = ef.get(o2.docId); if (!esMuro(W1) || !esMuro(W2)) return null;
    const s1 = seg(W1.datos), s2 = seg(W2.datos);
    if (Math.abs(s1.ux * s2.uz - s1.uz * s2.ux) > 0.02 || Math.abs(s1.y - s2.y) > 0.02) { A.pista('Solo se unen paredes en línea y a la misma altura.'); return null; }
    const ext = [[s1.a, s1.b], [s1.b, s1.a]]; let par = null;
    for (const [c1, f1] of ext) for (const [c2, f2] of [[s2.a, s2.b], [s2.b, s2.a]]) if (Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) < 0.05) par = { comun: c1, a: f1, b: f2 };
    if (!par) { A.pista('Las paredes tienen que tocarse por un extremo.'); return null; }
    const otros = [...E.nuevos().values()].filter((o?) => tb(o.tipo) === 'muro' && o !== o1 && o !== o2).some((o?) => { const s = seg(o.datos); return Math.abs(s.y - s1.y) < 0.05 && [s.a, s.b].some((p?) => Math.hypot(p[0] - par.comun[0], p[1] - par.comun[1]) < 0.05); });
    if (otros) { A.pista('En esa esquina llega otra pared: no se unen para no romper la habitación.'); return null; }
    const datos = desdeExtremos(clon(W1.datos), par.a, par.b); const res = [{ id: o1.docId, data: Object.assign({}, W1, { datos: A.limpiarDatos(datos, W1.tipo), actualizado: A.ahora() }) }, { id: o2.docId, data: null }];
    for (const [id, d] of aberturasDe(o2.id, ef)) res.push({ id, data: Object.assign({}, d, { datos: Object.assign(clon(d.datos), { muro: o1.id, soporte: { tipo: 'pared', id: o1.id } }), actualizado: A.ahora() }) });
    guardarRes(res, 'Unir paredes'); A.pista('Paredes unidas: ' + A.fmt(datos.sx) + ' m.'); return o1.id;
  }

  /* ---------- mover puntos: paredes, pisos y techos que comparten un vértice ---------- */
  const cerca = (p?, q?, t?) => Math.hypot(p[0] - q[0], p[1] - q[1]) < (t || 0.05);
  function polLocal(d?, mundo?) { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); return mundo.map(([x, z]) => { const dx = x - d.x, dz = z - d.z; return [r3(dx * c - dz * s), r3(dx * s + dz * c)]; }); }
  /* moves: [{de: [x, z], a: [x, z]}] a la altura y. Devuelve [{o, datos}] con los datos nuevos (no guarda) o null si deja un polígono roto */
  function moverPuntos(moves?, y?, opts?) {
    opts = opts || {}; const out = [], nv = E.nuevos(); const destino = (p?) => { for (const m of moves) if (cerca(p, m.de)) return m.a; return null; };
    const habsTocadas = new Set<any>();
    for (const o of nv.values()) {
      const b = tb(o.tipo), d = opts.base && opts.base.has(o.id) ? opts.base.get(o.id) : o.datos;
      if (b === 'muro' && !(+d.curva) && Math.abs((+d.y || 0) - y) < 0.3) { const s = seg(d); const na = destino(s.a), nb = destino(s.b); if (!na && !nb) continue; const nd = desdeExtremos(d, na || s.a, nb || s.b); if (nd.sx < 0.1) return null; out.push({ o, datos: nd }); }
      else if ((b === 'habitacion' && Math.abs((+d.y || 0) - y) < 0.3) || (b === 'techo' && (+d.y || 0) > y - 0.3 && (+d.y || 0) < y + 12)) {
        const mundo = A.puntosMundoHab({ datos: d }); let cambia = false; const nuevo = mundo.map((p?) => { const q = destino(p); if (q) { cambia = true; return q; } return p; }); if (!cambia) continue;
        if (autointerseca(nuevo) || A.areaPol(nuevo) < 0.25) return null;
        const nd = Object.assign({}, d, { puntos: polLocal(d, nuevo), area: r3(A.areaPol(nuevo)) }); const bx = caja(nuevo); nd.sx = r3(bx[2] - bx[0]); nd.sz = r3(bx[3] - bx[1]);
        if (b === 'habitacion') habsTocadas.add(o.id); out.push({ o, datos: nd });
      }
    }
    return out;
  }
  function caja(pts?) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; }
  function autointerseca(p?) {
    const n = p.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue; const s1 = { a: p[i], b: p[(i + 1) % n], L: 1 }, s2 = { a: p[j], b: p[(j + 1) % n], L: 1 }; const it = interseccion(s1, s2); if (it && it.t1 > 1e-4 && it.t1 < 1 - 1e-4 && it.t2 > 1e-4 && it.t2 < 1 - 1e-4) return true; }
    return false;
  }
  /* vista previa: pone los datos sin guardar y mueve en vivo lo anclado a las paredes */
  function previa(lista?) { for (const { o, datos } of lista) o.datos = datos; if (window.OOAnclajes) OOAnclajes.previsualizar(lista.filter((x?) => tb(x.o.tipo) === 'muro').map((x?) => 'n' + x.o.id)); A.renderTodo(); }
  function confirmar(lista?, base?, etiqueta?) {
    const docs = []; for (const { o, datos } of lista) { const v = base.get(o.id) || o.datos; o.datos = datos; const doc = A.docActualizado(o); o.datos = v; if (doc) docs.push(doc); }
    for (const [id, d] of base) { const o = E.nuevos().get(id); if (o) o.datos = d; }
    if (docs.length) A.guardar(docs, { etiqueta }); else A.recompute();
    return docs.length;
  }
  function moverExtremo(oid?, cual?, a?) {
    const o = E.nuevos().get(oid); if (!o || tb(o.tipo) !== 'muro') return 0; const s = seg(o.datos); const de = cual === 0 ? s.a : s.b;
    const l = moverPuntos([{ de, a }], +o.datos.y || 0); if (!l) { A.pista('Así una habitación quedaría cruzada: no se mueve.'); return 0; }
    const base = new Map<any, any>(l.map((x?) => [x.o.id, x.o.datos])); return confirmar(l, base, 'Mover extremo de pared');
  }

  /* ---------- asas en los extremos ---------- */
  if (window.OOAsas) OOAsas.registrar((sel?) => {
    if (sel.length !== 1 || sel[0][0] !== 'n') return null; const o = E.nuevos().get(sel[0].slice(1)); if (!o || tb(o.tipo) !== 'muro' || +o.datos.curva) return null;
    const d0 = o.datos, s = seg(d0), y = +d0.y || 0, alto = +d0.sy || 2.6;
    return [0, 1].map((cual?) => {
      const de = cual === 0 ? s.a : s.b, otro = cual === 0 ? s.b : s.a; let base = null, ult = null;
      const restaurar = () => { if (base) for (const [id, d] of base) { const x = E.nuevos().get(id); if (x) x.datos = d; } };
      return { id: 'extremo' + cual, tipo: 'plano', color: 0x1f6feb, pos: new V3(de[0], y + alto + 0.2, de[1]), planoY: y, titulo: 'Arrastra el extremo de la pared',
        empezar: () => { base = new Map<any, any>(); const l = moverPuntos([{ de, a: de }], y) || []; for (const x of l) base.set(x.o.id, x.o.datos); base.set(o.id, d0); },
        inferir: (e?) => { const vivos = new Map<any, any>(); for (const [id] of base) { const x = E.nuevos().get(id); if (x) vivos.set(id, x.datos); } restaurar(); const inf = A.inferir(e, new V3(otro[0], y, otro[1]), { y }); for (const [id, d] of vivos) { const x = E.nuevos().get(id); if (x) x.datos = d; } return inf ? inf.p.clone() : null; },
        mover: (p?) => {
          if (Math.hypot(p.x - otro[0], p.z - otro[1]) < 0.1) return; restaurar();
          const l = moverPuntos([{ de, a: [r3(p.x), r3(p.z)] }], y, { base }); if (!l) { A.etqVivas = [{ p: new V3(p.x, y + alto + 0.6, p.z), t: 'No vale: cruzaría la habitación', c: 'cota' }]; return; }
          ult = l; previa(l); const nd = l.find((x?) => x.o === o); A.etqVivas = [{ p: new V3(p.x, y + alto + 0.6, p.z), t: A.fmt(nd ? nd.datos.sx : 0) + ' m', c: 'vivo' }];
        },
        soltar: () => { A.etqVivas = []; if (ult) confirmar(ult, base, 'Mover extremo de pared'); else restaurar(); },
        cancelar: () => { A.etqVivas = []; restaurar(); }
      };
    });
  });

  /* ---------- herramienta «Dividir pared» ---------- */
  E.agregarHerramientaPropia('dividir', {
    n: 'Dividir pared', ic: 'dividir', pista: 'Clic sobre una pared nueva: se parte en ese punto en dos paredes (las puertas y ventanas se quedan en el tramo que les toca).',
    move: (e?) => { const h = A.pickEvento(e); const o = h && h.key[0] === 'n' ? E.nuevos().get(h.key.slice(1)) : null; if (!o || tb(o.tipo) !== 'muro') { A.limpiarPrevia(); return; } const s = seg(o.datos), u = Math.max(0, Math.min(s.L, uEn(s, h.point.x, h.point.z))); A.mostrarPrevia('muro', Object.assign({}, o.datos, { x: s.a[0] + s.ux * u, z: s.a[1] + s.uz * u, sx: 0.06, sz: (+o.datos.sz || 0.2) + 0.1, sy: (+o.datos.sy || 2.6) + 0.2, preset: undefined, curva: 0 })); A.etqVivas = [{ p: new V3(s.a[0] + s.ux * u, (+o.datos.y || 0) + (+o.datos.sy || 2.6) + 0.5, s.a[1] + s.uz * u), t: A.fmt(u) + ' + ' + A.fmt(s.L - u) + ' m', c: 'vivo' }]; },
    up: (e?, mov?) => { if (mov > 6) return; const h = A.pickEvento(e); const o = h && h.key[0] === 'n' ? E.nuevos().get(h.key.slice(1)) : null; if (!o || tb(o.tipo) !== 'muro') { A.pista('Haz clic sobre una pared nueva.'); return; } const s = seg(o.datos); let u = uEn(s, h.point.x, h.point.z); if (A.AJ.ajuste) u = Math.round(u / A.AJ.paso) * A.AJ.paso; A.limpiarPrevia(); A.etqVivas = []; dividir(o.id, u); },
    fin: () => { A.limpiarPrevia(); A.etqVivas = []; }
  });
  E.agregarHerramienta('construir', { h: 'dividir', n: 'Dividir pared' });

  /* ---------- inspector ---------- */
  const num = (k?, l?, v?, paso?) => `<label class="campo"><span>${l}</span><input type="number" step="${paso || 0.05}" data-pw="${k}" value="${r3(v)}"></label>`;
  function htmlPared(o?) {
    const d = o.datos, s = seg(d), nAb = [...E.nuevos().values()].filter((x?) => ABERTURAS.includes(tb(x.tipo)) && x.datos.muro === o.id).length;
    return `<details class="sec" open data-sec="pared"><summary>Pared paramétrica</summary><div class="campos">
      ${num('x1', 'Inicio X', s.a[0])}${num('z1', 'Inicio Z', s.a[1])}${num('x2', 'Fin X', s.b[0])}${num('z2', 'Fin Z', s.b[1])}
      ${num('curva', 'Curvatura (flecha, m)', +d.curva || 0)}${num('dividir_u', 'Dividir a (m del inicio)', s.L / 2)}
      <p class="ayuda">${A.fmt(s.L)} m de largo · ${A.fmt(+d.sy || 0)} m de alto · ${A.fmt(+d.sz || 0)} m de grosor${nAb ? ' · ' + nAb + ' abertura' + (nAb > 1 ? 's' : '') : ''}. Arrastra las bolas azules de los extremos para estirarla; las paredes unidas la siguen.${+d.curva && nAb ? ' <b>Las puertas no abren hueco en una pared curva.</b>' : ''}</p>
      <div class="fila"><button data-pa="dividir">Dividir aquí</button><button data-pa="dividir-centro">Dividir en el centro</button><button data-pa="cruces">Partir en los cruces</button></div></div></details>`;
  }
  E.on('panel', () => {
    const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return; const s = A.sel;
    if (s.length === 1 && s[0][0] === 'n') { const o = E.nuevos().get(s[0].slice(1)); if (!o || tb(o.tipo) !== 'muro') return; const ref = c.querySelector('[data-sec="campos"]') || c.querySelector('[data-sec="transform"]'); const div = document.createElement('div'); div.innerHTML = htmlPared(o); if (ref && ref.nextSibling) c.insertBefore(div.firstElementChild, ref.nextSibling); else c.appendChild(div.firstElementChild); }
    else if (s.length === 2 && s.every((k?) => k[0] === 'n' && tb((E.nuevos().get(k.slice(1)) || {}).tipo) === 'muro')) { const div = document.createElement('div'); div.innerHTML = '<details class="sec" open data-sec="pared"><summary>Dos paredes</summary><div class="fila"><button data-pa="unir">Unir en una sola pared</button></div></details>'; c.insertBefore(div.firstElementChild, c.querySelector('.fila:last-of-type')); }
  });
  function selMuro() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && tb(o.tipo) === 'muro' ? o : null; }
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el.dataset || !el.dataset.pw) return; const o = selMuro(); if (!o) return; const k = el.dataset.pw, v = parseFloat(el.value); if (!isFinite(v) || k === 'dividir_u') return;
    if (k === 'curva') { const L = +o.datos.sx || 0; const vv = Math.sign(v) * Math.min(Math.abs(v), L / 2 * 0.98); const old = o.datos; o.datos = Object.assign({}, old, { curva: r3(vv) }); const doc = A.docActualizado(o); o.datos = old; if (doc) A.guardar([doc], { etiqueta: 'Curvar pared' }); return; }
    const s = seg(o.datos); const a = s.a.slice(), b = s.b.slice(); if (k === 'x1') a[0] = v; if (k === 'z1') a[1] = v; if (k === 'x2') b[0] = v; if (k === 'z2') b[1] = v;
    if (k === 'x1' || k === 'z1') moverExtremo(o.id, 0, a); else moverExtremo(o.id, 1, b);
  });
  document.addEventListener('click', (e?) => {
    const b = e.target.closest && e.target.closest('[data-pa]'); if (!b) return; const a = b.dataset.pa;
    if (a === 'unir') { const id = unir(A.sel.map((k?) => k.slice(1))); if (id) A.seleccionar(['n' + id]); return; }
    const o = selMuro(); if (!o) return;
    if (a === 'dividir-centro') dividir(o.id);
    if (a === 'dividir') { const i = document.querySelector('[data-pw="dividir_u"]'); dividir(o.id, i ? parseFloat(i.value) : null); }
    if (a === 'cruces') cruces();
  });

  window.OOParedes = { partesCurva, seg, desdeExtremos, moverPuntos, moverExtremo, dividir, unir, cruces, cortesPara, partir, previa, confirmar, autointerseca };
})();
