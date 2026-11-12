/* Editor del mapa: escalera escalón por escalón (totalmente libre). Objeto `escalera` con `forma: 'peldanos'`:
     pasos = [{ x, z, r, sube, fondo? }]   centro de cada escalón en el marco del pie (m), rumbo r (grados, 0 = +X del marco),
                                           sube (false = descanso plano a la misma altura) y fondo propio (descansos).
     paso  = { c, h }                       altura de cada escalón (contrahuella) y fondo (huella).
   La altura de cada escalón sale de contar los que suben: cambiar `paso.c` sube o baja todos a la vez. No depende de paredes, pisos
   ni de una forma: cada escalón va donde lo pongas (curvas, caracoles a mano, giros en cualquier ángulo).
   Herramienta Construir → «Escalón por escalón»: clic en el punto de partida; cada clic añade escalones hacia el ratón (cerca: uno;
   lejos: todos los que quepan hasta el punto), girando hacia él (imán cada 15°, con Mayús libre). Ctrl+clic: descanso plano. Retroceso quita el
   último. Enter o doble clic termina; Esc descarta. Inspector: altura y fondo de los escalones, «Seguir añadiendo», quitar el último.
   Usa los estilos de peldaño y de baranda de escaleras.js y abre solo los huecos de pisos y techos. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !window.OOEscaleras) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3;
  const ES = window.OOEscaleras, H = ES._h, { caja, mul, tras, rotY, baranda, tono } = H;
  A.ICON.escalera_pasos = '<path d="M4 20h4v-3h4v-3h4v-3h4"/><circle cx="20" cy="6" r="2"/>';
  const PP = { c: 0.18, h: 0.28 };
  A.params.escalera_pasos = PP;
  const maneja = (d?) => !!d && d.forma === 'peldanos';

  function pasoDe(d?) { const p = d.paso || {}; return { c: Math.max(0.05, Math.min(0.4, +p.c || 0.18)), h: Math.max(0.12, Math.min(1.5, +p.h || 0.28)) }; }
  function pasosDe(d?) {
    if (Array.isArray(d.pasos) && d.pasos.length) return d.pasos.slice(0, 400).map((q?) => ({ x: +q.x || 0, z: +q.z || 0, r: +q.r || 0, sube: q.sube !== false, fondo: +q.fondo > 0 ? +q.fondo : undefined }));
    const { c, h } = pasoDe(d), n = Math.max(1, Math.round((+d.alto || 2.8) / c)); /* sin pasos: recta del desnivel */
    return Array.from({ length: n }, (_?, i?) => ({ x: h * (i + 0.5), z: 0, r: 0, sube: true }));
  }
  /* escalones con su altura de huella (cara de arriba) y su rectángulo en el marco del pie */
  function plan(d?) {
    const W = Math.max(0.4, +d.ancho || 1.0), { c, h } = pasoDe(d), ps = pasosDe(d); let y = 0;
    const es = ps.map((q?) => {
      const yPrev = y; if (q.sube) y += c; const f = q.fondo || h, g = q.r * DEG, cg = Math.cos(g), sg = Math.sin(g);
      const en = (lx?, lz?) => [q.x + lx * cg + lz * sg, q.z - lx * sg + lz * cg];
      return Object.assign({}, q, { y, yPrev, f, rect: [en(-f / 2, -W / 2), en(f / 2, -W / 2), en(f / 2, W / 2), en(-f / 2, W / 2)], en });
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const e of es) for (const [x, z] of e.rect) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (!isFinite(x0)) { x0 = 0; x1 = 1; z0 = -W / 2; z1 = W / 2; }
    return { W, c, h, es, caja: [x0, x1, z0, z1], alto: y };
  }
  function caja_(d?) {
    const P = plan(d), [x0, x1, z0, z1] = P.caja;
    d.pasos = P.es.map((e?) => { const o: any = { x: r3(e.x), z: r3(e.z), r: r3(e.r), sube: e.sube }; if (e.fondo) o.fondo = r3(e.fondo); return o; });
    d.paso = { c: P.c, h: P.h }; d.alto = r3(Math.max(0.05, P.alto)); d.n = P.es.filter((e?) => e.sube).length; d.contrahuella = P.c; d.huella = P.h;
    d.sx = r3(x1 - x0); d.sz = r3(z1 - z0); return d;
  }
  function desfase(d?) { const [x0, x1, z0, z1] = plan(d).caja; return [(x0 + x1) / 2, (z0 + z1) / 2]; }

  function partes(d?, col?, M0?) {
    const P = plan(d), out = [], W = P.W, est = d.estilo || 'maciza';
    const gP = { zanca: 0.05, zanca_central: 0.06, flotante: 0.09, madera: 0.045, metalica: 0.035 }[est] || 0.05;
    const colP = est === 'metalica' ? (d.colorPeldano || '#80868b') : col, zc = d.colorZanca || (est === 'madera' ? tono(col, 0.7) : est === 'metalica' ? '#3a3f44' : '#4f565c');
    for (const e of P.es) {
      const Mf = mul(M0.clone(), tras(e.x, 0, e.z), rotY(e.r * DEG));
      if (est === 'maciza') { if (e.y > 0.01) out.push(caja(Mf, [0, e.y / 2, 0], [e.f, e.y, W], col)); continue; }
      out.push(caja(Mf, [0, e.y - gP / 2, 0], [e.f, gP, est === 'flotante' ? W : W - 0.02], colP));
      if (est === 'madera' && e.y - gP - e.yPrev > 0.02) out.push(caja(Mf, [-e.f / 2 + 0.012, (e.y - gP + e.yPrev) / 2, 0], [0.024, e.y - gP - e.yPrev, W - 0.06], tono(col, 0.9)));
      const bajo = e.y - gP; if (bajo < 0.05 || est === 'flotante') continue;
      if (est === 'zanca_central' || est === 'metalica') out.push(caja(Mf, [0, bajo / 2, 0], [0.08, bajo, 0.08], zc));
      else for (const z of [-W / 2 + 0.05, W / 2 - 0.05]) out.push(caja(Mf, [0, bajo / 2, z], [0.05, bajo, 0.05], zc));
    }
    const lados = d.barandas === 'ninguna' ? [] : d.barandas === 'izq' ? [-1] : d.barandas === 'der' ? [1] : [-1, 1];
    for (const s of lados) for (let i = 0; i + 1 < P.es.length; i++) {
      const a = P.es[i], b = P.es[i + 1], pa = a.en(0, s * (W / 2 - 0.05)), pb = b.en(0, s * (W / 2 - 0.05));
      baranda(out, M0, [pa[0], a.y, pa[1]], [pb[0], b.y, pb[1]], d, { sinPrimero: i > 0 });
    }
    return out;
  }
  function huellas(d?, w?) { return plan(d).es.map((e?) => e.rect.map(w)); }

  /* ---------- herramienta ---------- */
  let pie = null, lista = [], editId = null, ultimoE = null, tClic = 0, xyClic = [0, 0], ultimoClic = 0;
  const rumbo = (a?, b?) => Math.atan2(-(b.z - a.z), b.x - a.x);
  /* escalones nuevos hacia el ratón: girando hacia él (imán de 15°, Mayús libre) y tantos como quepan hasta el punto (al menos uno).
     Clic cerca = un escalón; clic lejos = un tramo recto hasta ahí. Con Ctrl, un descanso plano. */
  function siguientes(m?, plano?, libre?) {
    const { c, h } = PP, W = +ES.params.ancho || 1.0, f = plano ? Math.max(h, W) : h, out = [];
    let prev = lista.length ? lista[lista.length - 1] : null; const desde = prev ? prev.p : pie;
    let th = rumbo(desde, m); const dist = Math.hypot(m.x - desde.x, m.z - desde.z); if (dist < 0.05) th = prev ? prev.r : 0;
    const paso = 15 * DEG;
    if (!libre) { if (prev) { let rel = Math.atan2(Math.sin(th - prev.r), Math.cos(th - prev.r)); rel = Math.max(-150 * DEG, Math.min(150 * DEG, Math.round(rel / paso) * paso)); th = prev.r + rel; } else th = Math.round(th / paso) * paso; }
    const primero = prev ? ((prev.fondo || h) + f) / 2 : f / 2;
    const n = plano ? 1 : Math.max(1, Math.min(40, 1 + Math.floor((dist - primero + h * 0.5) / h)));
    let base = desde, y = prev ? prev.y : pie.y;
    for (let k = 0; k < n; k++) {
      const dd = k === 0 ? primero : h; y += plano ? 0 : c;
      const p = new V3(base.x + Math.cos(th) * dd, y, base.z - Math.sin(th) * dd);
      const q = { p, r: th, sube: !plano, fondo: plano ? f : undefined, y }; out.push(q); base = p;
    }
    return out;
  }
  function datosDe(l?) {
    if (!pie || !l.length) return null;
    const g = l[0].r, cg = Math.cos(g), sg = Math.sin(g);
    const pasos = l.map((q?) => { const dx = q.p.x - pie.x, dz = q.p.z - pie.z; const o: any = { x: r3(dx * cg - dz * sg), z: r3(dx * sg + dz * cg), r: r3((q.r - g) / DEG), sube: q.sube }; if (q.fondo) o.fondo = r3(q.fondo); return o; });
    const d = Object.assign({}, ES.params, { forma: 'peldanos', y: pie.y, giroY: r3(g / DEG), paso: { c: PP.c, h: PP.h }, pasos });
    ES.normalizar(d); ES.conPie(d, [pie.x, pie.z]); return d;
  }
  function previa(e?) {
    if (!pie) return; const inf = e ? A.inferir(e, lista.length ? lista[lista.length - 1].p : pie) : null;
    const cand = inf ? siguientes(inf.p, e.ctrlKey, e.shiftKey) : null, d = datosDe(cand ? lista.concat(cand) : lista);
    if (!d) { A.limpiarPrevia(); A.etqVivas = []; return; }
    A.mostrarPrevia('escalera', d);
    const ult = cand ? cand[cand.length - 1] : lista[lista.length - 1], q = ult.p;
    A.etqVivas = [{ p: new V3(q.x, q.y + 0.6, q.z), t: (lista.length + (cand ? cand.length : 0)) + ' escalones · sube ' + A.fmt(d.alto) + ' m' + (cand && !ult.sube ? ' · descanso' : cand && cand.length > 1 ? ' · +' + cand.length + ' en este clic' : '') }];
  }
  function terminar() {
    const d = datosDe(lista), id = editId; pie = null; lista = []; editId = null; A.limpiarPrevia(); A.etqVivas = []; A.ocultarInferencia();
    if (!d) { A.pista('Pon al menos un escalón: clic en el punto de partida y clic para cada escalón.'); return; }
    if (id && E.nuevos().get(id)) { ES.cambiar(id, { pasos: d.pasos, paso: d.paso }, 'Añadir escalones'); A.seleccionar(['n' + id], { sinTab: true }); return; }
    const nid = ES.crear(d, 'Crear escalera escalón por escalón'); if (nid) A.seleccionar(['n' + nid], { sinTab: true });
  }
  function continuar(id?) {
    const o = E.nuevos().get(id); if (!o || !maneja(o.datos)) return;
    const d = ES.normalizar(Object.assign({}, o.datos)), P = plan(d), [px, pz] = ES.pieDe(d), g = (+d.giroY || 0) * DEG, cg = Math.cos(g), sg = Math.sin(g), y0 = +d.y || 0;
    Object.assign(PP, pasoDe(d));
    A.ponerHerramienta('escalera_pasos'); /* puede limpiar el estado: se fija después */
    editId = id; pie = new V3(px, y0, pz);
    lista = P.es.map((e?) => ({ p: new V3(px + e.x * cg + e.z * sg, y0 + e.y, pz - e.x * sg + e.z * cg), r: g + e.r * DEG, sube: e.sube, fondo: e.fondo, y: y0 + e.y }));
    A.pista('Sigue añadiendo escalones desde el último. Enter o doble clic para terminar.');
  }
  const num = (k?, l?, v?, st?) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.01}" data-epp="${k}" value="${r3(+v || 0)}"></label>`;
  E.agregarHerramientaPropia('escalera_pasos', {
    n: 'Escalón por escalón', ic: 'escalera_pasos',
    pista: 'Clic en el punto de partida. Clic cerca = un escalón más; clic lejos = todos los escalones hasta ese punto. Cada uno sube un peldaño hacia donde apuntes (giro imantado cada 15°, Mayús: libre). Ctrl+clic: descanso plano. Retroceso quita el último escalón. Enter o doble clic termina; Esc descarta.',
    opciones: () => { pie = null; lista = []; },
    move: (e?) => { ultimoE = e; if (pie) previa(e); else A.inferir(e, null); },
    up: (e?, mov?) => {
      if (mov > 6) return; const inf = A.inferir(e, lista.length ? lista[lista.length - 1].p : pie); if (!inf) return;
      const ahora = Date.now(), dobl = ahora - tClic < 350 && Math.hypot(e.clientX - xyClic[0], e.clientY - xyClic[1]) < 6; tClic = ahora; xyClic = [e.clientX, e.clientY];
      if (!pie) { pie = inf.p.clone(); A.punto3D(pie); return; }
      if (dobl && lista.length) { lista = lista.slice(0, Math.max(0, lista.length - (ultimoClic || 1))); terminar(); return; }
      const nuevos = siguientes(inf.p, e.ctrlKey, e.shiftKey); ultimoClic = nuevos.length; lista.push(...nuevos); previa(e);
    },
    fin: () => { pie = null; lista = []; editId = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => {
      const PE = ES.params;
      return `<div class="campos">${num('c', 'Altura de cada escalón (m)', PP.c)}${num('h', 'Fondo de cada escalón (m)', PP.h)}${H.num('ep', 'ancho', 'Ancho (m)', PE.ancho)}${H.opc('ep', 'diseno', 'Diseño', '', H.OPC_DISENOS)}${H.opc('ep', 'estilo', 'Peldaños', PE.estilo, H.ESTILOS)}${H.opc('ep', 'barandas', 'Barandas', PE.barandas, H.BAR)}${H.opc('ep', 'estiloBaranda', 'Tipo de baranda', PE.estiloBaranda || 'tubo', H.ESTILOS_BARANDA)}</div>
        <p class="ayuda">No necesita paredes ni un piso arriba: sube lo que tú vayas poniendo. Lo alto que quede abre solo el hueco de una losa o un techo si los alcanza.</p>`;
    }
  });
  E.agregarHerramienta('construir', { h: 'escalera_pasos', n: 'Escalón por escalón' });
  document.addEventListener('keydown', (e?) => {
    if (A.herramienta !== 'escalera_pasos' || !pie || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); terminar(); }
    else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); if (lista.length) lista.pop(); else { pie = null; A.limpiarPrevia(); A.etqVivas = []; return; } previa(ultimoE); }
    else if (e.key === 'Control' || e.key === 'Shift') previa(ultimoE);
  }, true);
  document.addEventListener('change', (e?) => { const el = e.target; if (el && el.dataset && el.dataset.epp) { const v = parseFloat(el.value); if (isFinite(v) && v > 0) PP[el.dataset.epp] = v; } });

  /* ---------- inspector ---------- */
  E.on('panel', () => {
    const o = ES.selEsc && ES.selEsc(); const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c || !maneja(o.datos)) return;
    const d = o.datos, P = plan(d), np = P.es.length, nd = P.es.filter((e?) => !e.sube).length;
    const sec = document.createElement('details'); sec.className = 'sec'; sec.open = true; sec.dataset.sec = 'escalera-pasos';
    sec.innerHTML = `<summary>Escalones</summary>
      <p class="ayuda" style="margin:0 0 6px">${np} escalones${nd ? ' (' + nd + (nd > 1 ? ' descansos' : ' descanso') + ')' : ''} · sube ${A.fmt(P.alto)} m. Cambiar la altura sube o baja todos a la vez.</p>
      <div class="campos"><label class="campo"><span>Altura de cada escalón (m)</span><input type="number" step="0.01" data-eppi="c" value="${P.c}"></label>
      <label class="campo"><span>Fondo de cada escalón (m)</span><input type="number" step="0.01" data-eppi="h" value="${P.h}"></label></div>
      <div class="fila"><button data-eppa="seguir">Seguir añadiendo escalones</button><button data-eppa="quitar"${np < 2 ? ' disabled' : ''}>Quitar el último</button><button data-eppa="espejo">Reflejar (girar al otro lado)</button></div>`;
    const ref = c.querySelector('[data-sec="escalera"]'); if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.eppi) return; const o = ES.selEsc && ES.selEsc(); if (!o || !maneja(o.datos)) return;
    const v = parseFloat(el.value); if (!isFinite(v) || v <= 0) return; const p = pasoDe(o.datos); p[el.dataset.eppi] = v;
    ES.cambiar(o.id, { paso: p }, el.dataset.eppi === 'c' ? 'Altura de los escalones' : 'Fondo de los escalones');
  });
  document.addEventListener('click', (e?) => {
    const b = e.target.closest && e.target.closest('[data-eppa]'); if (!b) return; const o = ES.selEsc && ES.selEsc(); if (!o || !maneja(o.datos)) return;
    const ps = pasosDe(o.datos);
    if (b.dataset.eppa === 'seguir') continuar(o.id);
    else if (b.dataset.eppa === 'quitar' && ps.length > 1) ES.cambiar(o.id, { pasos: ps.slice(0, -1) }, 'Quitar un escalón');
    else if (b.dataset.eppa === 'espejo') ES.cambiar(o.id, { pasos: ps.map((q?) => Object.assign({}, q, { z: -q.z, r: -q.r })) }, 'Reflejar la escalera');
  });

  window.OOEscalerasPasos = { maneja, plan, caja: caja_, desfase, partes, huellas, continuar };
})();
