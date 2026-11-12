/* Editor del mapa: borrar guías (las líneas moradas discontinuas de Guías → este-oeste / norte-sur).
   - Herramienta «Borrar una guía»: al pasar el ratón resalta la guía más cercana (a menos de ~0,6 m en el suelo) y un clic la borra.
   - «Borrar todas las guías» sigue en el menú Guías; ahora pide confirmación y dice cuántas había. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3;
  A.ICON.guia_borrar = '<path d="M3 12h18" stroke-dasharray="3 2"/><path d="M9 6l6 12M15 6L9 18"/>';
  const guias = () => [...A.efectivos('guias')].filter(([, g]) => g && g.mapa === A.mapa);
  const resalte = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xff3b3b, depthTest: false, transparent: true }));
  resalte.renderOrder = 1000; resalte.visible = false; resalte.frustumCulled = false; if (A.scene) A.scene.add(resalte);
  function cercana(e) {
    const p = A.puntoPlano(e, 0); if (!p) return null; let mejor = null;
    for (const [id, g] of guias()) { const d = g.dir === 'x' ? Math.abs(p.z - g.z) : Math.abs(p.x - g.x); if (!mejor || d < mejor.d) mejor = { id, g, d }; }
    return mejor && mejor.d < 0.6 ? mejor : null;
  }
  function mostrar(c) {
    if (!c) { resalte.visible = false; return; }
    const L = 1500, g = c.g, a = g.dir === 'x' ? new V3(g.x - L, 0.1, g.z) : new V3(g.x, 0.1, g.z - L), b = g.dir === 'x' ? new V3(g.x + L, 0.1, g.z) : new V3(g.x, 0.1, g.z + L);
    resalte.geometry.dispose(); resalte.geometry = new T.BufferGeometry().setFromPoints([a, b]); resalte.visible = true;
  }
  E.agregarHerramientaPropia('guia_borrar', {
    n: 'Borrar una guía', ic: 'guia_borrar',
    pista: 'Pasa el ratón sobre una guía morada (se pone roja) y haz clic para borrarla. Esc para terminar.',
    move: e => { const c = cercana(e); mostrar(c); A.pista(c ? 'Guía ' + (c.g.dir === 'x' ? 'este-oeste en Z = ' + A.fmt(c.g.z) : 'norte-sur en X = ' + A.fmt(c.g.x)) + ' · clic para borrarla' : (guias().length ? 'Acércate a una guía morada.' : 'No hay guías en este mapa.')); },
    up: (e, mov) => { if (mov > 6) return; const c = cercana(e); if (!c) return; A.guardarCol('guias', c.id, null); mostrar(null); A.pista('Guía borrada.'); },
    fin: () => mostrar(null)
  });
  /* menú Guías: «Borrar una guía» junto a «Borrar todas» */
  E.agregarHerramienta('guias', { h: 'guia_borrar', n: 'Borrar una guía (clic sobre ella)' });
  /* «Borrar todas»: confirmar */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-rail-it]'); if (!b || document.getElementById('menuHerr').dataset.railMenu !== 'guias') return;
    if (!/Borrar todas/.test(b.textContent)) return;
    const n = guias().length; if (!n) { e.stopImmediatePropagation(); A.pista('No hay guías en este mapa.'); return; }
    if (!confirm('¿Borrar las ' + n + ' guías de este mapa?')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.OOGuiasBorrar = { cercana };
})();
