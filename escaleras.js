/* Editor del mapa (2.1, Map Editor Pro fase 3): escaleras y rampas paramétricas que unen dos alturas.
   Objeto `escalera`. Datos: x, y, z (centro de su caja en planta; `y` es la altura del pie), giroY (sube hacia +X local), alto (desnivel), ancho,
     contrahuella y huella (se calculan del alto: contrahuella ≤ 0,18 m y 2c + h = 0,63 m, salvo `huellaFija`), n (peldaños),
     forma 'recta' | 'L' (giro 'izq' | 'der', descanso en la esquina), descanso (recta con descanso a media altura), largoDescanso,
     barandas 'ambas' | 'izq' | 'der' | 'ninguna', alturaBaranda, estilo 'maciza' | 'zanca', color.
   Objeto `rampa`: x, y, z, giroY, alto, pendiente (%) → largo, ancho, barandas, bordillos, descanso (tramo plano arriba), color.
   `sx, sy, sz` son su caja (largo, alto, ancho) para el gizmo y la selección.
   Al guardar, una regla de anclajes.js abre un agujero (`agujeros_auto[id]`) en el piso o la losa que llega a la altura de arriba y tapa la
   escalera, y lo cierra si la escalera se mueve o se borra. Los perfiles macizos son polígonos extruidos (un solo objeto por tramo).
   Herramientas: Construir → «Escalera» y «Rampa»: clic en el pie y clic en el piso de arriba (de ahí sale el desnivel).
   API: OOEscaleras.crear(datos), crearRampa(datos), conectar(desdeId | null, hastaId, {pie: [x, z], dir: grados, ...}). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, M4 = T.Matrix4, Q4 = T.Quaternion, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon;
  if (window.OOEntidades && OOEntidades.ESTRUCTURA) for (const t of ['escalera', 'rampa', 'baranda']) if (!OOEntidades.ESTRUCTURA.includes(t)) OOEntidades.ESTRUCTURA.push(t);
  A.ICON.escalera = '<path d="M3 20h5v-5h5v-5h5V5h3"/>';
  A.ICON.rampa = '<path d="M3 19h18L21 8z"/>';
  const PE = { forma: 'recta', giro: 'izq', ancho: 1.2, descanso: false, barandas: 'ambas', estilo: 'maciza', color: '#b9b4aa', alturaBaranda: 0.9 };
  const PR = { pendiente: 8, ancho: 1.5, barandas: 'ambas', bordillos: true, descanso: 0, color: '#a9a49a' };
  A.params.escalera = PE; A.params.rampa = PR;

  /* ---------- cálculo de peldaños ---------- */
  function normalizar(d) {
    const H = Math.max(0.05, +d.alto || 0.18); let n = Math.max(1, Math.ceil(H / 0.18 - 1e-6)); const c = H / n;
    const h = d.huellaFija && +d.huella > 0.1 ? +d.huella : Math.max(0.25, Math.min(0.32, 0.63 - 2 * c));
    d.alto = r3(H); d.n = n; d.contrahuella = r3(c); d.huella = r3(h); d.ancho = r3(Math.max(0.5, +d.ancho || 1.2));
    const W = d.ancho, Ld = Math.max(W, +d.largoDescanso || 0) || W;
    if (window.OOEscalerasPro && OOEscalerasPro.maneja(d)) { OOEscalerasPro.caja(d); d.sy = d.alto; d.origen = 'base'; return d; } /* (2.1 pro f5) caracol y en U (escaleras_pro.js) */
    if (d.forma === 'L') { const n1 = Math.max(1, Math.ceil(n / 2)), L1 = (n1 - 1) * h + W, L2 = (n - n1) * h; d.sx = r3(L1); d.sz = r3(W + L2); }
    else { const n1 = d.descanso && n >= 4 ? Math.ceil(n / 2) : 0; d.sx = r3(n * h + (n1 ? Ld - h : 0)); d.sz = W; }
    d.sy = d.alto; d.origen = 'base';
    return d;
  }
  /* centro de la caja en planta respecto al pie del primer peldaño (marco del pie: sube hacia +X) */
  function desfase(d) {
    if (window.OOEscalerasPro && OOEscalerasPro.maneja(d)) return OOEscalerasPro.desfase(d); /* (2.1 pro f5) */
    if (d.forma === 'L' && d.n) { const n1 = Math.max(1, Math.ceil(d.n / 2)), L1 = (n1 - 1) * d.huella + d.ancho, L2 = (d.n - n1) * d.huella, sg = d.giro === 'der' ? 1 : -1; return [L1 / 2, sg * L2 / 2]; }
    return [(+d.sx || 0) / 2, 0];
  }
  /* datos con el centro calculado a partir del pie [x, z] */
  function conPie(d, pie) { const [ox, oz] = desfase(d), g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); d.x = r3(pie[0] + ox * c + oz * s); d.z = r3(pie[1] - ox * s + oz * c); return d; }
  function pieDe(d) { const [ox, oz] = desfase(d), g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); return [r3((+d.x || 0) - ox * c - oz * s), r3((+d.z || 0) + ox * s - oz * c)]; }
  function normalizarRampa(d) {
    const H = Math.max(0.02, +d.alto || 0.5), p = Math.max(1, Math.min(40, +d.pendiente || 8)); d.alto = r3(H); d.pendiente = r3(p); d.largo = r3(H / (p / 100)); d.ancho = r3(Math.max(0.6, +d.ancho || 1.5));
    d.sx = r3(d.largo + Math.max(0, +d.descanso || 0) + (window.OOEscalerasPro ? OOEscalerasPro.extraRampa(d) : 0)); d.sy = d.alto; /* (2.1 pro f5) descansos intermedios */ d.sz = d.ancho; d.origen = 'base'; return d;
  }

  /* ---------- geometría ---------- */
  const rotY = a => new M4().makeRotationY(a), rotX = a => new M4().makeRotationX(a), tras = (x, y, z) => new M4().makeTranslation(x, y, z);
  const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), new M4());
  const _p = new V3(), _q = new Q4(), _s = new V3();
  function caja(Mf, p, s, c) { mul(Mf, tras(p[0], p[1], p[2])).decompose(_p, _q, _s); return { f: 'b', p: [_p.x, _p.y, _p.z], s: s.map(v => Math.max(1e-3, v)), q: [_q.x, _q.y, _q.z, _q.w], c }; }
  function barra(Mf, a, b, d, c) { const dir = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = dir.length() || 1e-3; const q = new Q4().setFromUnitVectors(new V3(0, 0, 1), dir.normalize()); mul(Mf, new M4().compose(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V3(1, 1, 1))).decompose(_p, _q, _s); return { f: 'b', p: [_p.x, _p.y, _p.z], s: [d, d, L], q: [_q.x, _q.y, _q.z, _q.w], c }; }
  /* perfil (pts [x, y]) extruido a lo ancho, de z0 a z1, en el marco Mf */
  const perfil = (Mf, pts, z0, z1, c) => ({ f: 'poly', pts: pts.map(([x, y]) => [r3(x), r3(-y)]), y: 0, grosor: Math.max(0.01, z1 - z0), c, lm: mul(Mf, tras(0, 0, z0), rotX(Math.PI / 2)).toArray() });
  /* un tramo: risers desde y0, huellas L[k]; devuelve el perfil y las alturas de las narices para las barandas */
  function tramo(out, Mf, y0, c, L, W, d, col, ladoBaranda) {
    const n = L.length, pts = [[0, 0], [0, y0 + c]]; let x = 0; const narices = [];
    for (let k = 0; k < n; k++) { narices.push([x, y0 + (k + 1) * c]); x += L[k]; pts.push([x, y0 + (k + 1) * c]); if (k < n - 1) pts.push([x, y0 + (k + 2) * c]); }
    pts.push([x, 0]);
    if (d.estilo === 'zanca') {
      let xx = 0; for (let k = 0; k < n; k++) { out.push(caja(Mf, [xx + L[k] / 2, y0 + (k + 1) * c - 0.025, 0], [L[k], 0.05, W - 0.02], col)); xx += L[k]; }
      const zc = '#5d666b'; for (const z of [-W / 2 + 0.03, W / 2 - 0.03]) out.push(barra(Mf, [0, y0 - 0.05 + c * 0.5, z], [x - L[n - 1] / 2, y0 + n * c - 0.12, z], 0.06, zc));
      if (y0 > 0.05) { /* tramo alto en zanca: apoyo bajo el arranque */ for (const z of [-W / 2 + 0.03, W / 2 - 0.03]) out.push(caja(Mf, [0.05, y0 / 2, z], [0.08, y0, 0.08], zc)); }
    } else out.push(perfil(Mf, pts, -W / 2, W / 2, col));
    const ab = +d.alturaBaranda || 0.9, lados = d.barandas === 'ninguna' ? [] : d.barandas === 'izq' ? [-1] : d.barandas === 'der' ? [1] : [-1, 1], bc = d.colorBaranda || '#4a4f55';
    for (const s of lados) {
      if (ladoBaranda && !ladoBaranda(s)) continue; const z = s * (W / 2 - 0.05);
      const ini = narices[0], fin = narices[n - 1], npost = Math.max(2, Math.ceil((fin[0] - ini[0]) / 1.2) + 1);
      for (let k = 0; k < npost; k++) { const t = npost > 1 ? k / (npost - 1) : 0, xx = ini[0] + (fin[0] - ini[0]) * t + 0.12, yy = ini[1] + (fin[1] - ini[1]) * t; out.push(caja(Mf, [xx, yy + ab / 2, z], [0.04, ab, 0.04], bc)); }
      out.push(barra(Mf, [ini[0] + 0.12, ini[1] + ab, z], [fin[0] + 0.12, fin[1] + ab, z], 0.05, bc));
      out.push(barra(Mf, [ini[0] + 0.12, ini[1] + ab / 2, z], [fin[0] + 0.12, fin[1] + ab / 2, z], 0.025, bc));
    }
    return x;
  }
  function partesEscalera(e, col) {
    const d = normalizar(Object.assign({}, e)), out = [], c = d.contrahuella, h = d.huella, n = d.n, W = d.ancho, [ox, oz] = desfase(d), M0 = tras(-ox, 0, -oz);
    if (window.OOEscalerasPro && OOEscalerasPro.maneja(d)) return OOEscalerasPro.partes(d, col, M0); /* (2.1 pro f5) */
    if (d.forma === 'L') {
      const n1 = Math.max(1, Math.ceil(n / 2)), n2 = n - n1, L1 = []; for (let k = 0; k < n1 - 1; k++) L1.push(h); L1.push(W);
      const s = d.giro === 'der' ? 1 : -1;
      tramo(out, M0, 0, c, L1, W, d, col, null);
      if (n2 > 0) { const xc = (n1 - 1) * h + W / 2, M2 = mul(M0.clone(), tras(xc, 0, s * W / 2), rotY(-s * Math.PI / 2)); const L2 = []; for (let k = 0; k < n2; k++) L2.push(h); tramo(out, M2, n1 * c, c, L2, W, d, col, null); }
      return out;
    }
    const L = []; const n1 = d.descanso && n >= 4 ? Math.ceil(n / 2) : 0, Ld = Math.max(W, +d.largoDescanso || 0) || W;
    for (let k = 0; k < n; k++) L.push(n1 && k === n1 - 1 ? Ld : h);
    tramo(out, M0, 0, c, L, W, d, col, null);
    return out;
  }
  function partesRampa(e, col) {
    if (window.OOEscalerasPro && +e.descansos > 0) return OOEscalerasPro.partesRampa(normalizarRampa(Object.assign({}, e)), col); /* (2.1 pro f5) */
    const d = normalizarRampa(Object.assign({}, e)), out = [], H = d.alto, Lr = d.largo, W = d.ancho, Dz = Math.max(0, +d.descanso || 0), M0 = tras(-d.sx / 2, 0, 0);
    out.push(perfil(M0, Dz > 0 ? [[0, 0], [Lr, H], [Lr + Dz, H], [Lr + Dz, 0]] : [[0, 0], [Lr, H], [Lr, 0]], -W / 2, W / 2, col));
    if (d.bordillos !== false) for (const z of [-W / 2 + 0.05, W / 2 - 0.05]) out.push(perfil(M0, Dz > 0 ? [[0, 0], [0, 0.1], [Lr, H + 0.1], [Lr + Dz, H + 0.1], [Lr + Dz, H], [Lr, H]] : [[0, 0], [0, 0.1], [Lr, H + 0.1], [Lr, H]], z - 0.05, z + 0.05, '#8a857c'));
    const ab = 0.9, bc = d.colorBaranda || '#4a4f55', lados = d.barandas === 'ninguna' ? [] : d.barandas === 'izq' ? [-1] : d.barandas === 'der' ? [1] : [-1, 1];
    for (const s of lados) {
      const z = s * (W / 2 - 0.05), np = Math.max(2, Math.ceil(Lr / 1.5) + 1);
      for (let k = 0; k < np; k++) { const x = 0.1 + (Lr - 0.2) * k / (np - 1), y = H * x / Lr; out.push(caja(M0, [x, y + 0.1 + ab / 2, z], [0.04, ab, 0.04], bc)); }
      out.push(barra(M0, [0.1, 0.1 + H * 0.1 / Lr + ab, z], [Lr - 0.1, 0.1 + H * (Lr - 0.1) / Lr + ab, z], 0.05, bc));
      out.push(barra(M0, [0.1, 0.1 + H * 0.1 / Lr + 0.7, z], [Lr - 0.1, 0.1 + H * (Lr - 0.1) / Lr + 0.7, z], 0.04, bc)); /* pasamanos bajo */
      if (Dz > 0.3) out.push(barra(M0, [Lr - 0.1, H + 0.1 + ab, z], [Lr + Dz - 0.05, H + 0.1 + ab, z], 0.05, bc));
    }
    return out;
  }
  function partes(e, col, base) { return base === 'rampa' ? partesRampa(e, col) : partesEscalera(e, col); }

  /* ---------- huella en planta (mundo): rectángulos de cada tramo ---------- */
  function huellas(tipo, d) {
    const g = (+d.giroY || 0) * DEG, cg = Math.cos(g), sg = Math.sin(g); let o = [0, 0];
    const w = ([x, z]) => { x -= o[0]; z -= o[1]; return [r3((+d.x || 0) + x * cg + z * sg), r3((+d.z || 0) - x * sg + z * cg)]; };
    const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(w);
    if (tb(tipo) === 'rampa') { const r = normalizarRampa(Object.assign({}, d)); o = [r.sx / 2, 0]; return [rect(0, r.sx, -r.ancho / 2, r.ancho / 2)]; }
    const s = normalizar(Object.assign({}, d)), W = s.ancho; o = desfase(s);
    if (window.OOEscalerasPro && OOEscalerasPro.maneja(s)) return OOEscalerasPro.huellas(s, rect, w); /* (2.1 pro f5) */
    if (s.forma === 'L') { const n1 = Math.max(1, Math.ceil(s.n / 2)), L1 = (n1 - 1) * s.huella + W, L2 = (s.n - n1) * s.huella, sgn = s.giro === 'der' ? 1 : -1; const out = [rect(0, L1, -W / 2, W / 2)]; if (L2 > 0.01) out.push(rect(L1 - W, L1, sgn > 0 ? W / 2 : -W / 2 - L2, sgn > 0 ? W / 2 + L2 : -W / 2)); return out; }
    return [rect(0, s.sx, -W / 2, W / 2)];
  }
  const aLocalPiso = (H, [x, z]) => { const g = (+H.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), dx = x - (+H.x || 0), dz = z - (+H.z || 0); return [r3(dx * c - dz * s), r3(dx * s + dz * c)]; };
  function solapa(pol, pts) { /* algún vértice dentro del otro o centro dentro */ if (pol.some(([x, z]) => A.dentroPoligono(x, z, pts))) return true; if (pts.some(([x, z]) => A.dentroPoligono(x, z, pol))) return true; const cx = pol.reduce((s, p) => s + p[0], 0) / pol.length, cz = pol.reduce((s, p) => s + p[1], 0) / pol.length; return A.dentroPoligono(cx, cz, pts); }

  /* ---------- regla: abrir y cerrar el agujero del piso de arriba ---------- */
  function ajustarAgujeros(id, d, ctx, borrar) {
    const oid = d.id_objeto, b = tb(d.tipo); const hs = borrar ? [] : huellas(d.tipo, d.datos); const top = (+d.datos.y || 0) + (+d.datos.alto || 0);
    for (const [hid, H] of ctx.todos()) {
      if (!ctx.esAgr(H) || tb(H.tipo) !== 'habitacion' || H.id_objeto === oid) continue;
      const tieneYa = H.datos.agujeros_auto && Object.keys(H.datos.agujeros_auto).some(k => k === oid || k.startsWith(oid + '#'));
      const pts = A.puntosMundoHab({ datos: H.datos }); const tp = window.OOAnclajes ? OOAnclajes.tope(H.tipo, H.datos) : 0;
      const toca = !borrar && b === 'escalera' && Math.abs(tp - top) < 0.16 && hs.some(hh => solapa(hh, pts));
      if (!toca && !tieneYa) continue;
      const nd = clon(H.datos); const aa = Object.assign({}, nd.agujeros_auto || {}); for (const k of Object.keys(aa)) if (k === oid || k.startsWith(oid + '#')) delete aa[k];
      if (toca) hs.forEach((hh, k) => { aa[k ? oid + '#' + k : oid] = hh.map(p => aLocalPiso(H.datos, p)); });
      if (Object.keys(aa).length) nd.agujeros_auto = aa; else delete nd.agujeros_auto;
      const n = ctx.docCon(H, nd); ctx.cambios.set(hid, n); if (!ctx.orden.includes(hid)) ctx.orden.push(hid);
    }
  }
  if (window.OOAnclajes) {
    OOAnclajes.reglas.push((id, d, prev, ctx) => {
      const b = tb(d.tipo); if (b !== 'escalera' && b !== 'rampa') return;
      /* si cambian las medidas sin mover el objeto, el pie se queda donde estaba (el centro se recalcula) */
      const fijo = prev && prev.datos && ['x', 'z', 'giroY'].every(k => Math.abs((+prev.datos[k] || 0) - (+d.datos[k] || 0)) < 1e-6);
      const pie = fijo ? (b === 'rampa' ? (() => { const r = normalizarRampa(clon(prev.datos)), g = (+r.giroY || 0) * DEG; return [(+r.x || 0) - Math.cos(g) * r.sx / 2, (+r.z || 0) + Math.sin(g) * r.sx / 2]; })() : pieDe(normalizar(clon(prev.datos)))) : null;
      if (b === 'escalera') { normalizar(d.datos); if (pie) conPie(d.datos, pie); }
      else { normalizarRampa(d.datos); if (pie) { const g = (+d.datos.giroY || 0) * DEG; d.datos.x = r3(pie[0] + Math.cos(g) * d.datos.sx / 2); d.datos.z = r3(pie[1] - Math.sin(g) * d.datos.sx / 2); } }
      const campos = ['x', 'y', 'z', 'giroY', 'alto', 'ancho', 'forma', 'giro', 'descanso', 'largoDescanso', 'huella', 'huellaFija'];
      if (prev && prev.datos && campos.every(k => JSON.stringify(prev.datos[k]) === JSON.stringify(d.datos[k]))) return;
      if (b === 'escalera') ajustarAgujeros(id, d, ctx, false);
    });
    OOAnclajes.reglasBorrar.push((id, prev, ctx) => { if (tb(prev.tipo) === 'escalera') ajustarAgujeros(id, prev, ctx, true); });
  }

  /* ---------- crear ---------- */
  function crear(datos, etiqueta) { const d = normalizar(Object.assign({ giroY: 0 }, PE, datos)); return A.crearNuevo('escalera', d, { props: { nombre: 'Escalera' } }, { etiqueta: etiqueta || 'Crear escalera' }); }
  function crearRampa(datos, etiqueta) { const d = normalizarRampa(Object.assign({ giroY: 0 }, PR, datos)); return A.crearNuevo('rampa', d, { props: { nombre: 'Rampa' } }, { etiqueta: etiqueta || 'Crear rampa' }); }
  const altura = id => { if (!id) return 0; const o = E.nuevos().get(id); return o && window.OOAnclajes ? OOAnclajes.tope(o.tipo, o.datos) : 0; };
  /* une la superficie `desde` (o el suelo) con `hasta`: pie en opts.pie [x, z], dirección opts.dir (grados, 0 = +X) */
  function conectar(desde, hasta, opts) {
    opts = opts || {}; const y0 = altura(desde), y1 = altura(hasta), H = r3(y1 - y0); if (H < 0.05) { A.pista('Las dos superficies están a la misma altura.'); return null; }
    const base = Object.assign({ y: y0, giroY: +opts.dir || 0, alto: H, desde: desde || null, hasta: hasta || null }, opts.rampa ? PR : PE, opts.datos || {});
    if (opts.rampa) { normalizarRampa(base); conPie(Object.assign(base, { forma: 'recta' }), opts.pie); delete base.forma; return crearRampa(base); }
    normalizar(base); conPie(base, opts.pie); return crear(base);
  }

  /* ---------- herramientas: clic en el pie, clic arriba ---------- */
  function herramienta(tipo) {
    let pie = null;
    const datosEntre = (a, b, hit) => {
      const H = r3((hit ? hit.y : b.y) - a.y), dir = Math.atan2(-(b.z - a.z), b.x - a.x) / DEG;
      const d = Object.assign({}, tipo === 'rampa' ? PR : PE, { y: a.y, giroY: r3(dir), alto: Math.max(0.05, H) });
      if (tipo === 'rampa') { normalizarRampa(d); d.x = r3(a.x + Math.cos(dir * DEG) * d.sx / 2); d.z = r3(a.z - Math.sin(dir * DEG) * d.sx / 2); return d; }
      return conPie(normalizar(d), [a.x, a.z]);
    };
    const arriba = e => { const h = A.pickEvento(e); return h && h.normal.y > 0.6 ? h.point : null; };
    return {
      n: tipo === 'rampa' ? 'Rampa' : 'Escalera', ic: tipo,
      pista: 'Clic en el pie (abajo) y clic en el piso, la plataforma o la losa de arriba: el desnivel se mide solo. ' + (tipo === 'rampa' ? 'El largo sale de la pendiente.' : 'Los peldaños se calculan solos y se abre el agujero del piso de arriba.'),
      opciones: () => { pie = null; },
      move: e => { const inf = A.inferir(e, pie); if (!pie || !inf) return; const hit = arriba(e); const d = datosEntre(pie, inf.p, hit); A.mostrarPrevia(tipo, d); A.etqVivas = [{ p: new V3(pie.x, pie.y + d.alto + 0.6, pie.z), t: (tipo === 'rampa' ? 'Rampa ' + A.fmt(d.largo) + ' m al ' + A.fmt(d.pendiente, 0) + ' %' : d.n + ' peldaños de ' + A.fmt(d.contrahuella * 100, 1) + ' × ' + A.fmt(d.huella * 100, 0) + ' cm') + ' · sube ' + A.fmt(d.alto) + ' m', c: 'vivo' }]; },
      up: (e, mov) => {
        if (mov > 6) return; const inf = A.inferir(e, pie); if (!inf) return;
        if (!pie) { pie = inf.p.clone(); A.punto3D(pie); return; }
        const hit = arriba(e); const d = datosEntre(pie, inf.p, hit); pie = null; A.limpiarPrevia(); A.etqVivas = []; A.ocultarInferencia();
        if (d.alto < 0.1) { A.pista('Haz el segundo clic sobre una superficie más alta (piso, plataforma o losa).'); return; }
        const id = tipo === 'rampa' ? crearRampa(d) : crear(d); if (id) A.seleccionar(['n' + id], { sinTab: true });
      },
      fin: () => { pie = null; A.limpiarPrevia(); A.etqVivas = []; },
      panel: () => tipo === 'rampa'
        ? `<div class="campos">${num('rp', 'pendiente', 'Pendiente (%)', PR.pendiente, 0.5)}${num('rp', 'ancho', 'Ancho (m)', PR.ancho)}${opc('rp', 'barandas', 'Barandas', PR.barandas, BAR)}</div>`
        : `<div class="campos">${opc('ep', 'forma', 'Forma', PE.forma, FORMAS_ESC)}${num('ep', 'ancho', 'Ancho (m)', PE.ancho)}${opc('ep', 'barandas', 'Barandas', PE.barandas, BAR)}${opc('ep', 'estilo', 'Estilo', PE.estilo, [['maciza', 'Maciza'], ['zanca', 'Peldaños sobre zancas']])}</div>`
    };
  }
  const FORMAS_ESC = [['recta', 'Recta'], ['L', 'En L'], ['U', 'En U (ida y vuelta)'], ['caracol', 'De caracol']]; /* (2.1 pro f5) */
  const BAR = [['ambas', 'A los dos lados'], ['izq', 'Izquierda'], ['der', 'Derecha'], ['ninguna', 'Sin barandas']];
  const num = (a, k, l, v, st) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.05}" data-${a}="${k}" value="${r3(+v || 0)}"></label>`;
  const opc = (a, k, l, v, lista) => `<label class="campo ancho"><span>${l}</span><select data-${a}="${k}">${lista.map(([x, n]) => `<option value="${A.esc(x)}"${String(v) === String(x) ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label>`;
  const chk = (a, k, l, v) => `<label class="chk"><input type="checkbox" data-${a}="${k}"${v ? ' checked' : ''}> ${A.esc(l)}</label>`;
  E.agregarHerramientaPropia('escalera', herramienta('escalera'));
  E.agregarHerramientaPropia('rampa', herramienta('rampa'));
  E.agregarHerramienta('construir', { h: 'escalera', n: 'Escalera' });
  E.agregarHerramienta('construir', { h: 'rampa', n: 'Rampa' });

  /* ---------- inspector ---------- */
  function selEsc() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && (tb(o.tipo) === 'escalera' || tb(o.tipo) === 'rampa') ? o : null; }
  function cambiar(id, cambios, etiqueta) { const o = E.nuevos().get(id); if (!o) return false; const v = o.datos; o.datos = Object.assign({}, v, cambios); const doc = A.docActualizado(o); o.datos = v; if (!doc) return false; A.guardar([doc], { etiqueta: etiqueta || 'Cambiar ' + (tb(o.tipo) === 'rampa' ? 'rampa' : 'escalera') }); return true; }
  E.on('panel', () => {
    const o = selEsc(); const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c) return; const d = o.datos, esR = tb(o.tipo) === 'rampa';
    const agujeros = [...E.nuevos().values()].filter(x => x.datos.agujeros_auto && Object.keys(x.datos.agujeros_auto).some(k => k === o.id || k.startsWith(o.id + '#')));
    const div = document.createElement('div');
    div.innerHTML = `<details class="sec" open data-sec="escalera"><summary>${esR ? 'Rampa' : 'Escalera'}</summary><div class="campos">
      <p class="ayuda" style="margin:0 0 6px">${esR ? `Largo ${A.fmt(d.largo)} m · pendiente ${A.fmt(d.pendiente, 1)} % · sube ${A.fmt(d.alto)} m` : `${d.n} peldaños · contrahuella ${A.fmt(d.contrahuella * 100, 1)} cm · huella ${A.fmt(d.huella * 100, 1)} cm · sube ${A.fmt(d.alto)} m`}${agujeros.length ? ' · abre el agujero de ' + agujeros.length + ' piso' + (agujeros.length > 1 ? 's' : '') : ''}</p>
      ${num('ei', 'alto', 'Desnivel (m)', d.alto)}${num('ei', 'ancho', 'Ancho (m)', d.ancho)}
      ${esR ? num('ei', 'pendiente', 'Pendiente (%)', d.pendiente, 0.5) + num('ei', 'descanso', 'Tramo plano arriba (m)', d.descanso || 0) + chk('ei', 'bordillos', 'Bordillos', d.bordillos !== false)
        : opc('ei', 'forma', 'Forma', d.forma || 'recta', FORMAS_ESC) + (d.forma && d.forma !== 'recta' ? opc('ei', 'giro', 'Gira hacia', d.giro || 'izq', [['izq', 'La izquierda'], ['der', 'La derecha']]) : chk('ei', 'descanso', 'Descanso a media altura', d.descanso)) + opc('ei', 'estilo', 'Estilo', d.estilo || 'maciza', [['maciza', 'Maciza'], ['zanca', 'Peldaños sobre zancas']]) + chk('ei', 'huellaFija', 'Huella fija', d.huellaFija) + (d.huellaFija ? num('ei', 'huella', 'Huella (m)', d.huella, 0.01) : '')}
      ${opc('ei', 'barandas', 'Barandas', d.barandas || 'ambas', BAR)}<label class="campo"><span>Color</span><input type="color" data-ei="color" value="${A.esc(d.color || '#b9b4aa')}"></label>
      <div class="fila"><button data-ei-a="ajustar">Ajustar el desnivel al piso de arriba</button></div></div></details>`;
    const ref = c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.ep || el.dataset.rp) { const P = el.dataset.ep ? PE : PR, k = el.dataset.ep || el.dataset.rp; let v = el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; P[k] = v; return; }
    if (el.dataset.ei) { const o = selEsc(); if (!o) return; const k = el.dataset.ei; let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; cambiar(o.id, { [k]: v }); }
  });
  /* busca el piso o la plataforma más cercana encima del final y ajusta el desnivel a su cara de arriba */
  function ajustarArriba(id) {
    const o = E.nuevos().get(id); if (!o) return false; const d = o.datos, g = (+d.giroY || 0) * DEG, L = +d.sx || 3, fx = (+d.x || 0) + Math.cos(g) * (L / 2 + 0.2), fz = (+d.z || 0) - Math.sin(g) * (L / 2 + 0.2);
    let mejor = null; for (const s of E.nuevos().values()) { const b = tb(s.tipo); if (b !== 'habitacion' && b !== 'fundacion') continue; const hu = OOAnclajes.huella(s.tipo, s.datos); if (!hu || !OOAnclajes.dentroCerca(fx, fz, hu, 0.4)) continue; const t = OOAnclajes.tope(s.tipo, s.datos) - (+d.y || 0); if (t > 0.1 && (!mejor || t < mejor.t)) mejor = { t, id: s.id }; }
    if (!mejor) { A.pista('No hay ningún piso ni plataforma más alta al final de la escalera.'); return false; }
    return cambiar(id, { alto: r3(mejor.t), hasta: mejor.id }, 'Ajustar el desnivel');
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ei-a]'); if (!b) return; const o = selEsc(); if (o && b.dataset.eiA === 'ajustar') ajustarArriba(o.id); });

  window.OOEscaleras = { _h: { tramo, caja, barra, perfil, mul, tras, rotY }, partes, normalizar, normalizarRampa, huellas, desfase, conPie, pieDe, crear, crearRampa, conectar, cambiar, ajustarArriba, params: PE, paramsRampa: PR };
})();
