/* Editor del mapa (2.1): vanos de puertas y ventanas, y relleno al quitarlas.
   - Puertas y ventanas NUEVAS: su hueco lo calcula el editor a partir de la puerta (prepararMuros); al borrarlas la pared queda entera sola.
   - Puertas y ventanas ORIGINALES: el generador (scripts/mapa.gd, `muro(...)`) ya partió la pared alrededor del vano y le puso un marco
     de 7 cm (dos jambas, cabecero y, en ventanas, alféizar). Aquí se buscan esos marcos en el mapa y, para cada uno, su vano (ancho, alto,
     altura desde el suelo, grosor de la pared), las piezas de la pared que lo rodean y lo que hay dentro (hoja y su grupo «puerta:…»,
     vidrio, rejas, colisiones). Si una puerta original no tiene marco, el vano se busca por los trozos de pared de los lados y de arriba.
   - Al borrar algo de un vano original se borra el vano entero (marco y contenido) y, en el mismo paso de deshacer, se crea un muro
     nuevo de relleno (datos.relleno = {vano, refs, tipo}) con el material, el color, el grosor y la altura de la pared de al lado, que
     ocupa el vano completo (jambas, dintel y alféizar incluidos). Se guarda como cualquier cambio y sale en las exportaciones.
     Si las piezas vuelven (Ctrl+Z, o revertir el borrado en la lista de cambios), el relleno se oculta solo.
   - Hueco propio (herramienta «Hueco en pared», tipo «hueco»): se pega a la línea de su pared al moverlo. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3;
  A.ICON.hueco = '<path d="M3 5h18v14H3z"/><path d="M9 19v-8h6v8" stroke-dasharray="2 2"/>';

  let cacheD = null, vanos = [], vanoDe = new Map();
  const ejes = z => { const q = z.b.q; return [new V3(1, 0, 0).applyQuaternion(q), new V3(0, 1, 0).applyQuaternion(q), new V3(0, 0, 1).applyQuaternion(q)]; };
  function centro(z) { if (z.t === 7) return new V3(0, 1.05, 0).applyQuaternion(z.b.q).add(z.b.p); return z.b.p.clone(); }
  function tam(z) { return z.t === 7 ? new V3(0.9, 2.1, 0.06) : z.b.s; }
  /* medida y posición de la pieza i en el marco del vano (u a lo largo, n perpendicular, y arriba) */
  function enMarco(i, o, u, n) {
    const z = A.P[i], [ax, ay, az] = ejes(z), s = tam(z), c = centro(z);
    const ext = d => Math.abs(ax.dot(d)) * s.x + Math.abs(ay.dot(d)) * s.y + Math.abs(az.dot(d)) * s.z;
    const up = new V3(0, 1, 0), dv = c.clone().sub(o);
    return { cu: dv.dot(u), cn: dv.dot(n), cy: c.y, eu: ext(u), en: ext(n), ey: ext(up) };
  }
  /* rejilla de 2 m por la caja de cada pieza (las enormes, como el suelo, van aparte) */
  function rejilla() {
    const P = A.P, N = A.N, C = 2, g = new Map(), grandes = [];
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (z.t === 5 || z.t === 6) continue;
      const [ax, ay, az] = ejes(z), s = tam(z), c = centro(z);
      const hx = 0.5 * (Math.abs(ax.x) * s.x + Math.abs(ay.x) * s.y + Math.abs(az.x) * s.z), hz = 0.5 * (Math.abs(ax.z) * s.x + Math.abs(ay.z) * s.y + Math.abs(az.z) * s.z);
      const x0 = Math.floor((c.x - hx) / C), x1 = Math.floor((c.x + hx) / C), z0 = Math.floor((c.z - hz) / C), z1 = Math.floor((c.z + hz) / C);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) { grandes.push(i); continue; }
      for (let x = x0; x <= x1; x++) for (let k = z0; k <= z1; k++) { const key = x * 100003 + k; let l = g.get(key); if (!l) g.set(key, l = []); l.push(i); }
    }
    return (x, zz, r) => { const out = new Set(grandes); for (let a = Math.floor((x - r) / C); a <= Math.floor((x + r) / C); a++) for (let b = Math.floor((zz - r) / C); b <= Math.floor((zz + r) / C); b++) { const l = g.get(a * 100003 + b); if (l) for (const i of l) out.add(i); } return out; };
  }
  const nombreMat = z => (z.mat >= 0 && A.D.materiales[z.mat] ? A.D.materiales[z.mat][0] : '');
  const grupo = z => (z.grp >= 0 ? A.D.grupos[z.grp] || '' : '');

  function calcular() {
    if (cacheD === A.D) return; cacheD = A.D; vanos = []; vanoDe = new Map(); if (!A.D) return;
    const P = A.P, N = A.N, cerca = rejilla(), usados = new Set();
    const nuevoVano = (o, u, uA, uB, yBot, yTop, esp, marco, tipoSemilla) => {
      const n = new V3(-u.z, 0, u.x), W = uB - uA, H = yTop - yBot, muros = [], dentro = [];
      const cand = cerca(o.x + u.x * (uA + uB) / 2, o.z + u.z * (uA + uB) / 2, W / 2 + 1.2);
      for (const j of cand) {
        if (marco.includes(j)) continue; const z = P[j];
        const m = enMarco(j, o, u, n);
        // pared alrededor: mismo grosor, en el plano, pegada al vano por arriba, por abajo o por los lados
        if (z.t === 0 && Math.abs(m.en - esp) < 0.06 && Math.abs(m.cn) < 0.06 && z.cat !== 'col') {
          const iz = m.cu - m.eu / 2, de = m.cu + m.eu / 2, ab = m.cy - m.ey / 2, ar = m.cy + m.ey / 2;
          const solU = Math.min(de, uB) - Math.max(iz, uA), solY = Math.min(ar, yTop) - Math.max(ab, yBot);
          if ((Math.abs(ab - yTop) < 0.06 && solU > 0.1) || (Math.abs(ar - yBot) < 0.06 && solU > 0.1) || ((Math.abs(de - uA) < 0.06 || Math.abs(iz - uB) < 0.06) && solY > 0.3)) { muros.push(j); continue; }
        }
        // contenido: hoja, vidrio, rejas, colisiones del vano
        if (z.t === 5 || z.t === 6 || /^auto:/.test(grupo(z))) continue;
        if (m.cu > uA - 0.1 && m.cu < uB + 0.1 && m.cy > yBot - 0.1 && m.cy < yTop + 0.1 && Math.abs(m.cn) <= esp / 2 + 0.35 && m.eu <= W + 0.3 && m.ey <= H + 0.3) dentro.push(j);
      }
      // el grupo entero de una hoja de puerta (manillas que sobresalen)
      const grs = new Set(dentro.map(j => grupo(P[j])).filter(g => /^puerta:/.test(g)));
      if (grs.size) for (const j of cand) if (!dentro.includes(j) && !marco.includes(j) && grs.has(grupo(P[j]))) dentro.push(j);
      if (!muros.length) return null;
      const suelo = muros.reduce((m, j) => { const z = P[j], mm = enMarco(j, o, u, n); return Math.min(m, mm.cy - mm.ey / 2); }, Infinity);
      const conPuerta = dentro.some(j => P[j].t === 7) || yBot - suelo < 0.15 || tipoSemilla === 'puerta';
      const v = { id: vanos.length, o: o.clone().addScaledVector(u, (uA + uB) / 2), u: u.clone(), W, H, yBot, yTop, esp, marco, dentro, muros, tipo: conPuerta ? 'puerta' : 'ventana', firma: Math.round(o.x * 100) + '_' + Math.round(o.z * 100) + '_' + Math.round(yBot * 100) };
      vanos.push(v); for (const j of marco.concat(dentro)) { if (!vanoDe.has(j)) vanoDe.set(j, v.id); usados.add(j); }
      return v;
    };
    // 1) vanos con marco (cabecero de 7 cm entre dos jambas)
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (z.t !== 0) continue; const s = z.b.s; if (s.y < 0.055 || s.y > 0.095) continue;
      const [ax, ay, az] = ejes(z); if (Math.abs(ay.y) < 0.99) continue;
      let u, W, Tg;
      if (s.x >= 0.4 && s.z >= 0.08 && s.z <= 1.1) { u = ax; W = s.x; Tg = s.z; } else if (s.z >= 0.4 && s.x >= 0.08 && s.x <= 1.1) { u = az; W = s.z; Tg = s.x; } else continue;
      u = new V3(u.x, 0, u.z).normalize(); const n = new V3(-u.z, 0, u.x), o = z.b.p.clone(), top = o.y + s.y / 2;
      let izq = null, der = null;
      for (const j of cerca(o.x, o.z, W / 2 + 0.5)) {
        if (j === i || P[j].t !== 0) continue; const m = enMarco(j, o, u, n);
        if (m.eu < 0.05 || m.eu > 0.095 || Math.abs(m.en - Tg) > 0.03 || Math.abs(m.cn) > 0.04 || m.ey < 0.3 || Math.abs(m.cy + m.ey / 2 - top) > 0.04) continue;
        if (Math.abs(Math.abs(m.cu) - (W / 2 - 0.035)) > 0.04) continue;
        if (m.cu < 0) izq = { j, m }; else der = { j, m };
      }
      if (!izq || !der) continue;
      const yBot = Math.min(izq.m.cy - izq.m.ey / 2, der.m.cy - der.m.ey / 2), marco = [i, izq.j, der.j];
      for (const j of cerca(o.x, o.z, W / 2 + 0.5)) { // alféizar
        if (marco.includes(j) || P[j].t !== 0) continue; const m = enMarco(j, o, u, n);
        if (m.ey <= 0.1 && Math.abs(m.cy - yBot) < 0.07 && m.eu >= W - 0.01 && m.eu <= W + 0.25 && Math.abs(m.cu) < 0.05 && Math.abs(m.cn) < 0.06) marco.push(j);
      }
      nuevoVano(o, u, -W / 2, W / 2, yBot, top, Tg - 0.06, marco);
    }
    // 2) puertas originales sin marco: el vano entre los trozos de pared de los lados y el de arriba
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (z.t !== 7 || usados.has(i) || /^auto:/.test(grupo(z))) continue;
      const hoja = []; const g = grupo(z); if (g) for (let j = 0; j < N; j++) if (P[j].grp === z.grp) hoja.push(j);
      const [ax] = ejes(z); const u = new V3(ax.x, 0, ax.z).normalize(), n = new V3(-u.z, 0, u.x);
      let c = centro(z); const t1 = hoja.filter(j => P[j].t === 1 || P[j].t === 4); if (t1.length) { c = new V3(); for (const j of t1) c.add(centro(P[j])); c.multiplyScalar(1 / t1.length); }
      const o = new V3(c.x, z.b.p.y, c.z); let izq = null, der = null, arr = null;
      for (const j of cerca(o.x, o.z, 2.5)) {
        const w = P[j]; if (w.t !== 0 || hoja.includes(j) || w.cat === 'col') continue; const m = enMarco(j, o, u, n);
        if (m.en < 0.08 || m.en > 1.1 || Math.abs(m.cn) > 0.35 || m.ey < 0.4) continue;
        const iz = m.cu - m.eu / 2, de = m.cu + m.eu / 2, ab = m.cy - m.ey / 2;
        if (ab > o.y + 1.8 && iz < 0 && de > 0 && (!arr || ab < arr.ab)) arr = { j, ab, m };
        else if (ab < o.y + 0.3 && de <= 0.15 && de > -1.5 && (!izq || de > izq.de)) izq = { j, de, m };
        else if (ab < o.y + 0.3 && iz >= -0.15 && iz < 1.5 && (!der || iz < der.iz)) der = { j, iz, m };
      }
      if (!izq || !der || !arr) continue;
      const ref = arr.m; const o2 = o.clone().addScaledVector(n, ref.cn);
      nuevoVano(o2, u, izq.de, der.iz, o.y, arr.ab, ref.en, [i].concat(hoja), 'puerta');
    }
  }

  function materialDe(nombre) {
    const n = nombre.toLowerCase();
    if (/^bloque/.test(n)) return 'bloque'; if (/^ladrillo/.test(n)) return 'ladrillo'; if (/^concreto/.test(n)) return 'concreto';
    if (/^madera/.test(n)) return 'madera'; if (/^(metal|material)/.test(n)) return 'metal'; if (/^(chapa|corrugado)/.test(n)) return 'chapa';
    return 'pintura';
  }
  function datosRelleno(v, refs) {
    const P = A.P; const w = P[v.muros.find(j => !P[j].del) ?? v.muros[0]];
    const g = Math.atan2(-v.u.z, v.u.x) / A.DEG;
    return { x: v.o.x, y: v.yBot, z: v.o.z, giroY: g, sx: v.W, sy: v.yTop - v.yBot, sz: v.esp, material: materialDe(nombreMat(w)), color: '#' + w.c.getHexString(), origen: 'base', relleno: { vano: v.firma, tipo: v.tipo, refs: refs.slice().sort((a, b) => a - b) } };
  }

  /* llamado por borrarSel (editor.js) con las piezas originales que se van a borrar */
  function alBorrar(refs) {
    calcular(); if (!vanos.length) return null;
    const S = new Set(refs), P = A.P, docs = [], tocados = new Set();
    for (const r of refs) { const v = vanoDe.get(r); if (v != null) tocados.add(v); }
    if (!tocados.size) return null;
    let k = 0, rellenos = 0;
    for (const id of tocados) {
      const v = vanos[id], todas = v.marco.concat(v.dentro).filter(j => !P[j].del || S.has(j));
      for (const j of todas) S.add(j);
      if (!v.muros.some(j => !P[j].del && !S.has(j))) continue; // se borra también la pared: no hay nada que rellenar
      const id2 = A.nuevoId() + 'r' + (k++);
      const d = datosRelleno(v, v.marco.concat(v.dentro));
      docs.push({ id: id2, data: A.docNuevo(id2, 'muro', d, { props: { nombre: 'Relleno de ' + v.tipo } }) }); rellenos++;
    }
    if (rellenos) A.pista(rellenos === 1 ? 'El vano se ha rellenado con pared (Ctrl+Z lo deshace).' : rellenos + ' vanos rellenados con pared (Ctrl+Z lo deshace).');
    return { refs: [...S], docs };
  }
  /* el relleno solo se ve mientras su puerta o ventana siga borrada */
  E.filtrosVis.push((key, o) => {
    const r = o && o.datos && o.datos.relleno; if (!r || !Array.isArray(r.refs)) return true;
    const P = A.P; return r.refs.every(j => !P[j] || P[j].del);
  });

  /* hueco propio: después de moverlo vuelve a la línea de su pared, dentro de su largo */
  let corrigiendo = false;
  function pegarHuecos() {
    if (corrigiendo) return; const lista = [];
    for (const o of E.nuevos().values()) {
      if (A.tipoBase(o.tipo) !== 'hueco' || o.datos.muro == null) continue; const d = o.datos;
      let c, ux, uz, base, L, G;
      if (typeof d.muro === 'string') { const w = E.nuevos().get(d.muro); if (!w) continue; const wd = w.datos, g = (+wd.giroY || 0) * A.DEG; ux = Math.cos(g); uz = -Math.sin(g); c = [+wd.x, +wd.z]; base = +wd.y || 0; L = +wd.sx || 0; G = +wd.sz || 0.2; }
      else { const z = A.P[d.muro]; if (!z || z.del) continue; const ejeX = z.s.x >= z.s.z, ax = new V3(ejeX ? 1 : 0, 0, ejeX ? 0 : 1).applyQuaternion(z.q); ux = ax.x; uz = ax.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; c = [z.p.x, z.p.z]; base = z.p.y - z.s.y / 2; L = ejeX ? z.s.x : z.s.z; G = ejeX ? z.s.z : z.s.x; }
      const lim = Math.max(0, L / 2 - (+d.sx || 1) / 2); let u = (d.x - c[0]) * ux + (d.z - c[1]) * uz; u = Math.max(-lim, Math.min(lim, u));
      const x = c[0] + ux * u, zz = c[1] + uz * u;
      let gy = +d.giroY || 0; const gx = Math.cos(gy * A.DEG), gz = -Math.sin(gy * A.DEG); if (Math.abs(gx * ux + gz * uz) < 0.99) gy = Math.atan2(-uz, ux) / A.DEG;
      if (Math.abs(x - d.x) + Math.abs(zz - d.z) + Math.abs(base - (+d.y || 0)) + Math.abs(gy - (+d.giroY || 0)) + Math.abs(G - (+d.sz || 0)) < 0.004) continue;
      const nd = Object.assign({}, d, { x, z: zz, y: base, giroY: gy, sz: G }); const viejo = o.datos; o.datos = nd; const doc = A.docActualizado(o); o.datos = viejo; if (doc) lista.push(doc);
    }
    if (lista.length) { corrigiendo = true; try { A.guardar(lista, { unir: true }); } finally { corrigiendo = false; } }
  }
  E.on('recompute', () => { Promise.resolve().then(pegarHuecos); });

  /* al elegir una puerta o ventana original, decir que tiene vano */
  E.on('seleccion', () => {
    const s = A.sel; if (!s.length || !s.every(k => k[0] === 'p')) return; calcular();
    const ids = new Set(); for (const k of s) { const v = vanoDe.get(+k.slice(1)); if (v != null) ids.add(v); }
    if (ids.size !== 1) return; const v = vanos[[...ids][0]];
    A.pista((v.tipo === 'puerta' ? 'Puerta' : 'Ventana') + ' con vano de ' + A.fmt(v.W) + ' × ' + A.fmt(v.H) + ' m' + (v.tipo === 'ventana' ? ' a ' + A.fmt(v.yBot - Math.min(...v.muros.map(j => A.P[j].b.p.y - A.P[j].b.s.y / 2))) + ' m del suelo' : '') + ': si la borras, el hueco se rellena con pared.');
  });
  E.on('mapa', () => { cacheD = null; });

  /* llamado al final de calcularAuto (editor.js): la puerta o ventana de cada vano es un objeto propio («Puerta …» / «Ventana»),
     aunque el marco toque la pared; así un clic la coge entera sin llevarse los trozos de pared */
  function ajustarAuto(autos, autoDe) {
    cacheD = null; calcular(); const P = A.P;
    for (const v of vanos) {
      const ids = v.marco.concat(v.dentro); if (ids.length < 2) continue;
      const keys = ids.map(j => 'p' + j), set = new Set(keys);
      for (const k of keys) { const a = autoDe.get(k); if (a != null && autos[a]) autos[a].keys = autos[a].keys.filter(x => !set.has(x)); }
      const gp = ids.map(j => grupo(P[j])).find(g => /^puerta:/.test(g));
      const g = { keys, firma: 'v' + v.firma + '_' + ids.length, nombre: gp ? 'Puerta ' + gp.slice(7).replace(/_/g, ' ') : (v.tipo === 'puerta' ? 'Puerta' : 'Ventana'), tam: [v.W, v.H, v.esp + 0.1], vano: v.id };
      const id = autos.length; autos.push(g); for (const k of keys) autoDe.set(k, id);
    }
  }

  window.OOHuecos = { alBorrar, ajustarAuto, vanos: () => { calcular(); return vanos; }, vanoDe: i => { calcular(); const v = vanoDe.get(i); return v == null ? null : vanos[v]; }, calcular };
})();
