/* Editor del mapa (2.1, Map Editor Pro fase 2): habitaciones redimensionables y pisos con elevación, grosor y agujeros.
   - Al elegir una habitación salen asas (bolas naranjas) en el centro de cada lado: se arrastra el lado y se mueven con él la pared de ese
     lado (con sus puertas y ventanas), se estiran las paredes de los lados vecinos, el piso y su techo, y se recalcula el área. Si una
     abertura ya no cabe o algo queda fuera, se avisa. Si el polígono quedaría cruzado, no se hace.
   - Inspector de la habitación: medidas por lado, ancho y fondo exactos en las rectangulares, alto de paredes (cambia la altura de sus
     paredes y sube su techo), elevación y grosor del piso, y agujeros.
   - Construir → «Piso (rectángulo)»: un piso suelto (habitación con `suelo: true`) sin paredes. «Agujero en piso»: arrastra un rectángulo
     dentro de un piso para abrir un hueco (escaleras…). Los agujeros se guardan en `datos.agujeros` (polígonos locales). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon;
  const PW = () => window.OOParedes;
  A.ICON.piso = '<path d="M3 16l5-8h13l-5 8z"/>';
  A.ICON.agujero = '<path d="M3 16l5-8h13l-5 8z"/><path d="M10 12h5l-1.5 2.4h-5z" stroke-dasharray="2 1.5"/>';

  const mundo = o => A.puntosMundoHab(o);
  const topePiso = d => (+d.y || 0) + 0.012 + (+d.elevacion || 0) + (d.grosor != null && isFinite(+d.grosor) ? +d.grosor : 0.03);
  function ladoInfo(pts, i) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const s = signo(pts); return { a, b, L, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n: [s * dz / L, -s * dx / L] }; /* n: normal hacia fuera */
  }
  function signo(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s > 0 ? 1 : -1; }
  /* mueve el lado i de la habitación oid `delta` m hacia fuera (negativo: hacia dentro). Devuelve la lista [{o, datos}] o null */
  function calcularBorde(o, i, delta, base) {
    const d = base && base.has(o.id) ? base.get(o.id) : o.datos; const pts = mundo({ datos: d }); if (pts.length < 3) return null;
    const li = ladoInfo(pts, i), mv = [li.a, li.b].map(p => ({ de: p, a: [r3(p[0] + li.n[0] * delta), r3(p[1] + li.n[1] * delta)] }));
    return PW().moverPuntos(mv, +d.y || 0, { base });
  }
  function avisosTras(o, lista) {
    const av = [], h = lista.find(x => x.o === o); if (!h) return av; const pts = mundo({ datos: h.datos });
    const fuera = [...E.nuevos().values()].filter(x => { const s = x.datos.soporte; return s && s.id === o.id && !A.dentroPoligono(+x.datos.x || 0, +x.datos.z || 0, pts); });
    if (fuera.length) av.push(fuera.length + ' objeto' + (fuera.length > 1 ? 's quedan' : ' queda') + ' fuera del piso.');
    return av;
  }
  function estirarBorde(oid, i, delta) {
    const o = E.nuevos().get(oid); if (!o || tb(o.tipo) !== 'habitacion' || !PW()) return 0;
    const l = calcularBorde(o, i, delta); if (!l) { A.pista('Así la habitación quedaría cruzada o sin área: no se cambia.'); return 0; }
    const av = avisosTras(o, l); const base = new Map(l.map(x => [x.o.id, x.o.datos]));
    const n = PW().confirmar(l, base, 'Estirar habitación'); if (av.length) setTimeout(() => A.pista(av.join(' ')), 60); return n;
  }
  const esRect = pts => pts.length === 4 && [0, 1, 2, 3].every(i => { const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4]; const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.abs(u[0] * v[0] + u[1] * v[1]) < 1e-3 * (Math.hypot(...u) * Math.hypot(...v) + 1e-9); });
  /* rectangulares: ancho = lado 0, fondo = lado 1; se mueven los lados 1 y 2 */
  function ponerMedida(oid, cual, valor) { const o = E.nuevos().get(oid); if (!o) return 0; const pts = mundo(o); if (!esRect(pts)) return 0; const L = ladoInfo(pts, cual === 'ancho' ? 0 : 1).L; return estirarBorde(oid, cual === 'ancho' ? 1 : 2, valor - L); }

  /* ---------- regla: el alto de la habitación es el de sus paredes y su techo ---------- */
  if (window.OOAnclajes) OOAnclajes.reglas.push((id, d, prev, ctx) => {
    if (!prev || tb(d.tipo) !== 'habitacion' || d.datos.suelo || Math.abs((+d.datos.alto || 0) - (+prev.datos.alto || 0)) < 1e-6 || !(+d.datos.alto > 0.3)) return;
    const pts = A.puntosMundoHab({ datos: d.datos }), y = +d.datos.y || 0, alto = +d.datos.alto, cerca = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
    for (const [wid, W] of ctx.todos()) {
      if (!ctx.esAgr(W) || ctx.cambios.has(wid)) continue; const b = tb(W.tipo);
      if (b === 'muro' && Math.abs((+W.datos.y || 0) - y) < 0.3) { const s = PW().seg(W.datos); if (pts.some(p => cerca(p, s.a)) && pts.some(p => cerca(p, s.b))) { const n = ctx.docCon(W, Object.assign(clon(W.datos), { sy: r3(alto) })); ctx.cambios.set(wid, n); ctx.orden.push(wid); } }
      if (b === 'techo' && W.datos.de_habitacion === d.id_objeto) { const n = ctx.docCon(W, Object.assign(clon(W.datos), { y: r3(y + alto) })); ctx.cambios.set(wid, n); ctx.orden.push(wid); }
    }
  });

  /* ---------- asas en los lados ---------- */
  if (window.OOAsas) OOAsas.registrar(sel => {
    if (sel.length !== 1 || sel[0][0] !== 'n' || !PW()) return null; const o = E.nuevos().get(sel[0].slice(1)); if (!o || tb(o.tipo) !== 'habitacion') return null;
    const d0 = o.datos, pts = mundo(o), y = topePiso(d0) + 0.05; if (pts.length < 3) return null;
    return pts.map((_, i) => {
      const li = ladoInfo(pts, i); let base = null, ult = null;
      const restaurar = () => { if (base) for (const [id, d] of base) { const x = E.nuevos().get(id); if (x) x.datos = d; } };
      return { id: 'lado' + i, tipo: 'plano', color: 0xff8f00, pos: new V3(li.mid[0], y, li.mid[1]), titulo: 'Arrastra para mover este lado de la habitación',
        empezar: () => { base = new Map(); const l = calcularBorde(o, i, 0) || []; for (const x of l) base.set(x.o.id, x.o.datos); base.set(o.id, d0); },
        mover: p => {
          let dl = (p.x - li.mid[0]) * li.n[0] + (p.z - li.mid[1]) * li.n[1]; const paso = A.AJ.ajuste ? (A.AJ.paso || 0.25) : 0.05; dl = Math.round(dl / paso) * paso; restaurar();
          const l = calcularBorde(o, i, dl, base); if (!l) { ult = null; A.etqVivas = [{ p: new V3(li.mid[0], y + 0.8, li.mid[1]), t: 'No vale: quedaría cruzada', c: 'cota' }]; A.renderTodo(); return; }
          ult = l; PW().previa(l); const h = l.find(x => x.o === o), np = h ? mundo({ datos: h.datos }) : pts;
          const vecinos = [ladoInfo(np, (i + np.length - 1) % np.length).L, ladoInfo(np, (i + 1) % np.length).L];
          A.etqVivas = [{ p: new V3(li.mid[0] + li.n[0] * dl, y + 0.8, li.mid[1] + li.n[1] * dl), t: (dl >= 0 ? '+' : '') + A.fmt(dl) + ' m · lados ' + A.fmt(vecinos[0]) + ' / ' + A.fmt(vecinos[1]) + ' m · ' + A.fmt(A.areaPol(np), 1) + ' m²', c: 'vivo' }];
        },
        soltar: () => { A.etqVivas = []; if (ult) { const av = avisosTras(o, ult); PW().confirmar(ult, base, 'Estirar habitación'); if (av.length) setTimeout(() => A.pista(av.join(' ')), 60); } else restaurar(); },
        cancelar: () => { A.etqVivas = []; restaurar(); }
      };
    });
  });

  /* ---------- pisos: herramienta Piso y Agujero ---------- */
  let est = null;
  function crearPiso(x0, z0, x1, z1, y) {
    const pr = A.params.habitacion, esq = [[Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)], [Math.min(x0, x1), Math.max(z0, z1)]];
    const n = [...E.nuevos().values()].filter(o => tb(o.tipo) === 'habitacion' && o.datos.suelo).length + 1;
    const id = A.crearNuevo('habitacion', A.datosHabitacion(esq, y, pr.alto, { suelo: true, nombre: 'Piso ' + n, elevacion: +A.params.piso.elevacion || 0, grosor: +A.params.piso.grosor || 0.03 }), null, { etiqueta: 'Crear piso' });
    if (id) A.pista('Piso de ' + A.fmt(Math.abs(x1 - x0) * Math.abs(z1 - z0), 1) + ' m².'); return id;
  }
  /* abre un agujero rectangular (en coordenadas del mundo) en el piso oid */
  function agujero(oid, x0, z0, x1, z1) {
    const o = E.nuevos().get(oid); if (!o || tb(o.tipo) !== 'habitacion') return false; const d = o.datos, pts = mundo(o);
    const esq = [[Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)], [Math.min(x0, x1), Math.max(z0, z1)]];
    if (!esq.every(([x, z]) => A.dentroPoligono(x, z, pts))) { A.pista('El agujero tiene que quedar dentro del piso.'); return false; }
    const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), loc = esq.map(([x, z]) => { const dx = x - d.x, dz = z - d.z; return [r3(dx * c - dz * s), r3(dx * s + dz * c)]; });
    const v = o.datos; o.datos = Object.assign({}, v, { agujeros: (Array.isArray(v.agujeros) ? v.agujeros : []).concat([loc]) }); const doc = A.docActualizado(o); o.datos = v; if (!doc) return false;
    A.guardar([doc], { etiqueta: 'Agujero en piso' }); A.pista('Agujero de ' + A.fmt(Math.abs(x1 - x0)) + ' × ' + A.fmt(Math.abs(z1 - z0)) + ' m.'); return true;
  }
  A.params.piso = { elevacion: 0, grosor: 0.03 };
  E.agregarHerramientaPropia('piso', {
    n: 'Piso', ic: 'piso', pista: 'Arrastra un rectángulo: crea un piso suelto (sin paredes). Elevación y grosor en el panel; después se cambian en el inspector.',
    down: e => { const inf = A.inferir(e, null); if (inf) est = { a: inf.p.clone() }; },
    move: e => { if (!est) { A.inferir(e, null); return; } const inf = A.inferir(e, est.a, { y: est.a.y }); if (!inf) return; const a = est.a, b = inf.p; if (Math.abs(b.x - a.x) < 0.1 || Math.abs(b.z - a.z) < 0.1) return; const esq = [[Math.min(a.x, b.x), Math.min(a.z, b.z)], [Math.max(a.x, b.x), Math.min(a.z, b.z)], [Math.max(a.x, b.x), Math.max(a.z, b.z)], [Math.min(a.x, b.x), Math.max(a.z, b.z)]]; A.mostrarPrevia('habitacion', A.datosHabitacion(esq, a.y, 2.6, { elevacion: +A.params.piso.elevacion || 0 })); A.etqVivas = [{ p: new V3((a.x + b.x) / 2, a.y + 0.5, (a.z + b.z) / 2), t: A.fmt(Math.abs(b.x - a.x)) + ' × ' + A.fmt(Math.abs(b.z - a.z)) + ' m', c: 'vivo' }]; },
    up: e => { if (!est) return; const a = est.a; est = null; A.limpiarPrevia(); A.etqVivas = []; const inf = A.inferir(e, a, { y: a.y }); A.ocultarInferencia(); if (!inf) return; const b = inf.p; if (Math.abs(b.x - a.x) < 0.3 || Math.abs(b.z - a.z) < 0.3) { A.pista('Arrastra un rectángulo más grande.'); return; } const id = crearPiso(a.x, a.z, b.x, b.z, a.y); if (id) A.seleccionar(['n' + id], { sinTab: true }); },
    fin: () => { est = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => `<div class="campos"><label class="campo"><span>Elevación (m)</span><input type="number" step="0.05" data-hp="elevacion" value="${r3(A.params.piso.elevacion)}"></label><label class="campo"><span>Grosor (m)</span><input type="number" step="0.01" data-hp="grosor" value="${r3(A.params.piso.grosor)}"></label></div>`
  });
  E.agregarHerramientaPropia('agujero', {
    n: 'Agujero en piso', ic: 'agujero', pista: 'Arrastra un rectángulo dentro de un piso o habitación: abre un agujero (para escaleras o estructuras). Se quita en el inspector del piso.',
    down: e => { const h = A.pickEvento(e); const o = h && h.key[0] === 'n' ? E.nuevos().get(h.key.slice(1)) : null; if (!o || tb(o.tipo) !== 'habitacion') { A.pista('Empieza el rectángulo encima de un piso.'); return; } est = { o, a: h.point.clone() }; },
    move: e => { if (!est) return; const p = A.puntoPlano(e, est.a.y); if (!p) return; const a = est.a; A.mostrarPrevia('calle', { x: (a.x + p.x) / 2, y: a.y, z: (a.z + p.z) / 2, giroY: 0, sx: Math.max(0.05, Math.abs(p.x - a.x)), sy: 0.06, sz: Math.max(0.05, Math.abs(p.z - a.z)), color: '#ff8f00' }, 'aviso'); A.etqVivas = [{ p: new V3((a.x + p.x) / 2, a.y + 0.4, (a.z + p.z) / 2), t: A.fmt(Math.abs(p.x - a.x)) + ' × ' + A.fmt(Math.abs(p.z - a.z)) + ' m', c: 'vivo' }]; },
    up: e => { if (!est) return; const { o, a } = est; est = null; A.limpiarPrevia(); A.etqVivas = []; const p = A.puntoPlano(e, a.y); if (!p || Math.abs(p.x - a.x) < 0.1 || Math.abs(p.z - a.z) < 0.1) return; agujero(o.id, a.x, a.z, p.x, p.z); },
    fin: () => { est = null; A.limpiarPrevia(); A.etqVivas = []; }
  });
  E.agregarHerramienta('construir', { h: 'piso', n: 'Piso (rectángulo)' });
  E.agregarHerramienta('construir', { h: 'agujero', n: 'Agujero en piso' });

  /* ---------- inspector ---------- */
  const num = (k, l, v, paso) => `<label class="campo"><span>${l}</span><input type="number" step="${paso || 0.05}" data-hh="${k}" value="${r3(v)}"></label>`;
  function htmlHab(o) {
    const d = o.datos, pts = mundo(o), lados = pts.map((_, i) => A.fmt(ladoInfo(pts, i).L)).join(' · '), rect = esRect(pts), nAg = Array.isArray(d.agujeros) ? d.agujeros.length : 0;
    return `<details class="sec" open data-sec="habitacion2"><summary>${d.suelo ? 'Piso' : 'Habitación'}: medidas y piso</summary><div class="campos">
      <p class="ayuda" style="margin:0 0 6px">Lados: ${lados} m · <b>${A.fmt(A.areaPol(pts), 2)} m²</b>${d.suelo ? '' : ' · alto ' + A.fmt(+d.alto || 0) + ' m'}</p>
      ${rect ? num('ancho', 'Ancho (lado 1, m)', ladoInfo(pts, 0).L) + num('fondo', 'Fondo (lado 2, m)', ladoInfo(pts, 1).L) : ''}
      ${num('elevacion', 'Elevación del piso (m)', +d.elevacion || 0)}${num('grosor', 'Grosor del piso (m)', d.grosor != null ? +d.grosor : 0.03, 0.01)}
      <p class="ayuda">Arrastra las bolas naranjas de los lados para estirarla: las paredes, el piso, el techo y las puertas se actualizan. ${nAg ? nAg + ' agujero' + (nAg > 1 ? 's' : '') + '. ' : ''}</p>
      <div class="fila">${nAg ? '<button data-ha="sin-agujeros">Quitar los agujeros</button>' : ''}<button data-ha="agujero">Abrir agujero…</button></div></div></details>`;
  }
  function selHab() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && tb(o.tipo) === 'habitacion' ? o : null; }
  E.on('panel', () => { const o = selHab(); if (!o) return; const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return; const ref = c.querySelector('[data-sec="campos"]') || c.querySelector('[data-sec="transform"]'); const div = document.createElement('div'); div.innerHTML = htmlHab(o); if (ref && ref.nextSibling) c.insertBefore(div.firstElementChild, ref.nextSibling); else c.appendChild(div.firstElementChild); });
  function cambiarDatos(o, cambios, etiqueta) { const v = o.datos; o.datos = Object.assign({}, v, cambios); const doc = A.docActualizado(o); o.datos = v; if (doc) A.guardar([doc], { etiqueta }); }
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.hp) { const v = parseFloat(el.value); if (isFinite(v)) A.params.piso[el.dataset.hp] = Math.max(el.dataset.hp === 'grosor' ? 0.005 : 0, v); return; }
    if (!el.dataset.hh) return; const o = selHab(); if (!o) return; const k = el.dataset.hh, v = parseFloat(el.value); if (!isFinite(v)) return;
    if (k === 'ancho' || k === 'fondo') { if (v > 0.3) ponerMedida(o.id, k, v); return; }
    if (k === 'elevacion') cambiarDatos(o, { elevacion: r3(Math.max(-2, v)) }, 'Elevación del piso');
    if (k === 'grosor') cambiarDatos(o, { grosor: r3(Math.max(0.005, v)) }, 'Grosor del piso');
  });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ha]'); if (!b) return; const o = selHab(); if (!o) return; if (b.dataset.ha === 'sin-agujeros') cambiarDatos(o, { agujeros: undefined }, 'Quitar agujeros'); if (b.dataset.ha === 'agujero') A.ponerHerramienta('agujero'); });

  window.OOHabitaciones = { estirarBorde, ponerMedida, agujero, crearPiso, esRect, lados: oid => { const o = E.nuevos().get(oid); if (!o) return []; const p = mundo(o); return p.map((_, i) => r3(ladoInfo(p, i).L)); } };
})();
