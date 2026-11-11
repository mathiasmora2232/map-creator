/* Editor del mapa (2.1): carteles y textos nítidos.
   - Carteles que pone el usuario (tipo "cartel"): texto de varias líneas, alto de letra, colores de texto, fondo y borde, con o sin placa,
     en pared o de pie, y señales dibujadas (salida, extintor, baño, peligro, flechas…). Se dibujan en un canvas con resolución según su
     tamaño, con mipmaps y filtro anisótropo, y se ven por delante (no atraviesan la pared ni se leen al revés).
   - Letreros del mapa (los Label3D de Godot): su tamaño real (antes medían 5 veces más y se solapaban: «AUDITSISTEMAS»), letras claras
     con borde oscuro como en el juego, y los de baño y salida con su placa como los reales.
   - Envío al juego: cada vez que cambian los carteles del mapa abierto, el editor manda la imagen de cada uno y su sitio al servidor, que
     los guarda en unity/Assets/OperacionOficina/Resources/Carteles/ (ver LEEME.md). Unity los coloca al cargar el mapa (Carteles.cs). */
(function () {
  'use strict';
  const T = window.THREE;
  const FUENTE = '"Barlow", "Bahnschrift", "Arial Narrow", Arial, sans-serif';

  /* señales: color de fondo, de texto, texto por defecto y dibujo */
  const SENALES = {
    ninguna: { n: 'Sin señal' },
    salida: { n: 'Salida (verde)', bg: '#16823a', fg: '#ffffff', texto: 'SALIDA' },
    salida_izq: { n: 'Salida a la izquierda', bg: '#16823a', fg: '#ffffff', texto: 'SALIDA' },
    salida_der: { n: 'Salida a la derecha', bg: '#16823a', fg: '#ffffff', texto: 'SALIDA' },
    punto_encuentro: { n: 'Punto de encuentro', bg: '#16823a', fg: '#ffffff', texto: 'PUNTO DE\nENCUENTRO' },
    primeros_auxilios: { n: 'Primeros auxilios', bg: '#16823a', fg: '#ffffff', texto: 'PRIMEROS\nAUXILIOS' },
    extintor: { n: 'Extintor (rojo)', bg: '#c62828', fg: '#ffffff', texto: 'EXTINTOR' },
    bano_h: { n: 'Baño hombres (azul)', bg: '#1d3f91', fg: '#ffffff', texto: 'BAÑO\nHOMBRES' },
    bano_m: { n: 'Baño mujeres (azul)', bg: '#1d3f91', fg: '#ffffff', texto: 'BAÑO\nMUJERES' },
    bano: { n: 'Baño (azul)', bg: '#1d3f91', fg: '#ffffff', texto: 'BAÑO' },
    peligro: { n: 'Peligro (amarillo)', bg: '#f2c200', fg: '#111111', texto: 'PELIGRO' },
    electrico: { n: 'Riesgo eléctrico', bg: '#f2c200', fg: '#111111', texto: 'RIESGO\nELÉCTRICO' },
    montacargas: { n: 'Precaución montacargas', bg: '#f2c200', fg: '#111111', texto: 'PRECAUCIÓN\nMONTACARGAS' },
    prohibido: { n: 'Prohibido (círculo rojo)', bg: '#ffffff', fg: '#c62828', texto: 'PROHIBIDO\nEL PASO' },
    flecha_izq: { n: 'Flecha ←', bg: '#1f2a36', fg: '#ffffff', texto: '' },
    flecha_der: { n: 'Flecha →', bg: '#1f2a36', fg: '#ffffff', texto: '' },
    flecha_arriba: { n: 'Flecha ↑', bg: '#1f2a36', fg: '#ffffff', texto: '' },
    flecha_abajo: { n: 'Flecha ↓', bg: '#1f2a36', fg: '#ffffff', texto: '' }
  };
  const OPCIONES = {
    senal: Object.entries(SENALES).map(([v, s]) => [v, s.n]),
    placa: [['si', 'Con placa'], ['no', 'Sin placa (letras sueltas)']],
    montaje: [['pared', 'En la pared'], ['pie', 'De pie (con postes)'], ['colgado', 'Colgado del techo']],
    alinear: [['centro', 'Centrado'], ['izq', 'A la izquierda'], ['der', 'A la derecha']],
    estilo: [['metal_oficina', 'Metálica de oficina con marco'], ['vidrio_aluminio', 'Vidrio con perfil de aluminio'], ['bano_gris', 'Baño gris con letrero azul'],
      ['madera', 'Madera de oficina'], ['corrediza', 'Corrediza de vidrio (comedor)'], ['reja', 'Portón / reja metálica'], ['persiana', 'Persiana enrollable de galpón'], ['simple', 'Hoja simple']]
  };
  const CAMPOS = [['texto', 'Texto (Enter = otra línea)', 'text'], ['senal', 'Señal o pictograma', 'opc'], ['alto', 'Alto de letra (m)'],
    ['colorTexto', 'Color del texto', 'color'], ['colorFondo', 'Color del fondo', 'color'], ['placa', 'Placa', 'opc'],
    ['borde', 'Borde (cm)'], ['colorBorde', 'Color del borde', 'color'], ['alinear', 'Alineación', 'opc'], ['montaje', 'Montaje', 'opc'],
    ['altura', 'Altura del centro (m)']];

  function base(e) {
    e = e || {};
    const s = SENALES[e.senal] || SENALES.ninguna;
    return {
      texto: e.texto != null ? String(e.texto) : (s.texto != null ? s.texto : 'CARTEL'),
      senal: SENALES[e.senal] ? e.senal : 'ninguna',
      alto: Math.min(1.5, Math.max(0.02, +e.alto || 0.08)),
      fg: e.colorTexto || s.fg || '#ffffff',
      bg: e.colorFondo || s.bg || '#1f2a36',
      placa: e.placa !== 'no',
      borde: Math.max(0, Math.min(20, e.borde == null ? 1 : +e.borde || 0)) / 100,
      colorBorde: e.colorBorde || '#ffffff',
      alinear: e.alinear || 'centro',
      montaje: e.montaje || 'pared',
      altura: e.altura == null ? 1.8 : +e.altura
    };
  }

  let _medidor = null;
  function medir(lineas, px) {
    if (!_medidor) _medidor = document.createElement('canvas').getContext('2d');
    _medidor.font = '700 ' + px + 'px ' + FUENTE;
    return lineas.map(l => _medidor.measureText(l).width);
  }

  /* medidas del cartel (metros): ancho y alto totales, y la caja del pictograma y del texto */
  function medidas(c) {
    const lineas = c.texto.length ? c.texto.split('\n') : [];
    const em = c.alto / 0.72; // alto de letra = alto de las mayúsculas
    const anchos = medir(lineas, 100).map(w => w / 100 * em);
    const tw = lineas.length ? Math.max(...anchos) : 0, th = lineas.length * em * 1.15;
    const conPicto = c.senal !== 'ninguna';
    const pic = conPicto ? Math.max(th, em * 2.2) : 0;
    const pad = c.placa ? Math.max(em * 0.45, c.borde + em * 0.25) : em * 0.18;
    const sep = conPicto && lineas.length ? em * 0.45 : 0;
    const w = Math.max(em, pad * 2 + pic + sep + tw), h = Math.max(em, pad * 2 + Math.max(pic, th));
    return { w, h, em, pad, pic, sep, tw, th, lineas, anchos };
  }

  /* --------------------------------------------------------------------- pictogramas (blanco o color sobre el fondo) */
  function persona(g, x, y, s, falda) {
    g.beginPath(); g.arc(x, y - s * 0.34, s * 0.1, 0, Math.PI * 2); g.fill();
    if (falda) { g.beginPath(); g.moveTo(x - s * 0.08, y - s * 0.21); g.lineTo(x + s * 0.08, y - s * 0.21); g.lineTo(x + s * 0.17, y + s * 0.12); g.lineTo(x - s * 0.17, y + s * 0.12); g.closePath(); g.fill(); }
    else redondo(g, x - s * 0.12, y - s * 0.21, s * 0.24, s * 0.33, s * 0.05);
    g.fillRect(x - s * 0.1, y + (falda ? s * 0.1 : s * 0.1), s * 0.07, s * 0.32);
    g.fillRect(x + s * 0.03, y + (falda ? s * 0.1 : s * 0.1), s * 0.07, s * 0.32);
    g.fillRect(x - s * 0.18, y - s * 0.2, s * 0.05, s * 0.26); g.fillRect(x + s * 0.13, y - s * 0.2, s * 0.05, s * 0.26);
  }
  function redondo(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }
  function flecha(g, x, y, s, ang) {
    g.save(); g.translate(x, y); g.rotate(ang); g.beginPath();
    g.moveTo(s * 0.42, 0); g.lineTo(s * 0.02, -s * 0.36); g.lineTo(s * 0.02, -s * 0.14); g.lineTo(-s * 0.4, -s * 0.14); g.lineTo(-s * 0.4, s * 0.14); g.lineTo(s * 0.02, s * 0.14); g.lineTo(s * 0.02, s * 0.36);
    g.closePath(); g.fill(); g.restore();
  }
  function corredor(g, x, y, s) {
    g.beginPath(); g.arc(x + s * 0.06, y - s * 0.33, s * 0.09, 0, Math.PI * 2); g.fill();
    g.lineCap = 'round'; g.lineWidth = s * 0.1; g.beginPath();
    g.moveTo(x + s * 0.02, y - s * 0.2); g.lineTo(x - s * 0.06, y + s * 0.05); // tronco
    g.moveTo(x - s * 0.06, y + s * 0.05); g.lineTo(x + s * 0.12, y + s * 0.18); g.lineTo(x + s * 0.08, y + s * 0.38); // pierna delante
    g.moveTo(x - s * 0.06, y + s * 0.05); g.lineTo(x - s * 0.16, y + s * 0.22); g.lineTo(x - s * 0.34, y + s * 0.26); // pierna atrás
    g.moveTo(x + s * 0.0, y - s * 0.14); g.lineTo(x + s * 0.18, y - s * 0.04); g.lineTo(x + s * 0.3, y - s * 0.12); // brazo
    g.moveTo(x + s * 0.0, y - s * 0.14); g.lineTo(x - s * 0.16, y - s * 0.08); g.lineTo(x - s * 0.26, y + s * 0.02);
    g.stroke();
    // puerta
    g.lineWidth = s * 0.05; g.strokeRect(x - s * 0.46, y - s * 0.44, s * 0.2, s * 0.84);
  }
  function triangulo(g, x, y, s, fondo, borde) {
    g.fillStyle = borde; g.beginPath(); g.moveTo(x, y - s * 0.44); g.lineTo(x + s * 0.48, y + s * 0.4); g.lineTo(x - s * 0.48, y + s * 0.4); g.closePath(); g.fill();
    g.fillStyle = fondo; g.beginPath(); g.moveTo(x, y - s * 0.3); g.lineTo(x + s * 0.36, y + s * 0.33); g.lineTo(x - s * 0.36, y + s * 0.33); g.closePath(); g.fill();
    g.fillStyle = borde;
  }
  function pictograma(g, senal, x, y, s, fg, bg) {
    g.save(); g.fillStyle = fg; g.strokeStyle = fg;
    switch (senal) {
      case 'salida': corredor(g, x, y, s); break;
      case 'salida_izq': corredor(g, x + s * 0.12, y - s * 0.05, s * 0.8); flecha(g, x - s * 0.1, y + s * 0.38, s * 0.5, Math.PI); break;
      case 'salida_der': corredor(g, x - s * 0.05, y - s * 0.05, s * 0.8); flecha(g, x + s * 0.2, y + s * 0.38, s * 0.5, 0); break;
      case 'punto_encuentro': for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; flecha(g, x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, s * 0.36, a + Math.PI); } persona(g, x, y + s * 0.04, s * 0.5); break;
      case 'primeros_auxilios': g.fillRect(x - s * 0.12, y - s * 0.38, s * 0.24, s * 0.76); g.fillRect(x - s * 0.38, y - s * 0.12, s * 0.76, s * 0.24); break;
      case 'extintor':
        redondo(g, x - s * 0.13, y - s * 0.2, s * 0.26, s * 0.6, s * 0.1); g.fillRect(x - s * 0.05, y - s * 0.32, s * 0.1, s * 0.14);
        g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(x, y - s * 0.28); g.lineTo(x - s * 0.26, y - s * 0.34); g.lineTo(x - s * 0.34, y - s * 0.1); g.stroke();
        g.fillRect(x - s * 0.02, y - s * 0.42, s * 0.2, s * 0.06); break;
      case 'bano_h': persona(g, x, y, s * 0.95); break;
      case 'bano_m': persona(g, x, y, s * 0.95, true); break;
      case 'bano': persona(g, x - s * 0.2, y, s * 0.85); persona(g, x + s * 0.2, y, s * 0.85, true); g.fillRect(x - s * 0.015, y - s * 0.42, s * 0.03, s * 0.84); break;
      case 'peligro': triangulo(g, x, y, s, bg, fg); g.fillRect(x - s * 0.04, y - s * 0.14, s * 0.08, s * 0.28); g.fillRect(x - s * 0.04, y + s * 0.19, s * 0.08, s * 0.08); break;
      case 'electrico': triangulo(g, x, y, s, bg, fg); g.beginPath(); g.moveTo(x + s * 0.06, y - s * 0.2); g.lineTo(x - s * 0.1, y + s * 0.06); g.lineTo(x + s * 0.01, y + s * 0.06); g.lineTo(x - s * 0.06, y + s * 0.28); g.lineTo(x + s * 0.12, y - s * 0.0); g.lineTo(x + s * 0.01, y - s * 0.0); g.closePath(); g.fill(); break;
      case 'montacargas': triangulo(g, x, y, s, bg, fg); g.fillRect(x - s * 0.18, y + s * 0.0, s * 0.22, s * 0.16); g.fillRect(x - s * 0.1, y - s * 0.12, s * 0.1, s * 0.12); g.fillRect(x + s * 0.06, y - s * 0.16, s * 0.03, s * 0.32); g.fillRect(x + s * 0.06, y + s * 0.13, s * 0.14, s * 0.03); g.beginPath(); g.arc(x - s * 0.13, y + s * 0.2, s * 0.045, 0, 7); g.arc(x + s * 0.0, y + s * 0.2, s * 0.045, 0, 7); g.fill(); break;
      case 'prohibido': g.lineWidth = s * 0.1; g.beginPath(); g.arc(x, y, s * 0.38, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(x - s * 0.27, y - s * 0.27); g.lineTo(x + s * 0.27, y + s * 0.27); g.stroke(); break;
      case 'flecha_izq': flecha(g, x, y, s, Math.PI); break;
      case 'flecha_der': flecha(g, x, y, s, 0); break;
      case 'flecha_arriba': flecha(g, x, y, s, -Math.PI / 2); break;
      case 'flecha_abajo': flecha(g, x, y, s, Math.PI / 2); break;
    }
    g.restore();
  }

  /* --------------------------------------------------------------------- dibujo del cartel en un canvas */
  function canvasCartel(c, m, maxPx) {
    maxPx = maxPx || 2048;
    const k = Math.min(1400, maxPx / Math.max(m.w, m.h)); // píxeles por metro
    const W = Math.max(16, Math.round(m.w * k)), H = Math.max(16, Math.round(m.h * k));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (c.placa) {
      g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
      if (c.borde > 0) { const b = c.borde * k; g.strokeStyle = c.colorBorde; g.lineWidth = b; g.strokeRect(b * 1.5, b * 1.5, W - b * 3, H - b * 3); }
    } else {
      g.clearRect(0, 0, W, H);
    }
    let x = m.pad * k;
    if (m.pic > 0) { pictograma(g, c.senal, x + m.pic * k / 2, H / 2, m.pic * k, c.fg, c.placa ? c.bg : 'rgba(0,0,0,0)'); x += (m.pic + m.sep) * k; }
    if (m.lineas.length) {
      const px = m.em * k; g.font = '700 ' + px + 'px ' + FUENTE; g.textBaseline = 'alphabetic';
      const y0 = H / 2 - m.th * k / 2;
      m.lineas.forEach((l, j) => {
        const lw = m.anchos[j] * k; const ancho = (m.pic > 0 ? m.tw : (m.w - 2 * m.pad)) * k;
        let lx = c.alinear === 'izq' ? x : (c.alinear === 'der' ? x + ancho - lw : x + (ancho - lw) / 2);
        const ly = y0 + (j + 0.5) * m.em * 1.15 * k + px * 0.36;
        if (!c.placa) { g.lineJoin = 'round'; g.lineWidth = px * 0.16; g.strokeStyle = 'rgba(16,20,26,0.95)'; g.strokeText(l, lx, ly); }
        g.fillStyle = c.fg; g.fillText(l, lx, ly);
      });
    }
    return cv;
  }

  function textura(cv) {
    const tex = new T.CanvasTexture(cv);
    tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.LinearFilter;
    tex.anisotropy = (window.OOMaxAniso || 8); tex.encoding = T.sRGBEncoding;
    return tex;
  }
  function plano(w, h, cv, transparente) {
    const mat = new T.MeshLambertMaterial({ map: textura(cv), transparent: !!transparente, alphaTest: transparente ? 0.03 : 0, side: T.FrontSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, clippingPlanes: (window.OOEditor && OOEditor.clip) ? [OOEditor.clip] : [] });
    if (transparente) mat.depthWrite = false;
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    mesh.renderOrder = 3;
    return mesh;
  }

  /* malla de una pieza 't' de un cartel del usuario (la llama textoMalla del editor) */
  function malla(e, w, h) {
    const c = base(e); const m = medidas(c);
    return plano(w || m.w, h || m.h, canvasCartel(c, m), !c.placa);
  }

  /* piezas del objeto «cartel» (coordenadas locales: y = 0 en el suelo, el texto mira a +Z) */
  function partes(e) {
    const c = base(e); const m = medidas(c);
    const y = c.montaje === 'pie' ? Math.max(c.altura, m.h / 2 + 0.3) : c.altura;
    const g = c.placa ? 0.012 : 0.002;
    const a = [];
    const z = c.montaje === 'pared' ? g / 2 + 0.004 : 0;
    if (c.placa) a.push({ f: 'b', p: [0, y, z], s: [m.w, m.h, g], c: c.bg });
    a.push({ f: 't', texto: c.texto, p: [0, y, z + g / 2 + 0.002], w: m.w, h: m.h, bg: c.bg, fg: c.fg, cartel: e || {} });
    if (c.montaje === 'pie') {
      const pie = y - m.h / 2;
      const xs = m.w > 0.9 ? [-m.w * 0.36, m.w * 0.36] : [0];
      for (const x of xs) a.push({ f: 'c', p: [x, (pie + 0.02) / 2, -g / 2 - 0.03], s: [0.05, pie + 0.02, 0.05], c: '#6b7178' });
      a.push({ f: 't', texto: c.texto, p: [0, y, -g / 2 - 0.002], w: m.w, h: m.h, r: [0, Math.PI, 0], bg: c.bg, fg: c.fg, cartel: e || {} });
    } else if (c.montaje === 'colgado') {
      for (const x of [-m.w * 0.4, m.w * 0.4]) a.push({ f: 'b', p: [x, y + m.h / 2 + 0.25, 0], s: [0.01, 0.5, 0.01], c: '#6b7178' });
      a.push({ f: 't', texto: c.texto, p: [0, y, -g / 2 - 0.002], w: m.w, h: m.h, r: [0, Math.PI, 0], bg: c.bg, fg: c.fg, cartel: e || {} });
    }
    return a;
  }

  /* --------------------------------------------------------------------- letreros del mapa (Label3D de Godot) */
  /* Reglas iguales a las del juego (Letreros.cs / Carteles.cs): los de baño, con placa azul; los de salida/evacuación, verde; el resto,
     letras claras con borde oscuro. `tam` = font_size × pixel_size de Godot (el alto de la letra «M» es ~0,72 de eso). */
  function estiloLetrero(texto) {
    const t = String(texto).toUpperCase();
    if (/^BAÑO|^HOMBRES$|^MUJERES$/.test(t)) return { placa: 'si', colorFondo: '#1d3f91', colorTexto: '#ffffff', senal: /MUJER/.test(t) ? 'bano_m' : (/HOMBRE/.test(t) ? 'bano_h' : 'bano'), borde: 0 };
    if (/SALIDA|EVACUACI/.test(t)) return { placa: 'si', colorFondo: '#16823a', colorTexto: '#ffffff', senal: 'ninguna', borde: 0 };
    return { placa: 'no', colorTexto: '#f4f6f8', senal: 'ninguna' };
  }
  function letrero(texto, tam) {
    const e = Object.assign({ texto: String(texto || ''), alto: Math.max(0.02, (+tam || 0.1) * 0.72) }, estiloLetrero(texto));
    const c = base(e); const m = medidas(c);
    const mesh = plano(m.w, m.h, canvasCartel(c, m), !c.placa);
    return { malla: mesh, w: m.w, h: m.h };
  }

  /* --------------------------------------------------------------------- envío al juego */
  let _firma = '', _temporizador = 0;
  function cartelesDelMapa() {
    const nv = window.OOEditor && OOEditor.nuevos ? OOEditor.nuevos() : null;
    if (!nv) return [];
    const lista = [];
    for (const o of nv.values()) {
      if (!o || String(o.tipo) !== 'cartel' || !o.datos) continue;
      lista.push(o);
    }
    return lista;
  }
  function paraJuego(o) {
    const d = o.datos, c = base(d), m = medidas(c);
    const yaw = (+d.giroY || 0) * Math.PI / 180;
    const ps = partes(d);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const mundo = p => { const x = p[0] * cs + p[2] * sn, z = -p[0] * sn + p[2] * cs; return [+(+d.x + x).toFixed(4), +(+d.y + p[1]).toFixed(4), +(-(+d.z + z)).toFixed(4)]; };
    const caras = ps.filter(p => p.f === 't').map(p => ({ pos: mundo(p.p), giro: +(-(yaw + (p.r ? p.r[1] : 0)) * 180 / Math.PI).toFixed(3) }));
    const postes = ps.filter(p => p.f === 'c' || (p.f === 'b' && p !== ps[0])).map(p => ({ pos: mundo(p.p), tam: p.s }));
    const placa = c.placa ? { pos: mundo(ps[0].p), tam: ps[0].s, color: c.bg } : null;
    return { id: o.id, ancho: +m.w.toFixed(4), alto: +m.h.toFixed(4), giro: +(-yaw * 180 / Math.PI).toFixed(3), transparente: !c.placa, montaje: c.montaje,
      caras, postes, placa, texto: c.texto, senal: c.senal, png: canvasCartel(c, m, 2048).toDataURL('image/png') };
  }
  async function enviar(forzar) {
    if (window.OONube && !forzar) return; // modo nube (Map Creator): no hay juego al que mandarlos, solo el modo local los envía
    const mapa = window.OOEditor && OOEditor.mapa ? OOEditor.mapa() : null;
    if (!mapa) return;
    const lista = cartelesDelMapa();
    const firma = mapa + '|' + JSON.stringify(lista.map(o => [o.id, o.datos]));
    if (!forzar && firma === _firma) return;
    // Con el mapa aún sin cargar no se manda nada. Una lista vacía solo la acepta el servidor si en datos_usuario/cambios.json ya no
    // queda ningún cartel de este mapa (al abrir, los cambios llegan después y no se borra lo que tiene el juego).
    const D = OOEditor.datos ? OOEditor.datos() : null;
    if (!D || D.mapa !== mapa) return;
    _firma = firma;
    try {
      const cuerpo = { mapa, carteles: lista.map(paraJuego) };
      const r = await fetch('/api/carteles/' + encodeURIComponent(mapa), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      window.OOCartelesEnviados = j;
    } catch (err) { console.warn('No se pudieron enviar los carteles al juego', err); _firma = ''; }
  }
  /* se comprueba cada 2 s: así no hace falta tocar el guardado del editor */
  setInterval(() => { clearTimeout(_temporizador); _temporizador = setTimeout(() => enviar(false), 300); }, 2000);

  window.OOCartel = { SENALES, OPCIONES, CAMPOS, base, medidas, partes, malla, letrero, canvasCartel, enviar };
})();
