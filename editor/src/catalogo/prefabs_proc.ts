/* Editor del mapa (2.1, Map Editor Pro fase 4): prefabs procedurales paramétricos (§8 de la especificación).
   Tipo de objeto «proc:<clave>»: las piezas salen de un generador con parámetros guardados en `datos` (largo, ancho, alto, carriles,
   plazas, forma de la copa…). Cada generador declara sus parámetros (para el inspector y para colocar), sus variantes (medidas,
   colores y materiales) y qué medidas de la caja (`sx`, `sy`, `sz`) son parámetros: estirar un objeto con el gizmo cambia ese
   parámetro (una carretera más larga sigue teniendo las rayas cada 9 m) y lo demás se escala.
   Familias: construcción, urbanismo, industrial, vegetación y primitivas. Los edificios (que usan fundaciones, paredes, puertas,
   ventanas, cubiertas y escaleras de verdad) están en kits_edificios.js.
   Convención de catalogo.js: y = 0 en el suelo, frente hacia +Z, largo en X. Medidas en metros.
   Se carga antes que editor.js porque envuelve OO.construir. También deja utilidades de piezas en window.OOPiezas. */
(function () {
  'use strict';
  const OO = window.OO, T = window.THREE; if (!OO || !T) return;
  const { OBJ, ITEMS, CATEGORIAS, oscuro } = OO;
  const PI = Math.PI, V3 = T.Vector3, M4 = T.Matrix4, Q4 = T.Quaternion;
  const r3 = (v?) => Math.round(v * 1000) / 1000;

  /* ===================== piezas ===================== */
  const B = (x?, y?, z?, sx?, sy?, sz?, c?, o?) => Object.assign({ f: 'b', p: [x, y, z], s: [sx, sy, sz], c }, o || {});
  const Cy = (x?, y?, z?, d?, h?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, h, d], c }, o || {});
  const CyX = (x?, y?, z?, d?, l?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, l, d], c, r: [0, 0, PI / 2] }, o || {});
  const CyZ = (x?, y?, z?, d?, l?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, l, d], c, r: [PI / 2, 0, 0] }, o || {});
  const Sp = (x?, y?, z?, sx?, sy?, sz?, c?, o?) => Object.assign({ f: 's', p: [x, y, z], s: [sx, sy, sz], c }, o || {});
  const Lz = (x?, y?, z?, d?, c?) => ({ f: 'l', p: [x, y, z], s: [d, d, d], c });
  const Txt = (texto?, x?, y?, z?, w?, h?, bg?, fg?, o?) => Object.assign({ f: 't', texto, p: [x, y, z], w, h, bg, fg }, o || {});
  /* polígono en planta (pts [x, z]) extruido hacia arriba desde y */
  const poly = (pts?, y?, g?, c?, o?) => Object.assign({ f: 'poly', pts: pts.map(([x, z]) => [r3(x), r3(z)]), y: y || 0, grosor: Math.max(0.003, g), c }, o || {});
  /* polígono con matriz local (planos verticales o inclinados) */
  const polyM = (M?, pts?, g?, c?, o?) => Object.assign({ f: 'poly', pts: pts.map(([x, z]) => [r3(x), r3(z)]), y: 0, grosor: Math.max(0.003, g), c, lm: M.toArray() }, o || {});
  /* perfil vertical en el plano XY (pts [x, y]) extruido a lo largo de +Z desde z0 */
  const perfilZ = (pts?, z0?, g?, c?, o?) => polyM(new M4().makeTranslation(0, 0, z0).multiply(new M4().makeRotationX(PI / 2)), pts.map(([x, y]) => [x, -y]), g, c, o);
  /* perfil vertical en el plano ZY (pts [z, y]) extruido a lo largo de +X desde x0 */
  const perfilX = (pts?, x0?, g?, c?, o?) => polyM(new M4().makeTranslation(x0, 0, 0).multiply(new M4().makeRotationY(PI / 2)).multiply(new M4().makeRotationX(PI / 2)), pts.map(([z, y]) => [-z, -y]), g, c, o);
  /* cara plana a partir de puntos 3D (polígono plano), con grosor hacia dentro (−normal) */
  function caraPoly(p3?, g?, c?, o?) {
    const P = p3.map((p?) => new V3(p[0], p[1], p[2])), n = new V3();
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
    n.normalize(); const X = P[1].clone().sub(P[0]).normalize(), Y = n.clone().negate(), Z = new V3().crossVectors(X, Y).normalize();
    const M = new M4().makeBasis(X, Y, Z).setPosition(P[0]);
    const pts = P.map((p?) => { const d = p.clone().sub(P[0]); return [d.dot(X), d.dot(Z)]; });
    return polyM(M, pts, g || 0.01, c, o);
  }
  /* barra (caja de sección d) entre dos puntos */
  function barra(a?, b?, d?, c?, o?) { const dir = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = dir.length() || 1e-3; const q = new Q4().setFromUnitVectors(new V3(0, 0, 1), dir.normalize()); return Object.assign({ f: 'b', p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [d, d, L], q: [q.x, q.y, q.z, q.w], c }, o || {}); }
  function tubo(a?, b?, d?, c?, o?) { const dir = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = dir.length() || 1e-3; const q = new Q4().setFromUnitVectors(new V3(0, 1, 0), dir.normalize()); return Object.assign({ f: 'c', p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [d, L, d], q: [q.x, q.y, q.z, q.w], c }, o || {}); }
  const quat = (pt?) => { const q = new Q4(); if (pt.q) q.fromArray(pt.q).normalize(); else if (pt.r) q.setFromEuler(new T.Euler(pt.r[0], pt.r[1], pt.r[2])); return q; };
  /* aplica una matriz a todas las piezas (giro + traslado; con escala si se pide) */
  function transformar(parts?, M?) {
    const _p = new V3(), _q = new Q4(), _s = new V3(), m = new M4();
    return parts.map((pt0?) => {
      const pt = Object.assign({}, pt0);
      if (pt.f === 'poly') { const L = pt.lm ? new M4().fromArray(pt.lm) : new M4(); if (pt.y) { L.multiply(new M4().makeTranslation(0, pt.y, 0)); pt.y = 0; } pt.lm = M.clone().multiply(L).toArray(); return pt; }
      if (pt.f === 't') { m.compose(new V3().fromArray(pt.p), quat(pt), new V3(1, 1, 1)); m.premultiply(M).decompose(_p, _q, _s); pt.p = [_p.x, _p.y, _p.z]; pt.q = [_q.x, _q.y, _q.z, _q.w]; delete pt.r; pt.w *= _s.x; pt.h *= _s.y; return pt; }
      m.compose(new V3().fromArray(pt.p), quat(pt), new V3(Math.abs(pt.s[0]) || 1e-4, Math.abs(pt.s[1]) || 1e-4, Math.abs(pt.s[2]) || 1e-4)); m.premultiply(M).decompose(_p, _q, _s);
      pt.p = [_p.x, _p.y, _p.z]; pt.s = [_s.x, _s.y, _s.z]; pt.q = [_q.x, _q.y, _q.z, _q.w]; delete pt.r; return pt;
    });
  }
  const mover = (parts?, dx?, dy?, dz?) => transformar(parts, new M4().makeTranslation(dx, dy, dz));
  const girarY = (parts?, ang?, dx?, dz?) => transformar(parts, new M4().makeTranslation(dx || 0, 0, dz || 0).multiply(new M4().makeRotationY(ang)));
  /* caja que ocupan las piezas (coordenadas locales del objeto) */
  function caja(parts?) {
    const bb = new T.Box3(), v = new V3(), m = new M4();
    for (const pt of parts) {
      if (pt.oculta && pt.ayuda) continue;
      if (pt.f === 'poly') { const L = pt.lm ? new M4().fromArray(pt.lm) : new M4(); const y0 = pt.y || 0, g = pt.grosor || 0.03; for (const [x, z] of pt.pts || []) for (const yy of [y0, y0 + g]) bb.expandByPoint(v.set(x, yy, z).applyMatrix4(L)); continue; }
      if (pt.f === 't') { bb.expandByPoint(v.fromArray(pt.p)); continue; }
      m.compose(v.fromArray(pt.p), quat(pt), new V3(Math.abs(pt.s[0]), Math.abs(pt.s[1]), Math.abs(pt.s[2]))); const el = m.elements;
      const hx = 0.5 * (Math.abs(el[0]) + Math.abs(el[4]) + Math.abs(el[8])), hy = 0.5 * (Math.abs(el[1]) + Math.abs(el[5]) + Math.abs(el[9])), hz = 0.5 * (Math.abs(el[2]) + Math.abs(el[6]) + Math.abs(el[10]));
      bb.expandByPoint(v.set(el[12] - hx, el[13] - hy, el[14] - hz)); bb.expandByPoint(v.set(el[12] + hx, el[13] + hy, el[14] + hz));
    }
    return bb;
  }
  function escalarPartes(parts?, kx?, ky?, kz?) { if (Math.abs(kx - 1) < 1e-6 && Math.abs(ky - 1) < 1e-6 && Math.abs(kz - 1) < 1e-6) return parts; return transformar(parts, new M4().makeScale(kx, ky, kz)); }
  const circulo = (r?, n?, a0?, a1?) => { const out = []; n = n || 24; a0 = a0 || 0; a1 = a1 == null ? 2 * PI : a1; const cerrado = Math.abs(a1 - a0 - 2 * PI) < 1e-6; const m = cerrado ? n : n + 1; for (let i = 0; i < m; i++) { const a = a0 + (a1 - a0) * i / n; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
  const hash = (k?, s?) => { let h = Math.imul((k | 0) + 0x9e37, 2654435761) ^ Math.imul((s | 0) + 7, 1597334677); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

  /* ===================== generadores ===================== */
  const BL = '#f2f2f2', AM = '#e8b923', NEG = '#1e2124', ACERO = '#b8bcc0', HORM = '#c4c0b7', ASF = '#4b4e52';
  const DEFS = {};
  /* def(clave, {n, cat, def, campos, variantes, ejes, partes}) */
  const def = (k?, o?) => { DEFS[k] = o; };
  const num = (k?, n?, mn?, mx?, st?) => [k, n, 'n', mn, mx, st || 0.05];
  const sel = (k?, n?, ops?) => [k, n, 's', ops];
  const col = (k?, n?) => [k, n || 'Color', 'c'];
  const chk = (k?, n?) => [k, n, 'b'];
  const txt = (k?, n?) => [k, n, 't'];

  /* ---------- construcción ---------- */
  def('columna_cuadrada', { n: 'Columna cuadrada', cat: 'estructura', def: { lado: 0.3, alto: 3, basa: true, capitel: true, color: HORM },
    campos: [num('lado', 'Lado (m)', 0.1, 2), num('alto', 'Alto (m)', 0.3, 20), chk('basa', 'Basa'), chk('capitel', 'Capitel'), col('color')], ejes: { sy: 'alto' },
    variantes: [['Hormigón 30 cm', { lado: 0.3, color: HORM }], ['Hormigón 40 cm lisa', { lado: 0.4, basa: false, capitel: false }], ['Ladrillo 35 cm', { lado: 0.35, color: '#a5553a', basa: false }], ['Pintada blanca', { lado: 0.3, color: '#ecebe4' }]],
    partes: (p?) => { const a = [B(0, p.alto / 2, 0, p.lado, p.alto, p.lado, p.color)], k = oscuro(p.color, 0.88); if (p.basa) a.push(B(0, 0.06, 0, p.lado + 0.1, 0.12, p.lado + 0.1, k)); if (p.capitel) a.push(B(0, p.alto - 0.07, 0, p.lado + 0.08, 0.14, p.lado + 0.08, k)); return a; } });
  def('columna_redonda', { n: 'Columna redonda', cat: 'estructura', def: { diametro: 0.35, alto: 3, basa: true, capitel: true, color: HORM },
    campos: [num('diametro', 'Diámetro (m)', 0.1, 2), num('alto', 'Alto (m)', 0.3, 20), chk('basa', 'Basa'), chk('capitel', 'Capitel'), col('color')], ejes: { sy: 'alto' },
    variantes: [['Hormigón 35 cm', { diametro: 0.35 }], ['Hormigón 50 cm', { diametro: 0.5 }], ['Tubo de acero 20 cm', { diametro: 0.2, basa: false, capitel: false, color: '#7d858c' }], ['Clásica blanca', { diametro: 0.4, color: '#ecebe4' }]],
    partes: (p?) => { const a = [Cy(0, p.alto / 2, 0, p.diametro, p.alto, p.color)], k = oscuro(p.color, 0.88); if (p.basa) a.push(B(0, 0.06, 0, p.diametro + 0.12, 0.12, p.diametro + 0.12, k), Cy(0, 0.15, 0, p.diametro + 0.06, 0.06, k)); if (p.capitel) a.push(Cy(0, p.alto - 0.16, 0, p.diametro + 0.05, 0.06, k), B(0, p.alto - 0.06, 0, p.diametro + 0.12, 0.12, p.diametro + 0.12, k)); return a; } });
  def('viga', { n: 'Viga', cat: 'estructura', def: { largo: 4, canto: 0.4, ancho: 0.2, perfil: 'rect', color: HORM },
    campos: [num('largo', 'Largo (m)', 0.3, 40), num('canto', 'Canto (m)', 0.1, 2), num('ancho', 'Ancho (m)', 0.05, 1.5), sel('perfil', 'Perfil', [['rect', 'Rectangular (hormigón)'], ['I', 'Perfil I (acero)'], ['madera', 'Madera']]), col('color')], ejes: { sx: 'largo', sy: 'canto', sz: 'ancho' },
    variantes: [['Hormigón 20 × 40', { perfil: 'rect', canto: 0.4, ancho: 0.2, color: HORM }], ['Acero IPE 300', { perfil: 'I', canto: 0.3, ancho: 0.15, color: '#5d666d' }], ['Madera 15 × 25', { perfil: 'madera', canto: 0.25, ancho: 0.15, color: '#9a7650' }]],
    partes: (p?) => { if (p.perfil !== 'I') return [B(0, p.canto / 2, 0, p.largo, p.canto, p.ancho, p.color)]; const ta = Math.max(0.01, p.canto * 0.07), tw = Math.max(0.006, p.ancho * 0.07); return [B(0, ta / 2, 0, p.largo, ta, p.ancho, p.color), B(0, p.canto - ta / 2, 0, p.largo, ta, p.ancho, p.color), B(0, p.canto / 2, 0, p.largo, p.canto - 2 * ta, tw, p.color)]; } });
  def('losa', { n: 'Losa', cat: 'estructura', def: { largo: 4, ancho: 4, espesor: 0.2, color: '#b9b6ae' },
    campos: [num('largo', 'Largo (m)', 0.3, 60), num('ancho', 'Ancho (m)', 0.3, 60), num('espesor', 'Espesor (m)', 0.03, 1.5), col('color')], ejes: { sx: 'largo', sy: 'espesor', sz: 'ancho' },
    variantes: [['Hormigón 20 cm', {}], ['Placa delgada 10 cm', { espesor: 0.1 }], ['Losa gruesa 40 cm', { espesor: 0.4, color: '#a9a59c' }]],
    partes: (p?) => [B(0, p.espesor / 2, 0, p.largo, p.espesor, p.ancho, p.color)] });
  def('marquesina', { n: 'Marquesina', cat: 'estructura', def: { ancho: 3, salida: 1.2, altura: 2.7, espesor: 0.12, tirantes: true, color: '#e6e4de', colorEstructura: '#5d666d' },
    campos: [num('ancho', 'Ancho (m)', 0.5, 20), num('salida', 'Salida desde la pared (m)', 0.3, 5), num('altura', 'Altura (m)', 1.8, 8), num('espesor', 'Espesor (m)', 0.03, 0.5), chk('tirantes', 'Tirantes a la pared'), col('color'), col('colorEstructura', 'Color de la estructura')],
    variantes: [['Hormigón con tirantes', {}], ['Vidrio y acero', { color: '#cfe8f5', espesor: 0.03, colorEstructura: '#9aa1a8' }], ['Chapa sin tirantes', { tirantes: false, color: '#8b959e', espesor: 0.06 }]],
    partes: (p?) => { const vid = p.color.toLowerCase() === '#cfe8f5'; const a = [B(0, p.altura + p.espesor / 2, p.salida / 2, p.ancho, p.espesor, p.salida, p.color, { t: vid }), B(0, p.altura + p.espesor / 2, p.salida - 0.03, p.ancho, p.espesor + 0.08, 0.06, p.colorEstructura), B(0, p.altura + 0.15, 0.03, p.ancho, 0.3, 0.06, p.colorEstructura)];
      if (p.tirantes) for (const x of [-p.ancho / 2 + 0.25, p.ancho / 2 - 0.25]) { a.push(barra([x, p.altura + 0.9, 0.02], [x, p.altura + p.espesor + 0.02, p.salida - 0.08], 0.025, p.colorEstructura)); a.push(B(x, p.altura + 0.9, 0.02, 0.12, 0.12, 0.04, p.colorEstructura)); }
      return a; } });
  def('balcon', { n: 'Balcón', cat: 'estructura', def: { ancho: 3, salida: 1.2, altura: 3, baranda: 'tubos', color: '#d8d4cb', colorBaranda: '#3a3f44' },
    campos: [num('ancho', 'Ancho (m)', 0.8, 15), num('salida', 'Salida (m)', 0.5, 4), num('altura', 'Altura del suelo (m)', 0.5, 30), sel('baranda', 'Baranda', [['tubos', 'Tubos'], ['vidrio', 'Vidrio'], ['macizo', 'Antepecho macizo'], ['barrotes', 'Barrotes']]), col('color'), col('colorBaranda', 'Color de la baranda')],
    variantes: [['Con tubos', {}], ['Con vidrio', { baranda: 'vidrio', colorBaranda: '#9aa1a8' }], ['Antepecho macizo', { baranda: 'macizo', colorBaranda: '#e8e6df' }], ['Barrotes negros', { baranda: 'barrotes', colorBaranda: NEG }]],
    partes: (p?) => {
      const y = p.altura, g = 0.18, W = p.ancho, S = p.salida, h = 1.0, c = p.colorBaranda, a = [B(0, y - g / 2, S / 2, W, g, S, p.color)];
      for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) a.push(perfilX([[0, y - g], [S * 0.6, y - g], [0, y - g - 0.45]], x - 0.06, 0.12, oscuro(p.color, 0.9)));
      const lados = [[[-W / 2 + 0.03, S - 0.03], [W / 2 - 0.03, S - 0.03]], [[-W / 2 + 0.03, 0.05], [-W / 2 + 0.03, S - 0.03]], [[W / 2 - 0.03, 0.05], [W / 2 - 0.03, S - 0.03]]];
      for (const [[x0, z0], [x1, z1]] of lados) {
        const L = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ang = Math.atan2(-(z1 - z0), x1 - x0), r = [0, ang, 0];
        if (p.baranda === 'macizo') { a.push(B(cx, y + h / 2, cz, L, h, 0.12, c, { r })); continue; }
        a.push(B(cx, y + h, cz, L, 0.05, 0.05, c, { r }));
        if (p.baranda === 'vidrio') a.push(B(cx, y + h / 2, cz, L, h - 0.1, 0.012, '#cfe8f5', { r, t: true }));
        else if (p.baranda === 'barrotes') { const n = Math.max(2, Math.round(L / 0.12)); for (let i = 0; i <= n; i++) { const t = i / n; a.push(B(x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t, 0.02, h, 0.02, c)); } }
        else for (const hh of [0.35, 0.65]) a.push(B(cx, y + hh, cz, L, 0.03, 0.03, c, { r }));
        const n = Math.max(1, Math.round(L / 1.2)); for (let i = 0; i <= n; i++) { const t = i / n; a.push(B(x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t, 0.05, h, 0.05, c)); }
      }
      return a;
    } });

  /* ---------- urbanismo ---------- */
  function lineasEje(a?, L?, y?, linea?, z?, dir?) { /* raya central a lo largo de X (dir = 'x') o de Z */
    const pon = (u?, l?, zz?, c?) => a.push(dir === 'z' ? B(zz, y, u, 0.12, 0.006, l, c) : B(u, y, zz, l, 0.006, 0.12, c));
    if (linea === 'continua') pon(0, L, z, BL); else if (linea === 'doble') { pon(0, L, z - 0.1, AM); pon(0, L, z + 0.1, AM); } else if (linea === 'discontinua') { for (let u = -L / 2 + 1.5; u + 1.5 <= L / 2 + 1e-6; u += 9) pon(u, 3, z, BL); }
  }
  def('carretera_recta', { n: 'Carretera recta', cat: 'urbanismo', def: { largo: 20, ancho: 7, carriles: 2, linea: 'discontinua', bordes: true, espesor: 0.05, color: ASF },
    campos: [num('largo', 'Largo (m)', 2, 200, 0.5), num('ancho', 'Ancho (m)', 3, 30, 0.1), num('carriles', 'Carriles', 1, 6, 1), sel('linea', 'Línea central', [['discontinua', 'Discontinua'], ['continua', 'Continua'], ['doble', 'Doble amarilla'], ['ninguna', 'Ninguna']]), chk('bordes', 'Líneas de borde'), col('color', 'Color del asfalto')],
    ejes: { sx: 'largo', sz: 'ancho' },
    variantes: [['Dos carriles', {}], ['Avenida de cuatro carriles', { ancho: 14, carriles: 4, linea: 'doble' }], ['Camino de un carril', { ancho: 4, carriles: 1, linea: 'ninguna', bordes: false }], ['Asfalto viejo', { color: '#5f6064' }]],
    partes: (p?) => {
      const a = [B(0, p.espesor / 2, 0, p.largo, p.espesor, p.ancho, p.color)], y = p.espesor + 0.003, n = Math.max(1, Math.round(p.carriles));
      if (n > 1) { lineasEje(a, p.largo, y, p.linea, 0, 'x'); const wc = p.ancho / n; for (let i = 1; i < n; i++) { const z = -p.ancho / 2 + i * wc; if (Math.abs(z) < 0.2) continue; lineasEje(a, p.largo, y, 'discontinua', z, 'x'); } }
      if (p.bordes) for (const s of [-1, 1]) a.push(B(0, y, s * (p.ancho / 2 - 0.2), p.largo, 0.006, 0.12, BL));
      return a;
    } });
  def('carretera_curva', { n: 'Carretera en curva', cat: 'urbanismo', def: { radio: 12, ancho: 7, angulo: 90, linea: 'discontinua', bordes: true, espesor: 0.05, color: ASF },
    campos: [num('radio', 'Radio del eje (m)', 4, 200, 0.5), num('ancho', 'Ancho (m)', 3, 30, 0.1), num('angulo', 'Ángulo (°)', 10, 180, 5), sel('linea', 'Línea central', [['discontinua', 'Discontinua'], ['continua', 'Continua'], ['doble', 'Doble amarilla'], ['ninguna', 'Ninguna']]), chk('bordes', 'Líneas de borde'), col('color', 'Color del asfalto')],
    variantes: [['Curva de 90°', {}], ['Curva cerrada (radio 8 m)', { radio: 8 }], ['Curva suave de 45°', { radio: 30, angulo: 45 }], ['Media vuelta', { radio: 10, angulo: 180 }]],
    partes: (p?) => {
      const A0 = 0, A1 = Math.max(10, Math.min(180, p.angulo)) * PI / 180, n = Math.max(8, Math.ceil(A1 / (PI / 36))), R = Math.max(p.ancho / 2 + 0.5, p.radio), y = p.espesor + 0.003;
      const sector = (r0?, r1?, yy?, g?, c?) => poly(circulo(r1, n, A0, A1).concat(circulo(r0, n, A0, A1).reverse()), yy, g, c);
      const a = [sector(R - p.ancho / 2, R + p.ancho / 2, 0, p.espesor, p.color)];
      if (p.bordes) for (const s of [-1, 1]) { const r = R + s * (p.ancho / 2 - 0.2); a.push(sector(r - 0.06, r + 0.06, p.espesor, 0.006, BL)); }
      if (p.linea === 'continua') a.push(sector(R - 0.06, R + 0.06, p.espesor, 0.006, BL));
      else if (p.linea === 'doble') { a.push(sector(R - 0.16, R - 0.04, p.espesor, 0.006, AM)); a.push(sector(R + 0.04, R + 0.16, p.espesor, 0.006, AM)); }
      else if (p.linea === 'discontinua') { const L = R * A1; for (let u = 1.5; u + 1.5 <= L; u += 9) { const t = u / R; a.push(B(Math.cos(t) * R, y, Math.sin(t) * R, 3, 0.006, 0.12, BL, { r: [0, -(t + PI / 2), 0] })); } }
      const bb = caja(a), c = bb.getCenter(new V3()); return mover(a, -c.x, 0, -c.z);
    } });
  def('interseccion', { n: 'Intersección', cat: 'urbanismo', def: { ancho: 7, brazos: 4, largoBrazo: 6, cebra: true, color: ASF },
    campos: [num('ancho', 'Ancho de las calles (m)', 3, 20, 0.1), sel('brazos', 'Forma', [[4, 'Cruce (4 brazos)'], [3, 'En T (3 brazos)']]), num('largoBrazo', 'Largo de cada brazo (m)', 1, 30, 0.5), chk('cebra', 'Pasos de cebra'), col('color', 'Color del asfalto')],
    variantes: [['Cruce con pasos de cebra', {}], ['Cruce en T', { brazos: 3 }], ['Cruce ancho sin cebra', { ancho: 12, cebra: false }]],
    partes: (p?) => {
      const W = p.ancho, L = p.largoBrazo, e = 0.05, y = e + 0.003, a = [B(0, e / 2, 0, W, e, W, p.color)];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].slice(0, +p.brazos === 3 ? 3 : 4);
      for (const [dx, dz] of dirs) {
        const cx = dx * (W / 2 + L / 2), cz = dz * (W / 2 + L / 2), ejeX = dx !== 0; a.push(B(cx, e / 2, cz, ejeX ? L : W, e, ejeX ? W : L, p.color));
        if (p.cebra) { const n = Math.floor((W - 1) / 0.9); for (let i = 0; i < n; i++) { const off = -W / 2 + 0.5 + 0.45 + i * 0.9; const u = W / 2 + 1.6; a.push(ejeX ? B(dx * u, y, off, 3, 0.006, 0.5, BL) : B(off, y, dz * u, 0.5, 0.006, 3, BL)); } }
        const stop = W / 2 + (p.cebra ? 3.6 : 0.6); if (L > stop - W / 2 + 0.3) a.push(ejeX ? B(dx * stop, y, dz * 0 - W / 4 * (dx > 0 ? 1 : -1), 0.3, 0.006, W / 2 - 0.2, BL) : B(W / 4 * (dz > 0 ? 1 : -1), y, dz * stop, W / 2 - 0.2, 0.006, 0.3, BL));
        for (const s of [-1, 1]) a.push(ejeX ? B(cx, y, s * (W / 2 - 0.2), L, 0.006, 0.12, BL) : B(s * (W / 2 - 0.2), y, cz, 0.12, 0.006, L, BL));
      }
      return a;
    } });
  def('acera', { n: 'Acera con bordillo', cat: 'urbanismo', def: { largo: 10, ancho: 2, alto: 0.15, bordillo: 0.15, juntas: 1.5, pintado: 'ninguno', color: '#c4c1bb', colorBordillo: '#d6d3cc' },
    campos: [num('largo', 'Largo (m)', 1, 100, 0.5), num('ancho', 'Ancho total (m)', 0.6, 8), num('alto', 'Alto (m)', 0.05, 0.4, 0.01), num('bordillo', 'Ancho del bordillo (m)', 0.08, 0.4, 0.01), num('juntas', 'Juntas cada (m)', 0, 5, 0.25), sel('pintado', 'Bordillo pintado', [['ninguno', 'Sin pintar'], ['amarillo', 'Amarillo (no parquear)'], ['rojo_blanco', 'Rojo y blanco']]), col('color', 'Color de la acera'), col('colorBordillo', 'Color del bordillo')],
    ejes: { sx: 'largo' },
    variantes: [['Acera de 2 m', {}], ['Acera ancha de 3,5 m', { ancho: 3.5 }], ['Bordillo amarillo', { pintado: 'amarillo' }], ['Adoquinada', { color: '#a39c90', juntas: 0 }]],
    partes: (p?) => {
      const L = p.largo, W = Math.max(p.bordillo + 0.2, p.ancho), cb = p.colorBordillo, a = [B(0, p.alto / 2, -p.bordillo / 2, L, p.alto, W - p.bordillo, p.color)];
      const zb = W / 2 - p.bordillo / 2; a.push(B(0, (p.alto + 0.02) / 2, zb, L, p.alto + 0.02, p.bordillo, cb));
      if (p.juntas > 0.2) for (let x = -L / 2 + p.juntas; x < L / 2 - 0.05; x += p.juntas) a.push(B(x, p.alto + 0.002, -p.bordillo / 2, 0.012, 0.004, W - p.bordillo - 0.02, oscuro(p.color, 0.7)));
      if (p.pintado !== 'ninguno') { const n = Math.max(1, Math.round(L / 1)); for (let i = 0; i < n; i++) { const c = p.pintado === 'amarillo' ? AM : (i % 2 ? '#f2f2f2' : '#c62828'); a.push(B(-L / 2 + (i + 0.5) * L / n, p.alto + 0.012, zb, L / n, 0.006, p.bordillo + 0.004, c)); a.push(B(-L / 2 + (i + 0.5) * L / n, (p.alto + 0.02) / 2, W / 2 + 0.002, L / n, p.alto + 0.02, 0.004, c)); } }
      return a;
    } });
  def('parqueo', { n: 'Plazas de parqueo', cat: 'urbanismo', def: { plazas: 6, anchoPlaza: 2.5, fondo: 5, filas: 1, angulo: 90, discapacitados: 1, topes: true, asfalto: true, color: ASF, colorLineas: BL },
    campos: [num('plazas', 'Plazas por fila', 1, 40, 1), num('anchoPlaza', 'Ancho de plaza (m)', 2, 4), num('fondo', 'Fondo (m)', 3.5, 7), sel('filas', 'Filas', [[1, 'Una fila'], [2, 'Dos filas (enfrentadas)']]), sel('angulo', 'Ángulo', [[90, '90° (batería)'], [60, '60°'], [45, '45° (espiga)']]), num('discapacitados', 'Plazas para discapacitados', 0, 6, 1), chk('topes', 'Topes de rueda'), chk('asfalto', 'Con asfalto debajo'), col('color', 'Color del asfalto'), col('colorLineas', 'Color de las líneas')],
    variantes: [['6 plazas en batería', {}], ['Doble fila de 10', { plazas: 10, filas: 2, discapacitados: 2 }], ['En espiga a 45°', { angulo: 45, plazas: 6, topes: false }], ['Solo líneas (sobre asfalto existente)', { asfalto: false }]],
    partes: (p?) => {
      const n = Math.max(1, Math.round(p.plazas)), w = p.anchoPlaza, D = p.fondo, filas = +p.filas === 2 ? 2 : 1, ang = Math.max(30, Math.min(90, +p.angulo || 90)) * PI / 180;
      const paso = w / Math.sin(ang), dx = D / Math.tan(ang), W = n * paso + Math.abs(dx), e = p.asfalto ? 0.04 : 0, y = e + 0.004, a = [];
      if (p.asfalto) a.push(B(0, e / 2, filas === 2 ? 0 : -D / 2 + D / 2, W + 0.6, e, filas * D + 0.6, p.color));
      for (let f = 0; f < filas; f++) {
        const s = filas === 2 ? (f ? -1 : 1) : 1, z0 = filas === 2 ? 0 : -D / 2, zf = z0 + s * D;
        a.push(B(0, y, z0, W, 0.006, 0.12, p.colorLineas));
        for (let i = 0; i <= n; i++) { const xa = -W / 2 + Math.abs(dx) / 2 + i * paso - dx / 2, xb = xa + dx; a.push(Object.assign(barra([xa, y, z0], [xb, y, zf], 0.12, p.colorLineas), { s: [0.12, 0.006, Math.hypot(xb - xa, zf - z0)] })); }
        for (let i = 0; i < n; i++) {
          const xm = -W / 2 + Math.abs(dx) / 2 + (i + 0.5) * paso;
          if (i < p.discapacitados && f === 0) { a.push(poly([[xm - dx / 2 - paso / 2 + 0.1, z0 + s * 0.1], [xm - dx / 2 + paso / 2 - 0.1, z0 + s * 0.1], [xm + dx / 2 + paso / 2 - 0.1, zf - s * 0.1], [xm + dx / 2 - paso / 2 + 0.1, zf - s * 0.1]], e + 0.001, 0.004, '#1d4f9a')); a.push(Txt('♿', xm, y + 0.004, z0 + s * D * 0.55, 1.2, 1.2, '#1d4f9a', '#ffffff', { r: [-PI / 2, 0, s > 0 ? 0 : PI] })); }
          if (p.topes) { const t = 0.55 / D; a.push(B(xm - dx / 2 + dx * t, 0.075 + e, z0 + s * 0.55, Math.min(1.8, w - 0.5), 0.15, 0.15, AM, { r: [0, s * (PI / 2 - ang), 0] })); }
        }
      }
      return a;
    } });
  const FLECHAS = {
    recta: [[[-0.5, -0.06], [0.2, -0.06], [0.2, -0.17], [0.5, 0], [0.2, 0.17], [0.2, 0.06], [-0.5, 0.06]]],
    izquierda: [[[-0.5, -0.06], [0.05, -0.06], [0.05, -0.32], [-0.08, -0.32], [0.11, -0.5], [0.3, -0.32], [0.17, -0.32], [0.17, 0.06], [-0.5, 0.06]]],
    derecha: [[[-0.5, 0.06], [0.05, 0.06], [0.05, 0.32], [-0.08, 0.32], [0.11, 0.5], [0.3, 0.32], [0.17, 0.32], [0.17, -0.06], [-0.5, -0.06]]],
    recta_izquierda: null, recta_derecha: null, doble: [[[-0.5, 0], [-0.25, -0.17], [-0.25, -0.06], [0.25, -0.06], [0.25, -0.17], [0.5, 0], [0.25, 0.17], [0.25, 0.06], [-0.25, 0.06], [-0.25, 0.17]]]
  };
  FLECHAS.recta_izquierda = FLECHAS.recta.concat([[[-0.25, -0.06], [-0.05, -0.06], [-0.05, -0.3], [-0.16, -0.3], [0.0, -0.46], [0.16, -0.3], [0.07, -0.3], [0.07, -0.02], [-0.25, -0.02]]]);
  FLECHAS.recta_derecha = FLECHAS.recta.concat([[[-0.25, 0.06], [-0.05, 0.06], [-0.05, 0.3], [-0.16, 0.3], [0.0, 0.46], [0.16, 0.3], [0.07, 0.3], [0.07, 0.02], [-0.25, 0.02]]]);
  def('flecha_vial', { n: 'Flecha vial', cat: 'urbanismo', def: { tipo: 'recta', largo: 5, color: BL },
    campos: [sel('tipo', 'Tipo', [['recta', 'Recta'], ['izquierda', 'Giro a la izquierda'], ['derecha', 'Giro a la derecha'], ['recta_izquierda', 'Recta o izquierda'], ['recta_derecha', 'Recta o derecha'], ['doble', 'Doble sentido']]), num('largo', 'Largo (m)', 1, 10, 0.25), col('color')],
    variantes: [['Recta', {}], ['Giro a la izquierda', { tipo: 'izquierda' }], ['Giro a la derecha', { tipo: 'derecha' }], ['Recta o derecha', { tipo: 'recta_derecha' }], ['Doble sentido', { tipo: 'doble' }]],
    partes: (p?) => (FLECHAS[p.tipo] || FLECHAS.recta).map((pol?) => poly(pol.map(([x, z]) => [x * p.largo, z * p.largo]), 0.003, 0.004, p.color)) });
  def('senal_vial', { n: 'Señal vial', cat: 'urbanismo', def: { tipo: 'pare', texto: '', alto: 2.4, tam: 0.75, color: '#8a8f94' },
    campos: [sel('tipo', 'Señal', [['pare', 'Pare'], ['ceda', 'Ceda el paso'], ['velocidad', 'Límite de velocidad'], ['no_parquear', 'No parquear'], ['peligro', 'Peligro'], ['informativa', 'Informativa (texto)'], ['parqueo', 'Parqueadero (P)']]), txt('texto', 'Texto (velocidad o informativa)'), num('alto', 'Alto del poste (m)', 1, 5), num('tam', 'Tamaño de la placa (m)', 0.3, 2), col('color', 'Color del poste')],
    variantes: [['Pare', {}], ['Ceda el paso', { tipo: 'ceda' }], ['Velocidad 30', { tipo: 'velocidad', texto: '30' }], ['No parquear', { tipo: 'no_parquear' }], ['Peligro', { tipo: 'peligro' }], ['Parqueadero', { tipo: 'parqueo' }], ['Informativa', { tipo: 'informativa', texto: 'OFICINAS', tam: 1.2 }]],
    partes: (p?) => {
      const h = p.alto, t = p.tam, zc = 0.05, a = [Cy(0, h / 2, 0, 0.06, h, p.color)], y = h - t / 2 + 0.05;
      const disco = (d?, c?, z?) => CyZ(0, y, z, d, 0.02, c);
      switch (p.tipo) {
        case 'ceda': { const tri = (s?) => [[-s / 2, s * 0.29], [s / 2, s * 0.29], [0, -s * 0.58]]; a.push(perfilZ(tri(t).map(([x, yy]) => [x, y + yy]), zc - 0.01, 0.02, '#c62828'), perfilZ(tri(t * 0.7).map(([x, yy]) => [x, y + yy + t * 0.03]), zc + 0.01, 0.006, '#f4f4f4')); break; }
        case 'velocidad': a.push(disco(t, '#c62828', zc), disco(t * 0.78, '#f4f4f4', zc + 0.012), Txt(p.texto || '30', 0, y, zc + 0.024, t * 0.62, t * 0.42, '#f4f4f4', '#111111')); break;
        case 'no_parquear': a.push(disco(t, '#c62828', zc), disco(t * 0.8, '#1d4f9a', zc + 0.012), Txt('E', 0, y, zc + 0.024, t * 0.5, t * 0.5, '#1d4f9a', '#ffffff'), B(0, y, zc + 0.03, t * 0.8, t * 0.1, 0.004, '#c62828', { r: [0, 0, -PI / 4] })); break;
        case 'peligro': a.push(B(0, y, zc, t * 0.72, t * 0.72, 0.02, '#111111', { r: [0, 0, PI / 4] }), B(0, y, zc + 0.012, t * 0.64, t * 0.64, 0.006, AM, { r: [0, 0, PI / 4] }), Txt('!', 0, y, zc + 0.02, t * 0.3, t * 0.45, AM, '#111111')); break;
        case 'informativa': a.push(B(0, y, zc, t, t * 0.45, 0.02, '#1d6b3a'), Txt(p.texto || 'INFORMACIÓN', 0, y, zc + 0.012, t * 0.92, t * 0.38, '#1d6b3a', '#ffffff')); a.push(Cy(-t * 0.35, h / 2, 0, 0.05, h, p.color)); a[0].p[0] = t * 0.35; break;
        case 'parqueo': a.push(B(0, y, zc, t * 0.8, t * 0.8, 0.02, '#1d4f9a'), Txt('P', 0, y, zc + 0.012, t * 0.7, t * 0.7, '#1d4f9a', '#ffffff')); break;
        default: { const oct = circulo(t / 2, 8, PI / 8, PI / 8 + 2 * PI).map(([x, yy]) => [x, y + yy]); a.push(perfilZ(oct, zc - 0.01, 0.02, '#c62828'), Txt('PARE', 0, y, zc + 0.012, t * 0.72, t * 0.3, '#c62828', '#ffffff')); }
      }
      return a;
    } });
  def('semaforo', { n: 'Semáforo', cat: 'urbanismo', def: { alto: 3.2, brazo: 0, peatonal: false, encendida: 'rojo', color: '#2a2d30' },
    campos: [num('alto', 'Alto (m)', 2, 7), num('brazo', 'Largo del brazo (m, 0 = sin brazo)', 0, 8, 0.25), chk('peatonal', 'Con semáforo peatonal'), sel('encendida', 'Luz encendida', [['rojo', 'Roja'], ['ambar', 'Ámbar'], ['verde', 'Verde']]), col('color')],
    variantes: [['De poste', {}], ['Con brazo de 4 m', { brazo: 4, alto: 5.5 }], ['Con peatonal', { peatonal: true }]],
    partes: (p?) => {
      const a = [Cy(0, p.alto / 2, 0, 0.12, p.alto, p.color), Cy(0, 0.05, 0, 0.3, 0.1, p.color)]; const hx = p.brazo > 0 ? p.brazo : 0, hy = p.brazo > 0 ? p.alto - 0.6 : p.alto - 0.55;
      if (p.brazo > 0) a.push(CyX(p.brazo / 2, p.alto - 0.1, 0, 0.09, p.brazo, p.color), barra([0, p.alto - 1.0, 0], [Math.min(1.5, p.brazo * 0.5), p.alto - 0.1, 0], 0.04, p.color));
      const C = { rojo: '#ff3b30', ambar: '#ffb000', verde: '#2ecc40' }, apagado = { rojo: '#4a1a18', ambar: '#4a3a10', verde: '#163a1c' };
      a.push(B(hx, hy, 0.08, 0.32, 0.95, 0.26, '#1b1d1f'));
      ['rojo', 'ambar', 'verde'].forEach((k?, i?) => { const yy = hy + 0.3 - i * 0.3, on = p.encendida === k; a.push(on ? Lz(hx, yy, 0.22, 0.2, C[k]) : Sp(hx, yy, 0.21, 0.2, 0.2, 0.06, apagado[k]), B(hx, yy + 0.12, 0.27, 0.24, 0.02, 0.12, '#1b1d1f')); });
      if (p.peatonal) { a.push(B(0.18, 1.9, 0, 0.26, 0.5, 0.22, '#1b1d1f'), Sp(0.18, 2.02, 0.12, 0.16, 0.16, 0.05, '#4a1a18'), Lz(0.18, 1.78, 0.12, 0.15, '#2ecc40')); }
      return a;
    } });
  def('tope_vial', { n: 'Tope (reductor)', cat: 'urbanismo', def: { largo: 3.5, ancho: 0.6, alto: 0.08, franjas: true, color: AM },
    campos: [num('largo', 'Largo (m)', 0.5, 12, 0.25), num('ancho', 'Ancho (m)', 0.2, 4), num('alto', 'Alto (m)', 0.03, 0.2, 0.01), chk('franjas', 'Franjas negras'), col('color')], ejes: { sx: 'largo' },
    variantes: [['Tope amarillo', {}], ['Lomo de burro ancho', { ancho: 3, alto: 0.1 }], ['Caucho negro', { color: '#2a2a2a', franjas: false, alto: 0.05, ancho: 0.35 }]],
    partes: (p?) => { const a = [CyX(0, 0, 0, p.alto * 2, p.largo, p.color, { s: [p.alto * 2, p.largo, p.ancho] })]; if (p.franjas) { const n = Math.max(2, Math.round(p.largo / 0.6)); for (let i = 0; i < n; i += 2) a.push(CyX(-p.largo / 2 + (i + 0.5) * p.largo / n, 0, 0, p.alto * 2 + 0.006, p.largo / n, '#1b1b1b', { s: [p.alto * 2 + 0.006, p.largo / n, p.ancho + 0.004] })); } return a; } });
  def('cuneta', { n: 'Cuneta', cat: 'urbanismo', def: { largo: 10, ancho: 0.6, profundidad: 0.25, color: '#a9a59c' },
    campos: [num('largo', 'Largo (m)', 1, 100, 0.5), num('ancho', 'Ancho (m)', 0.3, 2), num('profundidad', 'Profundidad (m)', 0.05, 1), col('color')], ejes: { sx: 'largo' },
    variantes: [['Cuneta en V', {}], ['Canal ancho', { ancho: 1.2, profundidad: 0.4 }]],
    partes: (p?) => { const W = p.ancho, D = p.profundidad, L = p.largo, g = 0.08; return [perfilX([[-W / 2 - 0.15, 0.02], [-W / 2, 0.02], [0, 0.02 - D], [W / 2, 0.02], [W / 2 + 0.15, 0.02], [W / 2 + 0.15, 0.02 - D - g], [-W / 2 - 0.15, 0.02 - D - g]], -L / 2, L, p.color), B(0, 0.02 - D + 0.012, 0, L, 0.004, W * 0.12, oscuro(p.color, 0.55))]; } });
  def('alcantarilla', { n: 'Alcantarilla (tapa)', cat: 'urbanismo', def: { diametro: 0.7, forma: 'redonda', color: '#3a3d40', colorCuello: '#a9a59c' },
    campos: [num('diametro', 'Tamaño (m)', 0.4, 1.5), sel('forma', 'Forma', [['redonda', 'Redonda'], ['cuadrada', 'Cuadrada']]), col('color', 'Color de la tapa'), col('colorCuello', 'Color del marco')],
    variantes: [['Redonda', {}], ['Cuadrada', { forma: 'cuadrada' }]],
    partes: (p?) => { const d = p.diametro, a = []; if (p.forma === 'cuadrada') { a.push(B(0, 0.01, 0, d + 0.2, 0.02, d + 0.2, p.colorCuello), B(0, 0.025, 0, d, 0.012, d, p.color)); for (let i = -3; i <= 3; i++) a.push(B(i * d / 8, 0.033, 0, 0.03, 0.006, d * 0.85, oscuro(p.color, 1.3))); } else { a.push(Cy(0, 0.01, 0, d + 0.22, 0.02, p.colorCuello), Cy(0, 0.025, 0, d, 0.012, p.color), Cy(0, 0.032, 0, d * 0.7, 0.004, oscuro(p.color, 1.25)), Cy(0, 0.035, 0, d * 0.45, 0.004, p.color)); for (let i = 0; i < 4; i++) a.push(B(0, 0.034, 0, d * 0.9, 0.004, 0.025, oscuro(p.color, 1.3), { r: [0, i * PI / 4, 0] })); } return a; } });
  def('rejilla_drenaje', { n: 'Rejilla de drenaje', cat: 'urbanismo', def: { largo: 1, ancho: 0.4, barras: 12, color: '#3a3d40' },
    campos: [num('largo', 'Largo (m)', 0.3, 20, 0.1), num('ancho', 'Ancho (m)', 0.15, 1.5), num('barras', 'Barras', 3, 80, 1), col('color')], ejes: { sx: 'largo', sz: 'ancho' },
    variantes: [['Rejilla de 1 m', {}], ['Canaleta lineal de 6 m', { largo: 6, ancho: 0.2, barras: 60 }]],
    partes: (p?) => { const L = p.largo, W = p.ancho, a = [B(0, 0.005, 0, L, 0.01, W, '#0d0e0f'), B(0, 0.02, -W / 2 + 0.02, L, 0.04, 0.04, p.color), B(0, 0.02, W / 2 - 0.02, L, 0.04, 0.04, p.color), B(-L / 2 + 0.02, 0.02, 0, 0.04, 0.04, W, p.color), B(L / 2 - 0.02, 0.02, 0, 0.04, 0.04, W, p.color)]; const n = Math.max(3, Math.round(p.barras)); for (let i = 1; i < n; i++) a.push(B(-L / 2 + i * L / n, 0.02, 0, 0.012, 0.035, W - 0.06, p.color)); return a; } });
  def('poste_luz', { n: 'Poste eléctrico', cat: 'urbanismo', def: { alto: 9, material: 'hormigon', cruceta: true, aisladores: 3, transformador: false, color: '#bdbab3' },
    campos: [num('alto', 'Alto (m)', 4, 16), sel('material', 'Material', [['hormigon', 'Hormigón'], ['madera', 'Madera'], ['metal', 'Metálico']]), chk('cruceta', 'Cruceta'), num('aisladores', 'Aisladores', 0, 6, 1), chk('transformador', 'Transformador'), col('color')], ejes: { sy: 'alto' },
    variantes: [['Hormigón con cruceta', {}], ['Madera', { material: 'madera', color: '#7a5a3c' }], ['Con transformador', { transformador: true }], ['Metálico sin cruceta', { material: 'metal', cruceta: false, aisladores: 0, color: '#7d858c' }]],
    partes: (p?) => { const h = p.alto, a = []; for (let i = 0; i < 4; i++) { const t0 = i / 4; a.push(Cy(0, h * (t0 + 0.125), 0, 0.3 - 0.14 * t0, h / 4 + 0.01, p.color)); }
      if (p.cruceta) { a.push(B(0, h - 0.5, 0, 1.8, 0.1, 0.1, p.material === 'madera' ? '#6b4f35' : '#8a8f94')); const n = Math.round(p.aisladores); for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : -0.8 + 1.6 * i / (n - 1); a.push(Cy(x, h - 0.38, 0, 0.07, 0.16, '#e8e2d0'), Cy(x, h - 0.3, 0, 0.09, 0.02, '#e8e2d0')); } }
      if (p.transformador) a.push(Cy(0, h - 2.2, 0.4, 0.55, 0.9, '#8a9096'), Cy(0, h - 1.72, 0.4, 0.58, 0.06, '#6b7178'), B(0, h - 2.2, 0.17, 0.1, 0.5, 0.1, '#5a5f63'));
      return a; } });
  def('luminaria', { n: 'Luminaria', cat: 'urbanismo', def: { alto: 8, brazos: 1, largoBrazo: 1.6, color: '#6b7178', luz: '#fff2c0' },
    campos: [num('alto', 'Alto (m)', 3, 16), sel('brazos', 'Brazos', [[0, 'Sin brazo (farol)'], [1, 'Un brazo'], [2, 'Dos brazos']]), num('largoBrazo', 'Largo del brazo (m)', 0.4, 4), col('color'), col('luz', 'Color de la luz')], ejes: { sy: 'alto' },
    variantes: [['Un brazo', {}], ['Doble (mediana)', { brazos: 2, alto: 10 }], ['Farol de parque', { brazos: 0, alto: 4, color: '#2a2d30' }]],
    partes: (p?) => { const h = p.alto, a = [Cy(0, 0.4, 0, 0.34, 0.8, oscuro(p.color, 0.85)), Cy(0, h * 0.45, 0, 0.18, h * 0.9, p.color), Cy(0, h * 0.95, 0, 0.12, h * 0.1, p.color)];
      const nb = +p.brazos; if (!nb) { a.push(Cy(0, h + 0.18, 0, 0.42, 0.36, '#e9ecef', { t: true }), Cy(0, h + 0.4, 0, 0.5, 0.06, p.color), Lz(0, h + 0.15, 0, 0.3, p.luz)); return a; }
      for (const s of nb === 2 ? [-1, 1] : [1]) { const L = p.largoBrazo; a.push(barra([0, h - 0.3, 0], [s * L, h, 0], 0.07, p.color), B(s * (L + 0.25), h - 0.02, 0, 0.6, 0.1, 0.28, p.color), B(s * (L + 0.25), h - 0.08, 0, 0.5, 0.02, 0.22, '#f6f2df'), Lz(s * (L + 0.25), h - 0.2, 0, 0.32, p.luz)); }
      return a; } });

  /* ---------- industrial ---------- */
  def('contenedor_maritimo', { n: 'Contenedor marítimo', cat: 'equipos', def: { pies: '20', apilados: 1, puertas: 'cerradas', color: '#2f6e8e', color2: '#b5452b' },
    campos: [sel('pies', 'Tamaño', [['20', '20 pies (6,1 m)'], ['40', '40 pies (12,2 m)']]), num('apilados', 'Apilados', 1, 4, 1), sel('puertas', 'Puertas', [['cerradas', 'Cerradas'], ['abiertas', 'Abiertas']]), col('color', 'Color'), col('color2', 'Color del de encima')],
    variantes: [['20 pies azul', {}], ['40 pies rojo', { pies: '40', color: '#b5452b' }], ['Dos apilados', { apilados: 2 }], ['Abierto', { puertas: 'abiertas', color: '#3f7a3a' }], ['40 pies apilados de tres', { pies: '40', apilados: 3, color: '#8a8f94', color2: '#c9a43a' }]],
    partes: (p?) => {
      const L = p.pies === '40' ? 12.19 : 6.06, H = 2.59, W = 2.44, a = [];
      for (let i = 0; i < Math.max(1, Math.round(p.apilados)); i++) {
        let pz = OO.construir({ tipo: 'contenedor', datos: { sx: L, sy: H, sz: W, color: i % 2 ? p.color2 : p.color } });
        if (p.puertas === 'abiertas' && i === 0) { pz = pz.filter((q?) => !(q.p[0] > L / 2 - 0.02)); const dk = oscuro(p.color, 0.72); for (const s of [-1, 1]) a.push(B(L / 2 + W / 4, H / 2, s * (W / 2 + 0.02), W / 2 - 0.05, H - 0.25, 0.04, dk)); a.push(B(L / 2 - 0.2, H / 2, 0, 0.02, H - 0.3, W - 0.3, '#1d2124')); }
        a.push(...mover(pz, 0, i * H, 0));
      }
      return a;
    } });
  def('tanque_ind', { n: 'Tanque industrial', cat: 'equipos', def: { diametro: 2.5, alto: 4, orientacion: 'vertical', escalera: true, color: '#cfd3d6' },
    campos: [num('diametro', 'Diámetro (m)', 0.5, 12), num('alto', 'Alto o largo (m)', 0.8, 20), sel('orientacion', 'Orientación', [['vertical', 'Vertical'], ['horizontal', 'Horizontal']]), chk('escalera', 'Escalera'), col('color')],
    variantes: [['Vertical con escalera', {}], ['Horizontal (cisterna)', { orientacion: 'horizontal', diametro: 2, alto: 6, escalera: false }], ['Silo alto', { diametro: 3.5, alto: 9, color: '#b8bcc0' }], ['Tanque de agua negro', { diametro: 1.6, alto: 1.8, escalera: false, color: '#202428' }]],
    partes: (p?) => {
      const D = p.diametro, H = p.alto, a = [];
      if (p.orientacion === 'horizontal') { const y = D / 2 + 0.35; a.push(CyX(0, y, 0, D, H, p.color), Sp(-H / 2, y, 0, D * 0.35, D, D, p.color), Sp(H / 2, y, 0, D * 0.35, D, D, p.color), Cy(H * 0.25, y + D / 2 + 0.08, 0, 0.5, 0.16, oscuro(p.color, 0.8))); for (const x of [-H * 0.32, H * 0.32]) a.push(B(x, 0.3, 0, 0.3, 0.6, D * 0.8, '#5a5f63')); return a; }
      const y0 = 0.4; a.push(Cy(0, y0 + H / 2, 0, D, H, p.color), Sp(0, y0 + H, 0, D, D * 0.32, D, p.color), Cy(0, y0 + H * 0.33, 0, D + 0.02, 0.04, oscuro(p.color, 0.85)), Cy(0, y0 + H * 0.66, 0, D + 0.02, 0.04, oscuro(p.color, 0.85)), Cy(0, y0 + H + D * 0.16, 0, 0.5, 0.12, oscuro(p.color, 0.8)));
      for (let i = 0; i < 4; i++) { const g = i * PI / 2 + PI / 4; a.push(B(Math.cos(g) * D * 0.38, y0 / 2, Math.sin(g) * D * 0.38, 0.14, y0, 0.14, '#5a5f63')); }
      if (p.escalera) { const z = D / 2 + 0.25, top = y0 + H + 0.9; for (const x of [-0.22, 0.22]) a.push(B(x, top / 2, z, 0.05, top, 0.05, '#7d858c')); for (let yy = 0.3; yy < top - 0.1; yy += 0.3) a.push(B(0, yy, z, 0.44, 0.03, 0.03, '#7d858c')); for (let yy = 2.2; yy < top - 0.3; yy += 0.9) a.push(Cy(0, yy, z + 0.2, 0.8, 0.04, '#7d858c', { t: true })); }
      return a;
    } });
  def('generador', { n: 'Generador eléctrico', cat: 'equipos', def: { largo: 3.2, ancho: 1.2, alto: 1.9, color: AM, texto: 'GENERADOR' },
    campos: [num('largo', 'Largo (m)', 1, 12), num('ancho', 'Ancho (m)', 0.6, 3), num('alto', 'Alto (m)', 0.8, 3.5), txt('texto', 'Rótulo'), col('color')], ejes: { sx: 'largo', sz: 'ancho' },
    variantes: [['Insonorizado amarillo', {}], ['Industrial verde', { largo: 5, alto: 2.4, ancho: 1.6, color: '#3f6b4a' }], ['Portátil', { largo: 1.2, ancho: 0.7, alto: 0.8, color: '#c62828', texto: '' }]],
    partes: (p?) => { const L = p.largo, W = p.ancho, H = p.alto, a = [B(0, 0.08, 0, L + 0.1, 0.16, W + 0.1, '#3a3d40'), B(0, 0.16 + (H - 0.16) / 2, 0, L, H - 0.16, W, p.color)];
      for (const s of [-1, 1]) { for (let k = 0; k < 6; k++) a.push(B(-L * 0.3, 0.5 + k * (H - 0.8) / 6, s * (W / 2 + 0.006), L * 0.3, 0.035, 0.012, oscuro(p.color, 0.6))); a.push(B(L * 0.18, H / 2 + 0.05, s * (W / 2 + 0.004), L * 0.32, H * 0.6, 0.008, oscuro(p.color, 0.88))); }
      a.push(Cy(L * 0.35, H + 0.25, 0, 0.14, 0.5, '#5a5f63'), Cy(L * 0.35, H + 0.52, 0, 0.18, 0.04, '#3a3d40'));
      if (p.texto) a.push(Txt(p.texto, -L * 0.1, H * 0.75, W / 2 + 0.012, Math.min(L * 0.5, 1.6), 0.2, p.color, '#1d1d1d'));
      return a; } });
  def('transformador', { n: 'Transformador', cat: 'equipos', def: { tipo: 'pedestal', color: '#5c7a5c' },
    campos: [sel('tipo', 'Tipo', [['pedestal', 'De pedestal (pad-mounted)'], ['subestacion', 'Subestación con radiadores']]), col('color')],
    variantes: [['De pedestal', {}], ['Subestación', { tipo: 'subestacion', color: '#8a9096' }]],
    partes: (p?) => { const a = [];
      if (p.tipo === 'subestacion') { a.push(B(0, 0.15, 0, 3.2, 0.3, 2.4, '#a9a59c'), B(0, 1.3, 0, 1.8, 2, 1.3, p.color)); for (const s of [-1, 1]) for (let i = 0; i < 6; i++) a.push(B(-0.75 + i * 0.3, 1.25, s * 0.95, 0.06, 1.6, 0.6, oscuro(p.color, 0.9))); for (let i = 0; i < 3; i++) { const x = -0.5 + i * 0.5; for (let k = 0; k < 5; k++) a.push(Cy(x, 2.4 + k * 0.1, -0.2, 0.18 - (k % 2) * 0.05, 0.08, '#c9a777')); a.push(Cy(x, 2.4 + 0.55, -0.2, 0.05, 0.12, '#9aa1a8')); } a.push(Txt('PELIGRO ALTA TENSIÓN', 0, 1.9, 0.66, 1.2, 0.18, AM, '#111111')); return a; }
      a.push(B(0, 0.08, 0, 1.6, 0.16, 1.5, '#a9a59c'), B(0, 0.16 + 0.6, 0, 1.4, 1.2, 1.3, p.color), B(0, 1.38, 0, 1.45, 0.04, 1.35, oscuro(p.color, 0.85)), B(0, 0.76, 0.66, 0.02, 1.1, 0.02, oscuro(p.color, 0.6)), B(0.4, 0.8, 0.665, 0.08, 0.04, 0.02, '#c9ced3'), Txt('⚡ PELIGRO', 0, 1.05, 0.662, 0.6, 0.14, AM, '#111111'));
      return a; } });
  def('tuberia', { n: 'Tubería', cat: 'equipos', def: { largo: 6, diametro: 0.3, altura: 0.6, soportes: 3, bridas: true, codo: false, color: '#8a3b2a' },
    campos: [num('largo', 'Largo (m)', 0.5, 60, 0.25), num('diametro', 'Diámetro (m)', 0.05, 1.5, 0.01), num('altura', 'Altura del eje (m)', 0.1, 8), num('soportes', 'Soportes cada (m, 0 = sin)', 0, 12, 0.5), chk('bridas', 'Bridas'), chk('codo', 'Codo hacia arriba al final'), col('color')], ejes: { sx: 'largo' },
    variantes: [['Agua (roja)', {}], ['Gas (amarilla) en altura', { color: AM, altura: 3, diametro: 0.15 }], ['Acero grueso con codo', { diametro: 0.5, color: '#7d858c', codo: true }], ['PVC blanco', { diametro: 0.11, color: '#e8e8e4', bridas: false, altura: 0.3 }]],
    partes: (p?) => { const L = p.largo, d = p.diametro, y = p.altura, a = [CyX(0, y, 0, d, L - (p.codo ? d : 0), p.color)];
      if (p.bridas) for (let x = -L / 2 + 0.05; x <= L / 2 + 1e-6; x += 3) a.push(CyX(Math.min(x, L / 2 - 0.03), y, 0, d * 1.35, 0.05, oscuro(p.color, 0.8)));
      if (p.soportes > 0.4) for (let x = -L / 2 + 0.5; x <= L / 2 - 0.3; x += p.soportes) { a.push(B(x, (y - d / 2) / 2, 0, 0.08, Math.max(0.02, y - d / 2), 0.08, '#5a5f63'), B(x, y - d / 2 - 0.02, 0, 0.1, 0.04, d + 0.2, '#5a5f63')); }
      if (p.codo) a.push(Sp(L / 2 - d / 2, y, 0, d * 1.05, d * 1.05, d * 1.05, p.color), Cy(L / 2 - d / 2, y + 0.75, 0, d, 1.5, p.color));
      return a; } });
  def('conducto', { n: 'Conducto de ventilación', cat: 'equipos', def: { largo: 6, ancho: 0.6, alto: 0.4, altura: 3, soportes: 2, color: '#b8bcc0' },
    campos: [num('largo', 'Largo (m)', 0.5, 60, 0.25), num('ancho', 'Ancho (m)', 0.15, 2), num('alto', 'Alto (m)', 0.15, 1.5), num('altura', 'Altura (m)', 0, 10), num('soportes', 'Colgadores cada (m)', 0, 6, 0.5), col('color')], ejes: { sx: 'largo' },
    variantes: [['Galvanizado colgado', {}], ['Grande a 4 m', { ancho: 1, alto: 0.6, altura: 4 }], ['A ras de suelo', { altura: 0, soportes: 0 }]],
    partes: (p?) => { const L = p.largo, a = [B(0, p.altura + p.alto / 2, 0, L, p.alto, p.ancho, p.color)]; for (let x = -L / 2 + 0.6; x < L / 2; x += 1.2) a.push(B(x, p.altura + p.alto / 2, 0, 0.04, p.alto + 0.03, p.ancho + 0.03, oscuro(p.color, 0.88)));
      if (p.soportes > 0.3 && p.altura > 0.3) for (let x = -L / 2 + 0.4; x < L / 2; x += p.soportes) { a.push(B(x, p.altura - 0.03, 0, 0.05, 0.05, p.ancho + 0.2, '#5a5f63')); for (const s of [-1, 1]) a.push(Cy(x, p.altura + p.alto / 2 + 0.4, s * (p.ancho / 2 + 0.08), 0.012, p.alto + 0.86, '#5a5f63')); }
      return a; } });
  def('aire_split', { n: 'Aire acondicionado split', cat: 'equipos', def: { unidad: 'conjunto', separacion: 0.6, color: '#f4f4f2' },
    campos: [sel('unidad', 'Unidad', [['conjunto', 'Interior + exterior (con tubería)'], ['interior', 'Interior'], ['exterior', 'Exterior (condensadora)']]), num('separacion', 'Separación de la pared (m)', 0.1, 2), col('color')],
    variantes: [['Conjunto', {}], ['Solo la unidad interior', { unidad: 'interior' }], ['Solo la condensadora', { unidad: 'exterior' }]],
    partes: (p?) => { const a = []; const si = OBJ.split, ce = OBJ.condensadora; if (!si || !ce) return [B(0, 2.4, 0, 0.95, 0.28, 0.24, p.color)];
      if (p.unidad !== 'exterior') a.push(...mover(si.partes(p.color), 0, 0, 0.12));
      if (p.unidad !== 'interior') { const z = p.unidad === 'conjunto' ? -(p.separacion + 0.18 + 0.2) : 0; a.push(...mover(girarY(ce.partes('#ecedeb'), p.unidad === 'conjunto' ? PI : 0), 0.6, 0, z)); if (p.unidad === 'conjunto') { a.push(tubo([0.35, 2.3, 0.05], [0.35, 2.3, -0.12], 0.06, '#e8e8e4'), tubo([0.35, 2.3, -0.12], [0.35, 0.45, -0.12], 0.06, '#e8e8e4'), tubo([0.35, 0.45, -0.12], [0.45, 0.45, z + 0.15], 0.05, '#e8e8e4')); } }
      return a; } });
  def('camara_cctv', { n: 'Cámara de seguridad', cat: 'equipos', def: { tipo: 'bala', montaje: 'pared', alto: 3, color: '#eceeee' },
    campos: [sel('tipo', 'Tipo', [['bala', 'Bala'], ['domo', 'Domo'], ['ptz', 'PTZ (motorizada)']]), sel('montaje', 'Montaje', [['pared', 'En pared'], ['poste', 'En poste'], ['techo', 'Colgada del techo']]), num('alto', 'Altura (m)', 1.5, 12), col('color')], ejes: { sy: 'alto' },
    variantes: [['Bala en pared', {}], ['Domo en techo', { tipo: 'domo', montaje: 'techo', alto: 2.8 }], ['PTZ en poste de 6 m', { tipo: 'ptz', montaje: 'poste', alto: 6 }]],
    partes: (p?) => { const h = p.alto, a = [], c = p.color; let cz = 0;
      if (p.montaje === 'poste') { a.push(Cy(0, h / 2, 0, 0.12, h, '#7d858c'), Cy(0, 0.05, 0, 0.3, 0.1, '#5a5f63'), B(0, h - 0.1, 0.15, 0.06, 0.06, 0.3, '#7d858c')); cz = 0.32; }
      else if (p.montaje === 'techo') { a.push(Cy(0, h + 0.04, 0, 0.14, 0.03, c), Cy(0, h - 0.06, 0, 0.03, 0.18, c)); }
      else { a.push(B(0, h, 0.01, 0.1, 0.14, 0.02, c), B(0, h, 0.09, 0.03, 0.03, 0.16, c)); cz = 0.2; }
      const y = p.montaje === 'techo' ? h - 0.2 : h - 0.06;
      if (p.tipo === 'domo') a.push(Cy(0, y + 0.03, cz, 0.16, 0.04, c), Sp(0, y, cz, 0.13, 0.1, 0.13, '#2a2d30', { t: true }));
      else if (p.tipo === 'ptz') a.push(Cy(0, y + 0.06, cz, 0.18, 0.12, c), Sp(0, y - 0.04, cz, 0.2, 0.18, 0.2, '#2a2d30', { t: true }));
      else a.push(CyZ(0, y, cz + 0.1, 0.09, 0.26, c), B(0, y + 0.06, cz + 0.12, 0.12, 0.012, 0.3, c), CyZ(0, y, cz + 0.235, 0.06, 0.01, '#14161a'));
      return a; } });
  def('reflector_ind', { n: 'Torre de reflectores', cat: 'equipos', def: { alto: 6, cabezas: 2, color: '#6b7178', luz: '#fff6d0' },
    campos: [num('alto', 'Alto (m)', 2, 30), num('cabezas', 'Reflectores', 1, 6, 1), col('color'), col('luz', 'Color de la luz')], ejes: { sy: 'alto' },
    variantes: [['Dos reflectores', {}], ['Torre de estadio (6)', { alto: 18, cabezas: 6 }], ['Uno en poste bajo', { alto: 3.5, cabezas: 1 }]],
    partes: (p?) => { const h = p.alto, n = Math.max(1, Math.round(p.cabezas)), a = [Cy(0, h / 2, 0, 0.16, h, p.color), Cy(0, 0.1, 0, 0.4, 0.2, oscuro(p.color, 0.85))]; const W = Math.max(0.6, n * 0.55);
      if (n > 1) a.push(B(0, h - 0.05, 0.05, W, 0.06, 0.06, p.color)); for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : -W / 2 + 0.25 + i * (W - 0.5) / (n - 1); a.push(B(x, h + 0.12, 0.2, 0.45, 0.32, 0.16, '#2f3337', { r: [0.5, 0, 0] }), B(x, h + 0.1, 0.285, 0.4, 0.26, 0.01, '#f6f2df', { r: [0.5, 0, 0] }), Lz(x, h + 0.02, 0.36, 0.22, p.luz)); }
      return a; } });
  def('cerca_perimetral', { n: 'Cerca perimetral', cat: 'equipos', def: { largo: 10, alto: 2.2, tipo: 'malla', sepPostes: 2.5, concertina: false, color: '#7d848b' },
    campos: [num('largo', 'Largo (m)', 1, 100, 0.5), num('alto', 'Alto (m)', 0.8, 5), sel('tipo', 'Tipo', [['malla', 'Malla eslabonada'], ['reja', 'Reja de barrotes'], ['muro_malla', 'Muro bajo con malla'], ['alambre', 'Alambre de púas']]), num('sepPostes', 'Postes cada (m)', 1, 5, 0.25), chk('concertina', 'Concertina arriba'), col('color')], ejes: { sx: 'largo' },
    variantes: [['Malla de 2,2 m', {}], ['Malla con concertina', { concertina: true, alto: 2.5 }], ['Reja negra', { tipo: 'reja', color: '#202428', alto: 1.8 }], ['Muro con malla', { tipo: 'muro_malla', alto: 2.6 }], ['Alambre de púas', { tipo: 'alambre', alto: 1.5, color: '#6b5a48' }]],
    partes: (p?) => {
      const L = p.largo, H = p.alto, c = p.color, a = [], wP = 0.06, n = Math.max(1, Math.round(L / p.sepPostes)), base = p.tipo === 'muro_malla' ? 0.6 : 0;
      if (base) a.push(B(0, base / 2, 0, L, base, 0.2, '#c4c0b7'), B(0, base + 0.02, 0, L + 0.02, 0.04, 0.24, '#a9a59c'));
      for (let i = 0; i <= n; i++) { const x = -L / 2 + wP / 2 + i * (L - wP) / n; a.push(B(x, H / 2, 0, wP, H, wP, c)); }
      const hm = H - base;
      if (p.tipo === 'malla' || p.tipo === 'muro_malla') { a.push(B(0, base + hm / 2, 0, L - wP, hm - 0.08, 0.012, c, { t: true }), B(0, H - 0.03, 0, L, 0.045, 0.045, c), B(0, base + 0.06, 0, L, 0.015, 0.015, c)); }
      else if (p.tipo === 'reja') { a.push(B(0, H - 0.08, 0, L, 0.05, 0.03, c), B(0, 0.12, 0, L, 0.05, 0.03, c)); const nb = Math.round(L / 0.12); for (let i = 1; i < nb; i++) a.push(B(-L / 2 + i * L / nb, H / 2, 0, 0.02, H - 0.1, 0.02, c)); }
      else for (let k = 0; k < 4; k++) a.push(B(0, 0.3 + k * (H - 0.4) / 3, 0, L, 0.012, 0.012, '#8a8f94'));
      if (p.concertina) { const nc = Math.max(4, Math.round(L / 0.45)), r = 0.3; for (let i = 0; i < nc; i++) { const x = -L / 2 + (i + 0.5) * L / nc; for (let k = 0; k < 6; k++) { const g0 = k * PI / 3, g1 = (k + 1) * PI / 3; a.push(barra([x - 0.1, H + 0.3 + Math.sin(g0) * r, Math.cos(g0) * r], [x + 0.1, H + 0.3 + Math.sin(g1) * r, Math.cos(g1) * r], 0.012, '#c9ced3')); } } }
      return a;
    } });

  /* ---------- vegetación ---------- */
  def('arbol_proc', { n: 'Árbol', cat: 'naturaleza', def: { alto: 6, copa: 'redonda', diametroCopa: 3.5, tronco: 0.3, semilla: 1, color: '#4f7a3a', colorTronco: '#6b4f35' },
    campos: [num('alto', 'Alto (m)', 1.5, 30), sel('copa', 'Copa', [['redonda', 'Redonda'], ['irregular', 'Irregular'], ['conica', 'Cónica (conífera)'], ['columnar', 'Columnar (ciprés)']]), num('diametroCopa', 'Diámetro de la copa (m)', 0.6, 20), num('tronco', 'Grosor del tronco (m)', 0.06, 1.5, 0.02), num('semilla', 'Variación', 1, 50, 1), col('color', 'Color de la copa'), col('colorTronco', 'Color del tronco')], ejes: { sy: 'alto' },
    variantes: [['Pequeño (3 m)', { alto: 3, diametroCopa: 2, tronco: 0.16 }], ['Mediano (6 m)', {}], ['Grande (10 m)', { alto: 10, diametroCopa: 7, tronco: 0.5, copa: 'irregular' }], ['Conífera', { alto: 8, copa: 'conica', diametroCopa: 3.2, color: '#2f5a32' }], ['Ciprés', { alto: 7, copa: 'columnar', diametroCopa: 1.6, color: '#35603a' }], ['Otoñal', { copa: 'irregular', color: '#c07a2a', semilla: 4 }]],
    partes: (p?) => {
      const H = p.alto, Dc = p.diametroCopa, c = p.color, k = oscuro(c, 0.85), l = oscuro(c, 1.12), s = p.semilla | 0, a = [];
      if (p.copa === 'conica') { const hT = H * 0.18; a.push(Cy(0, hT / 2, 0, p.tronco, hT, p.colorTronco)); const n = 5; for (let i = 0; i < n; i++) { const t0 = i / n, yy = hT + (H - hT) * t0, d = Dc * (1 - t0 * 0.82); a.push(...[0, 1, 2].map((j?) => Cy(0, yy + (H - hT) / n * (j + 0.5) / 3 * 0.8, 0, d * (1 - j * 0.22), (H - hT) / n * 0.5, j % 2 ? k : c))); } return a; }
      if (p.copa === 'columnar') { const hT = H * 0.1; a.push(Cy(0, hT / 2, 0, p.tronco, hT, p.colorTronco), Sp(0, hT + (H - hT) / 2, 0, Dc, H - hT, Dc, c), Sp(0.1 * Dc, hT + (H - hT) * 0.42, 0.05 * Dc, Dc * 0.8, (H - hT) * 0.6, Dc * 0.8, k)); return a; }
      const hT = H - Dc * 0.75; a.push(Cy(0, Math.max(0.3, hT) / 2, 0, p.tronco, Math.max(0.3, hT), p.colorTronco));
      const yc = H - Dc / 2; a.push(Sp(0, yc, 0, Dc, Dc * 0.85, Dc, c));
      const nb = p.copa === 'irregular' ? 7 : 4; for (let i = 0; i < nb; i++) { const g = (i / nb + hash(i, s) * 0.3) * 2 * PI, r = Dc * (0.28 + 0.12 * hash(i + 9, s)), d = Dc * (p.copa === 'irregular' ? 0.5 + 0.25 * hash(i + 3, s) : 0.55); a.push(Sp(Math.cos(g) * r, yc + (hash(i + 5, s) - 0.4) * Dc * 0.35, Math.sin(g) * r, d, d * 0.85, d, i % 2 ? k : l)); }
      if (p.copa === 'irregular' && hT > 1) for (let i = 0; i < 3; i++) { const g = i * 2.1 + s; a.push(barra([0, hT * 0.8, 0], [Math.cos(g) * Dc * 0.3, hT + 0.4, Math.sin(g) * Dc * 0.3], p.tronco * 0.45, p.colorTronco)); }
      return a;
    } });
  def('palmera_proc', { n: 'Palmera', cat: 'naturaleza', def: { alto: 7, hojas: 9, inclinacion: 0.25, cocos: true, color: '#4a7a32', colorTronco: '#8a7356' },
    campos: [num('alto', 'Alto (m)', 2, 25), num('hojas', 'Hojas', 4, 16, 1), num('inclinacion', 'Inclinación del tronco (m)', 0, 3), chk('cocos', 'Cocos'), col('color', 'Color de las hojas'), col('colorTronco', 'Color del tronco')], ejes: { sy: 'alto' },
    variantes: [['Cocotera', {}], ['Palmera alta recta', { alto: 12, inclinacion: 0, cocos: false }], ['Palmito pequeño', { alto: 3, hojas: 7, inclinacion: 0, cocos: false }]],
    partes: (p?) => {
      const H = p.alto, n = 8, a = []; let prev = [0, 0, 0];
      for (let i = 1; i <= n; i++) { const t = i / n, x = p.inclinacion * t * t, y = H * 0.94 * t, cur = [x, y, 0]; a.push(tubo(prev, cur, 0.36 - 0.12 * t, i % 2 ? p.colorTronco : oscuro(p.colorTronco, 0.9))); prev = cur; }
      const top = [p.inclinacion, H * 0.94, 0]; a.push(Sp(top[0], top[1], 0, 0.6, 0.5, 0.6, oscuro(p.color, 0.8)));
      const nh = Math.round(p.hojas), L = Math.max(1.2, H * 0.32);
      for (let i = 0; i < nh; i++) { const g = i * 2 * PI / nh, dx = Math.cos(g), dz = -Math.sin(g); const m1 = [top[0] + dx * L * 0.55, top[1] + 0.35, top[2] + dz * L * 0.55], m2 = [top[0] + dx * L, top[1] - L * 0.35, top[2] + dz * L]; a.push(Object.assign(barra(top, m1, 0.05, p.color), { s: [0.5, 0.04, L * 0.6] }), Object.assign(barra(m1, m2, 0.05, oscuro(p.color, 0.9)), { s: [0.42, 0.04, L * 0.6] })); }
      if (p.cocos) for (let i = 0; i < 4; i++) { const g = i * PI / 2 + 0.4; a.push(Sp(top[0] + Math.cos(g) * 0.28, top[1] - 0.25, Math.sin(g) * 0.28, 0.2, 0.22, 0.2, '#5a4a2a')); }
      return a;
    } });
  def('arbusto_proc', { n: 'Arbusto', cat: 'naturaleza', def: { forma: 'bola', ancho: 1.4, alto: 1, largo: 2, flores: false, colorFlores: '#d6457a', semilla: 1, color: '#4f7a3a' },
    campos: [sel('forma', 'Forma', [['bola', 'Bola'], ['mata', 'Mata irregular'], ['seto', 'Seto recortado']]), num('ancho', 'Ancho (m)', 0.3, 6), num('alto', 'Alto (m)', 0.2, 4), num('largo', 'Largo del seto (m)', 0.5, 30, 0.25), chk('flores', 'Con flores'), col('colorFlores', 'Color de las flores'), num('semilla', 'Variación', 1, 50, 1), col('color')], ejes: { sy: 'alto' },
    variantes: [['Bola', {}], ['Mata con flores', { forma: 'mata', flores: true }], ['Seto de 3 m', { forma: 'seto', largo: 3, ancho: 0.7, alto: 1.1, color: '#3e6b34' }], ['Bajo y ancho', { ancho: 2, alto: 0.6 }]],
    partes: (p?) => { const c = p.color, k = oscuro(c, 0.85), l = oscuro(c, 1.1), s = p.semilla | 0, a = [];
      if (p.forma === 'seto') { a.push(B(0, (p.alto - p.ancho * 0.2) / 2, 0, p.largo, p.alto - p.ancho * 0.2, p.ancho, c), CyX(0, p.alto - p.ancho * 0.25, 0, p.ancho * 0.5, p.largo, k, { s: [p.ancho * 0.5, p.largo, p.ancho] })); }
      else if (p.forma === 'mata') { for (let i = 0; i < 6; i++) { const g = hash(i, s) * 2 * PI, r = p.ancho * 0.25 * hash(i + 2, s), d = p.ancho * (0.45 + 0.2 * hash(i + 4, s)); a.push(Sp(Math.cos(g) * r, p.alto * (0.35 + 0.2 * hash(i + 6, s)), Math.sin(g) * r, d, p.alto * 0.7, d, i % 3 ? c : (i % 2 ? k : l))); } }
      else a.push(Sp(0, p.alto / 2, 0, p.ancho, p.alto, p.ancho, c), Sp(p.ancho * 0.18, p.alto * 0.6, p.ancho * 0.1, p.ancho * 0.6, p.alto * 0.6, p.ancho * 0.6, l));
      if (p.flores) { const W = p.forma === 'seto' ? p.largo : p.ancho; for (let i = 0; i < 18; i++) { const x = (hash(i, s + 3) - 0.5) * W * 0.85, z = (hash(i + 30, s + 3) - 0.5) * (p.forma === 'seto' ? p.ancho : p.ancho) * 0.8; a.push(Sp(x, p.alto * (0.75 + 0.22 * hash(i + 60, s)), z, 0.08, 0.06, 0.08, p.colorFlores)); } }
      return a; } });
  def('maceta_proc', { n: 'Maceta', cat: 'naturaleza', def: { tipo: 'redonda', planta: 'arbusto', diametro: 0.5, alto: 0.45, color: '#8a5a3c', colorPlanta: '#4f8a3a' },
    campos: [sel('tipo', 'Maceta', [['juego', 'Planta de oficina (malla del juego)'], ['redonda', 'Redonda'], ['cuadrada', 'Cuadrada'], ['alta', 'Alta (cilíndrica)']]), sel('planta', 'Planta', [['arbusto', 'Arbusto'], ['palmito', 'Palmito'], ['flores', 'Flores'], ['ninguna', 'Sin planta']]), num('diametro', 'Diámetro (m)', 0.2, 2), num('alto', 'Alto de la maceta (m)', 0.15, 1.5), col('color', 'Color de la maceta'), col('colorPlanta', 'Color de la planta')],
    variantes: [['Planta de oficina (malla real)', { tipo: 'juego' }], ['Redonda de barro', {}], ['Cuadrada gris con palmito', { tipo: 'cuadrada', planta: 'palmito', color: '#8f969c' }], ['Alta blanca con flores', { tipo: 'alta', planta: 'flores', color: '#ecebe4', alto: 0.8, diametro: 0.4 }]],
    partes: (p?) => {
      if (p.tipo === 'juego' && window.OOModelos && OOModelos.listo('planta') && OBJ.planta_maceta) { const d = OBJ.planta_maceta.d; return [B(0, d[1] / 2, 0, d[0], d[1], d[2], p.colorPlanta, { oculta: true, modelo: 'planta' })]; }
      const D = p.diametro, h = p.tipo === 'alta' ? p.alto : p.tipo === 'juego' ? 0.4 : p.alto, c = p.color, a = [];
      if (p.tipo === 'cuadrada') a.push(B(0, h / 2, 0, D, h, D, c), B(0, h - 0.01, 0, D - 0.06, 0.02, D - 0.06, '#4a3626')); else a.push(Cy(0, h * 0.45, 0, D * 0.82, h * 0.9, c), Cy(0, h * 0.95, 0, D, h * 0.1, oscuro(c, 0.9)), Cy(0, h - 0.005, 0, D - 0.06, 0.02, '#4a3626'));
      const cp = p.colorPlanta;
      if (p.planta === 'arbusto' || p.tipo === 'juego') a.push(Sp(0, h + D * 0.55, 0, D * 1.3, D * 1.2, D * 1.3, cp), Sp(D * 0.2, h + D * 0.8, 0.05, D * 0.7, D * 0.7, D * 0.7, oscuro(cp, 1.1)));
      else if (p.planta === 'palmito') { a.push(Cy(0, h + 0.3, 0, 0.05, 0.6, '#6b5a3a')); for (let i = 0; i < 7; i++) { const g = i * 2 * PI / 7; a.push(Object.assign(barra([0, h + 0.55, 0], [Math.cos(g) * 0.55, h + 0.75 - 0.25, -Math.sin(g) * 0.55], 0.03, cp), { s: [0.18, 0.02, 0.62] })); } }
      else if (p.planta === 'flores') { a.push(Sp(0, h + 0.12, 0, D * 0.9, 0.25, D * 0.9, cp)); for (let i = 0; i < 12; i++) a.push(Sp((hash(i, 2) - 0.5) * D * 0.7, h + 0.22 + 0.06 * hash(i, 5), (hash(i, 9) - 0.5) * D * 0.7, 0.07, 0.05, 0.07, ['#d6457a', '#f2c230', '#f4f4f4'][i % 3])); }
      return a;
    } });
  def('jardinera', { n: 'Jardinera', cat: 'naturaleza', def: { largo: 2, ancho: 0.6, alto: 0.5, planta: 'arbustos', color: '#9a958c', colorPlanta: '#4f8a3a' },
    campos: [num('largo', 'Largo (m)', 0.4, 20, 0.1), num('ancho', 'Ancho (m)', 0.3, 4), num('alto', 'Alto (m)', 0.15, 1.5), sel('planta', 'Plantas', [['arbustos', 'Arbustos'], ['flores', 'Flores'], ['cesped', 'Césped'], ['ninguna', 'Solo tierra']]), col('color', 'Color de la jardinera'), col('colorPlanta', 'Color de las plantas')], ejes: { sx: 'largo', sz: 'ancho' },
    variantes: [['Hormigón con arbustos', {}], ['Madera con flores', { color: '#8a6440', planta: 'flores' }], ['Larga con césped', { largo: 5, planta: 'cesped', alto: 0.35 }]],
    partes: (p?) => { const L = p.largo, W = p.ancho, h = p.alto, g = 0.08, c = p.color, a = [B(0, h / 2, -W / 2 + g / 2, L, h, g, c), B(0, h / 2, W / 2 - g / 2, L, h, g, c), B(-L / 2 + g / 2, h / 2, 0, g, h, W - 2 * g, c), B(L / 2 - g / 2, h / 2, 0, g, h, W - 2 * g, c), B(0, h - 0.06, 0, L - 2 * g, 0.02, W - 2 * g, '#4a3626')];
      const cp = p.colorPlanta, n = Math.max(1, Math.round(L / 0.5));
      if (p.planta === 'arbustos') for (let i = 0; i < n; i++) a.push(Sp(-L / 2 + (i + 0.5) * L / n, h + 0.12, 0, Math.min(0.55, L / n + 0.1), 0.42, W - 0.1, i % 2 ? cp : oscuro(cp, 1.1)));
      else if (p.planta === 'flores') { a.push(B(0, h - 0.02, 0, L - 2 * g, 0.08, W - 2 * g, cp)); for (let i = 0; i < n * 6; i++) a.push(Sp((hash(i, 3) - 0.5) * (L - 0.2), h + 0.05, (hash(i, 7) - 0.5) * (W - 0.2), 0.07, 0.05, 0.07, ['#d6457a', '#f2c230', '#f4f4f4', '#9a4fd6'][i % 4])); }
      else if (p.planta === 'cesped') a.push(B(0, h - 0.03, 0, L - 2 * g, 0.04, W - 2 * g, '#5f8c3e'));
      return a; } });
  def('roca_proc', { n: 'Roca', cat: 'naturaleza', def: { tam: 1.2, forma: 'redondeada', semilla: 1, color: '#8a8780' },
    campos: [num('tam', 'Tamaño (m)', 0.2, 8), sel('forma', 'Forma', [['redondeada', 'Redondeada'], ['angulosa', 'Angulosa'], ['grupo', 'Grupo de piedras']]), num('semilla', 'Variación', 1, 50, 1), col('color')],
    variantes: [['Canto rodado', {}], ['Roca angulosa', { forma: 'angulosa', tam: 1.5 }], ['Grupo de piedras', { forma: 'grupo', tam: 2 }], ['Peña grande', { forma: 'angulosa', tam: 4, color: '#77736b' }]],
    partes: (p?) => { const S = p.tam, s = p.semilla | 0, c = p.color, a = [];
      const roca = (x?, z?, t?, i?) => p.forma === 'angulosa' ? [B(x, t * 0.32, z, t, t * 0.65, t * 0.8, c, { r: [0.15 * hash(i, s), hash(i + 1, s) * PI, 0.2 * hash(i + 2, s)] }), B(x + t * 0.15, t * 0.5, z - t * 0.1, t * 0.6, t * 0.45, t * 0.55, oscuro(c, 1.08), { r: [0.3, hash(i + 3, s) * PI, 0.25] })] : [Sp(x, t * 0.3, z, t, t * 0.62, t * 0.82, c), Sp(x + t * 0.2, t * 0.38, z + t * 0.1, t * 0.55, t * 0.42, t * 0.5, oscuro(c, 1.06))];
      if (p.forma === 'grupo') for (let i = 0; i < 5; i++) { const g = hash(i, s) * 2 * PI, r = i ? S * 0.35 * (0.5 + hash(i + 7, s)) : 0; a.push(...roca(Math.cos(g) * r, Math.sin(g) * r, S * (i ? 0.25 + 0.15 * hash(i + 2, s) : 0.5), i)); }
      else a.push(...roca(0, 0, S, 0));
      return a; } });
  def('tronco_proc', { n: 'Tronco', cat: 'naturaleza', def: { tipo: 'caido', largo: 3, diametro: 0.45, color: '#6b4f35' },
    campos: [sel('tipo', 'Tipo', [['caido', 'Caído'], ['tocon', 'Tocón']]), num('largo', 'Largo o alto (m)', 0.2, 12), num('diametro', 'Diámetro (m)', 0.1, 2), col('color')],
    variantes: [['Caído', {}], ['Tocón', { tipo: 'tocon', largo: 0.5, diametro: 0.6 }], ['Tronco grande', { largo: 6, diametro: 0.8 }]],
    partes: (p?) => { const d = p.diametro, L = p.largo, c = p.color, cl = '#c9a777', a = [];
      if (p.tipo === 'tocon') { a.push(Cy(0, L / 2, 0, d, L, c), Cy(0, L + 0.005, 0, d * 0.9, 0.01, cl)); for (let i = 0; i < 5; i++) { const g = i * 2 * PI / 5; a.push(barra([Math.cos(g) * d * 0.3, 0.12, Math.sin(g) * d * 0.3], [Math.cos(g) * d * 0.85, 0.02, Math.sin(g) * d * 0.85], d * 0.22, c)); } return a; }
      a.push(CyX(0, d / 2, 0, d, L, c), CyX(-L / 2 - 0.004, d / 2, 0, d * 0.9, 0.01, cl), CyX(L / 2 + 0.004, d / 2, 0, d * 0.9, 0.01, cl), barra([L * 0.15, d * 0.7, 0], [L * 0.25, d * 1.3, d * 0.3], d * 0.18, c), barra([-L * 0.2, d * 0.6, 0], [-L * 0.3, d * 0.9, -d * 0.5], d * 0.15, c));
      return a; } });

  /* ---------- primitivas ---------- */
  const parsePts = (s?, dim?) => String(s || '').split(/[;\n]+/).map((t?) => t.split(/[,\s]+/).filter(Boolean).map(Number)).filter((v?) => v.length >= dim && v.slice(0, dim).every(isFinite)).map((v?) => v.slice(0, dim));
  def('cubo', { n: 'Cubo', cat: 'primitivas', def: { ancho: 1, alto: 1, fondo: 1, color: '#c9c5bc' }, campos: [num('ancho', 'Ancho X (m)', 0.01, 100), num('alto', 'Alto Y (m)', 0.01, 100), num('fondo', 'Fondo Z (m)', 0.01, 100), col('color')], ejes: { sx: 'ancho', sy: 'alto', sz: 'fondo' },
    variantes: [['1 m', {}], ['Bloque 2 × 1 × 1', { ancho: 2 }], ['Muro 4 × 2,5 × 0,2', { ancho: 4, alto: 2.5, fondo: 0.2 }]], partes: (p?) => [B(0, p.alto / 2, 0, p.ancho, p.alto, p.fondo, p.color)] });
  def('prisma', { n: 'Prisma', cat: 'primitivas', def: { lados: 6, diametro: 1, alto: 1, color: '#c9c5bc' }, campos: [num('lados', 'Lados', 3, 32, 1), num('diametro', 'Diámetro (m)', 0.02, 100), num('alto', 'Alto (m)', 0.01, 100), col('color')], ejes: { sy: 'alto' },
    variantes: [['Hexagonal', {}], ['Triangular', { lados: 3 }], ['Octogonal alto', { lados: 8, alto: 2 }]], partes: (p?) => [poly(circulo(p.diametro / 2, Math.round(p.lados), PI / 2, PI / 2 + 2 * PI), 0, p.alto, p.color)] });
  def('cilindro', { n: 'Cilindro', cat: 'primitivas', def: { diametro: 1, alto: 1, color: '#c9c5bc' }, campos: [num('diametro', 'Diámetro (m)', 0.01, 100), num('alto', 'Alto (m)', 0.01, 100), col('color')], ejes: { sy: 'alto' },
    variantes: [['1 m', {}], ['Disco', { alto: 0.1, diametro: 2 }], ['Poste', { diametro: 0.15, alto: 3 }]], partes: (p?) => [Cy(0, p.alto / 2, 0, p.diametro, p.alto, p.color)] });
  def('esfera', { n: 'Esfera', cat: 'primitivas', def: { diametro: 1, color: '#c9c5bc' }, campos: [num('diametro', 'Diámetro (m)', 0.01, 100), col('color')], variantes: [['1 m', {}], ['Bola de 0,5 m', { diametro: 0.5 }]], partes: (p?) => [Sp(0, p.diametro / 2, 0, p.diametro, p.diametro, p.diametro, p.color)] });
  def('cono_prim', { n: 'Cono', cat: 'primitivas', def: { diametro: 1, alto: 1.2, lados: 24, color: '#c9c5bc' }, campos: [num('diametro', 'Diámetro de la base (m)', 0.02, 100), num('alto', 'Alto (m)', 0.02, 100), num('lados', 'Lados', 3, 48, 1), col('color')], ejes: { sy: 'alto' },
    variantes: [['Cono', {}], ['Pirámide de 4 lados', { lados: 4, alto: 1 }], ['Cono bajo', { alto: 0.4, diametro: 1.5 }]],
    partes: (p?) => { const n = Math.round(p.lados), r = p.diametro / 2, h = p.alto, base = circulo(r, n, 0, 2 * PI), a = [poly(base, 0, 0.01, p.color)]; for (let i = 0; i < n; i++) { const q0 = base[i], q1 = base[(i + 1) % n]; a.push(caraPoly([[q0[0], 0, q0[1]], [q1[0], 0, q1[1]], [0, h, 0]], 0.01, p.color)); } return a; } });
  def('plano', { n: 'Plano', cat: 'primitivas', def: { ancho: 2, fondo: 2, color: '#c9c5bc' }, campos: [num('ancho', 'Ancho X (m)', 0.01, 200), num('fondo', 'Fondo Z (m)', 0.01, 200), col('color')], ejes: { sx: 'ancho', sz: 'fondo' },
    variantes: [['2 × 2 m', {}], ['10 × 10 m', { ancho: 10, fondo: 10 }]], partes: (p?) => [B(0, 0.005, 0, p.ancho, 0.01, p.fondo, p.color)] });
  def('tubo_prim', { n: 'Tubo', cat: 'primitivas', def: { diametro: 1, pared: 0.1, alto: 1, orientacion: 'vertical', color: '#c9c5bc' }, campos: [num('diametro', 'Diámetro exterior (m)', 0.04, 50), num('pared', 'Grosor de pared (m)', 0.005, 5, 0.005), num('alto', 'Alto o largo (m)', 0.02, 100), sel('orientacion', 'Orientación', [['vertical', 'Vertical'], ['horizontal', 'Horizontal']]), col('color')],
    variantes: [['Vertical', {}], ['Horizontal (alcantarilla)', { orientacion: 'horizontal', diametro: 1.2, pared: 0.12, alto: 2.5, color: '#a9a59c' }]],
    partes: (p?) => { const R = p.diametro / 2, r = Math.max(0.005, R - p.pared), ext = circulo(R, 36), int = circulo(r, 36).reverse(); if (p.orientacion === 'horizontal') return [perfilX(ext.map(([z, y]) => [z, y + R]), -p.alto / 2, p.alto, p.color, { agujeros: [int.map(([z, y]) => [-z, -(y + R)])] })]; return [poly(ext, 0, p.alto, p.color, { agujeros: [int] })]; } });
  def('arco', { n: 'Arco', cat: 'primitivas', def: { ancho: 2, alto: 2.6, grosor: 0.3, fondo: 0.3, color: '#c9c5bc' }, campos: [num('ancho', 'Ancho total (m)', 0.4, 30), num('alto', 'Alto total (m)', 0.4, 30), num('grosor', 'Grosor del arco (m)', 0.05, 3), num('fondo', 'Fondo (m)', 0.05, 5), col('color')], ejes: { sx: 'ancho', sy: 'alto', sz: 'fondo' },
    variantes: [['Arco de medio punto', {}], ['Arco ancho', { ancho: 4, alto: 3.2, grosor: 0.4 }], ['Pórtico de ladrillo', { color: '#a5553a', fondo: 0.25 }]],
    partes: (p?) => { const W = p.ancho, H = Math.max(p.alto, p.grosor + (W - 2 * p.grosor) / 2 + 0.05), g = Math.min(p.grosor, W / 2 - 0.05), r = W / 2 - g, ys = H - g - r; const arco = circulo(r, 24, 0, PI).map(([x, y]) => [x, ys + y]); const pts = [[-W / 2, 0], [-W / 2, H], [W / 2, H], [W / 2, 0], [W / 2 - g, 0], [W / 2 - g, ys], ...arco.slice(1, -1), [-W / 2 + g, ys], [-W / 2 + g, 0]]; return [perfilZ(pts, -p.fondo / 2, p.fondo, p.color)]; } });
  def('escalon', { n: 'Escalón', cat: 'primitivas', def: { ancho: 1, alto: 0.18, fondo: 0.3, peldanos: 1, color: '#c9c5bc' }, campos: [num('ancho', 'Ancho (m)', 0.2, 20), num('alto', 'Alto de cada peldaño (m)', 0.05, 0.4, 0.01), num('fondo', 'Fondo de cada peldaño (m)', 0.15, 1, 0.01), num('peldanos', 'Peldaños', 1, 20, 1), col('color')], ejes: { sz: 'ancho' },
    variantes: [['Un escalón', {}], ['Tres peldaños', { peldanos: 3 }], ['Grada ancha', { ancho: 4, peldanos: 4, alto: 0.4, fondo: 0.8 }]],
    partes: (p?) => { const n = Math.round(p.peldanos), a = [], L = n * p.fondo; for (let i = 0; i < n; i++) a.push(B(L / 2 - (n - i) * p.fondo / 2, (i + 0.5) * p.alto, 0, (n - i) * p.fondo, p.alto, p.ancho, p.color)); return a; } });
  def('cuna', { n: 'Cuña', cat: 'primitivas', def: { ancho: 1, alto: 0.5, fondo: 1, color: '#c9c5bc' }, campos: [num('ancho', 'Largo X (m)', 0.05, 50), num('alto', 'Alto (m)', 0.02, 50), num('fondo', 'Fondo Z (m)', 0.02, 50), col('color')], ejes: { sx: 'ancho', sy: 'alto', sz: 'fondo' },
    variantes: [['Cuña', {}], ['Rampa baja', { ancho: 2, alto: 0.2, fondo: 1.2 }]], partes: (p?) => [perfilZ([[-p.ancho / 2, 0], [p.ancho / 2, 0], [p.ancho / 2, p.alto]], -p.fondo / 2, p.fondo, p.color)] });
  def('poligono_ext', { n: 'Polígono extruido', cat: 'primitivas', def: { puntos: '0,0; 3,0; 3,2; 1.5,3; 0,2', alto: 0.5, color: '#c9c5bc' }, campos: [txt('puntos', 'Puntos en planta (x,z; x,z…)'), num('alto', 'Alto (m)', 0.005, 100), col('color')], ejes: { sy: 'alto' },
    variantes: [['Pentágono', {}], ['L', { puntos: '0,0; 4,0; 4,1; 1,1; 1,3; 0,3', alto: 0.3 }], ['Triángulo', { puntos: '0,0; 3,0; 1.5,2.6', alto: 1 }]],
    partes: (p?) => { let pts = parsePts(p.puntos, 2); if (pts.length < 3) pts = [[0, 0], [1, 0], [1, 1], [0, 1]]; const cx = pts.reduce((s?, q?) => s + q[0], 0) / pts.length, cz = pts.reduce((s?, q?) => s + q[1], 0) / pts.length; return [poly(pts.map(([x, z]) => [x - cx, z - cz]), 0, p.alto, p.color)]; } });
  def('perfil_puntos', { n: 'Geometría por puntos', cat: 'primitivas', def: { puntos: '0,0; 2,0; 2,0.4; 1.2,1.2; 0,1.2', fondo: 0.5, color: '#c9c5bc' }, campos: [txt('puntos', 'Perfil (x,y; x,y…)'), num('fondo', 'Fondo (m)', 0.005, 100), col('color')], ejes: { sz: 'fondo' },
    variantes: [['Perfil libre', {}], ['Moldura', { puntos: '0,0; 0.3,0; 0.3,0.05; 0.2,0.1; 0.2,0.2; 0,0.25', fondo: 3 }], ['Cartela', { puntos: '0,0; 1,0; 0,1', fondo: 0.2 }]],
    partes: (p?) => { let pts = parsePts(p.puntos, 2); if (pts.length < 3) pts = [[0, 0], [1, 0], [0, 1]]; const cx = (Math.min(...pts.map((q?) => q[0])) + Math.max(...pts.map((q?) => q[0]))) / 2, y0 = Math.min(...pts.map((q?) => q[1])); return [perfilZ(pts.map(([x, y]) => [x - cx, y - y0]), -p.fondo / 2, p.fondo, p.color)]; } });

  /* ===================== motor: parámetros, medidas y escalado ===================== */
  function parametros(clave?, e?) {
    const d = DEFS[clave]; if (!d) return null; const p = Object.assign({}, d.def);
    for (const k in d.def) if (e && e[k] != null && e[k] !== '') { const v = e[k], t = typeof d.def[k]; p[k] = t === 'number' ? (isFinite(+v) ? +v : d.def[k]) : t === 'boolean' ? (v === true || v === 'true' || v === 1) : v; }
    if (e && e.color) p.color = e.color;
    for (const ax in d.ejes || {}) if (e && e[ax] != null && isFinite(+e[ax]) && +e[ax] > 0) p[d.ejes[ax]] = +e[ax];
    return p;
  }
  function natural(clave?, p?) { const parts = DEFS[clave].partes(p); const bb = caja(parts); const s = bb.isEmpty() ? new V3(1, 1, 1) : bb.getSize(new V3()); return { parts, bb, size: [r3(Math.max(0.01, s.x)), r3(Math.max(0.01, s.y)), r3(Math.max(0.01, s.z))] }; }
  function construirProc(clave?, e?) {
    const d = DEFS[clave]; if (!d) return null; const p = parametros(clave, e);
    let r; try { r = natural(clave, p); } catch (err) { console.warn('prefab', clave, err); return null; }
    const ej = d.ejes || {}, k = ['sx', 'sy', 'sz'].map((ax?, i?) => (!ej[ax] && e && +e[ax] > 0) ? +e[ax] / r.size[i] : 1);
    return escalarPartes(r.parts, k[0], k[1], k[2]);
  }
  /* datos completos de un prefab con sus parámetros: la caja (sx, sy, sz) es la natural */
  function datosDe(clave?, extra?) { const d = DEFS[clave]; const p = parametros(clave, extra || {}); const r = natural(clave, p); const out = Object.assign({}, p, extra || {}); for (const k in d.def) out[k] = p[k]; out.sx = r.size[0]; out.sy = r.size[1]; out.sz = r.size[2]; for (const ax in d.ejes || {}) out[ax] = r3(p[d.ejes[ax]]); /* los ejes que son parámetros valen el parámetro: sin deriva */ out.prefab_proc = clave; return out; }

  const construirBase = OO.construir;
  OO.construir = function (o?) { const t = String((o && o.tipo) || ''); if (t.startsWith('proc:')) { const r = construirProc(t.slice(5), (o && o.datos) || {}); if (r) return r; } return construirBase(o); };

  /* ===================== catálogo ===================== */
  const NUEVAS = [['estructura', 'Estructura'], ['edificios', 'Edificios'], ['urbanismo', 'Urbanismo'], ['equipos', 'Industrial'], ['primitivas', 'Primitivas']];
  { const i = CATEGORIAS.findIndex((c?) => c[0] === 'componentes'); const nuevas = NUEVAS.filter(([k]) => !CATEGORIAS.some((c?) => c[0] === k)); CATEGORIAS.splice(i < 0 ? CATEGORIAS.length : i, 0, ...nuevas); }
  for (const clave in DEFS) {
    const d = DEFS[clave]; let datos; try { datos = datosDe(clave); } catch (e) { console.warn('prefab', clave, e); continue; }
    const variantes = (d.variantes || []).map(([n, v], i?) => ({ id: 'proc_' + clave + '@' + i, n, extra: v }));
    ITEMS.push({ id: 'proc_' + clave, n: d.n, cat: d.cat, tipo: 'proc:' + clave, datos, variantes, proc: clave });
  }
  window.OOPiezas = { B, Cy, CyX, CyZ, Sp, Lz, Txt, poly, polyM, perfilZ, perfilX, caraPoly, barra, tubo, transformar, mover, girarY, caja, escalarPartes, circulo };
  window.OOPrefabsProc = { DEFS, parametros, natural, datosDe, construirProc };
})();
