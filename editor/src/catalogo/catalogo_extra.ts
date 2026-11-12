/* Editor del mapa (2.1): catálogo ampliado (cervezas y bar, oficina, comedor, seguridad, bodega, exterior y vehículos).
   Se carga después de catalogo.js y antes de editor.js: añade objetos a OO.OBJ / OO.ITEMS, reordena las categorías y envuelve
   OO.construir para que los objetos que existen en el juego usen su malla real (modelos_juego.js) cuando el servidor la manda.
   Convención de catalogo.js: y = 0 en el suelo, el frente mira a +Z y el ancho va en X (los vehículos, con el morro hacia +X).
   Medidas en metros; las piezas copiadas del juego salen de scripts/mapa_parqueadero.gd y scripts/mapa_complejo.gd. */
(function () {
  'use strict';
  const OO = window.OO; if (!OO) return;
  const { OBJ, ITEMS, CATEGORIAS, COCHES, oscuro } = OO;
  const PI = Math.PI;
  const B = (x?, y?, z?, sx?, sy?, sz?, c?, o?) => Object.assign({ f: 'b', p: [x, y, z], s: [sx, sy, sz], c }, o || {});
  const Cy = (x?, y?, z?, d?, h?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, h, d], c }, o || {});
  const CyZ = (x?, y?, z?, d?, l?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, l, d], c, r: [PI / 2, 0, 0] }, o || {});
  const CyX = (x?, y?, z?, d?, l?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, l, d], c, r: [0, 0, PI / 2] }, o || {});
  const Sp = (x?, y?, z?, sx?, sy?, sz?, c?, o?) => Object.assign({ f: 's', p: [x, y, z], s: [sx, sy, sz], c }, o || {});
  const Txt = (texto?, x?, y?, z?, w?, h?, bg?, fg?, o?) => Object.assign({ f: 't', texto, p: [x, y, z], w, h, bg, fg }, o || {});
  const Rueda = (x?, y?, z?, d?, w?) => CyZ(x, y, z, d, w, '#1b1b1b');
  /* cono truncado: n cilindros apilados desde y0 */
  function cono(x?, y0?, z?, d0?, d1?, h?, c?, n?) { n = n || 4; const a = []; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; a.push(Cy(x, y0 + h * t, z, d0 + (d1 - d0) * t, h / n + 0.002, c)); } return a; }
  /* gira un grupo de piezas alrededor del eje Y que pasa por (cx, cz) */
  function girar(partes?, cx?, cz?, ang?) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return partes.map((p?) => { const x = p.p[0] - cx, z = p.p[2] - cz; const q = Object.assign({}, p); q.p = [cx + x * c + z * s, p.p[1], cz - x * s + z * c]; q.r = [(p.r && p.r[0]) || 0, ang + ((p.r && p.r[1]) || 0), (p.r && p.r[2]) || 0]; return q; });
  }
  const mover = (partes?, dx?, dy?, dz?) => partes.map((p?) => Object.assign({}, p, { p: [p.p[0] + dx, p.p[1] + dy, p.p[2] + dz] }));

  /* colores comunes (los del juego cuando existen) */
  const ROJO = '#a31f1a', BLANCO = '#ececea', NEGRO = '#1a1b1d', GOMA = '#1b1b1b', ACERO = '#b8bcc0', INOX = '#c9ced3', MARCO = '#2a2d30';
  const VIDRIO = '#9cc7e0', AMARILLO = '#e0b81a', CARTON = '#b48a5a', CINTA = '#d9c79a', MADERA = '#b07638';

  /* ===================== cervezas de Ecuador ===================== */
  const MARCAS = {
    pilsener: { n: 'Pilsener', vidrio: '#5b3415', etiqueta: '#f3efe4', franja: '#c8202f', tapa: '#c8202f', lata: '#f3f1ea', lata2: '#c8202f' },
    club: { n: 'Club', vidrio: '#1f5530', etiqueta: '#f0e7c6', franja: '#1d6b3a', tapa: '#c9a43a', lata: '#1d6b3a', lata2: '#c9a43a' },
    paulaner: { n: 'Paulaner', vidrio: '#4a2a12', etiqueta: '#f5f5f5', franja: '#1d3f8f', tapa: '#c9a43a', lata: '#f5f5f5', lata2: '#1d3f8f' }
  };
  /* botella de vidrio: h = alto total (600 ml ≈ 0,29 m; 330 ml ≈ 0,235 m) */
  function botella(m?, x?, y0?, z?, h?) {
    const d = 0.075 * h / 0.29;
    return [Cy(x, y0 + h * 0.31, z, d, h * 0.62, m.vidrio), Cy(x, y0 + h * 0.66, z, d * 0.8, h * 0.08, m.vidrio), Cy(x, y0 + h * 0.74, z, d * 0.52, h * 0.08, m.vidrio),
      Cy(x, y0 + h * 0.88, z, d * 0.37, h * 0.2, m.vidrio), Cy(x, y0 + h * 0.985, z, d * 0.41, h * 0.03, m.tapa),
      Cy(x, y0 + h * 0.34, z, d * 1.02, h * 0.3, m.etiqueta), Cy(x, y0 + h * 0.34, z, d * 1.03, h * 0.08, m.franja), Cy(x, y0 + h * 0.85, z, d * 0.4, h * 0.06, m.etiqueta)];
  }
  /* lata: 355 ml = 0,122 m de alto; 473/500 ml ≈ 0,165 m */
  function lata(m?, x?, y0?, z?, h?) {
    const d = 0.066;
    return [Cy(x, y0 + 0.006, z, d * 0.9, 0.012, ACERO), Cy(x, y0 + h / 2, z, d, h - 0.022, m.lata), Cy(x, y0 + h * 0.45, z, d * 1.005, h * 0.3, m.lata2), Cy(x, y0 + h - 0.008, z, d * 0.86, 0.016, ACERO)];
  }
  const fondoBotellas = (marca?, x0?, z0?, nx?, nz?, sep?, y0?, h?) => { const a = []; for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) a.push(...botella(MARCAS[marca], x0 + i * sep, y0, z0 + k * sep, h)); return a; };

  function sixPack(marca?, enBotella?) {
    const m = MARCAS[marca], a = [];
    if (enBotella) {
      a.push(B(0, 0.08, 0, 0.2, 0.16, 0.135, m.franja), B(0, 0.25, 0, 0.012, 0.18, 0.13, m.franja), B(0, 0.31, 0, 0.012, 0.05, 0.06, '#f3efe4'));
      for (const x of [-0.065, 0, 0.065]) for (const z of [-0.033, 0.033]) a.push(...botella(m, x, 0.005, z, 0.235));
      a.push(B(0, 0.1, 0.069, 0.16, 0.08, 0.002, '#f3efe4'));
    } else {
      for (const x of [-0.067, 0, 0.067]) for (const z of [-0.034, 0.034]) a.push(...lata(m, x, 0, z, 0.122));
      a.push(B(0, 0.118, 0, 0.205, 0.006, 0.14, '#e8e8e8', { t: true }));
    }
    return a;
  }
  function jaba(marca?, color?) {
    const a = [], W = 0.42, D = 0.32, H = 0.22, t = 0.012;
    a.push(B(0, 0.008, 0, W, 0.016, D, color));
    for (const s of [-1, 1]) { a.push(B(0, H / 2, s * (D / 2 - t / 2), W, H, t, color), B(s * (W / 2 - t / 2), H / 2, 0, t, H, D, color)); }
    for (const s of [-1, 1]) { a.push(B(s * (W / 2 - t / 2 + 0.002), H - 0.05, 0, 0.004, 0.035, 0.12, '#111111')); a.push(B(0, H * 0.45, s * (D / 2 + 0.002), W * 0.6, 0.07, 0.004, '#f3efe4')); }
    for (let i = 1; i < 4; i++) a.push(B(-W / 2 + i * W / 4, H * 0.55, 0, 0.006, H * 0.9, D - 0.02, oscuro(color, 0.8)));
    for (let k = 1; k < 3; k++) a.push(B(0, H * 0.55, -D / 2 + k * D / 3, W - 0.02, H * 0.9, 0.006, oscuro(color, 0.8)));
    if (marca) a.push(...fondoBotellas(marca, -0.157, -0.105, 4, 3, 0.105, 0.016, 0.29));
    return a;
  }

  const NUEVOS = {
    /* ---------- cervezas y bar ---------- */
    botella_pilsener: { n: 'Botella de Pilsener (600 ml)', d: [0.075, 0.29, 0.075], color: '#5b3415', modelo: 'pilsener', partes: () => botella(MARCAS.pilsener, 0, 0, 0, 0.29) },
    botella_club: { n: 'Botella de Club (600 ml)', d: [0.075, 0.29, 0.075], color: '#1f5530', partes: () => botella(MARCAS.club, 0, 0, 0, 0.29) },
    botella_paulaner: { n: 'Botella de Paulaner (330 ml)', d: [0.062, 0.235, 0.062], color: '#4a2a12', modelo: 'paulaner', partes: () => botella(MARCAS.paulaner, 0, 0, 0, 0.235) },
    lata_pilsener: { n: 'Lata de Pilsener (355 ml)', d: [0.066, 0.122, 0.066], color: '#f3f1ea', partes: () => lata(MARCAS.pilsener, 0, 0, 0, 0.122) },
    lata_club: { n: 'Lata de Club (355 ml)', d: [0.066, 0.122, 0.066], color: '#1d6b3a', partes: () => lata(MARCAS.club, 0, 0, 0, 0.122) },
    lata_paulaner: { n: 'Lata de Paulaner (500 ml)', d: [0.066, 0.168, 0.066], color: '#f5f5f5', partes: () => lata(MARCAS.paulaner, 0, 0, 0, 0.168) },
    sixpack_pilsener: { n: 'Six pack de Pilsener (latas)', d: [0.205, 0.124, 0.14], color: '#c8202f', partes: () => sixPack('pilsener', false) },
    sixpack_club: { n: 'Six pack de Club (botellas)', d: [0.2, 0.34, 0.14], color: '#1d6b3a', partes: () => sixPack('club', true) },
    jaba_pilsener: { n: 'Jaba de Pilsener (12 × 600 ml)', d: [0.42, 0.306, 0.32], color: '#1f3f8f', partes: (c?) => jaba('pilsener', c) },
    jaba_club: { n: 'Jaba de Club (12 × 600 ml)', d: [0.42, 0.306, 0.32], color: '#1d6b3a', partes: (c?) => jaba('club', c) },
    pila_jabas: { n: 'Pila de jabas vacías (5)', d: [0.42, 1.1, 0.32], color: '#1f3f8f', partes: (c?) => { const a = []; for (let k = 0; k < 5; k++) a.push(...mover(jaba(null, c), 0, k * 0.22, 0)); return a; } },
    barril_cerveza: { n: 'Barril de cerveza (50 L)', d: [0.41, 0.62, 0.41], color: ACERO, partes: (c?) => [Cy(0, 0.3, 0, 0.395, 0.52, c), Cy(0, 0.03, 0, 0.41, 0.06, oscuro(c, 0.8)), Cy(0, 0.57, 0, 0.41, 0.06, oscuro(c, 0.8)), Cy(0, 0.2, 0, 0.405, 0.02, oscuro(c, 0.7)), Cy(0, 0.4, 0, 0.405, 0.02, oscuro(c, 0.7)), Cy(0, 0.61, 0, 0.07, 0.03, NEGRO), B(0.14, 0.58, 0, 0.1, 0.03, 0.05, NEGRO), B(-0.14, 0.58, 0, 0.1, 0.03, 0.05, NEGRO)] },
    nevera_bebidas: {
      n: 'Nevera de bebidas con puerta de vidrio', d: [0.62, 1.98, 0.68], color: '#c8202f', texto: 'Pilsener',
      partes: (c?, e?) => {
        const W = 0.62, H = 1.98, D = 0.68, a = [B(0, H / 2, -D / 2 + 0.02, W, H, 0.04, c), B(-W / 2 + 0.02, H / 2, 0, 0.04, H, D, c), B(W / 2 - 0.02, H / 2, 0, 0.04, H, D, c), B(0, H - 0.02, 0, W, 0.04, D, c), B(0, 0.075, 0, W, 0.15, D, c)];
        a.push(B(0, 0.075, D / 2 + 0.003, W - 0.06, 0.1, 0.006, '#222222'));
        a.push(B(0, 0.95, -D / 2 + 0.045, W - 0.08, 1.55, 0.01, '#f4f4f4'));
        for (let k = 0; k < 5; k++) { const y = 0.22 + k * 0.3; a.push(B(0, y, 0, W - 0.08, 0.012, D - 0.12, '#d0d4d8')); if (k < 4) { for (let i = 0; i < 4; i++) a.push(...botella(k % 2 ? MARCAS.club : MARCAS.pilsener, -0.195 + i * 0.13, y + 0.006, 0.12, 0.235)); } }
        a.push(B(0, 1.0, D / 2 - 0.02, W - 0.1, 1.62, 0.012, VIDRIO, { t: true }));
        a.push(B(-W / 2 + 0.035, 1.0, D / 2 - 0.02, 0.05, 1.66, 0.03, oscuro(c, 0.7)), B(W / 2 - 0.035, 1.0, D / 2 - 0.02, 0.05, 1.66, 0.03, oscuro(c, 0.7)), B(0, 1.82, D / 2 - 0.02, W, 0.04, 0.03, oscuro(c, 0.7)), B(0, 0.18, D / 2 - 0.02, W, 0.04, 0.03, oscuro(c, 0.7)));
        a.push(B(W / 2 - 0.07, 1.0, D / 2 + 0.01, 0.025, 0.5, 0.03, '#cfd3d6'));
        a.push(B(0, 1.9, D / 2 + 0.001, W - 0.04, 0.12, 0.01, '#ffffff'), Txt((e && e.texto) || 'Pilsener', 0, 1.9, D / 2 + 0.008, W - 0.08, 0.1, '#ffffff', c));
        return a;
      }
    },
    cooler: { n: 'Cooler (hielera)', d: [0.62, 0.42, 0.4], color: '#c8202f', partes: (c?) => [B(0, 0.17, 0, 0.6, 0.32, 0.38, c), B(0, 0.36, 0, 0.62, 0.08, 0.4, '#f2f2f2'), B(0, 0.402, 0.05, 0.45, 0.006, 0.12, '#d8d8d8'), B(-0.32, 0.25, 0, 0.03, 0.04, 0.16, '#d8d8d8'), B(0.32, 0.25, 0, 0.03, 0.04, 0.16, '#d8d8d8'), B(0, 0.34, 0.205, 0.08, 0.05, 0.02, '#d8d8d8'), B(0, 0.015, 0, 0.58, 0.03, 0.36, oscuro(c, 0.7))] },
    mesa_bar: { n: 'Mesa alta de bar', d: [0.6, 1.06, 0.6], color: '#3b2a1e', partes: (c?) => [Cy(0, 1.045, 0, 0.6, 0.03, c), Cy(0, 1.025, 0, 0.56, 0.02, oscuro(c, 0.7)), Cy(0, 0.53, 0, 0.07, 1.0, MARCO), Cy(0, 0.015, 0, 0.46, 0.03, MARCO), Cy(0, 0.04, 0, 0.3, 0.03, oscuro(MARCO, 1.3))] },
    taburete: { n: 'Taburete de bar', d: [0.38, 0.78, 0.38], color: '#1f1f1f', partes: (c?) => [Cy(0, 0.755, 0, 0.36, 0.05, c), Cy(0, 0.72, 0, 0.3, 0.03, MARCO), Cy(0, 0.37, 0, 0.05, 0.7, ACERO), Cy(0, 0.28, 0, 0.32, 0.02, ACERO), Cy(0, 0.012, 0, 0.38, 0.024, ACERO)] },
    barra_bar: {
      n: 'Barra de bar', d: [2.4, 1.1, 0.65], color: '#6b4527',
      partes: (c?) => [B(0, 0.52, -0.05, 2.36, 1.04, 0.45, c), B(0, 1.08, 0, 2.4, 0.04, 0.65, oscuro(c, 0.75)), B(0, 0.05, 0.18, 2.36, 0.1, 0.03, '#2a2a2a'), CyX(0, 0.22, 0.27, 0.04, 2.3, ACERO), ...[-1.1, 0, 1.1].map((x?) => B(x, 0.15, 0.24, 0.03, 0.03, 0.08, ACERO)), ...[-0.8, 0, 0.8].map((x?) => B(x, 0.6, 0.177, 0.7, 0.75, 0.01, oscuro(c, 1.12)))]
    },
    vaso_cerveza: { n: 'Vaso de cerveza', d: [0.085, 0.155, 0.085], color: '#d99a2b', partes: (c?) => [Cy(0, 0.0775, 0, 0.085, 0.155, '#dfeef5', { t: true }), Cy(0, 0.06, 0, 0.078, 0.11, c), Cy(0, 0.13, 0, 0.079, 0.03, '#f6f1e2')] },
    bandeja_vasos: { n: 'Bandeja con vasos', d: [0.4, 0.17, 0.3], color: '#d99a2b', partes: (c?) => { const a = [B(0, 0.008, 0, 0.4, 0.016, 0.3, ACERO)]; for (const x of [-0.1, 0.1]) for (const z of [-0.07, 0.07]) a.push(Cy(x, 0.093, z, 0.085, 0.155, '#dfeef5', { t: true }), Cy(x, 0.075, z, 0.078, 0.11, c), Cy(x, 0.145, z, 0.079, 0.03, '#f6f1e2')); return a; } },
    mesa_plastica: { n: 'Mesa plástica (Pilsener)', d: [0.7, 0.72, 0.7], color: '#c8202f', partes: (c?) => [B(0, 0.7, 0, 0.7, 0.04, 0.7, c), B(0, 0.66, 0, 0.66, 0.04, 0.66, oscuro(c, 0.85)), ...[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([x, z]) => B(x, 0.33, z, 0.06, 0.66, 0.06, c)), Txt('Pilsener', 0, 0.68, 0.336, 0.4, 0.05, oscuro(c, 0.85), '#ffffff')] },
    silla_plastica: { n: 'Silla plástica', d: [0.46, 0.82, 0.48], color: '#c8202f', partes: (c?) => [B(0, 0.43, 0.02, 0.44, 0.04, 0.42, c), B(0, 0.64, -0.2, 0.44, 0.36, 0.04, c, { r: [-0.12, 0, 0] }), ...[[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.2], [0.19, 0.2]].map(([x, z]) => B(x, 0.21, z, 0.05, 0.42, 0.05, c)), B(-0.21, 0.56, 0, 0.03, 0.03, 0.36, c), B(0.21, 0.56, 0, 0.03, 0.03, 0.36, c)] },

    /* ---------- oficina ---------- */
    escritorio_pc: {
      n: 'Escritorio con monitores y teclado', d: [1.6, 1.21, 0.75], color: '#a9afb3',
      partes: (c?) => {
        const L = 1.6, F = 0.75, lam = oscuro(c, 0.82), canto = '#555e65', ng = '#0f1113';
        const a = [B(0, 0.74, 0, L, 0.05, F, c), B(0, 0.36, -F / 2 + 0.04, L - 0.1, 0.7, 0.03, lam), B(-(L / 2 - 0.04), 0.36, 0, 0.03, 0.7, F - 0.1, lam), B(L / 2 - 0.04, 0.36, 0, 0.03, 0.7, F - 0.1, lam), B(0, 0.738, F / 2 + 0.005, L, 0.032, 0.015, canto), B(0, 0.738, -F / 2 - 0.005, L, 0.032, 0.015, canto)];
        for (const lado of [-1, 1]) a.push(...girar(monitorPartes(0, 0.765, -F / 2 + 0.2), 0, -F / 2 + 0.2, -lado * 0.18).map((p?) => Object.assign(p, { p: [p.p[0] + lado * 0.34, p.p[1], p.p[2]] })));
        a.push(B(L / 2 - 0.3, 0.22, -F / 2 + 0.3, 0.2, 0.42, 0.42, ng), B(L / 2 - 0.3, 0.3, -F / 2 + 0.511, 0.16, 0.004, 0.004, '#4fa3ff'));
        a.push(B(0, 0.775, 0.06, 0.42, 0.015, 0.14, ng)); for (let f = 0; f < 4; f++) a.push(B(0, 0.786, 0.01 + f * 0.027, 0.38, 0.006, 0.019, canto));
        a.push(B(0.34, 0.775, 0.06, 0.06, 0.02, 0.1, ng), B(0.7, 0.768, 0, 0.3, 0.004, 0.22, '#f4f4f2'), Cy(-0.42, 0.813, 0.2, 0.08, 0.095, '#d4d5d4'));
        return a;
      }
    },
    monitor: { n: 'Monitor', d: [0.55, 0.42, 0.18], color: '#14161a', modelo: 'monitor', partes: () => monitorPartes(0, 0, 0) },
    telefono: { n: 'Teléfono de escritorio', d: [0.21, 0.12, 0.3], color: '#282927', modelo: 'telefono', partes: (c?) => [B(0, 0.03, 0, 0.21, 0.06, 0.3, c, { r: [0.12, 0, 0] }), B(-0.05, 0.08, 0, 0.06, 0.05, 0.26, oscuro(c, 0.7)), B(0.05, 0.065, 0.04, 0.09, 0.005, 0.12, '#555555'), B(0.05, 0.066, -0.07, 0.09, 0.003, 0.05, '#7aa7c7')] },
    taza: { n: 'Taza', d: [0.085, 0.095, 0.117], color: '#d4d5d4', modelo: 'taza', partes: (c?) => [Cy(0, 0.0475, -0.016, 0.085, 0.095, c), B(0, 0.05, 0.04, 0.012, 0.055, 0.03, c), Cy(0, 0.09, -0.016, 0.075, 0.004, '#3b2414')] },
    disco_duro: { n: 'Disco duro externo', d: [0.079, 0.014, 0.115], color: '#232222', modelo: 'disco_duro', partes: (c?) => [B(0, 0.007, 0, 0.079, 0.014, 0.115, c), B(0, 0.0142, 0.04, 0.01, 0.001, 0.01, '#4fa3ff')] },
    impresora: { n: 'Impresora', d: [0.39, 0.42, 0.41], color: '#8b8a88', modelo: 'impresora', partes: (c?) => [B(0, 0.15, 0, 0.39, 0.3, 0.41, c), B(0, 0.34, -0.05, 0.37, 0.08, 0.3, oscuro(c, 1.15)), B(0, 0.08, 0.22, 0.3, 0.06, 0.04, oscuro(c, 0.8)), B(0.13, 0.32, 0.12, 0.1, 0.02, 0.08, '#2a2a2a'), B(0, 0.4, -0.12, 0.3, 0.004, 0.2, '#f4f4f2', { r: [-0.5, 0, 0] })] },
    fotocopiadora: { n: 'Fotocopiadora multifunción', d: [0.62, 1.15, 0.66], color: '#e3e4e1', partes: (c?) => [B(0, 0.45, 0, 0.6, 0.9, 0.64, c), B(0, 1.02, -0.02, 0.6, 0.12, 0.6, oscuro(c, 0.92)), B(0, 1.1, -0.04, 0.56, 0.05, 0.5, '#3a3d40'), B(0.2, 0.98, 0.31, 0.18, 0.08, 0.06, '#2a2d30', { r: [-0.4, 0, 0] }), ...[0.2, 0.42, 0.64].map((y?) => B(0, y, 0.322, 0.56, 0.005, 0.005, '#9a9c9a')), B(0, 0.42, 0.33, 0.2, 0.025, 0.02, '#7a7c7a'), B(0, 0.03, 0, 0.62, 0.06, 0.66, '#3a3d40')] },
    armario: { n: 'Armario rodante con cajones', d: [0.67, 1.1, 0.53], color: '#72342d', modelo: 'armario', partes: (c?) => [B(0, 0.55, 0, 0.67, 1.1, 0.53, c), B(-0.165, 0.56, 0.267, 0.32, 0.98, 0.006, oscuro(c, 1.12)), B(0.165, 0.56, 0.267, 0.32, 0.98, 0.006, oscuro(c, 1.12)), B(-0.03, 0.6, 0.275, 0.015, 0.12, 0.015, ACERO), B(0.03, 0.6, 0.275, 0.015, 0.12, 0.015, ACERO), B(0, 1.11, 0, 0.7, 0.03, 0.55, oscuro(c, 0.85))] },
    reloj_pared: { n: 'Reloj de pared', d: [0.32, 2.36, 0.05], color: '#f4f4f2', partes: (c?) => [CyZ(0, 2.2, 0, 0.32, 0.045, '#1d1e20'), CyZ(0, 2.2, 0.004, 0.29, 0.045, c), B(0, 2.24, 0.03, 0.012, 0.09, 0.004, '#111111'), B(0.045, 2.2, 0.032, 0.11, 0.008, 0.004, '#111111', { r: [0, 0, 0.3] }), B(0, 2.17, 0.034, 0.003, 0.12, 0.003, '#c62828', { r: [0, 0, -0.9] }), CyZ(0, 2.2, 0.035, 0.016, 0.006, '#111111'), ...[0, 1, 2, 3].map((k?) => B(Math.sin(k * PI / 2) * 0.12, 2.2 + Math.cos(k * PI / 2) * 0.12, 0.028, k % 2 ? 0.03 : 0.008, k % 2 ? 0.008 : 0.03, 0.003, '#222222'))] },
    ventilador: {
      n: 'Ventilador de pie', d: [0.46, 1.32, 0.42], color: '#e9eae8',
      partes: (c?) => {
        const a = [Cy(0, 0.02, 0, 0.42, 0.04, c), Cy(0, 0.06, 0, 0.12, 0.05, oscuro(c, 0.85)), Cy(0, 0.55, 0, 0.035, 1.0, ACERO), B(0, 1.06, -0.12, 0.11, 0.14, 0.18, c), CyZ(0, 1.07, 0.02, 0.1, 0.12, c)];
        a.push(CyZ(0, 1.07, 0.05, 0.46, 0.012, '#bfc3c6', { t: true }), CyZ(0, 1.07, 0.13, 0.46, 0.012, '#bfc3c6', { t: true }), CyZ(0, 1.07, 0.09, 0.07, 0.03, '#2a6fb0'));
        for (let k = 0; k < 3; k++) { const g = k * 2 * PI / 3; a.push(B(Math.cos(g) * 0.09, 1.07 + Math.sin(g) * 0.09, 0.09, 0.17, 0.08, 0.006, '#7fb3dc', { r: [0, 0, g] })); }
        return a;
      }
    },
    split: {
      n: 'Aire acondicionado split (interior)', d: [0.95, 2.55, 0.24], color: '#f4f4f2',
      partes: (c?) => [B(0, 2.4, -0.02, 0.95, 0.28, 0.2, c), B(0, 2.325, 0.09, 0.85, 0.08, 0.025, '#d8dadc'), ...[0, 1, 2, 3].map((k?) => B(0, 2.29 + k * 0.02, 0.11, 0.81, 0.009, 0.035, '#c8cacc')), B(0.32, 2.415, 0.088, 0.09, 0.035, 0.005, '#d8dadc'), B(0.34, 2.415, 0.095, 0.025, 0.009, 0.002, '#74b3b4')]
    },
    condensadora: {
      n: 'Aire acondicionado (unidad exterior)', d: [0.9, 0.62, 0.36], color: '#ecedeb',
      partes: (c?) => {
        const a = [B(0, 0.34, 0, 0.9, 0.55, 0.3, c), B(0, 0.03, 0, 0.7, 0.06, 0.36, '#5a5f63'), CyZ(-0.12, 0.34, 0.155, 0.42, 0.01, '#3a3d40'), CyZ(-0.12, 0.34, 0.165, 0.4, 0.008, '#bfc3c6', { t: true }), CyZ(-0.12, 0.34, 0.16, 0.08, 0.02, '#2a2d30')];
        for (let k = 0; k < 3; k++) { const g = k * 2 * PI / 3; a.push(B(-0.12 + Math.cos(g) * 0.08, 0.34 + Math.sin(g) * 0.08, 0.158, 0.16, 0.065, 0.006, '#8d949b', { r: [0, 0, g] })); }
        for (let r = 0; r < 7; r++) a.push(B(0.28, 0.19 + r * 0.05, 0.152, 0.16, 0.012, 0.006, '#9aa1a8'));
        a.push(B(0.46, 0.2, 0.08, 0.02, 0.1, 0.06, '#7d848b'), CyX(0.5, 0.18, 0.06, 0.04, 0.08, '#2a2d30'));
        return a;
      }
    },

    /* ---------- seguridad ---------- */
    extintor: {
      n: 'Extintor con tablero', d: [0.4, 2.11, 0.3], color: ROJO,
      partes: (c?) => {
        const az = '#1f4fa0', am = '#d8b020', w = -0.15; // w: del pie de la pared (juego) al centro de la caja del objeto
        const a = [B(0, 0.8, 0.03 + w, 0.4, 1.6, 0.05, c), B(0, 1.95, 0.03 + w, 0.32, 0.32, 0.03, c), B(0, 1.95, 0.05 + w, 0.2, 0.2, 0.02, BLANCO), B(0, 1.95, 0.065 + w, 0.08, 0.14, 0.01, c)];
        a.push(Cy(0, 0.085, 0.17 + w, 0.23, 0.07, MARCO), Cy(0, 0.37, 0.17 + w, 0.22, 0.5, c), ...cono(0, 0.62, 0.17 + w, 0.22, 0.09, 0.1, c, 2), Cy(0, 0.76, 0.17 + w, 0.08, 0.08, NEGRO));
        a.push(B(0, 0.4, 0.285 + w, 0.12, 0.22, 0.01, BLANCO), B(0, 0.5, 0.29 + w, 0.1, 0.06, 0.01, az), B(0, 0.3, 0.29 + w, 0.1, 0.04, 0.01, am));
        for (const y of [0.25, 0.55]) a.push(B(0, y, 0.17 + w, 0.25, 0.03, 0.25, NEGRO));
        a.push(B(0.03, 0.82, 0.17 + w, 0.15, 0.05, 0.06, NEGRO), B(-0.04, 0.78, 0.17 + w, 0.12, 0.03, 0.05, NEGRO), B(0.1, 0.78, 0.2 + w, 0.03, 0.03, 0.04, am), B(-0.08, 0.74, 0.24 + w, 0.05, 0.05, 0.03, BLANCO));
        a.push(B(0.12, 0.62, 0.17 + w, 0.025, 0.4, 0.025, NEGRO), B(0.1, 0.4, 0.2 + w, 0.1, 0.025, 0.025, NEGRO, { r: [0, 0, 0.5] }), B(0.06, 0.33, 0.23 + w, 0.05, 0.05, 0.1, NEGRO));
        return a;
      }
    },
    gabinete_incendios: {
      n: 'Gabinete contra incendios', d: [0.8, 1.81, 0.25], color: ROJO,
      partes: (c?) => { const w = -0.125; const a = [B(0, 1.2, 0.12 + w, 0.8, 0.8, 0.22, c), B(0, 1.2, 0.235 + w, 0.62, 0.62, 0.02, VIDRIO, { t: true })]; for (const r of [0.2, 0.14, 0.08]) a.push(B(0, 1.2, 0.225 + w, r * 2, r * 2, 0.015, r === 0.14 ? BLANCO : MARCO)); a.push(B(0, 1.72, 0.12 + w, 0.5, 0.18, 0.03, BLANCO), B(0, 1.72, 0.14 + w, 0.42, 0.1, 0.02, c), Txt('MANGUERA', 0, 1.72, 0.152 + w, 0.4, 0.09, c, '#ffffff')); return a; }
    },
    botiquin: { n: 'Botiquín de primeros auxilios', d: [0.42, 1.76, 0.16], color: '#f4f4f2', partes: (c?) => [B(0, 1.5, 0, 0.42, 0.52, 0.15, c), B(0, 1.5, 0.077, 0.4, 0.5, 0.004, oscuro(c, 0.96)), B(0, 1.53, 0.081, 0.2, 0.06, 0.004, '#2e8b57'), B(0, 1.53, 0.081, 0.06, 0.2, 0.004, '#2e8b57'), B(0.17, 1.5, 0.085, 0.02, 0.08, 0.012, '#9aa1a8'), Txt('PRIMEROS AUXILIOS', 0, 1.33, 0.081, 0.36, 0.05, oscuro(c, 0.96), '#2e8b57')] },
    caballete: {
      n: 'Caballete rayado', d: [0.9, 0.9, 0.62], color: AMARILLO,
      partes: (c?) => { const a = []; for (const s of [-1, 1]) { const r = [-s * 0.3, 0, 0]; a.push(B(0, 0.45, s * 0.17, 0.9, 0.9, 0.05, c, { r })); for (let k = 0; k < 4; k++) a.push(B(-0.3 + 0.2 * k, 0.45, s * 0.2, 0.1, 0.7, 0.02, GOMA, { r })); } a.push(B(0, 0.45, 0, 0.9, 0.04, 0.4, GOMA)); return a; }
    },
    barrera_rayada: { n: 'Barrera rayada', d: [2.4, 0.7, 0.64], color: '#bdbab3', partes: (c?) => { const a = [B(0, 0.35, 0, 2.4, 0.7, 0.6, c)]; for (const s of [-1, 1]) for (let k = 0; k < 6; k++) a.push(B(-1 + 0.4 * k, 0.35, s * 0.31, 0.4, 0.66, 0.02, k % 2 ? GOMA : AMARILLO)); return a; } },
    piso_mojado: { n: 'Señal de piso mojado', d: [0.3, 0.64, 0.28], color: '#f2c21b', partes: (c?) => [B(0, 0.31, 0.065, 0.3, 0.62, 0.012, c, { r: [-0.22, 0, 0] }), B(0, 0.31, -0.065, 0.3, 0.62, 0.012, c, { r: [0.22, 0, 0] }), Txt('PISO\nMOJADO', 0, 0.36, 0.083, 0.24, 0.16, c, '#111111', { r: [-0.22, 0, 0] }), B(0, 0.22, 0.088, 0.1, 0.1, 0.004, '#111111', { r: [-0.22, 0, 0.785] }), B(0, 0.63, 0, 0.26, 0.03, 0.04, oscuro(c, 0.8))] },
    hidrante: { n: 'Hidrante (boca de incendio)', d: [0.42, 0.8, 0.3], color: '#c62828', partes: (c?) => [Cy(0, 0.04, 0, 0.3, 0.08, c), Cy(0, 0.38, 0, 0.22, 0.62, c), Cy(0, 0.7, 0, 0.26, 0.04, c), Sp(0, 0.74, 0, 0.22, 0.12, 0.22, c), Cy(0, 0.8, 0, 0.06, 0.04, '#d8b020'), CyX(0.16, 0.45, 0, 0.1, 0.1, c), CyX(-0.16, 0.45, 0, 0.1, 0.1, c), CyX(0.21, 0.45, 0, 0.12, 0.02, '#d8b020'), CyX(-0.21, 0.45, 0, 0.12, 0.02, '#d8b020'), CyZ(0, 0.5, 0.14, 0.12, 0.06, '#d8b020')] },
    camara_seguridad: { n: 'Cámara de seguridad', d: [0.12, 2.75, 0.32], color: '#eceeee', partes: (c?) => [B(0, 2.65, -0.15, 0.1, 0.14, 0.02, c), B(0, 2.65, -0.09, 0.03, 0.03, 0.12, c), B(0, 2.6, 0.03, 0.1, 0.09, 0.2, c, { r: [0.35, 0, 0] }), CyZ(0, 2.565, 0.135, 0.06, 0.01, '#111111', { r: [PI / 2 + 0.35, 0, 0] }), B(0, 2.65, 0.05, 0.13, 0.01, 0.24, c, { r: [0.35, 0, 0] })] },
    luz_emergencia: { n: 'Luz de emergencia', d: [0.36, 2.42, 0.1], color: '#f4f4f2', partes: (c?) => [B(0, 2.3, -0.02, 0.32, 0.12, 0.06, c), B(0, 2.25, 0.012, 0.12, 0.012, 0.004, '#2e8b57'), Sp(-0.12, 2.38, 0.02, 0.09, 0.07, 0.09, '#fff6d0'), Sp(0.12, 2.38, 0.02, 0.09, 0.07, 0.09, '#fff6d0'), B(0.12, 2.3, 0.012, 0.02, 0.02, 0.004, '#c62828')] },

    /* ---------- bodega ---------- */
    pale_sacos: { n: 'Palé con sacos', d: [1.2, 0.87, 1.0], color: '#d8cba4', partes: (c?) => { const a = OBJ.tarima.partes(MADERA); for (let k = 0; k < 3; k++) for (const [x, z] of k % 2 ? [[-0.3, -0.27], [0.3, -0.27], [-0.3, 0.27], [0.3, 0.27]] : [[-0.27, -0.3], [0.27, -0.3], [-0.27, 0.3], [0.27, 0.3]]) a.push(Sp(x, 0.27 + k * 0.22, z, k % 2 ? 0.6 : 0.52, 0.26, k % 2 ? 0.5 : 0.58, k === 1 ? oscuro(c, 0.95) : c)); return a; } },
    pale_cajas: { n: 'Palé con cajas embaladas', d: [1.2, 1.24, 1.0], color: CARTON, partes: (c?) => { const a = OBJ.tarima.partes(MADERA); for (let k = 0; k < 2; k++) for (const x of [-0.3, 0.3]) for (const z of [-0.25, 0.25]) { a.push(B(x, 0.15 + 0.27 + k * 0.54, z, 0.58, 0.53, 0.48, c), B(x, 0.15 + 0.536 + k * 0.54, z, 0.58, 0.006, 0.07, CINTA)); } a.push(B(0, 0.7, 0, 1.22, 1.08, 1.02, '#dfe8ee', { t: true })); return a; } },
    transpaleta: { n: 'Transpaleta (estoca)', d: [1.55, 1.25, 0.55], color: '#c62828', partes: (c?) => [B(0.5, 0.05, -0.2, 1.15, 0.05, 0.16, c), B(0.5, 0.05, 0.2, 1.15, 0.05, 0.16, c), B(-0.15, 0.15, 0, 0.25, 0.25, 0.54, c), Cy(-0.15, 0.4, 0, 0.12, 0.3, '#333333'), B(-0.5, 0.8, 0, 0.05, 0.9, 0.05, '#333333', { r: [0, 0, 0.55] }), B(-0.75, 1.2, 0, 0.05, 0.05, 0.34, '#1b1b1b'), Rueda(-0.15, 0.09, 0.14, 0.18, 0.05), Rueda(-0.15, 0.09, -0.14, 0.18, 0.05), Rueda(1.0, 0.04, 0.2, 0.08, 0.08), Rueda(1.0, 0.04, -0.2, 0.08, 0.08)] },
    estanteria_metalica: { n: 'Estantería metálica', d: [1.0, 2.0, 0.45], color: '#8d949b', partes: (c?) => { const a = []; for (const x of [-0.48, 0.48]) for (const z of [-0.2, 0.2]) a.push(B(x, 1, z, 0.035, 2, 0.035, c)); for (let k = 0; k < 5; k++) a.push(B(0, 0.08 + k * 0.46, 0, 1.0, 0.025, 0.44, oscuro(c, 1.1))); a.push(B(-0.22, 0.25, 0, 0.4, 0.3, 0.35, CARTON), B(0.25, 0.25, 0, 0.35, 0.3, 0.32, '#2f5f8f'), B(0, 0.73, 0, 0.6, 0.3, 0.36, CARTON), B(-0.2, 1.2, 0, 0.42, 0.28, 0.34, CARTON), B(0.25, 1.66, 0, 0.36, 0.28, 0.3, CARTON)); return a; } },
    tambor_quimicos: { n: 'Tambor de químicos (220 L)', d: [0.58, 0.94, 0.58], color: '#1f4fa0', partes: (c?) => [Cy(0, 0.46, 0, 0.56, 0.9, c), Cy(0, 0.3, 0, 0.58, 0.04, oscuro(c, 0.85)), Cy(0, 0.62, 0, 0.58, 0.04, oscuro(c, 0.85)), Cy(0, 0.915, 0, 0.5, 0.03, oscuro(c, 0.9)), Cy(0.15, 0.935, 0, 0.07, 0.02, oscuro(c, 0.6)), Cy(-0.15, 0.935, 0, 0.05, 0.02, oscuro(c, 0.6)), B(0, 0.5, 0.282, 0.2, 0.16, 0.004, '#f4f4f2', { r: [0, 0, 0] }), B(0, 0.5, 0.286, 0.08, 0.08, 0.002, '#e0601f', { r: [0, 0, 0.785] })] },
    ibc: { n: 'Contenedor IBC (1000 L)', d: [1.2, 1.16, 1.0], color: '#e9ece6', partes: (c?) => { const g = '#8d949b'; const a = [B(0, 0.075, 0, 1.2, 0.15, 1.0, '#4a4f55'), B(0, 0.64, 0, 1.1, 0.92, 0.92, c), Cy(0, 1.12, 0, 0.18, 0.06, '#f2f2f2'), CyZ(0, 0.25, 0.5, 0.08, 0.12, '#3a3d40')]; for (const s of [-1, 1]) { for (let k = 0; k < 5; k++) { a.push(B(-0.55 + k * 0.275, 0.64, s * 0.475, 0.02, 0.98, 0.02, g), B(s * 0.565, 0.64, -0.46 + k * 0.23, 0.02, 0.98, 0.02, g)); } for (const y of [0.18, 0.64, 1.1]) { a.push(B(0, y, s * 0.475, 1.14, 0.02, 0.02, g), B(s * 0.565, y, 0, 0.02, 0.02, 0.96, g)); } } return a; } },

    /* ---------- exterior ---------- */
    poste_electrico: { n: 'Poste eléctrico de hormigón', d: [1.8, 9.6, 0.4], color: '#bdbab3', partes: (c?) => [...cono(0, 0, 0, 0.32, 0.18, 9.5, c, 4), B(0, 8.9, 0, 1.8, 0.1, 0.1, c), ...[-0.8, -0.3, 0.3, 0.8].map((x?) => Cy(x, 9.02, 0, 0.07, 0.12, '#e8e6df')), Cy(0.28, 7.6, 0, 0.42, 0.7, '#8d949b'), Cy(0.28, 7.98, 0, 0.3, 0.06, '#6b7178'), B(0.15, 7.6, 0, 0.12, 0.2, 0.08, '#6b7178')] },
    bolardo: { n: 'Bolardo', d: [0.18, 0.92, 0.18], color: AMARILLO, partes: (c?) => [Cy(0, 0.45, 0, 0.16, 0.9, c), Cy(0, 0.6, 0, 0.165, 0.08, GOMA), Cy(0, 0.78, 0, 0.165, 0.08, GOMA), Sp(0, 0.9, 0, 0.16, 0.06, 0.16, c), Cy(0, 0.01, 0, 0.24, 0.02, '#6b7178')] },
    contenedor_basura: { n: 'Contenedor de basura', d: [1.85, 1.32, 1.12], color: '#2f6b3e', partes: (c?) => [B(0, 0.7, 0, 1.8, 1.0, 1.0, c), B(0, 0.25, 0, 1.7, 0.1, 0.9, oscuro(c, 0.8)), B(-0.45, 1.24, 0.02, 0.88, 0.05, 1.04, GOMA, { r: [-0.06, 0, 0] }), B(0.45, 1.24, 0.02, 0.88, 0.05, 1.04, GOMA, { r: [-0.06, 0, 0] }), B(-0.94, 0.9, 0, 0.08, 0.12, 0.8, oscuro(c, 0.7)), B(0.94, 0.9, 0, 0.08, 0.12, 0.8, oscuro(c, 0.7)), CyX(0, 0.95, 0.53, 0.04, 1.5, ACERO), ...[[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]].map(([x, z]) => Rueda(x, 0.1, z, 0.2, 0.06))] },
    tachos_reciclaje: {
      n: 'Tachos de reciclaje (3)', d: [1.86, 1.2, 0.62], color: '#1b1c1e',
      partes: () => {
        const a = [];
        ['#1b1c1e', '#1f5fa8', '#2f8a55'].forEach((col?, i?) => {
          const x = 0.62 - 0.62 * i, tapa = oscuro(col, 0.65);
          a.push(...cono(x, 0.04, 0, 0.46, 0.58, 0.92, col, 3), Cy(x, 0.94, 0, 0.62, 0.04, tapa), Cy(x, 0.18, 0, 0.49, 0.03, tapa), Cy(x - 0.16, 0.04, -0.18, 0.1, 0.08, GOMA), Cy(x + 0.16, 0.04, -0.18, 0.1, 0.08, GOMA), B(x, 1.0, -0.2, 0.3, 0.04, 0.05, tapa), B(x, 0.55, 0.275, 0.2, 0.26, 0.015, '#e9ecee'), B(x, 0.55, 0.285, 0.12, 0.12, 0.01, oscuro(col, 1.4)));
          if (i > 0) a.push(B(x, 1.0, 0, 0.62, 0.2, 0.62, '#0d0e0f', { r: [0, 0.5, 0] }), B(x + 0.05, 1.12, 0.05, 0.2, 0.14, 0.2, '#0d0e0f', { r: [0.3, 0.6, 0.2] }));
        });
        return a;
      }
    },
    trailer_caja: {
      n: 'Tráiler de caja blanco', d: [12.9, 3.2, 2.5], color: '#f2f2f0',
      partes: (c?) => { const a = [B(0, 1.75, 0, 12, 2.7, 2.5, c), B(0, 3.12, 0, 11.8, 0.05, 2.4, '#9aa1a8'), B(0, 0.36, 0, 11.6, 0.12, 1.2, '#2a2a2a'), B(-6.01, 1.75, 0, 0.03, 2.6, 0.02, '#9aa1a8'), CyX(-6.03, 1.75, 0.6, 0.03, 0.02, '#555555')]; for (const s of [-1, 1]) { a.push(B(0, 2.9, s * 1.26, 11.6, 0.15, 0.04, '#1f4fa0'), B(3.8, 0.6, s * 0.9, 0.12, 1.0, 0.12, '#333333')); for (const x of [-2.4, -3.6, -4.8]) a.push(Rueda(x, 0.5, s * 0.95, 1.0, 0.5)); } a.push(B(6.35, 0.6, 0, 0.9, 0.2, 0.2, '#333333')); return a; }
    },

    /* ---------- comedor y cocina ---------- */
    microondas: { n: 'Microondas', d: [0.49, 0.29, 0.38], color: '#2b2d30', partes: (c?) => [B(0, 0.145, 0, 0.49, 0.29, 0.38, c), B(-0.06, 0.15, 0.191, 0.33, 0.22, 0.005, '#1a1c1e'), B(-0.07, 0.15, 0.194, 0.26, 0.15, 0.003, '#3a4248', { t: true }), B(0.17, 0.15, 0.191, 0.11, 0.24, 0.005, '#8d949b'), B(0.17, 0.21, 0.195, 0.07, 0.03, 0.003, '#7fd17f'), ...[0, 1, 2].map((k?) => B(0.17, 0.15 - k * 0.035, 0.195, 0.06, 0.018, 0.004, '#5a5f63')), B(0.105, 0.15, 0.2, 0.02, 0.18, 0.02, '#8d949b')] },
    refrigeradora: { n: 'Refrigeradora', d: [0.7, 1.75, 0.72], color: '#cfd3d6', partes: (c?) => [B(0, 0.89, -0.02, 0.7, 1.7, 0.66, c), B(0, 1.47, 0.32, 0.68, 0.5, 0.04, oscuro(c, 1.05)), B(0, 0.6, 0.32, 0.68, 1.1, 0.04, oscuro(c, 1.05)), B(-0.3, 1.38, 0.355, 0.025, 0.3, 0.03, '#5a5f63'), B(-0.3, 0.88, 0.355, 0.025, 0.4, 0.03, '#5a5f63'), B(0, 0.025, 0, 0.66, 0.05, 0.66, '#2a2d30'), B(0.18, 1.6, 0.342, 0.12, 0.04, 0.004, '#7fb3dc')] },
    meson_cocina: { n: 'Mesón de cocina con lavaplatos', d: [1.8, 0.92, 0.6], color: '#e8e6df', partes: (c?) => { const a = [B(0, 0.45, -0.02, 1.8, 0.82, 0.56, c), B(0, 0.89, 0, 1.82, 0.04, 0.62, '#3a3a3a'), B(0.4, 0.88, 0, 0.6, 0.05, 0.42, INOX), B(0.4, 0.87, 0, 0.5, 0.02, 0.34, '#8d949b'), Cy(0.4, 1.0, -0.24, 0.03, 0.22, INOX), B(0.4, 1.1, -0.17, 0.03, 0.03, 0.16, INOX), B(0, 0.06, 0.22, 1.76, 0.12, 0.02, '#3a3a3a')]; for (const x of [-0.675, -0.225, 0.225, 0.675]) a.push(B(x, 0.5, 0.265, 0.43, 0.66, 0.02, oscuro(c, 0.95)), B(x + (x < 0 ? 0.17 : -0.17), 0.7, 0.28, 0.015, 0.1, 0.02, ACERO)); return a; } },
    cafetera: { n: 'Cafetera', d: [0.2, 0.34, 0.26], color: '#1d1e20', partes: (c?) => [B(0, 0.02, 0, 0.2, 0.04, 0.26, c), B(0, 0.18, -0.08, 0.2, 0.34, 0.1, c), B(0, 0.31, 0.02, 0.2, 0.06, 0.2, c), Cy(0, 0.1, 0.04, 0.13, 0.13, '#3a4248', { t: true }), Cy(0, 0.07, 0.04, 0.12, 0.06, '#3b2414'), B(0.06, 0.22, -0.029, 0.02, 0.02, 0.004, '#c62828')] }
  };
  /* monitor del juego por cajas (_monitor_de_cajas) con la pantalla azul encendida; (x, y, z) = pie del soporte */
  function monitorPartes(x?, y?, z?) {
    const ng = '#14161a';
    return [B(x, y + 0.008, z, 0.22, 0.016, 0.16, ng), B(x, y + 0.1, z - 0.03, 0.04, 0.18, 0.03, ng), B(x, y + 0.255, z - 0.01, 0.55, 0.33, 0.035, ng), B(x, y + 0.26, z + 0.008, 0.5, 0.28, 0.004, '#25496d')];
  }
  /* oficina, comedor, bodega y exterior mejorados con las medidas del juego (copiados de los generadores) */
  const MEJORAS = {
    silla: { n: 'Silla de oficina', d: [0.66, 0.98, 0.67], color: '#545658', modelo: 'silla', partes: (c?) => { const a = []; for (let k = 0; k < 5; k++) { const g = k * 2 * PI / 5; a.push(B(Math.cos(g) * 0.15, 0.06, Math.sin(g) * 0.15, 0.3, 0.03, 0.04, GOMA, { r: [0, -g, 0] }), Sp(Math.cos(g) * 0.29, 0.025, Math.sin(g) * 0.29, 0.05, 0.05, 0.05, GOMA)); } a.push(Cy(0, 0.25, 0, 0.05, 0.35, '#333333'), B(0, 0.47, 0.02, 0.5, 0.08, 0.48, c), B(0, 0.78, -0.25, 0.46, 0.5, 0.06, c, { r: [-0.1, 0, 0] }), B(0, 0.6, -0.23, 0.06, 0.2, 0.04, '#333333'), B(-0.27, 0.62, 0.02, 0.05, 0.03, 0.26, GOMA), B(0.27, 0.62, 0.02, 0.05, 0.03, 0.26, GOMA), B(-0.27, 0.55, 0.02, 0.03, 0.14, 0.03, GOMA), B(0.27, 0.55, 0.02, 0.03, 0.14, 0.03, GOMA)); return a; } },
    archivador: { n: 'Archivador metálico', d: [0.7, 1.8, 0.8], color: '#4e4d4b', modelo: 'archivador' },
    dispensador: { n: 'Dispensador de agua', d: [0.46, 1.15, 0.52], color: '#bcbdbb', modelo: 'dispensador_agua' },
    planta_maceta: { n: 'Planta en maceta', d: [0.8, 1.1, 0.75], color: '#4c692e', modelo: 'planta' },
    barril: { n: 'Tambor metálico', d: [0.66, 0.9, 0.66], color: '#6a727b', modelo: 'barril' },
    tarima: { n: 'Tarima (palé)', d: [1.2, 0.15, 1.0], color: MADERA, modelo: 'tarima' },
    caja_madera: { n: 'Caja de madera', d: [0.8, 0.8, 0.8], color: '#846340', modelo: 'caja_madera' },
    rack: { n: 'Estantería industrial (rack)' },
    cono: { n: 'Cono de tránsito', d: [0.38, 0.66, 0.38], color: '#ff6a00', partes: (c?) => [B(0, 0.02, 0, 0.38, 0.04, 0.38, GOMA), ...cono(0, 0.03, 0, 0.34, 0.06, 0.62, c, 6), Cy(0, 0.38, 0, 0.2, 0.12, '#f4f4f4')] },
    mesa_marmol: {
      n: 'Mesa de mármol con bancas', d: [1.3, 0.9, 1.79], color: '#e7e7e3',
      partes: (c?) => {
        const L = 1.3, F = 0.75, ng = '#1f2022', md = '#b4532a', a = [B(0, 0.76, 0, L, 0.04, F, c), B(0, 0.38, 0, 0.08, 0.74, 0.08, ng), B(0, 0.02, 0, 0.5, 0.04, 0.5, ng)];
        for (const s of [-1, 1]) { const dz = s * (F / 2 + 0.32); a.push(B(0, 0.44, dz, L, 0.05, 0.34, md)); for (let l = 0; l < 3; l++) a.push(B(0, 0.47, dz - 0.11 + 0.11 * l, L, 0.012, 0.09, oscuro(md, 0.9))); a.push(B(0, 0.72, dz + s * 0.16, L, 0.36, 0.05, md)); for (const u of [-L / 2 + 0.15, L / 2 - 0.15]) a.push(B(u, 0.21, dz, 0.05, 0.42, 0.3, ng)); }
        return a;
      }
    },
    montacargas: {
      n: 'Montacargas', d: [2.75, 2.2, 1.1], color: '#e0a800',
      partes: (c?) => { const g = '#333333'; return [B(-0.25, 0.55, 0, 1.6, 0.6, 1.0, c), B(-0.98, 0.72, 0, 0.36, 0.95, 1.04, '#2b2b2b'), B(-0.4, 0.95, 0, 0.42, 0.1, 0.46, GOMA), B(-0.62, 1.15, 0, 0.08, 0.36, 0.46, GOMA), B(0.25, 1.0, 0, 0.06, 0.42, 0.06, g, { r: [0, 0, 0.35] }), Cy(0.18, 1.22, 0, 0.3, 0.03, '#111111', { r: [0, 0, 0.6] }), ...[[-0.7, -0.46], [-0.7, 0.46], [0.35, -0.46], [0.35, 0.46]].map(([x, z]) => Cy(x, 1.5, z, 0.05, 1.3, g)), B(-0.17, 2.15, 0, 1.1, 0.04, 0.98, g), ...[-0.5, -0.17, 0.16].map((x?) => B(x, 2.17, 0, 0.04, 0.03, 0.96, g)), B(0.72, 1.1, -0.32, 0.08, 2.2, 0.1, g), B(0.72, 1.1, 0.32, 0.08, 2.2, 0.1, g), B(0.8, 0.45, 0, 0.06, 0.55, 0.9, '#444444'), B(1.33, 0.04, -0.25, 1.05, 0.05, 0.12, '#555555'), B(1.33, 0.04, 0.25, 1.05, 0.05, 0.12, '#555555'), B(0.84, 0.3, -0.25, 0.05, 0.55, 0.12, '#555555'), B(0.84, 0.3, 0.25, 0.05, 0.55, 0.12, '#555555'), Sp(-0.6, 2.22, 0, 0.1, 0.08, 0.1, '#ff8c1a'), Rueda(0.4, 0.28, 0.45, 0.56, 0.2), Rueda(0.4, 0.28, -0.45, 0.56, 0.2), Rueda(-0.78, 0.25, 0.45, 0.5, 0.18), Rueda(-0.78, 0.25, -0.45, 0.5, 0.18)]; }
    }
  };
  for (const k in MEJORAS) { if (!OBJ[k]) continue; Object.assign(OBJ[k], MEJORAS[k]); }
  Object.assign(OBJ, NUEVOS);
  /* objetos con malla real y sin piezas propias: piezas aproximadas por si el servidor no manda la malla */
  const aprox = {
    archivador: (c?) => { const a = [B(0, 0.9, 0, 0.7, 1.8, 0.8, c)]; for (let k = 0; k < 4; k++) a.push(B(0, 0.25 + k * 0.43, 0.402, 0.64, 0.4, 0.006, oscuro(c, 1.15)), B(0, 0.38 + k * 0.43, 0.41, 0.16, 0.03, 0.02, '#c9ced3')); return a; },
    dispensador: (c?) => [B(0, 0.45, 0, 0.42, 0.9, 0.46, c), Cy(0, 1.03, 0, 0.3, 0.26, '#7fb4d8', { t: true }), B(0, 0.7, 0.24, 0.16, 0.08, 0.04, '#5a5f63'), B(-0.04, 0.68, 0.26, 0.03, 0.05, 0.03, '#2f6fbf'), B(0.04, 0.68, 0.26, 0.03, 0.05, 0.03, '#c62828')],
    planta_maceta: (c?) => [...cono(0, 0, 0, 0.38, 0.46, 0.42, '#8a5a3c', 2), Sp(0, 0.75, 0, 0.75, 0.6, 0.7, c), Sp(0.15, 0.95, 0.05, 0.4, 0.4, 0.4, oscuro(c, 1.15))],
    barril: (c?) => [Cy(0, 0.45, 0, 0.6, 0.9, c), Cy(0, 0.3, 0, 0.62, 0.03, oscuro(c, 0.7)), Cy(0, 0.6, 0, 0.62, 0.03, oscuro(c, 0.7)), Cy(0, 0.9, 0, 0.58, 0.01, oscuro(c, 0.8))]
  };
  for (const k in aprox) if (OBJ[k]) OBJ[k].partes = aprox[k];
  const cajaCarton = (c?) => [B(0, 0.183, 0, 0.4, 0.366, 0.345, c), B(0, 0.367, 0, 0.402, 0.004, 0.06, CINTA), B(0, 0.25, 0.174, 0.12, 0.08, 0.002, '#f4f4f2')];
  OBJ.caja_carton = { n: 'Caja de cartón', d: [0.4, 0.366, 0.345], color: '#97673c', modelo: 'caja_carton', partes: cajaCarton };

  /* coches: el hatchback existe en el juego; el camión de jabas azules es el del bar del Complejo */
  COCHES.hatchback = ['Hatchback', 4.1, 1.5, 1.75];
  ['sedan', 'suv', 'pickup', 'hatchback'].forEach((k?) => { if (COCHES[k]) COCHES[k].modelo = k; });

  /* categorías claras (las que añadan otros archivos se conservan al final) */
  const CATS = [['oficina', 'Oficina'], ['bar', 'Cervezas y bar'], ['comedor', 'Comedor y cocina'], ['seguridad', 'Seguridad'], ['industrial', 'Bodega'], ['exterior', 'Exterior'], ['vehiculos', 'Vehículos'], ['senalizacion', 'Señalización'], ['iluminacion', 'Iluminación'], ['naturaleza', 'Naturaleza']];
  const resto = CATEGORIAS.filter(([k]) => !CATS.some(([c]) => c === k) && k !== 'componentes');
  CATEGORIAS.splice(0, CATEGORIAS.length, ...CATS, ...resto, ['componentes', 'Mis componentes']);

  /* nombres y categorías de los objetos que ya estaban */
  const recolocar = { mesa_marmol: 'comedor', cono: 'seguridad', valla: 'seguridad', reductor: 'exterior' };
  for (const it of ITEMS) {
    const sub = String(it.tipo).startsWith('objeto:') ? it.tipo.slice(7) : null;
    if (sub && OBJ[sub]) { it.n = OBJ[sub].n; it.datos.sx = OBJ[sub].d[0]; it.datos.sy = OBJ[sub].d[1]; it.datos.sz = OBJ[sub].d[2]; it.datos.color = OBJ[sub].color; }
    if (recolocar[it.id]) it.cat = recolocar[it.id];
  }
  const ya = new Set<any>(ITEMS.map((i?) => i.id));
  const poner = (id?, cat?, extra?) => { if (ya.has(id) || !OBJ[id]) return; ya.add(id); ITEMS.push({ id, n: OBJ[id].n, cat, tipo: 'objeto:' + id, datos: Object.assign({ sx: OBJ[id].d[0], sy: OBJ[id].d[1], sz: OBJ[id].d[2], color: OBJ[id].color }, extra || {}) }); };
  ['botella_pilsener', 'botella_club', 'botella_paulaner', 'lata_pilsener', 'lata_club', 'lata_paulaner', 'sixpack_pilsener', 'sixpack_club', 'jaba_pilsener', 'jaba_club', 'pila_jabas', 'barril_cerveza', 'nevera_bebidas', 'cooler', 'mesa_bar', 'taburete', 'barra_bar', 'vaso_cerveza', 'bandeja_vasos', 'mesa_plastica', 'silla_plastica'].forEach((k?) => poner(k, 'bar', k === 'nevera_bebidas' ? { texto: 'Pilsener' } : null));
  ['escritorio_pc', 'monitor', 'telefono', 'taza', 'disco_duro', 'impresora', 'fotocopiadora', 'armario', 'reloj_pared', 'ventilador', 'split', 'condensadora'].forEach((k?) => poner(k, 'oficina'));
  ['microondas', 'refrigeradora', 'meson_cocina', 'cafetera'].forEach((k?) => poner(k, 'comedor'));
  ['extintor', 'gabinete_incendios', 'botiquin', 'hidrante', 'caballete', 'barrera_rayada', 'piso_mojado', 'camara_seguridad', 'luz_emergencia'].forEach((k?) => poner(k, 'seguridad'));
  ['pale_sacos', 'pale_cajas', 'caja_carton', 'transpaleta', 'estanteria_metalica', 'tambor_quimicos', 'ibc'].forEach((k?) => poner(k, 'industrial'));
  ['poste_electrico', 'bolardo', 'contenedor_basura', 'tachos_reciclaje', 'trailer_caja'].forEach((k?) => poner(k, 'exterior'));
  if (!ya.has('hatchback')) { ya.add('hatchback'); const c = COCHES.hatchback; ITEMS.push({ id: 'hatchback', n: c[0], cat: 'vehiculos', tipo: 'coche', datos: { subtipo: 'hatchback', sx: c[1], sy: c[2], sz: c[3], color: '#8d1f20' } }); }
  /* pintura de cada coche como en el juego (sedán negro, SUV plateada, pickup gris, hatchback rojo) */
  const PINTURA = { sedan: '#1d1f23', suv: '#a2a7ac', pickup: '#4d535a', hatchback: '#8d1f20' };
  for (const it of ITEMS) if (it.tipo === 'coche' && PINTURA[it.id]) it.datos.color = PINTURA[it.id];
  /* camión de jabas (bar del Complejo): cabina blanca, plataforma gris y cuatro pilas de jabas azules; el morro hacia +X */
  OBJ.camion_jabas = {
    n: 'Camión de jabas', d: [10.45, 2.75, 2.4], color: '#e8e8e4',
    partes: (c?) => { const a = [B(4.05, 1.55, 0, 2.3, 2.3, 2.0, c), B(5.21, 2.0, 0, 0.04, 0.8, 1.8, VIDRIO, { t: true }), B(-1.0, 0.95, 0, 8.4, 0.25, 2.4, '#6d7174'), B(5.21, 0.9, 0.7, 0.04, 0.14, 0.3, '#f3f0d8'), B(5.21, 0.9, -0.7, 0.04, 0.14, 0.3, '#f3f0d8')]; for (const x of [1.85, -0.2, -2.25, -4.3]) { a.push(B(x, 1.9, 0, 1.95, 1.65, 2.2, '#1f3f8f')); for (let f = 0; f < 5; f++) for (const s of [-1, 1]) a.push(B(x, 1.3 + 0.28 * f, s * 1.11, 1.8, 0.06, 0.02, '#1d1e20')); } for (const x of [3.85, -2.95, -4.35]) for (const s of [-1, 1]) a.push(Rueda(x, 0.48, s * 1.08, 0.96, 0.3)); return a; }
  };
  poner('camion_jabas', 'vehiculos');

  /* (2.1) objetos del juego con malla real: una caja invisible ("h", para elegir, mover y medir) que modelos_juego.js viste con la malla */
  function ancla(clave?, d?, e?, col?) {
    if (!clave || !window.OOModelos || !window.OOModelos.listo(clave)) return null;
    const sx = +e.sx || d[0], sy = +e.sy || d[1], sz = +e.sz || d[2];
    return [B(0, sy / 2, 0, sx, sy, sz, col, { oculta: true, modelo: clave })];
  }
  const construirBase = OO.construir;
  OO.construir = function (o?) {
    const e = (o && o.datos) || {}, t = String((o && o.tipo) || ''), ci = t.indexOf(':'), base = ci < 0 ? t : t.slice(0, ci), sub = ci < 0 ? '' : t.slice(ci + 1);
    if (base === 'objeto' && OBJ[sub] && OBJ[sub].modelo) { const a = ancla(OBJ[sub].modelo, OBJ[sub].d, e, e.color || OBJ[sub].color); if (a) return a; }
    if (base === 'coche') { const k = COCHES[e.subtipo] ? e.subtipo : 'sedan'; const c = COCHES[k]; if (c.modelo) { const a = ancla(c.modelo, [c[1], c[2], c[3]], e, e.color || '#8a1f22'); if (a) return a; } }
    if (base === 'coche' && e.subtipo === 'hatchback') { const c = COCHES.hatchback; return construirBase(Object.assign({}, o, { datos: Object.assign({}, e, { subtipo: 'sedan', sx: +e.sx || c[1], sy: +e.sy || c[2], sz: +e.sz || c[3] }) })); } // sin malla: el sedán a la medida del hatchback
    return construirBase(o);
  };
  OO.MARCAS = MARCAS;
})();
