/* Editor del mapa (2.1, Map Editor Pro fase 4): texturas procedurales para la biblioteca de materiales.
   Cada patrón se dibuja en un lienzo (canvas) que se repite sin costuras: ruido de valor periódico, celdas de Voronoi periódicas y
   juntas calculadas sobre (u, v) ∈ [0, 1). Además del color sale un mapa de alturas, del que se saca el normal map (relieve).
   Suciedad y desgaste (0-1) se pintan encima: manchas, mugre en las juntas, zonas gastadas, rayas, desconchones y grietas.
   No depende del editor: OOTexturas.lienzos(patron, opciones) → {color, normal, alto} (canvas). */
(function () {
  'use strict';
  /* ---------- ruido ---------- */
  function hash2(x?, y?, s?) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const md = (k?, n?) => ((k % n) + n) % n;
  /* ruido de valor con periodo `per` (en unidades de la retícula) */
  function vnoise(x?, y?, per?, s?) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = md(xi, per), x1 = md(xi + 1, per), y0 = md(yi, per), y1 = md(yi + 1, per);
    const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /* ruido fractal periódico en (u, v) ∈ [0, 1): per = frecuencia base (entera) */
  function fbm(u?, v?, per?, oct?, s?) { let t = 0, amp = 0.5, f = per, sum = 0; for (let o = 0; o < oct; o++) { t += amp * vnoise(u * f, v * f, f, s + o * 31); sum += amp; amp *= 0.5; f *= 2; } return t / sum; }
  /* ruido estirado (distinta frecuencia en u y en v) */
  function vstretch(u?, v?, fu?, fv?, s?) { return vnoise2(u * fu, v * fv, fu, fv, s); }
  function vnoise2(x?, y?, pu?, pv?, s?) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = md(xi, pu), x1 = md(xi + 1, pu), y0 = md(yi, pv), y1 = md(yi + 1, pv);
    const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /* Voronoi periódico: n × n celdas con jitter; deja d1, d2 e id en VO */
  const VO = { d1: 0, d2: 0, id: 0 };
  function voronoi(u?, v?, n?, s?, jit?) {
    const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, wx = md(cx, n), wy = md(cy, n);
      const px = cx + 0.5 + (hash2(wx, wy, s) - 0.5) * jit, py = cy + 0.5 + (hash2(wx, wy, s + 7) - 0.5) * jit;
      const d = Math.hypot(x - px, y - py);
      if (d < d1) { d2 = d1; d1 = d; id = wy * n + wx; } else if (d < d2) d2 = d;
    }
    VO.d1 = d1; VO.d2 = d2; VO.id = id; return VO;
  }
  const sstep = (a?, b?, x?) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cl = (x?) => x < 0 ? 0 : x > 1 ? 1 : x;
  /* juntas de una retícula rectangular (cols × filas, con desplazamiento de media pieza en filas impares) */
  const RJ = { d: 0, col: 0, fila: 0, fx: 0, fy: 0 };
  function reticula(u?, v?, cols?, filas?, desfase?) {
    const y = v * filas, fila = Math.floor(y), x = u * cols + (desfase && (fila & 1) ? 0.5 : 0), col = md(Math.floor(x), cols);
    const fx = x - Math.floor(x), fy = y - fila;
    RJ.d = Math.min(Math.min(fx, 1 - fx) / cols, Math.min(fy, 1 - fy) / filas); RJ.col = col; RJ.fila = md(fila, filas); RJ.fx = fx; RJ.fy = fy; return RJ;
  }

  /* ---------- patrones: (u, v, C, o, s) → o.r, o.g, o.b (0-1), o.h (0-1), o.a ---------- */
  const tono = (o?, C?, k?) => { o.r = C[0] * k; o.g = C[1] * k; o.b = C[2] * k; };
  const mezclar = (o?, C2?, t?) => { o.r += (C2[0] - o.r) * t; o.g += (C2[1] - o.g) * t; o.b += (C2[2] - o.b) * t; };
  const GRIS_JUNTA = [0.62, 0.6, 0.57], LECHADA = [0.82, 0.8, 0.76];
  const PATRONES = {
    liso(u?, v?, C?, o?, s?) { const n = fbm(u, v, 6, 3, s); tono(o, C, 0.97 + 0.06 * n); o.h = 0.5 + 0.04 * n; },
    hormigon(u?, v?, C?, o?, s?) {
      const n = fbm(u, v, 5, 5, s), m = fbm(u, v, 2, 3, s + 3), p = vnoise(u * 110, v * 110, 110, s + 5);
      const poro = p > 0.88 ? (p - 0.88) / 0.12 : 0; tono(o, C, 0.84 + 0.22 * n + 0.08 * (m - 0.5) - 0.35 * poro); o.h = 0.55 + 0.3 * (n - 0.5) - 0.45 * poro;
    },
    pulido(u?, v?, C?, o?, s?) {
      const n = fbm(u, v, 3, 4, s), g = vnoise(u * 180, v * 180, 180, s + 2); tono(o, C, 0.9 + 0.18 * n + (g > 0.93 ? 0.16 : 0) - (g < 0.04 ? 0.12 : 0)); o.h = 0.5 + 0.03 * n;
    },
    asfalto(u?, v?, C?, o?, s?) {
      const n = fbm(u, v, 6, 3, s), g = vnoise(u * 150, v * 150, 150, s + 1), g2 = vnoise(u * 300, v * 300, 300, s + 9);
      tono(o, C, 0.82 + 0.2 * n + (g > 0.78 ? (g - 0.78) * 2.2 : 0) - (g2 < 0.12 ? 0.18 : 0)); o.h = 0.35 + 0.55 * g;
    },
    adoquin(u?, v?, C?, o?, s?) {
      const r = reticula(u, v, 4, 8, true), w = 0.007, k = 0.82 + 0.3 * hash2(r.col, r.fila, s), n = fbm(u, v, 12, 3, s + 4);
      if (r.d < w) { tono(o, C, 0.45); o.h = 0; return; }
      const b = sstep(w, w + 0.018, r.d); tono(o, C, (k + 0.12 * (n - 0.5)) * (0.82 + 0.18 * b)); o.h = 0.25 + 0.7 * b + 0.05 * n;
    },
    baldosa(u?, v?, C?, o?, s?) {
      const r = reticula(u, v, 4, 4, false), w = 0.004; if (r.d < w) { o.r = LECHADA[0] * 0.92; o.g = LECHADA[1] * 0.92; o.b = LECHADA[2] * 0.92; o.h = 0.1; return; }
      const n = fbm(u, v, 8, 3, s); tono(o, C, 0.95 + 0.08 * hash2(r.col, r.fila, s) + 0.06 * (n - 0.5)); o.h = 0.6 + 0.4 * sstep(w, w + 0.004, r.d);
    },
    ceramica(u?, v?, C?, o?, s?) {
      const r = reticula(u, v, 8, 8, false), w = 0.003; if (r.d < w) { o.r = LECHADA[0]; o.g = LECHADA[1]; o.b = LECHADA[2]; o.h = 0.15; return; }
      tono(o, C, 0.96 + 0.06 * hash2(r.col, r.fila, s) + 0.03 * fbm(u, v, 16, 2, s)); o.h = 0.6 + 0.4 * sstep(w, w + 0.003, r.d);
    },
    porcelanato(u?, v?, C?, o?, s?) {
      const r = reticula(u, v, 2, 2, false), w = 0.0022; if (r.d < w) { tono(o, C, 0.7); o.h = 0.2; return; }
      const t = fbm(u, v, 3, 5, s + r.col * 3 + r.fila), vena = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 3 + t * 4) * Math.PI)), 10);
      tono(o, C, 0.97 + 0.05 * t - 0.12 * vena); o.h = 0.7;
    },
    madera(u?, v?, C?, o?, s?) {
      const cols = 5, x = u * cols, col = md(Math.floor(x), cols), px = x - Math.floor(x), filas = 2, y = v * filas + hash2(col, 0, s) * filas, fila = Math.floor(y), py = y - fila;
      const tabla = hash2(col, md(fila, filas * 4), s + 3), n = fbm(u, v, 2, 3, s + col);
      const veta = Math.sin((px * 9 + n * 5 + tabla * 13 + vstretch(u, v, 20, 2, s + 8) * 1.6) * Math.PI * 2), anillo = vstretch(u, v, 60, 4, s + 11);
      let k = 0.82 + 0.1 * veta + 0.22 * (tabla - 0.5) + 0.08 * (anillo - 0.5);
      const junta = Math.min(px, 1 - px) / cols < 0.0025 || Math.min(py, 1 - py) / filas < 0.0018; if (junta) { k *= 0.55; o.h = 0; } else o.h = 0.6 + 0.08 * veta;
      tono(o, C, k);
    },
    parque(u?, v?, C?, o?, s?) {
      const n = 4, bx = Math.floor(u * n), by = Math.floor(v * n), fx = u * n - bx, fy = v * n - by, rot = (bx + by) & 1;
      const a = rot ? fy : fx, b = rot ? fx : fy, lis = Math.floor(a * 4), pa = a * 4 - lis;
      const t = hash2(bx * 4 + lis, by, s), veta = Math.sin((b * 7 + t * 9 + vnoise(b * 30, pa * 3, 30, s) * 1.5) * Math.PI * 2);
      let k = 0.82 + 0.09 * veta + 0.2 * (t - 0.5); const junta = Math.min(pa, 1 - pa) < 0.035 || Math.min(fx, 1 - fx) < 0.008 || Math.min(fy, 1 - fy) < 0.008;
      if (junta) { k *= 0.55; o.h = 0; } else o.h = 0.6; tono(o, C, k);
    },
    piedra(u?, v?, C?, o?, s?) {
      const q = voronoi(u, v, 5, s, 0.9), j = q.d2 - q.d1, n = fbm(u, v, 10, 4, s + 2);
      if (j < 0.07) { tono(o, C, 0.5); mezclar(o, GRIS_JUNTA, 0.4); o.h = 0; return; }
      tono(o, C, 0.78 + 0.32 * hash2(q.id, 1, s) + 0.18 * (n - 0.5)); o.h = cl(j * 6) * (0.7 + 0.3 * n);
    },
    marmol(u?, v?, C?, o?, s?) {
      const t = fbm(u, v, 3, 6, s), val = Math.abs(Math.sin((u * 2 + v * 3 + t * 6) * Math.PI)), vena = Math.pow(1 - val, 9), fina = Math.pow(1 - Math.abs(Math.sin((u * 5 - v * 2 + t * 9) * Math.PI)), 20);
      tono(o, C, 0.98 + 0.04 * t - 0.32 * vena - 0.15 * fina); o.h = 0.6;
    },
    tierra(u?, v?, C?, o?, s?) {
      const n = fbm(u, v, 5, 5, s), g = vnoise(u * 90, v * 90, 90, s + 4); tono(o, C, 0.72 + 0.45 * n + (g > 0.9 ? 0.25 : 0)); o.h = 0.2 + 0.6 * n + (g > 0.9 ? 0.2 : 0);
    },
    arena(u?, v?, C?, o?, s?) {
      const n = fbm(u, v, 6, 3, s), rizo = Math.sin((v * 22 + n * 4) * Math.PI * 2) * 0.5 + 0.5, g = hash2(Math.floor(u * 512), Math.floor(v * 512), s);
      tono(o, C, 0.9 + 0.1 * n + 0.05 * rizo + 0.08 * (g - 0.5)); o.h = 0.4 + 0.25 * rizo + 0.1 * g;
    },
    cesped(u?, v?, C?, o?, s?) {
      const b = vstretch(u, v, 170, 40, s), b2 = vstretch(u, v, 260, 70, s + 5), m = fbm(u, v, 3, 3, s + 9);
      tono(o, C, 0.62 + 0.42 * b + 0.18 * b2); mezclar(o, [0.66, 0.66, 0.32], 0.35 * sstep(0.55, 0.85, m)); mezclar(o, [0.2, 0.3, 0.12], 0.25 * sstep(0.5, 0.2, m)); o.h = 0.3 + 0.5 * b + 0.2 * b2;
    },
    grava(u?, v?, C?, o?, s?) {
      const q = voronoi(u, v, 14, s, 0.85), r = 0.44; if (q.d1 > r) { tono(o, C, 0.35); o.h = 0; return; }
      const h = Math.sqrt(1 - (q.d1 / r) * (q.d1 / r)); tono(o, C, (0.72 + 0.5 * hash2(q.id, 3, s)) * (0.72 + 0.3 * h)); o.h = h;
    },
    industrial(u?, v?, C?, o?, s?) {
      PATRONES.hormigon(u, v, C, o, s); const ju = Math.min(md(u, 0.5), 0.5 - md(u, 0.5)), jv = Math.min(md(v, 0.5), 0.5 - md(v, 0.5));
      if (Math.min(ju, jv) < 0.0022) { o.r *= 0.5; o.g *= 0.5; o.b *= 0.5; o.h = 0; }
      const m = fbm(u, v, 2, 4, s + 70); if (m > 0.62) { const t = (m - 0.62) * 1.6; o.r *= 1 - t * 0.5; o.g *= 1 - t * 0.5; o.b *= 1 - t * 0.48; }
    },
    diamante(u?, v?, C?, o?, s?) {
      const n = 8, i = Math.floor(u * n), j = Math.floor(v * n), fx = u * n - i - 0.5, fy = v * n - j - 0.5, th = ((i + j) & 1) ? Math.PI / 4 : -Math.PI / 4;
      const a = (fx * Math.cos(th) + fy * Math.sin(th)) / 0.38, b = (-fx * Math.sin(th) + fy * Math.cos(th)) / 0.085, d = Math.abs(a) + Math.abs(b);
      const cep = vstretch(u, v, 300, 6, s);
      if (d < 1) { tono(o, C, 1.08 - 0.12 * (d > 0.8 ? 1 : 0) + 0.04 * cep); o.h = 1 - 0.3 * d; } else { tono(o, C, 0.9 + 0.08 * cep); o.h = 0.2; }
    },
    rejilla(u?, v?, C?, o?, s?) {
      const x = md(u * 10, 1), y = md(v * 4, 1), barra = x < 0.22, cruz = y < 0.06; const cep = vstretch(u, v, 200, 8, s);
      if (barra || cruz) { tono(o, C, (barra ? 1 : 0.85) + 0.06 * cep); o.h = barra ? 1 : 0.7; o.a = 1; } else { tono(o, C, 0.2); o.h = 0; o.a = 0; }
    },
    antideslizante(u?, v?, C?, o?, s?) {
      const n = 10, fx = md(u * n, 1) - 0.5, fy = md(v * n, 1) - 0.5, d = Math.hypot(fx, fy), g = fbm(u, v, 16, 2, s);
      if (d < 0.27) { tono(o, C, 1.15 + 0.04 * g); o.h = 1 - (d / 0.27) * 0.3; } else { tono(o, C, 0.9 + 0.08 * g); o.h = 0.2; }
    },
    oxido(u?, v?, C?, o?, s?) {
      const mask = fbm(u, v, 4, 5, s) + 0.35 * fbm(u, v, 14, 3, s + 3) - 0.17, t = sstep(0.38, 0.55, mask), p = vnoise(u * 140, v * 140, 140, s + 8);
      o.r = 0.42; o.g = 0.43; o.b = 0.45; const k = 0.75 + 0.5 * fbm(u, v, 9, 3, s + 5); mezclar(o, [C[0] * k, C[1] * k, C[2] * k], t);
      if (t > 0.5 && p > 0.86) { o.r *= 0.6; o.g *= 0.55; o.b *= 0.5; } o.h = 0.5 + 0.3 * t - (p > 0.86 ? 0.3 : 0);
    },
    galvanizado(u?, v?, C?, o?, s?) { const q = voronoi(u, v, 10, s, 1), g = fbm(u, v, 24, 2, s + 1); tono(o, C, 0.86 + 0.2 * hash2(q.id, 5, s) + 0.05 * g); o.h = 0.5 + 0.08 * hash2(q.id, 5, s); },
    pintura(u?, v?, C?, o?, s?) { const n = fbm(u, v, 24, 2, s); tono(o, C, 0.96 + 0.06 * n); o.h = 0.5 + 0.12 * n; },
    enlucido(u?, v?, C?, o?, s?) { const n = fbm(u, v, 8, 5, s), g = vnoise(u * 160, v * 160, 160, s + 2); tono(o, C, 0.93 + 0.08 * n + 0.03 * (g - 0.5)); o.h = 0.4 + 0.3 * n + 0.1 * g; },
    ladrillo(u?, v?, C?, o?, s?) {
      const r = reticula(u, v, 4, 14, true), w = 0.0045, n = fbm(u, v, 20, 3, s + 1);
      if (r.d < w) { o.r = GRIS_JUNTA[0] * 1.15; o.g = GRIS_JUNTA[1] * 1.15; o.b = GRIS_JUNTA[2] * 1.12; o.h = 0; return; }
      tono(o, C, 0.78 + 0.32 * hash2(r.col, r.fila, s) + 0.14 * (n - 0.5)); o.h = 0.55 + 0.4 * sstep(w, w + 0.008, r.d) + 0.05 * n;
    },
    bloque(u?, v?, C?, o?, s?) {
      const r = reticula(u, v, 2, 5, true), w = 0.005, n = fbm(u, v, 14, 3, s + 1);
      if (r.d < w) { tono(o, C, 0.72); o.h = 0; return; } tono(o, C, 0.9 + 0.1 * hash2(r.col, r.fila, s) + 0.1 * (n - 0.5)); o.h = 0.6 + 0.3 * sstep(w, w + 0.01, r.d);
    },
    tejas(u?, v?, C?, o?, s?) {
      const filas = 6, cols = 5, y = v * filas, fila = Math.floor(y), fy = y - fila, x = u * cols + ((fila & 1) ? 0.5 : 0), fx = x - Math.floor(x), col = md(Math.floor(x), cols);
      const curva = Math.sin(fx * Math.PI), h = (0.35 + 0.65 * fy) * (0.55 + 0.45 * curva), k = 0.7 + 0.35 * h + 0.18 * (hash2(col, md(fila, filas), s) - 0.5);
      tono(o, C, fy > 0.93 ? 0.45 : k); o.h = fy > 0.93 ? 0 : h;
    },
    chapa(u?, v?, C?, o?, s?) { const x = md(u * 12, 1), ond = Math.sin(x * Math.PI * 2), cep = vstretch(u, v, 6, 260, s); tono(o, C, 0.88 + 0.12 * ond + 0.05 * cep); o.h = 0.5 + 0.5 * ond; }
  };

  /* ---------- lienzos ---------- */
  function hexRGB(hex?) { const h = String(hex || '#cccccc').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c?) => c + c).join('') : h.slice(0, 6), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  /* opciones: {color, tam, suciedad, desgaste, relieve, semilla, grietas} */
  function lienzos(patron?, op?) {
    op = op || {}; const S = Math.max(16, Math.min(1024, op.tam | 0 || 256)), f = PATRONES[patron] || PATRONES.liso, C = hexRGB(op.color), s = (op.semilla | 0) || 1;
    const su = cl(+op.suciedad || 0), de = cl(+op.desgaste || 0), grietas = op.grietas != null ? !!op.grietas : /asfalto|hormigon|industrial|pulido/.test(patron);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); const img = g.createImageData(S, S), px = img.data;
    const H = new Float32Array(S * S); const o = { r: 0, g: 0, b: 0, h: 0.5, a: 1 }; let alfa = false;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, v = (y + 0.5) / S; o.a = 1; f(u, v, C, o, s);
      if (su > 0) { /* manchas de suciedad y mugre en las juntas */
        const d = fbm(u, v, 3, 4, s + 99), m = sstep(0.62 - 0.3 * su, 0.9, d) * su + (1 - o.h) * 0.45 * su;
        const t = Math.min(0.85, m * 0.75); o.r += (0.32 - o.r) * t; o.g += (0.28 - o.g) * t; o.b += (0.22 - o.b) * t;
      }
      if (de > 0) { /* zonas gastadas, rayas, desconchones y grietas */
        const w = fbm(u, v, 6, 4, s + 55), m = sstep(0.72 - 0.35 * de, 0.92, w) * de, gris = (o.r + o.g + o.b) / 3 * 1.12;
        o.r += (gris - o.r) * m * 0.7; o.g += (gris - o.g) * m * 0.7; o.b += (gris - o.b) * m * 0.7; o.h -= m * 0.2;
        const raya = vstretch(u, v, 6, 380, s + 61); if (raya > 0.985 - 0.02 * de) { o.r = Math.min(1, o.r * 1.18); o.g = Math.min(1, o.g * 1.18); o.b = Math.min(1, o.b * 1.18); }
        const ch = vnoise(u * 48, v * 48, 48, s + 63); if (ch > 0.95 - 0.07 * de) { o.r *= 0.72; o.g *= 0.72; o.b *= 0.72; o.h -= 0.35; }
        if (grietas && de > 0.25) { const q = voronoi(u, v, 4, s + 80, 1); if (q.d2 - q.d1 < 0.012 * de && fbm(u, v, 5, 2, s + 81) > 0.42) { o.r *= 0.35; o.g *= 0.35; o.b *= 0.35; o.h = 0; } }
      }
      const i = (y * S + x) * 4; px[i] = cl(o.r) * 255; px[i + 1] = cl(o.g) * 255; px[i + 2] = cl(o.b) * 255; px[i + 3] = o.a > 0.5 ? 255 : 0; if (o.a <= 0.5) alfa = true;
      H[y * S + x] = cl(o.h);
    }
    g.putImageData(img, 0, 0);
    let normal = null;
    if (op.normal !== false) { /* normal map a partir de las alturas (Sobel, con la repetición) */
      const k = (+op.relieve || 1) * S / 96; normal = document.createElement('canvas'); normal.width = normal.height = S; const gn = normal.getContext('2d'), ni = gn.createImageData(S, S), np = ni.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const hx = H[y * S + md(x + 1, S)] - H[y * S + md(x - 1, S)], hy = H[md(y + 1, S) * S + x] - H[md(y - 1, S) * S + x];
        let nx = -hx * k, ny = hy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const i = (y * S + x) * 4; np[i] = (nx * 0.5 + 0.5) * 255; np[i + 1] = (ny * 0.5 + 0.5) * 255; np[i + 2] = (nz * 0.5 + 0.5) * 255; np[i + 3] = 255;
      }
      gn.putImageData(ni, 0, 0);
    }
    return { color: cv, normal, alfa, tam: S };
  }
  window.OOTexturas = { lienzos, PATRONES, fbm, vnoise, voronoi, hexRGB };
})();
