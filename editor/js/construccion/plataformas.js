/* Editor del mapa (2.1, Map Editor Pro fase 3): plataformas y desniveles como presets de fundación.
   Tarima, terraza, escenario, muelle de carga, andén, acera elevada, bordillo, plataforma industrial sobre columnas y plataforma sobre
   pilotes. Son fundaciones normales (se elevan, anclan lo de encima y se editan igual) con `datos.preset` y estos extras:
     baranda      true: baranda perimetral (sin el lado del frente si `frenteAbierto`); estiloBaranda 'tubos' | 'vidrio'
     defensas     topes de goma en el frente (muelle de carga)
     lineaSeg     franja amarilla de seguridad a 0,6 m del frente (andén, muelle)
     faldon       faldón oscuro en los lados (escenario)
     columnas     base 'columnas': columnas redondas cada `sepColumnas` m bajo la losa
   El frente es el lado +Z local de la fundación rectangular (el de abajo en planta con giro 0).
   Construir → «Plataforma: …» (arrastrar un rectángulo, o clic para el tamaño típico). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !window.OOFundaciones) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, r3 = A.r3, tb = A.tipoBase, B = OO.B, MAT = A.MATERIALES;
  const mc = k => (MAT[k] || {}).c;
  const PRESETS = {
    tarima: { n: 'Tarima', sx: 4, sz: 3, d: { elevacion: 0.3, espesor: 0.3, base: 'macizo', borde: 'moldura', matSup: 'madera', colorSup: mc('madera') || '#8f6d4b', matLat: 'madera', colorLat: '#6b4f35' } },
    terraza: { n: 'Terraza', sx: 6, sz: 4, d: { elevacion: 0.6, espesor: 0.25, base: 'macizo', borde: 'recto', matSup: 'baldosa', colorSup: mc('baldosa') || '#c9c2b4', matLat: 'concreto', colorLat: '#a9a49a', baranda: true, frenteAbierto: true, estiloBaranda: 'vidrio' } },
    escenario: { n: 'Escenario', sx: 8, sz: 5, d: { elevacion: 1.0, espesor: 0.2, base: 'macizo', borde: 'recto', matSup: 'madera', colorSup: '#3b3b3b', matLat: 'pintura', colorLat: '#1d1d1d', faldon: true } },
    muelle: { n: 'Muelle de carga', sx: 10, sz: 4, d: { elevacion: 1.2, espesor: 0.3, base: 'macizo', borde: 'recto', matSup: 'concreto', colorSup: '#b8b3a8', matLat: 'concreto', colorLat: '#8f8a80', defensas: true, lineaSeg: true } },
    anden: { n: 'Andén', sx: 20, sz: 3, d: { elevacion: 0.9, espesor: 0.25, base: 'macizo', borde: 'moldura', matSup: 'adoquin', colorSup: mc('adoquin') || '#a39c90', matLat: 'concreto', colorLat: '#8f8a80', lineaSeg: true } },
    acera: { n: 'Acera elevada', sx: 10, sz: 2, d: { elevacion: 0.15, espesor: 0.15, base: 'macizo', borde: 'recto', matSup: 'concreto', colorSup: '#c4c1bb', matLat: 'concreto', colorLat: '#9d9a93' } },
    bordillo: { n: 'Bordillo', sx: 6, sz: 0.15, d: { elevacion: 0.15, espesor: 0.15, base: 'macizo', borde: 'recto', matSup: 'concreto', colorSup: '#d6d3cc', matLat: 'concreto', colorLat: '#d6d3cc' } },
    industrial: { n: 'Plataforma industrial (columnas)', sx: 8, sz: 6, d: { elevacion: 3.0, espesor: 0.3, base: 'columnas', sepColumnas: 4, borde: 'recto', matSup: 'metal', colorSup: '#8d949a', matLat: 'concreto', colorLat: '#9a958b', baranda: true, frenteAbierto: false, estiloBaranda: 'tubos' } },
    pilotes: { n: 'Plataforma sobre pilotes', sx: 6, sz: 6, d: { elevacion: 1.5, espesor: 0.25, base: 'losa', borde: 'recto', matSup: 'madera', colorSup: mc('madera') || '#8f6d4b', matLat: 'madera', colorLat: '#6b4f35', baranda: true, frenteAbierto: true, estiloBaranda: 'tubos' } }
  };
  function areaF(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* extras dibujados por fundaciones.partes */
  function extras(e, pts, top, bot, out) {
    const rect = e.forma !== 'poligono', orient = areaF(pts) > 0 ? 1 : -1;
    const lados = pts.map((a, i) => { const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return { a, b, L, ang: Math.atan2(-dz, dx), o: [dz / L * orient, -dx / L * orient], m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; });
    const esFrente = l => rect ? (l.o[1] > 0.7) : false;
    const ft = e.borde === 'bordillo' ? 0.12 : 0;
    if (e.base === 'columnas' && bot > 0.1) {
      const sep = Math.max(1.5, +e.sepColumnas || 4); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const nx = Math.max(1, Math.round((x1 - x0 - 0.6) / sep)), nz = Math.max(1, Math.round((z1 - z0 - 0.6) / sep));
      for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) { const x = x0 + 0.3 + i * (x1 - x0 - 0.6) / nx, z = z0 + 0.3 + k * (z1 - z0 - 0.6) / nz; if (!A.dentroPoligono(x, z, pts)) continue; out.push({ f: 'c', p: [x, bot / 2, z], s: [0.4, bot, 0.4], c: e.colorLat || '#9a958b' }); }
      for (const l of lados) out.push(B(l.m[0] - l.o[0] * 0.15, bot - 0.2, l.m[1] - l.o[1] * 0.15, l.L, 0.4, 0.3, e.colorLat || '#9a958b', { r: [0, l.ang, 0] })); /* vigas de borde */
    }
    if (e.baranda) {
      const ab = 1.0, bc = e.colorBaranda || '#4a4f55', vidrio = e.estiloBaranda === 'vidrio';
      for (const l of lados) {
        if (e.frenteAbierto && esFrente(l)) continue; if (l.L < 0.3) continue;
        const ox = -l.o[0] * 0.06, oz = -l.o[1] * 0.06, n = Math.max(1, Math.ceil(l.L / 1.5));
        for (let k = 0; k <= n; k++) { const t = k / n, x = l.a[0] + (l.b[0] - l.a[0]) * t + ox, z = l.a[1] + (l.b[1] - l.a[1]) * t + oz; out.push(B(x, top + ft + ab / 2, z, 0.05, ab, 0.05, bc)); }
        out.push(B(l.m[0] + ox, top + ft + ab, l.m[1] + oz, l.L, 0.05, 0.06, bc, { r: [0, l.ang, 0] }));
        if (vidrio) out.push(B(l.m[0] + ox, top + ft + 0.5, l.m[1] + oz, l.L - 0.06, 0.85, 0.015, '#9fd0ee', { r: [0, l.ang, 0], t: true }));
        else { out.push(B(l.m[0] + ox, top + ft + 0.5, l.m[1] + oz, l.L, 0.03, 0.03, bc, { r: [0, l.ang, 0] })); out.push(B(l.m[0] + ox, top + ft + 0.1, l.m[1] + oz, l.L, 0.1, 0.02, bc, { r: [0, l.ang, 0] })); }
      }
    }
    for (const l of lados) {
      if (!esFrente(l)) continue;
      if (e.defensas) { const n = Math.max(1, Math.floor(l.L / 2.5)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = l.a[0] + (l.b[0] - l.a[0]) * t + l.o[0] * 0.06, z = l.a[1] + (l.b[1] - l.a[1]) * t + l.o[1] * 0.06; out.push(B(x, top - 0.3, z, 0.25, 0.45, 0.12, '#1e1e1e', { r: [0, l.ang, 0] })); } out.push(B(l.m[0] + l.o[0] * 0.005, top - 0.02, l.m[1] + l.o[1] * 0.005, l.L, 0.04, 0.05, '#c9a227', { r: [0, l.ang, 0] })); }
      if (e.lineaSeg) out.push(B(l.m[0] - l.o[0] * 0.6, top + 0.004, l.m[1] - l.o[1] * 0.6, l.L - 0.1, 0.008, 0.12, '#f2c200', { r: [0, l.ang, 0] }));
    }
    if (e.faldon) for (const l of lados) out.push(B(l.m[0] + l.o[0] * 0.03, Math.max(0.05, top - 0.05) / 2, l.m[1] + l.o[1] * 0.03, l.L + 0.04, Math.max(0.05, top - 0.05), 0.02, '#141414', { r: [0, l.ang, 0] }));
  }
  /* crear un preset (API y herramienta) */
  function crear(preset, x0, z0, x1, z1, y, extra) {
    const P = PRESETS[preset]; if (!P) return null;
    if (x1 == null) { x1 = x0 + P.sx / 2; z1 = z0 + P.sz / 2; x0 -= P.sx / 2; z0 -= P.sz / 2; }
    return OOFundaciones.crearRect(x0, z0, x1, z1, y || 0, Object.assign({ preset, nombre: P.n }, P.d, extra || {}));
  }
  /* herramienta: arrastrar un rectángulo o clic para el tamaño típico */
  let est = null, actual = 'muelle';
  E.agregarHerramientaPropia('plataforma', {
    n: 'Plataforma', ic: 'fundacion', pista: 'Arrastra un rectángulo o haz clic para ponerla con su tamaño típico. Luego se edita como una fundación (elevación, materiales, barandas…).',
    opciones: it => { if (it.preset) actual = it.preset; est = null; },
    down: e => { const inf = A.inferir(e, null); if (inf) est = { a: inf.p.clone() }; },
    move: e => { if (!est) { A.inferir(e, null); return; } const inf = A.inferir(e, est.a, { y: est.a.y }); if (!inf) return; const a = est.a, b = inf.p; if (Math.abs(b.x - a.x) < 0.1 || Math.abs(b.z - a.z) < 0.1) return; A.mostrarPrevia('fundacion', Object.assign({ forma: 'rect', x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2, sx: Math.abs(b.x - a.x), sz: Math.abs(b.z - a.z), giroY: 0 }, PRESETS[actual].d)); },
    up: (e, mov) => {
      if (!est) return; const a = est.a; est = null; A.limpiarPrevia(); const inf = A.inferir(e, a, { y: a.y }); A.ocultarInferencia(); if (!inf) return; const b = inf.p;
      const id = (mov < 6 || Math.abs(b.x - a.x) < 0.3 || Math.abs(b.z - a.z) < 0.15) ? crear(actual, a.x, a.z, null, null, a.y) : crear(actual, a.x, a.z, b.x, b.z, a.y);
      if (id) A.seleccionar(['n' + id], { sinTab: true });
    },
    fin: () => { est = null; A.limpiarPrevia(); }
  });
  for (const k in PRESETS) E.agregarHerramienta('construir', { h: 'plataforma', preset: k, n: 'Plataforma: ' + PRESETS[k].n.toLowerCase(), ic: 'fundacion' });

  /* inspector: opciones de plataforma en cualquier fundación */
  function selFund() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && tb(o.tipo) === 'fundacion' ? o : null; }
  const chk = (k, l, v) => `<label class="chk"><input type="checkbox" data-pl="${k}"${v ? ' checked' : ''}> ${A.esc(l)}</label>`;
  E.on('panel', () => {
    const o = selFund(); const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c) return; const d = o.datos;
    const div = document.createElement('div');
    div.innerHTML = `<details class="sec" data-sec="plataforma"${d.preset ? ' open' : ''}><summary>Plataforma${d.preset && PRESETS[d.preset] ? ': ' + A.esc(PRESETS[d.preset].n.toLowerCase()) : ''}</summary><div class="campos">
      ${chk('baranda', 'Baranda perimetral', d.baranda)}${chk('frenteAbierto', 'Sin baranda en el frente', d.frenteAbierto)}
      <label class="campo"><span>Baranda</span><select data-pl="estiloBaranda"><option value="tubos"${d.estiloBaranda !== 'vidrio' ? ' selected' : ''}>Tubos</option><option value="vidrio"${d.estiloBaranda === 'vidrio' ? ' selected' : ''}>Vidrio</option></select></label>
      ${chk('defensas', 'Defensas de goma en el frente', d.defensas)}${chk('lineaSeg', 'Línea amarilla de seguridad', d.lineaSeg)}${chk('faldon', 'Faldón oscuro', d.faldon)}
      ${d.base === 'columnas' ? `<label class="campo"><span>Separación de columnas (m)</span><input type="number" step="0.5" data-pl="sepColumnas" value="${r3(+d.sepColumnas || 4)}"></label>` : ''}
      <p class="ayuda">El frente es el lado +Z de la plataforma (gírala para orientarlo). Una rampa o escalera se une a ella con su herramienta: clic abajo y clic encima.</p></div></details>`;
    const ref = c.querySelector('[data-sec="fundacion"]') || c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', e => { const el = e.target; if (!el.dataset || !el.dataset.pl) return; const o = selFund(); if (!o) return; const k = el.dataset.pl; const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value; OOFundaciones.cambiar(o.id, { [k]: v }, 'Cambiar plataforma'); });

  window.OOPlataformas = { PRESETS, crear, extras };
})();
