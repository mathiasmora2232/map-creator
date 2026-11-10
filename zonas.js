/* Editor del mapa (2.1, editor v2): zonas.
   Una zona es un rectángulo o polígono en planta con nombre (colección «zonas»: {mapa, nombre, puntos [[x,z]…], color, oculta, aislada}).
   - Herramienta «Zonas» (barra de la izquierda): rectángulo arrastrando, o polígono con un clic por esquina (clic en el primer punto
     o «Cerrar zona» para terminar).
   - Panel «Zonas»: ver qué objetos contiene, seleccionarlos, encuadrar, ocultar o aislar, exportar solo esa zona (GLB, JSON, Godot),
     replicarla en otro sitio (clic donde va la copia) o crear un prefab con ella. Importar una zona: menú Exportar → Importar. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const COLORES = ['#f07a1a', '#5aa0ff', '#46c25a', '#e5484d', '#b07cff', '#e3c13a'];
  let modo = 'rect', est = null, zonaSel = null, cache = new Map();
  const lista = () => [...A.efectivos('zonas')].filter(([, z]) => z && z.mapa === A.mapa && Array.isArray(z.puntos) && z.puntos.length >= 3).map(([id, z]) => Object.assign({ id }, z));
  function dentro(x, z, pts) { let d = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d; } return d; }
  function caja(pts) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; }
  /* qué contiene: piezas del mapa por su centro y objetos nuevos por su punto de apoyo */
  function contenido(z) {
    if (cache.has(z.id)) return cache.get(z.id);
    const [x0, z0, x1, z1] = caja(z.puntos), keys = [];
    const P = A.P;
    for (let i = 0; i < A.N; i++) { const p = P[i]; if (p.del) continue; const x = p.p.x, zz = p.p.z; if (x < x0 || x > x1 || zz < z0 || zz > z1) continue; if (dentro(x, zz, z.puntos)) keys.push('p' + i); }
    for (const o of E.nuevos().values()) { const x = +o.datos.x, zz = +o.datos.z; if (x >= x0 && x <= x1 && zz >= z0 && zz <= z1 && dentro(x, zz, z.puntos)) keys.push('n' + o.id); }
    const s = { keys, set: new Set(keys) }; cache.set(z.id, s); return s;
  }
  /* ocultar o aislar */
  let zsAct = null; // zonas con ocultar/aislar activos (se recalcula al cambiar las zonas o el mapa)
  const activas = () => zsAct || (zsAct = lista().filter(z => z.oculta || z.aislada));
  E.filtrosVis.push(k => {
    const zs = activas(); if (!zs.length) return true;
    const ais = zs.filter(z => z.aislada);
    if (ais.length && !ais.some(z => contenido(z).set.has(k))) return false;
    for (const z of zs) if (z.oculta && contenido(z).set.has(k)) return false;
    return true;
  });
  /* dibujo en la escena */
  const grupo = new T.Group(); grupo.name = 'zonas'; A.scene.add(grupo);
  const previa = new T.Group(); A.scene.add(previa);
  function limpiar(g) { while (g.children.length) { const c = g.children[0]; g.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } } }
  function etiqueta(txt, color) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g = cv.getContext('2d');
    g.font = '600 46px "IBM Plex Sans", Arial'; const w = Math.min(500, g.measureText(txt).width + 40);
    g.fillStyle = color; g.beginPath(); g.roundRect ? g.roundRect((512 - w) / 2, 14, w, 68, 14) : g.rect((512 - w) / 2, 14, w, 68); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 256, 50);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false, transparent: true })); sp.renderOrder = 45; return sp;
  }
  function dibujar() {
    limpiar(grupo);
    for (const z of lista()) {
      const col = z.color || COLORES[0], sel = z.id === zonaSel, y = 0.25;
      const pts = z.puntos.map(([x, zz]) => new T.Vector3(x, y, zz));
      const ln = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: col, dashSize: sel ? 100 : 2, gapSize: sel ? 0 : 1, depthTest: false, transparent: true }));
      ln.computeLineDistances(); ln.renderOrder = 44; ln.frustumCulled = false; grupo.add(ln);
      const sh = new T.Shape(z.puntos.map(([x, zz]) => new T.Vector2(x, -zz)));
      const geo = new T.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); geo.translate(0, y - 0.05, 0);
      const fill = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: sel ? 0.16 : 0.07, depthWrite: false, side: T.DoubleSide })); fill.renderOrder = 3; grupo.add(fill);
      const [x0, z0, x1, z1] = caja(z.puntos), tam = Math.max(8, Math.min(60, Math.max(x1 - x0, z1 - z0) * 0.35));
      const sp = etiqueta(z.nombre + (z.oculta ? ' (oculta)' : z.aislada ? ' (aislada)' : ''), col); sp.position.set((x0 + x1) / 2, 4 + tam * 0.1, (z0 + z1) / 2); sp.scale.set(tam, tam * 96 / 512, 1); grupo.add(sp);
    }
    A.marcar();
  }
  function previaPts(pts, cerrar) {
    limpiar(previa); if (pts.length < 2) { A.marcar(); return; }
    const l = new (cerrar ? T.LineLoop : T.Line)(new T.BufferGeometry().setFromPoints(pts.map(p => new T.Vector3(p[0], 0.3, p[1]))), new T.LineBasicMaterial({ color: 0xf07a1a, depthTest: false })); l.renderOrder = 46; l.frustumCulled = false; previa.add(l); A.marcar();
  }
  /* herramienta */
  function crear(pts) {
    const n = lista().length + 1, id = 'z-' + A.mapa + '-' + Date.now().toString(36);
    A.guardarCol('zonas', id, { mapa: A.mapa, nombre: 'Zona ' + n, puntos: pts.map(([x, z]) => [A.r3(x), A.r3(z)]), color: COLORES[(n - 1) % COLORES.length], oculta: false, aislada: false, creado: A.ahora() });
    zonaSel = id; A.ponerHerramienta('sel'); A.mostrarTab('zonas', true); if (window.OOUI) OOUI.mostrarPanel('zonas', true);
    setTimeout(() => { const c = contenido(Object.assign({ id }, A.efectivos('zonas').get(id))); A.pista('Zona creada con ' + c.keys.length + ' objetos dentro. Cámbiale el nombre en el panel Zonas.'); }, 80);
  }
  function terminarPoligono() { if (est && est.pts && est.pts.length >= 3) { const p = est.pts; est = null; limpiar(previa); crear(p); } else A.pista('Hacen falta al menos 3 esquinas.'); }
  E.agregarHerramientaPropia('zona', {
    n: 'Zona', ic: 'zona', pista: 'Rectángulo: arrastra en el suelo. Polígono: clic en cada esquina y clic en el primer punto (o «Cerrar zona»).',
    opciones: it => { modo = it.modo || 'rect'; est = null; },
    panel: () => `<div class="fila"><div class="seg"><button data-zona-modo="rect" class="${modo === 'rect' ? 'on' : ''}">Rectángulo</button><button data-zona-modo="poligono" class="${modo === 'poligono' ? 'on' : ''}">Polígono</button></div>${modo === 'poligono' ? '<button data-zona-cerrar>Cerrar zona</button>' : ''}</div>`,
    down: e => { if (modo !== 'rect') return; const p = A.puntoSuelo(e); if (p) est = { a: p }; },
    move: e => {
      const p = A.puntoSuelo(e); if (!p) return;
      if (modo === 'rect' && est && est.a) { const a = est.a; previaPts([[a.x, a.z], [p.x, a.z], [p.x, p.z], [a.x, p.z]], true); }
      else if (modo === 'poligono' && est && est.pts) previaPts(est.pts.concat([[p.x, p.z]]), false);
    },
    up: (e, mov) => {
      const p = A.puntoSuelo(e); if (!p) return;
      if (modo === 'rect') { if (!est || !est.a) return; const a = est.a; est = null; limpiar(previa); if (Math.abs(p.x - a.x) < 1 || Math.abs(p.z - a.z) < 1) { A.pista('Arrastra un rectángulo más grande.'); return; } crear([[Math.min(a.x, p.x), Math.min(a.z, p.z)], [Math.max(a.x, p.x), Math.min(a.z, p.z)], [Math.max(a.x, p.x), Math.max(a.z, p.z)], [Math.min(a.x, p.x), Math.max(a.z, p.z)]]); return; }
      if (mov > 6) return;
      if (!est || !est.pts) est = { pts: [] };
      if (est.pts.length >= 3 && Math.hypot(p.x - est.pts[0][0], p.z - est.pts[0][1]) < 2) { terminarPoligono(); return; }
      est.pts.push([p.x, p.z]); previaPts(est.pts, false);
    },
    fin: () => { est = null; limpiar(previa); }
  });
  /* replicar: clic donde va la copia */
  let replicando = null;
  E.agregarHerramientaPropia('zona-replicar', {
    n: 'Replicar zona', ic: 'zona', pista: 'Clic en el mapa donde quieres el centro de la copia. Esc para cancelar.',
    up: (e, mov) => {
      if (mov > 6 || !replicando) return; const p = A.puntoSuelo(e); if (!p) return; const z = replicando; replicando = null;
      const keys = contenido(z).keys.filter(k => k[0] === 'n' || !A.P[+k.slice(1)].del); const its = A.plantillas(keys); if (!its.length) { A.pista('La zona está vacía.'); return; }
      const c = its.reduce((s, it) => [s[0] + +it.datos.x / its.length, s[1] + +it.datos.z / its.length], [0, 0]); const dx = p.x - c[0], dz = p.z - c[1];
      A.pegarPlantillas(its, { x: p.x, z: p.z });
      const id = 'z-' + A.mapa + '-' + Date.now().toString(36); A.guardarCol('zonas', id, Object.assign({}, z, { id: undefined, nombre: z.nombre + ' (copia)', puntos: z.puntos.map(([x, zz]) => [A.r3(x + dx), A.r3(zz + dz)]), oculta: false, aislada: false, creado: A.ahora() }));
      A.ponerHerramienta('sel'); A.pista('Zona replicada: ' + its.length + ' objeto(s) nuevos. Las piezas del mapa original se copian como una caja editable.');
    },
    fin: () => { replicando = null; }
  });
  E.agregarMenu({ id: 'zonas', n: 'Zonas', ic: 'zona', antes: 'notas', items: [{ h: 'zona', modo: 'rect', n: 'Zona rectangular', ic: 'zona' }, { h: 'zona', modo: 'poligono', n: 'Zona poligonal', ic: 'zona' }, { fn: () => { A.mostrarTab && OOUI.mostrarPanel('zonas', true); }, n: 'Panel de zonas', ic: 'lista' }] });
  /* panel */
  function seleccionar(id) { zonaSel = id; OOUI.mostrarPanel('zonas', true); render(); dibujar(); const z = lista().find(x => x.id === id); if (z) { const [x0, z0, x1, z1] = caja(z.puntos); A.encuadrarCaja(new T.Box3(new T.Vector3(x0, 0, z0), new T.Vector3(x1, 5, z1))); } }
  function render() {
    const el = $('#listaZonas'); if (!el) return; const zs = lista();
    el.innerHTML = `<div class="fila"><button data-zona-nueva="rect">${svg('zona')}Nueva rectangular</button><button data-zona-nueva="poligono">Poligonal</button><button data-a="imp-zona">${svg('subir')}Importar</button></div>` + (zs.map(z => {
      const c = contenido(z), [x0, z0, x1, z1] = caja(z.puntos);
      return `<details class="zona${z.id === zonaSel ? ' sel' : ''}" data-zona="${esc(z.id)}"${z.id === zonaSel ? ' open' : ''}><summary><i class="punto" style="background:${esc(z.color || '#f07a1a')}"></i><input type="text" value="${esc(z.nombre)}" data-zona-nombre aria-label="Nombre de la zona"><small>${c.keys.length}</small>
        <button class="bi" data-zona-acc="ocultar" title="${z.oculta ? 'Mostrar' : 'Ocultar'} lo que hay dentro">${svg(z.oculta ? 'ojoNo' : 'ojo')}</button><button class="bi${z.aislada ? ' on' : ''}" data-zona-acc="aislar" title="Aislar: ver solo esta zona">${svg('objeto')}</button></summary>
        <p class="ayuda">${A.fmt(x1 - x0, 1)} × ${A.fmt(z1 - z0, 1)} m · ${c.keys.filter(k => k[0] === 'p').length} piezas del mapa, ${c.keys.filter(k => k[0] === 'n').length} objetos nuevos.</p>
        <div class="fila"><button data-zona-acc="sel">Seleccionar contenido</button><button data-zona-acc="encuadrar">Encuadrar</button><button data-zona-acc="replicar">Replicar…</button><button data-zona-acc="prefab">Crear prefab</button></div>
        <div class="fila"><button data-zona-acc="glb">${svg('bajar')}GLB</button><button data-zona-acc="godot">Godot</button><button data-zona-acc="json">JSON</button><input type="color" value="${esc(z.color || '#f07a1a')}" data-zona-color title="Color"><button class="peligro" data-zona-acc="borrar">Borrar zona</button></div></details>`;
    }).join('') || '<p class="ayuda">No hay zonas en este mapa. Dibuja una con el botón de arriba o la herramienta Zonas.</p>');
  }
  const guardarZ = (id, cambios) => { const z = A.efectivos('zonas').get(id); if (z) A.guardarCol('zonas', id, Object.assign({}, z, cambios, { actualizado: A.ahora() })); };
  document.addEventListener('click', async e => {
    const nv = e.target.closest('[data-zona-nueva]'); if (nv) { modo = nv.dataset.zonaNueva; A.ponerHerramienta('zona', { forzar: true }); return; }
    const md = e.target.closest('[data-zona-modo]'); if (md) { modo = md.dataset.zonaModo; est = null; A.renderPanel(); return; }
    if (e.target.closest('[data-zona-cerrar]')) { terminarPoligono(); return; }
    const b = e.target.closest('[data-zona-acc]'); if (!b) return; e.preventDefault();
    const id = b.closest('[data-zona]').dataset.zona, z = lista().find(x => x.id === id); if (!z) return; zonaSel = id;
    const keys = () => contenido(z).keys.filter(A.existe);
    switch (b.dataset.zonaAcc) {
      case 'ocultar': guardarZ(id, { oculta: !z.oculta }); break;
      case 'aislar': guardarZ(id, { aislada: !z.aislada }); break;
      case 'sel': A.seleccionar(A.expandirGrupos(keys()).filter(A.seleccionable)); break;
      case 'encuadrar': seleccionar(id); break;
      case 'replicar': replicando = z; A.ponerHerramienta('zona-replicar', { forzar: true }); break;
      case 'prefab': A.seleccionar(keys()); E.api.mostrarTab('obj'); document.querySelector('[data-a="ctx-componente"]') ? document.querySelector('[data-a="ctx-componente"]').click() : null; break;
      case 'glb': if (window.OOExportar) OOExportar.exportarGLB(keys(), z.nombre, z); break;
      case 'godot': if (window.OOExportar) OOExportar.exportarGodot(keys(), z.nombre, z); break;
      case 'json': if (window.OOExportar) OOExportar.exportarJSON(keys(), z.nombre, z); break;
      case 'borrar': if (await A.confirmar('¿Borrar la zona «' + z.nombre + '»?', 'Solo se borra el contorno; lo que hay dentro se queda.', 'Borrar')) { A.guardarCol('zonas', id, null); zonaSel = null; } break;
    }
  });
  document.addEventListener('change', e => {
    const n = e.target.closest('[data-zona-nombre]'); if (n) { guardarZ(n.closest('[data-zona]').dataset.zona, { nombre: n.value.trim() || 'Zona' }); return; }
    const c = e.target.closest('[data-zona-color]'); if (c) guardarZ(c.closest('[data-zona]').dataset.zona, { color: c.value });
  });
  document.addEventListener('keydown', e => { if (A.herramienta === 'zona' && modo === 'poligono' && e.key === 'Enter' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) terminarPoligono(); });
  let pend = 0; const programar = () => { if (pend) return; pend = setTimeout(() => { pend = 0; render(); }, 150); };
  E.on('col', c => { if (c === 'zonas') { cache.clear(); zsAct = null; dibujar(); render(); A.renderTodo(); if (window.OOJerarquia) OOJerarquia.programar(); } });
  E.on('recompute', () => { zsAct = null; const activo = activas().length > 0; cache.clear(); if (activo) A.renderTodo(); programar(); });
  E.on('mapa', () => { cache.clear(); zsAct = null; dibujar(); render(); });
  window.OOZonas = { lista: () => lista().map(z => Object.assign({ n: contenido(z).keys.length }, z)), contenido, seleccionar, alternarOculta: id => { const z = lista().find(x => x.id === id); if (z) guardarZ(id, { oculta: !z.oculta }); }, dibujar, render };
})();
