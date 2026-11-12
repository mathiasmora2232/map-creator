/* Editor del mapa (2.1): ocultar techos y paredes con un clic, en 3D y en el plano 2D, y que se recuerde.
   - Barra de abajo: «Techos» (mostrar u ocultar) y «Paredes: completas → a media altura → ocultas». Atajos Alt+T y Alt+W (se pueden
     cambiar en Atajos personalizados). La elección se guarda en el navegador (localStorage['oo-capas-vista']).
   - Qué es techo: piezas del mapa horizontales por encima de 2,2 m (losas, chapas, techo falso, cubiertas) y los objetos `techo` nuevos.
     Qué es pared: piezas altas (más de 1,4 m) y finas (menos de 70 cm) que empiezan por debajo de 2,4 m, y los objetos `muro`.
   - «A media altura» corta la vista a 1,2 m sobre el plano de trabajo (como el corte por altura) y deja ver dentro de las habitaciones.
   - Lo oculto tampoco se puede elegir (va por los filtros de vista del editor). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, $ = (s?) => document.querySelector(s);
  const LS = 'oo-capas-vista';
  const est = Object.assign({ techos: true, paredes: 'completas' }, (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } })());
  if (!['completas', 'media', 'ocultas'].includes(est.paredes)) est.paredes = 'completas';
  let clase = null, corteAntes; /* undefined: sin corte guardado (null es «sin corte») */ /* clase[i]: 1 techo, 2 pared */
  const m4 = new T.Matrix4(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
  function clasificar() {
    const P = A.P, N = A.N; clase = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (!z || z.cat === 'col' || z.cat === 'luz' || z.cat === 'txt' || z.t === 7) continue;
      A.matrizPieza(i, m4); const e = m4.elements; m4.decompose(_p, _q, _s);
      const hy = Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]), hx = Math.hypot(e[0], e[2]), hz = Math.hypot(e[8], e[10]), bot = _p.y - hy / 2;
      if (hy > 1.4 && Math.min(hx, hz) < 0.7 && Math.max(hx, hz) > 0.6 && bot < 2.4) clase[i] = 2;
      else if (bot >= 2.2 && (hy < Math.max(0.6, 0.3 * Math.min(hx, hz))) && hx * hz >= 1.5 && z.mesh !== 'sph') clase[i] = 1;
    }
  }
  E.on('mapa', () => { clase = null; aplicarCorte(); });
  E.filtrosVis.push((k?, z?) => {
    if (est.techos && est.paredes !== 'ocultas') return true;
    if (k[0] === 'p') { if (!clase || clase.length !== A.N) clasificar(); const c = clase[+k.slice(1)]; return !((c === 1 && !est.techos) || (c === 2 && est.paredes === 'ocultas')); }
    const b = A.tipoBase(z && z.tipo); if (b === 'techo' && !est.techos) return false; if (b === 'muro' && est.paredes === 'ocultas') return false; return true;
  });
  function aplicarCorte() {
    if (est.paredes === 'media') { if (corteAntes === undefined) corteAntes = A.corte; A.ponerCorte((+A.planoTrabajo || 0) + 1.2); }
    else if (corteAntes !== undefined) { A.ponerCorte(corteAntes); corteAntes = undefined; }
  }
  function aplicar() {
    try { localStorage.setItem(LS, JSON.stringify(est)); } catch (e) { }
    aplicarCorte(); A.renderTodo(); pintar();
    if (window.OOPlano) { OOPlano.forzar(); if (OOPlano.activo()) OOPlano.recalcular(); }
    A.marcar();
  }
  function ponerTechos(v?) { est.techos = v == null ? !est.techos : !!v; aplicar(); A.pista(est.techos ? 'Techos visibles.' : 'Techos ocultos (Alt+T para volver a verlos).'); return est.techos; }
  function ponerParedes(v?) { const ciclo = { completas: 'media', media: 'ocultas', ocultas: 'completas' }; est.paredes = v == null ? ciclo[est.paredes] : v; aplicar(); A.pista({ completas: 'Paredes completas.', media: 'Paredes cortadas a media altura (1,2 m): se ve dentro de las habitaciones.', ocultas: 'Paredes ocultas (Alt+W para volver a verlas).' }[est.paredes]); return est.paredes; }
  function pintar() {
    const t = $('#cvTechos'), p = $('#cvParedes'); if (!t || !p) return;
    t.classList.toggle('on', est.techos); t.setAttribute('aria-pressed', String(est.techos));
    p.textContent = ({ completas: 'Paredes', media: 'Paredes ½', ocultas: 'Sin paredes' })[est.paredes]; p.title = 'Paredes ' + ({ completas: 'enteras', media: 'cortadas a media altura', ocultas: 'ocultas' })[est.paredes] + ' · clic para cambiar (Alt+W)'; p.classList.toggle('on', est.paredes !== 'ocultas');
  }
  (function barra() {
    const b = document.querySelector('#barraVista .centro-barra'); if (!b) return;
    b.insertAdjacentHTML('beforeend', `<span class="cv-capas" role="group" aria-label="Techos y paredes"><button id="cvTechos" title="Mostrar u ocultar los techos (Alt+T)">Techos</button><button id="cvParedes" title="Paredes enteras, cortadas a media altura u ocultas (Alt+W)">Paredes</button></span>`);
    $('#cvTechos').addEventListener('click', () => ponerTechos());
    $('#cvParedes').addEventListener('click', () => ponerParedes());
    pintar();
  })();
  if (window.OOProductividad) OOProductividad.acciones.push({ id: 'ver-techos', n: 'Mostrar u ocultar los techos', def: 'Alt+T', fn: () => ponerTechos(), nucleo: false }, { id: 'ver-paredes', n: 'Paredes: enteras, a media altura u ocultas', def: 'Alt+W', fn: () => ponerParedes(), nucleo: false });
  else window.addEventListener('keydown', (e?) => { if (!e.altKey || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return; if (e.code === 'KeyT') { e.preventDefault(); ponerTechos(); } if (e.code === 'KeyW') { e.preventDefault(); ponerParedes(); } }, true);
  /* al arrancar con una elección guardada */
  if (!est.techos || est.paredes !== 'completas') setTimeout(() => { if (A.D) aplicar(); else E.on('mapa', () => aplicar()); }, 0);
  window.OOCapasVista = { estado: () => ({ techos: est.techos, paredes: est.paredes }), ponerTechos, ponerParedes, clase: (i?) => { if (!clase || clase.length !== A.N) clasificar(); return clase[i]; } };
})();
