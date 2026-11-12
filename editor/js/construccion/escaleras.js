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
  const PE = { forma: 'recta', giro: 'izq', ancho: 1.2, descanso: false, barandas: 'ambas', estilo: 'maciza', estiloBaranda: 'tubo', color: '#b9b4aa', colorBaranda: '#4a4f55', alturaBaranda: 0.9, altoLibre: 2.8 };
  const PR = { pendiente: 8, ancho: 1.5, barandas: 'ambas', bordillos: true, descanso: 0, color: '#a9a49a', altoLibre: 0.5 };
  A.params.escalera = PE; A.params.rampa = PR;

  /* ---------- cálculo de peldaños ---------- */
  function normalizar(d) {
    const H = Math.max(0.05, +d.alto || 0.18); let n = Math.max(1, Math.ceil(H / 0.18 - 1e-6)); const c = H / n;
    const h = d.huellaFija && +d.huella > 0.1 ? +d.huella : Math.max(0.25, Math.min(0.32, 0.63 - 2 * c));
    d.alto = r3(H); d.n = n; d.contrahuella = r3(c); d.huella = r3(h); d.ancho = r3(Math.max(0.5, +d.ancho || 1.2));
    const W = d.ancho, Ld = Math.max(W, +d.largoDescanso || 0) || W;
    if (window.OOEscalerasLibres && OOEscalerasLibres.maneja(d)) { OOEscalerasLibres.caja(d); d.sy = d.alto; d.origen = 'base'; return d; } /* escalera libre (escaleras_libres.js) */
    if (window.OOEscalerasPro && OOEscalerasPro.maneja(d)) { OOEscalerasPro.caja(d); d.sy = d.alto; d.origen = 'base'; return d; } /* (2.1 pro f5) caracol y en U (escaleras_pro.js) */
    if (d.forma === 'L') { const n1 = Math.max(1, Math.ceil(n / 2)), L1 = (n1 - 1) * h + W, L2 = (n - n1) * h; d.sx = r3(L1); d.sz = r3(W + L2); }
    else { const n1 = d.descanso && n >= 4 ? Math.ceil(n / 2) : 0; d.sx = r3(n * h + (n1 ? Ld - h : 0)); d.sz = W; }
    d.sy = d.alto; d.origen = 'base';
    return d;
  }
  /* centro de la caja en planta respecto al pie del primer peldaño (marco del pie: sube hacia +X) */
  function desfase(d) {
    if (window.OOEscalerasLibres && OOEscalerasLibres.maneja(d)) return OOEscalerasLibres.desfase(d);
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
  /* oscurece o aclara un color #rrggbb (f < 1 oscurece) */
  function tono(hex, f) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex || '#777777'; const n = parseInt(m[1], 16); const c = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f))); return '#' + [16, 8, 0].map(k => c(k).toString(16).padStart(2, '0')).join(''); }
  /* baranda entre dos puntos del suelo a = [x, y, z] y b, en el marco Mf, con el estilo d.estiloBaranda:
     tubo (postes, pasamanos y travesaño), barrotes (verticales cada 12 cm), cables (4 cables horizontales), vidrio (paneles), muro (antepecho macizo) */
  function baranda(out, Mf, a, b, d, opts) {
    const o = opts || {}, est = d.estiloBaranda || 'tubo', ab = +d.alturaBaranda || 0.9, bc = d.colorBaranda || '#4a4f55';
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz); if (L < 0.15) return;
    const at = t => [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t], up = (p, h) => [p[0], p[1] + h, p[2]];
    const postes = (paso, grosor, desde, hasta) => { const n = Math.max(1, Math.ceil(L / paso)); for (let k = o.sinPrimero ? 1 : 0; k <= n; k++) { const p = at(k / n); out.push(barra(Mf, up(p, desde || 0), up(p, hasta || ab), grosor, bc)); } };
    /* marco del tramo de baranda: +X a lo largo, +Z hacia fuera (para los paneles) */
    const Ms = () => mul(Mf.clone(), tras(a[0], 0, a[2]), rotY(-Math.atan2(dz, dx)));
    const panel = (y0, y1, grosor, color, transp) => { const dy = b[1] - a[1]; const pz = perfil(Ms(), [[0, a[1] + y0], [L, a[1] + dy + y0], [L, a[1] + dy + y1], [0, a[1] + y1]], -grosor / 2, grosor / 2, color); if (transp) pz.t = true; out.push(pz); };
    if (est === 'muro') { panel(0, ab, 0.1, d.color || '#c9c3b6'); out.push(barra(Mf, up(a, ab + 0.02), up(b, ab + 0.02), 0.12, tono(d.color || '#c9c3b6', 0.85))); return; }
    out.push(barra(Mf, up(a, ab), up(b, ab), 0.05, bc)); /* pasamanos */
    if (est === 'barrotes') { postes(0.12, 0.02, 0.06, ab); out.push(barra(Mf, up(a, 0.06), up(b, 0.06), 0.03, bc)); }
    else if (est === 'cables') { postes(1.2, 0.045); for (const f of [0.18, 0.38, 0.58, 0.78]) out.push(barra(Mf, up(a, ab * f), up(b, ab * f), 0.01, '#9aa3a9')); }
    else if (est === 'vidrio') { postes(Math.max(L, 0.2), 0.05, 0, ab); panel(0.06, ab - 0.05, 0.014, '#bfe3f0', true); }
    else { postes(1.2, 0.04); out.push(barra(Mf, up(a, ab / 2), up(b, ab / 2), 0.025, bc)); }
  }
  /* estilos de peldaño: maciza (perfil de hormigón), zanca (dos vigas laterales), zanca_central (una viga al centro), flotante (peldaños
     volados, sin vigas), madera (huella + tabica + zancas de madera), metalica (vigas de acero y peldaños de rejilla) */
  const ESTILOS = [['maciza', 'Maciza (hormigón)'], ['zanca', 'Peldaños sobre dos zancas'], ['zanca_central', 'Zanca central'], ['flotante', 'Flotante (peldaños volados)'], ['madera', 'Madera con tabica'], ['metalica', 'Metálica industrial']];
  const ESTILOS_BARANDA = [['tubo', 'Tubo con travesaño'], ['barrotes', 'Barrotes'], ['cables', 'Cables de acero'], ['vidrio', 'Vidrio'], ['muro', 'Antepecho macizo']];
  /* un tramo: risers desde y0, huellas L[k]; devuelve el largo en planta */
  function tramo(out, Mf, y0, c, L, W, d, col, ladoBaranda) {
    const n = L.length, pts = [[0, 0], [0, y0 + c]]; let x = 0; const narices = [];
    for (let k = 0; k < n; k++) { narices.push([x, y0 + (k + 1) * c]); x += L[k]; pts.push([x, y0 + (k + 1) * c]); if (k < n - 1) pts.push([x, y0 + (k + 2) * c]); }
    pts.push([x, 0]);
    const est = d.estilo || 'maciza';
    if (est === 'maciza') out.push(perfil(Mf, pts, -W / 2, W / 2, col));
    else {
      const gP = { zanca: 0.05, zanca_central: 0.06, flotante: 0.09, madera: 0.045, metalica: 0.035 }[est] || 0.05;
      const colP = est === 'metalica' ? (d.colorPeldano || '#80868b') : col, zc = d.colorZanca || { madera: tono(col, 0.7), metalica: '#3a3f44', zanca_central: '#3f4549' }[est] || '#5d666b';
      let xx = 0;
      for (let k = 0; k < n; k++) {
        const yT = y0 + (k + 1) * c;
        out.push(caja(Mf, [xx + L[k] / 2 + (est === 'madera' ? -0.01 : 0), yT - gP / 2, 0], [L[k] + (est === 'madera' ? 0.02 : 0), gP, est === 'flotante' ? W : W - 0.02], colP));
        if (est === 'madera' && c - gP > 0.02) out.push(caja(Mf, [xx + 0.01, yT - gP - (c - gP) / 2, 0], [0.02, c - gP, W - 0.06], tono(col, 0.9)));
        if (est === 'metalica') for (const z of [-W / 2 + 0.06, W / 2 - 0.06]) out.push(caja(Mf, [xx + L[k] / 2, yT - gP - 0.02, z], [L[k] * 0.9, 0.04, 0.04], zc));
        xx += L[k];
      }
      const ini = [0, y0 - 0.05 + c * 0.5], fin = [x - L[n - 1] / 2, y0 + n * c - 0.12];
      const vigas = { zanca: [[W / 2 - 0.03, 0.06]], madera: [[W / 2 + 0.015, 0.05]], metalica: [[W / 2 + 0.02, 0.08]], zanca_central: [[0, 0.16]] }[est] || [];
      for (const [zz, g] of vigas) for (const z of zz ? [-zz, zz] : [0]) {
        out.push(barra(Mf, [ini[0], ini[1] - (est === 'zanca_central' ? 0.06 : 0), z], [fin[0], fin[1] - (est === 'zanca_central' ? 0.06 : 0), z], g, zc));
        if (y0 > 0.05) out.push(caja(Mf, [0.05, y0 / 2, z], [0.08, y0, 0.08], zc)); /* tramo alto: apoyo bajo el arranque */
      }
      if (est === 'flotante' && d.barandas !== 'ambas') { /* pletina en el lado de la pared, donde se empotran los peldaños */
        const zp = d.barandas === 'izq' ? W / 2 + 0.01 : -W / 2 - 0.01; out.push(barra(Mf, [0, y0 + c - 0.05, zp], [x, y0 + n * c - 0.05, zp], 0.02, tono(col, 0.75)));
      }
    }
    const lados = d.barandas === 'ninguna' ? [] : d.barandas === 'izq' ? [-1] : d.barandas === 'der' ? [1] : [-1, 1];
    for (const s of lados) {
      if (ladoBaranda && !ladoBaranda(s)) continue; const z = s * (W / 2 - 0.05);
      const ini = narices[0], fin = narices[n - 1];
      baranda(out, Mf, [ini[0] + 0.12, ini[1], z], [fin[0] + 0.12, fin[1], z], d);
    }
    return x;
  }
  function partesEscalera(e, col) {
    const d = normalizar(Object.assign({}, e)), out = [], c = d.contrahuella, h = d.huella, n = d.n, W = d.ancho, [ox, oz] = desfase(d), M0 = tras(-ox, 0, -oz);
    if (window.OOEscalerasLibres && OOEscalerasLibres.maneja(d)) return OOEscalerasLibres.partes(d, col, M0);
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
    if (window.OOEscalerasLibres && OOEscalerasLibres.maneja(s)) return OOEscalerasLibres.huellas(s, w);
    if (window.OOEscalerasPro && OOEscalerasPro.maneja(s)) return OOEscalerasPro.huellas(s, rect, w); /* (2.1 pro f5) */
    if (s.forma === 'L') { const n1 = Math.max(1, Math.ceil(s.n / 2)), L1 = (n1 - 1) * s.huella + W, L2 = (s.n - n1) * s.huella, sgn = s.giro === 'der' ? 1 : -1; const out = [rect(0, L1, -W / 2, W / 2)]; if (L2 > 0.01) out.push(rect(L1 - W, L1, sgn > 0 ? W / 2 : -W / 2 - L2, sgn > 0 ? W / 2 + L2 : -W / 2)); return out; }
    return [rect(0, s.sx, -W / 2, W / 2)];
  }
  const aLocalPiso = (H, [x, z]) => { const g = (+H.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), dx = x - (+H.x || 0), dz = z - (+H.z || 0); return [r3(dx * c - dz * s), r3(dx * s + dz * c)]; };
  function solapa(pol, pts) { /* algún vértice dentro del otro o centro dentro */ if (pol.some(([x, z]) => A.dentroPoligono(x, z, pts))) return true; if (pts.some(([x, z]) => A.dentroPoligono(x, z, pol))) return true; const cx = pol.reduce((s, p) => s + p[0], 0) / pol.length, cz = pol.reduce((s, p) => s + p[1], 0) / pol.length; return A.dentroPoligono(cx, cz, pts); }

  /* ---------- regla: abrir y cerrar los huecos de los pisos y techos que atraviesa (como en los Sims) ----------
     Una losa (piso de habitación, losa de planta o techo plano) se abre si la escalera llega a ella o la atraviesa: su altura está entre
     el pie + 0,5 m y lo alto de la escalera + 0,16 m, y su contorno se solapa con la huella. Funciona en los dos sentidos: al poner o mover la
     escalera y al construir o mover la losa después. `sinHueco` en la escalera lo desactiva. */
  function losaPlana(H) { const b = tb(H.tipo); if (b === 'habitacion') return true; if (b !== 'techo') return false; const f = H.datos.forma; return !f || f === 'plano'; }
  function alturaLosa(H) { return tb(H.tipo) === 'habitacion' ? (window.OOAnclajes ? OOAnclajes.tope(H.tipo, H.datos) : +H.datos.y || 0) : +H.datos.y || 0; }
  function cruza(dEsc, H) { const y0 = +dEsc.y || 0, top = y0 + (+dEsc.alto || 0), yl = alturaLosa(H); return yl > y0 + 0.5 && yl < top + 0.16; }
  function huecosPara(H, ctx, excluir) {
    const aa = {}, pts = A.puntosMundoHab({ datos: H.datos });
    for (const [, S] of ctx.todos()) {
      if (!ctx.esAgr(S) || tb(S.tipo) !== 'escalera' || S.datos.sinHueco || S.id_objeto === excluir || !cruza(S.datos, H)) continue;
      const hs = huellas(S.tipo, S.datos); if (!hs.some(hh => solapa(hh, pts))) continue;
      hs.forEach((hh, k) => { aa[k ? S.id_objeto + '#' + k : S.id_objeto] = hh.map(p => aLocalPiso(H.datos, p)); });
    }
    return aa;
  }
  function ajustarAgujeros(id, d, ctx, borrar) {
    const oid = d.id_objeto, b = tb(d.tipo); const hs = borrar ? [] : huellas(d.tipo, d.datos);
    for (const [hid, H] of ctx.todos()) {
      if (!ctx.esAgr(H) || !losaPlana(H) || H.id_objeto === oid) continue;
      const tieneYa = H.datos.agujeros_auto && Object.keys(H.datos.agujeros_auto).some(k => k === oid || k.startsWith(oid + '#'));
      const pts = A.puntosMundoHab({ datos: H.datos });
      const toca = !borrar && b === 'escalera' && !d.datos.sinHueco && cruza(d.datos, H) && hs.some(hh => solapa(hh, pts));
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
      const campos = ['x', 'y', 'z', 'giroY', 'alto', 'ancho', 'forma', 'giro', 'descanso', 'largoDescanso', 'huella', 'huellaFija', 'tramos', 'radio', 'hueco', 'sinHueco'];
      if (prev && prev.datos && campos.every(k => JSON.stringify(prev.datos[k]) === JSON.stringify(d.datos[k]))) return;
      if (b === 'escalera') ajustarAgujeros(id, d, ctx, false);
    });
    OOAnclajes.reglasBorrar.push((id, prev, ctx) => { if (tb(prev.tipo) === 'escalera') ajustarAgujeros(id, prev, ctx, true); });
    /* losa nueva o movida: abre los huecos de las escaleras que ya la atraviesan (se construye el piso de arriba después de la escalera) */
    OOAnclajes.reglas.push((id, d, prev, ctx) => {
      if (!losaPlana(d)) return;
      const aa = huecosPara(d, ctx);
      if (Object.keys(aa).length) d.datos.agujeros_auto = aa; else delete d.datos.agujeros_auto;
    });
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
      /* sin nada más alto donde termina: sube la altura del panel (no hace falta un piso ni una pared arriba) */
      let H = r3((hit ? hit.y : b.y) - a.y); if (H < 0.1) H = Math.max(0.1, +(tipo === 'rampa' ? PR.altoLibre : PE.altoLibre) || (tipo === 'rampa' ? 0.5 : 2.8));
      const dir = Math.atan2(-(b.z - a.z), b.x - a.x) / DEG;
      const d = Object.assign({}, tipo === 'rampa' ? PR : PE, { y: a.y, giroY: r3(dir), alto: Math.max(0.05, H) });
      if (tipo === 'rampa') { normalizarRampa(d); d.x = r3(a.x + Math.cos(dir * DEG) * d.sx / 2); d.z = r3(a.z - Math.sin(dir * DEG) * d.sx / 2); return d; }
      return conPie(normalizar(d), [a.x, a.z]);
    };
    const arriba = e => { const h = A.pickEvento(e); return h && h.normal.y > 0.6 ? h.point : null; };
    return {
      n: tipo === 'rampa' ? 'Rampa' : 'Escalera', ic: tipo,
      pista: 'Clic en el pie y clic donde termina. Si terminas sobre un piso, una plataforma o una losa más alta, el desnivel se mide solo; si no, sube la altura del panel (se puede poner en cualquier sitio, sin paredes). ' + (tipo === 'rampa' ? 'El largo sale de la pendiente.' : 'Los peldaños se calculan solos y se abre el agujero del piso de arriba.'),
      opciones: () => { pie = null; },
      move: e => { const inf = A.inferir(e, pie); if (!pie || !inf) return; const hit = arriba(e); const d = datosEntre(pie, inf.p, hit); A.mostrarPrevia(tipo, d); A.etqVivas = [{ p: new V3(pie.x, pie.y + d.alto + 0.6, pie.z), t: (tipo === 'rampa' ? 'Rampa ' + A.fmt(d.largo) + ' m al ' + A.fmt(d.pendiente, 0) + ' %' : d.n + ' peldaños de ' + A.fmt(d.contrahuella * 100, 1) + ' × ' + A.fmt(d.huella * 100, 0) + ' cm') + ' · sube ' + A.fmt(d.alto) + ' m', c: 'vivo' }]; },
      up: (e, mov) => {
        if (mov > 6) return; const inf = A.inferir(e, pie); if (!inf) return;
        if (!pie) { pie = inf.p.clone(); A.punto3D(pie); return; }
        const hit = arriba(e); const d = datosEntre(pie, inf.p, hit); pie = null; A.limpiarPrevia(); A.etqVivas = []; A.ocultarInferencia();

        const id = tipo === 'rampa' ? crearRampa(d) : crear(d); if (id) A.seleccionar(['n' + id], { sinTab: true });
      },
      fin: () => { pie = null; A.limpiarPrevia(); A.etqVivas = []; },
      panel: () => tipo === 'rampa'
        ? `<div class="campos">${num('rp', 'altoLibre', 'Altura si no hay nada arriba (m)', PR.altoLibre || 0.5)}${num('rp', 'pendiente', 'Pendiente (%)', PR.pendiente, 0.5)}${num('rp', 'ancho', 'Ancho (m)', PR.ancho)}${opc('rp', 'barandas', 'Barandas', PR.barandas, BAR)}</div>`
        : `<div class="campos">${num('ep', 'altoLibre', 'Altura si no hay nada arriba (m)', PE.altoLibre || 2.8)}${opc('ep', 'diseno', 'Diseño', '', OPC_DISENOS)}${opc('ep', 'forma', 'Forma', PE.forma, FORMAS_ESC.filter(f => f[0] !== 'libre'))}${num('ep', 'ancho', 'Ancho (m)', PE.ancho)}${opc('ep', 'estilo', 'Peldaños', PE.estilo, ESTILOS)}${opc('ep', 'barandas', 'Barandas', PE.barandas, BAR)}${opc('ep', 'estiloBaranda', 'Tipo de baranda', PE.estiloBaranda || 'tubo', ESTILOS_BARANDA)}</div><p class="ayuda">Para tramos y descansos a tu gusto usa «Escalera libre».</p>`
    };
  }
  const FORMAS_ESC = [['recta', 'Recta'], ['L', 'En L'], ['U', 'En U (ida y vuelta)'], ['caracol', 'De caracol'], ['libre', 'Libre (tramos y descansos a medida)']]; /* (2.1 pro f5) */
  /* diseños listos: aplican estilo, barandas y colores de una vez (herramienta e inspector) */
  const DISENOS = {
    hormigon: { n: 'Hormigón', estilo: 'maciza', estiloBaranda: 'tubo', color: '#b9b4aa', colorBaranda: '#4a4f55', barandas: 'ambas' },
    madera: { n: 'Madera clásica', estilo: 'madera', estiloBaranda: 'barrotes', color: '#9a6b3f', colorBaranda: '#5e3d22', barandas: 'ambas' },
    flotante: { n: 'Flotante moderna', estilo: 'flotante', estiloBaranda: 'vidrio', color: '#e6e1d8', colorBaranda: '#2f3438', barandas: 'der' },
    central: { n: 'Zanca central', estilo: 'zanca_central', estiloBaranda: 'cables', color: '#d6cfc0', colorBaranda: '#2c3136', barandas: 'ambas' },
    industrial: { n: 'Metálica industrial', estilo: 'metalica', estiloBaranda: 'tubo', color: '#80868b', colorBaranda: '#d4a017', barandas: 'ambas' },
    antepecho: { n: 'Con antepecho', estilo: 'maciza', estiloBaranda: 'muro', color: '#cbc4b6', colorBaranda: '#4a4f55', barandas: 'ambas' },
    zancas: { n: 'Zancas de acero', estilo: 'zanca', estiloBaranda: 'barrotes', color: '#a77b4f', colorBaranda: '#2f3438', barandas: 'ambas' }
  };
  const OPC_DISENOS = [['', 'Elige un diseño…']].concat(Object.entries(DISENOS).map(([k, v]) => [k, v.n]));
  const aplicarDiseno = (k, destino) => { const v = DISENOS[k]; if (!v) return null; const c = Object.assign({}, v); delete c.n; Object.assign(destino || {}, c); return c; };
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
      <p class="ayuda" style="margin:0 0 6px">${esR ? `Largo ${A.fmt(d.largo)} m · pendiente ${A.fmt(d.pendiente, 1)} % · sube ${A.fmt(d.alto)} m` : `${d.n} peldaños · contrahuella ${A.fmt(d.contrahuella * 100, 1)} cm · huella ${A.fmt(d.huella * 100, 1)} cm · sube ${A.fmt(d.alto)} m`}${agujeros.length ? ' · abre el hueco de ' + agujeros.length + (agujeros.length > 1 ? ' losas' : ' losa') : ''}</p>
      ${num('ei', 'alto', 'Desnivel (m)', d.alto)}${num('ei', 'ancho', 'Ancho (m)', d.ancho)}
      ${esR ? num('ei', 'pendiente', 'Pendiente (%)', d.pendiente, 0.5) + num('ei', 'descanso', 'Tramo plano arriba (m)', d.descanso || 0) + chk('ei', 'bordillos', 'Bordillos', d.bordillos !== false)
        : opc('ei', 'forma', 'Forma', d.forma || 'recta', FORMAS_ESC) + (d.forma === 'libre' ? '' : d.forma && d.forma !== 'recta' ? opc('ei', 'giro', 'Gira hacia', d.giro || 'izq', [['izq', 'La izquierda'], ['der', 'La derecha']]) : chk('ei', 'descanso', 'Descanso a media altura', d.descanso)) + opc('ei', 'estilo', 'Peldaños', d.estilo || 'maciza', ESTILOS) + opc('ei', 'estiloBaranda', 'Tipo de baranda', d.estiloBaranda || 'tubo', ESTILOS_BARANDA) + opc('ei', 'diseno', 'Aplicar un diseño', '', OPC_DISENOS) + chk('ei', 'huellaFija', 'Huella fija', d.huellaFija) + (d.huellaFija ? num('ei', 'huella', 'Huella (m)', d.huella, 0.01) : '')}
      ${opc('ei', 'barandas', 'Barandas', d.barandas || 'ambas', BAR)}<label class="campo"><span>Color</span><input type="color" data-ei="color" value="${A.esc(d.color || '#b9b4aa')}"></label>${esR ? '' : `<label class="campo"><span>Color de la baranda</span><input type="color" data-ei="colorBaranda" value="${A.esc(d.colorBaranda || '#4a4f55')}"></label>` + chk('ei', 'huecoAuto', 'Abrir huecos en pisos y techos', !d.sinHueco)}
      <div class="fila"><button data-ei-a="ajustar">Ajustar el desnivel al piso de arriba</button></div></div></details>`;
    const ref = c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.ep === 'diseno') { if (aplicarDiseno(el.value, PE)) A.pista('Diseño «' + DISENOS[el.value].n + '» listo para la próxima escalera.'); if (A.renderPanel) A.renderPanel(); return; }
    if (el.dataset.ep || el.dataset.rp) { const P = el.dataset.ep ? PE : PR, k = el.dataset.ep || el.dataset.rp; let v = el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; P[k] = v; return; }
    if (el.dataset.ei === 'diseno') { const o = selEsc(); const c = o && aplicarDiseno(el.value); if (c) cambiar(o.id, c, 'Diseño de escalera: ' + DISENOS[el.value].n); return; }
    if (el.dataset.ei === 'huecoAuto') { const o = selEsc(); if (o) cambiar(o.id, { sinHueco: el.checked ? undefined : true }, el.checked ? 'Abrir huecos de la escalera' : 'Cerrar huecos de la escalera'); return; }
    if (el.dataset.ei === 'forma' && el.value === 'libre') { const o = selEsc(); if (o && window.OOEscalerasLibres) { cambiar(o.id, OOEscalerasLibres.desdeForma(o.datos), 'Escalera libre'); return; } }
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

  window.OOEscaleras = { _h: { tramo, caja, barra, perfil, mul, tras, rotY, baranda, tono, ESTILOS, ESTILOS_BARANDA, DISENOS, OPC_DISENOS, aplicarDiseno, BAR, num, opc, chk }, selEsc, partes, normalizar, normalizarRampa, huellas, desfase, conPie, pieDe, crear, crearRampa, conectar, cambiar, ajustarArriba, params: PE, paramsRampa: PR };
})();
