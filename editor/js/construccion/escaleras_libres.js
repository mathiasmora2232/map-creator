/* Editor del mapa: escalera libre. Es el mismo objeto `escalera` con `forma: 'libre'` y una lista de tramos:
     tramos = [{ largo, giro }]   largo del eje del tramo (m) y giro al final en grados (+ izquierda, − derecha; 0 = pausa recta).
   Entre dos tramos hay un descanso: si gira (virada) ocupa el ancho de la escalera en la esquina; si sigue recto (pausa) mide
   `largoDescanso` (por defecto el ancho). Los peldaños (contrahuella ≤ 18 cm, calculada del desnivel) se reparten entre los tramos según
   su largo, así cada tramo sale con la huella más pareja posible; un tramo demasiado corto queda como pasillo plano.
   Usa los mismos estilos de peldaño y de baranda que las demás escaleras (escaleras.js) y abre solo los huecos de pisos y techos.
   Herramienta Construir → «Escalera libre»: clic en el pie y un clic por esquina (el giro se imanta cada 15°; con Mayús, libre). Termina
   con Enter, doble clic o un clic sobre el piso de arriba (toma su altura). Retroceso quita el último punto.
   Inspector: tabla de tramos (largo y giro de cada uno), añadir o quitar tramos y «Ajustar a peldaños cómodos».
   API: OOEscalerasLibres.crear(pie [x, y, z], giroY, tramos, datos), plan(datos). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !window.OOEscaleras) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase;
  const ES = window.OOEscaleras, H = ES._h, { tramo, caja, mul, tras, rotY, baranda, tono } = H;
  A.ICON.escalera_libre = '<path d="M3 20h4v-4h4v-4"/><path d="M11 12h3v-3"/><path d="M14 9l4-4h3"/>';
  const PL = { alto: 2.8 };
  A.params.escalera_libre = PL;
  const MAX_GIRO = 135, HUELLA_IDEAL = 0.28;

  const maneja = d => !!d && d.forma === 'libre';
  const normGiro = g => { g = ((+g || 0) % 360 + 540) % 360 - 180; return Math.max(-MAX_GIRO, Math.min(MAX_GIRO, g)); };
  function tramosDe(d) {
    const t = Array.isArray(d.tramos) && d.tramos.length ? d.tramos : [{ largo: Math.max(1, +d.sx || 3), giro: 0 }];
    return t.slice(0, 12).map(x => ({ largo: Math.max(0.3, Math.min(60, +x.largo || 1)), giro: normGiro(x.giro) }));
  }

  /* reparte N contrahuellas entre los tramos según su largo útil (al menos 1 en los que tienen sitio) */
  function repartir(runs, N) {
    const tot = runs.reduce((a, b) => a + b, 0), m = runs.map(r => (r > 0.12 && tot > 0 ? Math.max(1, Math.round(N * r / tot)) : 0));
    let sum = m.reduce((a, b) => a + b, 0);
    if (!sum) { m[m.length - 1] = N; return m; }
    while (sum > N) {
      let best = -1, bv = -1; m.forEach((v, i) => { if (v > 1 && v / runs[i] > bv) { bv = v / runs[i]; best = i; } });
      if (best < 0) { let j = -1, jr = 1e9; m.forEach((v, i) => { if (v === 1 && runs[i] < jr) { jr = runs[i]; j = i; } }); if (j < 0) break; m[j] = 0; }
      else m[best]--;
      sum--;
    }
    while (sum < N) { let best = 0, bv = -1; m.forEach((v, i) => { if (runs[i] > 0.12) { const t = runs[i] / (v + 1); if (t > bv) { bv = t; best = i; } } }); m[best]++; sum++; }
    return m;
  }

  function envolvente(pts) { /* casco convexo (cadena monótona) */
    const p = pts.map(q => [r3(q[0]), r3(q[1])]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }

  /* plan en el marco del pie (sube hacia +X, +Z = derecha): segmentos, tramos con sus peldaños, descansos y caja */
  function plan(d) {
    const W = Math.max(0.5, +d.ancho || 1.2), Ld = Math.max(W, +d.largoDescanso || 0) || W, tr = tramosDe(d), n = tr.length;
    const N = Math.max(1, +d.n || Math.ceil((+d.alto || 2.8) / 0.18)), c = +d.contrahuella || (+d.alto || 2.8) / N;
    const segs = []; let p = [0, 0], th = 0;
    for (let i = 0; i < n; i++) {
      const dir = [Math.cos(th), -Math.sin(th)], der = [Math.sin(th), Math.cos(th)], q = [p[0] + dir[0] * tr[i].largo, p[1] + dir[1] * tr[i].largo];
      segs.push({ p, q, th, dir, der, L: tr[i].largo }); p = q; if (i < n - 1) th += tr[i].giro * DEG;
    }
    const medio = i => (Math.abs(tr[i].giro) < 5 ? Ld / 2 : W / 2);
    const runs = segs.map((s, i) => { const s0 = i > 0 ? medio(i - 1) : 0, s1 = s.L - (i < n - 1 ? medio(i) : 0); s.s0 = s0; return Math.max(0, s1 - s0); });
    if (runs.reduce((a, b) => a + b, 0) < 0.2) runs[n - 1] = HUELLA_IDEAL * N; /* recorrido sin sitio: el último tramo se alarga */
    const m = repartir(runs, N);
    let acum = 0; const tramos = [], losas = [];
    const en = (s, x, z) => [s.p[0] + s.dir[0] * x + s.der[0] * z, s.p[1] + s.dir[1] * x + s.der[1] * z];
    segs.forEach((s, i) => {
      const y0 = acum * c, run = runs[i];
      tramos.push({ i, s0: s.s0, run, m: m[i], t: m[i] ? run / m[i] : 0, y0 });
      if (!m[i] && run > 0.05) losas.push({ pts: [en(s, s.s0, -W / 2), en(s, s.s0 + run, -W / 2), en(s, s.s0 + run, W / 2), en(s, s.s0, W / 2)], y: y0, pasillo: true });
      acum += m[i];
      if (i < n - 1) { /* descanso en la esquina i */
        const s2 = segs[i + 1], hi = medio(i), q = s.q, pts = [];
        for (const z of [-W / 2, W / 2]) { pts.push(en(s, s.L - hi, z), en(s, s.L, z)); pts.push([q[0] + s2.der[0] * z, q[1] + s2.der[1] * z], [q[0] + s2.dir[0] * hi + s2.der[0] * z, q[1] + s2.dir[1] * hi + s2.der[1] * z]); }
        losas.push({ pts: envolvente(pts), y: acum * c, giro: tr[i].giro, i });
      }
    });
    const huellas = tramos.filter(f => f.run > 0.01).map(f => { const s = segs[f.i]; return [en(s, f.s0, -W / 2), en(s, f.s0 + f.run, -W / 2), en(s, f.s0 + f.run, W / 2), en(s, f.s0, W / 2)]; }).concat(losas.map(l => l.pts));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const h of huellas) for (const [x, z] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (!isFinite(x0)) { x0 = 0; x1 = 1; z0 = -W / 2; z1 = W / 2; }
    return { W, c, N, tr, segs, tramos, losas, huellas, caja: [x0, x1, z0, z1] };
  }

  function caja_(d) {
    d.tramos = tramosDe(d).map(t => ({ largo: r3(t.largo), giro: r3(t.giro) }));
    const P = plan(d), [x0, x1, z0, z1] = P.caja, con = P.tramos.filter(f => f.m);
    d.sx = r3(x1 - x0); d.sz = r3(z1 - z0);
    if (con.length) d.huella = r3(con.reduce((a, f) => a + f.t, 0) / con.length);
    return d;
  }
  function desfase(d) { const [x0, x1, z0, z1] = plan(d).caja; return [(x0 + x1) / 2, (z0 + z1) / 2]; }

  function partes(d, col, M0) {
    const P = plan(d), out = [], W = P.W, c = P.c, est = d.estilo || 'maciza';
    const colLosa = est === 'metalica' ? (d.colorPeldano || '#80868b') : col, zc = d.colorZanca || (est === 'madera' ? tono(col, 0.7) : est === 'metalica' ? '#3a3f44' : '#5d666b');
    for (const f of P.tramos) {
      if (!f.m) continue; const s = P.segs[f.i];
      const Mf = mul(M0.clone(), tras(s.p[0] + s.dir[0] * f.s0, 0, s.p[1] + s.dir[1] * f.s0), rotY(s.th));
      tramo(out, Mf, f.y0, c, new Array(f.m).fill(f.t), W, d, col, null);
    }
    for (const l of P.losas) {
      if (l.y < 0.02) continue;
      if (est === 'maciza') out.push({ f: 'poly', pts: l.pts, y: 0, grosor: l.y, c: col, lm: M0.toArray() });
      else {
        const g = est === 'flotante' ? 0.09 : 0.12; out.push({ f: 'poly', pts: l.pts, y: l.y - g, grosor: g, c: colLosa, lm: M0.toArray() });
        if (est !== 'flotante' && l.y - g > 0.05) { const vs = l.pts.length > 6 ? l.pts.filter((_, k) => k % 2 === 0) : l.pts; for (const [x, z] of vs) out.push(caja(M0, [x, (l.y - g) / 2, z], [0.07, l.y - g, 0.07], zc)); }
      }
    }
    /* barandas de los descansos: unen el final de un tramo con el principio del siguiente; por fuera de la virada pasan por la esquina */
    const lados = d.barandas === 'ninguna' ? [] : d.barandas === 'izq' ? [-1] : d.barandas === 'der' ? [1] : [-1, 1];
    for (const l of P.losas) {
      if (l.pasillo || l.i == null) continue;
      const fa = P.tramos[l.i], fb = P.tramos[l.i + 1], sa = P.segs[l.i], sb = P.segs[l.i + 1];
      for (const s of lados) {
        const z = s * (W / 2 - 0.05);
        const xa = fa.m ? fa.s0 + (fa.m - 1) * fa.t + 0.12 : sa.L - W / 2, xb = fb.m ? fb.s0 + 0.12 : W / 2;
        const a2 = [sa.p[0] + sa.dir[0] * xa + sa.der[0] * z, sa.p[1] + sa.dir[1] * xa + sa.der[1] * z];
        const b2 = [sb.p[0] + sb.dir[0] * xb + sb.der[0] * z, sb.p[1] + sb.dir[1] * xb + sb.der[1] * z];
        const ya = l.y, yb = fb.m ? l.y + c : l.y, fuera = Math.abs(l.giro) >= 5 && ((l.giro > 0 && s > 0) || (l.giro < 0 && s < 0));
        let esq = null;
        if (fuera) { /* intersección de las dos líneas de baranda */
          const cr = sa.dir[0] * sb.dir[1] - sa.dir[1] * sb.dir[0];
          if (Math.abs(cr) > 1e-4) { const dx = b2[0] - a2[0], dz = b2[1] - a2[1], u = (dx * sb.dir[1] - dz * sb.dir[0]) / cr; esq = [a2[0] + sa.dir[0] * u, a2[1] + sa.dir[1] * u]; }
        }
        if (esq) { baranda(out, M0, [a2[0], ya, a2[1]], [esq[0], ya, esq[1]], d); baranda(out, M0, [esq[0], ya, esq[1]], [b2[0], yb, b2[1]], d, { sinPrimero: true }); }
        else baranda(out, M0, [a2[0], ya, a2[1]], [b2[0], yb, b2[1]], d);
      }
    }
    return out;
  }
  function huellas(d, w) { return plan(d).huellas.map(h => h.map(w)); }

  /* pasar una escalera recta / L / U a libre conservando su recorrido aproximado */
  function desdeForma(d) {
    const W = +d.ancho || 1.2, L = Math.max(1, (+d.n || 10) * (+d.huella || HUELLA_IDEAL));
    let tramos;
    if (d.forma === 'L') tramos = [{ largo: r3(L / 2 + W / 2), giro: d.giro === 'der' ? -90 : 90 }, { largo: r3(L / 2 + W / 2), giro: 0 }];
    else if (d.forma === 'U') tramos = [{ largo: r3(L / 2 + W / 2), giro: d.giro === 'der' ? -90 : 90 }, { largo: r3(W + (+d.hueco || 0.1)), giro: d.giro === 'der' ? -90 : 90 }, { largo: r3(L / 2 + W / 2), giro: 0 }];
    else tramos = d.descanso ? [{ largo: r3(L / 2 + W / 2), giro: 0 }, { largo: r3(L / 2 + W / 2), giro: 0 }] : [{ largo: r3(L), giro: 0 }];
    return { forma: 'libre', tramos };
  }

  /* ajusta los largos para que cada tramo tenga huellas de ~28 cm (manteniendo las proporciones y los giros) */
  function ajustarComodo(d) {
    const P = plan(d), tr = tramosDe(d), con = P.tramos.filter(f => f.m);
    if (!con.length) return null;
    return { tramos: tr.map((t, i) => { const f = P.tramos[i]; if (!f.m) return { largo: t.largo, giro: t.giro }; const extra = t.largo - f.run; return { largo: r3(Math.max(0.3, f.m * HUELLA_IDEAL + extra)), giro: t.giro }; }) };
  }

  function crear(pie, giroY, tramos, datos) {
    const d = Object.assign({ giroY: r3(giroY), y: pie[1] }, ES.params, { forma: 'libre', tramos }, datos || {});
    ES.normalizar(d); ES.conPie(d, [pie[0], pie[2]]);
    return ES.crear(d, 'Crear escalera libre');
  }

  /* ---------- herramienta: clic en el pie y en cada esquina ---------- */
  let pts = [], ultimoE = null;
  const rumbo = (a, b) => Math.atan2(-(b.z - a.z), b.x - a.x);
  function encajar(p, libre) {
    const n = pts.length, last = pts[n - 1], L = Math.hypot(p.x - last.x, p.z - last.z), th = rumbo(last, p);
    if (libre || L < 0.05) return new V3(p.x, pts[0].y, p.z);
    const paso = 15 * DEG; let thS;
    if (n >= 2) { const prev = rumbo(pts[n - 2], last); let rel = th - prev; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); rel = Math.max(-MAX_GIRO * DEG, Math.min(MAX_GIRO * DEG, Math.round(rel / paso) * paso)); thS = prev + rel; }
    else thS = Math.round(th / paso) * paso;
    return new V3(last.x + Math.cos(thS) * L, pts[0].y, last.z - Math.sin(thS) * L);
  }
  function datosDe(lista, alto) {
    if (lista.length < 2) return null;
    const ths = [], tramos = [];
    for (let i = 0; i + 1 < lista.length; i++) { const L = Math.hypot(lista[i + 1].x - lista[i].x, lista[i + 1].z - lista[i].z); if (L < 0.05) continue; ths.push(rumbo(lista[i], lista[i + 1])); tramos.push({ largo: r3(L), giro: 0 }); }
    if (!tramos.length) return null;
    for (let i = 0; i + 1 < tramos.length; i++) tramos[i].giro = r3(normGiro((ths[i + 1] - ths[i]) / DEG));
    const pie = lista[0], d = Object.assign({}, ES.params, { forma: 'libre', y: pie.y, giroY: r3(ths[0] / DEG), alto: r3(Math.max(0.2, alto || +PL.alto || 2.8)), tramos });
    ES.normalizar(d); ES.conPie(d, [pie.x, pie.z]); return d;
  }
  const arriba = e => { const h = A.pickEvento(e); return h && h.normal.y > 0.6 && pts.length && h.point.y - pts[0].y > 0.3 ? h.point : null; };
  function etiqueta(d) {
    const P = plan(d), con = P.tramos.filter(f => f.m), t = con.length ? con.reduce((a, f) => a + f.t, 0) / con.length : 0;
    const ult = d.tramos[d.tramos.length - 1], giros = d.tramos.slice(0, -1).map(x => x.giro);
    return d.n + ' peldaños · ' + d.tramos.length + (d.tramos.length > 1 ? ' tramos' : ' tramo') + ' · huella ' + A.fmt(t * 100, 0) + ' cm · último ' + A.fmt(ult.largo) + ' m'
      + (giros.length ? ' · giros ' + giros.map(g => (g > 0 ? '+' : '') + A.fmt(g, 0) + '°').join(' ') : '') + (t && (t < 0.22 || t > 0.4) ? ' · ⚠ huella ' + (t < 0.22 ? 'corta' : 'larga') : '');
  }
  function previa(e, extra) {
    if (!pts.length) return;
    const lista = extra ? pts.concat([extra]) : pts; const hit = e ? arriba(e) : null, d = datosDe(lista, hit ? hit.y - pts[0].y : null);
    if (!d) { A.limpiarPrevia(); A.etqVivas = []; return; }
    A.mostrarPrevia('escalera', d);
    const q = lista[lista.length - 1]; A.etqVivas = [{ p: new V3(q.x, pts[0].y + d.alto + 0.5, q.z), t: etiqueta(d) }];
  }
  function terminar(alto) {
    const d = datosDe(pts, alto); pts = []; A.limpiarPrevia(); A.etqVivas = []; A.ocultarInferencia();
    if (!d) { A.pista('Haz al menos un tramo: clic en el pie y clic donde termina.'); return; }
    const id = ES.crear(d, 'Crear escalera libre'); if (id) A.seleccionar(['n' + id], { sinTab: true });
  }
  const num = (k, l, v, st) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.05}" data-elp="${k}" value="${r3(+v || 0)}"></label>`;
  E.agregarHerramientaPropia('escalera_libre', {
    n: 'Escalera libre', ic: 'escalera_libre',
    pista: 'Clic en el pie y un clic en cada esquina: si giras, ahí va un descanso con virada; si sigues recto, una pausa. El giro se imanta cada 15° (Mayús: libre). Termina con Enter, doble clic o un clic sobre el piso de arriba (toma su altura). Retroceso quita el último punto.',
    opciones: () => { pts = []; },
    move: e => { ultimoE = e; if (!pts.length) return; const inf = A.inferir(e, pts[pts.length - 1]); if (!inf) return; previa(e, encajar(inf.p, e.shiftKey)); },
    up: (e, mov) => {
      if (mov > 6) return; const inf = A.inferir(e, pts.length ? pts[pts.length - 1] : null); if (!inf) return;
      if (!pts.length) { pts = [inf.p.clone()]; A.punto3D(pts[0]); return; }
      const q = encajar(inf.p, e.shiftKey), hit = arriba(e);
      if (hit) { pts.push(q); terminar(hit.y - pts[0].y); return; }
      if (q.distanceTo(pts[pts.length - 1]) < 0.2) { terminar(); return; } /* doble clic en el mismo punto */
      pts.push(q); A.punto3D(q); previa(e);
    },
    fin: () => { pts = []; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => {
      const PE = ES.params;
      return `<div class="campos">${num('alto', 'Altura a subir (m)', PL.alto)}${H.opc('ep', 'diseno', 'Diseño', '', H.OPC_DISENOS)}${H.num('ep', 'ancho', 'Ancho (m)', PE.ancho)}${H.num('ep', 'largoDescanso', 'Largo de las pausas (m)', PE.largoDescanso || PE.ancho)}${H.opc('ep', 'estilo', 'Peldaños', PE.estilo, H.ESTILOS)}${H.opc('ep', 'barandas', 'Barandas', PE.barandas, H.BAR)}${H.opc('ep', 'estiloBaranda', 'Tipo de baranda', PE.estiloBaranda || 'tubo', H.ESTILOS_BARANDA)}</div>
        <p class="ayuda">Si el último clic cae sobre un piso o una losa más alta, la escalera toma su altura y abre el hueco sola.</p>`;
    }
  });
  E.agregarHerramienta('construir', { h: 'escalera_libre', n: 'Escalera libre' });
  document.addEventListener('keydown', e => {
    if (A.herramienta !== 'escalera_libre' || !pts.length || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); terminar(); }
    else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); pts.pop(); if (pts.length) previa(ultimoE, null); else { A.limpiarPrevia(); A.etqVivas = []; } }
  }, true);
  document.addEventListener('change', e => { const el = e.target; if (el && el.dataset && el.dataset.elp) { const v = parseFloat(el.value); if (isFinite(v) && v > 0) PL[el.dataset.elp] = v; } });

  /* ---------- inspector: tramos ---------- */
  E.on('panel', () => {
    const o = ES.selEsc && ES.selEsc(); const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c || !maneja(o.datos)) return;
    const d = o.datos, P = plan(d), tr = tramosDe(d);
    const filas = tr.map((t, i) => {
      const f = P.tramos[i], aviso = f.m && (f.t < 0.22 || f.t > 0.4);
      return `<tr><td class="mono">${i + 1}</td><td><input type="number" step="0.05" min="0.3" data-elt="largo" data-i="${i}" value="${r3(t.largo)}" aria-label="Largo del tramo ${i + 1}"></td>
        <td>${i < tr.length - 1 ? `<input type="number" step="15" min="-${MAX_GIRO}" max="${MAX_GIRO}" data-elt="giro" data-i="${i}" value="${r3(t.giro)}" aria-label="Giro al final del tramo ${i + 1}">` : '<span class="tenue">—</span>'}</td>
        <td class="mono${aviso ? ' aviso-huella' : ''}" title="${f.m ? 'Huella ' + A.fmt(f.t * 100, 1) + ' cm' : 'Pasillo plano'}">${f.m ? f.m + ' × ' + A.fmt(f.t * 100, 0) : 'plano'}</td></tr>`;
    }).join('');
    const sec = document.createElement('details'); sec.className = 'sec'; sec.open = true; sec.dataset.sec = 'escalera-libre';
    sec.innerHTML = `<summary>Tramos y descansos</summary>
      <p class="ayuda" style="margin:0 0 6px">Giro al final de cada tramo: + izquierda, − derecha, 0 = pausa recta (descanso sin girar). Columna derecha: peldaños × huella (cm).</p>
      <table class="tabla-tramos"><thead><tr><th>#</th><th>Largo (m)</th><th>Giro (°)</th><th>Peldaños</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="campos">${H.num('ei', 'largoDescanso', 'Largo de las pausas (m)', d.largoDescanso || d.ancho)}</div>
      <div class="fila"><button data-ela="mas-izq">+ Tramo a la izquierda</button><button data-ela="mas-der">+ Tramo a la derecha</button><button data-ela="mas-recto">+ Pausa recta</button></div>
      <div class="fila"><button data-ela="menos"${tr.length < 2 ? ' disabled' : ''}>Quitar el último tramo</button><button data-ela="comodo">Ajustar a peldaños cómodos</button><button data-ela="invertir">Girar al otro lado</button></div>`;
    const ref = c.querySelector('[data-sec="escalera"]'); if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.elt) return; const o = ES.selEsc && ES.selEsc(); if (!o || !maneja(o.datos)) return;
    const v = parseFloat(el.value); if (!isFinite(v)) return; const tr = tramosDe(o.datos).map(t => Object.assign({}, t)); const i = +el.dataset.i;
    if (!tr[i]) return; tr[i][el.dataset.elt] = el.dataset.elt === 'giro' ? normGiro(v) : Math.max(0.3, v);
    ES.cambiar(o.id, { tramos: tr }, el.dataset.elt === 'giro' ? 'Cambiar el giro del tramo' : 'Cambiar el largo del tramo');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ela]'); if (!b) return; const o = ES.selEsc && ES.selEsc(); if (!o || !maneja(o.datos)) return;
    const tr = tramosDe(o.datos).map(t => Object.assign({}, t)), a = b.dataset.ela;
    if (a.startsWith('mas-')) { tr[tr.length - 1].giro = a === 'mas-izq' ? 90 : a === 'mas-der' ? -90 : 0; tr.push({ largo: r3(Math.max(1.5, tr[tr.length - 1].largo)), giro: 0 }); ES.cambiar(o.id, { tramos: tr }, 'Añadir un tramo'); }
    else if (a === 'menos' && tr.length > 1) { tr.pop(); tr[tr.length - 1].giro = 0; ES.cambiar(o.id, { tramos: tr }, 'Quitar un tramo'); }
    else if (a === 'comodo') { const c = ajustarComodo(o.datos); if (c) ES.cambiar(o.id, c, 'Ajustar a peldaños cómodos'); }
    else if (a === 'invertir') ES.cambiar(o.id, { tramos: tr.map(t => ({ largo: t.largo, giro: -t.giro })) }, 'Girar la escalera al otro lado');
  });

  window.OOEscalerasLibres = { maneja, plan, caja: caja_, desfase, partes, huellas, desdeForma, ajustarComodo, crear, tramosDe };
})();
