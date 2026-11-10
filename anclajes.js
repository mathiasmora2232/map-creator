/* Editor del mapa (2.1, Map Editor Pro fase 1): anclajes y soportes.
   Cada objeto nuevo puede apoyarse en un soporte (`datos.soporte`):
     {tipo: 'fundacion' | 'piso' | 'pared' | 'techo', id: <id del soporte>, rel: {x, y, z, g}, auto | manual}
     {tipo: 'terreno', rel: {y}}   sigue la altura del terreno (terreno.js)
     {tipo: 'libre'}               nunca se ancla
     sin soporte                   automático: se ancla solo al colocarlo o moverlo encima de una fundación o de un piso
   `rel` es la posición y el giro relativos al marco del soporte (origen en la cara de arriba de la fundación, en la base del piso o del
   techo, giro del soporte). La posición absoluta (`x, y, z, giroY`) se sigue guardando: los exportadores y el juego no cambian.
   Las puertas, ventanas y huecos se anclan a su pared (`datos.muro`); al cambiar la pared conservan su distancia al extremo que no se movió
   y no salen de ella.
   Cómo se mueve todo: `propagar` se llama desde guardar() (editor.js) con la lista de documentos que cambian. Recorre el árbol de
   dependientes por anchura, una sola vez cada uno (sin ciclos ni dobles movimientos), recalcula su posición absoluta a partir de `rel`
   (sin acumular errores) y añade esos documentos al MISMO paso de deshacer. Lo que el usuario mueve a mano recalcula su `rel`.
   Nada que no esté anclado se mueve (carreteras, árboles sueltos…). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, DEG = A.DEG, tb = A.tipoBase, r3 = A.r3, ENT = window.OOEntidades;
  const ABERTURAS = ['puerta', 'ventana', 'hueco'], MARCO = (window.OO && OO.MARCO) || 0.08;
  const TOL_Y = 0.1, TOL_XZ = 0.3;
  const r5 = n => Math.round((+n || 0) * 1e5) / 1e5;
  const normAng = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return r5(a); };
  const clon = A.clon;
  /* JSON con las claves ordenadas: el servidor guarda los documentos así y el orden no debe contar como cambio */
  const canon = v => JSON.stringify(v == null ? null : v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
  const reglas = []; /* extensiones: f(ctx) por cada documento cambiado por el usuario (habitaciones.js: alto de paredes…) */
  const reglasBorrar = []; /* (2.1 pro f3) f(id, docAnterior, ctx) por cada objeto que se borra (escaleras.js cierra el agujero que abrió) */

  /* ---------- geometría de los soportes ---------- */
  function rectMundo(d) { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), hx = (+d.sx || 1) / 2, hz = (+d.sz || 1) / 2; return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [d.x + x * c + z * s, d.z - x * s + z * c]); }
  function polMundo(d) { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g); return (d.puntos || []).map(([x, z]) => [d.x + x * c + z * s, d.z - x * s + z * c]); }
  function huella(tipo, d) {
    const b = tb(tipo);
    if (b === 'fundacion') return window.OOFundaciones ? OOFundaciones.huella(d) : rectMundo(d);
    if (b === 'habitacion' || b === 'techo') return polMundo(d);
    if (b === 'calle' || b === 'edificio') return rectMundo(d);
    return null;
  }
  const esSoporte = b => b === 'fundacion' || b === 'habitacion' || b === 'techo' || b === 'muro';
  const tipoSoporteDe = b => ({ fundacion: 'fundacion', habitacion: 'piso', techo: 'techo', muro: 'pared' })[b] || null;
  /* altura a la que se apoya lo de encima */
  function tope(tipo, d) {
    const b = tb(tipo), y = +d.y || 0;
    if (b === 'fundacion') return y + Math.max(0, +d.elevacion || 0);
    if (b === 'habitacion') return y + 0.012 + (+d.elevacion || 0) + (d.grosor != null && isFinite(+d.grosor) ? +d.grosor : 0.03);
    return y;
  }
  /* marco del soporte para las posiciones relativas */
  function marco(tipo, d) {
    const b = tb(tipo), y = +d.y || 0;
    return { x: +d.x || 0, y: b === 'fundacion' ? y + Math.max(0, +d.elevacion || 0) : b === 'habitacion' ? y + (+d.elevacion || 0) : y, z: +d.z || 0, g: +d.giroY || 0 };
  }
  function aLocal(m, d) {
    const g = m.g * DEG, c = Math.cos(g), s = Math.sin(g), dx = (+d.x || 0) - m.x, dz = (+d.z || 0) - m.z;
    return { x: r5(dx * c - dz * s), y: r5((+d.y || 0) - m.y), z: r5(dx * s + dz * c), g: normAng((+d.giroY || 0) - m.g) };
  }
  function aMundo(m, rel) {
    const g = m.g * DEG, c = Math.cos(g), s = Math.sin(g);
    return { x: r3(m.x + rel.x * c + rel.z * s), y: r3(m.y + rel.y), z: r3(m.z - rel.x * s + rel.z * c), giroY: normAng(m.g + rel.g) };
  }
  function dentroCerca(x, z, pts, tol) {
    if (!pts || pts.length < 3) return false;
    if (A.dentroPoligono(x, z, pts)) return true;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (distSeg(x, z, a, b) <= tol) return true; }
    return false;
  }
  function distSeg(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let t = L2 > 1e-12 ? ((x - a[0]) * dx + (z - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); }
  const baseY = d => d.origen === 'centro' ? (+d.y || 0) - (+d.sy || 0) / 2 : (+d.y || 0);
  const alturaTerreno = (x, z) => (window.OOTerreno && OOTerreno.alturaEn ? OOTerreno.alturaEn(x, z) : 0) || 0;
  function soporteDe(d) {
    if (!d || !d.datos) return null;
    const s = ENT ? ENT.normSoporte(d.datos.soporte) : d.datos.soporte;
    if (s) return s;
    if (ABERTURAS.includes(tb(d.tipo)) && typeof d.datos.muro === 'string') return { tipo: 'pared', id: d.datos.muro };
    return null;
  }
  const nombreDoc = d => d ? ((d.props && d.props.nombre) || (d.datos && d.datos.nombre) || A.nombreTipo(d.tipo)) : '¿?';
  const ARTICULO = { puerta: 'La puerta', ventana: 'La ventana', hueco: 'El hueco' };

  /* ---------- puertas y objetos en una pared ---------- */
  function ejePared(W) { const g = (+W.giroY || 0) * DEG; return { ux: Math.cos(g), uz: -Math.sin(g), L: +W.sx || 0 }; }
  function medioAncho(b, x) { return b === 'hueco' ? Math.max(0.05, +x.sx || 1) / 2 : (+x.sx || 0.9) / 2 + MARCO; }
  /* pega una abertura a la línea de su pared, dentro de su largo y de su alto */
  function pegarAPared(x, W, b, avisos) {
    const { ux, uz, L } = ejePared(W);
    let u = ((+x.x || 0) - W.x) * ux + ((+x.z || 0) - W.z) * uz; const lim = L / 2 - medioAncho(b, x) - 0.02;
    if (lim < 0) {
      const max = r3(L - 0.04 - (b === 'hueco' ? 0 : 2 * MARCO));
      if (max >= 0.3) { x.sx = max; avisos.push((ARTICULO[b] || 'La abertura') + ' no cabía en su pared (' + A.fmt(L) + ' m): se estrechó a ' + A.fmt(max) + ' m.'); }
      else avisos.push((ARTICULO[b] || 'La abertura') + ' no cabe en su pared (' + A.fmt(L) + ' m).');
      u = 0;
    } else u = Math.max(-lim, Math.min(lim, u));
    x.x = r3(W.x + ux * u); x.z = r3(W.z + uz * u); x.y = r3(+W.y || 0); x.sz = r3(+W.sz || 0.2); x.muro_alto = r3(+W.sy || 2.6);
    const gw = +W.giroY || 0; if (Math.abs(Math.sin(((+x.giroY || 0) - gw) * DEG)) > 0.02) x.giroY = gw;
    const alto = +W.sy || 2.6, al = b === 'puerta' ? 0 : (+x.alfeizar || 0), techoH = alto - al - (b === 'hueco' ? 0 : MARCO + 0.02);
    if ((+x.sy || 0) > techoH + 1e-3) { avisos.push((ARTICULO[b] || 'La abertura') + ' era más alta que su pared: se ajustó a ' + A.fmt(Math.max(0.3, techoH)) + ' m.'); x.sy = r3(Math.max(0.3, techoH)); }
  }
  /* nueva posición de algo anclado a la pared Wo → Wn: conserva la distancia al extremo que no se movió (o al centro si se movió entera) */
  function nuevoEnPared(Wo, Wn, x, b, avisos) {
    const o = ejePared(Wo), n = ejePared(Wn);
    const dx = (+x.x || 0) - Wo.x, dz = (+x.z || 0) - Wo.z, u = dx * o.ux + dz * o.uz, w = -dx * o.uz + dz * o.ux;
    const sO = [Wo.x - o.ux * o.L / 2, Wo.z - o.uz * o.L / 2], eO = [Wo.x + o.ux * o.L / 2, Wo.z + o.uz * o.L / 2];
    const sN = [Wn.x - n.ux * n.L / 2, Wn.z - n.uz * n.L / 2], eN = [Wn.x + n.ux * n.L / 2, Wn.z + n.uz * n.L / 2];
    const fijoIni = Math.hypot(sO[0] - sN[0], sO[1] - sN[1]) < 0.003, fijoFin = Math.hypot(eO[0] - eN[0], eO[1] - eN[1]) < 0.003;
    let un = u; if (Math.abs(o.L - n.L) > 1e-4) { if (fijoIni && !fijoFin) un = u + o.L / 2 - n.L / 2; else if (fijoFin && !fijoIni) un = u - o.L / 2 + n.L / 2; }
    if (ABERTURAS.includes(b)) { const lim = n.L / 2 - medioAncho(b, x) - 0.02; if (lim < 0) { avisos.push((ARTICULO[b] || 'La abertura') + ' ya no cabe en la pared acortada.'); un = 0; } else if (Math.abs(un) > lim) { avisos.push((ARTICULO[b] || 'La abertura') + ' se corrió para seguir dentro de la pared.'); un = Math.max(-lim, Math.min(lim, un)); } }
    x.x = r3(Wn.x + n.ux * un - n.uz * w); x.z = r3(Wn.z + n.uz * un + n.ux * w); x.y = r3((+Wn.y || 0) + ((+x.y || 0) - (+Wo.y || 0)));
    x.giroY = normAng((+Wn.giroY || 0) + ((+x.giroY || 0) - (+Wo.giroY || 0)));
    if (ABERTURAS.includes(b)) { x.sz = r3(+Wn.sz || 0.2); x.muro_alto = r3(+Wn.sy || 2.6); const al = b === 'puerta' ? 0 : (+x.alfeizar || 0), techoH = (+Wn.sy || 2.6) - al - (b === 'hueco' ? 0 : MARCO + 0.02); if ((+x.sy || 0) > techoH + 1e-3) { avisos.push((ARTICULO[b] || 'La abertura') + ' se bajó a ' + A.fmt(Math.max(0.3, techoH)) + ' m para caber en la pared.'); x.sy = r3(Math.max(0.3, techoH)); } }
  }

  /* ---------- detección del soporte ---------- */
  function puntoPrueba(b, d) { return [+d.x || 0, +d.z || 0]; }
  /* ¿la cadena de soportes de `sid` pasa por `id`? (evita ciclos) */
  function crearCiclo(id, sid, est, docDe) {
    let k = sid, n = 0; while (k && n++ < 64) { if (k === id) return true; const d = est(docDe.get(k)); const s = soporteDe(d); k = s && s.id; }
    return n >= 64;
  }
  /* mejor soporte bajo un documento: fundaciones y pisos que lo contienen y cuya cara de arriba está a su altura */
  function detectar(id, d, est, docDe, todos) {
    const b = tb(d.tipo); if (b === 'nota') return null;
    const x = d.datos, by = baseY(x), [px, pz] = puntoPrueba(b, x);
    let mejor = null;
    for (const [cid, C] of todos) {
      if (!C || C.accion !== 'agregar' || C.mapa !== A.mapa || !C.datos || C.id_objeto === id) continue;
      const cb = tb(C.tipo); if (cb !== 'fundacion' && cb !== 'habitacion') continue;
      if (b === 'fundacion' && cb !== 'fundacion') continue;
      if ((b === 'habitacion' || b === 'muro' || b === 'techo') && cb === 'habitacion') continue; /* las paredes y los pisos se apoyan en la fundación, no en otro piso */
      const dif = Math.abs(by - tope(C.tipo, C.datos)); if (dif > TOL_Y) continue;
      if (!dentroCerca(px, pz, huella(C.tipo, C.datos), b === 'muro' ? TOL_XZ : 0.05)) continue;
      if (crearCiclo(id, C.id_objeto, est, docDe)) continue;
      const pref = cb === 'habitacion' ? -0.005 : 0; /* a igual altura, un mueble prefiere el piso */
      if (!mejor || dif + pref < mejor.dif) mejor = { dif: dif + pref, id: C.id_objeto, tipo: tipoSoporteDe(cb), doc: C };
    }
    return mejor;
  }
  function relPara(tipo, S, x) { if (tipo === 'pared') return undefined; return aLocal(marco(S.tipo, S.datos), x); }

  /* ---------- propagación ---------- */
  const CAMPOS_POS = ['x', 'y', 'z', 'giroY', 'sx', 'sy', 'sz', 'elevacion', 'alfeizar', 'incX', 'incZ'];
  const cambioPos = (a, b) => !a || CAMPOS_POS.some(k => Math.abs((+a[k] || 0) - (+b[k] || 0)) > 1e-6) || canon(a.puntos || null) !== canon(b.puntos || null);
  function docCon(d, datos) { const n = Object.assign({}, d, { datos: A.limpiarDatos(datos, d.tipo), actualizado: A.ahora() }); if (ENT) n.esquema = ENT.ESQUEMA; return n; }
  let ultimosAvisos = [];
  function propagar(lista, ef, opt) {
    opt = opt || {};
    const mapa = A.mapa, cambios = new Map(), orden = [];
    for (const it of lista) { if (!it) continue; if (!cambios.has(it.id)) orden.push(it.id); cambios.set(it.id, it.data); }
    const est = id => id == null ? null : (cambios.has(id) ? cambios.get(id) : ef.get(id));
    const esAgr = d => !!(d && d.accion === 'agregar' && d.mapa === mapa && d.datos);
    const docDe = new Map(); for (const [id, d] of ef) if (d && d.id_objeto && d.mapa === mapa) docDe.set(d.id_objeto, id);
    for (const [id, d] of cambios) if (d && d.id_objeto) docDe.set(d.id_objeto, id);
    const todos = () => { const m = new Map(ef); for (const [id, d] of cambios) m.set(id, d); return m; };
    const avisos = [];
    /* 1. lo que cambia el usuario: normalizar, reglas y resolver su soporte */
    const ctx = { cambios, orden, ef, est, esAgr, docDe, avisos, docCon, todos, hechos: new Set() };
    for (let i = 0; i < orden.length; i++) { /* las reglas pueden añadir documentos (paredes partidas…): también se procesan */
      const id = orden[i]; let d = cambios.get(id); if (!esAgr(d)) { const pv = ef.get(id); if (!d && esAgr(pv)) for (const f of reglasBorrar) { try { f(id, pv, ctx); } catch (e) { console.warn('regla de borrado', e); } } continue; }
      d = Object.assign({}, d, { datos: clon(d.datos) }); cambios.set(id, d);
      const prev = ef.get(id), x = d.datos, b = tb(d.tipo);
      if (b === 'fundacion' && window.OOFundaciones) OOFundaciones.normalizar(x, prev && prev.datos);
      for (const f of reglas) { try { f(id, d, prev, ctx); } catch (e) { console.warn('regla de anclaje', e); } }
      const cambioSop = !prev || canon((prev.datos && prev.datos.soporte) || null) !== canon(x.soporte || null);
      if (!prev || cambioPos(prev.datos, x) || cambioSop) resolver(id, d, prev, ctx);
      d.datos = A.limpiarDatos(x, d.tipo);
    }
    /* 2. dependientes, por anchura y una sola vez cada uno */
    const deps = new Map(); const add = (sid, did) => { let l = deps.get(sid); if (!l) deps.set(sid, l = []); l.push(did); };
    for (const [id, d] of ef) { if (cambios.has(id) || !esAgr(d)) continue; const s = soporteDe(d); if (s && s.id) add(s.id, id); }
    const vistos = new Set(orden), cola = orden.slice(), implicitos = new Map();
    while (cola.length) {
      const sid = cola.shift(), Sn = est(sid), So = ef.get(sid);
      const oid = (Sn && Sn.id_objeto) || (So && So.id_objeto); if (!oid || !So || !esAgr(So)) continue;
      const lista2 = (deps.get(oid) || []).slice();
      /* lo que estaba encima sin anclar (documentos viejos o fundación puesta debajo de algo ya hecho) se ancla ahora */
      const sb = tb(So.tipo);
      if ((sb === 'fundacion' || sb === 'habitacion') && Sn && esAgr(Sn) && canon(marco(So.tipo, So.datos)) !== canon(marco(Sn.tipo, Sn.datos))) {
        const hu = huella(So.tipo, So.datos), top = tope(So.tipo, So.datos);
        for (const [id, d] of ef) {
          if (vistos.has(id) || cambios.has(id) || !esAgr(d) || lista2.includes(id)) continue;
          const b = tb(d.tipo); if (b === 'calle' || b === 'nota' || soporteDe(d)) continue;
          if (b === 'fundacion' && sb !== 'fundacion') continue;
          if ((b === 'habitacion' || b === 'muro' || b === 'techo') && sb === 'habitacion') continue;
          if (Math.abs(baseY(d.datos) - top) > TOL_Y || !dentroCerca(+d.datos.x || 0, +d.datos.z || 0, hu, b === 'muro' ? TOL_XZ : 0.05)) continue;
          const c = detectar(d.id_objeto, d, id2 => ef.get(id2), docDe, ef); if (!c || c.id !== oid) continue;
          lista2.push(id); implicitos.set(id, { tipo: c.tipo });
        }
      }
      for (const did of lista2) {
        if (vistos.has(did)) continue; vistos.add(did);
        const Do = ef.get(did); if (!esAgr(Do)) continue;
        const nd = moverDependiente(Do, So, Sn, avisos, implicitos.get(did));
        if (nd) { cambios.set(did, nd); cola.push(did); }
      }
    }
    if (!opt.vista) { ultimosAvisos = avisos.slice(); if (avisos.length) setTimeout(() => A.pista([...new Set(avisos)].join(' ')), 30); }
    const out = []; for (const [id, data] of cambios) out.push({ id, data });
    return out;
  }
  function resolver(id, d, prev, ctx) {
    const { est, esAgr, docDe, avisos } = ctx; const x = d.datos, b = tb(d.tipo), oid = d.id_objeto;
    let s = ENT ? ENT.normSoporte(x.soporte) : x.soporte;
    if (s && s.tipo === 'libre') { x.soporte = { tipo: 'libre' }; return; }
    if (ABERTURAS.includes(b) && typeof x.muro === 'string') {
      const W = est(docDe.get(x.muro));
      if (esAgr(W) && tb(W.tipo) === 'muro') { pegarAPared(x, W.datos, b, avisos); x.soporte = { tipo: 'pared', id: x.muro }; return; }
    }
    if (s && s.tipo === 'terreno') { x.soporte = { tipo: 'terreno', manual: true, rel: { x: 0, y: r5((+x.y || 0) - alturaTerreno(+x.x || 0, +x.z || 0)), z: 0, g: 0 } }; return; }
    if (s && s.id && (s.manual || (s.tipo === 'pared'))) {
      const S = est(docDe.get(s.id));
      if (esAgr(S) && !crearCiclo(oid, s.id, est, docDe)) { x.soporte = { tipo: s.tipo, id: s.id, manual: true }; const rel = relPara(s.tipo, S, x); if (rel) x.soporte.rel = rel; return; }
      avisos.push(S ? 'Ese soporte crearía un ciclo: se deja sin anclar.' : 'El soporte de «' + nombreDoc(d) + '» ya no existe: queda libre.');
      delete x.soporte; return;
    }
    const c = detectar(oid, d, est, docDe, ctx.todos());
    if (c) { x.soporte = { tipo: c.tipo, id: c.id, auto: true }; const rel = relPara(c.tipo, c.doc, x); if (rel) x.soporte.rel = rel; }
    else delete x.soporte;
  }
  function moverDependiente(Do, So, Sn, avisos, implicito) {
    const x = clon(Do.datos), b = tb(Do.tipo);
    let s = soporteDe(Do); if (!s && implicito) s = { tipo: implicito.tipo, id: So.id_objeto, auto: true };
    if (!s) return null;
    if (!Sn || Sn.accion !== 'agregar') { /* el soporte se borró: queda donde está, libre */
      if (ABERTURAS.includes(b) && x.muro === So.id_objeto) avisos.push((ARTICULO[b] || 'Una abertura') + ' se quedó sin pared.');
      delete x.soporte; return docCon(Do, x);
    }
    if (s.tipo === 'pared') nuevoEnPared(So.datos, Sn.datos, x, b, avisos);
    else {
      const rel = s.rel || aLocal(marco(So.tipo, So.datos), x), w = aMundo(marco(Sn.tipo, Sn.datos), rel);
      x.x = w.x; x.y = w.y; x.z = w.z; x.giroY = w.giroY;
      x.soporte = s.rel && Do.datos.soporte ? clon(Do.datos.soporte) : Object.assign({}, Do.datos.soporte || s, { rel });
    }
    const a = Do.datos; if (!implicito && !cambioPos(a, x) && canon(a.soporte || null) === canon(x.soporte || null)) return null;
    return docCon(Do, x);
  }

  /* ---------- terreno: solo lo anclado al terreno sigue su superficie ---------- */
  let tTerreno = 0;
  function seguirTerreno() {
    const lista = [];
    for (const o of E.nuevos().values()) {
      const s = o.datos.soporte; if (!s || s.tipo !== 'terreno' || !s.rel) continue;
      const y = r3(alturaTerreno(+o.datos.x || 0, +o.datos.z || 0) + s.rel.y); if (Math.abs(y - (+o.datos.y || 0)) < 0.002) continue;
      const v = o.datos; o.datos = Object.assign({}, v, { y }); const doc = A.docActualizado(o); o.datos = v; if (doc) lista.push(doc);
    }
    if (lista.length) A.guardar(lista, { etiqueta: 'Seguir el terreno', sinAnclajes: true });
    return lista.length;
  }
  E.on('col', c => { if (c !== 'terreno') return; clearTimeout(tTerreno); tTerreno = setTimeout(seguirTerreno, 700); });

  /* ---------- vista previa en vivo mientras se arrastra con el gizmo ---------- */
  let tPrev = 0, pendPrev = null;
  function previsualizar(keys) {
    const ids = (keys || []).filter(k => k[0] === 'n').map(k => k.slice(1)); if (!ids.length) return 0;
    const lista = ids.map(i => { const o = E.nuevos().get(i); return o ? A.docActualizado(o) : null; }).filter(Boolean); if (!lista.length) return 0;
    const res = propagar(lista, A.efectivos(), { vista: true }); const propios = new Set(lista.map(l => l.id)); let n = 0;
    for (const it of res) { if (propios.has(it.id) || !it.data || !it.data.datos) continue; const o = E.nuevos().get(it.data.id_objeto); if (!o) continue; o.datos = clon(it.data.datos); n++; }
    if (n) A.renderTodo();
    return n;
  }
  E.on('arrastre', keys => { pendPrev = keys; if (tPrev) return; tPrev = setTimeout(() => { tPrev = 0; previsualizar(pendPrev); }, 70); });

  /* ---------- consultas ---------- */
  function dependientes(id, recursivo) {
    const out = [], idx = new Map();
    for (const o of E.nuevos().values()) { const s = soporteDe({ tipo: o.tipo, datos: o.datos }); if (s && s.id) { let l = idx.get(s.id); if (!l) idx.set(s.id, l = []); l.push(o.id); } }
    const cola = [id], vis = new Set([id]);
    while (cola.length) { const k = cola.shift(); for (const h of idx.get(k) || []) { if (vis.has(h)) continue; vis.add(h); out.push(h); if (recursivo) cola.push(h); } }
    return out;
  }
  function soporteDeObjeto(id) { const o = E.nuevos().get(id); return o ? soporteDe({ tipo: o.tipo, datos: o.datos }) : null; }
  /* soportes posibles para el inspector: fundaciones, pisos, techos y paredes cercanas que no dependan del objeto */
  function candidatos(id) {
    const o = E.nuevos().get(id); if (!o) return []; const desc = new Set(dependientes(id, true)); desc.add(id); const out = [];
    for (const c of E.nuevos().values()) {
      const b = tb(c.tipo); if (!esSoporte(b) || desc.has(c.id)) continue;
      const dist = Math.hypot((+c.datos.x || 0) - (+o.datos.x || 0), (+c.datos.z || 0) - (+o.datos.z || 0)); if (dist > 60) continue;
      out.push({ id: c.id, tipo: tipoSoporteDe(b), nombre: nombreDoc({ tipo: c.tipo, datos: c.datos, props: c.props }), dist });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 14);
  }
  /* revisión: anclajes rotos, ciclos, aberturas sin pared y objetos que atraviesan una plataforma */
  function validar() {
    const res = [], nv = E.nuevos(), docDe = new Map(); for (const o of nv.values()) docDe.set(o.id, o.docId);
    const ef = A.efectivos(), est = id => ef.get(id);
    for (const o of nv.values()) {
      const d = { tipo: o.tipo, datos: o.datos }, s = soporteDe(d), b = tb(o.tipo);
      if (s && s.id && !nv.has(s.id)) res.push({ id: o.id, nivel: 'error', texto: nombreDoc(o) + ': su soporte ya no existe.' });
      if (s && s.id && crearCiclo(o.id, s.id, est, docDe)) res.push({ id: o.id, nivel: 'error', texto: nombreDoc(o) + ': ciclo de soportes.' });
      if (ABERTURAS.includes(b) && typeof o.datos.muro === 'string' && !nv.has(o.datos.muro)) res.push({ id: o.id, nivel: 'aviso', texto: nombreDoc(o) + ' no tiene pared.' });
      if (!s && b !== 'fundacion' && b !== 'calle' && b !== 'nota' && b !== 'luz') {
        for (const f of nv.values()) {
          if (tb(f.tipo) !== 'fundacion') continue; const top = tope(f.tipo, f.datos), by = baseY(o.datos);
          if (by < top - 0.05 && by + (+o.datos.sy || 0.5) > (+f.datos.y || 0) && A.dentroPoligono(+o.datos.x || 0, +o.datos.z || 0, huella(f.tipo, f.datos))) { res.push({ id: o.id, nivel: 'aviso', texto: nombreDoc(o) + ' atraviesa la plataforma «' + nombreDoc(f) + '».' }); break; }
        }
      }
    }
    return res;
  }
  /* aviso del fantasma de colocación (editor.js, moverColocar) */
  function avisoColocar(tipo, datos, box) {
    const d = { tipo, datos, id_objeto: '__nuevo', accion: 'agregar', mapa: A.mapa }; const ef = A.efectivos(); const docDe = new Map(); for (const [i, x] of ef) if (x && x.id_objeto) docDe.set(x.id_objeto, i);
    const c = detectar('__nuevo', d, i => ef.get(i), docDe, ef);
    if (c) {
      const hu = huella(c.doc.tipo, c.doc.datos); const esq = box && !box.isEmpty() ? [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]] : [];
      const fuera = esq.some(([x, z]) => !dentroCerca(x, z, hu, 0.02));
      return { aviso: fuera, texto: (fuera ? 'medio fuera de ' : 'se apoya en ') + nombreDoc(c.doc), soporte: c.id };
    }
    for (const [, f] of ef) { if (!f || f.accion !== 'agregar' || f.mapa !== A.mapa || tb(f.tipo) !== 'fundacion' || !f.datos) continue; if (A.dentroPoligono(+datos.x || 0, +datos.z || 0, huella(f.tipo, f.datos)) && baseY(datos) < tope(f.tipo, f.datos) - 0.05) return { aviso: true, texto: 'debajo de la plataforma' }; }
    return null;
  }

  /* ---------- inspector: sección «Soporte» ---------- */
  const NOMBRE_SOP = { fundacion: 'Fundación', piso: 'Piso', pared: 'Pared', techo: 'Techo', terreno: 'Terreno', libre: 'Libre' };
  function htmlSoporte(o) {
    const s = soporteDeObjeto(o.id), deps = dependientes(o.id, true), cands = candidatos(o.id), b = tb(o.tipo);
    const sop = s && s.id ? E.nuevos().get(s.id) : null;
    const estado = !s ? 'Automático: ahora no se apoya en nada' : s.tipo === 'libre' ? 'Libre (no se ancla nunca)' : s.tipo === 'terreno' ? 'Sigue el terreno (' + A.fmt((s.rel && s.rel.y) || 0) + ' m encima)' : (NOMBRE_SOP[s.tipo] + ' «' + A.esc(sop ? nombreDoc(sop) : '¿borrado?') + '»' + (s.auto ? ' · automático' : s.manual ? ' · elegido' : ''));
    const valor = !s ? 'auto' : s.tipo === 'libre' ? 'libre' : s.tipo === 'terreno' ? 'terreno' : (s.auto ? 'auto' : 'id:' + s.id);
    const opc = [['auto', 'Automático (lo que tenga debajo)'], ['libre', 'Libre (no se ancla)'], ['terreno', 'Seguir el terreno']].concat(cands.map(c => ['id:' + c.id, NOMBRE_SOP[c.tipo] + ': ' + c.nombre + ' (' + A.fmt(c.dist, 1) + ' m)']));
    if (s && s.id && !s.auto && !cands.some(c => c.id === s.id)) opc.push(['id:' + s.id, NOMBRE_SOP[s.tipo] + ': ' + (sop ? nombreDoc(sop) : s.id)]);
    const fijo = ABERTURAS.includes(b) && typeof o.datos.muro === 'string';
    return `<details class="sec" open data-sec="soporte"><summary>Soporte y anclaje</summary><div class="campos">
      <p class="ayuda" style="margin:0 0 6px">${estado}</p>
      ${fijo ? '<p class="ayuda">Va encajada en su pared: se mueve con ella y no sale de su largo.</p>' : `<label class="campo ancho"><span>Apoyado en</span><select data-anc="modo" aria-label="Soporte">${opc.map(([v, n]) => `<option value="${A.esc(v)}"${v === valor ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label>`}
      <p class="ayuda" style="margin:6px 0 0">${deps.length ? deps.length + ' objeto' + (deps.length > 1 ? 's' : '') + ' apoyado' + (deps.length > 1 ? 's' : '') + ' aquí (se mueven con él).' : 'Nada se apoya en este objeto.'}</p>
      <div class="fila">${deps.length ? '<button data-anc="sel-deps">Seleccionar lo apoyado</button>' : ''}${s && s.id && sop ? '<button data-anc="sel-sop">Seleccionar el soporte</button>' : ''}</div></div></details>`;
  }
  function pintarSeccion() {
    const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c || A.sel.length !== 1 || A.sel[0][0] !== 'n') return;
    const o = E.nuevos().get(A.sel[0].slice(1)); if (!o || tb(o.tipo) === 'nota') return;
    const viejo = c.querySelector('[data-sec="soporte"]'); if (viejo) viejo.remove();
    const ref = c.querySelector('[data-sec="props"]') || c.querySelector('[data-sec="transform"]');
    const div = document.createElement('div'); div.innerHTML = htmlSoporte(o); const sec = div.firstElementChild;
    if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  }
  E.on('panel', pintarSeccion);
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || el.dataset.anc !== 'modo') return;
    const o = A.sel.length === 1 && A.sel[0][0] === 'n' ? E.nuevos().get(A.sel[0].slice(1)) : null; if (!o) return;
    ponerSoporte(o.id, el.value);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-anc]'); if (!b || b.tagName === 'SELECT') return;
    const o = A.sel.length === 1 && A.sel[0][0] === 'n' ? E.nuevos().get(A.sel[0].slice(1)) : null; if (!o) return;
    if (b.dataset.anc === 'sel-deps') A.seleccionar(dependientes(o.id, true).map(i => 'n' + i));
    if (b.dataset.anc === 'sel-sop') { const s = soporteDeObjeto(o.id); if (s && s.id) A.seleccionar(['n' + s.id]); }
  });
  /* modo: 'auto' | 'libre' | 'terreno' | 'id:<id>' */
  function ponerSoporte(id, modo) {
    const o = E.nuevos().get(id); if (!o) return false; const d = clon(o.datos);
    if (modo === 'auto') d.soporte = { tipo: 'auto' }; /* marca: resolver() lo vuelve a detectar */ else if (modo === 'libre') d.soporte = { tipo: 'libre' }; else if (modo === 'terreno') d.soporte = { tipo: 'terreno', manual: true };
    else if (String(modo).startsWith('id:')) { const sid = String(modo).slice(3), S = E.nuevos().get(sid); if (!S) return false; d.soporte = { tipo: tipoSoporteDe(tb(S.tipo)), id: sid, manual: true }; }
    const v = o.datos; o.datos = d; const doc = A.docActualizado(o); o.datos = v; if (!doc) return false;
    A.guardar([doc], { etiqueta: 'Cambiar el soporte' });
    return true;
  }

  /* ---------- vista de depuración: líneas de cada objeto a su soporte ---------- */
  const lineas = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x00b0ff, depthTest: false, transparent: true, opacity: 0.85 }));
  lineas.renderOrder = 45; lineas.frustumCulled = false; lineas.visible = false; A.scene.add(lineas);
  function dibujarLineas() {
    if (!lineas.visible) return; const pos = [], nv = E.nuevos();
    for (const o of nv.values()) { const s = soporteDeObjeto(o.id); if (!s || !s.id) continue; const S = nv.get(s.id); if (!S) continue; const m = marco(S.tipo, S.datos); pos.push(+o.datos.x || 0, (+o.datos.y || 0) + 0.3, +o.datos.z || 0, m.x, m.y + 0.3, m.z); }
    lineas.geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); lineas.geometry.computeBoundingSphere(); A.marcar();
  }
  E.on('render', dibujarLineas);
  function verLineas(v) { lineas.visible = !!v; dibujarLineas(); A.marcar(); }

  window.OOAnclajes = { propagar, previsualizar, dependientes, soporte: soporteDeObjeto, candidatos, ponerSoporte, validar, avisoColocar, seguirTerreno, verLineas, get verLineasOn() { return lineas.visible; },
    huella, tope, marco, aLocal, aMundo, dentroCerca, pegarAPared, nuevoEnPared, reglas, reglasBorrar, soporteDe, get avisos() { return ultimosAvisos; }, NOMBRE_SOP };
})();
