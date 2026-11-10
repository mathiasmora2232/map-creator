/* Editor del mapa (2.1 pro f6): «Enviar al juego». Convierte lo que el usuario construyó en el editor en un JSON que Unity aplica al
   construir la escena (unity/Assets/OperacionOficina/EditorMapaJuego.cs, llamado desde MenuMapas antes de la destrucción y la fusión).
   Formato «oo-editor-unity» (versión 1), TODO en coordenadas de Unity (x, y, −z del editor; cuaterniones (−qx, −qy, qz, qw)):
   - originales: piezas del mapa (mapa_<mapa>.json = las llamadas m.X(...) de Mapa<Mapa>.cs) que cambian. Se identifican por su firma
     (tipo de llamada, posición y tamaño originales en Unity, material y malla) con tolerancia, nunca por el índice. Cada una:
       borrar: true | delta: matriz 4x4 (filas) que lleva la pieza original a la nueva (mover, girar, escalar) |
       cajas: [{p, q, s}] (pared original cortada por un hueco: se quita y se ponen estas cajas con su mismo material) |
       color / mat: pintura nueva | colision: false.
   - mats: materiales de los objetos nuevos ({c: color, f: familia del juego, t: transparente, r: rugosidad, m: metálico, e: emisión}).
   - objetos: objetos nuevos ya horneados en primitivas con transformación global:
       partes: [{f: 'b'|'c'|'s', p, q, s, k}] (caja, cilindro y esfera unidad), {f: 'm', v: [x, y, z…] (triángulos sueltos), k}
       (pisos, cubiertas, escaleras, rampas, fundaciones), {f: 't', texto, p, q, w, h, fg, bg} (letreros), {f: 'l', p, c, alcance,
       energia} (luces), {f: 'mod', mod: clave, m: matriz 4x4} (objeto del catálogo con malla real del juego), y
       hojas: [{p, q, sentido, tipo, partes}] (puertas que se abren con F: Puerta.cs; bisagra en p, giro q).
   - modelos: {clave: [{malla, mat, rel}]}: piezas de cada malla real del juego (Resources/OperacionOficina/<Mapa>/Mallas) y su
     matriz relativa al objeto, igual que el servidor (modelos_juego en servidor.py).
   - no_soportado: lo que no se puede llevar al juego (o solo aproximado), con el motivo.
   Botón en el menú Exportar («Enviar al juego») y en la línea de comandos: node herramientas/editor_mapa/enviar_al_juego.mjs. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc;
  const MZ = new T.Matrix4().makeScale(1, 1, -1);
  const r4 = v => { const x = Math.round(v * 1e4) / 1e4; return x === 0 ? 0 : x; };
  const r3 = v => { const x = Math.round(v * 1e3) / 1e3; return x === 0 ? 0 : x; };
  const aUnity = m4 => new T.Matrix4().multiplyMatrices(MZ, m4).multiply(MZ);
  /* matriz de three (columnas) → 16 números por filas, como Matrix4x4 de Unity (m[fila, columna]) */
  const filas = m4 => { const e = m4.elements, o = []; for (let f = 0; f < 4; f++) for (let c = 0; c < 4; c++) o.push(r4(e[c * 4 + f])); return o; };
  const _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
  function trs(m4E) { aUnity(m4E).decompose(_p, _q, _s); return { p: [r4(_p.x), r4(_p.y), r4(_p.z)], q: [r4(_q.x), r4(_q.y), r4(_q.z), r4(_q.w)], s: [r4(Math.abs(_s.x)), r4(Math.abs(_s.y)), r4(Math.abs(_s.z))] }; }
  const sano = m4 => m4.elements.every(isFinite) && Math.abs(m4.determinant()) > 1e-12;
  const qDatos = d => new T.Quaternion().setFromEuler(new T.Euler((+d.incX || 0) * A.DEG, (+d.giroY || 0) * A.DEG, (+d.incZ || 0) * A.DEG, 'YXZ'));
  const matrizObjeto = d => new T.Matrix4().compose(new T.Vector3(+d.x || 0, +d.y || 0, +d.z || 0), qDatos(d), new T.Vector3(1, 1, 1));
  const hex = c => { const s = String(c || '#cccccc').toLowerCase(); return /^#[0-9a-f]{6}$/.test(s) ? s : (/^#[0-9a-f]{3}$/.test(s) ? '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : '#cccccc'); };

  /* ---------------- piezas del mapa original ---------------- */
  function firma(i) {
    const D = A.D, a = D.piezas[i], t = a[0];
    const f = { ref: i, t, sec: D.secciones[a[1]] || '', pos: [a[3], a[4], a[5]], tam: [a[6], a[7], a[8]] };
    if (a[13] >= 0 && D.materiales[a[13]]) f.mat = D.materiales[a[13]][0];
    if (t === 1 && a.length >= 23 && a[16] >= 0 && D.archivos) { f.malla = D.archivos[a[16]]; f.pos = [a[17], a[18], a[19]]; f.tam = [a[20], a[21], a[22]]; }
    if (window.OOEntidades && OOEntidades.uid) { try { f.uid = OOEntidades.uid('p' + i); } catch (e) { /* sin uid */ } }
    return f;
  }
  const igualV = (a, b, t) => Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t && Math.abs(a.z - b.z) <= t;
  const igualQ = (a, b) => Math.abs(a.dot(b)) >= 1 - 1e-7;
  function matPropio(props) {
    const id = props && String(props.material || '').startsWith('u:') ? props.material.slice(2) : null; if (!id) return null;
    return A.efectivos('materiales').get(id) || null;
  }
  /* (2.1) ¿El documento que cambió la pieza i describe en `antes` esta misma pieza? Si el mapa se regeneró y las referencias no se
     migraron (pasó con el JSON de la 2.1.2: 659 de 685 piezas equivocadas), el `antes` es de otra pieza. null si no hay con qué comparar. */
  function antesDe(doc, i) {
    const a = doc && doc.antes; if (!a || typeof a !== 'object') return null;
    if (Array.isArray(a.piezas)) return a.piezas.find(p => p && p.ref === i) || null;
    return typeof a.x === 'number' ? a : null;
  }
  function descuadre(z, a) {
    const d = Math.hypot(a.x - z.b.p.x, a.y - z.b.p.y, a.z - z.b.p.z);
    if (d > 0.02) return d;
    if (z.t <= 4 && [a.sx, a.sy, a.sz].every(v => typeof v === 'number') && Math.max(Math.abs(a.sx - z.b.s.x), Math.abs(a.sy - z.b.s.y), Math.abs(a.sz - z.b.s.z)) > 0.02) return 0.021;
    return 0;
  }
  function revisarRefs() {
    const P = A.P, N = A.N, ef = A.efectivos(), malas = []; let revisadas = 0;
    if (!P) return { revisadas, malas };
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (!z || !z.doc) continue;
      const a = antesDe(ef.get(z.doc), i); if (!a) continue;
      revisadas++;
      const d = descuadre(z, a); if (d) malas.push({ ref: i, doc: z.doc, distancia: Math.round(d * 100) / 100 });
    }
    return { revisadas, malas };
  }
  let avisoRefs = '';
  function avisarRefs() {
    if (!A.D) return;
    const r = revisarRefs(), clave = A.mapa + ':' + r.malas.length;
    if (clave === avisoRefs) return; avisoRefs = clave;
    if (!r.malas.length) return;
    const txt = r.malas.length + ' cambios de piezas del mapa «' + A.mapa + '» no casan con la pieza que nombran (el mapa del juego se regeneró y sus referencias no se migraron). No envíes al juego: reinicia el servidor del editor (migra solo, con respaldo) o revisa con verificar_refs.py.';
    console.warn('[editor] ' + txt, r.malas.slice(0, 20));
    if (window.OOAvisoRecarga) window.OOAvisoRecarga(txt); else A.pista(txt);
  }
  E.on('recompute', () => setTimeout(avisarRefs, 0));
  function originales(out) {
    const P = A.P, N = A.N;
    const rr = revisarRefs(); out.refs = { revisadas: rr.revisadas, descuadradas: rr.malas.length, ejemplos: rr.malas.slice(0, 20) };
    for (let i = 0; i < N; i++) {
      const z = P[i]; if (!z) continue;
      const props = z.props ? A.propsDe('p' + i) : null, mp = matPropio(props);
      const movida = !igualV(z.p, z.b.p, 1e-4) || !igualQ(z.q, z.b.q) || !igualV(z.s, z.b.s, 1e-4);
      const pintada = z.c.getHexString() !== z.b.c.getHexString() || !!mp;
      const sinCol = props && props.colision === false;
      if (!z.del && !movida && !pintada && !z.cortes && !sinCol) continue;
      if (z.cat === 'txt' && !z.del && !movida) continue;
      const e = { firma: firma(i) };
      if (z.del) { e.borrar = true; out.originales.push(e); continue; }
      if (z.cortes) e.cajas = z.cortes.filter(c => sano(c.m)).map(c => trs(c.m));
      else if (movida) {
        const s1 = z.t <= 4 ? z.s : new T.Vector3(1, 1, 1), s0 = z.t <= 4 ? z.b.s : new T.Vector3(1, 1, 1);
        const fix = v => new T.Vector3(v.x || 1, v.y || 1, v.z || 1);
        const d = new T.Matrix4().compose(z.p, z.q, fix(s1)).multiply(new T.Matrix4().compose(z.b.p, z.b.q, fix(s0)).invert());
        e.delta = filas(aUnity(d));
      }
      if (pintada) { e.color = mp && mp.color ? hex(mp.color) : '#' + z.c.getHexString(); if (mp) e.mat = { f: mp.preset || mp.patron || null, r: mp.rugosidad, m: mp.metal, o: mp.opacidad }; }
      if (sinCol) e.colision = false;
      if (props && props.comportamientos && props.comportamientos.length) out.no_soportado.push({ id: 'p' + i, nombre: A.nombreEntidades(['p' + i]), motivo: 'comportamientos en piezas del mapa original (solo se llevan los de objetos nuevos)' });
      out.originales.push(e);
    }
  }

  /* ---------------- materiales de los objetos nuevos ---------------- */
  function tablaMats() {
    const lista = [], idx = new Map();
    return { lista, k(desc) { const key = JSON.stringify(desc); let i = idx.get(key); if (i == null) { i = lista.length; lista.push(desc); idx.set(key, i); } return i; } };
  }
  /* familia del juego para una parte: la del material del objeto si la parte lleva su color (las molduras y zócalos van en liso) */
  function familia(o, pt, mp) {
    if (pt.t) return 'vidrio';
    if (mp) return mp.preset || mp.patron || null;
    const d = o.datos || {}, c = hex(pt.c);
    if (d.matSup && c === hex(d.colorSup)) return d.matSup;
    if (d.matLat && c === hex(d.colorLat)) return d.matLat;
    if (d.material && c === hex(d.color)) return d.material;
    if (d.material && pt.f === 'poly') return d.material;
    return null;
  }
  function descMat(o, pt, mp) {
    const d = { c: hex(mp && mp.color ? mp.color : pt.c) };
    const f = familia(o, pt, mp); if (f) d.f = f;
    if (pt.t) d.t = true;
    if (mp) { if (mp.rugosidad != null) d.r = +mp.rugosidad; if (mp.metal != null) d.m = +mp.metal; if (mp.opacidad != null && +mp.opacidad < 0.99) d.t = true; if (mp.emision && mp.emisionInt) d.e = hex(mp.emision); }
    return d;
  }

  /* ---------------- objetos nuevos ---------------- */
  function triangulosPoly(pt) {
    const sh = new T.Shape(pt.pts.map(([x, zz]) => new T.Vector2(x, -zz)));
    if (Array.isArray(pt.agujeros)) for (const ag of pt.agujeros) if (Array.isArray(ag) && ag.length >= 3) sh.holes.push(new T.Path(ag.map(([x, zz]) => new T.Vector2(x, -zz))));
    let geo = new T.ExtrudeGeometry(sh, { depth: pt.grosor || 0.03, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, pt.y || 0, 0);
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(aUnity(pt.m));
    const a = geo.attributes.position.array, v = new Array(a.length);
    for (let j = 0; j < a.length; j++) v[j] = r4(a[j]);
    geo.dispose(); return v;
  }
  /* piezas de una malla real del juego (como modelos_juego() de servidor.py, pero con el nombre de la malla y el material) */
  const mUnity = (p, q, s) => new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), new T.Quaternion(q[0], q[1], q[2], q[3]).normalize(), new T.Vector3(s[0], s[1], s[2]));
  const COCHES = new Set(['sedan', 'suv', 'pickup', 'hatchback']);
  function piezasModelo(clave) {
    const D = A.D; if (!D || !D.archivos) return null;
    const arch = D.archivos, lista = [];
    for (const a of D.piezas) { if (a.length < 23 || a[16] < 0 || a[16] >= arch.length) continue; if (String(arch[a[16]]).replace(/(_\d+)+$/, '') === clave) lista.push(a); }
    if (!lista.length) return null;
    const a0 = lista[0], inv = mUnity(a0.slice(17, 20), a0.slice(9, 13), [1, 1, 1]).invert();
    let elegidas = [a0];
    if (COCHES.has(clave)) elegidas = lista.filter(a => { const l = new T.Vector3(a[17], a[18], a[19]).applyMatrix4(inv); return Math.abs(l.x) < 3.2 && Math.abs(l.y) < 3 && Math.abs(l.z) < 1.6; });
    return elegidas.map(a => ({ malla: arch[a[16]], mat: a[13] >= 0 && D.materiales[a[13]] ? D.materiales[a[13]][0] : null, rel: filas(inv.clone().multiply(mUnity(a.slice(17, 20), a.slice(9, 13), a.slice(20, 23)))) }));
  }
  /* parte → JSON (o null si no es geometría); `corr` = matriz que se aplica antes (hoja de puerta cerrada) */
  function parteJSON(o, pt, mats, mp, out, corr) {
    if (!pt.m || pt.ayuda) return null;
    const m = corr ? new T.Matrix4().multiplyMatrices(corr, pt.m) : pt.m;
    if (pt.f === 'l') { const d = o.datos || {}; m.decompose(_p, _q, _s); return { f: 'l', p: [r4(_p.x), r4(_p.y), r4(-_p.z)], c: hex(pt.c || '#ffe8b0'), alcance: +d.alcance || 10, energia: +d.intensidad || 1 }; }
    if (pt.f === 't') { const x = trs(m); return { f: 't', texto: String(pt.texto || ''), p: x.p, q: x.q, w: r3(+pt.w || 1), h: r3(+pt.h || 0.3), fg: hex(pt.fg || '#ffffff'), bg: hex(pt.bg || '#1f5a3a') }; }
    if (pt.f === 'poly') { if (!pt.pts || pt.pts.length < 3) return null; const p2 = Object.assign({}, pt, { m }); return { f: 'm', v: triangulosPoly(p2), k: mats.k(descMat(o, pt, mp)) }; }
    if (pt.oculta && pt.modelo) {
      const M = window.OOModelos && OOModelos.modelos[pt.modelo];
      if (M && !out.modelos[pt.modelo]) { const pz = piezasModelo(pt.modelo); if (pz) out.modelos[pt.modelo] = pz; }
      if (M && out.modelos[pt.modelo]) {
        const R = new T.Matrix4().makeRotationY((OOModelos.GIRO && OOModelos.GIRO[pt.modelo]) || 0);
        const W = new T.Matrix4().multiplyMatrices(m, M.N).multiply(R);
        return { f: 'mod', mod: pt.modelo, m: filas(aUnity(W)), caja: trs(m) };
      }
      out.no_soportado.push({ id: 'n' + o.id, nombre: A.nombreEntidades(['n' + o.id]), motivo: 'malla real «' + pt.modelo + '» no está en este mapa: va como caja' });
    } else if (pt.oculta && pt.asset) {
      out.no_soportado.push({ id: 'n' + o.id, nombre: A.nombreEntidades(['n' + o.id]), motivo: 'modelo importado (GLB): en el juego va como su caja; para verlo hay que importar el .glb en Unity' });
    } else if (pt.oculta) return null;
    if (!sano(m)) return null;
    const x = trs(m);
    return { f: pt.oculta ? 'b' : (pt.f === 'c' ? 'c' : pt.f === 's' ? 's' : 'b'), p: x.p, q: x.q, s: x.s, k: mats.k(descMat(o, pt, mp)) };
  }
  /* puertas: ángulo entreabierto con el que el editor dibuja cada estilo (catalogo.js, hojasPuerta) y bisagra en el marco */
  const ANG_HOJA = { metal_oficina: -0.22, bano_gris: -0.22, madera: -0.22, vidrio_aluminio: -0.18, simple: -1.2 };
  const TIPO_SONIDO = { metal_oficina: 'metal', bano_gris: 'bano', madera: 'madera', vidrio_aluminio: 'cristal', simple: 'madera' };
  function comportamientoPuerta(o) { const cs = (o.props && o.props.comportamientos) || []; return cs.find(c => c && c.tipo === 'puerta') || null; }
  function hojasPuerta(o, parts, mats, mp, out) {
    const d = o.datos || {}, est = d.estilo || 'metal_oficina';
    if (!(est in ANG_HOJA)) { out.no_soportado.push({ id: 'n' + o.id, nombre: A.nombreEntidades(['n' + o.id]), motivo: 'puerta «' + est + '»: en el juego queda fija (solo se abren las abatibles)' }); return null; }
    const w = +d.sx || 0.9, g = (+d.sz || 0.2) + 0.03, h = new T.Vector3(-w / 2, 0, est === 'simple' ? g / 2 : g / 2 + 0.005);
    const Mo = matrizObjeto(d), Mi = Mo.clone().invert();
    const corr = new T.Matrix4().multiplyMatrices(Mo, new T.Matrix4().makeTranslation(h.x, h.y, h.z)).multiply(new T.Matrix4().makeRotationY(-ANG_HOJA[est])).multiply(new T.Matrix4().makeTranslation(-h.x, -h.y, -h.z)).multiply(Mi);
    const hoja = [], marco = [];
    parts.forEach((pt, j) => { const x = parteJSON(o, pt, mats, mp, out, j >= 3 ? corr : null); if (x) (j >= 3 ? hoja : marco).push(x); });
    const bis = trs(new T.Matrix4().multiplyMatrices(Mo, new T.Matrix4().makeTranslation(h.x, h.y, h.z)));
    return { marco, hojas: [{ p: bis.p, q: bis.q, sentido: -1, tipo: TIPO_SONIDO[est] || '', partes: hoja }] };
  }
  /* objeto con el comportamiento «puerta» (portón, hoja suelta…): bisagra en un lado de su caja, o dos hojas si es doble */
  function hojasGenericas(o, parts, mats, mp, out, cp) {
    const modo = cp.modo || 'simple';
    if (modo !== 'simple' && modo !== 'doble') { out.no_soportado.push({ id: 'n' + o.id, nombre: A.nombreEntidades(['n' + o.id]), motivo: 'puerta «' + modo + '»: en el juego queda fija (solo abatible simple o doble)' }); return null; }
    const Mo = matrizObjeto(o.datos || {}), Mi = Mo.clone().invert(), box = new T.Box3(), v = new T.Vector3();
    const locales = parts.map(pt => { if (!pt.m || pt.ayuda || pt.f === 'l') return null; const ml = new T.Matrix4().multiplyMatrices(Mi, pt.m); for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) box.expandByPoint(v.set(sx, sy, sz).applyMatrix4(ml)); return new T.Vector3().setFromMatrixPosition(ml); });
    if (box.isEmpty()) return null;
    const zc = (box.min.z + box.max.z) / 2, xc = (box.min.x + box.max.x) / 2;
    const doble = modo === 'doble' || cp.bisagra === 'centro' || cp.bisagra === 'exterior';
    const hoja = (x, sentido, filtro) => { const bis = trs(new T.Matrix4().multiplyMatrices(Mo, new T.Matrix4().makeTranslation(x, box.min.y, zc))); const ps = []; parts.forEach((pt, j) => { if (locales[j] && filtro(locales[j].x)) { const r = parteJSON(o, pt, mats, mp, out, null); if (r) ps.push(r); } }); return { p: bis.p, q: bis.q, sentido, tipo: 'metal', partes: ps }; };
    if (doble) return { marco: [], hojas: [hoja(box.min.x, -1, x => x < xc), hoja(box.max.x, 1, x => x >= xc)], par: true };
    return cp.bisagra === 'derecha' ? { marco: [], hojas: [hoja(box.max.x, 1, () => true)] } : { marco: [], hojas: [hoja(box.min.x, -1, () => true)] };
  }
  function objetos(out, mats) {
    for (const o of E.nuevos().values()) {
      const b = A.tipoBase(o.tipo); if (b === 'nota') continue;
      const capa = A.capaDeNuevo(o); if (A.capaInfo(capa).visible === false) { out.capas_ocultas[capa] = (out.capas_ocultas[capa] || 0) + 1; continue; }
      let parts; try { parts = A.partesMundo(o); } catch (e) { out.no_soportado.push({ id: 'n' + o.id, nombre: A.nombreEntidades(['n' + o.id]), motivo: 'no se pudo construir: ' + (e.message || e) }); continue; }
      const props = o.props || {}, mp = matPropio(props);
      const j = { id: o.id, nombre: A.nombreEntidades(['n' + o.id]), tipo: o.tipo, capa };
      if (props.colision === false) j.colision = false;
      const cp = comportamientoPuerta(o);
      let hj = null;
      if (b === 'puerta') hj = hojasPuerta(o, parts, mats, mp, out);
      else if (cp) hj = hojasGenericas(o, parts, mats, mp, out, cp);
      if (hj) { j.partes = hj.marco; j.hojas = hj.hojas; if (hj.par) j.par = true; }
      else j.partes = parts.map(pt => parteJSON(o, pt, mats, mp, out, null)).filter(Boolean);
      const otros = ((props.comportamientos) || []).filter(c => c && c.tipo && c.tipo !== 'puerta');
      if (otros.length) out.no_soportado.push({ id: 'n' + o.id, nombre: j.nombre, motivo: 'comportamientos ' + otros.map(c => '«' + c.tipo + '»').join(', ') + ' (todavía no se aplican en Unity)' });
      if (b === 'cartel') out.no_soportado.push({ id: 'n' + o.id, nombre: j.nombre, motivo: 'carteles: van aparte (Resources/Carteles, se guardan solos); aquí solo su geometría' });
      if ((j.partes && j.partes.length) || (j.hojas && j.hojas.length)) out.objetos.push(j);
    }
  }

  function cambiosUnity() {
    const out = { formato: 'oo-editor-unity', version: 1, mapa: A.mapa, generado: A.ahora(), coordenadas: 'Unity: x = X, y = Y, z = -Z del editor; cuaterniones (-qx, -qy, qz, qw); matrices 4x4 por filas', originales: [], mats: [], modelos: {}, objetos: [], no_soportado: [], capas_ocultas: {} };
    if (!A.D) return out;
    try { A.renderTodo(); } catch (e) { /* las paredes necesitan sus huecos y esquinas al día */ }
    originales(out);
    const mats = tablaMats(); objetos(out, mats); out.mats = mats.lista;
    if (window.OOTerreno && OOTerreno.datos()) out.no_soportado.push({ id: 'terreno', nombre: 'Terreno esculpido y pintado', motivo: 'Unity no aplica todavía las alturas ni la pintura del terreno (se exportan aparte: Exportar → Terreno)' });
    for (const n of (window.OOZonas ? OOZonas.lista() : [])) { out.no_soportado.push({ id: 'zonas', nombre: 'Zonas del editor', motivo: 'son solo del editor (organizar y exportar por partes); no tienen efecto en el juego' }); break; }
    if (window.OOValidacion) { try { const v = OOValidacion.revisar(); out.avisos = v.length; } catch (e) { /* sin validación */ } }
    const n = { partes: 0, hojas: 0 }; for (const o of out.objetos) { n.partes += (o.partes || []).length; for (const h of o.hojas || []) { n.hojas++; n.partes += h.partes.length; } }
    out.resumen = { borradas: out.originales.filter(e => e.borrar).length, movidas: out.originales.filter(e => e.delta).length, cortadas: out.originales.filter(e => e.cajas).length, pintadas: out.originales.filter(e => e.color).length, objetos: out.objetos.length, partes: n.partes, puertas: n.hojas, no_soportado: out.no_soportado.length, refs_descuadradas: out.refs ? out.refs.descuadradas : 0 };
    return out;
  }

  /* ---------------- enviar ---------------- */
  let ultimo = null;
  async function enviar(opts) {
    opts = opts || {};
    const j = cambiosUnity(); const texto = JSON.stringify(j);
    let res = null, error = '';
    /* (2.1) con referencias descuadradas no se envía: el juego borraría, movería y pintaría otras piezas (opts.forzar para saltárselo) */
    if (j.refs && j.refs.descuadradas && !opts.forzar) {
      error = j.refs.descuadradas + ' de ' + j.refs.revisadas + ' cambios de piezas del mapa no casan con la pieza que nombran (el mapa se regeneró y las referencias no se migraron): no se envía. Reinicia el servidor del editor (migra solo, con respaldo) o revisa con herramientas/editor_mapa/verificar_refs.py.';
      ultimo = { json: j, res: null, error, bytes: texto.length, bloqueado: true };
      if (!opts.sinDialogo) A.abrirModal(`<div class="cab">Enviar al juego (Unity)</div><div class="cont"><p class="aviso">${esc(error)}</p><p>Primeras piezas: ${j.refs.ejemplos.map(x => 'p' + x.ref + ' (' + x.distancia + ' m)').join(', ')}</p></div><div class="pie"><button class="prim" data-a="m-si">Entendido</button></div>`);
      return { ok: false, bloqueado: true, error, bytes: texto.length, resumen: j.resumen, no_soportado: j.no_soportado, refs: j.refs };
    }
    try {
      const r = await fetch('/api/juego/' + A.mapa, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: texto });
      if (r.ok) res = await r.json(); else error = 'HTTP ' + r.status;
    } catch (e) { error = String(e.message || e); }
    ultimo = { json: j, res, error, bytes: texto.length };
    if (!res && !opts.sinDescarga) {
      const blob = new Blob([texto], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cambios_' + A.mapa + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    if (!opts.sinDialogo) dialogo(ultimo);
    return { ok: !!res, ruta: res && res.ruta, error, bytes: texto.length, resumen: j.resumen, no_soportado: j.no_soportado, refs: j.refs };
  }
  function dialogo(u) {
    const r = u.json.resumen, ns = u.json.no_soportado;
    const ocultas = Object.entries(u.json.capas_ocultas || {});
    const ok = u.res ? `<p>Guardado en <code>${esc(u.res.ruta)}</code> (${A.fmtInt(u.bytes)} bytes).</p><p><b>Ahora compila el juego</b>: en Unity, menú <b>Operación Oficina → Compilar juego (Windows)</b>, o desde la consola con <code>-executeMethod OperacionOficina.Editor.MenuMapas.CompilarJuego</code>. Unity aplica estos cambios al construir la escena (colisiones, puertas y malla de los bots incluidas).</p>`
      : `<p class="aviso">El servidor del editor no pudo guardarlo (${esc(u.error)}): probablemente es un servidor anterior a esta versión. Se ha descargado <code>cambios_${esc(A.mapa)}.json</code>: cópialo a <code>unity/Assets/OperacionOficina/Resources/EditorMapa/</code> y compila. O reinicia el servidor del editor y vuelve a enviar.</p>`;
    A.abrirModal(`<div class="cab">Enviar al juego (Unity)</div><div class="cont">${ok}
      <ul class="lista-f6"><li>${r.objetos} objetos nuevos (${A.fmtInt(r.partes)} piezas, ${r.puertas} hojas de puerta)</li><li>${r.borradas} piezas del mapa borradas, ${r.movidas} movidas o escaladas, ${r.cortadas} paredes cortadas por huecos, ${r.pintadas} pintadas</li>${u.json.avisos ? `<li>La revisión del mapa tiene ${u.json.avisos} avisos (escaleras, flotando, anclajes…): <button class="link" data-a="validar-mapa">revisarlos</button></li>` : ''}${ocultas.length ? `<li>No se envían las capas ocultas: ${ocultas.map(([c, n]) => esc(c) + ' (' + n + ')').join(', ')}</li>` : ''}</ul>
      ${ns.length ? `<details><summary>Lo que no se lleva al juego o va aproximado (${ns.length})</summary><ul class="lista-f6">${ns.slice(0, 80).map(x => `<li><b>${esc(x.nombre || x.id)}</b>: ${esc(x.motivo)}</li>`).join('')}</ul></details>` : '<p>Todo lo del editor tiene equivalente en el juego.</p>'}
      </div><div class="pie"><button class="prim" data-a="m-si">Entendido</button></div>`);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-a="exp-enviar-juego"]'); if (!b) return; e.preventDefault(); const m = document.querySelector('#menuExportar'); if (m) m.hidden = true; enviar(); });
  window.OOJuegoUnity = { cambiosUnity, enviar, firma, piezasModelo, revisarRefs, get ultimo() { return ultimo; } };
})();
