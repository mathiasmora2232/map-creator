/* Editor del mapa (2.1, Map Editor Pro fase 5): escaleras de caracol y en U, rampas con descansos intermedios y barandas por el borde.
   Escalera (`escalera`, escaleras.js calcula los peldaños y llama aquí con forma 'caracol' o 'U'):
   - caracol: el punto (x, z) es el centro; `radio` exterior (1 m), columna central, peldaños en abanico de `anguloPeldano` grados (sale de la
     huella medida a 2/3 del radio), `giro` 'izq' (antihorario visto desde arriba) o 'der'; baranda exterior que sigue la hélice.
   - U: dos tramos paralelos con un descanso al final del primero que ocupa los dos anchos más el `hueco` entre tramos; `giro` = lado del
     segundo tramo. El agujero automático del piso de arriba usa la huella de cada forma (círculo o rectángulo).
   Rampa (`rampa`): `descansos` intermedios (0–6) de `largoDescansoRampa` m (1,5): la subida se reparte en tramos iguales con un tramo plano
   entre cada dos; barandas y bordillos siguen el perfil. El largo total cuenta los descansos.
   Baranda por el borde: herramienta Construir → «Baranda por el borde» y botón del inspector de pisos, fundaciones y plataformas. Un clic en el
   piso pone barandas en todo su contorno (o solo en el lado clicado), a su altura, retiradas 5 cm hacia dentro, ancladas al piso; se saltan los
   lados que ya tienen pared y dejan paso donde llega una escalera o una rampa recta. Todo en un paso de deshacer.
   API: OOEscalerasPro.crearCaracol(datos), crearU(datos), barandaBorde(id, opts), ladosBorde(id). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !window.OOEscaleras) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon, nv = () => E.nuevos();
  const H = OOEscaleras._h, { tramo, caja, barra, perfil, mul, tras, rotY } = H;
  const RC = 0.1; /* radio de la columna del caracol */

  function maneja(d?) { return !!d && (d.forma === 'caracol' || (d.forma === 'U' && (+d.n || 99) >= 3)); }
  /* ---------- caracol ---------- */
  function datosCaracol(d?) { const R = Math.max(0.6, +d.radio || 1), h = +d.huella || 0.28, ang = +d.anguloPeldano > 5 ? +d.anguloPeldano : Math.max(15, Math.min(40, h / (0.66 * R) / DEG)); return { R, ang, s: d.giro === 'der' ? -1 : 1 }; }
  /* ---------- U ---------- */
  function datosU(d?) { const n = d.n, n1 = Math.ceil(n / 2), n2 = n - n1, W = d.ancho, h = d.huella, g = Math.max(0, +d.hueco >= 0 ? +d.hueco : 0.1), s = d.giro === 'der' ? 1 : -1;
    const x0 = Math.min(0, (n1 - 1 - n2) * h), x1 = (n1 - 1) * h + W, zc = s * (W + g), z0 = Math.min(-W / 2, zc - W / 2), z1 = Math.max(W / 2, zc + W / 2); return { n1, n2, W, h, g, s, x0, x1, z0, z1, zc }; }
  function caja_(d?) {
    if (d.forma === 'caracol') { const { R, ang } = datosCaracol(d); d.radio = r3(R); d.anguloPeldano = r3(ang); d.ancho = r3(Math.max(0.5, R - RC)); d.sx = d.sz = r3(2 * R); d.giroTotal = r3(d.n * ang); return d; }
    const u = datosU(d); d.hueco = r3(u.g); d.sx = r3(u.x1 - u.x0); d.sz = r3(u.z1 - u.z0); return d;
  }
  function desfase(d?) { if (d.forma === 'caracol') return [0, 0]; const u = datosU(d); return [(u.x0 + u.x1) / 2, (u.z0 + u.z1) / 2]; }
  function huellas(d?, rect?, w?) {
    if (d.forma === 'caracol') { const { R } = datosCaracol(d), pts = []; for (let k = 0; k < 20; k++) { const a = k / 20 * 2 * Math.PI; pts.push(w([R * Math.cos(a), -R * Math.sin(a)])); } return [pts]; }
    const u = datosU(d); return [rect(u.x0, u.x1, u.z0, u.z1)];
  }
  function partes(d?, col?, M0?) {
    const out = [], c = d.contrahuella, n = d.n, bc = d.colorBaranda || '#4a4f55', ab = +d.alturaBaranda || 0.9;
    if (d.forma === 'caracol') {
      const { R, ang, s } = datosCaracol(d), Hh = d.alto, gro = 0.06, arco = (r?, a0?, a1?, k?) => { const L = []; for (let i = 0; i <= k; i++) { const a = (a0 + (a1 - a0) * i / k) * DEG; L.push([r3(r * Math.cos(a)), r3(-r * Math.sin(a))]); } return L; };
      out.push({ f: 'c', p: [0, (Hh + ab) / 2, 0], s: [RC * 2, Hh + ab, RC * 2], c: d.colorColumna || '#6b7178' });
      const top = []; /* barandilla: un balaustre por peldaño y pasamanos por los extremos */
      for (let k = 0; k < n; k++) {
        const a0 = s * k * ang, a1 = s * (k + 1) * ang, y = (k + 1) * c, sub = Math.max(3, Math.round(ang / 6));
        const pts = arco(R, a0, a1, sub).concat(arco(RC * 0.9, a1, a0, 2)); if (s < 0) pts.reverse();
        out.push({ f: 'poly', pts, y: r3(y - gro), grosor: gro, c: col });
        if (d.estilo !== 'zanca') out.push(caja(M0, [((R + RC) / 2) * Math.cos((a0 + a1) / 2 * DEG), y - gro - 0.04, -((R + RC) / 2) * Math.sin((a0 + a1) / 2 * DEG)], [0.05, 0.08, R - RC], col)); /* nervio bajo el peldaño */
        if (d.barandas !== 'ninguna') { const am = (a0 + a1) / 2 * DEG, rb = R - 0.05, p = [rb * Math.cos(am), y, -rb * Math.sin(am)]; out.push(caja(M0, [p[0], y + ab / 2, p[2]], [0.03, ab, 0.03], bc)); top.push([p[0], y + ab, p[2]]); }
      }
      for (let k = 1; k < top.length; k++) out.push(barra(M0, top[k - 1], top[k], 0.045, bc));
      return out;
    }
    /* U */
    const u = datosU(d), L1 = []; for (let k = 0; k < u.n1 - 1; k++) L1.push(u.h); L1.push(u.W);
    tramo(out, M0, 0, c, L1, u.W, d, col, null);
    const yD = u.n1 * c; out.push(caja(M0, [(u.n1 - 1) * u.h + u.W / 2, yD / 2, u.zc / 2], [u.W, yD, 2 * u.W + u.g], col)); /* descanso que ocupa los dos tramos */
    const M2 = mul(M0.clone(), tras((u.n1 - 1) * u.h, 0, u.zc), rotY(Math.PI)), L2 = []; for (let k = 0; k < u.n2; k++) L2.push(u.h);
    tramo(out, M2, yD, c, L2, u.W, d, col, null);
    if (d.barandas !== 'ninguna') { const xe = (u.n1 - 1) * u.h + u.W - 0.05, zA = -u.s * u.W / 2, zB = u.zc + u.s * u.W / 2; out.push(barra(M0, [xe, yD + ab, zA], [xe, yD + ab, zB], 0.05, bc)); for (const z of [zA, (zA + zB) / 2, zB]) out.push(caja(M0, [xe, yD + ab / 2, z], [0.04, ab, 0.04], bc)); }
    return out;
  }
  /* ---------- rampa con descansos ---------- */
  const extraRampa = (d?) => Math.max(0, Math.min(6, Math.round(+d.descansos || 0))) * Math.max(0.8, +d.largoDescansoRampa || 1.5);
  function perfilRampa(d?) { const k = Math.max(0, Math.min(6, Math.round(+d.descansos || 0))), Ld = Math.max(0.8, +d.largoDescansoRampa || 1.5), ls = d.largo / (k + 1), hs = d.alto / (k + 1), pts = [[0, 0]]; let x = 0, y = 0;
    for (let i = 0; i <= k; i++) { x += ls; y += hs; pts.push([x, y]); if (i < k) { x += Ld; pts.push([x, y]); } } const Dz = Math.max(0, +d.descanso || 0); if (Dz > 0) { x += Dz; pts.push([x, y]); } return { sup: pts, X: x }; }
  function partesRampa(d?, col?) {
    const out = [], W = d.ancho, M0 = tras(-d.sx / 2, 0, 0), { sup, X } = perfilRampa(d); out.push(perfil(M0, sup.concat([[X, 0]]), -W / 2, W / 2, col));
    if (d.bordillos !== false) for (const z of [-W / 2 + 0.05, W / 2 - 0.05]) out.push(perfil(M0, sup.map(([x, y]) => [x, y + 0.1]).concat(sup.slice().reverse()), z - 0.05, z + 0.05, '#8a857c'));
    const bc = d.colorBaranda || '#4a4f55', lados = d.barandas === 'ninguna' ? [] : d.barandas === 'izq' ? [-1] : d.barandas === 'der' ? [1] : [-1, 1];
    for (const s of lados) { const z = s * (W / 2 - 0.05); for (let i = 1; i < sup.length; i++) { const a = sup[i - 1], b = sup[i]; out.push(barra(M0, [a[0], a[1] + 1.0, z], [b[0], b[1] + 1.0, z], 0.05, bc)); out.push(barra(M0, [a[0], a[1] + 0.8, z], [b[0], b[1] + 0.8, z], 0.035, bc)); }
      for (const [x, y] of sup) out.push(caja(M0, [Math.min(X - 0.05, Math.max(0.05, x)), y + 0.5, z], [0.04, 1.0, 0.04], bc)); }
    return out;
  }
  /* ---------- crear ---------- */
  function crearCaracol(datos?) { return OOEscaleras.crear(Object.assign({ forma: 'caracol', radio: 1, ancho: 0.9, barandas: 'der', estilo: 'zanca', color: '#7d858c' }, datos), 'Crear escalera de caracol'); }
  function crearU(datos?) { return OOEscaleras.crear(Object.assign({ forma: 'U', hueco: 0.1 }, datos), 'Crear escalera en U'); }

  /* ---------- baranda por el borde de un piso ---------- */
  const PB = { estilo: 'tubos', modo: 'todo', paredes: true, escaleras: true, retiro: 0.05 }; A.params.barandaBorde = PB;
  function contorno(o?) { const hu = window.OOAnclajes ? OOAnclajes.huella(o.tipo, o.datos) : null; return hu && hu.length >= 3 ? hu : null; }
  function areaF(p?) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  const distSeg = (x?, z?, a?, b?) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let t = L2 > 1e-12 ? ((x - a[0]) * dx + (z - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
  /* lados [a, b] del contorno, cada uno con los tramos libres (sin pared y con paso para las escaleras) */
  function ladosBorde(id?, opts?) {
    opts = Object.assign({}, PB, opts || {}); const o = nv().get(id); if (!o) return []; const pts = contorno(o); if (!pts) return []; const top = OOAnclajes.tope(o.tipo, o.datos), sg = areaF(pts) > 0 ? 1 : -1, out = [];
    const muros = opts.paredes ? [...nv().values()].filter((w?) => tb(w.tipo) === 'muro' && (+w.datos.y || 0) >= top - 0.3 && (+w.datos.y || 0) <= top + 0.3) : [];
    const llegadas = opts.escaleras ? [...nv().values()].filter((s?) => (tb(s.tipo) === 'escalera' && (!s.datos.forma || s.datos.forma === 'recta')) || tb(s.tipo) === 'rampa').map((s?) => { const d = s.datos, g = (+d.giroY || 0) * DEG, L = +d.sx || 0; return { x: (+d.x || 0) + Math.cos(g) * L / 2, z: (+d.z || 0) - Math.sin(g) * L / 2, y: (+d.y || 0) + (+d.alto || 0), w: (+d.ancho || 1.2) + 0.1 }; }).filter((l?) => Math.abs(l.y - top) < 0.2) : [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz * sg, nz = ux * sg, rt = opts.retiro; /* normal hacia dentro */
      const conPared = muros.some((w?) => { const d = w.datos, g = (+d.giroY || 0) * DEG, hl = (+d.sx || 0) / 2, p1 = [(+d.x || 0) - Math.cos(g) * hl, (+d.z || 0) + Math.sin(g) * hl], p2 = [(+d.x || 0) + Math.cos(g) * hl, (+d.z || 0) - Math.sin(g) * hl]; return distSeg((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, a, b) < 0.35 && distSeg(p1[0], p1[1], a, b) < 0.35 && distSeg(p2[0], p2[1], a, b) < 0.35 && hl * 2 > L * 0.5; });
      if (conPared) continue;
      let tramos = [[0, L]];
      for (const l of llegadas) { if (distSeg(l.x, l.z, a, b) > 0.6) continue; const t = (l.x - a[0]) * ux + (l.z - a[1]) * uz, c0 = t - l.w / 2, c1 = t + l.w / 2; tramos = tramos.flatMap(([s, e]) => (c1 <= s || c0 >= e) ? [[s, e]] : [[s, c0], [c1, e]].filter(([x, y]) => y - x > 0.3)); }
      for (const [s, e] of tramos) out.push({ lado: i, a: [a[0] + ux * s + nx * rt, a[1] + uz * s + nz * rt], b: [a[0] + ux * e + nx * rt, a[1] + uz * e + nz * rt], y: top });
    }
    return out;
  }
  function barandaBorde(id?, opts?) {
    opts = Object.assign({}, PB, opts || {}); const o = nv().get(id); if (!o) return []; let L = ladosBorde(id, opts); if (opts.lado != null) L = L.filter((t?) => t.lado === opts.lado); if (!L.length) { A.pista('No queda ningún borde libre (tiene paredes o es muy pequeño).'); return []; }
    const est = (window.OORevestimientos && OORevestimientos.DEF[opts.estilo]) ? opts.estilo : 'tubos', DF = window.OORevestimientos ? OORevestimientos.DEF[est] : { sy: 1, sz: 0.06, color: '#4a4f55' }, tipoSop = tb(o.tipo) === 'fundacion' ? 'fundacion' : 'piso';
    const lista = [], ids = [];
    for (const t of L) { const dm = A.datosMuro(new V3(t.a[0], t.y, t.a[1]), new V3(t.b[0], t.y, t.b[1])); const d: any = { x: dm.x, y: t.y, z: dm.z, giroY: dm.giroY, sx: dm.sx, sy: DF.sy, sz: DF.sz, estilo: est, color: DF.color, soporte: { tipo: tipoSop, id, manual: true }, borde_de: id };
      if (o.datos.nivel) { d.nivel = o.datos.nivel; d.edificio = o.datos.edificio; } const nid = A.nuevoId() + 'b' + lista.length; ids.push(nid); lista.push({ id: nid, data: A.docNuevo(nid, 'baranda', d, { props: { nombre: est === 'pretil' ? 'Pretil del borde' : 'Baranda del borde' } }) }); }
    A.guardar(lista, { etiqueta: 'Baranda por el borde (' + lista.length + ' tramos)' }); return ids;
  }
  E.agregarHerramientaPropia('baranda-borde', {
    n: 'Baranda por el borde', ic: 'baranda', pista: 'Clic en un piso, una losa, una fundación o una plataforma: pone barandas en su borde (todo el contorno o el lado clicado).',
    up: (e?, mov?) => {
      if (mov > 6) return; const h = A.pickEvento(e); let o = h && h.key[0] === 'n' ? nv().get(h.key.slice(1)) : null;
      if (!o || !['habitacion', 'fundacion'].includes(tb(o.tipo))) { const p = A.puntoPlano(e, A.planoTrabajo); o = p ? [...nv().values()].filter((x?) => ['habitacion', 'fundacion'].includes(tb(x.tipo))).find((x?) => { const c = contorno(x); return c && A.dentroPoligono(p.x, p.z, c); }) : null; }
      if (!o) { A.pista('Haz clic sobre un piso, una losa o una plataforma.'); return; }
      let lado = null; if (PB.modo === 'lado' && h) { const c = contorno(o); let md = Infinity; c.forEach((a?, i?) => { const b = c[(i + 1) % c.length], dd = distSeg(h.point.x, h.point.z, a, b); if (dd < md) { md = dd; lado = i; } }); }
      const ids = barandaBorde(o.id, { lado }); if (ids.length) A.seleccionar(ids.map((i?) => 'n' + i), { sinTab: true });
    },
    panel: () => `<div class="campos"><label class="campo ancho"><span>Estilo</span><select data-bb="estilo">${(window.OORevestimientos ? OORevestimientos.ESTILOS : [['tubos', 'Tubos']]).map(([k, n]) => `<option value="${k}"${PB.estilo === k ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label>
      <label class="campo ancho"><span>Dónde</span><select data-bb="modo"><option value="todo"${PB.modo === 'todo' ? ' selected' : ''}>Todo el contorno</option><option value="lado"${PB.modo === 'lado' ? ' selected' : ''}>Solo el lado clicado</option></select></label>
      <label class="chk"><input type="checkbox" data-bb="paredes"${PB.paredes ? ' checked' : ''}> Saltar los lados con pared</label><label class="chk"><input type="checkbox" data-bb="escaleras"${PB.escaleras ? ' checked' : ''}> Dejar paso a escaleras y rampas</label></div>`
  });
  E.agregarHerramienta('construir', { h: 'baranda-borde', n: 'Baranda por el borde de un piso', ic: 'baranda' });
  E.agregarHerramienta('construir', { n: 'Escalera de caracol', ic: 'escalera', fn: () => { A.params.escalera.forma = 'caracol'; A.ponerHerramienta('escalera', { forzar: true }); } });
  E.agregarHerramienta('construir', { n: 'Escalera en U', ic: 'escalera', fn: () => { A.params.escalera.forma = 'U'; A.ponerHerramienta('escalera', { forzar: true }); } });

  /* ---------- inspector ---------- */
  function sel1() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; return nv().get(A.sel[0].slice(1)) || null; }
  const num = (k?, l?, v?, st?) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.05}" data-ep5="${k}" value="${r3(+v || 0)}"></label>`;
  E.on('panel', () => {
    if (A.herramienta !== 'sel') return; const o = sel1(), c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c) return; const b = tb(o.tipo), d = o.datos; let h = '';
    if (b === 'escalera' && d.forma === 'caracol') h = `<details class="sec" open data-sec="esc-pro"><summary>Caracol</summary><div class="campos">${num('radio', 'Radio (m)', d.radio)}${num('anguloPeldano', 'Grados por peldaño', d.anguloPeldano, 1)}<p class="ayuda">${d.n} peldaños · vuelta de ${A.fmt(d.giroTotal || 0, 0)}°</p></div></details>`;
    else if (b === 'escalera' && d.forma === 'U') h = `<details class="sec" open data-sec="esc-pro"><summary>Escalera en U</summary><div class="campos">${num('hueco', 'Hueco entre tramos (m)', d.hueco)}</div></details>`;
    else if (b === 'rampa') h = `<details class="sec" open data-sec="esc-pro"><summary>Descansos de la rampa</summary><div class="campos">${num('descansos', 'Descansos intermedios', d.descansos || 0, 1)}${num('largoDescansoRampa', 'Largo de cada descanso (m)', d.largoDescansoRampa || 1.5)}${(+d.largo || 0) > 9 && !(+d.descansos) ? '<p class="aviso">Más de 9 m de rampa seguida: conviene un descanso.</p>' : ''}</div></details>`;
    else if (b === 'habitacion' || b === 'fundacion') h = `<details class="sec" data-sec="baranda-borde"><summary>Baranda por el borde</summary><div class="campos"><p class="ayuda" style="margin:0">${ladosBorde(o.id).length} tramos libres en el borde.</p><div class="fila"><button data-ep5-a="borde">Poner barandas en el borde</button></div></div></details>`;
    if (!h) return; const div = document.createElement('div'); div.innerHTML = h; const ref = c.querySelector('[data-sec="escalera"]') || c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.bb) { PB[el.dataset.bb] = el.type === 'checkbox' ? el.checked : el.value; return; }
    if (el.dataset.ep5) { const o = sel1(); const v = parseFloat(el.value); if (!o || !isFinite(v)) return; const k = el.dataset.ep5; OOEscaleras.cambiar(o.id, { [k]: k === 'descansos' ? Math.max(0, Math.min(6, Math.round(v))) : v }); }
  });
  document.addEventListener('click', (e?) => { const b = e.target.closest && e.target.closest('[data-ep5-a]'); if (!b) return; const o = sel1(); if (o && b.dataset.ep5A === 'borde') { const ids = barandaBorde(o.id); if (ids.length) A.seleccionar(ids.map((i?) => 'n' + i)); } });

  window.OOEscalerasPro = { maneja, caja: caja_, desfase, huellas, partes, extraRampa, partesRampa, perfilRampa, crearCaracol, crearU, barandaBorde, ladosBorde, params: PB };
})();
