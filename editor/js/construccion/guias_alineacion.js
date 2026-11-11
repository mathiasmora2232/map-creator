/* Editor del mapa: guías de alineación (como las «guías inteligentes» de los programas de diseño).
   - Al mover con el gizmo: si un borde o el centro de lo que arrastras (en X o en Z) coincide con el borde o el centro de otro objeto
     cercano, aparece una línea discontinua (rosa = alineado en X, azul = en Z) y se imanta a esa posición (a menos de 8 cm).
   - Al girar: la pista dice el ángulo y si está recto («Recto ✓» en 0°, 90°, 180° o 270°); a menos de 2° se imanta a recto.
   - Ctrl mientras arrastras: libre, sin imán (las líneas siguen saliendo si queda alineado exacto).
   Se activa o desactiva con «Guías» en la ventana «Imán y selección» (AJ.iman.guias). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !window.OOTransformar || !E.api.scene) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG;
  const IMAN = 0.08, EXACTO = 0.004, IMAN_GIRO = 2 * DEG, RADIO = 30;
  const grupo = new T.Group(); grupo.name = 'guias_alineacion'; A.scene.add(grupo);
  const matX = new T.LineDashedMaterial({ color: 0xff3d8b, dashSize: 0.25, gapSize: 0.12, depthTest: false, transparent: true });
  const matZ = new T.LineDashedMaterial({ color: 0x22a6ff, dashSize: 0.25, gapSize: 0.12, depthTest: false, transparent: true });
  let ctrl = false, cacheA = null, otros = [], caja0 = null, ultimaPista = '';
  addEventListener('keydown', e => { if (e.key === 'Control') ctrl = true; });
  addEventListener('keyup', e => { if (e.key === 'Control') ctrl = false; });
  addEventListener('blur', () => { ctrl = false; });
  const activo = () => !A.AJ.iman || A.AJ.iman.guias !== false;

  function limpiar() { for (const c of [...grupo.children]) { grupo.remove(c); c.geometry.dispose(); } }
  function linea(a, b, m) { const g = new T.BufferGeometry().setFromPoints([a, b]); const l = new T.Line(g, m); l.computeLineDistances(); l.renderOrder = 999; l.frustumCulled = false; grupo.add(l); }

  /* cajas de lo que hay cerca al empezar a arrastrar (objetos nuevos y piezas del mapa a menos de 30 m) */
  function preparar(a) {
    cacheA = a; otros = [];
    const keys = a.ents.map(x => x[0]), propias = new Set(keys);
    caja0 = A.cajaEntidades(keys); if (!caja0 || caja0.isEmpty()) { caja0 = null; return; }
    const c = caja0.getCenter(new V3());
    const meter = k => { if (propias.has(k)) return; const b = A.cajaEntidad(k); if (!b || b.isEmpty()) return; const s = b.getSize(new V3()); if (s.x > 120 || s.z > 120) return; /* el terreno no sirve de guía */ if (b.distanceToPoint(c) <= RADIO) otros.push(b); };
    for (const o of E.nuevos().values()) if (A.tipoBase(o.tipo) !== 'nota') meter('n' + o.id);
    for (let i = 0; i < A.N && otros.length < 4000; i++) { const z = A.P[i]; if (!z || z.del || z.cat === 'col' || z.cat === 'luz' || z.cat === 'txt') continue; if (Math.abs(z.p.x - c.x) > RADIO || Math.abs(z.p.z - c.z) > RADIO) continue; meter('p' + i); }
  }

  function trasladar(pv, a) {
    if (cacheA !== a) preparar(a); if (!caja0) return;
    const b = caja0.clone().translate(pv.position.clone().sub(a.pv0)), mejor = { x: null, z: null };
    for (const ax of ['x', 'z']) {
      const mias = [b.min[ax], (b.min[ax] + b.max[ax]) / 2, b.max[ax]];
      for (const o of otros) {
        const suyas = [o.min[ax], (o.min[ax] + o.max[ax]) / 2, o.max[ax]];
        for (const m of mias) for (const t of suyas) { const d = t - m; if (Math.abs(d) < IMAN && (!mejor[ax] || Math.abs(d) < Math.abs(mejor[ax].d))) mejor[ax] = { d, t, o }; }
      }
    }
    const imanta = activo() && !ctrl;
    for (const ax of ['x', 'z']) if (mejor[ax] && (imanta || Math.abs(mejor[ax].d) < EXACTO)) { if (imanta) pv.position[ax] += mejor[ax].d; } else mejor[ax] = null;
    limpiar(); if (!mejor.x && !mejor.z) return;
    const b2 = caja0.clone().translate(pv.position.clone().sub(a.pv0)), y = b2.min.y + 0.03;
    if (mejor.x) { const o = mejor.x.o, x = mejor.x.t; linea(new V3(x, y, Math.min(b2.min.z, o.min.z) - 0.6), new V3(x, y, Math.max(b2.max.z, o.max.z) + 0.6), matX); }
    if (mejor.z) { const o = mejor.z.o, z = mejor.z.t; linea(new V3(Math.min(b2.min.x, o.min.x) - 0.6, y, z), new V3(Math.max(b2.max.x, o.max.x) + 0.6, y, z), matZ); }
  }

  /* ángulo en planta del objeto (si hay uno) tras el giro; imán a recto */
  function girar(pv, a) {
    limpiar();
    const st = a.ents[0] && a.ents[0][1]; if (!st || !st.q) return;
    const dq = pv.quaternion.clone().multiply(a.q0.clone().invert()), q = dq.clone().multiply(st.q);
    const eu = new T.Euler().setFromQuaternion(q, 'YXZ'); if (Math.abs(eu.x) > 0.01 || Math.abs(eu.z) > 0.01) return; /* inclinado: no aplica */
    let yaw = eu.y; const recto = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2), falta = recto - yaw;
    if (activo() && !ctrl && Math.abs(falta) > 1e-6 && Math.abs(falta) < IMAN_GIRO) { pv.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new V3(0, 1, 0), falta)); yaw = recto; }
    let g = ((yaw / DEG) % 360 + 360) % 360; if (g > 359.95) g = 0;
    const r = Math.abs(((g + 45) % 90) - 45);
    const txt = 'Giro ' + A.fmt(g, 1) + '° · ' + (r < 0.05 ? 'Recto ✓' : 'a ' + A.fmt(r, 1) + '° de estar recto') + (a.ents.length > 1 ? ' (primer objeto)' : '');
    if (txt !== ultimaPista) { ultimaPista = txt; A.pista(txt); }
  }

  const original = OOTransformar.restringir;
  OOTransformar.restringir = function (pv, a) {
    original.apply(this, arguments);
    try {
      if (!a || !a.pv0 || !a.ents) return;
      const escala = pv.scale.distanceToSquared(new V3(1, 1, 1)) > 1e-10, gira = pv.quaternion.angleTo(a.q0) > 1e-6;
      if (escala) { limpiar(); return; }
      if (gira) girar(pv, a); else trasladar(pv, a);
    } catch (e) { console.warn('guías de alineación', e); }
  };
  /* al soltar: fuera líneas y caché */
  addEventListener('pointerup', () => setTimeout(() => { limpiar(); cacheA = null; ultimaPista = ''; }, 30), true);
  window.OOGuiasAlineacion = { limpiar };
})();
