/* Editor del mapa (2.1, Map Editor Pro fase 2): asas de edición directa en la vista (como en Los Sims y SketchUp).
   Otros módulos registran proveedores: OOAsas.registrar(sel => [{pos: Vector3, tipo: 'vertical' | 'plano', color, mover(p, e), soltar(), titulo}]).
   - 'vertical': se arrastra arriba y abajo por la recta vertical del asa (elevar una fundación).
   - 'plano': se arrastra por el plano horizontal a la altura `y` del asa (o `planoY`), con las inferencias del editor si `inferir` es
     true (extremos de paredes, ejes, guías, rejilla) y, si se da `base`, con los ejes desde ese punto.
   El clic en un asa no llega al editor (ni selecciona, ni orbita, ni mueve el gizmo). Esc durante el arrastre lo cancela (`cancelar()`). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3;
  const proveedores = [];
  const grupo = new T.Group(); grupo.renderOrder = 60; A.scene.add(grupo);
  const geoS = new T.SphereGeometry(1, 16, 12), geoC = new T.ConeGeometry(0.8, 1.6, 16);
  let asas = [], arr = null, tRefresco = 0;
  function limpiar() { while (grupo.children.length) { const m = grupo.children.pop(); if (m.material) m.material.dispose(); } }
  function actualizar() {
    limpiar(); asas = [];
    if (arr || A.herramienta !== 'sel' || A.vista === 'caminar' || !A.sel.length) { A.marcar(); return; }
    for (const p of proveedores) { try { const l = p(A.sel); if (l) asas.push(...l); } catch (e) { console.warn('asas', e); } }
    for (const a of asas) {
      const mat = new T.MeshBasicMaterial({ color: a.color || 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
      const m = new T.Mesh(a.tipo === 'vertical' ? geoC : geoS, mat); m.renderOrder = 61; m.position.copy(a.pos); m.userData.asa = a; a.malla = m; grupo.add(m);
      const borde = new T.Mesh(geoS, new T.MeshBasicMaterial({ color: 0x1b1f24, depthTest: false, transparent: true, opacity: 0.5 })); borde.renderOrder = 60; borde.scale.setScalar(1.25); if (a.tipo !== 'vertical') m.add(borde);
    }
    escalar(); A.marcar();
  }
  function escalar() { for (const a of asas) if (a.malla) { const k = Math.max(0.05, 7 * A.metrosPorPixel(a.malla.position)); if (Math.abs(a.malla.scale.x - k) > k * 0.02) { a.malla.scale.setScalar(k); A.marcar(); } } }
  (function bucle() { if (asas.length) escalar(); requestAnimationFrame(bucle); })();
  function programar() { if (tRefresco) return; tRefresco = setTimeout(() => { tRefresco = 0; actualizar(); }, 0); }
  ['seleccion', 'recompute', 'herramienta', 'vista'].forEach(ev => E.on(ev, programar));

  function asaBajo(e) {
    const r = A.dom.getBoundingClientRect(); let mejor = null, md = 13;
    for (const a of asas) { const v = a.malla.position.clone().project(A.cam); if (v.z > 1) continue; const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height; const d = Math.hypot(e.clientX - x, e.clientY - y); if (d < md) { md = d; mejor = a; } }
    return mejor;
  }
  function puntoVertical(e, p0) {
    const ray = A.rayDe(e).ray; /* punto de la recta vertical por p0 más cercano al rayo */
    const u = new V3(0, 1, 0), w0 = p0.clone().sub(ray.origin), b = u.dot(ray.direction), d = u.dot(w0), ee = ray.direction.dot(w0), den = 1 - b * b;
    if (Math.abs(den) < 1e-6) return null; const s = (b * ee - d) / den; return p0.clone().addScaledVector(u, s);
  }
  function puntoPlano(e, a) {
    const y = a.planoY != null ? a.planoY : a.pos.y;
    if (typeof a.inferir === 'function') { const p = a.inferir(e, y); if (p) return p; }
    else if (a.inferir) { const inf = A.inferir(e, a.base || null, { y }); if (inf) return inf.p.clone(); }
    const p = A.puntoPlano(e, y); if (p && A.AJ.ajuste) { const s = A.AJ.paso || 0.25; p.x = Math.round(p.x / s) * s; p.z = Math.round(p.z / s) * s; }
    return p;
  }
  A.vistaEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target !== A.dom || !asas.length || A.herramienta !== 'sel') return;
    const a = asaBajo(e); if (!a) return;
    e.stopImmediatePropagation(); e.preventDefault();
    arr = { a, p0: a.pos.clone(), id: e.pointerId }; A.dom.style.cursor = 'grabbing';
    if (a.empezar) try { a.empezar(); } catch (er) { console.warn(er); }
  }, true);
  window.addEventListener('pointermove', e => {
    if (!arr) { if (asas.length && e.target === A.dom && A.herramienta === 'sel') { const a = asaBajo(e); A.dom.style.cursor = a ? 'grab' : ''; if (a && a.titulo) A.dom.title = a.titulo; else A.dom.title = ''; } return; }
    const a = arr.a; const p = a.tipo === 'vertical' ? puntoVertical(e, arr.p0) : puntoPlano(e, a); if (!p) return;
    try { a.mover(p, e); } catch (er) { console.warn(er); }
    if (a.malla) { a.malla.position.copy(a.tipo === 'vertical' ? new V3(arr.p0.x, p.y, arr.p0.z) : p.clone().setY(a.pos.y)); A.marcar(); }
  }, true);
  window.addEventListener('pointerup', e => {
    if (!arr) return; const a = arr.a; arr = null; A.dom.style.cursor = ''; A.ocultarInferencia();
    e.stopImmediatePropagation();
    try { if (a.soltar) a.soltar(); } catch (er) { console.warn(er); }
    programar();
  }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && arr) { const a = arr.a; arr = null; A.dom.style.cursor = ''; try { if (a.cancelar) a.cancelar(); } catch (er) { } e.stopImmediatePropagation(); A.recompute(); } }, true);

  window.OOAsas = { registrar: f => { proveedores.push(f); programar(); }, actualizar, lista: () => asas.map(a => ({ id: a.id, tipo: a.tipo, pos: a.pos.toArray() })), get arrastrando() { return !!arr; } };
})();
