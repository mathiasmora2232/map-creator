/* Editor del mapa (2.1): redimensionar habitaciones sin arrastrar la pared entera.
   - Esquinas: al elegir una habitación salen asas verdes en cada esquina (las naranjas de los lados siguen). Arrastrar una esquina mueve
     solo ese vértice: los dos tramos de pared que llegan a él se estiran o giran, y el piso, el techo y las habitaciones vecinas que
     comparten la esquina lo siguen.
   - Tramo: Construir → «Mover un tramo de pared» (o el botón del inspector de la habitación). Clic en un lado de la habitación donde
     empieza el tramo, clic donde acaba y mover el ratón hacia dentro o hacia fuera (o escribir la medida y Enter): solo ese trozo se
     desplaza. La pared se parte en los dos puntos, el trozo se mueve, se añaden las dos paredes cortas que cierran el escalón y el piso
     (y el de la habitación vecina que comparte ese lado) gana los cuatro vértices. Todo en un paso de deshacer.
   API: OOCuartos.moverTramo(oid, lado, desde, hasta, delta) (metros desde el inicio del lado; delta > 0 hacia fuera),
        OOCuartos.moverEsquina(oid, i, [x, z]). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon;
  const PW = () => window.OOParedes;
  A.ICON.tramo = '<path d="M3 17h5v-6h8v6h5"/><path d="M12 4v5M10 7l2 2 2-2"/>';
  const mundo = (o?) => A.puntosMundoHab(o);
  const signo = (p?) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s > 0 ? 1 : -1; };
  function lado(pts?, i?) { const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, s = signo(pts); return { a, b, L, t: [dx / L, dz / L], n: [s * dz / L, -s * dx / L] }; }
  function polLocal(d?, pts?) { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); return pts.map(([x, z]) => { const dx = x - d.x, dz = z - d.z; return [r3(dx * c - dz * s), r3(dx * s + dz * c)]; }); }
  function conPoligono(d?, pts?) { const n = Object.assign({}, d, { puntos: polLocal(d, pts), area: r3(A.areaPol(pts)) }); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } n.sx = r3(x1 - x0); n.sz = r3(z1 - z0); return n; }
  const limpiar = (pts?) => { const out = []; for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) out.push(p); } while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.01) out.pop(); return out; };
  /* inserta en el lado de pts que contiene a p0 y p1 la secuencia del escalón (en el orden de ese lado) */
  function insertarEscalon(pts?, p0?, p1?, q0?, q1?) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-6) continue;
      const u = (p?) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L, dist = (p?) => Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / L;
      if (dist(p0) > 0.06 || dist(p1) > 0.06) continue; const u0 = u(p0), u1 = u(p1); if (Math.min(u0, u1) < -0.06 || Math.max(u0, u1) > L + 0.06) continue;
      const sec = u0 <= u1 ? [p0, q0, q1, p1] : [p1, q1, q0, p0];
      return limpiar(pts.slice(0, i + 1).concat(sec, pts.slice(i + 1)));
    }
    return null;
  }
  function docCon(o?, datos?) { const v = o.datos; o.datos = datos; const doc = A.docActualizado(o); o.datos = v; return doc; }
  /* ---------- tramo ---------- */
  function calcularTramo(oid?, i?, desde?, hasta?, delta?) {
    const o = E.nuevos().get(oid); if (!o || tb(o.tipo) !== 'habitacion') return { error: 'Elige una habitación.' };
    const pts = mundo(o); if (pts.length < 3) return { error: 'La habitación no tiene contorno.' }; i = ((i % pts.length) + pts.length) % pts.length;
    const li = lado(pts, i); let u0 = Math.max(0, Math.min(desde, hasta)), u1 = Math.min(li.L, Math.max(desde, hasta));
    if (u0 < 0.1) u0 = 0; if (u1 > li.L - 0.1) u1 = li.L;
    if (u1 - u0 < 0.2) return { error: 'El tramo es demasiado corto (mínimo 20 cm).' }; if (Math.abs(delta) < 0.05) return { error: 'Mueve el tramo al menos 5 cm.' };
    const P = (u?) => [li.a[0] + li.t[0] * u, li.a[1] + li.t[1] * u], Q = (u?) => [li.a[0] + li.t[0] * u + li.n[0] * delta, li.a[1] + li.t[1] * u + li.n[1] * delta];
    const p0 = P(u0), p1 = P(u1), q0 = Q(u0), q1 = Q(u1), y = +o.datos.y || 0;
    const nuevoPol = insertarEscalon(pts, p0, p1, q0, q1); if (!nuevoPol || nuevoPol.length < 3 || PW().autointerseca(nuevoPol) || A.areaPol(nuevoPol) < 0.25) return { error: 'Así la habitación quedaría cruzada o sin área.' };
    const res = new Map<any, any>(); /* id doc → data */ const ef = A.efectivos(); const vista = () => { const m = new Map<any, any>(ef); for (const [k, v] of res) m.set(k, v); return m; };
    res.set(o.docId, docCon(o, conPoligono(o.datos, nuevoPol)).data);
    /* habitaciones vecinas que comparten ese lado, y el techo de esta habitación */
    for (const x of E.nuevos().values()) {
      if (x === o) continue; const b = tb(x.tipo);
      if (b === 'habitacion' && Math.abs((+x.datos.y || 0) - y) < 0.3) { const pp = mundo(x); const np = insertarEscalon(pp, p0, p1, q0, q1); if (np && !PW().autointerseca(np) && A.areaPol(np) > 0.25) res.set(x.docId, docCon(x, conPoligono(x.datos, np)).data); }
      if (b === 'techo' && x.datos.de_habitacion === o.id && Array.isArray(x.datos.puntos)) { const pp = mundo(x); const np = insertarEscalon(pp, p0, p1, q0, q1); if (np) res.set(x.docId, docCon(x, conPoligono(x.datos, np)).data); }
    }
    /* paredes sobre el lado: se parten en los puntos y se desplaza el trozo de dentro */
    let n = 0, base = null; const nid = () => A.nuevoId() + 't' + (n++);
    const sobreLado = (d?) => { const s = PW().seg(d); const dist = (p?) => Math.abs((p[0] - li.a[0]) * li.t[1] - (p[1] - li.a[1]) * li.t[0]); return Math.abs((+d.y || 0) - y) < 0.3 && !(+d.curva) && dist(s.a) < 0.12 && dist(s.b) < 0.12 && Math.abs(s.ux * li.t[1] - s.uz * li.t[0]) < 0.02 ? s : null; };
    for (const x of [...E.nuevos().values()]) {
      if (tb(x.tipo) !== 'muro') continue; const s = sobreLado(x.datos); if (!s) continue;
      const ua = (s.a[0] - li.a[0]) * li.t[0] + (s.a[1] - li.a[1]) * li.t[1], ub = (s.b[0] - li.a[0]) * li.t[0] + (s.b[1] - li.a[1]) * li.t[1];
      const w0 = Math.min(ua, ub), w1 = Math.max(ua, ub); if (w1 <= u0 + 0.02 || w0 >= u1 - 0.02) continue;
      if (!base) base = x; const mismo = ub >= ua, aPared = (u?) => mismo ? u - ua : ua - u;
      const cortes = [u0, u1].filter((u?) => u > w0 + 0.08 && u < w1 - 0.08).map(aPared);
      const W = vista().get(x.docId); let piezas;
      if (cortes.length) { const r = PW().partir(x.docId, W, cortes, vista(), nid); if (!r) return { error: 'No se puede partir la pared en ese punto (cae dentro de una puerta o ventana).' }; piezas = r; }
      else piezas = [{ id: x.docId, data: W, propio: true }];
      const movidos = new Set<any>();
      for (const it of piezas) { if (!it.data || tb(it.data.tipo) !== 'muro') continue; const d = it.data.datos, um = (d.x - li.a[0]) * li.t[0] + (d.z - li.a[1]) * li.t[1]; const data = Object.assign({}, it.data, { datos: Object.assign({}, d) }); if (um > u0 && um < u1) { data.datos.x = r3(d.x + li.n[0] * delta); data.datos.z = r3(d.z + li.n[1] * delta); movidos.add(data.id_objeto); } res.set(it.id, data); }
      for (const it of piezas) { if (!it.data || tb(it.data.tipo) === 'muro') continue; const data = Object.assign({}, it.data, { datos: Object.assign({}, it.data.datos) }); if (movidos.has(data.datos.muro) && data.datos.muro !== x.id) { data.datos.x = r3(data.datos.x + li.n[0] * delta); data.datos.z = r3(data.datos.z + li.n[1] * delta); } res.set(it.id, data); }
    }
    /* las dos paredes cortas del escalón */
    if (base) {
      const bd = base.datos;
      for (const [p, q] of [[p0, q0], [p1, q1]]) { const dm = A.datosMuro(new V3(p[0], y, p[1]), new V3(q[0], y, q[1])); Object.assign(dm, { sy: bd.sy, sz: bd.sz, material: bd.material, color: bd.color }); if (bd.preset) dm.preset = bd.preset; const id = nid(); res.set(id, A.docNuevo(id, 'muro', dm, { capa: (ef.get(base.docId) || {}).capa })); }
    }
    return { docs: [...res].map(([id, data]) => ({ id, data })), pol: nuevoPol, p0, p1, q0, q1, conPared: !!base };
  }
  function moverTramo(oid?, i?, desde?, hasta?, delta?) {
    const r = calcularTramo(oid, i, desde, hasta, delta); if (r.error) { A.pista(r.error); return null; }
    A.guardar(r.docs, { etiqueta: 'Mover un tramo de pared' }); A.pista('Tramo de ' + A.fmt(Math.hypot(r.p1[0] - r.p0[0], r.p1[1] - r.p0[1])) + ' m movido ' + A.fmt(delta) + ' m' + (r.conPared ? ' con su pared.' : '.'));
    return r;
  }
  /* ---------- esquinas ---------- */
  function moverEsquina(oid?, i?, a?) {
    const o = E.nuevos().get(oid); if (!o || tb(o.tipo) !== 'habitacion' || !PW()) return 0; const pts = mundo(o); const de = pts[i]; if (!de) return 0;
    const l = PW().moverPuntos([{ de, a: [r3(a[0]), r3(a[1])] }], +o.datos.y || 0); if (!l) { A.pista('Así la habitación quedaría cruzada: no se mueve.'); return 0; }
    const base = new Map<any, any>(l.map((x?) => [x.o.id, x.o.datos])); return PW().confirmar(l, base, 'Mover esquina de habitación');
  }
  if (window.OOAsas) OOAsas.registrar((sel?) => {
    if (sel.length !== 1 || sel[0][0] !== 'n' || !PW()) return null; const o = E.nuevos().get(sel[0].slice(1)); if (!o || tb(o.tipo) !== 'habitacion') return null;
    const d0 = o.datos, pts = mundo(o), y = (+d0.y || 0) + 0.06 + (+d0.elevacion || 0); if (pts.length < 3) return null;
    return pts.map((de?, i?) => {
      let base = null, ult = null; const restaurar = () => { if (base) for (const [id, d] of base) { const x = E.nuevos().get(id); if (x) x.datos = d; } };
      return { id: 'esquina' + i, tipo: 'plano', color: 0x2e9e5b, pos: new V3(de[0], y, de[1]), planoY: +d0.y || 0, titulo: 'Arrastra esta esquina (solo este vértice; las paredes que llegan a ella la siguen)',
        empezar: () => { base = new Map<any, any>(); const l = PW().moverPuntos([{ de, a: de }], +d0.y || 0) || []; for (const x of l) base.set(x.o.id, x.o.datos); base.set(o.id, d0); },
        inferir: (e?) => { const vivos = new Map<any, any>(); for (const [id] of base) { const x = E.nuevos().get(id); if (x) vivos.set(id, x.datos); } restaurar(); const inf = A.inferir(e, null, { y: +d0.y || 0 }); for (const [id, d] of vivos) { const x = E.nuevos().get(id); if (x) x.datos = d; } return inf ? inf.p.clone() : null; },
        mover: (p?) => { restaurar(); const l = PW().moverPuntos([{ de, a: [r3(p.x), r3(p.z)] }], +d0.y || 0, { base }); if (!l) { ult = null; A.etqVivas = [{ p: new V3(p.x, y + 0.8, p.z), t: 'No vale: quedaría cruzada', c: 'cota' }]; A.renderTodo(); return; } ult = l; PW().previa(l); const h = l.find((x?) => x.o === o); A.etqVivas = [{ p: new V3(p.x, y + 0.8, p.z), t: A.fmt(h ? A.areaPol(mundo({ datos: h.datos })) : 0, 1) + ' m²', c: 'vivo' }]; },
        soltar: () => { A.etqVivas = []; if (ult) PW().confirmar(ult, base, 'Mover esquina de habitación'); else restaurar(); },
        cancelar: () => { A.etqVivas = []; restaurar(); }
      };
    });
  });
  /* ---------- herramienta «Mover un tramo de pared» ---------- */
  let est = null, tecleado = '';
  function ladoCercano(p?) {
    let mejor = null; const tol = Math.max(0.6, 10 * A.metrosPorPixel(p));
    for (const o of E.nuevos().values()) { if (tb(o.tipo) !== 'habitacion' || o.datos.suelo) continue; const pts = mundo(o); for (let i = 0; i < pts.length; i++) { const li = lado(pts, i); const u = (p.x - li.a[0]) * li.t[0] + (p.z - li.a[1]) * li.t[1]; if (u < -0.05 || u > li.L + 0.05) continue; const dist = Math.abs((p.x - li.a[0]) * li.t[1] - (p.z - li.a[1]) * li.t[0]); if (dist < tol && (!mejor || dist < mejor.dist)) mejor = { o, i, u: Math.max(0, Math.min(li.L, u)), dist, li }; } }
    return mejor;
  }
  const ajustar = (u?) => A.AJ.ajuste ? Math.round(u / (A.AJ.paso || 0.25)) * (A.AJ.paso || 0.25) : Math.round(u * 20) / 20;
  function previa() {
    if (!est || est.u1 == null) return; const r = calcularTramo(est.o.id, est.i, est.u0, est.u1, est.delta || 0.001);
    if (r.error || !r.pol) { A.limpiarPrevia(); return; } A.mostrarPrevia('habitacion', A.datosHabitacion(r.pol, +est.o.datos.y || 0, +est.o.datos.alto || 2.6));
  }
  E.agregarHerramientaPropia('tramo-cuarto', {
    n: 'Mover un tramo de pared', ic: 'tramo', pista: 'Clic en el lado de una habitación donde empieza el tramo, clic donde acaba y mueve el ratón hacia dentro o fuera (o escribe la medida y Enter). Solo se mueve ese trozo de pared.',
    move: (e?) => {
      const p = A.puntoPlano(e, est ? +est.o.datos.y || 0 : A.planoTrabajo); if (!p) return;
      if (!est) { const c = ladoCercano(p); A.etqVivas = c ? [{ p: new V3(c.li.a[0] + c.li.t[0] * ajustar(c.u), 0.4, c.li.a[1] + c.li.t[1] * ajustar(c.u)), t: 'Inicio del tramo · ' + A.fmt(ajustar(c.u)) + ' m', c: 'vivo' }] : []; A.marcar(); return; }
      const li = est.li;
      if (est.u1 == null) { const u = ajustar(Math.max(0, Math.min(li.L, (p.x - li.a[0]) * li.t[0] + (p.z - li.a[1]) * li.t[1]))); A.etqVivas = [{ p: new V3(li.a[0] + li.t[0] * u, 0.4, li.a[1] + li.t[1] * u), t: 'Fin del tramo · ' + A.fmt(Math.abs(u - est.u0)) + ' m', c: 'vivo' }]; A.marcar(); return; }
      if (!tecleado) { est.delta = ajustar((p.x - li.a[0]) * li.n[0] + (p.z - li.a[1]) * li.n[1]); previa(); A.etqVivas = [{ p: new V3(p.x, 0.6, p.z), t: (est.delta >= 0 ? '+' : '') + A.fmt(est.delta) + ' m (fuera +, dentro −)', c: 'vivo' }]; A.marcar(); }
    },
    up: (e?, mov?) => {
      if (mov > 6) return; const p = A.puntoPlano(e, est ? +est.o.datos.y || 0 : A.planoTrabajo); if (!p) return;
      if (!est) { const c = ladoCercano(p); if (!c) { A.pista('Haz clic sobre un lado de una habitación.'); return; } est = { o: c.o, i: c.i, li: c.li, u0: ajustar(c.u), u1: null, delta: 0 }; A.seleccionar(['n' + c.o.id], { sinTab: true }); return; }
      if (est.u1 == null) { const li = est.li; est.u1 = ajustar(Math.max(0, Math.min(li.L, (p.x - li.a[0]) * li.t[0] + (p.z - li.a[1]) * li.t[1]))); if (Math.abs(est.u1 - est.u0) < 0.2) { est.u1 = null; A.pista('El tramo es demasiado corto.'); } return; }
      aplicar();
    },
    fin: () => { est = null; tecleado = ''; A.limpiarPrevia(); A.etqVivas = []; }
  });
  function aplicar() { if (!est) return; const { o, i, u0, u1, delta } = est; est = null; tecleado = ''; A.limpiarPrevia(); A.etqVivas = []; moverTramo(o.id, i, u0, u1, delta); }
  window.addEventListener('keydown', (e?) => {
    if (A.herramienta !== 'tramo-cuarto' || !est || est.u1 == null || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (/^[0-9]$/.test(e.key) || ((e.key === ',' || e.key === '.') && !tecleado.includes('.')) || (e.key === '-' && !tecleado)) { tecleado += /[.,]/.test(e.key) ? '.' : e.key; est.delta = parseFloat(tecleado) || 0; previa(); A.pista('Desplazamiento: ' + tecleado.replace('.', ',') + ' m (negativo: hacia dentro) · Enter para aplicar'); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Backspace' && tecleado) { tecleado = tecleado.slice(0, -1); est.delta = parseFloat(tecleado) || 0; previa(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); aplicar(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); est = null; tecleado = ''; A.limpiarPrevia(); A.etqVivas = []; A.pista('Tramo cancelado.'); }
  }, true);
  E.agregarHerramienta('construir', { h: 'tramo-cuarto', n: 'Mover un tramo de pared' });
  /* botón en el inspector de la habitación */
  E.on('panel', () => {
    const s = A.sel; if (s.length !== 1 || s[0][0] !== 'n') return; const o = E.nuevos().get(s[0].slice(1)); if (!o || tb(o.tipo) !== 'habitacion') return;
    const sec = document.querySelector('#objCuerpo [data-sec="habitacion2"] .campos'); if (!sec || sec.querySelector('[data-cu]')) return;
    sec.insertAdjacentHTML('beforeend', '<p class="ayuda">Asas verdes: mover solo una esquina. Asas naranjas: mover el lado entero.</p><div class="fila"><button data-cu="tramo">Mover solo un tramo de un lado…</button></div>');
  });
  document.addEventListener('click', (e?) => { const b = e.target.closest && e.target.closest('[data-cu="tramo"]'); if (b) A.ponerHerramienta('tramo-cuarto'); });
  window.OOCuartos = { moverTramo, calcularTramo, moverEsquina, insertarEscalon, get estado() { return est; } };
})();
