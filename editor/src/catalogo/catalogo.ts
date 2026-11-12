/* Editor del mapa (2.0.6): materiales, catálogo de objetos por categorías y constructores de piezas simples.
   Cada constructor devuelve piezas en coordenadas locales del objeto (y = 0 en el suelo, +X = frente/largo, +Z = ancho):
   {f:'b'|'c'|'s'|'l'|'t'|'poly', p:[x,y,z], s:[sx,sy,sz], r:[rx,ry,rz] | q:[x,y,z,w], c:'#rrggbb', t:transparente} */
(function () {
  'use strict';
  const T = window.THREE;
  const B = (x?, y?, z?, sx?, sy?, sz?, c?, o?) => Object.assign({ f: 'b', p: [x, y, z], s: [sx, sy, sz], c }, o || {});
  const Cy = (x?, y?, z?, d?, h?, c?, o?) => Object.assign({ f: 'c', p: [x, y, z], s: [d, h, d], c }, o || {});
  const Sp = (x?, y?, z?, sx?, sy?, sz?, c?, o?) => Object.assign({ f: 's', p: [x, y, z], s: [sx, sy, sz], c }, o || {});
  const Lz = (x?, y?, z?, d?, c?) => ({ f: 'l', p: [x, y, z], s: [d, d, d], c });
  const Rueda = (x?, y?, z?, d?, w?) => Cy(x, y, z, d, w, '#1b1b1b', { r: [Math.PI / 2, 0, 0] });
  function oscuro(hex?, k?) { const c = new T.Color(hex || '#888888'); c.multiplyScalar(k); return '#' + c.getHexString(); }
  const PATAS4 = (x?, z?, y?, h?, c?, w?) => [[-x, -z], [x, -z], [-x, z], [x, z]].map(([a, b]) => B(a, y, b, w || 0.05, h, w || 0.05, c));

  /* materiales para pintar paredes y suelos (color medio real aproximado) */
  const MATERIALES = {
    bloque: { n: 'Bloque', c: '#d9d6cf', patron: 'bloque' },
    pintura: { n: 'Pintura', c: '#e8e6df', patron: 'liso' },
    ladrillo: { n: 'Ladrillo', c: '#a5553a', patron: 'ladrillo' },
    chapa: { n: 'Chapa', c: '#8b959e', patron: 'chapa' },
    concreto: { n: 'Concreto', c: '#b9b6ae', patron: 'moteado' },
    adoquin: { n: 'Adoquín', c: '#a87561', patron: 'adoquin' },
    asfalto: { n: 'Asfalto', c: '#55585c', patron: 'moteado' },
    baldosa: { n: 'Baldosa', c: '#d8d2c4', patron: 'baldosa' },
    cesped: { n: 'Césped', c: '#6f9a4f', patron: 'cesped' },
    tierra: { n: 'Tierra', c: '#9a7f60', patron: 'moteado' },
    madera: { n: 'Madera', c: '#9a7650', patron: 'madera' },
    metal: { n: 'Metal', c: '#8d949b', patron: 'liso' },
    vidrio: { n: 'Vidrio', c: '#9cc7e0', patron: 'vidrio' }
  };
  const MAT_MURO = ['bloque', 'pintura', 'ladrillo', 'chapa', 'concreto', 'madera', 'metal', 'vidrio'];
  const MAT_SUELO = ['baldosa', 'concreto', 'asfalto', 'adoquin', 'cesped', 'tierra', 'madera', 'pintura'];

  /* muestra dibujada de un material (canvas 2D) */
  function muestra(mat?, color?, tam?) {
    tam = tam || 64;
    const cv = document.createElement('canvas'); cv.width = cv.height = tam; const g = cv.getContext('2d');
    const m = MATERIALES[mat] || MATERIALES.pintura; const c = color || m.c;
    g.fillStyle = c; g.fillRect(0, 0, tam, tam);
    const os = oscuro(c, 0.78), cl = oscuro(c, 1.12);
    g.strokeStyle = os; g.lineWidth = Math.max(1, tam / 40);
    const lin = (x1?, y1?, x2?, y2?) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    const s = tam / 8;
    switch (m.patron) {
      case 'bloque': for (let y = 0; y <= tam; y += s * 2) { lin(0, y, tam, y); for (let x = ((y / (s * 2)) % 2) * s * 2; x <= tam; x += s * 4) lin(x, y, x, y + s * 2); } break;
      case 'ladrillo': for (let y = 0; y <= tam; y += s) { lin(0, y, tam, y); for (let x = ((y / s) % 2) * s; x <= tam; x += s * 2) lin(x, y, x, y + s); } break;
      case 'chapa': for (let x = 0; x <= tam; x += s) { g.fillStyle = (x / s) % 2 ? os : cl; g.fillRect(x, 0, s / 2, tam); } break;
      case 'adoquin': for (let y = 0; y <= tam; y += s * 1.5) for (let x = ((y / (s * 1.5)) % 2) * s; x <= tam; x += s * 2) { g.strokeRect(x, y, s * 2, s * 1.5); } break;
      case 'baldosa': for (let v = 0; v <= tam; v += s * 2) { lin(0, v, tam, v); lin(v, 0, v, tam); } break;
      case 'cesped': g.strokeStyle = cl; for (let k = 0; k < tam * 1.5; k++) { const x = (k * 37) % tam, y = (k * 53) % tam; lin(x, y, x + 1, y - s / 2); } break;
      case 'madera': for (let y = 0; y <= tam; y += s) { lin(0, y, tam, y); lin(((y * 7) % tam), y, ((y * 7) % tam), y + s); } break;
      case 'vidrio': g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = tam / 16; lin(tam * 0.2, tam * 0.8, tam * 0.5, tam * 0.2); lin(tam * 0.5, tam * 0.9, tam * 0.8, tam * 0.35); break;
      case 'moteado': for (let k = 0; k < tam * 2; k++) { g.fillStyle = k % 2 ? os : cl; g.fillRect((k * 29) % tam, (k * 41) % tam, tam / 32 + 1, tam / 32 + 1); } break;
    }
    return cv.toDataURL();
  }

  /* objetos del catálogo con piezas propias (tipo "objeto:<id>") */
  const OBJ = {
    silla: { n: 'Silla', d: [0.5, 0.9, 0.52], color: '#33414f', partes: (c?) => [B(0, 0.45, 0, 0.46, 0.05, 0.46, c), B(0, 0.69, -0.22, 0.46, 0.42, 0.04, c), ...[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => Cy(x, 0.21, z, 0.03, 0.42, '#777777'))] },
    mesa: { n: 'Mesa', d: [1.2, 0.75, 0.8], color: '#b89a74', partes: (c?) => [B(0, 0.73, 0, 1.2, 0.04, 0.8, c), ...PATAS4(0.55, 0.35, 0.355, 0.71, '#555555')] },
    escritorio: { n: 'Escritorio', d: [1.4, 0.76, 0.7], color: '#a07c56', partes: (c?) => [B(0, 0.74, 0, 1.4, 0.04, 0.7, c), B(-0.67, 0.36, 0, 0.04, 0.72, 0.66, oscuro(c, 0.85)), B(0.67, 0.36, 0, 0.04, 0.72, 0.66, oscuro(c, 0.85)), B(0.42, 0.45, 0, 0.46, 0.5, 0.62, oscuro(c, 0.75)), B(0, 0.5, -0.32, 1.3, 0.4, 0.02, oscuro(c, 0.85))] },
    archivador: { n: 'Archivador', d: [0.5, 1.3, 0.6], color: '#8f969c', partes: (c?) => { const a = [B(0, 0.65, 0, 0.5, 1.3, 0.6, c)]; for (let k = 0; k < 4; k++) { a.push(B(0, 0.16 + k * 0.32, 0.302, 0.46, 0.01, 0.01, oscuro(c, 0.6))); a.push(B(0, 0.3 + k * 0.32, 0.31, 0.12, 0.03, 0.02, '#333333')); } return a; } },
    estanteria: { n: 'Estantería', d: [1.0, 2.0, 0.4], color: '#9a7650', partes: (c?) => { const a = [B(-0.48, 1, 0, 0.04, 2, 0.4, c), B(0.48, 1, 0, 0.04, 2, 0.4, c), B(0, 1, -0.19, 1, 2, 0.02, oscuro(c, 0.8))]; for (let k = 0; k < 5; k++) a.push(B(0, 0.05 + k * 0.48, 0, 0.92, 0.03, 0.38, c)); a.push(B(-0.2, 0.62, 0, 0.3, 0.3, 0.25, '#2f5f8f'), B(0.15, 1.1, 0, 0.4, 0.32, 0.25, '#8f2f2f')); return a; } },
    sofa: { n: 'Sofá', d: [2.0, 0.86, 0.9], color: '#5b6b80', partes: (c?) => { /* piezas que no se solapan en caras paralelas (evita el parpadeo) */
      const k = oscuro(c, 0.78), pata = '#2b2b2b', cw = 1.62 / 3, a = [];
      for (const x of [-0.9, 0.9]) for (const z of [-0.36, 0.36]) a.push(Cy(x, 0.03, z, 0.05, 0.06, pata));
      a.push(B(0, 0.2, 0.02, 1.64, 0.28, 0.82, k));                                         /* base entre los brazos */
      for (let i = 0; i < 3; i++) { const x = -0.81 + cw * (i + 0.5); a.push(B(x, 0.42, 0.08, cw - 0.02, 0.16, 0.66, c)); a.push(B(x, 0.67, -0.23, cw - 0.03, 0.38, 0.13, c)); }
      a.push(B(0, 0.6, -0.36, 1.64, 0.52, 0.14, k));                                        /* respaldo */
      for (const x of [-0.9, 0.9]) a.push(B(x, 0.37, -0.01, 0.16, 0.62, 0.88, oscuro(c, 0.9))); /* brazos */
      return a; } },
    planta_maceta: { n: 'Planta en maceta', d: [0.5, 1.2, 0.5], color: '#4f8a3a', partes: (c?) => [Cy(0, 0.2, 0, 0.4, 0.4, '#8a5a3c'), Sp(0, 0.82, 0, 0.6, 0.8, 0.6, c)] },
    dispensador: { n: 'Dispensador de agua', d: [0.35, 1.25, 0.35], color: '#e6e6e6', partes: (c?) => [B(0, 0.45, 0, 0.32, 0.9, 0.32, c), Cy(0, 1.07, 0, 0.26, 0.35, '#7fb4d8', { t: true }), B(0, 0.75, 0.165, 0.08, 0.05, 0.03, '#2f6fbf')] },
    computador: { n: 'Computador', d: [0.6, 0.5, 0.4], color: '#1b1b1b', partes: (c?) => [B(0, 0.33, -0.08, 0.55, 0.32, 0.03, c), B(0, 0.12, -0.08, 0.06, 0.22, 0.05, '#333333'), B(0, 0.01, -0.08, 0.22, 0.02, 0.16, '#333333'), B(0, 0.01, 0.12, 0.45, 0.02, 0.15, '#2a2a2a'), B(0, 0.33, -0.064, 0.5, 0.28, 0.005, '#3a6ea8')] },
    pizarra: { n: 'Pizarra', d: [1.8, 2.1, 0.06], color: '#f7f7f5', partes: (c?) => [B(0, 1.5, 0, 1.8, 1.2, 0.03, c), B(0, 0.9, 0.02, 1.8, 0.04, 0.07, '#888888'), B(0, 2.1, 0, 1.84, 0.04, 0.04, '#999999')] },
    banca: { n: 'Banca', d: [1.8, 0.85, 0.6], color: '#8a6440', partes: (c?) => [B(0, 0.45, 0, 1.8, 0.05, 0.42, c), B(0, 0.72, -0.2, 1.8, 0.28, 0.04, c), B(-0.8, 0.225, 0, 0.06, 0.45, 0.42, '#333333'), B(0.8, 0.225, 0, 0.06, 0.45, 0.42, '#333333'), B(-0.8, 0.6, -0.2, 0.06, 0.3, 0.04, '#333333'), B(0.8, 0.6, -0.2, 0.06, 0.3, 0.04, '#333333')] },
    mesa_marmol: { n: 'Mesa de mármol con bancas', d: [1.8, 0.78, 2.0], color: '#e7e5e0', partes: (c?) => { const k = oscuro(c, 0.88); return [B(0, 0.75, 0, 1.8, 0.06, 0.9, c), B(-0.6, 0.36, 0, 0.15, 0.72, 0.5, k), B(0.6, 0.36, 0, 0.15, 0.72, 0.5, k), B(0, 0.45, 0.78, 1.8, 0.06, 0.36, c), B(0, 0.45, -0.78, 1.8, 0.06, 0.36, c), B(-0.6, 0.21, 0.78, 0.15, 0.42, 0.28, k), B(0.6, 0.21, 0.78, 0.15, 0.42, 0.28, k), B(-0.6, 0.21, -0.78, 0.15, 0.42, 0.28, k), B(0.6, 0.21, -0.78, 0.15, 0.42, 0.28, k)]; } },
    tacho: { n: 'Tacho de basura', d: [0.55, 0.95, 0.55], color: '#3a6b45', partes: (c?) => [Cy(0, 0.45, 0, 0.5, 0.9, c), Cy(0, 0.92, 0, 0.55, 0.05, oscuro(c, 0.75))] },
    macetero: { n: 'Macetero', d: [1.2, 0.85, 0.5], color: '#9a958c', partes: (c?) => [B(0, 0.3, 0, 1.2, 0.6, 0.5, c), Sp(0, 0.7, 0, 1.1, 0.45, 0.42, '#4f8a3a')] },
    toldo: { n: 'Toldo', d: [4, 2.7, 3], color: '#2f6e8e', partes: (c?) => [Cy(-1.9, 1.3, -1.4, 0.06, 2.6, '#777777'), Cy(1.9, 1.3, -1.4, 0.06, 2.6, '#777777'), Cy(-1.9, 1.3, 1.4, 0.06, 2.6, '#777777'), Cy(1.9, 1.3, 1.4, 0.06, 2.6, '#777777'), B(0, 2.63, 0, 4, 0.06, 3, c)] },
    caseta: { n: 'Caseta de guardia', d: [2.5, 2.7, 2.5], color: '#dcd8cf', partes: (c?) => [B(0, 1.2, 0, 2.5, 2.4, 2.5, c), B(0, 2.5, 0, 2.8, 0.15, 2.8, oscuro(c, 0.6)), B(0, 1.45, 1.26, 1.6, 0.8, 0.03, '#8fc3e6', { t: true }), B(1.26, 1.0, 0.5, 0.03, 2.0, 0.8, '#555555')] },
    tarima: { n: 'Tarima', d: [1.2, 0.15, 1.0], color: '#b48a5a', partes: (c?) => { const a = []; [-0.43, -0.215, 0, 0.215, 0.43].forEach((z?) => a.push(B(0, 0.135, z, 1.2, 0.03, 0.14, c))); [-0.52, 0, 0.52].forEach((x?) => [-0.42, 0, 0.42].forEach((z?) => a.push(B(x, 0.07, z, 0.14, 0.09, 0.14, oscuro(c, 0.8))))); [-0.52, 0, 0.52].forEach((x?) => a.push(B(x, 0.012, 0, 0.14, 0.024, 1.0, c))); return a; } },
    barril: { n: 'Barril', d: [0.6, 0.9, 0.6], color: '#2d5aa0', partes: (c?) => [Cy(0, 0.45, 0, 0.6, 0.9, c), Cy(0, 0.28, 0, 0.62, 0.04, oscuro(c, 0.6)), Cy(0, 0.62, 0, 0.62, 0.04, oscuro(c, 0.6))] },
    caja_madera: { n: 'Caja de madera', d: [0.8, 0.8, 0.8], color: '#b08a5a', partes: (c?) => [B(0, 0.4, 0, 0.8, 0.8, 0.8, c), B(0, 0.4, 0, 0.82, 0.08, 0.82, oscuro(c, 0.75)), B(0, 0.4, 0, 0.08, 0.82, 0.82, oscuro(c, 0.75))] },
    rack: { n: 'Rack industrial', d: [2.7, 4.0, 1.0], color: '#1f5aa0', partes: (c?) => { const a = []; for (const x of [-1.31, 1.31]) for (const z of [-0.46, 0.46]) a.push(B(x, 2, z, 0.08, 4, 0.08, c)); for (const y of [0.15, 1.4, 2.65]) { a.push(B(0, y, -0.46, 2.7, 0.1, 0.05, '#e0601f'), B(0, y, 0.46, 2.7, 0.1, 0.05, '#e0601f'), B(0, y + 0.1, 0, 2.6, 0.04, 0.95, '#b48a5a')); a.push(B(-0.65, y + 0.5, 0, 1.1, 0.8, 0.9, '#c9a77a'), B(0.65, y + 0.5, 0, 1.1, 0.8, 0.9, '#c9a77a')); } return a; } },
    tanque: { n: 'Tanque', d: [2.2, 3.2, 2.2], color: '#cfd3d6', partes: (c?) => [Cy(0, 1.7, 0, 2.2, 3, c), Cy(0, 3.21, 0, 2.0, 0.04, oscuro(c, 0.8)), B(-0.8, 0.1, -0.8, 0.12, 0.2, 0.12, '#555555'), B(0.8, 0.1, -0.8, 0.12, 0.2, 0.12, '#555555'), B(-0.8, 0.1, 0.8, 0.12, 0.2, 0.12, '#555555'), B(0.8, 0.1, 0.8, 0.12, 0.2, 0.12, '#555555')] },
    montacargas: { n: 'Montacargas', d: [2.6, 2.1, 1.1], color: '#e0a800', partes: (c?) => [B(0, 0.6, 0, 1.6, 0.7, 1.0, c), B(-0.7, 0.72, 0, 0.4, 0.9, 1.0, '#333333'), B(0.95, 1.05, 0, 0.1, 2.1, 0.8, '#333333'), B(1.35, 0.06, -0.25, 0.8, 0.05, 0.1, '#555555'), B(1.35, 0.06, 0.25, 0.8, 0.05, 0.1, '#555555'), Cy(-0.3, 1.5, -0.45, 0.05, 1.0, '#333333'), Cy(-0.3, 1.5, 0.45, 0.05, 1.0, '#333333'), Cy(0.5, 1.5, -0.45, 0.05, 1.0, '#333333'), Cy(0.5, 1.5, 0.45, 0.05, 1.0, '#333333'), B(0.1, 2.0, 0, 1.0, 0.05, 1.0, '#333333'), Rueda(0.6, 0.25, 0.45, 0.5, 0.18), Rueda(0.6, 0.25, -0.45, 0.5, 0.18), Rueda(-0.6, 0.22, 0.45, 0.44, 0.16), Rueda(-0.6, 0.22, -0.45, 0.44, 0.16)] },
    letrero: { n: 'Letrero con texto', d: [1.2, 2.1, 0.1], color: '#1f5a3a', partes: (c?, e?) => [Cy(-0.5, 1.0, 0, 0.06, 2.0, '#666666'), Cy(0.5, 1.0, 0, 0.06, 2.0, '#666666'), B(0, 1.75, 0, 1.2, 0.6, 0.05, c), { f: 't', texto: (e && e.texto) || 'LETRERO', p: [0, 1.75, 0.03], w: 1.12, h: 0.52, bg: c, fg: '#ffffff' }] },
    cono: { n: 'Cono', d: [0.4, 0.7, 0.4], color: '#ff6a00', partes: (c?) => [B(0, 0.02, 0, 0.4, 0.04, 0.4, c), Cy(0, 0.15, 0, 0.3, 0.22, c), Cy(0, 0.33, 0, 0.22, 0.14, '#f4f4f4'), Cy(0, 0.5, 0, 0.15, 0.22, c), Cy(0, 0.65, 0, 0.07, 0.08, c)] },
    valla: { n: 'Barrera de concreto', d: [2, 0.8, 0.6], color: '#bcb9b1', partes: (c?) => [B(0, 0.15, 0, 2, 0.3, 0.6, c), B(0, 0.45, 0, 2, 0.3, 0.38, c), B(0, 0.7, 0, 2, 0.2, 0.22, c)] },
    senal_pare: { n: 'Señal de pare', d: [0.75, 2.45, 0.1], color: '#c62828', partes: (c?) => [Cy(0, 1.1, 0, 0.06, 2.2, '#888888'), Cy(0, 2.1, 0.03, 0.7, 0.03, c, { r: [Math.PI / 2, 0, 0] }), { f: 't', texto: 'PARE', p: [0, 2.1, 0.05], w: 0.48, h: 0.2, bg: c, fg: '#ffffff' }] },
    reductor: { n: 'Reductor de velocidad', d: [3.5, 0.08, 0.6], color: '#e0b000', partes: (c?) => { const a = [B(0, 0.04, 0, 3.5, 0.08, 0.6, c)]; for (let k = -5; k <= 5; k += 2) a.push(B(k * 0.3, 0.041, 0, 0.3, 0.081, 0.61, '#222222')); return a; } },
    pluma: { n: 'Pluma de acceso', d: [4.2, 1.1, 0.4], color: '#e0b000', partes: (c?) => { const a = [B(0, 0.5, 0, 0.4, 1.0, 0.4, c), B(2.1, 1.0, 0, 3.8, 0.08, 0.08, '#f2f2f2')]; for (let k = 0; k < 5; k++) a.push(B(0.6 + k * 0.75, 1.0, 0, 0.35, 0.085, 0.085, '#c62828')); return a; } },
    reflector: { n: 'Reflector', d: [0.5, 6.1, 0.5], color: '#6b7178', partes: (c?) => [Cy(0, 3, 0, 0.14, 6, c), B(0, 5.95, 0.15, 0.45, 0.3, 0.15, '#333333'), Lz(0, 5.9, 0.26, 0.3, '#fff6d0')] },
    arbusto: { n: 'Arbusto', d: [1.4, 1.0, 1.4], color: '#4f7a3a', partes: (c?) => [Sp(0, 0.5, 0, 1.4, 1.0, 1.4, c)] },
    palmera: { n: 'Palmera', d: [3, 7, 3], color: '#4a7a32', partes: (c?) => { const a = [Cy(0, 3.2, 0, 0.35, 6.4, '#8a7356'), Sp(0, 6.5, 0, 1.1, 0.8, 1.1, c)]; for (let k = 0; k < 6; k++) { const g = k * Math.PI / 3; a.push(B(Math.cos(g) * 1.05, 6.35, -Math.sin(g) * 1.05, 2.2, 0.06, 0.5, c, { r: [0, g, -0.35] })); } return a; } },
    roca: { n: 'Roca', d: [1.2, 0.7, 1.0], color: '#8a8780', partes: (c?) => [Sp(0, 0.3, 0, 1.2, 0.7, 1.0, c)] }
  };

  const COCHES = { sedan: ['Sedán', 4.6, 1.45, 1.8], suv: ['SUV', 4.8, 1.8, 1.9], pickup: ['Pickup', 5.3, 1.85, 1.9], camion: ['Camión', 8, 3.4, 2.5] };
  const CONTS = { '20': ['20 pies (6,1 m)', 6.06], '40': ['40 pies (12,2 m)', 12.19] };
  const CATEGORIAS = [['oficina', 'Oficina'], ['exterior', 'Exterior'], ['vehiculos', 'Vehículos'], ['industrial', 'Industrial'], ['senalizacion', 'Señalización'], ['iluminacion', 'Iluminación'], ['naturaleza', 'Naturaleza'], ['componentes', 'Mis componentes']];
  const ITEMS = [];
  const obj = (id?, cat?) => ITEMS.push({ id, n: OBJ[id].n, cat, tipo: 'objeto:' + id, datos: { sx: OBJ[id].d[0], sy: OBJ[id].d[1], sz: OBJ[id].d[2], color: OBJ[id].color } });
  ['silla', 'mesa', 'escritorio', 'computador', 'archivador', 'estanteria', 'sofa', 'pizarra', 'dispensador', 'planta_maceta'].forEach((k?) => obj(k, 'oficina'));
  ['banca', 'mesa_marmol', 'tacho', 'macetero', 'toldo', 'caseta'].forEach((k?) => obj(k, 'exterior'));
  for (const k in COCHES) ITEMS.push({ id: k, n: COCHES[k][0], cat: 'vehiculos', tipo: 'coche', datos: { subtipo: k, sx: COCHES[k][1], sy: COCHES[k][2], sz: COCHES[k][3], color: k === 'camion' ? '#2f5f8f' : '#8a1f22' } });
  ITEMS.push({ id: 'trailer', n: 'Tráiler', cat: 'vehiculos', tipo: 'trailer', datos: { sx: 12.5, sy: 1.5, sz: 2.5, color: '#4a4f55' } });
  obj('montacargas', 'vehiculos');
  ITEMS.push({ id: 'contenedor20', n: 'Contenedor 20 pies', cat: 'industrial', tipo: 'contenedor', datos: { subtipo: '20', sx: 6.06, sy: 2.59, sz: 2.44, color: '#2f6e8e' } });
  ITEMS.push({ id: 'contenedor40', n: 'Contenedor 40 pies', cat: 'industrial', tipo: 'contenedor', datos: { subtipo: '40', sx: 12.19, sy: 2.59, sz: 2.44, color: '#b5452b' } });
  ['tarima', 'barril', 'caja_madera', 'rack', 'tanque'].forEach((k?) => obj(k, 'industrial'));
  /* (2.1) carteles y señales editables (carteles.js): texto, colores, placa, borde, pared o de pie; llegan al juego */
  [['cartel', 'Cartel / texto', { texto: 'OFICINA', senal: 'ninguna', alto: 0.08, colorTexto: '#ffffff', colorFondo: '#1f2a36', placa: 'si', borde: 1, colorBorde: '#ffffff', montaje: 'pared', altura: 1.9 }],
   ['cartel_salida', 'Señal de salida', { texto: 'SALIDA', senal: 'salida_der', alto: 0.07, placa: 'si', borde: 0, montaje: 'pared', altura: 2.2 }],
   ['cartel_extintor', 'Señal de extintor', { texto: 'EXTINTOR', senal: 'extintor', alto: 0.05, placa: 'si', borde: 0, montaje: 'pared', altura: 1.9 }],
   ['cartel_bano', 'Letrero de baño (azul)', { texto: 'BAÑO\nHOMBRES', senal: 'bano_h', alto: 0.05, placa: 'si', borde: 0, montaje: 'pared', altura: 1.65 }],
   ['cartel_peligro', 'Señal de peligro', { texto: 'PELIGRO', senal: 'peligro', alto: 0.06, placa: 'si', borde: 0.6, colorBorde: '#111111', montaje: 'pared', altura: 1.8 }],
   ['cartel_flecha', 'Flecha', { texto: '', senal: 'flecha_der', alto: 0.1, placa: 'si', borde: 0, montaje: 'pared', altura: 2.0 }],
   ['cartel_pie', 'Cartel de pie', { texto: 'PUNTO DE\nENCUENTRO', senal: 'punto_encuentro', alto: 0.1, placa: 'si', borde: 0, montaje: 'pie', altura: 1.7 }],
   ['texto_suelto', 'Letras sueltas en la pared', { texto: 'AUDITORÍA', senal: 'ninguna', alto: 0.16, colorTexto: '#f4f6f8', placa: 'no', montaje: 'pared', altura: 2.8 }]
  ].forEach(([id, n, d]) => ITEMS.push({ id, n, cat: 'senalizacion', tipo: 'cartel', datos: Object.assign({ sx: 1, sy: 0.4, sz: 0.02 }, d) }));
  ['letrero', 'senal_pare', 'cono', 'valla', 'reductor', 'pluma'].forEach((k?) => obj(k, 'senalizacion'));
  ITEMS.push({ id: 'farola', n: 'Farola', cat: 'iluminacion', tipo: 'poste', datos: { sx: 1.6, sy: 7, sz: 0.4, alcance: 12 } });
  ITEMS.push({ id: 'luz', n: 'Luz', cat: 'iluminacion', tipo: 'luz', datos: { sx: 0.4, sy: 0.4, sz: 0.4, altura: 2.6, alcance: 8, color: '#fff0cf' } });
  obj('reflector', 'iluminacion');
  ITEMS.push({ id: 'arbol', n: 'Árbol', cat: 'naturaleza', tipo: 'arbol', datos: { sx: 3.5, sy: 5.5, sz: 3.5, color: '#4f7a3a' } });
  ['palmera', 'arbusto', 'roca'].forEach((k?) => obj(k, 'naturaleza'));

  function escalar(parts?, d?, e?) {
    const kx = (+e.sx || d[0]) / d[0], ky = (+e.sy || d[1]) / d[1], kz = (+e.sz || d[2]) / d[2];
    if (Math.abs(kx - 1) < 1e-6 && Math.abs(ky - 1) < 1e-6 && Math.abs(kz - 1) < 1e-6) return parts;
    for (const p of parts) {
      p.p = [p.p[0] * kx, p.p[1] * ky, p.p[2] * kz];
      if (p.f === 't') { p.w *= kx; p.h *= ky; continue; }
      const giraX = p.r && Math.abs(Math.abs(p.r[0]) - Math.PI / 2) < 0.01;
      p.s = giraX ? [p.s[0] * kx, p.s[1] * kz, p.s[2] * ky] : [p.s[0] * kx, p.s[1] * ky, p.s[2] * kz];
    }
    return parts;
  }
  function partesCoche(sub?, c?) {
    const cr = '#2a333c';
    if (sub === 'suv') return [B(0, 0.72, 0, 4.8, 0.8, 1.9, c), B(-0.2, 1.38, 0, 3.4, 0.54, 1.76, cr), B(-0.2, 1.67, 0, 3.3, 0.06, 1.72, c), Rueda(1.5, 0.38, 0.85, 0.76, 0.26), Rueda(1.5, 0.38, -0.85, 0.76, 0.26), Rueda(-1.5, 0.38, 0.85, 0.76, 0.26), Rueda(-1.5, 0.38, -0.85, 0.76, 0.26), B(2.41, 0.95, 0.65, 0.04, 0.12, 0.3, '#f3f0d8'), B(2.41, 0.95, -0.65, 0.04, 0.12, 0.3, '#f3f0d8'), B(-2.41, 0.95, 0.7, 0.04, 0.14, 0.25, '#b3191c'), B(-2.41, 0.95, -0.7, 0.04, 0.14, 0.25, '#b3191c')];
    if (sub === 'pickup') return [B(0, 0.66, 0, 5.3, 0.62, 1.9, c), B(0.55, 1.25, 0, 1.8, 0.58, 1.76, cr), B(0.55, 1.56, 0, 1.7, 0.06, 1.72, c), B(-1.6, 1.1, 0.92, 2.1, 0.3, 0.06, c), B(-1.6, 1.1, -0.92, 2.1, 0.3, 0.06, c), B(-2.62, 1.1, 0, 0.06, 0.3, 1.9, c), Rueda(1.65, 0.38, 0.85, 0.76, 0.26), Rueda(1.65, 0.38, -0.85, 0.76, 0.26), Rueda(-1.65, 0.38, 0.85, 0.76, 0.26), Rueda(-1.65, 0.38, -0.85, 0.76, 0.26), B(2.66, 0.85, 0.65, 0.04, 0.12, 0.3, '#f3f0d8'), B(2.66, 0.85, -0.65, 0.04, 0.12, 0.3, '#f3f0d8')];
    if (sub === 'camion') return [B(0, 0.75, 0, 8, 0.3, 1.0, '#2b2b2b'), B(3.05, 1.6, 0, 1.9, 2.2, 2.4, c), B(4.01, 2.1, 0, 0.04, 0.8, 2.1, cr), B(-0.95, 2.05, 0, 6.0, 2.7, 2.5, '#e9e9e6'), Rueda(3.0, 0.5, 1.05, 1.0, 0.32), Rueda(3.0, 0.5, -1.05, 1.0, 0.32), Rueda(-1.7, 0.5, 1.05, 1.0, 0.32), Rueda(-1.7, 0.5, -1.05, 1.0, 0.32), Rueda(-2.9, 0.5, 1.05, 1.0, 0.32), Rueda(-2.9, 0.5, -1.05, 1.0, 0.32), B(4.01, 1.0, 0.9, 0.04, 0.15, 0.3, '#f3f0d8'), B(4.01, 1.0, -0.9, 0.04, 0.15, 0.3, '#f3f0d8')];
    return [B(0, 0.56, 0, 4.6, 0.62, 1.8, c), B(-0.25, 1.08, 0, 2.5, 0.46, 1.62, cr), B(-0.25, 1.33, 0, 2.3, 0.06, 1.58, c), Rueda(1.42, 0.33, 0.8, 0.66, 0.24), Rueda(1.42, 0.33, -0.8, 0.66, 0.24), Rueda(-1.42, 0.33, 0.8, 0.66, 0.24), Rueda(-1.42, 0.33, -0.8, 0.66, 0.24), B(2.31, 0.68, 0.6, 0.04, 0.12, 0.3, '#f3f0d8'), B(2.31, 0.68, -0.6, 0.04, 0.12, 0.3, '#f3f0d8'), B(-2.31, 0.72, 0.62, 0.04, 0.12, 0.28, '#b3191c'), B(-2.31, 0.72, -0.62, 0.04, 0.12, 0.28, '#b3191c')];
  }
  /* tramos de un muro con huecos (puertas/ventanas): x a lo largo, y desde y0, grosor en z */
  function tramos(x0?, x1?, y0?, H?, G?, huecos?, col?, t?) {
    const hs = (huecos || []).map((h?) => ({ a: Math.max(x0, h.u - h.w / 2), b: Math.min(x1, h.u + h.w / 2), al: Math.max(0, h.al), top: Math.min(H, h.al + h.h) }))
      .filter((h?) => h.b > h.a + 0.01 && h.top > h.al).sort((p?, q?) => p.a - q.a);
    const out = []; let x = x0;
    const caja = (a?, b?, ya?, yb?) => { if (b - a > 0.004 && yb - ya > 0.004) out.push(B((a + b) / 2, y0 + (ya + yb) / 2, 0, b - a, yb - ya, G, col, { t })); };
    for (const h of hs) { const a = Math.max(h.a, x); caja(x, a, 0, H); caja(a, h.b, 0, h.al); caja(a, h.b, h.top, H); x = Math.max(x, h.b); }
    caja(x, x1, 0, H);
    return out;
  }
  const MARCO = 0.08;
  function huecoDe(e?, tipo?) { const w = +e.sx || 0.9, h = +e.sy || 2.1, al = tipo === 'ventana' ? (+e.alfeizar || 0) : 0; return { w: w + 2 * MARCO, al: tipo === 'ventana' ? al - MARCO : 0, h: h + MARCO + (tipo === 'ventana' ? MARCO : 0) }; }

  /* (2.1) Puertas como las reales de las fotos (referencias/fotos_2026-10-30): hojas en un marco propio con la bisagra en x = 0 y la
     cara de fuera hacia +Z; luego se giran un poco sobre la bisagra (entreabiertas) y se llevan al hueco (x de -w/2 a w/2). */
  const ACERO = '#b8bcc0', ALU = '#c9ced3', VIDRIO = '#8fb3c9', NEGRO = '#202428';
  function hojaGirada(partes?, xBis?, zBis?, ang?) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return partes.map((p?) => { const x = p.p[0], z = p.p[2]; const q = Object.assign({}, p); q.p = [xBis + x * c + z * s, p.p[1], zBis - x * s + z * c]; q.r = [0, ang + ((p.r && p.r[1]) || 0), 0]; if (p.r && p.r[0]) q.r[0] = p.r[0]; return q; });
  }
  function hojaMetal(w?, h?, col?, conPaneles?) {
    const t = 0.045, k = oscuro(col, 0.86), cl = oscuro(col, 1.1), a = [B(w / 2, h / 2, 0, w, h, t, col)];
    if (conPaneles) for (const sz of [-1, 1]) for (const [y0, y1] of [[0.25, 0.9], [1.12, h - 0.16]]) {
      a.push(B(w / 2, (y0 + y1) / 2, sz * (t / 2 + 0.003), w - 0.24, y1 - y0, 0.006, cl));
      a.push(B(w / 2, (y0 + y1) / 2, sz * (t / 2 + 0.0045), w - 0.3, y1 - y0 - 0.06, 0.004, k));
    }
    return a;
  }
  function manija(w?, t?, palanca?) {
    const a = [];
    for (const sz of [-1, 1]) {
      a.push(Cy(w - 0.075, 1.0, sz * (t / 2 + 0.006), 0.06, 0.012, ACERO, { r: [Math.PI / 2, 0, 0] }));
      if (palanca) a.push(B(w - 0.12, 1.0, sz * (t / 2 + 0.05), 0.12, 0.022, 0.022, ACERO), B(w - 0.075, 1.0, sz * (t / 2 + 0.028), 0.022, 0.022, 0.05, ACERO));
      else a.push(Sp(w - 0.075, 1.0, sz * (t / 2 + 0.04), 0.06, 0.06, 0.06, ACERO));
    }
    a.push(B(w - 0.075, 1.25, t / 2 + 0.004, 0.035, 0.035, 0.008, ACERO)); // bocallave
    return a;
  }
  const bisagras = (h?, t?) => [0.22, h / 2, h - 0.22].map((y?) => Cy(0, y, 0, 0.022, 0.11, ACERO));
  /* (puertas) `abre`: ángulo de apertura en radianes (0 = cerrada, lo que se ve al colocarla) */
  function hojasPuerta(estilo?, w?, h?, g?, hoja?, abre?) {
    const zb = g / 2 + 0.005, x0 = -w / 2, ang = -(+abre || 0);
    switch (estilo) {
      case 'bano_gris': {
        const col = hoja && hoja !== '#4a555a' ? hoja : '#6b726f', t = 0.045;
        const a = hojaMetal(w, h, col, false).concat(manija(w, t, false), bisagras(h, t));
        a.push(B(w / 2, 0.1, t / 2 + 0.002, w - 0.06, 0.16, 0.003, ACERO));
        const ancho = Math.min(0.5, w - 0.2);
        a.push(B(w / 2, 1.62, t / 2 + 0.004, ancho, ancho * 0.92, 0.004, '#1d3f91'));
        a.push({ f: 't', texto: 'BAÑO', p: [w / 2, 1.62, t / 2 + 0.0075], w: ancho, h: ancho * 0.92, bg: '#1d3f91', fg: '#ffffff', cartel: { texto: 'BAÑO\nHOMBRES', senal: 'bano_h', alto: 0.045, placa: 'si', colorFondo: '#1d3f91', borde: 0, montaje: 'pared' } });
        return hojaGirada(a, x0, zb, ang);
      }
      case 'madera': {
        const col = hoja && hoja !== '#4a555a' ? hoja : '#9a6a42', t = 0.044, k = oscuro(col, 0.8);
        const a = [B(w / 2, h / 2, 0, w, h, t, col)];
        for (const sz of [-1, 1]) for (const cx of [w * 0.28, w * 0.72]) for (const [y0, y1] of [[0.2, 0.88], [1.12, h - 0.14]]) a.push(B(cx, (y0 + y1) / 2, sz * (t / 2 + 0.002), w * 0.34, y1 - y0, 0.004, k));
        return hojaGirada(a.concat(manija(w, t, true), bisagras(h, t)), x0, zb, ang);
      }
      case 'vidrio_aluminio': {
        const t = 0.05, m = 0.07, a = [B(m / 2, h / 2, 0, m, h, t, ALU), B(w - m / 2, h / 2, 0, m, h, t, ALU), B(w / 2, h - m / 2, 0, w, m, t, ALU), B(w / 2, 0.07, 0, w, 0.14, t, ALU), B(w / 2, 1.02, 0, w, 0.06, t, ALU)];
        a.push(B(w / 2, (0.14 + 0.99) / 2, 0, w - 2 * m, 0.85, 0.012, VIDRIO, { t: true }), B(w / 2, (1.05 + h - m) / 2, 0, w - 2 * m, h - m - 1.05, 0.012, VIDRIO, { t: true }));
        for (const sz of [-1, 1]) a.push(B(w - 0.14, 1.0, sz * 0.06, 0.03, 0.5, 0.03, ACERO));
        a.push(B(0.3, h - 0.08, -t / 2 - 0.03, 0.45, 0.05, 0.05, '#3a3d42')); // cierrapuertas
        return hojaGirada(a, x0, zb, ang);
      }
      case 'corrediza': {
        const t = 0.045, wm = w / 2 + 0.05, a = [B(0, h + 0.05, 0, w + 0.1, 0.1, 0.14, ALU)];
        for (const [cx, z] of [[-w / 4, 0.035], [w / 4 - w * 0.3, -0.035]]) {
          a.push(B(cx - wm / 2 + 0.03, h / 2, z, 0.06, h, t, ALU), B(cx + wm / 2 - 0.03, h / 2, z, 0.06, h, t, ALU), B(cx, h - 0.03, z, wm, 0.06, t, ALU), B(cx, 0.06, z, wm, 0.12, t, ALU));
          a.push(B(cx, h / 2 + 0.03, z, wm - 0.12, h - 0.18, 0.01, VIDRIO, { t: true }), B(cx + wm / 2 - 0.08, 1.0, z + Math.sign(z) * 0.03, 0.025, 0.35, 0.02, ACERO));
        }
        return a;
      }
      case 'reja': {
        const a = [], hh = h - 0.04;
        for (const [xa, xb] of [[-w / 2, 0], [0, w / 2]]) {
          const cx = (xa + xb) / 2, ww = xb - xa - 0.02;
          a.push(B(cx, hh / 2 + 0.02, 0, ww, 0.05, 0.05, NEGRO, { }), B(xa + 0.035, hh / 2 + 0.02, 0, 0.05, hh, 0.05, NEGRO), B(xb - 0.035, hh / 2 + 0.02, 0, 0.05, hh, 0.05, NEGRO), B(cx, hh - 0.005, 0, ww, 0.05, 0.05, NEGRO), B(cx, 0.06, 0, ww, 0.05, 0.05, NEGRO));
          const n = Math.max(2, Math.floor(ww / 0.12));
          for (let i = 1; i < n; i++) a.push(B(xa + 0.01 + i * ww / n, hh / 2 + 0.02, 0, 0.02, hh - 0.08, 0.02, NEGRO));
        }
        a.push(B(-0.04, 1.05, 0.04, 0.05, 0.12, 0.03, '#8a8f94'));
        return a;
      }
      case 'persiana': {
        const a = [B(0, h + 0.18, 0, w + 0.16, 0.36, 0.36, '#9aa1a8'), B(-w / 2 - 0.04, h / 2, 0, 0.06, h, 0.1, '#7d848b'), B(w / 2 + 0.04, h / 2, 0, 0.06, h, 0.1, '#7d848b')];
        const baja = 1; // bajada del todo
        const n = Math.floor(h * baja / 0.075);
        for (let i = 0; i < n; i++) a.push(B(0, h - 0.0375 - i * 0.075, (i % 2 ? 0.006 : -0.006), w, 0.07, 0.016, i % 2 ? '#8d949b' : '#a3aab1'));
        a.push(B(0, 0.04, 0, w, 0.08, 0.04, '#5f666c'), B(0, 0.5, 0.03, 0.18, 0.03, 0.03, ACERO));
        return a;
      }
      default: { // metal_oficina: chapa de acero con dos tableros estampados, manija de palanca, bisagras y placa de patada
        const col = hoja && hoja !== '#8b6a4a' ? hoja : '#4a555a', t = 0.045;
        const a = hojaMetal(w, h, col, true).concat(manija(w, t, true), bisagras(h, t));
        a.push(B(w / 2, 0.1, t / 2 + 0.002, w - 0.06, 0.16, 0.003, ACERO));
        return hojaGirada(a, x0, zb, ang);
      }
    }
  }

  function construir(o?) {
    const e = o.datos || {}; const t = String(o.tipo || ''); const ci = t.indexOf(':'); const base = ci < 0 ? t : t.slice(0, ci), sub = ci < 0 ? '' : t.slice(ci + 1);
    const col = e.color || '#cccccc';
    switch (base) {
      case 'muro': { const pm = (() => { /* (2.1 pro f3) zócalos y revestimientos por cara: revestimientos.js */
        const L = +e.sx, ext = o.ext || [0, 0];
        /* (2.1) presets (muro exterior, valla, reja…): presets_muro.js dibuja el muro entero con sus franjas y remates */
        if (+e.curva && window.OOParedes) { const pc = OOParedes.partesCurva(e, col, ext, { B }); if (pc) return pc; } /* (2.1 pro) pared curva: flecha en metros (paredes.js) */
        if (e.preset && window.OOPresetsMuro) { const pz = OOPresetsMuro.partes(e, -L / 2 - ext[0], L / 2 + ext[1], o.huecos, { B, tramos }); if (pz) return pz; }
        return tramos(-L / 2 - ext[0], L / 2 + ext[1], 0, +e.sy, +e.sz, o.huecos, col, e.material === 'vidrio');
      })(); return window.OORevestimientos ? OORevestimientos.muro(e, pm, o) : pm;
      }
      case 'hueco': { /* (2.1) hueco propio en una pared: el vano lo corta la pared; aquí solo su borde (marca del editor) y una caja invisible para elegirlo */
        const w = Math.max(0.05, +e.sx || 1), h = Math.max(0.05, +e.sy || 1), al = +e.alfeizar || 0, g = Math.max(0.05, +e.sz || 0.2) + 0.02, k = 0.025, c = '#ff8f00';
        return [B(0, al + h / 2, 0, w, h, g, c, { oculta: true, ayuda: true }), B(-w / 2 + k / 2, al + h / 2, 0, k, h, g, c, { ayuda: true }), B(w / 2 - k / 2, al + h / 2, 0, k, h, g, c, { ayuda: true }), B(0, al + h - k / 2, 0, w, k, g, c, { ayuda: true }), B(0, al + k / 2, 0, w, k, g, c, { ayuda: true })];
      }
      case 'edificio': {
        const g = +e.grosor || 0.2, pisos = Math.max(1, Math.round(+e.pisos || 1)), h = +e.sy || 3, sx = +e.sx, sz = +e.sz, vid = e.material === 'vidrio';
        const a = [B(0, h / 2, sz / 2 - g / 2, sx, h, g, col, { t: vid }), B(0, h / 2, -sz / 2 + g / 2, sx, h, g, col, { t: vid }), B(sx / 2 - g / 2, h / 2, 0, g, h, Math.max(0.01, sz - 2 * g), col, { t: vid }), B(-sx / 2 + g / 2, h / 2, 0, g, h, Math.max(0.01, sz - 2 * g), col, { t: vid })];
        for (let k = 1; k < pisos; k++) a.push(B(0, k * h / pisos, 0, Math.max(0.01, sx - 2 * g), 0.2, Math.max(0.01, sz - 2 * g), '#bdbab3'));
        a.push(B(0, h + 0.1, 0, sx + 0.3, 0.2, sz + 0.3, oscuro(col, 0.7)));
        return a;
      }
      case 'calle': {
        const a = [B(0, e.sy / 2, 0, e.sx, e.sy, e.sz, col)];
        if (e.material === 'asfalto' && Math.min(e.sx, e.sz) >= 5) {
          const largo = Math.max(e.sx, e.sz), eje = e.sx >= e.sz ? 'x' : 'z'; const n = Math.floor(largo / 6);
          for (let k = 0; k < n; k++) { const u = -largo / 2 + 3 + k * 6; if (u + 1.5 > largo / 2) break; a.push(eje === 'x' ? B(u, e.sy + 0.005, 0, 3, 0.01, 0.15, '#f2f2f2') : B(0, e.sy + 0.005, u, 0.15, 0.01, 3, '#f2f2f2')); }
        }
        return a;
      }
      case 'puerta': case 'ventana': {
        const w = +e.sx, h = +e.sy, g = (+e.sz || 0.2) + 0.03, fw = MARCO, al = base === 'ventana' ? (+e.alfeizar || 0) : 0;
        const a = [B(-w / 2 - fw / 2, al + h / 2, 0, fw, h, g, col), B(w / 2 + fw / 2, al + h / 2, 0, fw, h, g, col), B(0, al + h + fw / 2, 0, w + 2 * fw, fw, g, col)];
        if (base === 'ventana') { a.push(B(0, al - fw / 2, 0, w + 2 * fw, fw, g + 0.06, col)); a.push(B(0, al + h / 2, 0, w, h, 0.03, '#8fc3e6', { t: true })); a.push(B(0, al + h / 2, 0, 0.04, h, 0.05, col)); }
        else if (e.estilo === 'simple') { const ang = -(+e.apertura || 0) * Math.PI / 180; const dx = Math.cos(-ang), dz = Math.sin(-ang); a.push(B(-w / 2 + dx * w / 2, h / 2, dz * w / 2 + (ang ? g / 2 : 0), w, h - 0.02, 0.04, e.hoja || '#8b6a4a', { r: [0, ang, 0] })); }
        else { if (['vidrio_aluminio', 'corrediza'].includes(e.estilo)) for (const p of a) p.c = '#c9ced3'; a.push(...hojasPuerta(e.estilo || 'metal_oficina', w, h, g, e.hoja, (+e.apertura || 0) * Math.PI / 180)); } /* cerradas por defecto; «Apertura» las muestra abiertas */
        return a;
      }
      case 'poste': { const H = +e.sy || 7; return [Cy(0, 0.3, 0, 0.32, 0.6, '#5b6168'), Cy(0, H / 2, 0, 0.16, H, '#6b7178'), B(0.65, H - 0.1, 0, 1.3, 0.08, 0.08, '#6b7178'), Lz(1.25, H - 0.22, 0, 0.38, '#fff2c0')]; }
      case 'cartel': return window.OOCartel ? window.OOCartel.partes(e) : [B(0, 1.8, 0, 1, 0.4, 0.02, col)];
      case 'luz': return [Lz(0, +e.altura || 2.6, 0, 0.35, col)];
      case 'arbol': return escalar([Cy(0, 1.25, 0, 0.32, 2.5, '#6b4f35'), Sp(0, 3.75, 0, 3.5, 3.5, 3.5, e.color || '#4f7a3a')], [3.5, 5.5, 3.5], e);
      case 'coche': { const k = COCHES[e.subtipo] ? e.subtipo : 'sedan'; const c = COCHES[k]; return escalar(partesCoche(k, col), [c[1], c[2], c[3]], e); }
      case 'contenedor': {
        const L = +e.sx || 6.06, H = +e.sy || 2.59, W = +e.sz || 2.44, dk = oscuro(col, 0.72);
        const a = [B(0, H / 2, 0, L, H, W, col)];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) a.push(B(sx * (L / 2 - 0.09), H / 2, sz * (W / 2 - 0.09), 0.2, H + 0.02, 0.2, dk));
        for (const sz of [-1, 1]) { a.push(B(0, H - 0.06, sz * (W / 2 - 0.03), L, 0.12, 0.09, dk)); a.push(B(0, 0.06, sz * (W / 2 - 0.03), L, 0.12, 0.09, dk)); }
        const n = Math.max(0, Math.floor((L - 0.8) / 0.6));
        for (let j = 0; j < n; j++) { const x = -L / 2 + 0.5 + (j + 0.5) * ((L - 1) / n); for (const sz of [-1, 1]) a.push(B(x, H / 2, sz * (W / 2 + 0.01), 0.07, H - 0.32, 0.03, dk)); }
        a.push(B(L / 2 + 0.01, H / 2, 0, 0.03, H - 0.25, W - 0.25, dk), B(L / 2 + 0.03, H / 2, -W / 4, 0.04, H - 0.3, 0.05, '#333a40'), B(L / 2 + 0.03, H / 2, W / 4, 0.04, H - 0.3, 0.05, '#333a40'));
        return a;
      }
      case 'trailer': return escalar([B(0, 1.3, 0, 12.5, 0.2, 2.5, col), B(0, 1.05, 0.5, 12.3, 0.3, 0.15, '#2a2a2a'), B(0, 1.05, -0.5, 12.3, 0.3, 0.15, '#2a2a2a'), Rueda(-4.6, 0.5, 0.95, 1.0, 0.5), Rueda(-4.6, 0.5, -0.95, 1.0, 0.5), Rueda(-3.4, 0.5, 0.95, 1.0, 0.5), Rueda(-3.4, 0.5, -0.95, 1.0, 0.5), Rueda(-2.2, 0.5, 0.95, 1.0, 0.5), Rueda(-2.2, 0.5, -0.95, 1.0, 0.5), B(3.8, 0.62, 0.8, 0.12, 1.1, 0.12, '#333333'), B(3.8, 0.62, -0.8, 0.12, 1.1, 0.12, '#333333'), B(-6.2, 0.85, 0, 0.15, 0.15, 2.3, '#c33333')], [12.5, 1.5, 2.5], e);
      case 'nota': { if (window.OONotas) return OONotas.partes(e, o); /* (2.1 pro f5) pin grande con caja para el clic y estado (notas_pro.js) */ const foto = o.fotos && o.fotos.length; return [Cy(0, 1.1, 0, 0.06, 2.2, '#7a1f1f'), Sp(0, 2.3, 0, 0.5, 0.5, 0.5, foto ? '#1f6feb' : '#e53935')]; }
      case 'habitacion': { const el = +e.elevacion || 0, g = e.grosor != null && isFinite(+e.grosor) ? Math.max(0.005, +e.grosor) : 0.03; return [{ f: 'poly', pts: e.puntos || [], y: 0.012 + el, grosor: g, c: col, agujeros: (Array.isArray(e.agujeros) ? e.agujeros : []).concat(e.agujeros_auto ? Object.values(e.agujeros_auto) : []) }]; } /* (2.1 pro f3) agujeros_auto: los abren las escaleras (escaleras.js) */ /* (2.1 pro) elevación, grosor y agujeros del piso */
      case 'fundacion': return window.OOFundaciones ? OOFundaciones.partes(e) : [B(0, (+e.elevacion || 0.5) / 2, 0, +e.sx || 4, +e.elevacion || 0.5, +e.sz || 4, col)]; /* (2.1 pro) fundaciones.js */
      case 'techo': if (e.forma && window.OOTechos) return OOTechos.partes(e, col); /* (2.1 pro f3) cubiertas paramétricas (techos.js) */ { const g = +e.grosor || 0.15; return [{ f: 'poly', pts: e.puntos || [], y: 0, grosor: g, c: col, agujeros: (Array.isArray(e.agujeros) ? e.agujeros : []).concat(e.agujeros_auto ? Object.values(e.agujeros_auto) : []) }]
        .concat((Array.isArray(e.claraboyas) ? e.claraboyas : []).filter((v?) => Array.isArray(v) && v.length >= 3).map((v?) => ({ f: 'poly', pts: v, y: g - 0.03, grosor: 0.02, c: '#bfe3f0', t: true }))); } /* huecos propios (huecos_losas.js), de escalera (escaleras.js) y claraboyas */
      case 'escalera': case 'rampa': if (window.OOEscaleras) return OOEscaleras.partes(e, col, base); break; /* (2.1 pro f3) escaleras.js */
      case 'baranda': if (window.OORevestimientos) return OORevestimientos.baranda(e, col); break;
      case 'objeto': { const c = OBJ[sub]; if (!c) return [B(0, 0.5, 0, 1, 1, 1, col)]; return escalar(c.partes(e.color || c.color, e), c.d, e); }
      case 'copia': {
        const d0 = Array.isArray(e.d0) ? e.d0 : [e.sx || 1, e.sy || 1, e.sz || 1];
        const kx = (+e.sx || d0[0]) / (d0[0] || 1), ky = (+e.sy || d0[1]) / (d0[1] || 1), kz = (+e.sz || d0[2]) / (d0[2] || 1);
        return (e.partes || []).map((p?) => ({ f: p.f || 'b', p: [p.p[0] * kx, p.p[1] * ky, p.p[2] * kz], s: [p.s[0] * kx, p.s[1] * ky, p.s[2] * kz], q: p.q, c: p.c || '#999999', t: !!p.t }));
      }
    }
    return [B(0, 0.5, 0, 1, 1, 1, col)];
  }

  window.OO = { MATERIALES, MAT_MURO, MAT_SUELO, muestra, OBJ, COCHES, CONTS, CATEGORIAS, ITEMS, construir, tramos, huecoDe, oscuro, B, MARCO };
})();
