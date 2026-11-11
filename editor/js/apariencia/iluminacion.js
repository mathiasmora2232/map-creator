/* Editor del mapa (2.1, editor v2): pestaña «Iluminación» del inspector y luces reales en la vista.
   - Las luces son objetos «luz» (los de siempre del catálogo) con más datos: tipoLuz (puntual o foco), color, intensidad, alcance,
     ángulo del foco, inclinación hacia abajo, sombras y encendida. Se editan aquí y se guardan con deshacer.
   - En la vista se encienden como luces reales de three.js (las más cercanas a la cámara, hasta 12; con sombra hasta 4), y también,
     si se quiere, las luces del mapa original. Se notan sobre todo de tarde o de noche (Ambiente).
   - Sombras: el interruptor general está aquí y en Ambiente; por objeto, en Propiedades (recibe / proyecta). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const MAX = 12, MAX_SOMBRA = 4;
  let verMapa = false; try { verMapa = localStorage.getItem('oo-editor-lucesmapa') === '1'; } catch (e) { }
  const grupo = new T.Group(); grupo.name = 'lucesReales'; A.scene.add(grupo);
  const reserva = []; // luces reutilizables
  const luzDe = o => { const d = o.datos; return { tipo: d.tipoLuz === 'foco' ? 'foco' : 'puntual', color: d.color || '#ffe8b0', intensidad: d.intensidad == null ? 1.2 : +d.intensidad, alcance: +d.alcance || 10, angulo: +d.angulo || 45, inclinacion: d.inclinacion == null ? 90 : +d.inclinacion, sombras: !!d.sombras, encendida: d.encendida !== false, pos: new T.Vector3(+d.x || 0, (+d.y || 0) + (+d.altura || 2.6) - 0.2, +d.z || 0), giro: (+d.giroY || 0) * A.DEG }; };
  function fuentes() {
    const l = [];
    for (const o of E.nuevos().values()) if (A.tipoBase(o.tipo) === 'luz' && A.visible && o.partes && o.partes.length) l.push(Object.assign({ k: 'n' + o.id }, luzDe(o)));
    if (verMapa && A.P) for (let i = 0; i < A.N; i++) { const z = A.P[i]; if (z.cat === 'luz' && !z.del) l.push({ k: 'p' + i, tipo: 'puntual', color: '#' + z.c.getHexString(), intensidad: 1, alcance: Math.max(2, +z.raw[0] || 8), sombras: false, encendida: true, pos: z.p.clone() }); }
    return l.filter(x => x.encendida);
  }
  let lista = [];
  function actualizar() {
    lista = fuentes();
    const c = A.vista === 'planta' ? A.ctlP.target : A.vista === 'caminar' ? A.camP.position : A.ctl3.target;
    lista.sort((a, b) => a.pos.distanceToSquared(c) - b.pos.distanceToSquared(c));
    const usar = lista.slice(0, MAX); let sombras = 0;
    while (grupo.children.length) reserva.push(grupo.children.pop());
    for (const f of usar) {
      let l;
      if (f.tipo === 'foco') { l = new T.SpotLight(f.color, f.intensidad * 2, f.alcance, Math.min(85, f.angulo) * A.DEG, 0.35, 1.6); const dir = new T.Vector3(Math.sin(f.giro) * Math.cos(f.inclinacion * A.DEG), -Math.sin(f.inclinacion * A.DEG), Math.cos(f.giro) * Math.cos(f.inclinacion * A.DEG)); l.target.position.copy(f.pos).add(dir); grupo.add(l.target); }
      else l = new T.PointLight(f.color, f.intensidad * 2, f.alcance, 1.6);
      l.position.copy(f.pos); l.userData.k = f.k;
      if (f.sombras && sombras < MAX_SOMBRA && A.AJ.sombras && A.AJ.calidad !== 'baja') { l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002; sombras++; }
      grupo.add(l);
    }
    // cambia el número de luces: los materiales tienen que recompilarse
    if (grupo.userData.n !== grupo.children.length) { grupo.userData.n = grupo.children.length; A.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); }); }
    A.marcar();
  }
  let pend = 0; const programar = () => { if (pend) return; pend = setTimeout(() => { pend = 0; actualizar(); }, 80); };
  E.on('render', programar); E.on('mapa', programar);
  /* ---------- pestaña ---------- */
  const campo = (k, l, tipo, v, extra) => tipo === 'sel' ? `<label class="campo"><span>${l}</span><select data-luz="${k}">${extra.map(([a, b]) => `<option value="${a}"${String(v) === String(a) ? ' selected' : ''}>${b}</option>`).join('')}</select></label>` : tipo === 'chk' ? `<label class="chk"><input type="checkbox" data-luz="${k}" ${v ? 'checked' : ''}> ${l}</label>` : tipo === 'color' ? `<label class="campo"><span>${l}</span><input type="color" data-luz="${k}" value="${esc(v)}"></label>` : `<label class="campo"><span>${l}</span><input type="number" data-luz="${k}" step="${extra || 0.1}" value="${v}"></label>`;
  function luzSel() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && A.tipoBase(o.tipo) === 'luz' ? o : null; }
  function pintar() {
    const el = $('#insLuz'); if (!el) return; const o = luzSel(); let h = '';
    if (o) {
      const f = luzDe(o), d = o.datos;
      h += `<h2>${svg('bombilla')} ${esc(A.nombreEntidades(A.sel))}</h2><div class="campos">` + campo('tipoLuz', 'Tipo', 'sel', f.tipo, [['puntual', 'Puntual'], ['foco', 'Foco']]) + campo('color', 'Color', 'color', f.color) + campo('intensidad', 'Intensidad', 'num', f.intensidad, 0.1) + campo('alcance', 'Alcance (m)', 'num', f.alcance, 0.5) + campo('altura', 'Altura (m)', 'num', +d.altura || 2.6, 0.1) + (f.tipo === 'foco' ? campo('angulo', 'Apertura (°)', 'num', f.angulo, 1) + campo('inclinacion', 'Inclinación hacia abajo (°)', 'num', f.inclinacion, 5) : '') + '</div>' +
        campo('sombras', 'Proyecta sombras', 'chk', f.sombras) + campo('encendida', 'Encendida', 'chk', f.encendida) +
        `<p class="ayuda">Para que se encienda y apague con un interruptor en el juego, añade el comportamiento «Luz con interruptor» en la pestaña Más.</p>`;
    } else h += '<p class="ayuda">Selecciona una luz para editarla, o añade una donde mira la cámara.</p>';
    h += `<div class="fila"><button data-luz-nueva="puntual">${svg('bombilla')}Añadir luz puntual</button><button data-luz-nueva="foco">${svg('bombilla')}Añadir foco</button></div>
      <h3>Escena</h3><label class="chk"><input type="checkbox" data-luz-glob="sombras" ${A.AJ.sombras ? 'checked' : ''}> Sombras (sol, luna y luces)</label>
      <label class="chk"><input type="checkbox" data-luz-glob="mapa" ${verMapa ? 'checked' : ''}> Encender las luces del mapa original</label>
      <p class="ayuda">${lista.length} luces encendidas; se ven las ${Math.min(MAX, lista.length)} más cercanas a la cámara. Prueba de tarde o de noche (botón del sol).</p>
      <ul class="lista">${lista.slice(0, 30).map(f => `<li class="cambio"><button class="ir" data-luz-ir="${esc(f.k)}"><span><span class="punto" style="background:${esc(f.color)}"></span> ${esc(f.k[0] === 'n' ? A.nombreEntidades([f.k]) : 'Luz del mapa')} <small>${f.tipo} · ${A.fmt(f.alcance, 1)} m</small></span></button></li>`).join('')}</ul>`;
    el.innerHTML = h;
  }
  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.luz;
    if (k) { const o = luzSel(); if (!o) return; let v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value; if (e.target.type === 'number' && !isFinite(v)) return; o.datos[k] = v; const doc = A.docActualizado(o); if (doc) A.guardar([doc]); return; }
    const gk = e.target.dataset && e.target.dataset.luzGlob;
    if (gk === 'sombras') A.ponerAjuste('sombras', e.target.checked);
    if (gk === 'mapa') { verMapa = e.target.checked; try { localStorage.setItem('oo-editor-lucesmapa', verMapa ? '1' : '0'); } catch (er) { } actualizar(); pintar(); }
  });
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-luz-nueva]'); if (n) { const t = A.vista === 'planta' ? A.ctlP.target : A.ctl3.target; const id = A.crearNuevo('luz', { x: t.x, y: 0, z: t.z, giroY: 0, altura: n.dataset.luzNueva === 'foco' ? 4 : 2.8, alcance: n.dataset.luzNueva === 'foco' ? 18 : 10, color: '#ffe2b0', tipoLuz: n.dataset.luzNueva, intensidad: 1.2, angulo: 40, inclinacion: 70, sombras: false, encendida: true }); if (id) { A.seleccionar(['n' + id], { sinTab: true }); A.mostrarTab('luz', true); } return; }
    const ir = e.target.closest('[data-luz-ir]'); if (ir) { const k = ir.dataset.luzIr; A.seleccionar([k], { sinTab: true }); A.encuadrarCaja(A.cajaEntidades([k])); }
  });
  E.on('tab', t => { if (t === 'luz') pintar(); });
  E.on('seleccion', () => { const p = document.querySelector('[data-panel="luz"]'); if (p && !p.hidden) pintar(); });
  E.on('recompute', () => { const p = document.querySelector('[data-panel="luz"]'); if (p && !p.hidden && !document.querySelector('#insLuz input:focus')) pintar(); });
  window.OOLuces = { actualizar, lista: () => lista, pintar };
})();
