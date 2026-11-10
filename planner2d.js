/* Editor del mapa (2.1, editor v2): modo «Plano 2D», al estilo Planner 5D.
   Es la vista de planta con aspecto de plano: fondo claro, rejilla azulada, paredes rellenas oscuras, habitaciones con nombre y área,
   puertas con su barrido, ventanas y los objetos con un símbolo según lo que son (coche, escritorio, silla, árbol, estantería…).
   Usa las mismas herramientas del editor (Pared, Habitación, Puerta, Ventana, catálogo…): lo dibujado es lo mismo que se ve en 3D.
   Al dibujar una pared se puede escribir el largo (p. ej. 4,5 y Enter). El botón «2D/3D» de la barra alterna al momento.

   (2.1, plano ligero) Cómo se dibuja, para que no pese con 20 000 piezas:
   - Los datos (huellas en planta, símbolos y etiquetas) se calculan solo cuando cambia el mapa, con un índice por celdas de 24 m.
   - La geometría quieta va a un lienzo aparte («base») que cubre la vista y un margen alrededor. Al desplazar se copia con un solo
     drawImage; al hacer zoom se estira la copia y se rehace 110 ms después del último paso de rueda. Cada estilo se dibuja como un único
     trazado (un fill o stroke por estilo, no por pieza) y lo que mide menos de 1,5 px en pantalla no se dibuja.
   - Encima, en cada cambio de vista, solo lo ligero: la selección, las cotas y las etiquetas (tamaño fijo en pantalla, sin montarse:
     se colocan de mayor a menor prioridad y se descarta la que choca con otra).
   - Etiquetas de zonas y edificios: secciones del mapa, edificios conocidos del Complejo (posiciones de scripts/mapa_complejo.gd) y las
     del usuario (colección `etiquetas`: {mapa, texto, x, z, tam, base, oculta}). Doble clic en una etiqueta: renombrar u ocultar.
   - Capas propias del plano (barra de abajo y Alt+O / Alt+L): objetos, nombres y cotas; techos y paredes son las del editor (capas_vista.js).
   - Elegir con un clic en el plano usa lo dibujado (objetos encima de paredes, paredes encima de pisos; los techos no tapan nada). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, $ = s => document.querySelector(s);
  const COL = { fondo: '#f6f4ee', suelo: '#ebe6da', sueloB: '#cfc8b8', obj: '#ffffff', objB: '#6b7078', hab: 'rgba(240,122,26,.07)', habB: '#c9a27a', sel: '#f07a1a', cota: '#1f6feb', texto: '#2d2f33', calle: '#d9d6cf', puerta: '#8a6a4a', pared: '#2d2f33', paredN: '#1f2125', techo: '#8d9097', arbol: 'rgba(110,150,85,.16)', arbolB: '#7d9a6a', detalle: '#8a9099', coche: '#eef1f5', cocheB: '#4b5563', zona: '#3a4250' };
  let activo = false, cv = null, g = null, firma = '', datos = null, versionDatos = 0, ocultos = [];
  const LS = 'oo-plano-capas';
  const capas = Object.assign({ objetos: true, simbolos: true, nombres: true, cotas: 'auto' }, (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } })());
  const guardarCapas = () => { try { localStorage.setItem(LS, JSON.stringify(capas)); } catch (e) { } };
  /* ---------- botones ---------- */
  const seg = $('.seg-vista');
  seg.insertAdjacentHTML('beforeend', '<button id="bPlano" title="Plano 2D, como Planner 5D (paredes, habitaciones, puertas, cotas)">Plano 2D</button>');
  $('.grupo-btn').insertAdjacentHTML('beforebegin', '<button id="b2D3D" class="b2d3d" title="Alternar rápido entre el plano 2D y la vista 3D">2D / 3D</button>');
  $('#bPlano').addEventListener('click', () => activar(true));
  $('#b2D3D').addEventListener('click', () => { if (activo) { A.ponerVista('3d'); } else activar(true); });
  /* ---------- lienzos ---------- */
  cv = document.createElement('canvas'); cv.id = 'plano2d'; cv.setAttribute('aria-hidden', 'true'); cv.hidden = true;
  const vistaEl = $('#vista'); vistaEl.insertBefore(cv, $('#rejilla'));
  g = cv.getContext('2d');
  const base = document.createElement('canvas'), bg = base.getContext('2d'); let bInfo = null; /* {cx, cz, ppm, W, H, v} */
  let tRehacer = 0, versionBase = 0;
  function tam() { const r = vistaEl.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr)); firma = ''; bInfo = null; }
  new ResizeObserver(() => { if (activo) tam(); }).observe(vistaEl);
  /* ---------- activar / desactivar ---------- */
  function ocultarMallas(v) {
    if (v) { ocultos = []; A.scene.traverse(o => { if (o === A.scene) return; if ((o.isInstancedMesh && o.visible) || (/^(mallasReales|modelosCatalogo|modelosImportados)$/.test(o.name) && o.visible)) { ocultos.push(o); o.visible = false; } }); [A.grupoFormas, A.grupoTextos].forEach(x => { if (x.visible) { ocultos.push(x); x.visible = false; } }); }
    else { ocultos.forEach(o => { o.visible = true; }); ocultos = []; }
  }
  function activar(v) {
    if (v && !activo) { if (A.vista !== 'planta') A.ponerVista('planta'); activo = true; document.getElementById('app').classList.add('modo-plano'); cv.hidden = false; tam(); ocultarMallas(true); A.scene.background = new T.Color('#ffffff'); recalcular(); botones(); A.pista('Plano 2D: usa Construir (paredes, habitaciones, puertas, ventanas) y el catálogo. Doble clic en el nombre de una zona para renombrarla.'); A.marcar(); }
    else if (!v && activo) { activo = false; document.getElementById('app').classList.remove('modo-plano'); cv.hidden = true; ocultarMallas(false); A.aplicarFondo(); botones(); A.marcar(); }
  }
  function botones() { const b = $('#bPlano'); if (b) b.classList.toggle('on', activo); document.querySelectorAll('[data-vista]').forEach(x => { if (activo) x.classList.remove('on'); }); if (!activo) document.querySelectorAll('[data-vista]').forEach(x => x.classList.toggle('on', x.dataset.vista === A.vista)); const t = $('#b2D3D'); if (t) t.classList.toggle('on', activo); }
  E.on('vista', v => { if (activo && v !== 'planta') activar(false); else if (activo) { ocultarMallas(false); ocultarMallas(true); A.scene.background = new T.Color('#ffffff'); botones(); } });
  E.on('fondo', () => { if (activo) A.scene.background = new T.Color('#ffffff'); });
  /* los cambios de datos llegan en ráfagas (render + marcado): se juntan en un solo recálculo por cuadro */
  let recalcPend = false;
  function programarRecalculo() { if (!activo || recalcPend) return; recalcPend = true; requestAnimationFrame(() => { recalcPend = false; if (activo) { ocultarMallas(false); ocultarMallas(true); recalcular(); } }); }
  E.on('render', programarRecalculo);
  E.on('marcado', programarRecalculo);
  E.on('seleccion', () => { firma = ''; });
  E.on('mapa', () => { datos = null; bInfo = null; if (activo) recalcular(); });

  /* ---------- símbolos por tipo de objeto ---------- */
  const SIMB = [
    ['coche', /sedan|suv|hatch|pickup|coche|auto\b|cami[oó]n|furg|veh[ií]c|trailer|cabezal/i],
    ['arbol', /[aá]rbol|arbusto|palmera|seto|vegetaci/i], ['planta', /planta|maceta|flor/i],
    ['silla', /silla|taburete|banco\b|sill[oó]n|sof[aá]/i], ['escritorio', /escritorio|mesa|mostrador|barra\b|counter/i],
    ['rack', /rack|estanter|repisa|archivador|armario|g[oó]ndola|locker|casillero/i], ['tarima', /tarima|pal[eé]|palet/i],
    ['caja', /caja|bulto|carton/i], ['barril', /barril|tanque|bid[oó]n|tambor/i], ['extintor', /extintor|incendio|hidrante/i],
    ['escalera', /escaler|rampa|pelda/i], ['contenedor', /contenedor/i], ['puerta', /^puerta|porton|port[oó]n/i], ['ventana', /ventana/i],
    ['equipo', /monitor|impresora|tel[eé]fono|taza|disco|computad|pc\b|dispensador|nevera|refri/i], ['luz', /farola|poste|l[aá]mpara|luz/i]
  ];
  function simbolo(nombre) { const n = String(nombre || ''); for (const [s, re] of SIMB) if (re.test(n)) return s; return ''; }
  /* clase por la forma cuando el nombre no dice nada («Objeto»): w, d en planta (w ≥ d) y alto h */
  function simboloForma(w, d, h) {
    if (h > 0.6 && h < 0.95 && w >= 0.9 && w <= 3.2 && d >= 0.45 && d <= 1.6) return 'escritorio';
    if (h > 0.4 && h < 1.2 && w <= 0.75 && d <= 0.75 && w >= 0.35) return 'silla';
    if (h >= 1.4 && h < 3.2 && d <= 0.8 && w >= 0.7 && w <= 6) return 'rack';
    if (h < 0.25 && w >= 0.9 && w <= 1.5 && d >= 0.7) return 'tarima';
    return '';
  }

  /* ---------- etiquetas de zonas y edificios ---------- */
  /* Edificios del Complejo con su centro y tamaño, tomados de scripts/mapa_complejo.gd (_galpon, _galpon_dos_pisos, _frente_administrativo,
     _comedor, _bar_comedor, _caseta_c, _tendal). Los nombres son los de sus comentarios; las casetas sin nombre seguro quedan como «Caseta». */
  const EDIFICIOS = {
    complejo: [
      ['galpon1', 'Galpón 1', 113, 66, 36, 47], ['galpon2', 'Galpón 2 (dos pisos)', -28, 104, 50, 52], ['galpon3', 'Galpón 3', 104, -11, 40, 21],
      ['galpon4', 'Galpón 4', 205, 90, 28, 34], ['galpon5', 'Galpón 5', 150, 70, 30, 22], ['nave_blanca', 'Nave blanca', 158, 128, 46, 52],
      ['administracion', 'Administración', 90, 70, 10, 49], ['comedor', 'Comedor', 87.5, 109, 20, 22], ['bar', 'Bar y enfermería', 22.6, 116, 14, 36],
      ['parqueadero', 'Parqueadero', -20, 14, 69, 45], ['callejon', 'Callejón', 46, 141, 62, 36],
      ['casetas_este_a', 'Casetas (muro este)', 224, 44, 16, 43], ['casetas_este_b', 'Casetas (muro este)', 224, 134, 16, 43],
      ['caseta_g3a', 'Caseta', 68, -14, 8, 6], ['caseta_g3b', 'Caseta', 146, -15, 10, 8], ['caseta_g3c', 'Caseta', 176, -14, 14, 8],
      ['caseta_o1', 'Caseta', -68, 100, 8, 6], ['caseta_o2', 'Caseta', -68, 88, 6, 5], ['caseta_o3', 'Caseta naranja', -62, 138, 14, 12],
      ['tendal1', 'Tendal', -66, 120, 14, 9], ['tendal2', 'Tendal', -50, 150, 10, 8], ['tendal3', 'Tendal', 54.5, 71, 10, 39]
    ]
  };
  function etiquetasZona() {
    const out = [], mapa = A.mapa, docs = A.efectivos('etiquetas');
    const propias = new Map(); for (const [id, d] of docs) if (d && d.mapa === mapa) propias.set(id, d);
    const conBase = new Map(); for (const [id, d] of propias) if (d.base) conBase.set(d.base, [id, d]);
    for (const [id, n, x, z, w, dd] of EDIFICIOS[mapa] || []) { const u = conBase.get(id); if (u && u[1].oculta) continue; out.push({ id, docId: u ? u[0] : null, base: id, t: u && u[1].texto ? u[1].texto : n, x: u && isFinite(u[1].x) ? +u[1].x : x, z: u && isFinite(u[1].z) ? +u[1].z : z, area: w * dd, fondo: dd, clase: 'edificio' }); }
    for (const zn of A.zonasEtq || []) { const id = 'sec:' + zn.nombre; const u = conBase.get(id); if (u && u[1].oculta) continue; out.push({ id, docId: u ? u[0] : null, base: id, t: u && u[1].texto ? u[1].texto : zn.nombre, x: u && isFinite(u[1].x) ? +u[1].x : zn.p.x, z: u && isFinite(u[1].z) ? +u[1].z : zn.p.z, area: 900, clase: 'zona' }); }
    /* letreros del propio mapa con nombre de sitio (vecinos, comedor, enfermería…), con poca prioridad */
    if (A.P) for (let i = 0; i < A.N; i++) { const z = A.P[i]; if (!z || z.t !== 6 || z.del || !z.nom) continue; const t = String(z.nom).replace(/\s+/g, ' ').trim(); if (t.length < 6 || !/[A-ZÁÉÍÓÚÑ]{3}/.test(t) || /EVACUACI|PELIGRO|^PARE$|ABRIR|AUTO|ENCUENTRO|INCENDIO|SALIDA|CRUCE|TRANSFORMADOR|M[AÁ]QUINA|BAÑO|HOMBRES|MUJERES|PARQUEO|EMCU|W\.X\.R|^[\d\s]+$|→|↓/.test(t)) continue; const id = 'txt:' + i; const u = conBase.get(id); if (u && u[1].oculta) continue; out.push({ id, docId: u ? u[0] : null, base: id, t: u && u[1].texto ? u[1].texto : t.charAt(0) + t.slice(1).toLowerCase(), x: z.p.x, z: z.p.z, area: 120, clase: 'letrero' }); }
    for (const [id, d] of propias) { if (d.base || d.oculta || !d.texto) continue; out.push({ id, docId: id, base: null, t: d.texto, x: +d.x || 0, z: +d.z || 0, area: (+d.tam || 30) ** 2, clase: 'propia' }); }
    return out;
  }

  /* ---------- datos del plano (se recalculan al cambiar el mapa, no en cada fotograma) ---------- */
  const _v = new T.Vector3(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
  const CEL = 24;
  function huella(m4) { const e = m4.elements, cx = e[12] + 0.5 * e[4], cz = e[14] + 0.5 * e[6]; const ax = e[0] / 2, az = e[2] / 2, bx = e[8] / 2, bz = e[10] / 2; return [cx - ax - bx, cz - az - bz, cx + ax - bx, cz + az - bz, cx + ax + bx, cz + az + bz, cx - ax + bx, cz - az + bz]; }
  function cajaPts(pts) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (let j = 0; j < pts.length; j += 2) { const x = pts[j], z = pts[j + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; }
  /* rectángulo orientado que envuelve varias huellas, con el eje de la pieza más grande */
  function rectOrientado(listaPts, ux, uz) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; const vx = -uz, vz = ux;
    for (const pts of listaPts) for (let j = 0; j < pts.length; j += 2) { const a = pts[j] * ux + pts[j + 1] * uz, b = pts[j] * vx + pts[j + 1] * vz; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
    const P4 = (a, b) => [a * ux + b * vx, a * uz + b * vz]; const c = [P4(a0, b0), P4(a1, b0), P4(a1, b1), P4(a0, b1)];
    return { pts: [c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]], w: a1 - a0, d: b1 - b0, ux, uz };
  }
  function recalcular() {
    const P = A.P, N = A.N; if (!P) return;
    const t0 = performance.now();
    const items = [], porClave = new Map();
    const meter = it => { items.push(it); let l = porClave.get(it.k); if (!l) porClave.set(it.k, l = []); l.push(it); };
    const grupos = new Map(); /* objetos automáticos del mapa: un símbolo por objeto */
    const techosOn = !window.OOCapasVista || OOCapasVista.estado().techos;
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (z.del || z.cat === 'col' || z.cat === 'luz' || z.cat === 'txt' || !A.visible(i)) continue;
      const k = 'p' + i;
      if (z.t === 7) { const it = { k, kind: 'puertaM', x: z.p.x, z: z.p.z, giro: Math.atan2(2 * (z.q.w * z.q.y + z.q.x * z.q.z), 1 - 2 * (z.q.y * z.q.y + z.q.z * z.q.z)), ancho: 0.9 }; it.bb = [it.x - 1, it.z - 1, it.x + 1, it.z + 1]; it.ext = 0.9; meter(it); continue; }
      const auto = A.autoActivo(k);
      for (const m4 of A.matricesEntidad(k)) {
        m4.decompose(_p, _q, _s); const e = m4.elements; const hy = Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]);
        const hx = Math.hypot(e[0], e[2]), hz = Math.hypot(e[8], e[10]); if (!isFinite(hx) || hx * hz < 1e-6) continue;
        const pts = huella(m4), bb = cajaPts(pts), bot = _p.y - hy / 2, top = _p.y + hy / 2, ext = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
        const redondo = /^cyl|sph/.test(z.mesh);
        let kind;
        if (hy > 1.4 && Math.min(hx, hz) < 0.7 && Math.max(hx, hz) > 0.6 && bot < 2.4) kind = 'pared';
        else if (bot >= 2.2 && (hy < Math.max(0.6, 0.3 * Math.min(hx, hz)) || bot >= 2.4) && !(z.mesh === 'sph' && hy > 1)) kind = 'techo';
        else if (hy < 0.35) kind = 'suelo';
        else kind = 'obj';
        if (z.mesh === 'sph' && top > 2) kind = 'copa';
        if (kind === 'obj' && Math.min(hx, hz) < 0.05 && hy > 3 * Math.min(hx, hz)) kind = 'deco'; /* letreros y placas pegados a la pared: no se dibujan en planta */
        const it = { k, kind, pts, bb, top, ext, redondo };
        if (kind === 'obj' && auto && !/^(Muro|Valla|Piso de baldosas|Puerta|Ventana)/.test(auto.nombre)) {
          let gr = grupos.get(auto.firma); if (!gr) grupos.set(auto.firma, gr = { auto, k, pts: [], mayor: 0, ux: 1, uz: 0, h0: Infinity, h1: -Infinity });
          gr.pts.push(pts); if (hx * hz > gr.mayor) { gr.mayor = hx * hz; const l = Math.hypot(e[0], e[2]) || 1; gr.ux = e[0] / l; gr.uz = e[2] / l; } gr.h0 = Math.min(gr.h0, bot); gr.h1 = Math.max(gr.h1, top);
          it.enGrupo = true; porClave.set(k, (porClave.get(k) || []).concat([it])); continue; /* la pieza sola no se dibuja: va el símbolo del grupo */
        }
        if (kind === 'obj') { const w = Math.max(hx, hz), d = Math.min(hx, hz); it.sym = simbolo(z.nom) || simboloForma(w, d, hy); const l = Math.hypot(e[0], e[2]) || 1; it.ux = hx >= hz ? e[0] / l : e[8] / (Math.hypot(e[8], e[10]) || 1); it.uz = hx >= hz ? e[2] / l : e[10] / (Math.hypot(e[8], e[10]) || 1); it.w = w; it.d = d; }
        meter(it);
      }
    }
    for (const gr of grupos.values()) {
      const r = rectOrientado(gr.pts, gr.ux, gr.uz); const bb = cajaPts(r.pts); const w = Math.max(r.w, r.d), d = Math.min(r.w, r.d);
      let ux = gr.ux, uz = gr.uz; if (r.d > r.w) { ux = -gr.uz; uz = gr.ux; }
      const it = { k: gr.k, kind: 'obj', grupo: true, pts: r.pts, bb, top: gr.h1, ext: Math.max(bb[2] - bb[0], bb[3] - bb[1]), sym: simbolo(gr.auto.nombre) || simboloForma(w, d, gr.h1 - gr.h0), w, d, ux, uz, n: gr.pts.length };
      if (gr.auto.nombre === 'Árbol') it.sym = 'arbol';
      for (const kk of gr.auto.keys) { const l = porClave.get(kk); if (l) l.push(it); else porClave.set(kk, [it]); }
      items.push(it);
    }
    /* objetos nuevos */
    const habs = [];
    for (const o of E.nuevos().values()) {
      if (!o.partes || !o.partes.length) continue; const b = A.tipoBase(o.tipo), d = o.datos, k = 'n' + o.id;
      if (b === 'nota') continue;
      if (b === 'puerta' || b === 'ventana' || b === 'hueco') { const it = { k, kind: 'nabert', b, d }; const r = (+d.sx || 1) + 0.5; it.bb = [d.x - r, d.z - r, d.x + r, d.z + r]; it.ext = r; meter(it); continue; }
      for (const pt of o.partes) {
        if (!pt.m || pt.f === 't' || pt.f === 'l') continue;
        let pts; if (pt.f === 'poly' && pt.pts) { pts = []; for (const [x, z] of pt.pts) { _v.set(x, 0, z).applyMatrix4(pt.m); pts.push(_v.x, _v.z); } } else pts = huella(pt.m);
        if (pts.length < 6) continue; const bb = cajaPts(pts);
        let kind = 'nobj'; if (b === 'habitacion') kind = d.suelo ? 'npiso' : 'hab'; else if (b === 'calle') kind = 'calle'; else if (b === 'techo') kind = 'ntecho'; else if (b === 'muro') kind = pt.f === 'b' ? 'nmuro' : 'nobj';
        else if (b === 'fundacion' || b === 'terreno' || b === 'vegetacion') kind = b === 'fundacion' ? 'npiso' : 'nobj';
        const it = { k, kind, pts, bb, ext: Math.max(bb[2] - bb[0], bb[3] - bb[1]), b };
        if (kind === 'nobj') { const e = pt.m.elements, hyP = Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]), mn = Math.min(Math.hypot(e[0], e[2]), Math.hypot(e[8], e[10])); if (e[13] - hyP / 2 > 2.0) kind = 'ntecho'; else if (mn < 0.05 && hyP > 3 * mn) kind = 'deco'; }
        if (kind === 'nobj') { const e = pt.m.elements, l = Math.hypot(e[0], e[2]) || 1; it.sym = simbolo(o.tipo + ' ' + ((o.props || {}).nombre || '') + ' ' + (d.nombre || '')); it.ux = e[0] / l; it.uz = e[2] / l; it.w = Math.hypot(e[0], e[2]); it.d = Math.hypot(e[8], e[10]); if (it.d > it.w) { const t = it.w; it.w = it.d; it.d = t; it.ux = e[8] / (Math.hypot(e[8], e[10]) || 1); it.uz = e[10] / (Math.hypot(e[8], e[10]) || 1); } it.parte = true; }
        meter(it);
      }
      if (b === 'muro') { const gy = (+d.giroY || 0) * Math.PI / 180, L = +d.sx || 0, ux = Math.cos(gy), uz = -Math.sin(gy), nx = -uz, nz = ux, off = (+d.sz || 0.2) / 2 + 0.55; o.__cota = { a: [d.x - ux * L / 2 + nx * off, d.z - uz * L / 2 + nz * off], b: [d.x + ux * L / 2 + nx * off, d.z + uz * L / 2 + nz * off], t: A.fmt(L, 2) + ' m', L }; }
      if (b === 'habitacion' && (!d.suelo || (d.nombre && !/^Piso \d+$/.test(d.nombre)))) { const pts = A.puntosMundoHab(o); const bb = cajaPts(pts.flat()); habs.push({ k, t: d.nombre || 'Habitación', area: +d.area || A.areaPol(pts), x: d.x, z: d.z, bb, pts }); }
    }
    /* un objeto nuevo de varias piezas (copias, prefabs, coches) lleva un solo símbolo: el de su caja */
    const porObj = new Map(); for (const it of items) if (it.parte) { let l = porObj.get(it.k); if (!l) porObj.set(it.k, l = []); l.push(it); }
    for (const [k, l] of porObj) { if (l.length < 2) continue; let mayor = l[0]; for (const it of l) if (it.w * it.d > mayor.w * mayor.d) mayor = it; const r = rectOrientado(l.map(x => x.pts), mayor.ux, mayor.uz); const w = Math.max(r.w, r.d), dd = Math.min(r.w, r.d); for (const it of l) it.sinSimbolo = true; const s = { k, kind: 'nsimb', pts: r.pts, bb: cajaPts(r.pts), sym: mayor.sym, w, d: dd, ux: r.d > r.w ? -mayor.uz : mayor.ux, uz: r.d > r.w ? mayor.ux : mayor.uz }; s.ext = Math.max(s.bb[2] - s.bb[0], s.bb[3] - s.bb[1]); items.push(s); porClave.get(k).push(s); }
    /* índice por celdas */
    const celdas = new Map();
    for (let n = 0; n < items.length; n++) { const it = items[n]; it.n = n; const bb = it.bb; const x0 = Math.floor(bb[0] / CEL), x1 = Math.floor(bb[2] / CEL), z0 = Math.floor(bb[1] / CEL), z1 = Math.floor(bb[3] / CEL); if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) { (celdas.get('grande') || celdas.set('grande', []).get('grande')).push(n); continue; } for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = x * 65536 + z; let l = celdas.get(key); if (!l) celdas.set(key, l = []); l.push(n); } }
    datos = { items, porClave, celdas, habs, zonas: etiquetasZona(), nuevos: [...E.nuevos().values()], sello: new Uint32Array(items.length), marca: 0, ms: performance.now() - t0, techosOn };
    versionDatos++; firma = ''; bInfo = null;
  }
  /* elementos cuyo rectángulo toca [x0,z0,x1,z1] (sin repetir) */
  function consulta(x0, z0, x1, z1) {
    const D = datos, out = []; D.marca = (D.marca + 1) >>> 0 || 1; const m = D.marca, s = D.sello;
    const add = n => { if (s[n] === m) return; s[n] = m; const bb = D.items[n].bb; if (bb[2] < x0 || bb[0] > x1 || bb[3] < z0 || bb[1] > z1) return; out.push(D.items[n]); };
    const cx0 = Math.floor(x0 / CEL), cx1 = Math.floor(x1 / CEL), cz0 = Math.floor(z0 / CEL), cz1 = Math.floor(z1 / CEL);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 20000) { for (let n = 0; n < D.items.length; n++) add(n); return out; }
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) { const l = D.celdas.get(x * 65536 + z); if (l) for (const n of l) add(n); }
    const gr = D.celdas.get('grande'); if (gr) for (const n of gr) add(n);
    return out;
  }

  /* ---------- vista actual ---------- */
  function vistaActual() {
    const W = cv.width, H = cv.height, c = A.camO, dpr = W / Math.max(1, cv.clientWidth);
    const hw = (c.right - c.left) / 2 / c.zoom, ppm = W / (2 * hw);
    return { W, H, dpr, ppm, cx: c.position.x, cz: c.position.z, hw, hh: H / ppm / 2 };
  }
  /* ---------- dibujo de la base (geometría quieta) ---------- */
  function trazarPoli(c, pts, X, Z) { c.moveTo(X(pts[0]), Z(pts[1])); for (let j = 2; j < pts.length; j += 2) c.lineTo(X(pts[j]), Z(pts[j + 1])); c.closePath(); }
  let ultimaBase = { ms: 0, items: 0, llamadas: 0 };
  function dibujarBase(V) {
    const t0 = performance.now(); const mg = V.dpr > 1.5 ? 0.18 : 0.3;
    const BW = Math.round(V.W * (1 + 2 * mg)), BH = Math.round(V.H * (1 + 2 * mg));
    if (base.width !== BW || base.height !== BH) { base.width = BW; base.height = BH; }
    const c = bg, ppm = V.ppm, cx = V.cx, cz = V.cz, dpr = V.dpr;
    const X = x => (x - cx) * ppm + BW / 2, Z = z => (z - cz) * ppm + BH / 2;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = COL.fondo; c.fillRect(0, 0, BW, BH); c.lineJoin = 'round'; /* papel: el lienzo multiplica sobre la escena 3D (fondo blanco) */
    const hwB = BW / ppm / 2, hhB = BH / ppm / 2;
    const vis = consulta(cx - hwB, cz - hhB, cx + hwB, cz + hhB);
    const minPx = 1.5 * dpr, chico = it => it.ext * ppm < minPx;
    let llamadas = 0;
    const lote = (filtro, fill, stroke, lw, dash) => { c.beginPath(); let n = 0; for (const it of vis) { if (!filtro(it) || chico(it)) continue; trazarPoli(c, it.pts, X, Z); n++; } if (!n) return; if (fill) { c.fillStyle = fill; c.fill(); llamadas++; } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw * dpr; if (dash) c.setLineDash(dash.map(v => v * dpr)); c.stroke(); if (dash) c.setLineDash([]); llamadas++; } };
    const verTechos = window.OOCapasVista ? OOCapasVista.estado().techos : true, verParedes = window.OOCapasVista ? OOCapasVista.estado().paredes !== 'ocultas' : true;
    // suelos del mapa y pisos nuevos
    lote(it => it.kind === 'suelo', COL.suelo, ppm > 3 * dpr ? COL.sueloB : null, 0.6);
    lote(it => it.kind === 'npiso', 'rgba(205,196,178,.55)', COL.sueloB, 0.8);
    lote(it => it.kind === 'calle', COL.calle, '#a9a59c', 1);
    lote(it => it.kind === 'hab', COL.hab, COL.habB, 1);
    // rejilla
    { let paso = 1; while (paso * ppm < 9 * dpr) paso *= paso === 1 ? 5 : 2; const x0 = cx - hwB, x1 = cx + hwB, z0 = cz - hhB, z1 = cz + hhB;
      for (const [p, col, lw] of [[paso, 'rgba(90,130,175,.16)', 1], [paso * 5, 'rgba(90,130,175,.34)', 1.2]]) { c.strokeStyle = col; c.lineWidth = lw * dpr; c.beginPath(); for (let x = Math.floor(x0 / p) * p; x <= x1; x += p) { const sx = Math.round(X(x)) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, BH); } for (let z = Math.floor(z0 / p) * p; z <= z1; z += p) { const sz = Math.round(Z(z)) + 0.5; c.moveTo(0, sz); c.lineTo(BW, sz); } c.stroke(); llamadas++; } }
    // copas de árbol (círculos verdes)
    { c.beginPath(); let n = 0; for (const it of vis) { if (it.kind !== 'copa' || chico(it)) continue; const p = it.pts, mx = (p[0] + p[4]) / 2, mz = (p[1] + p[5]) / 2, r = Math.max(1, Math.hypot(p[0] - p[2], p[1] - p[3]) / 2 * ppm); c.moveTo(X(mx) + r, Z(mz)); c.arc(X(mx), Z(mz), r, 0, Math.PI * 2); n++; } if (n) { c.fillStyle = COL.arbol; c.fill(); c.strokeStyle = COL.arbolB; c.lineWidth = 0.9 * dpr; c.stroke(); llamadas += 2; } }
    // objetos: contorno real orientado; los redondos como círculo
    if (capas.objetos) {
      const esObj = it => (it.kind === 'obj' || it.kind === 'nobj' || it.kind === 'nsimb') && it.sym !== 'coche' && it.sym !== 'arbol' && !(it.kind === 'nobj' && it.sinSimbolo && it.sym);
      c.beginPath(); let n = 0;
      for (const it of vis) { if (!esObj(it) || chico(it) || it.kind === 'nsimb') continue; if (it.redondo && !it.grupo) { const p = it.pts, mx = (p[0] + p[4]) / 2, mz = (p[1] + p[5]) / 2, r = Math.max(1, Math.hypot(p[0] - p[2], p[1] - p[3]) / 2 * ppm); c.moveTo(X(mx) + r, Z(mz)); c.arc(X(mx), Z(mz), r, 0, Math.PI * 2); } else trazarPoli(c, it.pts, X, Z); n++; }
      if (n) { c.fillStyle = COL.obj; c.fill(); c.strokeStyle = COL.objB; c.lineWidth = 0.8 * dpr; c.stroke(); llamadas += 2; }
      if (capas.simbolos) llamadas += simbolos(c, vis, X, Z, ppm, dpr);
    }
    // techos: solo contorno discontinuo (no tapan lo de debajo)
    if (verTechos) { lote(it => it.kind === 'techo' && it.ext > 1.2, null, COL.techo, 0.8, [6, 4]); lote(it => it.kind === 'ntecho', null, '#7c7f86', 1.2, [6, 4]); }
    // paredes
    if (verParedes) { lote(it => it.kind === 'pared', COL.pared, null); lote(it => it.kind === 'nmuro', COL.paredN, null); }
    // puertas y ventanas nuevas: hueco blanco, hoja y barrido
    for (const it of vis) { if (it.kind !== 'nabert' || it.ext * ppm < 4 * dpr) continue; llamadas += abertura(c, it, X, Z, ppm, dpr); }
    // puertas del mapa: barrido (un trazo para todas)
    { c.beginPath(); const c2 = []; for (const it of vis) { if (it.kind !== 'puertaM') continue; const r = it.ancho * ppm; if (r < 3 * dpr) continue; const x = X(it.x), z = Z(it.z), a = -it.giro; c.moveTo(x, z); c.lineTo(x + Math.cos(a) * r, z + Math.sin(a) * r); c2.push([x, z, r, a]); }
      if (c2.length) { c.strokeStyle = COL.puerta; c.lineWidth = 1 * dpr; c.stroke(); c.beginPath(); for (const [x, z, r, a] of c2) { c.moveTo(x + Math.cos(a) * r, z + Math.sin(a) * r); c.arc(x, z, r, a, a + Math.PI / 2); } c.setLineDash([3 * dpr, 3 * dpr]); c.stroke(); c.setLineDash([]); llamadas += 2; } }
    bInfo = { cx, cz, ppm, W: BW, H: BH, v: versionDatos, vb: versionBase, Wv: V.W, Hv: V.H };
    ultimaBase = { ms: performance.now() - t0, items: vis.length, llamadas };
  }
  /* símbolos: líneas de detalle por tipo, todas en pocos trazados */
  function simbolos(c, vis, X, Z, ppm, dpr) {
    const det = new Path2D(), cocheF = new Path2D(), rojo = new Path2D(), verde = new Path2D(); let nDet = 0, nCo = 0, nR = 0, nV = 0;
    for (const it of vis) {
      const s = it.sym; if (!s || it.sinSimbolo) continue; const px = Math.max(it.w || 0, it.d || 0) * ppm;
      if (px < 7 * dpr && s !== 'coche' && s !== 'arbol') continue;
      const p = it.pts; const cx = (p[0] + p[4]) / 2, cz = (p[1] + p[5]) / 2, ux = it.ux || 1, uz = it.uz || 0, vx = -uz, vz = ux, w = it.w / 2, d = it.d / 2;
      const Q = (a, b) => [X(cx + ux * a + vx * b), Z(cz + uz * a + vz * b)];
      const L = (path, a1, b1, a2, b2) => { const q1 = Q(a1, b1), q2 = Q(a2, b2); path.moveTo(q1[0], q1[1]); path.lineTo(q2[0], q2[1]); };
      if (s === 'coche') { if (px < 2 * dpr) continue; const r = Math.min(w, d) * 0.35; const pts = [[-w + r, -d], [w - r, -d], [w, -d + r], [w, d - r], [w - r, d], [-w + r, d], [-w, d - r], [-w, -d + r]].map(([a, b]) => Q(a, b)); cocheF.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) cocheF.lineTo(q[0], q[1]); cocheF.closePath(); nCo++; if (px > 10 * dpr) { L(det, w * 0.35, -d * 0.8, w * 0.35, d * 0.8); L(det, -w * 0.55, -d * 0.8, -w * 0.55, d * 0.8); L(det, w * 0.35, -d * 0.8, -w * 0.55, -d * 0.8); L(det, w * 0.35, d * 0.8, -w * 0.55, d * 0.8); nDet++; } continue; }
      if (s === 'arbol') { const r = Math.max(w, d) * ppm; if (r < 1) continue; const q = Q(0, 0); verde.moveTo(q[0] + r, q[1]); for (let k = 1; k <= 16; k++) { const an = k / 16 * Math.PI * 2, rr = r * (k % 2 ? 0.82 : 1); verde.lineTo(q[0] + Math.cos(an) * rr, q[1] + Math.sin(an) * rr); } verde.closePath(); nV++; continue; }
      if (s === 'escritorio') { L(det, -w, -d * 0.45, w, -d * 0.45); const q = Q(0, d * 0.25), r = Math.min(w, d) * 0.28 * ppm; det.moveTo(q[0] + r, q[1]); det.arc(q[0], q[1], r, 0, Math.PI * 2); nDet++; }
      else if (s === 'silla') { L(det, -w * 0.9, -d * 0.75, w * 0.9, -d * 0.75); L(det, -w * 0.9, -d * 0.55, w * 0.9, -d * 0.55); nDet++; }
      else if (s === 'rack') { for (const f of [-0.5, 0, 0.5]) L(det, -w, d * f * 1.6 * 0.6, w, d * f * 1.6 * 0.6); L(det, -w, -d, w, d); nDet++; }
      else if (s === 'caja' || s === 'contenedor' && px < 30 * dpr) { L(det, -w, -d, w, d); L(det, -w, d, w, -d); nDet++; }
      else if (s === 'contenedor') { for (let k = -4; k <= 4; k++) L(det, w * k / 5, -d, w * k / 5, d); nDet++; }
      else if (s === 'tarima') { for (const f of [-0.6, 0, 0.6]) L(det, -w, d * f, w, d * f); nDet++; }
      else if (s === 'barril' || s === 'planta') { const q = Q(0, 0), r = Math.min(w, d) * 0.55 * ppm; det.moveTo(q[0] + r, q[1]); det.arc(q[0], q[1], r, 0, Math.PI * 2); nDet++; }
      else if (s === 'extintor') { const q = Q(0, 0), r = Math.max(2.5 * dpr, Math.min(w, d) * ppm); rojo.moveTo(q[0] + r, q[1]); rojo.arc(q[0], q[1], r, 0, Math.PI * 2); nR++; }
      else if (s === 'escalera') { const n = Math.max(3, Math.min(16, Math.round(it.w / 0.28))); for (let k = 1; k < n; k++) L(det, -w + 2 * w * k / n, -d, -w + 2 * w * k / n, d); L(det, -w * 0.8, 0, w * 0.8, 0); L(det, w * 0.8, 0, w * 0.55, d * 0.4); L(det, w * 0.8, 0, w * 0.55, -d * 0.4); nDet++; }
      else if (s === 'equipo') { L(det, -w * 0.7, 0, w * 0.7, 0); nDet++; }
      else if (s === 'luz') { const q = Q(0, 0), r = 2.2 * dpr; det.moveTo(q[0] + r, q[1]); det.arc(q[0], q[1], r, 0, Math.PI * 2); nDet++; }
    }
    let n = 0;
    if (nV) { c.fillStyle = COL.arbol; c.fill(verde); c.strokeStyle = COL.arbolB; c.lineWidth = 1 * dpr; c.stroke(verde); n += 2; }
    if (nCo) { c.fillStyle = COL.coche; c.fill(cocheF); c.strokeStyle = COL.cocheB; c.lineWidth = 1 * dpr; c.stroke(cocheF); n += 2; }
    if (nDet) { c.strokeStyle = COL.detalle; c.lineWidth = 0.8 * dpr; c.stroke(det); n++; }
    if (nR) { c.fillStyle = '#d6453d'; c.fill(rojo); n++; }
    return n;
  }
  function abertura(c, it, X, Z, ppm, dpr) {
    const d = it.d, b = it.b, gy = (+d.giroY || 0) * Math.PI / 180, w = +d.sx || 0.9, t = (+d.sz || 0.2) + 0.02;
    const ux = Math.cos(gy), uz = -Math.sin(gy), nx = Math.sin(gy), nz = Math.cos(gy);
    const p = (a, bb) => [X(d.x + ux * a + nx * bb), Z(d.z + uz * a + nz * bb)];
    const q = [p(-w / 2, -t / 2), p(w / 2, -t / 2), p(w / 2, t / 2), p(-w / 2, t / 2)]; c.beginPath(); c.moveTo(...q[0]); q.slice(1).forEach(v => c.lineTo(...v)); c.closePath();
    if (b === 'hueco') { if ((+d.alfeizar || 0) < 0.05) { c.fillStyle = COL.fondo; c.fill(); } c.setLineDash([5 * dpr, 3 * dpr]); c.strokeStyle = '#ff8f00'; c.lineWidth = 1.4 * dpr; c.stroke(); c.setLineDash([]); return 2; }
    c.fillStyle = COL.fondo; c.fill(); c.strokeStyle = b === 'puerta' ? COL.puerta : COL.cota; c.lineWidth = 1.4 * dpr;
    if (b === 'puerta') { const h = p(-w / 2, t / 2), fin = p(-w / 2, t / 2 + w); c.beginPath(); c.moveTo(...h); c.lineTo(...fin); c.stroke(); c.beginPath(); c.setLineDash([4 * dpr, 3 * dpr]); const r = w * ppm, a0 = Math.atan2(fin[1] - h[1], fin[0] - h[0]), e = p(w / 2, t / 2), a1 = Math.atan2(e[1] - h[1], e[0] - h[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; c.arc(h[0], h[1], r, a0, a1, da < 0); c.stroke(); c.setLineDash([]); return 3; }
    c.beginPath(); c.moveTo(...p(-w / 2, -t / 6)); c.lineTo(...p(w / 2, -t / 6)); c.moveTo(...p(-w / 2, t / 6)); c.lineTo(...p(w / 2, t / 6)); c.stroke(); return 2;
  }

  /* ---------- bucle: copia de la base + capa ligera ---------- */
  function bucle() {
    requestAnimationFrame(bucle);
    if (!activo || !datos) return;
    const c = A.camO, f = [c.position.x.toFixed(3), c.position.z.toFixed(3), c.zoom.toFixed(5), cv.width, cv.height, versionDatos, versionBase, A.sel.length, A.sel[0] || '', A.sel[A.sel.length - 1] || '', etqVersion].join('|');
    if (f === firma) return; firma = f; dibujar();
  }
  requestAnimationFrame(bucle);
  let ultimo = { ms: 0, llamadas: 0, etiquetas: 0, base: false };
  function cubre(V) { if (!bInfo) return false; const bx0 = bInfo.cx - bInfo.W / bInfo.ppm / 2, bx1 = bInfo.cx + bInfo.W / bInfo.ppm / 2, bz0 = bInfo.cz - bInfo.H / bInfo.ppm / 2, bz1 = bInfo.cz + bInfo.H / bInfo.ppm / 2; return V.cx - V.hw >= bx0 - 1e-6 && V.cx + V.hw <= bx1 + 1e-6 && V.cz - V.hh >= bz0 - 1e-6 && V.cz + V.hh <= bz1 + 1e-6; }
  function dibujar(forzarBase) {
    const t0 = performance.now(); const V = vistaActual(); let rehecha = false;
    const valida = bInfo && bInfo.v === versionDatos && bInfo.vb === versionBase && bInfo.Wv === V.W && bInfo.Hv === V.H;
    const mismaEscala = valida && Math.abs(bInfo.ppm / V.ppm - 1) < 1e-4;
    if (forzarBase || !valida || (mismaEscala && !cubre(V))) { dibujarBase(V); rehecha = true; }
    else if (!mismaEscala) { clearTimeout(tRehacer); tRehacer = setTimeout(() => { if (activo) { bInfo = null; firma = ''; } }, 110); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, V.W, V.H);
    const s = V.ppm / bInfo.ppm, ox = (bInfo.cx - V.cx) * V.ppm + V.W / 2 - bInfo.W / 2 * s, oy = (bInfo.cz - V.cz) * V.ppm + V.H / 2 - bInfo.H / 2 * s;
    if (Math.abs(s - 1) < 1e-4) g.drawImage(base, Math.round(ox), Math.round(oy)); else g.drawImage(base, ox, oy, bInfo.W * s, bInfo.H * s);
    let llamadas = 1;
    const X = x => (x - V.cx) * V.ppm + V.W / 2, Z = z => (z - V.cz) * V.ppm + V.H / 2;
    llamadas += capaSeleccion(V, X, Z);
    const et = capaTextos(V, X, Z); llamadas += et.llamadas;
    ultimo = { ms: performance.now() - t0, llamadas: llamadas + (rehecha ? ultimaBase.llamadas : 0), etiquetas: et.n, base: rehecha, msBase: rehecha ? ultimaBase.ms : 0 };
  }
  function capaSeleccion(V, X, Z) {
    const sel = A.sel; if (!sel.length) return 0; const D = datos; let n = 0;
    g.beginPath(); const vistos = new Set();
    for (const k of sel.slice(0, 4000)) { const l = D.porClave.get(k); if (!l) continue; for (const it of l) { if (vistos.has(it) || !it.pts) continue; vistos.add(it); trazarPoli(g, it.pts, X, Z); n++; } }
    if (!n) return 0; g.fillStyle = 'rgba(240,122,26,.28)'; g.fill(); g.strokeStyle = COL.sel; g.lineWidth = 1.8 * V.dpr; g.lineJoin = 'round'; g.stroke(); return 2;
  }
  /* ---------- etiquetas: tamaño fijo en pantalla, prioridad y descarte por choque ---------- */
  let etqVersion = 0, cajasEtq = [], puestas = [];
  function capaTextos(V, X, Z) {
    const D = datos, dpr = V.dpr, ppm = V.ppm, ocup = [], cand = [], selSet = A.selSet; cajasEtq = []; puestas = [];
    const choca = r => { for (const o of ocup) if (r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]) return true; return false; };
    const enPantalla = (x, y) => x > -80 * dpr && y > -30 * dpr && x < V.W + 80 * dpr && y < V.H + 30 * dpr;
    // zonas y edificios: siempre que quepan (prioridad por tamaño)
    /* de lejos mandan las zonas y los edificios; de cerca (edificio de más de 260 px) ceden el sitio a las habitaciones y van arriba */
    if (capas.nombres) for (const zn of D.zonas) {
      let x = X(zn.x), y = Z(zn.z); const lado = Math.sqrt(zn.area) * ppm; if (zn.clase !== 'zona' && zn.clase !== 'letrero' && lado < 14 * dpr) continue;
      const cerca = lado > 260 * dpr; if (cerca && zn.fondo) y = Z(zn.z - zn.fondo / 2) + 18 * dpr; if (!enPantalla(x, y)) continue;
      const pri = zn.clase === 'letrero' ? 5e5 + zn.area : cerca ? -1e5 + zn.area : 1e6 + zn.area * (zn.clase === 'zona' ? 0.5 : 1);
      cand.push({ x, y, t: zn.t, pri, tam: zn.clase === 'letrero' ? 11 : Math.min(17, 12 + Math.log2(1 + zn.area / 150)), peso: zn.clase === 'letrero' ? 600 : 700, color: zn.clase === 'letrero' ? '#5b6572' : COL.zona, fondo: true, zona: zn });
    }
    // habitaciones: nombre si la habitación se ve lo bastante grande; el área solo de cerca
    if (capas.nombres) for (const h of D.habs) {
      const x = X(h.x), y = Z(h.z); if (!enPantalla(x, y)) continue; const wpx = (h.bb[2] - h.bb[0]) * ppm, hpx = (h.bb[3] - h.bb[1]) * ppm; const sel = selSet.has(h.k);
      if (!sel && Math.min(wpx, hpx) < 22 * dpr) continue;
      cand.push({ x, y, t: h.t, t2: (ppm >= 9 * dpr || sel) && hpx > 34 * dpr ? A.fmt(h.area, 1) + ' m²' : '', pri: (sel ? 2e6 : 0) + h.area, tam: 12, peso: 600, color: COL.texto, maxW: Math.max(wpx * 1.25, 60 * dpr), sel });
    }
    // cotas de paredes nuevas: de la selección siempre; las demás solo de cerca (o con «Cotas: siempre»)
    const cotas = [];
    if (capas.cotas !== 'nunca') for (const o of D.nuevos) {
      const ct = o.__cota; if (!ct) continue; const s = selSet.has('n' + o.id); if (!s && capas.cotas !== 'siempre' && ppm < 28 * dpr) continue;
      const a = [X(ct.a[0]), Z(ct.a[1])], b = [X(ct.b[0]), Z(ct.b[1])], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 30 * dpr) continue; if (!enPantalla(a[0], a[1]) && !enPantalla(b[0], b[1])) continue;
      cotas.push({ a, b, L, t: ct.t, s });
    }
    cand.sort((p, q) => q.pri - p.pri);
    let n = 0, llamadas = 0;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const c of cand) {
      if (n > 260) break;
      const f1 = `${c.peso} ${c.tam * dpr}px "IBM Plex Sans", sans-serif`; g.font = f1; let lineas = [c.t]; let w = g.measureText(c.t).width;
      if (c.maxW && w > c.maxW) { const p = c.t.split(' '); if (p.length > 1) { let mejor = null; for (let i = 1; i < p.length; i++) { const a = p.slice(0, i).join(' '), b = p.slice(i).join(' '); const ww = Math.max(g.measureText(a).width, g.measureText(b).width); if (!mejor || ww < mejor[0]) mejor = [ww, a, b]; } if (mejor[0] < w) { lineas = [mejor[1], mejor[2]]; w = mejor[0]; } } if (w > c.maxW * 1.15 && !c.sel) continue; }
      const lh = c.tam * 1.2 * dpr, h2 = c.t2 ? 11 * 1.25 * dpr : 0, alto = lineas.length * lh + h2;
      let w2 = 0; if (c.t2) { g.font = `500 ${11 * dpr}px "IBM Plex Mono", monospace`; w2 = g.measureText(c.t2).width; }
      const ancho = Math.max(w, w2) + 8 * dpr, r = [c.x - ancho / 2, c.y - alto / 2 - 2 * dpr, c.x + ancho / 2, c.y + alto / 2 + 2 * dpr];
      if (choca(r)) { if (!c.t2) continue; /* sin el área cabe a veces */ const r2 = [c.x - w / 2 - 4 * dpr, c.y - lineas.length * lh / 2 - 2 * dpr, c.x + w / 2 + 4 * dpr, c.y + lineas.length * lh / 2 + 2 * dpr]; if (choca(r2)) continue; c.t2 = ''; r.splice(0, 4, ...r2); }
      ocup.push(r); n++; puestas.push({ t: lineas.join(' '), t2: c.t2 || '', r: r.slice(), clase: c.zona ? c.zona.clase : 'habitacion' });
      if (c.fondo) { g.fillStyle = 'rgba(246,244,238,.86)'; g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); llamadas++; }
      g.font = f1; g.fillStyle = c.sel ? COL.sel : c.color; let y = c.y - (c.t2 ? h2 / 2 : 0) - (lineas.length - 1) * lh / 2;
      for (const l of lineas) { if (!c.fondo) { g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(246,244,238,.9)'; g.strokeText(l, c.x, y); llamadas++; } g.fillText(l, c.x, y); y += lh; llamadas++; }
      if (c.t2) { g.font = `500 ${11 * dpr}px "IBM Plex Mono", monospace`; g.fillStyle = '#5b6572'; g.fillText(c.t2, c.x, y - lh / 2 + h2 / 2 + 1 * dpr); llamadas++; }
      if (c.zona) cajasEtq.push({ r, zona: c.zona });
    }
    // cotas al final, solo donde no tapan un nombre
    g.font = `600 ${11 * dpr}px "IBM Plex Mono", monospace`;
    for (const ct of cotas) {
      const { a, b } = ct; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const tw = g.measureText(ct.t).width + 8 * dpr, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const ext = Math.abs(Math.cos(ang)) * tw / 2 + Math.abs(Math.sin(ang)) * 8 * dpr, exz = Math.abs(Math.sin(ang)) * tw / 2 + Math.abs(Math.cos(ang)) * 8 * dpr; const r = [mx - ext, my - exz, mx + ext, my + exz];
      if (!ct.s && choca(r)) continue; ocup.push(r); puestas.push({ t: ct.t, r: r.slice(), clase: 'cota' });
      g.strokeStyle = ct.s ? COL.sel : COL.cota; g.fillStyle = g.strokeStyle; g.lineWidth = 1 * dpr; g.beginPath(); g.moveTo(...a); g.lineTo(...b);
      const tk = 5 * dpr; for (const p of [a, b]) { g.moveTo(p[0] - Math.cos(ang + Math.PI / 4) * tk, p[1] - Math.sin(ang + Math.PI / 4) * tk); g.lineTo(p[0] + Math.cos(ang + Math.PI / 4) * tk, p[1] + Math.sin(ang + Math.PI / 4) * tk); } g.stroke();
      g.save(); g.translate(mx, my); let rr = ang; if (rr > Math.PI / 2 || rr < -Math.PI / 2) rr += Math.PI; g.rotate(rr); g.fillStyle = COL.fondo; g.fillRect(-tw / 2, -8 * dpr, tw, 16 * dpr); g.fillStyle = ct.s ? COL.sel : COL.cota; g.fillText(ct.t, 0, 0); g.restore(); llamadas += 3;
    }
    return { n, llamadas };
  }

  /* ---------- elegir en el plano (lo que se ve encima) ---------- */
  const dentro = (x, z, pts) => { let d = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const ax = pts[i], az = pts[i + 1], bx = pts[j], bz = pts[j + 1]; if (((az > z) !== (bz > z)) && (x < (bx - ax) * (z - az) / (bz - az) + ax)) d = !d; } return d; };
  const ORDEN = { nabert: 9, puertaM: 8, obj: 7, nobj: 7, nsimb: 7, copa: 6, pared: 5, nmuro: 5, deco: 4, hab: 3, calle: 2, npiso: 2, suelo: 1 };
  function pick(e) {
    if (!activo || !datos) return undefined;
    const r = A.dom.getBoundingClientRect(), V = vistaActual(); const sx = (e.clientX - r.left) * V.dpr, sy = (e.clientY - r.top) * V.dpr;
    const x = (sx - V.W / 2) / V.ppm + V.cx, z = (sy - V.H / 2) / V.ppm + V.cz, tol = 4 * V.dpr / V.ppm;
    const verParedes = window.OOCapasVista ? OOCapasVista.estado().paredes !== 'ocultas' : true;
    let mejor = null;
    for (const it of consulta(x - tol, z - tol, x + tol, z + tol)) {
      const o = ORDEN[it.kind]; if (!o || !A.seleccionable(it.k)) continue;
      if ((it.kind === 'obj' || it.kind === 'nobj' || it.kind === 'nsimb') && !capas.objetos) continue; if ((it.kind === 'pared' || it.kind === 'nmuro') && !verParedes) continue;
      if (it.kind === 'suelo' && it.ext > 40) continue; /* el suelo enorme del mapa no se coge desde el plano */
      let toca = false;
      if (it.kind === 'puertaM') toca = Math.hypot(x - it.x, z - it.z) < it.ancho; else if (it.kind === 'nabert') { const d = it.d; toca = Math.hypot(x - d.x, z - d.z) < Math.max(0.5, (+d.sx || 0.9) / 2); }
      else toca = dentro(x, z, it.pts) || (it.ext * V.ppm < 8 * V.dpr && x > it.bb[0] - tol && x < it.bb[2] + tol && z > it.bb[1] - tol && z < it.bb[3] + tol);
      if (!toca) continue; const area = it.ext;
      if (!mejor || o > mejor.o || (o === mejor.o && area < mejor.area)) mejor = { o, area, it };
    }
    if (!mejor) return null;
    const it = mejor.it; let y = it.top != null ? it.top : 0; if (it.kind === 'hab' || it.kind === 'npiso') { const ob = E.nuevos().get(it.k.slice(1)); y = ob ? (+ob.datos.y || 0) : 0; }
    return { key: it.k, point: new T.Vector3(x, y, z), normal: new T.Vector3(0, 1, 0), nLocal: new T.Vector3(0, 1, 0), mat: new T.Matrix4(), malla: 'plano', t: 0 };
  }
  /* ---------- etiquetas: doble clic para renombrar ---------- */
  function etiquetaEn(e) { const r = A.dom.getBoundingClientRect(), dpr = cv.width / Math.max(1, cv.clientWidth), x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr; for (const c of cajasEtq) if (x >= c.r[0] && x <= c.r[2] && y >= c.r[1] && y <= c.r[3]) return c.zona; return null; }
  function guardarEtiqueta(zn, cambios) {
    const id = zn.docId || ('et-' + A.mapa + '-' + String(zn.base || Date.now().toString(36)).replace(/[^A-Za-z0-9_\-]/g, '_'));
    const prev = A.efectivos('etiquetas').get(id) || { mapa: A.mapa, base: zn.base || null, creado: A.ahora() };
    A.guardarCol('etiquetas', id, Object.assign({}, prev, cambios, { actualizado: A.ahora() })); return id;
  }
  async function renombrar(zn) {
    let txt = zn.t;
    const r = A.abrirModal(`<div class="cab">Etiqueta del plano</div><div class="cont"><label class="campo"><span>Nombre</span><input type="text" id="etqNombre" data-foco value="${A.esc(zn.t)}"></label><p class="ayuda">Se ve en el plano 2D. Vacío o «Ocultar» la quita; las etiquetas propias se pueden borrar.</p></div><div class="pie"><button data-a="m-no">Cancelar</button><button data-a="m-etq-ocultar">Ocultar</button><button class="prim" data-a="m-si">Guardar</button></div>`);
    setTimeout(() => { const i = document.getElementById('etqNombre'); if (i) { i.select(); i.addEventListener('input', () => { txt = i.value; }); i.addEventListener('keydown', ev => { if (ev.key === 'Enter') A.cerrarModal(true); }); } const b = document.querySelector('[data-a="m-etq-ocultar"]'); if (b) b.addEventListener('click', () => A.cerrarModal('ocultar')); }, 30);
    const v = await r;
    if (v === true && txt.trim()) guardarEtiqueta(zn, { texto: txt.trim(), oculta: false });
    else if (v === 'ocultar' || (v === true && !txt.trim())) { if (zn.clase === 'propia') A.guardarCol('etiquetas', zn.docId, null); else guardarEtiqueta(zn, { oculta: true }); }
  }
  function nuevaEtiqueta(x, z, texto, tam) { const id = 'et-' + A.mapa + '-u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); A.guardarCol('etiquetas', id, { mapa: A.mapa, texto, x: A.r3(x), z: A.r3(z), tam: tam || 30, base: null, creado: A.ahora(), actualizado: A.ahora() }); return id; }
  A.dom.addEventListener('dblclick', e => { if (!activo) return; const zn = etiquetaEn(e); if (zn) { e.preventDefault(); e.stopPropagation(); renombrar(zn); } }, true);
  E.on('recompute', () => { if (activo && datos) { datos.zonas = etiquetasZona(); etqVersion++; } });
  /* herramienta «Etiqueta de zona» (Construir): clic en el plano y escribir el nombre */
  E.agregarHerramientaPropia('etiqueta-zona', {
    n: 'Etiqueta de zona', ic: 'texto', pista: 'Clic donde va el nombre de la zona o del edificio (se ve en el plano 2D). Doble clic en una etiqueta para renombrarla.',
    up: async (e, mov) => { if (mov > 6) return; const p = A.puntoPlano(e, 0); if (!p) return; let txt = ''; const r = A.abrirModal(`<div class="cab">Nueva etiqueta</div><div class="cont"><label class="campo"><span>Nombre</span><input type="text" id="etqNombre" data-foco placeholder="Galpón, bar, parqueadero…"></label></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Crear</button></div>`); setTimeout(() => { const i = document.getElementById('etqNombre'); if (i) { i.addEventListener('input', () => { txt = i.value; }); i.addEventListener('keydown', ev => { if (ev.key === 'Enter') A.cerrarModal(true); }); } }, 30); if ((await r) === true && txt.trim()) { nuevaEtiqueta(p.x, p.z, txt.trim()); A.pista('Etiqueta «' + txt.trim() + '» creada.'); } }
  });
  E.agregarHerramienta('construir', { h: 'etiqueta-zona', n: 'Etiqueta de zona' });

  /* ---------- capas propias del plano (barra de abajo) ---------- */
  function ponerCapa(k, v) { capas[k] = v; guardarCapas(); versionBase++; firma = ''; pintarBotones(); }
  function pintarBotones() {
    const el = document.getElementById('plCapas'); if (!el) return;
    el.querySelector('[data-pl="objetos"]').classList.toggle('on', !!capas.objetos);
    el.querySelector('[data-pl="nombres"]').classList.toggle('on', !!capas.nombres);
    const c = el.querySelector('[data-pl="cotas"]'); c.textContent = ({ auto: 'Cotas', siempre: 'Cotas +', nunca: 'Sin cotas' })[capas.cotas]; c.title = 'Cotas de las paredes: ' + ({ auto: 'solo de cerca', siempre: 'todas', nunca: 'ninguna' })[capas.cotas] + ' (las de la selección siempre) · clic para cambiar'; c.classList.toggle('on', capas.cotas !== 'nunca');
  }
  (function barra() {
    const b = document.querySelector('#barraVista .centro-barra'); if (!b) return;
    b.insertAdjacentHTML('beforeend', `<span id="plCapas" class="pl-capas" role="group" aria-label="Capas del plano 2D"><button data-pl="objetos" title="Objetos y sus símbolos (Alt+O)">Objetos</button><button data-pl="nombres" title="Nombres de zonas y habitaciones (Alt+L)">Nombres</button><button data-pl="cotas" title="Cotas de las paredes: solo de cerca, todas o ninguna (la selección siempre)">Cotas</button></span>`);
    b.addEventListener('click', e => { const x = e.target.closest('[data-pl]'); if (!x) return; const k = x.dataset.pl; if (k === 'cotas') ponerCapa('cotas', ({ auto: 'siempre', siempre: 'nunca', nunca: 'auto' })[capas.cotas]); else ponerCapa(k, !capas[k]); });
    pintarBotones();
  })();
  const alListo = f => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', f, { once: true }); else f(); };
  alListo(() => { if (window.OOProductividad) { const acc = OOProductividad.acciones; acc.push({ id: 'plano-objetos', n: 'Plano 2D: mostrar u ocultar objetos', def: 'Alt+O', fn: () => ponerCapa('objetos', !capas.objetos), nucleo: false }, { id: 'plano-nombres', n: 'Plano 2D: mostrar u ocultar nombres', def: 'Alt+L', fn: () => ponerCapa('nombres', !capas.nombres), nucleo: false }); } });
  E.on('capas-vista', () => { versionBase++; firma = ''; if (activo) programarRecalculo(); });

  /* medición para las pruebas: ms de un dibujo completo de la base y de la capa ligera */
  function medirDibujo(n) { if (!activo || !datos) return null; const V = vistaActual(); let tb = 0, tl = 0; for (let i = 0; i < (n || 3); i++) { const a = performance.now(); dibujarBase(V); tb += performance.now() - a; const b = performance.now(); firma = ''; dibujar(); tl += performance.now() - b; } return { base_ms: +(tb / (n || 3)).toFixed(1), capa_ms: +(tl / (n || 3)).toFixed(1), items_base: ultimaBase.items, llamadas_base: ultimaBase.llamadas }; }
  window.OOPlano = {
    activar, activo: () => activo, recalcular, dibujar: () => { firma = ''; bInfo = null; }, forzar: () => { firma = ''; bInfo = null; }, pick, medirDibujo, capas, ponerCapa, nuevaEtiqueta, guardarEtiqueta, etiquetasZona, simbolo,
    get ultimo() { return ultimo; }, get etiquetasPuestas() { return puestas; }, get ultimaBase() { return ultimaBase; }, get datos() { return datos; }, etiquetaEn, renombrar, consulta, EDIFICIOS
  };
})();
