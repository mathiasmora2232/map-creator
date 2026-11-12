/* Editor del mapa (2.1, Map Editor Pro fase 4): edificios prefabricados paramétricos (§8.2).
   Caseta o garita, oficina modular, contenedor-oficina, bodega o galpón, baño público, casa pequeña, casa de dos plantas y local
   comercial. No son cajas: al colocarlos se crean, en un solo paso de deshacer, los objetos de las fases 2 y 3 (fundación elevada,
   piso, paredes paramétricas, puertas y ventanas en sus paredes, cubierta paramétrica, plantas con su losa, escalera que abre su
   agujero, escalones o rampa de acceso, toldo y letrero). Después cada pieza se edita con sus herramientas.
   Cómo: el catálogo coloca un objeto «kit:<clave>» (su vista previa es el edificio entero, generado aquí) y una regla de anclajes.js
   lo cambia, dentro del mismo guardar(), por los documentos de verdad (todos llevan datos.kit = {clave, grupo}).
   Parámetros comunes: ancho, fondo, alto, elevación, acabado y color de las paredes (biblioteca de materiales), cubierta y su color. */
(function () {
  'use strict';
  const OO = window.OO, T = window.THREE; if (!OO || !T || !window.OOPiezas) return;
  const PZ = window.OOPiezas, PI = Math.PI, DEG = PI / 180, r3 = (v?) => Math.round(v * 1000) / 1000;
  const MAT = OO.MATERIALES;

  /* ---------- constructor de documentos en coordenadas del edificio (origen en el centro, suelo en y = 0, frente hacia +Z) ---------- */
  function nuevoKit() {
    const docs = [], muros = new Map<any, any>();
    const K = {
      docs,
      add(k?, tipo?, datos?, props?) { docs.push({ k, tipo, datos, props: props || {} }); return k; },
      fundacion(k?, W?, D?, el?, extra?) { return K.add(k, 'fundacion', Object.assign({ forma: 'rect', x: 0, y: 0, z: 0, giroY: 0, sx: W, sz: D, elevacion: el, sy: Math.max(0.02, el), espesor: 0.2, base: 'macizo', borde: 'recto', matSup: 'concreto', colorSup: (MAT.concreto || {}).c || '#b9b4aa', matLat: 'concreto', colorLat: '#8f8a80' }, extra || {}), { nombre: 'Fundación' }); },
      piso(k?, W?, D?, y?, alto?, extra?, cx?, cz?) { cx = cx || 0; cz = cz || 0; return K.add(k, 'habitacion', Object.assign({ x: cx, y, z: cz, giroY: 0, puntos: [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], area: r3(W * D), nombre: 'Habitación', material: 'baldosa', color: (MAT.baldosa || {}).c, alto, sx: W, sy: 0.03, sz: D }, extra || {}), { nombre: (extra && extra.nombre) || 'Piso' }); },
      muro(k?, a?, b?, y?, alto?, g?, extra?, props?) {
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); muros.set(k, { a, b, L, g: Math.atan2(-dz, dx) / DEG, y, grosor: g });
        return K.add(k, 'muro', Object.assign({ x: (a[0] + b[0]) / 2, y, z: (a[1] + b[1]) / 2, giroY: Math.atan2(-dz, dx) / DEG, sx: L, sy: alto, sz: g, material: 'pintura', color: '#e8e6df' }, extra || {}), props || { nombre: 'Pared' });
      },
      /* puerta, ventana: t ∈ [0, 1] a lo largo de la pared (de a hacia b) */
      abertura(k?, tipo?, muro?, t?, extra?, props?) {
        const w = muros.get(muro); if (!w) return null; const x = w.a[0] + (w.b[0] - w.a[0]) * t, z = w.a[1] + (w.b[1] - w.a[1]) * t;
        const base = tipo === 'puerta' ? { sx: 0.9, sy: 2.1, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a' } : { sx: 1.2, sy: 1.0, alfeizar: 1.0, color: '#3d7fbf' };
        const d = Object.assign({ x, y: w.y, z, giroY: w.g, sz: w.grosor }, base, extra || {}, { muro, _t: t });
        return K.add(k, tipo, d, props || { nombre: tipo === 'puerta' ? 'Puerta' : 'Ventana' });
      },
      muroInfo: (k?) => muros.get(k)
    };
    return K;
  }
  /* las cuatro paredes de un rectángulo W × D (ejes en los bordes), en orden frente (+Z), derecha (+X), fondo (−Z), izquierda (−X) */
  function cuatroMuros(K?, pre?, W?, D?, y?, alto?, g?, extra?) {
    const c = [[-W / 2, D / 2], [W / 2, D / 2], [W / 2, -D / 2], [-W / 2, -D / 2]];
    const nombres = ['frente', 'derecha', 'fondo', 'izquierda'];
    return [0, 1, 2, 3].map((i?) => K.muro(pre + nombres[i], c[i], c[(i + 1) % 4], y, alto, g, extra, { nombre: 'Pared ' + nombres[i] }));
  }
  function techo(K?, k?, forma?, W?, D?, y?, extra?) {
    const TO = window.OOTechos; const df = TO ? TO.datosForma(forma, {}) : { forma };
    const d = Object.assign({ x: 0, y, z: 0, giroY: 0, puntos: [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], sx: W, sz: D, soporte: { tipo: 'fundacion', id: 'f', manual: true } }, df, { orientacion: W >= D ? 0 : 90 }, extra || {}); /* anclada a la fundación: sube con ella */
    d.grosor = d.espesor; d.sy = d.espesor; d.material = d.cubierta === 'chapa' ? 'chapa' : d.cubierta === 'tejas' ? 'ladrillo' : 'concreto';
    return K.add(k, 'techo', d, { nombre: 'Cubierta' });
  }
  /* escalones o escalera: pie [x, z], giro en grados (sube hacia +X girado), y del pie, alto */
  function escalera(K?, k?, pie?, giro?, y?, alto?, ancho?, extra?) {
    const ES = window.OOEscaleras; let d = Object.assign({ giroY: giro, y, alto, ancho, forma: 'recta', giro: 'izq', descanso: false, barandas: alto > 0.7 ? 'der' : 'ninguna', estilo: 'maciza', color: '#b9b4aa', alturaBaranda: 0.9 }, extra || {});
    if (ES) { d = ES.normalizar(d); ES.conPie(d, pie); } else Object.assign(d, { x: pie[0], z: pie[1], sx: 1, sy: alto, sz: ancho });
    return K.add(k, 'escalera', d, { nombre: alto > 0.7 ? 'Escalera' : 'Escalones' });
  }
  /* escalones de acceso delante de la pared del frente (bajan hacia +Z) */
  function accesoFrente(K?, k?, x?, zBorde?, el?, ancho?) { if (el < 0.12) return null; const ES = window.OOEscaleras; const n = Math.max(1, Math.ceil(el / 0.18 - 1e-6)), c = el / n, h = Math.max(0.25, Math.min(0.32, 0.63 - 2 * c)); return escalera(K, k, [x, zBorde + n * h], 90, 0, el, ancho || 1.2, {}); }

  /* acabados: material de la biblioteca (props.material «u:…»), con su color si no es el del preset */
  function materialKit(preset?, color?) {
    const MP = window.OOMatPro; if (!MP || !preset || !MP.PRESETS[preset]) return null; const P = MP.PRESETS[preset];
    if (!color || String(color).toLowerCase() === String(P.color).toLowerCase()) return { id: 'preset-' + preset, preset, color: null };
    return { id: 'kit-' + preset + '-' + String(color).replace('#', '').toLowerCase(), preset, color };
  }
  const ACABADOS = [['color', 'Solo color'], ['pared_blanca', 'Enlucido'], ['ladrillo', 'Ladrillo'], ['bloque', 'Bloque de hormigón'], ['hormigon_nuevo', 'Hormigón'], ['chapa_ondulada', 'Chapa ondulada'], ['madera_clara', 'Madera']];
  const PISOS = [['color', 'Solo color'], ['baldosa', 'Baldosa'], ['ceramica', 'Cerámica'], ['porcelanato', 'Porcelanato'], ['madera_clara', 'Madera clara'], ['parque', 'Parqué'], ['cemento_pulido', 'Cemento pulido'], ['pavimento_industrial', 'Pavimento industrial']];
  const CUBIERTAS = [['plano', 'Plana'], ['una_pendiente', 'Una pendiente'], ['dos_aguas', 'Dos aguas'], ['cuatro_aguas', 'Cuatro aguas'], ['galpon', 'Galpón'], ['industrial', 'Diente de sierra']];
  const num = (k?, n?, mn?, mx?, st?) => [k, n, 'n', mn, mx, st || 0.05], sel = (k?, n?, ops?) => [k, n, 's', ops], col = (k?, n?) => [k, n, 'c'], chk = (k?, n?) => [k, n, 'b'], txt = (k?, n?) => [k, n, 't'];
  const CAMPOS_BASE = [num('ancho', 'Ancho (m)', 2, 60, 0.1), num('fondo', 'Fondo (m)', 2, 60, 0.1), num('alto', 'Alto de las paredes (m)', 2, 12, 0.1), num('elevacion', 'Elevación de la fundación (m)', 0, 2, 0.05), sel('acabado', 'Acabado de las paredes', ACABADOS), col('colorPared', 'Color de las paredes'), sel('piso', 'Piso', PISOS), sel('cubierta', 'Cubierta', CUBIERTAS), col('colorCubierta', 'Color de la cubierta')];
  /* ventanas repartidas en una pared */
  function ventanas(K?, muro?, n?, extra?, margen?) { const L = K.muroInfo(muro).L, m = margen == null ? 0.15 : margen; for (let i = 0; i < n; i++) K.abertura(muro + '_v' + i, 'ventana', muro, m + (1 - 2 * m) * (i + 0.5) / n, extra); }
  const muroExtra = (p?) => ({ material: p.acabado === 'ladrillo' ? 'ladrillo' : p.acabado === 'bloque' ? 'bloque' : p.acabado === 'chapa_ondulada' ? 'chapa' : p.acabado === 'madera_clara' ? 'madera' : 'pintura', color: p.colorPared, _acabado: p.acabado });
  const pisoExtra = (p?) => ({ material: 'baldosa', color: p.colorPiso || (MAT.baldosa || {}).c, _acabado: p.piso });

  /* ---------- edificios ---------- */
  const KITS = {
    caseta: { n: 'Caseta / garita', def: { ancho: 2.6, fondo: 2.6, alto: 2.5, elevacion: 0.15, acabado: 'pared_blanca', colorPared: '#dcd8cf', piso: 'cemento_pulido', cubierta: 'plano', colorCubierta: '#6b7178', ventanasLado: true },
      campos: CAMPOS_BASE.concat([chk('ventanasLado', 'Ventanas en los lados')]),
      variantes: [['Garita de guardia', {}], ['Caseta de ladrillo', { acabado: 'ladrillo', colorPared: '#a5553a', cubierta: 'una_pendiente', colorCubierta: '#8b959e' }], ['Cabina de peaje', { ancho: 2, fondo: 3.2, colorPared: '#e8b923', acabado: 'color', alto: 2.4 }]],
      gen(K?, p?) {
        const g = 0.15, top = p.elevacion; K.fundacion('f', p.ancho + 0.5, p.fondo + 0.5, p.elevacion);
        K.piso('h', p.ancho - g, p.fondo - g, top, p.alto, pisoExtra(p));
        const [fr, de, fo, iz] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, p.alto, g, muroExtra(p));
        K.abertura('pu', 'puerta', fr, 0.27, { sx: 0.8 }); K.abertura('vf', 'ventana', fr, 0.7, { sx: Math.min(1.1, p.ancho * 0.38), sy: 1.0, alfeizar: 1.0 });
        if (p.ventanasLado) { K.abertura('vd', 'ventana', de, 0.5, { sx: Math.min(1.4, p.fondo * 0.55), alfeizar: 1.0 }); K.abertura('vi', 'ventana', iz, 0.5, { sx: Math.min(1.4, p.fondo * 0.55), alfeizar: 1.0 }); }
        K.abertura('vb', 'ventana', fo, 0.5, { sx: 0.8, sy: 0.6, alfeizar: 1.4 });
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, top + p.alto, { voladizo: 0.35, pretil: 0, espesor: 0.15, color: p.colorCubierta, de_habitacion: 'h' });
        accesoFrente(K, 'e', -p.ancho / 2 + 0.27 * p.ancho, p.fondo / 2 + 0.25, p.elevacion, 1);
      } },
    oficina_modular: { n: 'Oficina modular', def: { ancho: 6, fondo: 3, alto: 2.6, elevacion: 0.45, acabado: 'chapa_ondulada', colorPared: '#e8e8e4', piso: 'baldosa', cubierta: 'una_pendiente', colorCubierta: '#8b959e' },
      campos: CAMPOS_BASE, variantes: [['Módulo de 6 × 3 m', {}], ['Doble módulo 12 × 3 m', { ancho: 12 }], ['Módulo verde', { colorPared: '#5f7f5a' }]],
      gen(K?, p?) {
        const g = 0.1, top = p.elevacion; K.fundacion('f', p.ancho + 0.4, p.fondo + 0.4, p.elevacion, { base: 'losa', matSup: 'metal', colorSup: '#8d949a', colorLat: '#5a5f63' });
        K.piso('h', p.ancho - g, p.fondo - g, top, p.alto, pisoExtra(p));
        const [fr, , fo] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, p.alto, g, muroExtra(p));
        const xp = 0.5 - 1.1 / p.ancho; K.abertura('pu', 'puerta', fr, Math.max(0.15, xp), {});
        ventanas(K, fr, Math.max(1, Math.round(p.ancho / 3)), { sx: 1.1, sy: 1.0, alfeizar: 1.0 }, 0.05); K.docs.filter((d?) => d.k.startsWith(fr + '_v')).forEach((d?) => { if (Math.abs(d.datos._t - Math.max(0.15, xp)) < 0.6 / p.ancho * 2) d.datos._t += 0.25; });
        ventanas(K, fo, Math.max(1, Math.round(p.ancho / 4)), { sx: 1.1, sy: 1.0, alfeizar: 1.0 });
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, top + p.alto, { voladizo: 0.15, color: p.colorCubierta, inclinacion: 5, de_habitacion: 'h' });
        accesoFrente(K, 'e', -p.ancho / 2 + Math.max(0.15, xp) * p.ancho, p.fondo / 2 + 0.2, p.elevacion, 1.2);
      } },
    contenedor_oficina: { n: 'Contenedor-oficina', def: { pies: '20', alto: 2.45, elevacion: 0.3, acabado: 'chapa_ondulada', colorPared: '#2f6e8e', piso: 'baldosa', cubierta: 'plano', colorCubierta: '#2f6e8e' },
      campos: [sel('pies', 'Contenedor', [['20', '20 pies (6,1 × 2,4 m)'], ['40', '40 pies (12,2 × 2,4 m)']]), num('alto', 'Alto interior (m)', 2.2, 2.7), num('elevacion', 'Elevación (m)', 0, 1), sel('acabado', 'Acabado', ACABADOS), col('colorPared', 'Color'), sel('piso', 'Piso', PISOS), col('colorCubierta', 'Color del techo')],
      variantes: [['20 pies azul', {}], ['40 pies rojo', { pies: '40', colorPared: '#b5452b', colorCubierta: '#b5452b' }], ['20 pies blanco', { colorPared: '#e8e8e4', colorCubierta: '#d8d8d4' }]],
      gen(K?, p?) {
        const W = p.pies === '40' ? 12.19 : 6.06, D = 2.44, g = 0.08, top = p.elevacion; K.fundacion('f', W + 0.2, D + 0.2, p.elevacion, { base: 'losa', matSup: 'metal', colorSup: '#5a5f63', colorLat: '#3a3d40' });
        K.piso('h', W - g, D - g, top, p.alto, pisoExtra(p));
        const [fr, de, fo] = cuatroMuros(K, 'w', W, D, top, p.alto, g, muroExtra(p));
        K.abertura('pu', 'puerta', fr, 0.18, { sx: 0.85 }); ventanas(K, fr, p.pies === '40' ? 3 : 1, { sx: 1.2, sy: 0.9, alfeizar: 1.05 }, p.pies === '40' ? 0.25 : 0.45); K.docs.filter((d?) => d.k === fr + '_v0' && p.pies !== '40').forEach((d?) => { d.datos._t = 0.62; });
        ventanas(K, fo, p.pies === '40' ? 2 : 1, { sx: 1.2, sy: 0.9, alfeizar: 1.05 });
        K.abertura('vd', 'ventana', de, 0.5, { sx: 0.9, sy: 0.9, alfeizar: 1.05 });
        techo(K, 't', 'plano', W + g, D + g, top + p.alto, { pretil: 0.05, voladizo: 0.02, espesor: 0.12, cubierta: 'chapa', color: p.colorCubierta, de_habitacion: 'h' });
        for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]) K.add('c' + x + z, 'proc:cubo', { x, y: top, z, giroY: 0, ancho: 0.17, alto: p.alto + 0.14, fondo: 0.17, sx: 0.17, sy: p.alto + 0.14, sz: 0.17, color: '#30363b' }, { nombre: 'Esquinero del contenedor' });
        accesoFrente(K, 'e', -W / 2 + 0.18 * W, D / 2 + 0.1, p.elevacion, 1);
      } },
    bodega: { n: 'Bodega / galpón', def: { ancho: 16, fondo: 10, alto: 6, elevacion: 0.2, acabado: 'bloque', colorPared: '#cfccc4', piso: 'pavimento_industrial', cubierta: 'galpon', colorCubierta: '#a3abb2', portones: 1, rampa: true },
      campos: CAMPOS_BASE.concat([num('portones', 'Portones enrollables', 1, 4, 1), chk('rampa', 'Rampa en el portón')]),
      variantes: [['Galpón de 16 × 10 m', {}], ['Bodega grande con dos portones', { ancho: 24, fondo: 14, alto: 7, portones: 2 }], ['Taller de ladrillo', { ancho: 12, fondo: 8, alto: 4.5, acabado: 'ladrillo', colorPared: '#a5553a', cubierta: 'dos_aguas' }], ['Nave de diente de sierra', { ancho: 20, fondo: 12, cubierta: 'industrial' }]],
      gen(K?, p?) {
        const g = 0.2, top = p.elevacion, n = Math.max(1, Math.round(p.portones)); K.fundacion('f', p.ancho + 0.6, p.fondo + 0.6, p.elevacion);
        K.piso('h', p.ancho - g, p.fondo - g, top, p.alto, Object.assign(pisoExtra(p), { nombre: 'Nave' }));
        const [fr, de, fo, iz] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, p.alto, g, muroExtra(p));
        const wP = Math.min(4.5, p.ancho / (n + 1.5)), hP = Math.min(p.alto - 1, 4.5);
        for (let i = 0; i < n; i++) K.abertura('po' + i, 'puerta', fr, (i + 0.5) / (n + 0.6), { estilo: 'persiana', sx: wP, sy: hP }, { nombre: 'Portón enrollable' });
        K.abertura('pu', 'puerta', fr, 0.93, { sx: 0.9 });
        for (const m of [de, iz]) ventanas(K, m, Math.max(1, Math.floor(p.fondo / 4)), { sx: 2, sy: 0.8, alfeizar: Math.max(2.2, p.alto - 1.5) });
        ventanas(K, fo, Math.max(1, Math.floor(p.ancho / 4)), { sx: 2, sy: 0.8, alfeizar: Math.max(2.2, p.alto - 1.5) });
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, top + p.alto, { color: p.colorCubierta, de_habitacion: 'h' });
        if (p.rampa && p.elevacion >= 0.05 && window.OOEscaleras) { const RD = OOEscaleras.normalizarRampa({ alto: p.elevacion, pendiente: 8, ancho: wP + 0.5, giroY: 90, barandas: 'ninguna', bordillos: false, descanso: 0, color: '#a9a49a' }); const x0 = -p.ancho / 2 + 0.5 / (n + 0.6) * p.ancho; RD.x = x0; RD.z = p.fondo / 2 + 0.3 + RD.sx / 2; RD.y = 0; K.add('r', 'rampa', RD, { nombre: 'Rampa del portón' }); }
      } },
    bano_publico: { n: 'Baño público', def: { ancho: 5, fondo: 3.6, alto: 2.6, elevacion: 0.15, acabado: 'pared_blanca', colorPared: '#d9e4ea', piso: 'ceramica', cubierta: 'plano', colorCubierta: '#9a9a9a' },
      campos: CAMPOS_BASE, variantes: [['Hombres y mujeres', {}], ['Baño de ladrillo', { acabado: 'ladrillo', colorPared: '#a5553a' }], ['Batería grande', { ancho: 8, fondo: 4.5 }]],
      gen(K?, p?) {
        const g = 0.15, top = p.elevacion; K.fundacion('f', p.ancho + 0.5, p.fondo + 0.5, p.elevacion);
        K.piso('h1', p.ancho / 2 - g, p.fondo - g, top, p.alto, Object.assign(pisoExtra(p), { nombre: 'Baño de hombres' }), -p.ancho / 4, 0);
        K.piso('h2', p.ancho / 2 - g, p.fondo - g, top, p.alto, Object.assign(pisoExtra(p), { nombre: 'Baño de mujeres' }), p.ancho / 4, 0);
        const [fr, , fo] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, p.alto, g, muroExtra(p));
        K.muro('wm', [0, p.fondo / 2], [0, -p.fondo / 2], top, p.alto, 0.12, muroExtra(p), { nombre: 'Tabique central' });
        K.abertura('p1', 'puerta', fr, 0.25, { estilo: 'bano_gris', sx: 0.85 }, { nombre: 'Puerta hombres' }); K.abertura('p2', 'puerta', fr, 0.75, { estilo: 'bano_gris', sx: 0.85, hoja: '#7a6f74' }, { nombre: 'Puerta mujeres' });
        K.abertura('v1', 'ventana', fo, 0.25, { sx: 0.6, sy: 0.35, alfeizar: 1.95 }); K.abertura('v2', 'ventana', fo, 0.75, { sx: 0.6, sy: 0.35, alfeizar: 1.95 });
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, top + p.alto, { color: p.colorCubierta, pretil: 0.3 });
      } },
    casa_pequena: { n: 'Casa pequeña', def: { ancho: 7, fondo: 6, alto: 2.6, elevacion: 0.3, acabado: 'pared_blanca', colorPared: '#efe6d2', piso: 'madera_clara', cubierta: 'dos_aguas', colorCubierta: '#b5562f' },
      campos: CAMPOS_BASE, variantes: [['Casa de tejas', {}], ['Casa de ladrillo a cuatro aguas', { acabado: 'ladrillo', colorPared: '#a5553a', cubierta: 'cuatro_aguas', colorCubierta: '#6b4a3a' }], ['Cabaña de madera', { acabado: 'madera_clara', colorPared: '#c9a273', ancho: 6, fondo: 5, cubierta: 'dos_aguas', colorCubierta: '#5a4636' }], ['Casa moderna de techo plano', { cubierta: 'plano', colorPared: '#ecebe4', colorCubierta: '#9a9a9a' }]],
      gen(K?, p?) {
        const g = 0.2, top = p.elevacion, xm = -p.ancho / 2 + p.ancho * 0.58; K.fundacion('f', p.ancho + 0.6, p.fondo + 0.6, p.elevacion);
        K.piso('h', p.ancho - g, p.fondo - g, top, p.alto, Object.assign(pisoExtra(p), { nombre: 'Casa' }));
        const [fr, de, fo, iz] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, p.alto, g, muroExtra(p));
        K.muro('wm', [xm, p.fondo / 2], [xm, -p.fondo / 2], top, p.alto, 0.12, muroExtra(p), { nombre: 'Tabique' });
        K.abertura('pm', 'puerta', 'wm', 0.7, { estilo: 'madera', sx: 0.8, sz: 0.12 }, { nombre: 'Puerta del dormitorio' });
        K.abertura('pu', 'puerta', fr, 0.32, { estilo: 'madera', sx: 0.95 }, { nombre: 'Puerta de entrada' });
        K.abertura('vf1', 'ventana', fr, 0.1 + 0.02, { sx: 1.0 }); K.abertura('vf2', 'ventana', fr, 0.78, { sx: 1.4 });
        K.abertura('vd', 'ventana', de, 0.5, { sx: 1.2 }); K.abertura('vi', 'ventana', iz, 0.5, { sx: 1.2 }); ventanas(K, fo, 2, { sx: 1.0 });
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, top + p.alto, { color: p.colorCubierta, de_habitacion: 'h' });
        accesoFrente(K, 'e', -p.ancho / 2 + 0.32 * p.ancho, p.fondo / 2 + 0.3, p.elevacion, 1.4);
      } },
    casa_dos_plantas: { n: 'Casa de dos plantas', def: { ancho: 8, fondo: 7, alto: 2.7, elevacion: 0.3, acabado: 'pared_blanca', colorPared: '#e9e1cf', piso: 'parque', cubierta: 'dos_aguas', colorCubierta: '#b5562f' },
      campos: CAMPOS_BASE, variantes: [['Casa de tejas', {}], ['Casa de ladrillo', { acabado: 'ladrillo', colorPared: '#a5553a', cubierta: 'cuatro_aguas', colorCubierta: '#5f5f5f' }], ['Casa moderna', { cubierta: 'plano', colorPared: '#f0eee7', colorCubierta: '#8a8a8a', ancho: 9 }]],
      gen(K?, p?) {
        const g = 0.2, top = p.elevacion, A = p.alto;
        K.fundacion('f', p.ancho + 0.6, p.fondo + 0.6, p.elevacion, { niveles: [{ id: 'pb', altura: A }, { id: 'p1', altura: A }] });
        const ed = { edificio: 'f' }, pb = Object.assign({ nivel: 'pb' }, ed), p1 = Object.assign({ nivel: 'p1', soporte: { tipo: 'fundacion', id: 'f', manual: true } }, ed);
        K.piso('h', p.ancho - g, p.fondo - g, top, A, Object.assign(pisoExtra(p), { nombre: 'Planta baja' }, pb));
        const [fr, de, fo, iz] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, A, g, Object.assign(muroExtra(p), pb));
        K.abertura('pu', 'puerta', fr, 0.5, { estilo: 'madera', sx: 1.0 }, { nombre: 'Puerta de entrada' });
        K.abertura('vf1', 'ventana', fr, 0.2, { sx: 1.3 }); K.abertura('vf2', 'ventana', fr, 0.8, { sx: 1.3 }); K.abertura('vd', 'ventana', de, 0.5, { sx: 1.2 }); K.abertura('vi', 'ventana', iz, 0.65, { sx: 1.2 }); ventanas(K, fo, 2, { sx: 0.9, alfeizar: 1.3, sy: 0.8 }, 0.4);
        /* losa del piso de arriba (la escalera le abre el agujero) */
        const y1 = top + A, G = 0.2; K.piso('l1', p.ancho - g, p.fondo - g, r3(y1 - 0.012 - G), A, { suelo: true, grosor: G, nombre: 'Losa piso 1', material: 'concreto', color: (MAT.concreto || {}).c, nivel: 'p1', edificio: 'f', soporte: { tipo: 'fundacion', id: 'f', manual: true } });
        const [fr1, de1, fo1, iz1] = cuatroMuros(K, 'u', p.ancho, p.fondo, y1, A, g, Object.assign(muroExtra(p), p1));
        ventanas(K, fr1, 3, { sx: 1.2 }); K.abertura('vd1', 'ventana', de1, 0.5, { sx: 1.2 }); K.abertura('vi1', 'ventana', iz1, 0.5, { sx: 1.2 }); ventanas(K, fo1, 2, { sx: 1.2 });
        escalera(K, 'e1', [-p.ancho / 2 + g / 2 + 0.3, -p.fondo / 2 + g / 2 + 0.55], 0, top, A, 1.0, Object.assign({ barandas: 'der', desde: 'h', hasta: 'l1' }, pb));
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, y1 + A, { color: p.colorCubierta, nivel: 'p1', edificio: 'f', soporte: { tipo: 'fundacion', id: 'f', manual: true } });
        accesoFrente(K, 'e', 0, p.fondo / 2 + 0.3, p.elevacion, 1.6);
      } },
    local_comercial: { n: 'Local comercial', def: { ancho: 8, fondo: 6, alto: 3.4, elevacion: 0.15, acabado: 'pared_blanca', colorPared: '#e8e6df', piso: 'porcelanato', cubierta: 'plano', colorCubierta: '#9a9a9a', letrero: 'TIENDA', colorLetrero: '#1d4f9a', toldo: true, colorToldo: '#2f7d5a' },
      campos: CAMPOS_BASE.concat([txt('letrero', 'Letrero'), col('colorLetrero', 'Color del letrero'), chk('toldo', 'Toldo'), col('colorToldo', 'Color del toldo')]),
      variantes: [['Tienda con toldo verde', {}], ['Farmacia', { letrero: 'FARMACIA', colorLetrero: '#1d6b3a', colorToldo: '#1d6b3a' }], ['Panadería de ladrillo', { letrero: 'PANADERÍA', acabado: 'ladrillo', colorPared: '#a5553a', colorLetrero: '#7a3b1a', colorToldo: '#c62828' }], ['Local sin toldo', { toldo: false, letrero: 'SE ARRIENDA', colorLetrero: '#c62828' }]],
      gen(K?, p?) {
        const g = 0.2, top = p.elevacion; K.fundacion('f', p.ancho + 0.6, p.fondo + 1.4, p.elevacion, { z: 0.4, borde: 'bordillo' }); K.docs[0].datos.z = 0.4;
        K.piso('h', p.ancho - g, p.fondo - g, top, p.alto, Object.assign(pisoExtra(p), { nombre: 'Local' }));
        const [fr, , fo] = cuatroMuros(K, 'w', p.ancho, p.fondo, top, p.alto, g, muroExtra(p));
        K.abertura('pu', 'puerta', fr, 0.5, { estilo: 'corrediza', sx: 1.8, sy: 2.3, color: '#c9ced3' }, { nombre: 'Puerta corrediza' });
        const wv = Math.max(0.8, (p.ancho - 3.2) / 2 - 0.4); K.abertura('e1', 'ventana', fr, 0.5 - (0.9 + 0.2 + wv / 2) / p.ancho, { sx: wv, sy: 2.0, alfeizar: 0.4, color: '#c9ced3' }, { nombre: 'Escaparate' }); K.abertura('e2', 'ventana', fr, 0.5 + (0.9 + 0.2 + wv / 2) / p.ancho, { sx: wv, sy: 2.0, alfeizar: 0.4, color: '#c9ced3' }, { nombre: 'Escaparate' });
        K.abertura('pt', 'puerta', fo, 0.8, {}, { nombre: 'Puerta de servicio' });
        techo(K, 't', p.cubierta, p.ancho + g, p.fondo + g, top + p.alto, { color: p.colorCubierta, pretil: 0.8, de_habitacion: 'h' });
        if (p.letrero) K.add('c', 'cartel', { x: 0, y: top, z: p.fondo / 2 + g / 2 + 0.005, giroY: 0, texto: String(p.letrero), senal: 'ninguna', alto: 0.32, colorTexto: '#ffffff', colorFondo: p.colorLetrero, placa: 'si', borde: 0, montaje: 'pared', altura: p.alto - 0.35, sx: 1, sy: 0.4, sz: 0.02 }, { nombre: 'Letrero ' + p.letrero });
        if (p.toldo && window.OOTechos) { const sal = 1.4, an = Math.min(p.ancho - 0.4, 6.5), alt = Math.min(2.6, p.alto - 0.85), df = OOTechos.datosForma('toldo', { color: p.colorToldo }); K.add('to', 'techo', Object.assign({ x: 0, y: top + alt, z: p.fondo / 2 + g / 2 + sal / 2, giroY: 0, puntos: [[-an / 2, -sal / 2], [an / 2, -sal / 2], [an / 2, sal / 2], [-an / 2, sal / 2]], sx: an, sz: sal, soporte: { tipo: 'pared', id: fr, manual: true }, lado: 'A' }, df, { color: p.colorToldo, orientacion: 0, grosor: df.espesor, sy: df.espesor }), { nombre: 'Toldo' }); }
      } }
  };

  /* ---------- generar ---------- */
  function parametros(clave?, e?) { const k = KITS[clave]; const p = Object.assign({}, k.def); for (const x in k.def) if (e && e[x] != null && e[x] !== '') { const t = typeof k.def[x]; p[x] = t === 'number' ? (isFinite(+e[x]) ? +e[x] : k.def[x]) : t === 'boolean' ? (e[x] === true || e[x] === 'true') : e[x]; } return p; }
  function generar(clave?, e?) { const k = KITS[clave]; if (!k) return null; const K = nuevoKit(); k.gen(K, parametros(clave, e)); for (const d of K.docs) if (d.datos._t != null && d.datos.muro) { const w = K.muroInfo(d.datos.muro); if (w) { d.datos.x = w.a[0] + (w.b[0] - w.a[0]) * d.datos._t; d.datos.z = w.a[1] + (w.b[1] - w.a[1]) * d.datos._t; } } return K; }
  /* vista previa: las piezas de todos los documentos en el marco del edificio */
  const cachePrev = new Map<any, any>();
  function huecosPrevia(K?) { const m = new Map<any, any>(); for (const d of K.docs) { if ((d.tipo !== 'puerta' && d.tipo !== 'ventana') || !d.datos.muro) continue; const w = K.muroInfo(d.datos.muro); if (!w) continue; const h = OO.huecoDe(d.datos, d.tipo); h.u = (d.datos._t - 0.5) * w.L; if (!m.has(d.datos.muro)) m.set(d.datos.muro, []); m.get(d.datos.muro).push(h); } return m; }
  function partesPrevia(clave?, e?) {
    const k = JSON.stringify([clave, parametros(clave, e)]); if (cachePrev.has(k)) return cachePrev.get(k).map((x?) => Object.assign({}, x));
    const K = generar(clave, e); if (!K) return null; const hs = huecosPrevia(K); let out = [];
    for (const d of K.docs) {
      let parts; try { parts = OO.construir({ tipo: d.tipo, datos: d.datos, huecos: hs.get(d.k) || [], ext: [0, 0], fotos: [] }); } catch (er) { continue; }
      if (!parts) continue; const M = new T.Matrix4().makeTranslation(+d.datos.x || 0, +d.datos.y || 0, +d.datos.z || 0).multiply(new T.Matrix4().makeRotationY((+d.datos.giroY || 0) * DEG));
      out = out.concat(PZ.transformar(parts.filter((q?) => !q.ayuda), M));
    }
    if (cachePrev.size > 40) cachePrev.clear(); cachePrev.set(k, out); return out.map((x?) => Object.assign({}, x));
  }
  const construirBase = OO.construir;
  OO.construir = function (o?) { const t = String((o && o.tipo) || ''); if (t.startsWith('kit:') && KITS[t.slice(4)]) { const r = partesPrevia(t.slice(4), (o && o.datos) || {}); if (r && r.length) return r; } return construirBase(o); };

  /* documentos de verdad en el mundo (claves simbólicas → ids) */
  function documentos(clave?, kd?, nuevoId?) {
    const K = generar(clave, kd); if (!K) return null;
    const g = (+kd.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), X = +kd.x || 0, Y = +kd.y || 0, Z = +kd.z || 0;
    const ids = new Map<any, any>(K.docs.map((d?, i?) => [d.k, nuevoId(i)])); const grupo = 'kit-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const ref = (v?) => (typeof v === 'string' && ids.has(v)) ? ids.get(v) : v;
    const p = parametros(clave, kd), mats = new Set<any>(), out = [];
    for (const d of K.docs) {
      const x = Object.assign({}, d.datos); const lx = +x.x || 0, lz = +x.z || 0;
      x.x = r3(X + lx * c + lz * s); x.z = r3(Z - lx * s + lz * c); x.y = r3(Y + (+x.y || 0)); x.giroY = r3((+kd.giroY || 0) + (+x.giroY || 0));
      for (const kk of ['muro', 'de_habitacion', 'edificio', 'desde', 'hasta']) if (x[kk] != null) x[kk] = ref(x[kk]);
      if (x.soporte && x.soporte.id) x.soporte = Object.assign({}, x.soporte, { id: ref(x.soporte.id) });
      const props = Object.assign({}, d.props);
      const ac = x._acabado; delete x._acabado; delete x._t;
      const color = d.tipo === 'muro' ? p.colorPared : null; const mk = ac && ac !== 'color' ? materialKit(ac, d.tipo === 'muro' ? color : null) : null;
      if (mk) { props.material = 'u:' + mk.id; mats.add(JSON.stringify(mk)); }
      if (d.tipo === 'techo' && window.OOMatPro && d.k === 't') { const pc = x.cubierta === 'tejas' ? 'tejas_rojas' : x.cubierta === 'chapa' ? 'chapa_ondulada' : null; const mk2 = pc ? materialKit(pc, x.color) : null; if (mk2) { props.material = 'u:' + mk2.id; mats.add(JSON.stringify(mk2)); } }
      x.kit = { clave, grupo };
      out.push({ id: ids.get(d.k), tipo: d.tipo, datos: x, props });
    }
    return { docs: out, fundacion: ids.get('f'), grupo, materiales: [...mats].map((j?) => JSON.parse(j)) };
  }
  /* crea (una vez) los materiales que usan los acabados */
  function asegurarMateriales(lista?) {
    const MP = window.OOMatPro, E = window.OOEditor; if (!MP || !E || !E.api) return; const A = E.api;
    for (const m of lista) { if (A.efectivos('materiales').get(m.id)) continue; if (!m.color) MP.idPreset(m.preset); else A.guardarCol('materiales', m.id, MP.docPreset(m.preset, { nombre: MP.PRESETS[m.preset].n + ' ' + m.color, color: m.color })); }
  }

  /* ---------- catálogo ---------- */
  for (const clave in KITS) {
    const k = KITS[clave], d = k.def, alto = (d.alto || 2.6) * (clave === 'casa_dos_plantas' ? 2 : 1) + 1.5, ancho = clave === 'contenedor_oficina' ? 6.3 : d.ancho + 0.6, fondo = clave === 'contenedor_oficina' ? 2.7 : d.fondo + 0.6;
    OO.ITEMS.push({ id: 'kit_' + clave, n: k.n, cat: 'edificios', tipo: 'kit:' + clave, datos: Object.assign({}, d, { sx: ancho, sy: alto, sz: fondo }), variantes: (k.variantes || []).map(([n, v], i?) => ({ id: 'kit_' + clave + '@' + i, n, extra: v })), kit: clave });
  }

  /* ---------- regla: el «kit» recién colocado se cambia por sus documentos (mismo paso de deshacer) ---------- */
  let ultimo = null;
  function registrar() {
    const E = window.OOEditor, ANC = window.OOAnclajes; if (!E || !E.api || !ANC) return false; const A = E.api;
    ANC.reglas.unshift((id?, d?, prev?, ctx?) => {
      if (prev || !d || !String(d.tipo).startsWith('kit:')) return; const clave = d.tipo.slice(4); if (!KITS[clave]) return;
      const base = A.nuevoId(); const r = documentos(clave, d.datos, (i?) => base + 'k' + i); if (!r) return;
      for (const x of r.docs) { const nd = A.docNuevo(x.id, x.tipo, x.datos, { props: x.props, capa: d.capa }); ctx.cambios.set(x.id, nd); ctx.orden.push(x.id); ctx.docDe.set(x.id, x.id); if (x.tipo === 'muro' && ctx.hechos) ctx.hechos.add(x.id); } /* los tabiques en T no parten las paredes del kit */
      ctx.cambios.set(id, null);
      ultimo = { clave, fundacion: r.fundacion, grupo: r.grupo, ids: r.docs.map((x?) => x.id) };
      if (r.materiales.length) setTimeout(() => asegurarMateriales(r.materiales), 0);
      setTimeout(() => A.pista(KITS[clave].n + ': ' + r.docs.length + ' piezas editables (fundación, paredes, puertas, ventanas, cubierta…). Elige la fundación para moverlo entero.'), 40);
    });
    return true;
  }
  if (!registrar()) document.addEventListener('DOMContentLoaded', registrar);
  window.OOKits = { KITS, generar, documentos, partesPrevia, parametros, asegurarMateriales, get ultimo() { return ultimo; }, CAMPOS_BASE };
})();
