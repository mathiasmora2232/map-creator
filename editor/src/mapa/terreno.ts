/* Editor del mapa (2.1, editor v2): terraformado (menú «Terreno» de la barra de la izquierda).
   - Terreno de rejilla de alturas (heightmap) alrededor del mapa: se crea al usarlo por primera vez y se guarda en
     datos_usuario/terreno.json ({mapa, x0, z0, paso, nx, nz, alturas (cm, Int16 en base64), pintura (Uint8 en base64), paleta}).
   - Pincel: pintar suelo (asfalto, tierra, madera, mármol, arena, pasto, concreto, adoquín, grava, baldosa… y los materiales propios),
     subir, bajar, aplanar a una altura, suavizar y zanja o hueco. Rampa o talud entre dos puntos con su altura.
   - Polígono: pinta un suelo con forma (queda como objeto «suelo» editable, encima de los suelos del mapa).
   - Sale en la exportación: malla «Terreno» en el GLB, «terreno» en el JSON de escena y alturas en PNG (8 bits) y RAW de 16 bits
     para Godot (HTerrain/Terrain3D) y Unity (Terrain → Import Raw). Deshacer del terreno: botón en el panel de la herramienta. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc, svg = A.svg, $ = (s?) => document.querySelector(s);
  const MAT = A.MATERIALES;
  // materiales que faltaban en el catálogo (sirven también para Pintar)
  if (!MAT.arena) MAT.arena = { n: 'Arena', c: '#d8c49a', patron: 'moteado' };
  if (!MAT.grava) MAT.grava = { n: 'Grava', c: '#9a958c', patron: 'moteado' };
  if (!MAT.marmol) MAT.marmol = { n: 'Mármol', c: '#e9e6e0', patron: 'baldosa' };
  const PALETA = ['cesped', 'tierra', 'arena', 'grava', 'asfalto', 'concreto', 'adoquin', 'baldosa', 'madera', 'marmol', 'pintura'];
  const BASE_Y = 0.025; // justo encima del suelo del mapa; solo se ve donde se ha tocado (pintura ≠ 255 o altura ≠ 0)
  const SIN = 255;
  let T0 = null, malla = null, docId = null, deshacer = [];
  let modo = 'subir', radio = 6, fuerza = 1, alturaObj = 0, pintarCon = 'tierra', ancho = 6, est = null, suavidad = 1; /* (2.1 pro f5) suavidad: 0 = borde duro, 1 = caída desde el centro */
  const caida = (d?, r?) => { const s = Math.max(0.01, Math.min(1, suavidad)), r0 = r * (1 - s); return d <= r0 ? 1 : Math.pow(Math.cos(Math.min(1, (d - r0) / (r - r0 || 1e-6)) * Math.PI / 2), 2); };
  const b64 = (arr?) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
  const deb64 = (s?, Tipo?) => { const bin = atob(s || ''); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Tipo(u.buffer); };
  function paletaColor(clave?) { if (String(clave).startsWith('u:')) { const m = A.efectivos('materiales').get(clave.slice(2)); return (m && m.color) || '#999999'; } return (MAT[clave] || MAT.cesped).c; }
  /* ---------- crear o cargar ---------- */
  function nuevoTerreno() {
    const L = A.limitesMapa, mg = 80, x0 = Math.floor(L.min.x - mg), z0 = Math.floor(L.min.z - mg), w = L.max.x - L.min.x + 2 * mg, h = L.max.z - L.min.z + 2 * mg;
    const paso = Math.max(2, Math.ceil(Math.max(w, h) / 240)), nx = Math.ceil(w / paso) + 1, nz = Math.ceil(h / paso) + 1;
    return { x0, z0, paso, nx, nz, alt: new Float32Array(nx * nz), pin: new Uint8Array(nx * nz).fill(SIN), paleta: PALETA.slice() };
  }
  function cargar() {
    docId = 'hm-' + A.mapa; const d = A.efectivos('terreno').get(docId);
    if (!d) { T0 = null; quitarMalla(); return; }
    const cm = deb64(d.alturas, Int16Array), pin = deb64(d.pintura, Uint8Array);
    T0 = { x0: d.x0, z0: d.z0, paso: d.paso, nx: d.nx, nz: d.nz, alt: Float32Array.from(cm, (v: any) => v / 100), pin: pin.length === d.nx * d.nz ? pin : new Uint8Array(d.nx * d.nz).fill(SIN), paleta: Array.isArray(d.paleta) ? d.paleta : PALETA.slice() };
    construirMalla();
  }
  function guardar() {
    if (!T0) return; const act = A.ahora(); T0.act = act; const cm = new Int16Array(T0.alt.length); for (let i = 0; i < cm.length; i++) cm[i] = Math.max(-32000, Math.min(32000, Math.round(T0.alt[i] * 100)));
    A.guardarCol('terreno', docId, { mapa: A.mapa, x0: T0.x0, z0: T0.z0, paso: T0.paso, nx: T0.nx, nz: T0.nz, alturas: b64(cm), pintura: b64(T0.pin), paleta: T0.paleta, base_y: BASE_Y, actualizado: act });
  }
  function quitarMalla() { if (malla) { A.scene.remove(malla); malla.geometry.dispose(); malla.material.dispose(); malla = null; A.marcar(); } }
  function construirMalla() {
    quitarMalla(); if (!T0) return;
    const { nx, nz, paso } = T0, g = new T.PlaneGeometry((nx - 1) * paso, (nz - 1) * paso, nx - 1, nz - 1); g.rotateX(-Math.PI / 2);
    g.translate(T0.x0 + (nx - 1) * paso / 2, 0, T0.z0 + (nz - 1) * paso / 2);
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(nx * nz * 4), 4));
    malla = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, alphaTest: 0.5, clippingPlanes: [A.clip], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    malla.name = 'terreno'; malla.receiveShadow = true; malla.castShadow = true; A.scene.add(malla);
    refrescar(0, 0, nx - 1, nz - 1);
  }
  const col = new T.Color();
  function refrescar(i0?, j0?, i1?, j1?) {
    if (!malla) return; const { nx, alt, pin, paleta } = T0, pos = malla.geometry.attributes.position, c = malla.geometry.attributes.color;
    for (let j = Math.max(0, j0); j <= Math.min(T0.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
      const k = j * nx + i; pos.setY(k, BASE_Y + alt[k]);
      col.set(paletaColor(pin[k] === SIN ? 'cesped' : (paleta[pin[k]] || 'cesped'))); const n = ((i * 73856093) ^ (j * 19349663)) % 17 / 17 * 0.12 - 0.06; col.offsetHSL(0, 0, n); c.setXYZW(k, col.r, col.g, col.b, (pin[k] !== SIN || Math.abs(alt[k]) > 0.005) ? 1 : 0);
    }
    pos.needsUpdate = true; c.needsUpdate = true; malla.geometry.computeVertexNormals(); malla.geometry.computeBoundingSphere(); A.marcar();
  }
  function asegurar() { if (!T0) { T0 = nuevoTerreno(); docId = 'hm-' + A.mapa; construirMalla(); } }
  function alturaEn(x?, z?) { if (!T0) return 0; const fi = (x - T0.x0) / T0.paso, fj = (z - T0.z0) / T0.paso, i = Math.max(0, Math.min(T0.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(T0.nz - 2, Math.floor(fj))), u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j)), a = T0.alt, nx = T0.nx; return (a[j * nx + i] * (1 - u) + a[j * nx + i + 1] * u) * (1 - v) + (a[(j + 1) * nx + i] * (1 - u) + a[(j + 1) * nx + i + 1] * u) * v; }
  /* ---------- puntero ---------- */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function punto(e?) {
    const r = A.dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); A.cam.updateMatrixWorld(); ray.setFromCamera(ndc, A.cam);
    if (malla) { const h = ray.intersectObject(malla, false)[0]; if (h) return h.point; }
    return A.puntoPlano(e, 0);
  }
  function pincel(p?, dt?) {
    asegurar(); const { nx, nz, paso, alt, pin } = T0; const r = radio, ci = (p.x - T0.x0) / paso, cj = (p.z - T0.z0) / paso, rr = Math.ceil(r / paso) + 1;
    const i0 = Math.floor(ci - rr), i1 = Math.ceil(ci + rr), j0 = Math.floor(cj - rr), j1 = Math.ceil(cj + rr);
    const idxPin = Math.max(0, T0.paleta.indexOf(pintarCon) < 0 ? (T0.paleta.push(pintarCon), T0.paleta.length - 1) : T0.paleta.indexOf(pintarCon));
    const copia = modo === 'suavizar' ? alt.slice() : null;
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
      const x = T0.x0 + i * paso, z = T0.z0 + j * paso, d = Math.hypot(x - p.x, z - p.z); if (d > r) continue;
      const f = caida(d, r), k = j * nx + i, v = fuerza * dt;
      if (modo === 'pintar') { if (f > 0.25) pin[k] = idxPin; }
      else if (modo === 'subir') alt[k] += 3 * v * f;
      else if (modo === 'bajar') alt[k] -= 3 * v * f;
      else if (modo === 'aplanar') alt[k] += (alturaObj - alt[k]) * Math.min(1, 6 * v * f);
      else if (modo === 'suavizar') { let s = 0, n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; s += copia[jj * nx + ii]; n++; } alt[k] += (s / n - alt[k]) * Math.min(1, 5 * v * f); }
      else if (modo === 'zanja') { const fondo = alturaObj - Math.max(0.5, fuerza * 1.5); if (d < r * 0.65) alt[k] += (fondo - alt[k]) * Math.min(1, 8 * v); else alt[k] += (fondo - alt[k]) * Math.min(1, 8 * v) * (1 - (d - r * 0.65) / (r * 0.35)); }
    }
    refrescar(i0, j0, i1, j1);
  }
  function rampa(a?, b?) {
    asegurar(); const { nx, nz, paso, alt } = T0; const ha = a.h, hb = b.h, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz; if (L2 < 1) return;
    const m = ancho / 2, talud = ancho * 0.6;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = T0.x0 + i * paso, z = T0.z0 + j * paso; const t = ((x - a.x) * dx + (z - a.z) * dz) / L2; if (t < -0.05 || t > 1.05) continue;
      const tc = Math.max(0, Math.min(1, t)), px = a.x + dx * tc, pz = a.z + dz * tc, d = Math.hypot(x - px, z - pz); if (d > m + talud) continue;
      const h = ha + (hb - ha) * tc, k = j * nx + i; if (d <= m) alt[k] = h; else { const f = (d - m) / talud; alt[k] = h + (alt[k] - h) * f * f; }
    }
    refrescar(0, 0, nx - 1, nz - 1);
  }
  function apilarDeshacer() { if (!T0) return; deshacer.push({ alt: T0.alt.slice(), pin: T0.pin.slice(), paleta: T0.paleta.slice() }); if (deshacer.length > 15) deshacer.shift(); }
  function deshacerTerreno() { const s = deshacer.pop(); if (!s || !T0) { A.pista('No hay nada que deshacer en el terreno.'); return; } T0.alt = s.alt; T0.pin = s.pin; T0.paleta = s.paleta; refrescar(0, 0, T0.nx - 1, T0.nz - 1); guardar(); A.pista('Terreno: deshecho el último trazo.'); }
  /* marcador del pincel */
  const anillo = new T.Mesh(new T.RingGeometry(0.94, 1, 48), new T.MeshBasicMaterial({ color: 0xf07a1a, depthTest: false, transparent: true, opacity: 0.9, side: T.DoubleSide })); anillo.rotation.x = -Math.PI / 2; anillo.renderOrder = 47; anillo.visible = false; A.scene.add(anillo);
  const lineaPrev = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xf07a1a, depthTest: false })); lineaPrev.renderOrder = 47; lineaPrev.frustumCulled = false; A.scene.add(lineaPrev); lineaPrev.visible = false;
  let ultT = 0, pulsado = null;
  function bucle(t?) { requestAnimationFrame(bucle); if (!pulsado || A.herramienta !== 'terreno') return; const dt = Math.min(0.1, (t - ultT) / 1000); ultT = t; if (dt > 0 && ['subir', 'bajar', 'aplanar', 'suavizar', 'zanja', 'pintar'].includes(modo)) pincel(pulsado, dt); }
  requestAnimationFrame(bucle);
  function polPrev(pts?, cursor?) { const l = pts.concat(cursor ? [cursor] : []); if (l.length < 2) { lineaPrev.visible = false; return; } lineaPrev.geometry.setFromPoints(l.map((p?) => new T.Vector3(p.x, (p.y || 0) + 0.3, p.z))); lineaPrev.visible = true; A.marcar(); }
  function crearSueloPoligono(pts?) {
    if (pts.length < 3) return; let cx = 0, cz = 0; pts.forEach((p?) => { cx += p.x / pts.length; cz += p.z / pts.length; }); let area = 0; for (let j = 0; j < pts.length; j++) { const p = pts[j], q = pts[(j + 1) % pts.length]; area += p.x * q.z - q.x * p.z; }
    const xs = pts.map((p?) => p.x), zs = pts.map((p?) => p.z), color = paletaColor(pintarCon), material = pintarCon.startsWith('u:') ? 'pintura' : pintarCon;
    const id = A.crearNuevo('habitacion', { x: cx, y: 0, z: cz, giroY: 0, puntos: pts.map((p?) => [p.x - cx, p.z - cz]), area: Math.abs(area / 2), nombre: 'Suelo de ' + ((MAT[pintarCon] || {}).n || 'material propio').toLowerCase(), material, color, alto: 0, sx: Math.max(...xs) - Math.min(...xs), sy: 0.03, sz: Math.max(...zs) - Math.min(...zs), suelo: true }, pintarCon.startsWith('u:') ? { props: { material: pintarCon } } : null);
    if (id) A.pista('Suelo pintado: ' + A.fmt(Math.abs(area / 2), 1) + ' m². Es un objeto: se mueve, se edita o se borra como cualquier otro.');
  }
  const MODOS = [['pintar', 'Pintar suelo (pincel)'], ['poligono', 'Pintar suelo (polígono)'], ['subir', 'Subir'], ['bajar', 'Bajar'], ['aplanar', 'Aplanar a una altura'], ['suavizar', 'Suavizar'], ['zanja', 'Zanja o hueco'], ['rampa', 'Rampa o talud']];
  E.agregarHerramientaPropia('terreno', {
    n: 'Terreno', ic: 'terreno', pista: 'Arrastra sobre el terreno con el pincel. El anillo naranja es su radio.',
    opciones: (it?) => { modo = it.modo || modo; if (it.material) pintarCon = it.material; est = null; },
    panel: () => {
      const mats = PALETA.concat([...A.efectivos('materiales')].filter(([, m]) => m && m.nombre).map(([id]) => 'u:' + id));
      const pinc = !['poligono', 'rampa'].includes(modo);
      return `<div class="campos"><label class="campo ancho"><span>Modo</span><select data-ter="modo">${MODOS.map(([k, n]) => `<option value="${k}"${k === modo ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        ${pinc ? `<label class="campo"><span>Radio (m)</span><input type="number" data-ter="radio" step="0.5" min="0.5" value="${radio}"></label><label class="campo"><span>Intensidad</span><input type="number" data-ter="fuerza" step="0.1" min="0.1" value="${fuerza}"></label><label class="campo"><span>Suavidad (0–1)</span><input type="number" data-ter="suavidad" step="0.1" min="0" max="1" value="${suavidad}"></label>` : ''}
        ${['aplanar', 'zanja'].includes(modo) ? `<label class="campo"><span>Altura (m)</span><input type="number" data-ter="alturaObj" step="0.1" value="${alturaObj}"></label>` : ''}
        ${modo === 'rampa' ? `<label class="campo"><span>Ancho (m)</span><input type="number" data-ter="ancho" step="0.5" min="1" value="${ancho}"></label><label class="campo"><span>Altura inicio</span><input type="number" data-ter="hA" step="0.1" placeholder="la del terreno"></label><label class="campo"><span>Altura final</span><input type="number" data-ter="hB" step="0.1" placeholder="la del terreno"></label>` : ''}</div>
        ${modo === 'pintar' || modo === 'poligono' ? `<div class="muestras">${mats.map((k?) => `<button class="muestra${k === pintarCon ? ' on' : ''}" data-ter-mat="${esc(k)}"><span class="sw" style="background:${esc(paletaColor(k))}"></span><span>${esc(k.startsWith('u:') ? (A.efectivos('materiales').get(k.slice(2)) || {}).nombre : MAT[k].n)}</span></button>`).join('')}</div><p class="ayuda">Más materiales: pestaña Material → «Nuevo» (con textura importada).</p>` : ''}
        <p class="ayuda">${modo === 'poligono' ? 'Clic en cada esquina; clic en el primer punto o Enter para cerrar.' : modo === 'rampa' ? 'Clic en el inicio y clic en el final de la rampa.' : modo === 'aplanar' ? 'Alt+clic toma la altura del terreno bajo el ratón.' : 'Mantén pulsado y arrastra.'}</p>
        <div class="fila"><button data-ter-acc="deshacer">${svg('deshacer')}Deshacer trazo</button><button data-ter-acc="alturas">${svg('bajar')}Alturas (PNG/RAW)</button><button class="peligro" data-ter-acc="borrar">Borrar terreno</button></div>`;
    },
    down: (e?) => {
      const p = punto(e); if (!p) return;
      if (modo === 'aplanar' && e.altKey) { alturaObj = A.r3(alturaEn(p.x, p.z)); A.renderPanel(); return; }
      if (modo === 'poligono' || modo === 'rampa') return;
      apilarDeshacer(); pulsado = p; ultT = performance.now(); pincel(p, 0.05);
    },
    move: (e?) => {
      const p = punto(e); if (!p) return;
      anillo.visible = !['poligono', 'rampa'].includes(modo); anillo.scale.set(radio, radio, radio); anillo.position.set(p.x, p.y + 0.15, p.z);
      if (pulsado) pulsado = p;
      if (est && est.pts) polPrev(est.pts, p); A.marcar();
    },
    up: (e?, mov?) => {
      const p = punto(e);
      if (pulsado) { pulsado = null; guardar(); return; }
      if (!p || mov > 6) return;
      if (modo === 'poligono') { if (!est) est = { pts: [] }; if (est.pts.length >= 3 && Math.hypot(p.x - est.pts[0].x, p.z - est.pts[0].z) < Math.max(1, radio / 3)) { crearSueloPoligono(est.pts); est = null; polPrev([]); return; } est.pts.push(p.clone()); polPrev(est.pts); return; }
      if (modo === 'rampa') {
        const ha = parseFloat(($('[data-ter="hA"]') || {}).value), hb = parseFloat(($('[data-ter="hB"]') || {}).value);
        if (!est) { est = { pts: [{ x: p.x, z: p.z, y: p.y, h: isFinite(ha) ? ha : alturaEn(p.x, p.z) }] }; polPrev(est.pts); A.pista('Ahora clic en el final de la rampa.'); return; }
        const b = { x: p.x, z: p.z, h: isFinite(hb) ? hb : alturaEn(p.x, p.z) }; apilarDeshacer(); rampa(est.pts[0], b); guardar(); est = null; polPrev([]); A.pista('Rampa de ' + A.fmt(Math.hypot(b.x - p.x, b.z - p.z), 1) + ' m creada.'); return;
      }
    },
    fin: () => { pulsado = null; est = null; anillo.visible = false; polPrev([]); }
  });
  document.addEventListener('change', (e?) => { const k = e.target.dataset && e.target.dataset.ter; if (!k) return; if (k === 'modo') { modo = e.target.value; est = null; polPrev([]); A.renderPanel(); return; } if (['radio', 'fuerza', 'alturaObj', 'ancho', 'suavidad'].includes(k)) { const v = parseFloat(e.target.value); if (isFinite(v)) ({ radio: () => radio = Math.max(0.5, v), fuerza: () => fuerza = Math.max(0.05, v), alturaObj: () => alturaObj = v, ancho: () => ancho = Math.max(1, v), suavidad: () => suavidad = Math.max(0, Math.min(1, v)) })[k](); } });
  document.addEventListener('click', async (e?) => {
    const m = e.target.closest('[data-ter-mat]'); if (m) { pintarCon = m.dataset.terMat; A.renderPanel(); return; }
    const a = e.target.closest('[data-ter-acc]'); if (!a) return;
    if (a.dataset.terAcc === 'deshacer') deshacerTerreno();
    else if (a.dataset.terAcc === 'alturas') exportarAlturas();
    else if (a.dataset.terAcc === 'borrar' && await A.confirmar('¿Borrar el terreno?', 'Se quitan las alturas y la pintura del terreno de este mapa (los suelos con forma se quedan).', 'Borrar')) { A.guardarCol('terreno', docId, null); T0 = null; quitarMalla(); deshacer = []; }
  });
  document.addEventListener('keydown', (e?) => { if (A.herramienta === 'terreno' && modo === 'poligono' && e.key === 'Enter' && est && est.pts.length >= 3 && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { crearSueloPoligono(est.pts); est = null; polPrev([]); } });
  const menuT = [{ h: 'terreno', modo: 'pintar', n: 'Pintar suelo (pincel)', ic: 'pintar' }, { h: 'terreno', modo: 'poligono', n: 'Pintar suelo (polígono)', ic: 'zona' }, { h: 'terreno', modo: 'subir', n: 'Subir (montañas, lomas)', ic: 'terreno' }, { h: 'terreno', modo: 'bajar', n: 'Bajar', ic: 'terreno' }, { h: 'terreno', modo: 'aplanar', n: 'Aplanar a una altura', ic: 'terreno' }, { h: 'terreno', modo: 'suavizar', n: 'Suavizar', ic: 'terreno' }, { h: 'terreno', modo: 'zanja', n: 'Zanja o hueco', ic: 'terreno' }, { h: 'terreno', modo: 'rampa', n: 'Rampa o talud', ic: 'terreno' }];
  menuT.forEach((it?) => E.agregarHerramienta('terreno', it));
  /* ---------- exportación ---------- */
  function mallaExport() { if (!malla) return null; const m = new T.Mesh(malla.geometry.clone(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, alphaTest: 0.5 })); m.name = 'Terreno'; m.userData = { oo_terreno: { x0: T0.x0, z0: T0.z0, paso: T0.paso, nx: T0.nx, nz: T0.nz, base_y: BASE_Y, paleta: T0.paleta } }; return m; }
  function terrenoJSON() { if (!T0) return null; return { x0: T0.x0, z0: T0.z0, paso: T0.paso, nx: T0.nx, nz: T0.nz, base_y: BASE_Y, orden: 'filas de z (sur creciente), cada fila de x (este creciente)', alturas: Array.from(T0.alt, (v: any) => Math.round(v * 100) / 100), paleta: T0.paleta, pintura: Array.from(T0.pin), pintura_sin: SIN, nota: 'pintura = índice en paleta; 255 = sin tocar (no se dibuja si además la altura es 0)' }; }
  function descargar(datos?, nombre?, tipo?) { const blob = datos instanceof Blob ? datos : new Blob([datos], { type: tipo || 'application/octet-stream' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  /* PNG de 8 bits (min-max), RAW de 16 bits cuadrado (257/513/1025, como pide Unity) y JSON con la escala */
  function alturas() {
    if (!T0) return null; let mn = Infinity, mx = -Infinity; for (const v of T0.alt) { mn = Math.min(mn, v); mx = Math.max(mx, v); } if (mx - mn < 0.01) mx = mn + 0.01;
    const lado = Math.max((T0.nx - 1), (T0.nz - 1)) * T0.paso, S = [129, 257, 513, 1025].find((s?) => s >= Math.max(T0.nx, T0.nz)) || 1025;
    const raw = new Uint16Array(S * S); const cv = document.createElement('canvas'); cv.width = S; cv.height = S; const g = cv.getContext('2d'), img = g.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const x = T0.x0 + i / (S - 1) * lado, z = T0.z0 + j / (S - 1) * lado; const h = alturaEn(x, z), u = (h - mn) / (mx - mn); raw[(S - 1 - j) * S + i] = Math.round(u * 65535); const o = (j * S + i) * 4, b = Math.round(u * 255); img.data[o] = img.data[o + 1] = img.data[o + 2] = b; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0);
    return { cv, raw, meta: { formato: 'oo-alturas', mapa: A.mapa, resolucion: S, lado_m: lado, x0: T0.x0, z0: T0.z0, altura_min: A.r3(mn), altura_max: A.r3(mx), base_y: BASE_Y, png: 'gris 8 bits: 0 = altura_min, 255 = altura_max; fila 0 = z0 (norte)', r16: 'RAW 16 bits little-endian, fila 0 = sur (como Unity: Terrain → Import Raw, Byte Order Windows, Flip vertically desactivado); tamaño del terreno = lado_m × (altura_max − altura_min) × lado_m' } };
  }
  function exportarAlturas() {
    const r = alturas(); if (!r) { A.pista('Todavía no hay terreno: usa una herramienta de Terreno primero.'); return; }
    const base = 'terreno_' + A.mapa; r.cv.toBlob((b?) => descargar(b, base + '_alturas.png'), 'image/png');
    setTimeout(() => descargar(new Blob([r.raw.buffer]), base + '_' + r.meta.resolucion + '.r16'), 300);
    setTimeout(() => descargar(JSON.stringify(r.meta, null, 1), base + '_alturas.json', 'application/json'), 600);
    A.pista('Alturas exportadas: PNG, RAW de 16 bits (' + r.meta.resolucion + ' px) y JSON con la escala.');
  }
  document.addEventListener('click', (e?) => { if (e.target.closest('[data-a="exp-alturas"]')) exportarAlturas(); });
  E.on('mapa', () => { deshacer = []; cargar(); });
  E.on('col', (c?) => { if (c === 'terreno' && !pulsado) { const d = A.efectivos('terreno').get('hm-' + A.mapa); if (!d && T0 && !malla) return; if (d && (!T0 || d.actualizado !== (T0.act || null))) { cargar(); if (T0) T0.act = d.actualizado; } } });
  /* (2.1 pro f5) para terreno_pro.js y las pruebas: pincel con parámetros, refresco de una zona, guardado y deshacer del terreno */
  const pincelCon = (p?, dt?, o?) => { const g = { modo, radio, fuerza, suavidad, alturaObj }; o = o || {}; if (o.modo) modo = o.modo; if (o.radio) radio = o.radio; if (o.fuerza) fuerza = o.fuerza; if (o.suavidad != null) suavidad = o.suavidad; if (o.alturaObj != null) alturaObj = o.alturaObj; try { pincel(p, dt); } finally { ({ modo, radio, fuerza, suavidad, alturaObj } = g); } };
  const parametros = () => ({ modo, radio, fuerza, suavidad, alturaObj, pintarCon });
  window.OOTerreno = { mallaExport, terrenoJSON, alturas, exportarAlturas, alturaEn, datos: () => T0, cargar, pincel: pincelCon, caida, parametros, refrescar: () => { if (T0) refrescar(0, 0, T0.nx - 1, T0.nz - 1); }, refrescarZona: (i0?, j0?, i1?, j1?) => refrescar(i0, j0, i1, j1), guardar, asegurar, apilarDeshacer, deshacer: deshacerTerreno, rampa };
})();
