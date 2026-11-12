/* Editor del mapa (2.1, editor v2): ambiente de la vista 3D.
   - Hora del día: mueve el sol (de este a oeste, alto a mediodía, como en Guayaquil) y de noche la luna; cambian el cielo, la luz
     ambiente y las sombras.
   - Orientación del sol: gira la trayectoria (azimut) para probar cómo cae la luz.
   - Clima visual: despejado, nublado, niebla y lluvia (gotas alrededor de la cámara).
   Se guarda en los ajustes del navegador (AJ.hora, AJ.azimut, AJ.clima). Solo es para ver el mapa: no cambia los datos del juego. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, $ = (s?) => document.querySelector(s), svg = A.svg, DEG = Math.PI / 180;
  const AJ = () => A.AJ;
  if (AJ().hora == null) AJ().hora = 14; if (AJ().azimut == null) AJ().azimut = 0; if (!AJ().clima) AJ().clima = 'despejado';
  const C = (h?) => new T.Color(h), mezcla = (a?, b?, t?) => C(a).lerp(C(b), Math.max(0, Math.min(1, t)));
  const clamp = (v?, a?, b?) => Math.max(a, Math.min(b, v));
  function periodo(h?) { return h < 5.5 ? 'Noche' : h < 7.5 ? 'Amanecer' : h < 11.5 ? 'Mañana' : h < 13.5 ? 'Mediodía' : h < 17.5 ? 'Tarde' : h < 19 ? 'Atardecer' : 'Noche'; }
  const hhmm = (h?) => { const m = Math.round(h * 60) % 1440; return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  /* dirección hacia un astro: t = 0 al salir (este), 0,5 en lo más alto, 1 al ponerse (oeste) */
  function dirAstro(t?, azOff?, maxElev?) {
    const elev = Math.sin(Math.PI * t) * maxElev * DEG, az = (90 + 180 * t + azOff) * DEG;
    return { elev, v: new T.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), -Math.cos(elev) * Math.cos(az)) };
  }
  let estado = null;
  function calcular() {
    const h = +AJ().hora, az = +AJ().azimut || 0, clima = AJ().clima || 'despejado';
    const s = dirAstro((h - 6) / 12, az, 72), dia = clamp((s.elev / DEG + 6) / 14, 0, 1); // 0 noche, 1 día
    const luna = dirAstro((((h + 12) % 24) - 6) / 12, az + 20, 60);
    const bajo = clamp(1 - s.elev / DEG / 22, 0, 1) * dia; // sol bajo: luz cálida
    const nub = clima === 'nublado' ? 0.55 : clima === 'lluvia' ? 0.7 : clima === 'niebla' ? 0.45 : 0;
    const usarLuna = s.elev < -2 * DEG;
    const fondo = AJ().fondo || '#a9c8e6';
    let arriba = mezcla('#0a1120', mezcla('#3e5a8c', fondo, clamp((s.elev / DEG) / 12, 0, 1)).getStyle(), dia);
    let hor = mezcla('#1a2234', mezcla('#f2a25c', C(fondo).lerp(C('#f2f4f6'), 0.6).getStyle(), 1 - bajo).getStyle(), dia);
    if (nub) { const gris = mezcla('#202630', clima === 'lluvia' ? '#7d858e' : '#a3abb4', dia); arriba = arriba.lerp(gris, nub); hor = hor.lerp(gris.clone().lerp(C('#cfd4d9'), 0.25 * dia), nub); }
    const intSol = usarLuna ? (luna.elev > 0 ? 0.2 : 0.08) : (0.12 + 0.72 * clamp(Math.sin(s.elev) * 1.7, 0, 1)) * (1 - nub * 0.7);
    const colSol = usarLuna ? C('#9fb4ff') : mezcla('#fff4e0', '#ffad60', bajo);
    return { h, s, luna, dia, usarLuna, arriba, hor, intSol, colSol, intHemi: (0.16 + 0.48 * dia) * (1 + nub * 0.15), cieloHemi: mezcla('#2a3553', '#dfeaf5', dia), sueloHemi: mezcla('#2a2824', '#8a8577', dia), clima, nub };
  }
  function aplicar() {
    estado = calcular(); const st = estado;
    A.ponerSolDir(st.usarLuna ? (st.luna.v.y > 0.05 ? st.luna.v : new T.Vector3(0.3, 0.6, 0.3)) : (st.s.v.y > 0.03 ? st.s.v : new T.Vector3(st.s.v.x, 0.03, st.s.v.z)));
    A.sol.color.copy(st.colSol); A.sol.intensity = st.intSol;
    A.hemi.intensity = st.intHemi; A.hemi.color.copy(st.cieloHemi); A.hemi.groundColor.copy(st.sueloHemi);
    A.cieloMat.uniforms.arriba.value.copy(st.arriba); A.cieloMat.uniforms.horizonte.value.copy(st.hor);
    A.cieloMat.uniforms.abajo.value.copy(mezcla('#1c1b19', '#7d786d', st.dia));
    if (A.vista !== 'planta') {
      A.scene.background = st.hor.clone();
      const d = A.distDibujo;
      if (st.clima === 'niebla') A.scene.fog = new T.Fog(st.hor.clone(), 8, 170);
      else if (st.clima === 'lluvia') A.scene.fog = new T.Fog(st.hor.clone(), 40, Math.min(d, 700));
      else if (st.clima === 'nublado') A.scene.fog = new T.Fog(st.hor.clone(), 200, Math.min(d, 1600));
      else A.scene.fog = new T.Fog(st.hor.clone(), Math.min(700, d * 0.25), d);
    }
    lluvia(st.clima === 'lluvia');
    const b = document.querySelector('[data-pop="popAmbiente"]'); if (b && window.OOUI) { const ic = st.usarLuna ? 'luna' : 'sol'; if (b.dataset.ic2 !== ic) { b.innerHTML = svg(ic); b.dataset.ic2 = ic; } }
    pintarPop(); A.marcar();
  }
  /* ---- lluvia: segmentos que caen alrededor de la cámara ---- */
  let gotas = null, gotasVel = null, ultT = 0;
  function lluvia(on?) {
    if (on && !gotas) {
      const n = 5000, pos = new Float32Array(n * 6); gotasVel = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 140, y = Math.random() * 70, z = (Math.random() - 0.5) * 140; pos.set([x, y, z, x + 0.05, y - 0.9, z + 0.05], i * 6); gotasVel[i] = 22 + Math.random() * 10; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      gotas = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45, depthWrite: false }));
      gotas.frustumCulled = false; gotas.renderOrder = 5; A.scene.add(gotas); ultT = performance.now(); requestAnimationFrame(animarLluvia);
    } else if (!on && gotas) { A.scene.remove(gotas); gotas.geometry.dispose(); gotas.material.dispose(); gotas = null; }
  }
  function animarLluvia(t?) {
    if (!gotas) return; requestAnimationFrame(animarLluvia);
    const dt = Math.min(0.05, (t - ultT) / 1000); ultT = t;
    gotas.visible = A.vista !== 'planta'; if (!gotas.visible) return;
    const c = A.vista === 'caminar' ? A.camP.position : A.ctl3.target; gotas.position.set(c.x, Math.max(0, c.y - 10), c.z);
    const p = gotas.geometry.attributes.position.array, n = gotasVel.length;
    for (let i = 0; i < n; i++) { const o = i * 6, d = gotasVel[i] * dt; p[o + 1] -= d; p[o + 4] -= d; if (p[o + 4] < 0) { p[o + 1] += 70; p[o + 4] += 70; } }
    gotas.geometry.attributes.position.needsUpdate = true; A.marcar();
  }
  /* ---- ventana emergente «Ambiente» (botón del sol de la vista) ---- */
  const CLIMAS = [['despejado', 'Despejado', 'sol'], ['nublado', 'Nublado', 'nube'], ['niebla', 'Niebla', 'capas'], ['lluvia', 'Lluvia', 'gota']];
  function construirPop() {
    const p = $('#popAmbiente'); if (!p) return;
    p.innerHTML = `<h3>Hora del día</h3>
      <div class="amb-fila"><input type="range" id="ambHora" min="0" max="24" step="0.25" aria-label="Hora del día"><output id="ambHoraTxt"></output></div>
      <div class="amb-hora"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <div class="fila"><button data-amb-h="7">Amanecer</button><button data-amb-h="12">Mediodía</button><button data-amb-h="17.6">Tarde</button><button data-amb-h="21.5">Noche</button></div>
      <h3>Orientación del sol</h3>
      <div class="amb-fila"><input type="range" id="ambAz" min="-180" max="180" step="5" aria-label="Orientación del sol"><output id="ambAzTxt"></output></div>
      <h3>Clima</h3><div class="amb-clima">${CLIMAS.map(([k, n, ic]) => `<button data-amb-clima="${k}">${svg(ic)}${n}</button>`).join('')}</div>
      <h3>Sombras</h3><label class="chk"><input type="checkbox" id="ambSombras"> Sombras del sol y la luna</label>
      <p class="ayuda">Solo cambia cómo se ve el editor. Calidad, resolución y distancia de dibujado: en Ajustes.</p>`;
    p.addEventListener('input', (e?) => {
      if (e.target.id === 'ambHora') { AJ().hora = +e.target.value; A.guardarAjustes(); aplicar(); }
      if (e.target.id === 'ambAz') { AJ().azimut = +e.target.value; A.guardarAjustes(); aplicar(); }
    });
    p.addEventListener('change', (e?) => { if (e.target.id === 'ambSombras') A.ponerAjuste('sombras', e.target.checked); });
    p.addEventListener('click', (e?) => {
      const h = e.target.closest('[data-amb-h]'); if (h) { AJ().hora = +h.dataset.ambH; A.guardarAjustes(); aplicar(); }
      const c = e.target.closest('[data-amb-clima]'); if (c) { AJ().clima = c.dataset.ambClima; A.guardarAjustes(); aplicar(); }
    });
  }
  function pintarPop() {
    const p = $('#popAmbiente'); if (!p || !p.firstChild) return; const st = estado || calcular();
    const hr = $('#ambHora'); if (hr && document.activeElement !== hr) hr.value = AJ().hora; const ht = $('#ambHoraTxt'); if (ht) ht.textContent = hhmm(+AJ().hora) + ' · ' + periodo(+AJ().hora);
    const az = $('#ambAz'); if (az && document.activeElement !== az) az.value = AJ().azimut || 0; const at = $('#ambAzTxt'); if (at) at.textContent = (AJ().azimut > 0 ? '+' : '') + (AJ().azimut || 0) + '°';
    p.querySelectorAll('[data-amb-clima]').forEach((b?) => b.classList.toggle('on', b.dataset.ambClima === st.clima));
    const so = $('#ambSombras'); if (so) so.checked = !!AJ().sombras;
  }
  construirPop();
  E.on('fondo', aplicar); E.on('vista', aplicar);
  aplicar();
  window.OOAmbiente = { aplicar, estado: () => estado, ponerHora: (h?) => { AJ().hora = h; A.guardarAjustes(); aplicar(); }, ponerClima: (c?) => { AJ().clima = c; A.guardarAjustes(); aplicar(); } };
})();
