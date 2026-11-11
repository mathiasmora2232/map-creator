/* Editor del mapa (2.1, Map Editor Pro fase 5): cubiertas a dos y cuatro aguas sobre contornos en L.
   techos.js llama a OOCubiertasL.partes(e) antes de usar el rectángulo orientado. Si el contorno (`puntos`) es una L ortogonal (6 vértices,
   lados en dos direcciones perpendiculares, en cualquier giro), la cubierta se hace con dos alas:
   - el ala más ancha pasa entera (con sus dos hastiales o sus dos faldones de cadera);
   - la otra empieza en la cumbrera de la primera (sin hastial ni faldón en ese extremo: `abierto`) y llega hasta su final.
   Con la misma pendiente las dos alas se cortan en una limahoya exacta: cada cara es un plano completo (polígono con matriz local, como el
   resto de cubiertas), así que el GLB lleva geometría correcta y el plano 2D la entiende. Cualquier otro contorno sigue con el rectángulo.
   API: OOCubiertasL.analizar(puntos) → {alas, theta} | null, partes(e, col, partesBase). */
(function () {
  'use strict';
  const FORMAS = ['dos_aguas', 'cuatro_aguas', 'galpon'];
  const DEG = Math.PI / 180;
  function limpiar(pts) {
    let L = pts.map(p => [+p[0], +p[1]]).filter((p, i, a) => { const q = a[(i + a.length - 1) % a.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
    let cambio = true; while (cambio && L.length > 3) { cambio = false; for (let i = 0; i < L.length; i++) { const a = L[(i + L.length - 1) % L.length], b = L[i], c = L[(i + 1) % L.length]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-6) { L.splice(i, 1); cambio = true; break; } } }
    return L;
  }
  /* devuelve las dos alas en el marco (u, w) girado theta respecto a los ejes locales */
  function analizar(puntos) {
    if (!Array.isArray(puntos) || puntos.length < 6) return null; const P = limpiar(puntos); if (P.length !== 6) return null;
    const th = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]), c = Math.cos(th), s = Math.sin(th);
    const Q = P.map(([x, z]) => [x * c + z * s, -x * s + z * c]), tol = 1e-3 * Math.max(1, ...Q.map(q => Math.abs(q[0]) + Math.abs(q[1])));
    for (let i = 0; i < 6; i++) { const a = Q[i], b = Q[(i + 1) % 6]; if (Math.abs(a[0] - b[0]) > tol && Math.abs(a[1] - b[1]) > tol) return null; }
    const us = Q.map(q => q[0]), ws = Q.map(q => q[1]), u0 = Math.min(...us), u1 = Math.max(...us), w0 = Math.min(...ws), w1 = Math.max(...ws);
    const cerca = (a, b) => Math.abs(a - b) < tol;
    const esq = [[u0, w0], [u1, w0], [u1, w1], [u0, w1]], falta = esq.filter(e => !Q.some(q => cerca(q[0], e[0]) && cerca(q[1], e[1])));
    const interior = Q.filter(q => !cerca(q[0], u0) && !cerca(q[0], u1) && !cerca(q[1], w0) && !cerca(q[1], w1));
    if (falta.length !== 1 || interior.length !== 1) return null;
    const [cu, cw] = falta[0], [un, wn] = interior[0];
    const A = { u: [u0, u1], w: cerca(cw, w1) ? [w0, wn] : [wn, w1], largo: 'u' }; /* ala a lo largo de u */
    const B = { u: cerca(cu, u1) ? [u0, un] : [un, u1], w: [w0, w1], largo: 'w' };   /* ala a lo largo de w */
    const anchoA = A.w[1] - A.w[0], anchoB = B.u[1] - B.u[0];
    return { theta: th, A, B, pasa: anchoA >= anchoB ? 'A' : 'B', cu, cw };
  }
  function rect(th, u, w) { const c = Math.cos(th), s = Math.sin(th); return [[u[0], w[0]], [u[1], w[0]], [u[1], w[1]], [u[0], w[1]]].map(([a, b]) => [a * c - b * s, a * s + b * c]); }
  function partes(e, col, base) {
    if (!FORMAS.includes(e.forma) || e.lsimple) return null; const L = analizar(e.puntos); if (!L) return null;
    const th = L.theta, v = Math.max(0, +(e.voladizo != null && e.voladizo !== '' ? e.voladizo : 0.4) || 0);
    const pasa = L.pasa === 'A' ? L.A : L.B, otra = L.pasa === 'A' ? L.B : L.A;
    /* el ala que no pasa empieza en la cumbrera de la que pasa (retrasada el voladizo, para que su faldón acabe justo en la cumbrera) */
    const ejeO = otra.largo, rangoO = otra[ejeO].slice(), mid = (pasa[ejeO][0] + pasa[ejeO][1]) / 2;
    const lejos = Math.abs(rangoO[0] - mid) > Math.abs(rangoO[1] - mid) ? rangoO[0] : rangoO[1], dir = Math.sign(lejos - mid) || 1;
    const inicio = mid + dir * Math.min(v, Math.abs(lejos - mid) * 0.9), corta = Object.assign({}, otra); corta[ejeO] = [Math.min(inicio, lejos), Math.max(inicio, lejos)];
    const ala = (r, abierto) => { const oriG = -(th / DEG) - (r.largo === 'w' ? 90 : 0); return base(Object.assign({}, e, { _ala: true, puntos: rect(th, r.u, r.w), orientacion: oriG, abierto }), col); };
    /* el extremo abierto es el que mira a la cumbrera: −1 si queda en el lado negativo del eje de la cumbrera */
    return ala(pasa, 0).concat(ala(corta, dir > 0 ? -1 : 1));
  }
  window.OOCubiertasL = { analizar, partes, rect };
})();
