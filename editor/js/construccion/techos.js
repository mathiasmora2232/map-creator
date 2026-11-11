/* Editor del mapa (2.1, Map Editor Pro fase 3): techos y cubiertas paramétricas.
   Es el mismo objeto `techo` de siempre (se ancla, sube con el alto de su habitación con `de_habitacion`, se exporta igual), con `datos.forma`:
     plano, una_pendiente, dos_aguas, cuatro_aguas, galpon, industrial (diente de sierra), pergola, toldo, cobertizo.
   Sin `forma` sigue siendo la losa plana de antes. Datos:
     y            altura de la línea de aleros (la parte de arriba de las paredes)
     puntos       contorno en planta (local), como siempre; las cubiertas inclinadas usan su rectángulo orientado
     inclinacion  grados;  orientacion  grados (0: la cumbrera va a lo largo de X local; 90: de Z)
     espesor      grosor de la cubierta;  voladizo  lo que sale por fuera de las paredes (baja el alero para seguir la pendiente)
     cubierta     chapa | tejas | transparente | losa | lona (material de la cubierta) y color
     canaletas, cumbrera (sí/no), estructura (ninguna | postes | cerchas), alturaPostes, pretil (plano), dientes (industrial), lado (toldo)
   Las caras inclinadas son polígonos extruidos con una matriz local (`lm`): planos exactos que el exportador GLB ya entiende.
   Se crean desde una habitación, un edificio o una fundación (herramienta «Cubierta» o botón del inspector) y desde una pared (toldo). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, M4 = T.Matrix4, Q4 = T.Quaternion, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon;
  A.ICON.cubierta = '<path d="M2 13L12 5l10 8"/><path d="M5 11l7-5.5 7 5.5"/><path d="M6 13v7h12v-7"/>';
  const FORMAS = [['plano', 'Plano (azotea)'], ['una_pendiente', 'Una pendiente'], ['dos_aguas', 'Dos aguas'], ['cuatro_aguas', 'Cuatro aguas'], ['galpon', 'Galpón (chapa y cerchas)'], ['industrial', 'Industrial (diente de sierra)'], ['pergola', 'Pérgola'], ['toldo', 'Toldo'], ['cobertizo', 'Cobertizo']];
  const CUBIERTAS = [['chapa', 'Cubierta metálica (chapa)', '#a3abb2'], ['tejas', 'Tejas', '#b5562f'], ['transparente', 'Transparente (policarbonato)', '#cfe8f5'], ['losa', 'Losa de hormigón', '#9a9a9a'], ['lona', 'Lona', '#2f7d5a']];
  const DEF = {
    plano: { inclinacion: 0, espesor: 0.2, voladizo: 0, cubierta: 'losa', pretil: 0.6, canaletas: false, cumbrera: false, estructura: 'ninguna' },
    una_pendiente: { inclinacion: 15, espesor: 0.12, voladizo: 0.4, cubierta: 'chapa', canaletas: true, cumbrera: false, estructura: 'ninguna' },
    dos_aguas: { inclinacion: 30, espesor: 0.12, voladizo: 0.4, cubierta: 'tejas', canaletas: true, cumbrera: true, estructura: 'ninguna' },
    cuatro_aguas: { inclinacion: 25, espesor: 0.12, voladizo: 0.5, cubierta: 'tejas', canaletas: true, cumbrera: true, estructura: 'ninguna' },
    galpon: { inclinacion: 12, espesor: 0.06, voladizo: 0.3, cubierta: 'chapa', canaletas: true, cumbrera: true, estructura: 'cerchas' },
    industrial: { inclinacion: 25, espesor: 0.06, voladizo: 0.2, cubierta: 'chapa', canaletas: false, cumbrera: false, estructura: 'ninguna', dientes: 3 },
    pergola: { inclinacion: 0, espesor: 0.06, voladizo: 0.3, cubierta: 'madera', canaletas: false, cumbrera: false, estructura: 'postes', alturaPostes: 2.5 },
    toldo: { inclinacion: 18, espesor: 0.02, voladizo: 0, cubierta: 'lona', canaletas: false, cumbrera: false, estructura: 'ninguna' },
    cobertizo: { inclinacion: 10, espesor: 0.06, voladizo: 0.3, cubierta: 'chapa', canaletas: true, cumbrera: false, estructura: 'postes', alturaPostes: 2.4 }
  };
  const colorDe = c => (CUBIERTAS.find(x => x[0] === c) || [0, 0, c === 'madera' ? '#8f6d4b' : '#9a9a9a'])[2];
  const P = Object.assign({ forma: 'dos_aguas' }, DEF.dos_aguas); A.params.cubierta = P;

  /* ---------- utilidades de matrices ---------- */
  const rotY = a => new M4().makeRotationY(a), rotX = a => new M4().makeRotationX(a), rotZ = a => new M4().makeRotationZ(a), tras = (x, y, z) => new M4().makeTranslation(x, y, z);
  const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), new M4());
  const _p = new V3(), _q = new Q4(), _s = new V3();
  /* caja de medidas s en el marco Mf (centrada en p dentro de ese marco) */
  function caja(Mf, p, s, c, extra) { mul(Mf, tras(p[0], p[1], p[2])).decompose(_p, _q, _s); return Object.assign({ f: 'b', p: [_p.x, _p.y, _p.z], s: [Math.max(1e-3, s[0]), Math.max(1e-3, s[1]), Math.max(1e-3, s[2])], q: [_q.x, _q.y, _q.z, _q.w], c }, extra || {}); }
  function cil(Mf, p, d, h, c) { const b = caja(Mf, p, [d, h, d], c); b.f = 'c'; return b; }
  /* barra de sección d entre dos puntos del marco Mf */
  function barra(Mf, a, b, d, c) { const dir = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = dir.length() || 1e-3; const q = new Q4().setFromUnitVectors(new V3(0, 0, 1), dir.normalize()); mul(Mf, new M4().compose(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V3(1, 1, 1))).decompose(_p, _q, _s); return { f: 'b', p: [_p.x, _p.y, _p.z], s: [d, d, L], q: [_q.x, _q.y, _q.z, _q.w], c }; }
  /* polígono plano (pts [x, z] en su plano), extruido `g` hacia su +y, colocado con la matriz Mf */
  const poly = (Mf, pts, g, c, t) => ({ f: 'poly', pts: pts.map(([x, z]) => [r3(x), r3(z)]), y: 0, grosor: Math.max(0.005, g), c, t: !!t, lm: Mf.toArray() });
  /* faldón: alero a lo largo de X en z = zE y altura yE; sube hacia −z con ángulo a; giro extra gy alrededor de Y del marco */
  const marcoFaldon = (F, gy, zE, yE, a) => mul(F, rotY(gy), tras(0, yE, zE), rotX(a));
  /* polígono vertical en el plano x = xw (pts [z, h]) */
  const marcoHastial = (F, xw, g) => mul(F, tras(xw - g / 2, 0, 0), rotZ(-Math.PI / 2));
  const ptsHastial = pts => pts.map(([z, h]) => [-h, z]);
  /* polígono vertical en el plano z = zw (pts [x, h]) */
  const marcoFrente = (F, zw, g) => mul(F, tras(0, 0, zw - g / 2), rotX(Math.PI / 2));
  const ptsFrente = pts => pts.map(([x, h]) => [x, -h]);
  /* ancho del polígono convexo (pts [x, w]) en la fila w */
  function anchoEn(pts, w) { let a = Infinity, b = -Infinity; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if ((p[1] - w) * (q[1] - w) > 0 || p[1] === q[1]) { if (Math.abs(p[1] - w) < 1e-9) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); } continue; } const t = (w - p[1]) / (q[1] - p[1]), x = p[0] + t * (q[0] - p[0]); a = Math.min(a, x); b = Math.max(b, x); } return b > a ? [a, b] : null; }
  /* desfase de un polígono (miter) hacia fuera */
  function desfasar(pts, v) {
    if (!v) return pts.map(p => p.slice()); const n = pts.length, s = areaF(pts) > 0 ? 1 : -1, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
      const n1 = norm([(b[1] - a[1]) * s, -(b[0] - a[0]) * s]), n2 = norm([(c[1] - b[1]) * s, -(c[0] - b[0]) * s]); const m = norm([n1[0] + n2[0], n1[1] + n2[1]]); const k = Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]);
      out.push([b[0] - m[0] * v / k, b[1] - m[1] * v / k]);
    }
    return out;
  }
  const norm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  function areaF(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

  /* ---------- rectángulo orientado de la cubierta ---------- */
  function marco(e) {
    const or = (+e.orientacion || 0) * DEG, c = Math.cos(-or), s = Math.sin(-or);
    let pts = Array.isArray(e.puntos) && e.puntos.length >= 3 ? e.puntos : [[-(+e.sx || 4) / 2, -(+e.sz || 4) / 2], [(+e.sx || 4) / 2, -(+e.sz || 4) / 2], [(+e.sx || 4) / 2, (+e.sz || 4) / 2], [-(+e.sx || 4) / 2, (+e.sz || 4) / 2]];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { const fx = x * c + z * s, fz = -x * s + z * c; x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); z0 = Math.min(z0, fz); z1 = Math.max(z1, fz); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, co = Math.cos(or), so = Math.sin(or);
    const F = mul(tras(cx * co + cz * so, 0, -cx * so + cz * co), rotY(or));
    return { F, W: x1 - x0, D: z1 - z0, pts };
  }
  const val = (e, k) => e[k] != null && e[k] !== '' ? e[k] : (DEF[e.forma] || DEF.dos_aguas)[k];

  /* ---------- piezas ---------- */
  function partes(e, col) {
    if (window.OOCubiertasL && !e._ala) { const rL = OOCubiertasL.partes(e, col, partes); if (rL) return rL; } /* (2.1 pro f5) dos y cuatro aguas sobre contornos en L (cubiertas_l.js) */
    const forma = DEF[e.forma] ? e.forma : 'plano', out = [], ab = +e.abierto || 0; /* ab: extremo sin hastial ni faldón (−1: x = −W/2, 1: x = +W/2), lo usa cubiertas_l.js */
    const a = Math.max(0, Math.min(70, +val(e, 'inclinacion') || 0)) * DEG, g = Math.max(0.01, +val(e, 'espesor') || 0.1), v = Math.max(0, +val(e, 'voladizo') || 0);
    const cub = val(e, 'cubierta') || 'chapa', c = e.color || colorDe(cub), transp = cub === 'transparente', oscuro = (window.OO && OO.oscuro) ? OO.oscuro : (x => x);
    const cE = oscuro(c, 0.75), cMet = '#7d858c', cMad = '#7a5a3c';
    let { F, W, D, pts } = marco(e);
    if (forma === 'cuatro_aguas' && W < D && !e._ala) { e = Object.assign({}, e, { orientacion: (+e.orientacion || 0) + 90 }); ({ F, W, D } = marco(e)); }
    const Wv = W + 2 * v, Dv = D + 2 * v, ta = Math.tan(a), yE = -v * ta;
    const nervios = (Mf, ptsP, s) => { /* chapa: nervios a lo largo de la pendiente; tejas: hileras */
      if (cub === 'chapa') { const xs = ptsP.map(p => p[0]); const xa = Math.min(...xs), xb = Math.max(...xs); const n = Math.min(120, Math.floor((xb - xa) / 0.5)); for (let k = 1; k < n; k++) { const x = xa + k * (xb - xa) / n; const r = anchoEn(ptsP.map(([px, pz]) => [pz, px]), x); if (!r) continue; out.push(caja(Mf, [x, g + 0.012, (r[0] + r[1]) / 2], [0.03, 0.024, r[1] - r[0]], cE)); } }
      if (cub === 'tejas') { const n = Math.min(80, Math.floor(s / 0.33)); for (let k = 0; k < n; k++) { const w = -(k + 0.5) * s / n; const r = anchoEn(ptsP, w); if (!r) continue; out.push(caja(Mf, [(r[0] + r[1]) / 2, g + 0.02, w + 0.1], [r[1] - r[0], 0.04, 0.05], cE)); } }
    };
    const faldon = (gy, zE, ptsP, s) => { const Mf = marcoFaldon(F, gy, zE, yE, a); out.push(poly(Mf, ptsP, g, c, transp)); nervios(Mf, ptsP, s); return Mf; };
    const canaleta = (gy, zE, L) => { if (!val(e, 'canaletas')) return; const Mf = mul(F, rotY(gy)); out.push(caja(Mf, [0, yE - 0.05, zE + 0.06], [L, 0.1, 0.12], cMet)); };
    const hastiales = (ptsZH) => { for (const xw of [-W / 2, W / 2]) if (!ab || Math.sign(xw) !== ab) out.push(poly(marcoHastial(F, xw, 0.2), ptsHastial(ptsZH), 0.2, e.colorHastial || '#d9d4c8')); };
    const postes = (alto, filas) => { const h = Math.max(0.5, +alto || 2.5), n = Math.max(1, Math.ceil(W / 3)); for (const z of filas) for (let k = 0; k <= n; k++) { const x = -W / 2 + 0.1 + k * (W - 0.2) / n; out.push(caja(F, [x, -h / 2, z], [0.12, h, 0.12], cMad === c ? '#6b4f35' : (cub === 'chapa' ? cMet : cMad))); } };

    if (forma === 'plano') {
      const P2 = desfasar(pts, v); out.push({ f: 'poly', pts: P2.map(([x, z]) => [r3(x), r3(z)]), y: 0, grosor: g, c, t: transp, agujeros: e.agujeros_auto ? Object.values(e.agujeros_auto) : [] }); /* huecos de escalera */
      const pr = Math.max(0, +val(e, 'pretil') || 0);
      if (pr > 0.05) for (let i = 0; i < P2.length; i++) { const p = P2[i], q = P2[(i + 1) % P2.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.05) continue; const ang = Math.atan2(-(q[1] - p[1]), q[0] - p[0]); const m = norm([(q[1] - p[1]), -(q[0] - p[0])]), s = areaF(P2) > 0 ? 1 : -1; out.push(caja(rotY(ang), [0, 0, 0], [L + 0.15, pr, 0.15], e.colorPretil || '#d9d4c8', {})); const b = out[out.length - 1]; b.p = [(p[0] + q[0]) / 2 - m[0] * s * 0.075, g + pr / 2, (p[1] + q[1]) / 2 - m[1] * s * 0.075]; }
      return out;
    }
    if (forma === 'una_pendiente' || forma === 'cobertizo' || forma === 'toldo') {
      const s = Dv / Math.max(0.2, Math.cos(a)), Pp = [[-Wv / 2, 0], [Wv / 2, 0], [Wv / 2, -s], [-Wv / 2, -s]];
      if (forma === 'toldo') { /* franjas de lona de dos colores, faldón delantero y brazos */
        const n = Math.max(2, Math.round(Wv / 0.5)), c2 = e.color2 || '#f2efe6', yb = -Dv * ta, Mf = marcoFaldon(F, 0, Dv / 2, yb, a);
        for (let k = 0; k < n; k++) { const xa = -Wv / 2 + k * Wv / n, xb = xa + Wv / n; out.push(poly(Mf, [[xa, 0], [xb, 0], [xb, -s], [xa, -s]], g, k % 2 ? c2 : c)); out.push(poly(marcoFrente(F, Dv / 2, 0.01), ptsFrente([[xa, yb - 0.25], [xb, yb - 0.25], [xb, yb], [xa, yb]]), 0.01, k % 2 ? c2 : c)); }
        for (const x of [-Wv / 2 + 0.15, Wv / 2 - 0.15]) out.push(barra(F, [x, yb - 0.5, -Dv / 2], [x, yb - 0.02, Dv / 2 - 0.05], 0.04, cMet));
        out.push(barra(F, [-Wv / 2, yb - 0.03, Dv / 2 - 0.03], [Wv / 2, yb - 0.03, Dv / 2 - 0.03], 0.05, cMet));
        return out;
      }
      faldon(0, Dv / 2, Pp, s); canaleta(0, Dv / 2, Wv);
      if (forma === 'una_pendiente') hastiales([[D / 2, 0], [-D / 2, D * ta], [-D / 2, 0]]);
      if (forma === 'cobertizo' || val(e, 'estructura') === 'postes') { postes(val(e, 'alturaPostes'), [D / 2 - 0.1]); const h = D * ta; out.push(caja(F, [0, -0.1, D / 2 - 0.1], [W, 0.2, 0.15], cMad === c ? '#6b4f35' : cMet)); void h; }
      return out;
    }
    if (forma === 'dos_aguas' || forma === 'galpon') {
      const s = (Dv / 2) / Math.max(0.2, Math.cos(a)), Pp = [[-Wv / 2, 0], [Wv / 2, 0], [Wv / 2, -s], [-Wv / 2, -s]], hR = (D / 2) * ta;
      faldon(0, Dv / 2, Pp, s); faldon(Math.PI, Dv / 2, Pp, s); canaleta(0, Dv / 2, Wv); canaleta(Math.PI, Dv / 2, Wv);
      hastiales([[D / 2, 0], [0, hR], [-D / 2, 0]]);
      if (val(e, 'cumbrera')) out.push(caja(F, [0, hR + g / Math.max(0.2, Math.cos(a)) + 0.03, 0], [Wv, 0.08, 0.3], cE));
      if (val(e, 'estructura') === 'cerchas') { const n = Math.max(1, Math.round(W / 4.5)); for (let k = 0; k <= n; k++) { const x = -W / 2 + 0.15 + k * (W - 0.3) / n; out.push(caja(F, [x, -0.06, 0], [0.1, 0.12, D], cMet)); for (const sg of [1, -1]) out.push(caja(mul(F, tras(x, hR / 2 - 0.06, sg * D / 4), rotX(sg * a)), [0, 0, 0], [0.1, 0.12, (D / 2) / Math.cos(a)], cMet)); out.push(caja(F, [x, hR / 2 - 0.06, 0], [0.08, hR, 0.08], cMet)); for (const sg of [1, -1]) out.push(caja(mul(F, tras(x, hR / 4 - 0.06, sg * D / 8), rotX(-sg * Math.atan2(hR / 2, D / 4))), [0, 0, 0], [0.06, 0.08, Math.hypot(D / 4, hR / 2)], cMet)); } }
      if (val(e, 'estructura') === 'postes') postes(val(e, 'alturaPostes'), [D / 2 - 0.1, -D / 2 + 0.1]);
      return out;
    }
    if (forma === 'cuatro_aguas') {
      const s = (Dv / 2) / Math.max(0.2, Math.cos(a)), Lr = Math.max(0, Wv - Dv), hR = (D / 2) * ta;
      const trap = [[-Wv / 2, 0], [Wv / 2, 0], [Lr / 2, -s], [-Lr / 2, -s]], tri = [[-Dv / 2, 0], [Dv / 2, 0], [0, -s]];
      if (ab) { /* (2.1 pro f5) ala de una cubierta en L: un solo extremo con faldón */ const L1 = Wv - Dv / 2, t1 = ab > 0 ? [[-Wv / 2, 0], [Wv / 2, 0], [Wv / 2, -s], [-Wv / 2 + Dv / 2, -s]] : [[-Wv / 2, 0], [Wv / 2, 0], [Wv / 2 - Dv / 2, -s], [-Wv / 2, -s]], t2 = t1.map(([x, z]) => [-x, z]);
        faldon(0, Dv / 2, t1, s); faldon(Math.PI, Dv / 2, [t2[1], t2[0], t2[3], t2[2]], s); faldon(-ab * Math.PI / 2, Wv / 2, tri, s); canaleta(0, Dv / 2, Wv); canaleta(Math.PI, Dv / 2, Wv); canaleta(-ab * Math.PI / 2, Wv / 2, Dv);
        if (val(e, 'cumbrera') && L1 > 0.05) out.push(caja(F, [ab * (Dv / 4), hR + g / Math.max(0.2, Math.cos(a)) + 0.03, 0], [L1, 0.08, 0.3], cE));
        return out; }
      faldon(0, Dv / 2, trap, s); faldon(Math.PI, Dv / 2, trap, s); faldon(Math.PI / 2, Wv / 2, tri, s); faldon(-Math.PI / 2, Wv / 2, tri, s);
      canaleta(0, Dv / 2, Wv); canaleta(Math.PI, Dv / 2, Wv); canaleta(Math.PI / 2, Wv / 2, Dv); canaleta(-Math.PI / 2, Wv / 2, Dv);
      if (val(e, 'cumbrera') && Lr > 0.05) out.push(caja(F, [0, hR + g / Math.max(0.2, Math.cos(a)) + 0.03, 0], [Lr, 0.08, 0.3], cE));
      return out;
    }
    if (forma === 'industrial') {
      const n = Math.max(1, Math.min(12, Math.round(+val(e, 'dientes') || 3))), p = Dv / n, s = p / Math.max(0.2, Math.cos(a)), hT = p * ta;
      for (let k = 0; k < n; k++) {
        const zk = -Dv / 2 + k * p; /* diente k: sube de zk + p (bajo) a zk (alto) y cierra con vidrio vertical en zk */
        const Mf = marcoFaldon(F, 0, zk + p, yE + v * ta, a); const Pp = [[-Wv / 2, 0], [Wv / 2, 0], [Wv / 2, -s], [-Wv / 2, -s]];
        out.push(poly(Mf, Pp, g, c, transp)); nervios(Mf, Pp, s);
        out.push(poly(marcoFrente(F, zk, 0.03), ptsFrente([[-Wv / 2, 0], [Wv / 2, 0], [Wv / 2, hT], [-Wv / 2, hT]]), 0.03, '#9fd0ee', true));
        out.push(caja(F, [0, hT + 0.05, zk], [Wv, 0.1, 0.12], cMet));
      }
      return out;
    }
    if (forma === 'pergola') {
      const h = Math.max(0.5, +val(e, 'alturaPostes') || 2.5), cm = e.color || '#8f6d4b';
      for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) out.push(caja(F, [x, -h / 2, z], [0.15, h, 0.15], cm));
      const nx = Math.max(0, Math.floor(W / 3)); for (let k = 1; k <= nx; k++) for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) { const x = -W / 2 + k * W / (nx + 1); out.push(caja(F, [x, -h / 2, z], [0.15, h, 0.15], cm)); }
      for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) out.push(caja(F, [0, 0.1, z], [Wv, 0.2, 0.1], cm));
      const n = Math.min(80, Math.floor(Wv / 0.5)); for (let k = 0; k <= n; k++) { const x = -Wv / 2 + 0.05 + k * (Wv - 0.1) / n; out.push(caja(F, [x, 0.27, 0], [0.06, 0.14, Dv], cm)); }
      if (cub === 'lona' || cub === 'transparente') out.push(poly(F.clone().multiply(tras(0, 0.35, 0)), [[-Wv / 2, -Dv / 2], [Wv / 2, -Dv / 2], [Wv / 2, Dv / 2], [-Wv / 2, Dv / 2]], 0.01, cub === 'lona' ? (e.colorLona || '#e8e2d0') : '#cfe8f5', cub === 'transparente'));
      return out;
    }
    return out;
  }
  /* datos extra para la herramienta Techo de editor.js (forma elegida en «Cubierta») */
  function extra(pr) { return pr && pr.forma ? datosForma(pr.forma, pr) : null; }
  function datosForma(forma, base) { const d = Object.assign({ forma }, DEF[forma] || {}); for (const k in d) if (base && base[k] != null && k !== 'forma') d[k] = base[k]; d.color = (base && base.colorCub) || colorDe(d.cubierta); return d; }

  /* ---------- crear ---------- */
  const nv = () => E.nuevos();
  function ptsLocales(ptsMundo, cx, cz) { return ptsMundo.map(([x, z]) => [r3(x - cx), r3(z - cz)]); }
  function caja2(pts) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { sx: x1 - x0, sz: z1 - z0 }; }
  /* crea una cubierta sobre una habitación, un edificio (fundación con plantas) o una fundación */
  function crearDesde(id, forma, opts) {
    opts = opts || {}; const o = nv().get(id); if (!o) return null; const b = tb(o.tipo); forma = forma || P.forma;
    let d;
    if (b === 'habitacion') { const od = o.datos, cb = caja2(od.puntos || []); d = { x: od.x, y: r3((+od.y || 0) + (+od.alto || 2.6)), z: od.z, giroY: od.giroY || 0, puntos: clon(od.puntos), sx: cb.sx, sz: cb.sz, de_habitacion: o.id }; if (od.nivel) { d.nivel = od.nivel; d.edificio = od.edificio; } }
    else if (b === 'fundacion') {
      const hu = window.OOFundaciones ? OOFundaciones.huella(o.datos) : []; if (hu.length < 3) return null; const [cx, cz] = A.centroide(hu); let y;
      if (window.OONiveles && Array.isArray(o.datos.niveles) && o.datos.niveles.length) { const pl = OONiveles.plantas(o.id).filter(p => !p.azotea && !p.sotano), top = pl[pl.length - 1]; y = OONiveles.yPlanta(o.id, top.id) + top.altura; d = { nivel: top.id, edificio: o.id }; }
      else { y = OOAnclajes.tope('fundacion', o.datos) + (+opts.alto || 3); d = {}; }
      const cb = caja2(hu); Object.assign(d, { x: r3(cx), y: r3(y), z: r3(cz), giroY: 0, puntos: ptsLocales(hu, cx, cz), sx: cb.sx, sz: cb.sz, soporte: { tipo: 'fundacion', id: o.id, manual: true } });
    } else return null;
    const cb = caja2(d.puntos); const df = datosForma(forma, Object.assign({}, P.forma === forma ? P : {}, opts)); /* los valores de la herramienta solo valen para su forma */ if (opts.orientacion == null && P.orientacionAuto !== false) df.orientacion = cb.sx >= cb.sz ? 0 : 90;
    Object.assign(d, df, { grosor: df.espesor, sy: df.espesor, material: df.cubierta === 'chapa' ? 'chapa' : df.cubierta === 'tejas' ? 'ladrillo' : 'concreto' }, opts.datos || {});
    const nid = A.crearNuevo('techo', d, { props: { nombre: 'Cubierta ' + (FORMAS.find(f => f[0] === forma) || [0, forma])[1].toLowerCase() } }, { etiqueta: 'Crear cubierta' });
    if (nid) A.pista('Cubierta ' + (FORMAS.find(f => f[0] === forma) || [0, forma])[1].toLowerCase() + ' a ' + A.fmt(d.y) + ' m.');
    return nid;
  }
  /* toldo en una cara de una pared */
  function crearToldo(muroId, opts) {
    opts = opts || {}; const w = nv().get(muroId); if (!w || tb(w.tipo) !== 'muro') return null; const wd = w.datos, gw = (+wd.giroY || 0) * DEG;
    const salida = Math.max(0.5, +opts.salida || 1.5), ancho = Math.min(+wd.sx || 3, Math.max(0.5, +opts.ancho || (+wd.sx || 3))), lado = opts.lado === 'B' ? -1 : 1, alt = +opts.altura || Math.min(2.6, (+wd.sy || 2.6) - 0.2);
    const off = lado * ((+wd.sz || 0.2) / 2 + salida / 2), cx = (+wd.x || 0) + Math.sin(gw) * off, cz = (+wd.z || 0) + Math.cos(gw) * off;
    const pts = [[-ancho / 2, -salida / 2], [ancho / 2, -salida / 2], [ancho / 2, salida / 2], [-ancho / 2, salida / 2]];
    const df = datosForma('toldo', Object.assign({}, opts));
    const d = Object.assign({ x: r3(cx), y: r3((+wd.y || 0) + alt), z: r3(cz), giroY: r3(((+wd.giroY || 0) + (lado < 0 ? 180 : 0))), puntos: pts, sx: ancho, sz: salida, soporte: { tipo: 'pared', id: muroId, manual: true }, lado: lado < 0 ? 'B' : 'A' }, df, { orientacion: 0, grosor: df.espesor, sy: df.espesor });
    if (wd.nivel) { d.nivel = wd.nivel; d.edificio = wd.edificio; }
    return A.crearNuevo('techo', d, { props: { nombre: 'Toldo' } }, { etiqueta: 'Crear toldo' });
  }
  function cambiar(id, cambios, etiqueta) {
    const o = nv().get(id); if (!o) return false; const v = o.datos; o.datos = Object.assign({}, v, cambios);
    if (cambios.forma && cambios.forma !== v.forma) { const df = DEF[cambios.forma] || {}; for (const k in df) if (!(k in cambios)) o.datos[k] = df[k]; if (!('color' in cambios)) o.datos.color = colorDe(o.datos.cubierta); }
    if (cambios.cubierta && !('color' in cambios)) o.datos.color = colorDe(cambios.cubierta);
    if (cambios.espesor != null) { o.datos.grosor = cambios.espesor; o.datos.sy = cambios.espesor; }
    const doc = A.docActualizado(o); o.datos = v; if (!doc) return false; A.guardar([doc], { etiqueta: etiqueta || 'Cambiar cubierta' }); return true;
  }

  /* ---------- herramienta «Cubierta» ---------- */
  E.agregarHerramientaPropia('cubierta', {
    n: 'Cubierta', ic: 'cubierta', pista: 'Clic en una habitación, un edificio o una fundación para ponerle la cubierta elegida. Clic en una pared para un toldo (forma Toldo).',
    opciones: it => { if (it.forma) { Object.assign(P, DEF[it.forma], { forma: it.forma }); } },
    up: (e, mov) => {
      if (mov > 6) return; const h = A.pickEvento(e); let o = h && h.key[0] === 'n' ? nv().get(h.key.slice(1)) : null;
      if (P.forma === 'toldo') { if (o && tb(o.tipo) === 'muro') { const id = crearToldo(o.id, P); if (id) A.seleccionar(['n' + id]); } else A.pista('Haz clic en una pared para ponerle el toldo.'); return; }
      if (o && tb(o.tipo) === 'muro') o = null;
      if (!o || !['habitacion', 'fundacion'].includes(tb(o.tipo))) { const p = A.puntoPlano(e, A.planoTrabajo); if (p) o = [...nv().values()].find(x => tb(x.tipo) === 'habitacion' && !x.datos.suelo && A.dentroPoligono(p.x, p.z, A.puntosMundoHab(x))) || [...nv().values()].find(x => tb(x.tipo) === 'fundacion' && A.dentroPoligono(p.x, p.z, OOFundaciones.huella(x.datos))); }
      if (!o) { A.pista('Haz clic dentro de una habitación, un edificio o una fundación.'); return; }
      const id = crearDesde(o.id, P.forma); if (id) A.seleccionar(['n' + id], { sinTab: true });
    },
    panel: () => `<div class="campos">${opc('tp', 'forma', 'Forma', P.forma, FORMAS)}${num('tp', 'inclinacion', 'Inclinación (°)', P.inclinacion)}${num('tp', 'voladizo', 'Voladizo (m)', P.voladizo)}${num('tp', 'espesor', 'Espesor (m)', P.espesor)}${opc('tp', 'cubierta', 'Cubierta', P.cubierta, CUBIERTAS.map(x => [x[0], x[1]]).concat([['madera', 'Madera']]))}</div>`
  });
  const num = (a, k, l, v, st) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.05}" data-${a}="${k}" value="${r3(+v || 0)}"></label>`;
  const opc = (a, k, l, v, lista) => `<label class="campo ancho"><span>${l}</span><select data-${a}="${k}">${lista.map(([x, n]) => `<option value="${A.esc(x)}"${String(v) === String(x) ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label>`;
  const chk = (a, k, l, v) => `<label class="chk"><input type="checkbox" data-${a}="${k}"${v ? ' checked' : ''}> ${A.esc(l)}</label>`;
  for (const [f, n] of FORMAS) E.agregarHerramienta('construir', { h: 'cubierta', forma: f, n: 'Cubierta: ' + n.toLowerCase(), ic: 'cubierta' });

  /* ---------- inspector ---------- */
  function selTecho() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = nv().get(A.sel[0].slice(1)); return o && tb(o.tipo) === 'techo' ? o : null; }
  function selBase() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = nv().get(A.sel[0].slice(1)); return o && (tb(o.tipo) === 'habitacion' || tb(o.tipo) === 'fundacion' || tb(o.tipo) === 'muro') ? o : null; }
  function htmlInspector(o) {
    const d = o.datos, f = d.forma || '', e = Object.assign({}, DEF[f] || {}, d);
    const comunes = f ? `${num('tc', 'inclinacion', 'Inclinación (°)', e.inclinacion, 1)}${num('tc', 'orientacion', 'Orientación (°)', e.orientacion || 0, 15)}${num('tc', 'espesor', 'Espesor (m)', e.espesor)}${num('tc', 'voladizo', 'Voladizo (m)', e.voladizo)}
      ${opc('tc', 'cubierta', 'Cubierta', e.cubierta, CUBIERTAS.map(x => [x[0], x[1]]).concat([['madera', 'Madera']]))}<label class="campo"><span>Color</span><input type="color" data-tc="color" value="${A.esc(d.color || colorDe(e.cubierta))}"></label>
      ${chk('tc', 'canaletas', 'Canaletas', e.canaletas)}${chk('tc', 'cumbrera', 'Cumbrera', e.cumbrera)}
      ${opc('tc', 'estructura', 'Estructura de soporte', e.estructura || 'ninguna', [['ninguna', 'Ninguna (sobre las paredes)'], ['postes', 'Postes'], ['cerchas', 'Cerchas']])}
      ${['pergola', 'cobertizo'].includes(f) || e.estructura === 'postes' ? num('tc', 'alturaPostes', 'Altura de los postes (m)', e.alturaPostes || 2.5) : ''}${f === 'plano' ? num('tc', 'pretil', 'Pretil (m)', e.pretil) : ''}${f === 'industrial' ? num('tc', 'dientes', 'Dientes', e.dientes, 1) : ''}
      <div class="fila"><button data-tc-a="girar">Girar la cumbrera 90°</button></div>` : '<p class="ayuda">Losa plana simple. Elige una forma para convertirla en cubierta paramétrica.</p>';
    return `<details class="sec" open data-sec="cubierta"><summary>Cubierta</summary><div class="campos">${opc('tc', 'forma', 'Forma', f, [['', 'Losa simple (como antes)']].concat(FORMAS))}${comunes}
      <p class="ayuda">Altura de los aleros: ${A.fmt(+d.y || 0)} m (Posición Y). Si es el techo de una habitación, sube con su alto.</p></div></details>`;
  }
  E.on('panel', () => {
    const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return; const o = selTecho(), b = selBase();
    const div = document.createElement('div');
    if (o) div.innerHTML = htmlInspector(o);
    else if (b) div.innerHTML = `<details class="sec" data-sec="cubierta-crear"><summary>${tb(b.tipo) === 'muro' ? 'Toldo' : 'Cubierta'}</summary><div class="campos">${tb(b.tipo) === 'muro' ? '<div class="fila"><button data-tc-a="toldo">Poner un toldo en esta pared</button></div>' : `${opc('tcn', 'forma', 'Forma', P.forma, FORMAS.filter(x => x[0] !== 'toldo'))}<div class="fila"><button data-tc-a="crear" class="prim">Poner cubierta</button></div>`}</div></details>`;
    else return;
    const ref = c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.tp) { const k = el.dataset.tp; const v = el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; if (k === 'forma') Object.assign(P, DEF[v], { forma: v }); else P[k] = v; A.renderPanel(); return; }
    if (el.dataset.tcn) { P.forma = el.value; Object.assign(P, DEF[el.value]); return; }
    if (el.dataset.tc) { const o = selTecho(); if (!o) return; const k = el.dataset.tc; let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return; if (k === 'forma' && !v) { const x = clon(o.datos); delete x.forma; const vv = o.datos; o.datos = x; const doc = A.docActualizado(o); o.datos = vv; if (doc) A.guardar([doc], { etiqueta: 'Cubierta plana simple' }); return; } cambiar(o.id, { [k]: v }); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-tc-a]'); if (!b) return; const k = b.dataset.tcA;
    if (k === 'girar') { const o = selTecho(); if (o) cambiar(o.id, { orientacion: ((+o.datos.orientacion || 0) + 90) % 360 }, 'Girar cumbrera'); }
    if (k === 'crear') { const o = selBase(); if (o) { const id = crearDesde(o.id, P.forma); if (id) A.seleccionar(['n' + id]); } }
    if (k === 'toldo') { const o = selBase(); if (o) { const id = crearToldo(o.id, {}); if (id) A.seleccionar(['n' + id]); } }
  });

  window.OOTechos = { partes, extra, datosForma, crearDesde, crearToldo, cambiar, marco, FORMAS, CUBIERTAS, DEF, params: P };
})();
