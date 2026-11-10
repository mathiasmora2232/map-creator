/* Editor del mapa (2.1, Map Editor Pro fase 5): transformaciones avanzadas.
   Inspector → sección «Transformar» (con algo seleccionado) y menú Modelar:
   - Mover y girar con valores exactos (ΔX ΔY ΔZ en coordenadas globales o en los ejes del objeto; grados alrededor del pivote).
     Tras mover o girar con el gizmo se puede escribir la medida exacta y pulsar Enter (como en SketchUp): corrige el último movimiento.
   - Alinear (mínimo, centro o máximo en X, Y o Z, respecto a la selección o al primer objeto) y distribuir (por centros o con huecos iguales).
   - Reflejar en X o en Z (o reflejar una copia): posición, giro, contorno de los polígonos y sentido de las escaleras en L.
   - Duplicar con desplazamiento (N copias, cada una ΔX ΔY ΔZ y un giro más), duplicar en matriz (filas × columnas × pisos con separación)
     y repetir a lo largo de una línea o una curva (herramienta «Repetir en un camino» o en línea recta con una dirección): cantidad y separación.
   - Ejes bloqueados (X, Y, Z: el gizmo y el arrastre no se mueven en ellos), espacio del gizmo (automático, local o global) y pivote
     (centro de las posiciones, centro de la caja, base, esquina mínima, primer objeto o un punto elegido con un clic).
   - Medidas exactas: caja de la selección (ancho X, alto Y, fondo Z) y tamaño del objeto en sus ejes, editables.
   Todo lo que cambia datos va en un solo paso de deshacer con nombre. Las copias reasignan las referencias internas (soporte, pared, techo
   de habitación) dentro del conjunto copiado.
   API: OOTransformar.mover(keys, [dx,dy,dz], local), girar(keys, grados), alinear(keys, eje, modo, ref), distribuir(keys, eje, modo),
   reflejar(keys, eje, copia), duplicarDesplazado(keys, opts), matriz(keys, opts), repetirEnCamino(keys, puntos, opts), repetirEnLinea(keys, opts),
   medida(keys, eje, valor), tamLocal(id, eje, valor), bloquear(eje, v), ponerPivote(modo, punto), ponerEspacio(e). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, Q4 = T.Quaternion, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon, AJ = A.AJ;
  const ARRIBA = new V3(0, 1, 0), nv = () => E.nuevos();
  AJ.bloqueoEjes = Object.assign({ x: false, y: false, z: false }, AJ.bloqueoEjes || {});
  if (!['auto', 'local', 'global'].includes(AJ.espacio)) AJ.espacio = 'auto';
  if (AJ.imanAngulo == null) AJ.imanAngulo = true; /* imán de ángulo del gizmo (independiente de la rejilla); paso en AJ.angulo */
  const PIVOTES = [['centro', 'Centro de las posiciones'], ['caja', 'Centro de la caja'], ['base', 'Base (centro abajo)'], ['min', 'Esquina mínima'], ['activo', 'Primer objeto elegido'], ['punto', 'Punto elegido en la vista']];
  let pivoteModo = 'centro', pivotePunto = null;
  const P5 = { dx: 0, dy: 0, dz: 0, local: false, giro: 90, alEje: 'x', alRef: 'seleccion', diEje: 'x', diModo: 'centros', copia: false,
    duN: 3, duX: 2, duY: 0, duZ: 0, duG: 0, maF: 3, maC: 4, maP: 1, maSX: 3, maSZ: 3, maSY: 3, maLocal: true,
    cercano90: false, reN: 20, reSep: 3, reModo: 'cantidad', reAlinear: true, reCurva: false, reDir: 0, reOriginal: true };
  A.params.transformar = P5;
  const POLI = o => { const b = tb(o.tipo); return (b === 'habitacion' || b === 'techo' || (b === 'fundacion' && o.datos.forma === 'poligono')) && Array.isArray(o.datos.puntos); };

  /* ---------- utilidades de datos ---------- */
  const rotXZ = (x, z, g) => { const c = Math.cos(g * DEG), s = Math.sin(g * DEG); return [x * c + z * s, -x * s + z * c]; }; /* misma convención que giroY */
  function trasladar(d, t) { d.x = (+d.x || 0) + t[0]; d.y = (+d.y || 0) + t[1]; d.z = (+d.z || 0) + t[2]; return d; }
  function girarDatos(d, c, g) { const [x, z] = rotXZ((+d.x || 0) - c[0], (+d.z || 0) - c[1], g); d.x = c[0] + x; d.z = c[1] + z; d.giroY = norm((+d.giroY || 0) + g); if (d.orientacionMundo != null) d.orientacionMundo = norm(d.orientacionMundo + g); return d; }
  const norm = a => { a = a % 360; if (a > 180) a -= 360; if (a <= -180) a += 360; return r3(a); };
  /* reflexión respecto al plano x = c (eje 'x') o z = c (eje 'z'): giro 180 − g o −g, contorno local con z invertida (ver la cuenta en la cabecera) */
  function espejoDatos(tipo, d, eje, c) {
    const b = tb(tipo);
    if (eje === 'x') { d.x = 2 * c - (+d.x || 0); d.giroY = norm(180 - (+d.giroY || 0)); } else { d.z = 2 * c - (+d.z || 0); d.giroY = norm(-(+d.giroY || 0)); }
    if (d.incX) d.incX = -d.incX;
    if (Array.isArray(d.puntos)) d.puntos = d.puntos.map(([x, z]) => [x, -z]).reverse();
    if (b === 'escalera' && d.forma && d.forma !== 'recta') d.giro = d.giro === 'der' ? 'izq' : 'der';
    if (b === 'techo' && d.orientacion) d.orientacion = norm(-d.orientacion);
    return d;
  }
  /* documentos con los datos nuevos de los objetos nuevos + estados nuevos de las piezas del mapa, en un paso */
  function guardarCambios(datosN, estadosP, etiqueta) {
    const lista = [];
    for (const [id, nd] of datosN) { const o = nv().get(id); if (!o) continue; const v = o.datos; o.datos = nd; const doc = A.docActualizado(o); o.datos = v; if (doc) lista.push(doc); }
    const refs = []; for (const [k, st] of estadosP) { A.ponerEstado(k, st.p, st.q, st.s); refs.push(+k.slice(1)); }
    if (refs.length) lista.push(...A.docModOrig(refs));
    if (lista.length) A.guardar(lista, { etiqueta });
    return lista.length;
  }
  const yawQ = q => new T.Euler().setFromQuaternion(q, 'YXZ').y / DEG;
  /* transforma cada clave: fn(datos clonado | null, estado) → para 'n' devuelve datos, para 'p' modifica el estado */
  function transformar(keys, fnN, fnP, etiqueta) {
    const dN = new Map(), eP = new Map();
    for (const k of keys) {
      if (k[0] === 'n') { const o = nv().get(k.slice(1)); if (!o) continue; const nd = fnN(o.tipo, clon(o.datos), o); if (nd) dN.set(o.id, nd); }
      else if (k[0] === 'p') { const st = A.estadoEnt(k); if (fnP(st, k) !== false) eP.set(k, st); }
    }
    return guardarCambios(dN, eP, etiqueta);
  }
  const claves = keys => (keys || A.sel).filter(k => k[0] === 'n' || k[0] === 'p');
  const cajaDe = k => A.cajaEntidad(k);
  function cajaTotal(keys) { const b = new T.Box3(); for (const k of keys) b.union(cajaDe(k)); return b; }
  function centroPos(keys) { const c = new V3(); for (const k of keys) c.add(A.estadoEnt(k).p); return c.multiplyScalar(1 / Math.max(1, keys.length)); }

  /* ---------- mover y girar exactos ---------- */
  function mover(keys, d, local) {
    keys = claves(keys); if (!keys.length) return 0; let t = new V3(+d[0] || 0, +d[1] || 0, +d[2] || 0);
    if (local && keys.length) { const st = A.estadoEnt(keys[0]); t.applyQuaternion(new Q4().setFromAxisAngle(ARRIBA, yawQ(st.q) * DEG)); }
    t = new V3(AJ.bloqueoEjes.x ? 0 : t.x, AJ.bloqueoEjes.y ? 0 : t.y, AJ.bloqueoEjes.z ? 0 : t.z);
    const tt = [t.x, t.y, t.z];
    return transformar(keys, (tipo, nd) => trasladar(nd, tt), st => { st.p.add(t); }, 'Mover ' + A.fmt(t.length()) + ' m');
  }
  function pivoteDe(keys) {
    if (keys.length === 1 && !['caja', 'base', 'min', 'punto'].includes(pivoteModo)) return A.estadoEnt(keys[0]).p.clone();
    const b = cajaTotal(keys);
    switch (pivoteModo) {
      case 'caja': return b.getCenter(new V3());
      case 'base': { const c = b.getCenter(new V3()); c.y = b.min.y; return c; }
      case 'min': return b.min.clone();
      case 'activo': return A.estadoEnt(keys[0]).p.clone();
      case 'punto': return pivotePunto ? pivotePunto.clone() : centroPos(keys);
      default: return centroPos(keys);
    }
  }
  function girar(keys, g, centro) {
    keys = claves(keys); if (!keys.length || !g) return 0; const c = centro || pivoteDe(keys), dq = new Q4().setFromAxisAngle(ARRIBA, g * DEG);
    return transformar(keys, (tipo, nd) => girarDatos(nd, [c.x, c.z], g), st => { st.p.sub(c).applyQuaternion(dq).add(c); st.q.premultiply(dq); }, 'Girar ' + A.fmt(g, 1) + '°');
  }

  /* ---------- alinear y distribuir ---------- */
  function alinear(keys, eje, modo, ref) {
    keys = claves(keys); if (keys.length < 2) { A.pista('Selecciona al menos dos objetos para alinear.'); return 0; }
    const R = ref === 'primero' ? cajaDe(keys[0]) : cajaTotal(keys), objetivo = modo === 'min' ? R.min[eje] : modo === 'max' ? R.max[eje] : (R.min[eje] + R.max[eje]) / 2;
    const desp = new Map(); for (const k of keys) { if (ref === 'primero' && k === keys[0]) continue; const b = cajaDe(k), v = modo === 'min' ? b.min[eje] : modo === 'max' ? b.max[eje] : (b.min[eje] + b.max[eje]) / 2; desp.set(k, objetivo - v); }
    const t = k => { const v = desp.get(k) || 0; return [eje === 'x' ? v : 0, eje === 'y' ? v : 0, eje === 'z' ? v : 0]; };
    const n = transformar([...desp.keys()], (tipo, nd, o) => trasladar(nd, t('n' + o.id)), (st, k) => { const v = t(k); st.p.add(new V3(v[0], v[1], v[2])); }, 'Alinear ' + ({ min: 'mínimo', max: 'máximo', centro: 'centro' })[modo] + ' en ' + eje.toUpperCase());
    return n;
  }
  function distribuir(keys, eje, modo) {
    keys = claves(keys); if (keys.length < 3) { A.pista('Selecciona al menos tres objetos para distribuir.'); return 0; }
    const L = keys.map(k => { const b = cajaDe(k); return { k, b, c: (b.min[eje] + b.max[eje]) / 2, t: b.max[eje] - b.min[eje] }; }).sort((a, b) => a.c - b.c);
    const desp = new Map(), n = L.length;
    if (modo === 'huecos') { const ini = L[0].b.min[eje], fin = L[n - 1].b.max[eje], suma = L.reduce((s, x) => s + x.t, 0), hueco = (fin - ini - suma) / (n - 1); let pos = ini; for (const x of L) { desp.set(x.k, pos - x.b.min[eje]); pos += x.t + hueco; } }
    else { const c0 = L[0].c, c1 = L[n - 1].c; L.forEach((x, i) => desp.set(x.k, c0 + (c1 - c0) * i / (n - 1) - x.c)); }
    const t = k => { const v = desp.get(k) || 0; return [eje === 'x' ? v : 0, eje === 'y' ? v : 0, eje === 'z' ? v : 0]; };
    return transformar(keys, (tipo, nd, o) => trasladar(nd, t('n' + o.id)), (st, k) => { const v = t(k); st.p.add(new V3(v[0], v[1], v[2])); }, 'Distribuir en ' + eje.toUpperCase());
  }

  /* ---------- copias: reasignan referencias internas ---------- */
  function copias(keys, n, fn, etiqueta) {
    keys = claves(keys); if (!keys.length || n < 1) return [];
    const objs = keys.filter(k => k[0] === 'n').map(k => nv().get(k.slice(1))).filter(o => o && tb(o.tipo) !== 'nota');
    const pks = keys.filter(k => k[0] === 'p'), plP = pks.length ? A.plantillas(pks) : [];
    const ef = A.efectivos(), lista = [], nuevasK = [];
    for (let i = 1; i <= n; i++) {
      const mapa = new Map(objs.map(o => [o.id, A.nuevoId() + i + Math.random().toString(36).slice(2, 5)]));
      for (const o of objs) {
        const d = fn(o.tipo, clon(o.datos), i, o); if (!d) continue; const id = mapa.get(o.id);
        if (d.soporte && d.soporte.id) { if (mapa.has(d.soporte.id)) { d.soporte = Object.assign({}, d.soporte, { id: mapa.get(d.soporte.id) }); delete d.soporte.rel; } else if (d.soporte.tipo !== 'fundacion' || !d.soporte.manual) delete d.soporte; }
        if (typeof d.muro === 'string') { if (mapa.has(d.muro)) d.muro = mapa.get(d.muro); else if (!enLaPared(d, d.muro)) delete d.muro; }
        if (typeof d.muro === 'number') delete d.muro;
        if (d.de_habitacion) { if (mapa.has(d.de_habitacion)) d.de_habitacion = mapa.get(d.de_habitacion); else delete d.de_habitacion; }
        delete d.agujeros_auto; if (d.desde && mapa.has(d.desde)) d.desde = mapa.get(d.desde); if (d.hasta && mapa.has(d.hasta)) d.hasta = mapa.get(d.hasta);
        const prev = ef.get(o.docId) || {}, ext = { capa: prev.capa || A.capaActiva }; if (o.props) ext.props = clon(o.props);
        lista.push({ id, data: A.docNuevo(id, o.tipo, d, ext) }); nuevasK.push('n' + id);
      }
      plP.forEach((it, j) => { const d = fn(it.tipo, clon(it.datos), i, null); if (!d) return; const id = A.nuevoId() + 'p' + i + j; lista.push({ id, data: A.docNuevo(id, it.tipo, d) }); nuevasK.push('n' + id); });
    }
    if (lista.length) A.guardar(lista, { etiqueta });
    return nuevasK;
  }
  /* la copia de una puerta sigue en su pared si cae dentro del tramo */
  function enLaPared(d, mid) { const W = nv().get(mid); if (!W) return false; const w = W.datos, g = (+w.giroY || 0) * DEG, ux = Math.cos(g), uz = -Math.sin(g), dx = (+d.x || 0) - (+w.x || 0), dz = (+d.z || 0) - (+w.z || 0), a = dx * ux + dz * uz, p = Math.abs(-dx * uz + dz * ux); return p < 0.05 && Math.abs(a) + (+d.sx || 0.9) / 2 <= (+w.sx || 0) / 2 + 1e-3; }
  function duplicarDesplazado(keys, o) {
    o = o || {}; keys = claves(keys); const n = Math.max(1, Math.min(500, Math.round(+o.n || 1))), t = [+o.dx || 0, +o.dy || 0, +o.dz || 0], g = +o.giro || 0;
    const ks = copias(keys, n, (tipo, d, i) => { trasladar(d, t.map(v => v * i)); if (g) girarDatos(d, [+d.x || 0, +d.z || 0], g * i); return d; }, 'Duplicar ' + n + ' copia' + (n > 1 ? 's' : '') + ' desplazadas');
    if (ks.length && o.seleccionar !== false) A.seleccionar(keys.concat(ks)); return ks;
  }
  function matriz(keys, o) {
    o = o || {}; keys = claves(keys); const F = Math.max(1, Math.round(+o.filas || 1)), C = Math.max(1, Math.round(+o.columnas || 1)), Pz = Math.max(1, Math.round(+o.pisos || 1));
    const total = F * C * Pz; if (total < 2 || total > 2000) { A.pista('La matriz debe tener entre 2 y 2000 elementos.'); return []; }
    const yaw = o.local !== false && keys.length ? yawQ(A.estadoEnt(keys[0]).q) : 0, celdas = [];
    for (let p = 0; p < Pz; p++) for (let f = 0; f < F; f++) for (let c = 0; c < C; c++) if (p || f || c) celdas.push([c * (+o.sepX || 0), p * (+o.sepY || 0), f * (+o.sepZ || 0)]);
    const ks = copias(keys, celdas.length, (tipo, d, i) => { const [cx, cy, cz] = celdas[i - 1], [x, z] = rotXZ(cx, cz, yaw); return trasladar(d, [x, cy, z]); }, 'Matriz ' + F + ' × ' + C + (Pz > 1 ? ' × ' + Pz : ''));
    if (ks.length && o.seleccionar !== false) A.seleccionar(keys.concat(ks)); return ks;
  }
  function reflejar(keys, eje, copia) {
    keys = claves(keys); if (!keys.length) return 0; const b = cajaTotal(keys), c = (b.min[eje] + b.max[eje]) / 2;
    if (copia) { const ks = copias(keys, 1, (tipo, d) => espejoDatos(tipo, d, eje, c), 'Reflejar una copia en ' + eje.toUpperCase()); if (ks.length) A.seleccionar(keys.concat(ks)); return ks.length; }
    const Mm = new T.Matrix4().makeScale(eje === 'x' ? -1 : 1, 1, eje === 'z' ? -1 : 1), S = new T.Matrix4().makeScale(1, 1, -1);
    return transformar(keys, (tipo, d) => espejoDatos(tipo, d, eje, c), st => { st.p[eje] = 2 * c - st.p[eje]; const R = new T.Matrix4().makeRotationFromQuaternion(st.q); const R2 = Mm.clone().multiply(R).multiply(S); st.q.setFromRotationMatrix(R2); }, 'Reflejar en ' + eje.toUpperCase());
  }

  /* ---------- repetir a lo largo de una línea o una curva ---------- */
  function muestrearCamino(puntos, curva) {
    let pts = puntos.map(p => new V3(p[0], 0, p[1]));
    if (curva && pts.length >= 3) pts = new T.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(Math.max(32, pts.length * 24));
    const acum = [0]; for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, acum, L: acum[acum.length - 1] };
  }
  /* punto y rumbo (grados, convención de giroY) a la distancia s; más allá del final sigue la recta del último tramo */
  function enCamino(cm, s) {
    const { pts, acum } = cm; const n = pts.length; let i = 1; while (i < n - 1 && acum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], L = acum[i] - acum[i - 1] || 1e-9, t = (s - acum[i - 1]) / L;
    const p = a.clone().lerp(b, t); return { x: p.x, z: p.z, g: Math.atan2(-(b.z - a.z), b.x - a.x) / DEG };
  }
  function repetirEnCamino(keys, puntos, o) {
    o = o || {}; keys = claves(keys); if (!keys.length || !puntos || puntos.length < 2) return [];
    const cm = muestrearCamino(puntos, !!o.curva); if (cm.L < 1e-3) return [];
    let n = Math.round(+o.cantidad || 0), sep = +o.separacion || 0;
    if (o.modo === 'llenar') { n = Math.max(2, n); sep = cm.L / (n - 1); } else if (o.modo === 'separacion') { sep = Math.max(0.05, sep); n = Math.floor(cm.L / sep + 1e-6) + 1; } else { n = Math.max(2, n); sep = Math.max(0.01, sep); }
    if (n > 2000) { A.pista('Demasiadas repeticiones (más de 2000).'); return []; }
    const ref = centroPos(keys), p0 = enCamino(cm, 0), alinearR = o.alinear !== false, orig = o.moverOriginal !== false;
    const pose = i => { const q = enCamino(cm, i * sep); return { t: [q.x - ref.x, 0, q.z - ref.z], g: alinearR ? norm(q.g - p0.g) : 0, c: [q.x, q.z] }; };
    const conPose = (d, ps) => { trasladar(d, ps.t); if (ps.g) girarDatos(d, ps.c, ps.g); if (o.terreno && window.OOTerreno) d.y = r3(OOTerreno.alturaEn(+d.x || 0, +d.z || 0) + ((+d.y || 0) - (window.OOTerreno ? OOTerreno.alturaEn(ref.x, ref.z) : 0))); return d; };
    const ini = orig ? 1 : 0, cuantas = n - ini;
    /* el original va al inicio del camino en el mismo paso que las copias */
    const ks = copias(keys, cuantas, (tipo, d, i) => conPose(d, pose(i - 1 + ini)), 'Repetir ' + n + ' veces' + (sep ? ' cada ' + A.fmt(sep) + ' m' : ''));
    if (orig) { const ps = pose(0); if (Math.hypot(ps.t[0], ps.t[2]) > 1e-4) { const dN = new Map(); for (const k of keys) if (k[0] === 'n') { const ob = nv().get(k.slice(1)); if (ob) dN.set(ob.id, conPose(clon(ob.datos), ps)); } const eP = new Map(); for (const k of keys) if (k[0] === 'p') { const st = A.estadoEnt(k); st.p.add(new V3(ps.t[0], 0, ps.t[2])); eP.set(k, st); } guardarCambios(dN, eP, 'Llevar el original al inicio del camino'); unirConAnterior(); } }
    if (ks.length && o.seleccionar !== false) A.seleccionar(keys.concat(ks));
    return ks;
  }
  /* junta el último paso con el anterior (un solo deshacer para «repetir») */
  function unirConAnterior() { const L = A.pasosDeshacer; if (L.length < 2) return; const u = L.pop(), a = L[L.length - 1]; a.push(...u); A.actualizarBotonesHistorial(); }
  function repetirEnLinea(keys, o) {
    o = o || {}; keys = claves(keys); if (!keys.length) return []; const c = centroPos(keys), g = (+o.direccion || 0) * DEG, n = Math.max(2, Math.round(+o.cantidad || 2)), sep = +o.separacion || 1;
    const L = sep * (n - 1), fin = [c.x + Math.cos(g) * L, c.z - Math.sin(g) * L];
    return repetirEnCamino(keys, [[c.x, c.z], fin], Object.assign({}, o, { modo: 'cantidad', cantidad: n, separacion: sep, alinear: false }));
  }

  /* ---------- giro: copiar el de otro objeto y enderezar al paso del imán ---------- */
  const yawDe = k => k[0] === 'n' ? (+(nv().get(k.slice(1)) || { datos: {} }).datos.giroY || 0) : yawQ(A.estadoEnt(k).q);
  /* gira la selección (alrededor de su pivote) para que el primero tenga el mismo giro que `objetivo`; con cercano90, el equivalente más cercano cada 90° */
  function alinearCon(keys, objetivo, o) {
    o = o || {}; keys = claves(keys).filter(k => k !== objetivo); if (!keys.length || !A.existe(objetivo)) return 0;
    let d = norm(yawDe(objetivo) - yawDe(keys[0])); if (o.cercano90) { d = ((d % 90) + 90) % 90; if (d > 45) d -= 90; }
    if (Math.abs(d) < 1e-4) { A.pista('Ya tiene el mismo giro.'); return 0; }
    const n = girar(keys, d, keys.length === 1 ? A.estadoEnt(keys[0]).p : null); A.ponerEtiquetaUltima('Alinear el giro con «' + A.nombreEntidades([objetivo]) + '»'); return n;
  }
  function enderezar(keys, paso) {
    keys = claves(keys); paso = Math.max(0.1, +paso || +AJ.angulo || 15); const red = g => norm(Math.round(g / paso) * paso);
    return transformar(keys, (tipo, nd) => { nd.giroY = red(+nd.giroY || 0); return nd; }, st => { const g = yawQ(st.q), dq = new Q4().setFromAxisAngle(ARRIBA, (red(g) - g) * DEG); st.q.premultiply(dq); }, 'Enderezar el giro a ' + A.fmt(paso, 0) + '°');
  }
  let selAlinear = null;
  E.agregarHerramientaPropia('alinear-con', { n: 'Alinear con otro objeto', ic: 'girar', pista: 'Clic en el objeto cuyo giro quieres copiar (una pared, una ventana…). Esc para cancelar.',
    up: (e, mov) => { if (mov > 6) return; const h = A.pickEvento(e); const s = selAlinear; if (!h || !s) return; const k = A.expandirGrupos([h.key]).find(x => !s.includes(x)) || h.key; if (s.includes(k)) { A.pista('Elige otro objeto, no uno de la selección.'); return; } alinearCon(s, k, { cercano90: P5.cercano90 }); A.ponerHerramienta('sel'); A.seleccionar(s); } });
  function iniciarAlinearCon() { if (!A.sel.length) { A.pista('Selecciona primero lo que quieres girar.'); return false; } selAlinear = A.sel.slice(); A.ponerHerramienta('alinear-con', { forzar: true }); return true; }

  /* ---------- medidas exactas ---------- */
  function escalarPoli(d, fx, fz) { /* escala del contorno en los ejes del objeto */ if (Array.isArray(d.puntos)) d.puntos = d.puntos.map(([x, z]) => [r3(x * fx), r3(z * fz)]); if (d.sx) d.sx = r3(d.sx * fx); if (d.sz) d.sz = r3(d.sz * fz); return d; }
  /* caja de la selección: cambia su medida en un eje del mundo (escala desde la base y el centro) */
  function medida(keys, eje, valor) {
    keys = claves(keys); if (!keys.length || !(valor > 0.01)) return 0; const b = cajaTotal(keys), act = b.max[eje] - b.min[eje]; if (act < 1e-4) return 0; const f = valor / act;
    const base = new V3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2), F = new V3(eje === 'x' ? f : 1, eje === 'y' ? f : 1, eje === 'z' ? f : 1);
    const posNueva = p => keys.length === 1 && eje !== 'y' ? p.clone() : p.clone().sub(base).multiply(F).add(base);
    return transformar(keys, (tipo, nd, o) => {
      const p = posNueva(new V3(+nd.x || 0, +nd.y || 0, +nd.z || 0)); if (keys.length === 1) { p.copy(new V3(+nd.x || 0, +nd.y || 0, +nd.z || 0)); }
      nd.x = p.x; nd.y = p.y; nd.z = p.z;
      const g = (+nd.giroY || 0) * DEG, c = Math.abs(Math.cos(g)), s = Math.abs(Math.sin(g)); /* reparte el factor del eje del mundo entre los ejes del objeto */
      const fx = eje === 'x' ? 1 + (f - 1) * c : eje === 'z' ? 1 + (f - 1) * s : 1, fz = eje === 'z' ? 1 + (f - 1) * c : eje === 'x' ? 1 + (f - 1) * s : 1;
      if (POLI(o)) { escalarPoli(nd, fx, fz); if (eje === 'y' && tb(o.tipo) === 'fundacion') { nd.elevacion = r3((+nd.elevacion || 0) * f); nd.sy = nd.elevacion; } return nd; }
      if (eje === 'y') nd.sy = r3((+nd.sy || 1) * f); else { nd.sx = r3((+nd.sx || 1) * fx); nd.sz = r3((+nd.sz || 1) * fz); }
      if (tb(o.tipo) === 'fundacion' && eje === 'y') nd.elevacion = nd.sy;
      return nd;
    }, st => { st.p.copy(posNueva(st.p)); st.s.multiply(F); }, 'Medida ' + eje.toUpperCase() + ' = ' + A.fmt(valor) + ' m');
  }
  /* tamaño en los ejes del objeto (largo sx, alto sy, ancho sz) */
  function tamLocal(id, eje, valor) {
    const o = nv().get(id); if (!o || !(valor > 0.01)) return false; const nd = clon(o.datos), k = 's' + eje;
    if (POLI(o) && eje !== 'y') { const act = +nd[k] || cajaPts(nd.puntos)[eje === 'x' ? 0 : 1]; if (!(act > 0)) return false; escalarPoli(nd, eje === 'x' ? valor / act : 1, eje === 'z' ? valor / act : 1); }
    else { nd[k] = r3(valor); if (tb(o.tipo) === 'fundacion' && eje === 'y') nd.elevacion = nd.sy; }
    return guardarCambios(new Map([[id, nd]]), new Map(), 'Tamaño ' + eje.toUpperCase() + ' = ' + A.fmt(valor) + ' m') > 0;
  }
  function cajaPts(pts) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts || []) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x1 - x0, z1 - z0]; }

  /* ---------- gizmo: ejes bloqueados, espacio y pivote (ganchos en editor.js) ---------- */
  function gizmo(tc, pivote) {
    const L = AJ.bloqueoEjes; if (L.x) tc.showX = false; if (L.y) tc.showY = false; if (L.z) tc.showZ = false;
    if (AJ.espacio === 'global') tc.setSpace('world'); else if (AJ.espacio === 'local') tc.setSpace('local');
    if (AJ.imanAngulo || AJ.ajuste) tc.setRotationSnap((+AJ.angulo || 15) * DEG); else tc.setRotationSnap(null);
    const sel = A.sel; if (!sel.length) return;
    if (sel.length > 1 || pivoteMovido()) { pivote.position.copy(pivoteDe(sel)); if (sel.length === 1) pivote.quaternion.set(0, 0, 0, 1); pivote.updateMatrixWorld(); }
    if (sel.length > 1 && AJ.espacio === 'local' && tc.mode !== 'scale') { pivote.quaternion.setFromAxisAngle(ARRIBA, yawQ(A.estadoEnt(sel[0]).q) * DEG); pivote.updateMatrixWorld(); tc.setSpace('local'); } /* ejes del primer objeto elegido */
  }
  function pivoteMovido() { const s = A.sel; if (s.length !== 1 || !['caja', 'base', 'min', 'punto'].includes(pivoteModo)) return false; return pivoteDe(s).distanceTo(A.estadoEnt(s[0]).p) > 1e-4; }
  function restringir(pivote, a) { const L = AJ.bloqueoEjes; if (!a || !a.pv0) return; for (const c of ['x', 'y', 'z']) if (L[c]) pivote.position[c] = a.pv0[c]; }
  function restringirDelta(dx, dz) { return [AJ.bloqueoEjes.x ? 0 : dx, AJ.bloqueoEjes.z ? 0 : dz]; }
  function bloquear(eje, v) { AJ.bloqueoEjes[eje] = v == null ? !AJ.bloqueoEjes[eje] : !!v; A.guardarAjustes(); A.colocarPivote(); A.renderPanel(); A.pista('Eje ' + eje.toUpperCase() + (AJ.bloqueoEjes[eje] ? ' bloqueado' : ' libre') + '.'); return AJ.bloqueoEjes[eje]; }
  function ponerPivote(modo, punto) { pivoteModo = PIVOTES.some(p => p[0] === modo) ? modo : 'centro'; if (punto) pivotePunto = new V3(punto[0], punto[1] || 0, punto[2]); A.colocarPivote(); A.renderPanel(); }
  function ponerEspacio(e) { AJ.espacio = ['auto', 'local', 'global'].includes(e) ? e : 'auto'; A.guardarAjustes(); A.colocarPivote(); A.renderPanel(); }

  /* ---------- medida exacta tecleada después de mover o girar con el gizmo ---------- */
  let ultima = null, tecleo = '';
  const tc = A.tc;
  if (tc) {
    tc.addEventListener('mouseDown', () => { ultima = { keys: A.sel.slice(), ini: A.sel.map(k => A.estadoEnt(k)), modo: tc.mode }; });
    tc.addEventListener('mouseUp', () => {
      if (!ultima || !ultima.keys.length) { ultima = null; return; } const k0 = ultima.keys[0]; if (!A.existe(k0)) { ultima = null; return; }
      const fin = A.estadoEnt(k0), ini = ultima.ini[0];
      if (ultima.modo === 'translate') { const d = fin.p.clone().sub(ini.p); if (d.length() < 1e-4) { ultima = null; return; } ultima.dir = d.clone().normalize(); ultima.valor = d.length(); }
      else if (ultima.modo === 'rotate') { const g = norm(yawQ(fin.q) - yawQ(ini.q)); if (Math.abs(g) < 1e-3) { ultima = null; return; } ultima.valor = g; ultima.centro = A.pivote.position.clone(); }
      else { ultima = null; return; }
      ultima.t = Date.now(); tecleo = ''; A.pista((ultima.modo === 'translate' ? 'Movido ' + A.fmt(ultima.valor) + ' m' : 'Girado ' + A.fmt(ultima.valor, 1) + '°') + ': escribe la medida exacta y pulsa Enter para corregirla.');
    });
  }
  function corregirUltima(v) {
    if (!ultima || !isFinite(v)) return false; const keys = ultima.keys.filter(A.existe); if (!keys.length) return false;
    if (ultima.modo === 'translate') { const t = ultima.dir.clone().multiplyScalar(v - ultima.valor); const ok = mover(keys, [t.x, t.y, t.z]); A.ponerEtiquetaUltima('Mover exactamente ' + A.fmt(v) + ' m'); ultima.valor = v; return ok > 0; }
    const g = v * Math.sign(ultima.valor || 1) - ultima.valor; const ok = girar(keys, g, ultima.centro); A.ponerEtiquetaUltima('Girar exactamente ' + A.fmt(v, 1) + '°'); ultima.valor += g; return ok > 0;
  }
  window.addEventListener('keydown', e => {
    if (!ultima || Date.now() - ultima.t > 15000 || A.herramienta !== 'sel' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (/^[0-9]$/.test(e.key) || ((e.key === ',' || e.key === '.') && !tecleo.includes('.')) || (e.key === '-' && !tecleo)) { tecleo += /[.,]/.test(e.key) ? '.' : e.key; A.pista((ultima.modo === 'translate' ? 'Distancia: ' : 'Ángulo: ') + tecleo.replace('.', ',') + (ultima.modo === 'translate' ? ' m' : '°') + ' · Enter para aplicar'); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Backspace' && tecleo) { tecleo = tecleo.slice(0, -1); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Enter' && tecleo) { const v = parseFloat(tecleo); tecleo = ''; e.preventDefault(); e.stopImmediatePropagation(); corregirUltima(v); ultima.t = Date.now(); }
  }, true);

  /* ---------- herramienta «Repetir en un camino» ---------- */
  let camino = null, origenRep = null;
  function previaCamino(cursor) {
    A.limpiarPrevia(); if (!camino) return; const pts = camino.concat(cursor ? [[cursor.x, cursor.z]] : []); const y = origenRep ? centroPos(origenRep).y + 0.2 : 0.2;
    for (const p of camino) A.punto3D(new V3(p[0], y, p[1]), 0x1f6feb);
    if (pts.length < 2) return; const cm = muestrearCamino(pts, P5.reCurva); let n = P5.reN, sep = P5.reSep;
    if (P5.reModo === 'llenar') sep = cm.L / Math.max(1, n - 1); else if (P5.reModo === 'separacion') n = Math.floor(cm.L / Math.max(0.05, sep)) + 1;
    for (let i = 0; i < Math.min(n, 400); i++) { const q = enCamino(cm, i * sep); A.punto3D(new V3(q.x, y, q.z), 0xf07a1a); }
    A.etqVivas = [{ p: new V3(pts[pts.length - 1][0], y + 1, pts[pts.length - 1][1]), t: n + ' × cada ' + A.fmt(sep) + ' m · camino ' + A.fmt(cm.L) + ' m', c: 'vivo' }];
  }
  function terminarCamino() { if (camino && camino.length >= 2 && origenRep) { const ks = repetirEnCamino(origenRep, camino, { cantidad: P5.reN, separacion: P5.reSep, modo: P5.reModo, alinear: P5.reAlinear, curva: P5.reCurva, moverOriginal: P5.reOriginal, seleccionar: false }); camino = null; A.limpiarPrevia(); A.etqVivas = []; const o = origenRep; origenRep = null; A.ponerHerramienta('sel'); A.seleccionar(o.concat(ks)); return ks.length; } return 0; }
  E.agregarHerramientaPropia('repetir', {
    n: 'Repetir en un camino', ic: 'guias', pista: 'Con la selección hecha: clic en el inicio del camino, clic en cada vértice; Enter o doble clic termina. Cantidad, separación y si sigue una curva, en el panel.',
    opciones: () => { origenRep = claves(A.sel).slice(); camino = null; },
    move: e => { if (!camino) return; const inf = A.inferir(e, null); if (inf) previaCamino(inf.p); },
    up: (e, mov) => {
      if (mov > 6) return; if (!origenRep || !origenRep.length) { A.pista('Primero selecciona lo que quieres repetir.'); return; }
      const inf = A.inferir(e, null); if (!inf) return; const p = [r3(inf.p.x), r3(inf.p.z)];
      if (!camino) { camino = [p]; previaCamino(null); return; }
      const u = camino[camino.length - 1]; if (Math.hypot(p[0] - u[0], p[1] - u[1]) < 0.05 || e.detail >= 2) { terminarCamino(); return; }
      camino.push(p); previaCamino(null);
    },
    fin: () => { camino = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => `<p class="ayuda">${origenRep && origenRep.length ? 'Se repite: ' + A.esc(A.nombreEntidades(origenRep)) : 'No hay nada seleccionado.'}</p>${htmlRepetir()}<div class="fila"><button data-tf-a="camino-fin" class="prim">Terminar el camino (Enter)</button></div>`
  });
  window.addEventListener('keydown', e => { if (A.herramienta === 'repetir' && e.key === 'Enter' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); e.stopImmediatePropagation(); terminarCamino(); } }, true);
  /* elegir el pivote con un clic */
  E.agregarHerramientaPropia('pivote-punto', { n: 'Elegir el pivote', ic: 'objeto', pista: 'Clic en el punto alrededor del cual se gira y se escala.',
    up: (e, mov) => { if (mov > 6) return; const h = A.pickEvento(e); const p = h ? h.point : A.puntoPlano(e, A.planoTrabajo); if (!p) return; const s = sel0; pivotePunto = p.clone(); pivoteModo = 'punto'; A.ponerHerramienta('sel'); if (s) A.seleccionar(s); A.pista('Pivote en ' + A.fmt(p.x) + ', ' + A.fmt(p.y) + ', ' + A.fmt(p.z) + '.'); } });
  let sel0 = null;
  function iniciarRepetir() { if (!A.sel.length) { A.pista('Primero selecciona lo que quieres repetir.'); return false; } origenRep = claves(A.sel).slice(); camino = null; A.ponerHerramienta('repetir', { forzar: true }); return true; }

  /* ---------- inspector: sección «Transformar» y «Medidas» ---------- */
  const num = (k, l, v, st) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.05}" data-tf="${k}" value="${r3(+v || 0)}"></label>`;
  const opc = (k, l, v, lista) => `<label class="campo"><span>${l}</span><select data-tf="${k}">${lista.map(([x, n]) => `<option value="${A.esc(x)}"${String(v) === String(x) ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label>`;
  const chk = (k, l, v) => `<label class="chk"><input type="checkbox" data-tf="${k}"${v ? ' checked' : ''}> ${A.esc(l)}</label>`;
  const bot = (a, t, extra) => `<button data-tf-a="${a}"${extra || ''}>${t}</button>`;
  function htmlRepetir() {
    return `<div class="campos">${num('reN', 'Cantidad', P5.reN, 1)}${num('reSep', 'Separación (m)', P5.reSep)}${opc('reModo', 'Modo', P5.reModo, [['cantidad', 'Cantidad y separación'], ['llenar', 'Cantidad repartida en el camino'], ['separacion', 'Separación hasta llenar el camino']])}
      ${chk('reAlinear', 'Girar con el camino', P5.reAlinear)}${chk('reCurva', 'Curva suave por los vértices', P5.reCurva)}${chk('reOriginal', 'El original es el primero (va al inicio)', P5.reOriginal)}</div>`;
  }
  function html(keys) {
    const L = AJ.bloqueoEjes, uno = keys.length === 1;
    const o = uno && keys[0][0] === 'n' ? nv().get(keys[0].slice(1)) : null, b = cajaTotal(keys), tam = b.getSize(new V3());
    const sx = o ? (POLI(o) && !o.datos.sx ? cajaPts(o.datos.puntos)[0] : +o.datos.sx || 0) : 0, sz = o ? (POLI(o) && !o.datos.sz ? cajaPts(o.datos.puntos)[1] : +o.datos.sz || 0) : 0;
    return `<details class="sec" data-sec="medidas"${abiertos.has('medidas') ? ' open' : ''}><summary>Medidas</summary><div class="campos">
        <p class="ayuda" style="margin:0 0 4px">Caja de la selección (ejes del mapa). Cambiar un valor la escala a esa medida.</p>
        ${['x', 'y', 'z'].map(e => `<label class="campo"><span>${{ x: 'Ancho X', y: 'Alto Y', z: 'Fondo Z' }[e]} (m)</span><input type="number" step="0.01" data-tfm="${e}" value="${r3(tam[e])}"></label>`).join('')}
        ${o && !['nota', 'luz'].includes(tb(o.tipo)) ? `<p class="ayuda" style="margin:6px 0 4px">En los ejes del objeto:</p>${[['x', 'Largo', sx], ['y', 'Alto', tb(o.tipo) === 'fundacion' ? +o.datos.elevacion || 0 : +o.datos.sy || 0], ['z', 'Ancho', sz]].map(([e, n, v]) => `<label class="campo"><span>${n} (m)</span><input type="number" step="0.01" data-tfl="${e}" value="${r3(v)}"></label>`).join('')}` : ''}
        ${o && POLI(o) && window.OOGeometria ? `<p class="ayuda" style="margin:4px 0 0">Área: <b>${A.fmt(OOGeometria.area(o), 2)} m²</b> · perímetro ${A.fmt(OOGeometria.perimetro(o), 2)} m</p>` : ''}
      </div></details>
      <details class="sec" data-sec="transformar"${abiertos.has('transformar') ? ' open' : ''}><summary>Transformar</summary><div class="campos">
        <h3>Mover exacto</h3>${num('dx', 'ΔX', P5.dx)}${num('dy', 'ΔY', P5.dy)}${num('dz', 'ΔZ', P5.dz)}${chk('local', 'En los ejes del objeto', P5.local)}<div class="fila">${bot('mover', 'Mover', ' class="prim"')}</div>
        <h3>Girar exacto</h3>${num('giro', 'Grados (Y)', P5.giro, 1)}<div class="fila">${bot('girar', 'Girar')}${bot('girar-neg', 'Girar al revés')}</div>
        <div class="fila">${bot('alinear-con', 'Alinear con… (copiar el giro de otro objeto)')}</div>${chk('cercano90', 'El giro equivalente más cercano (cada 90°)', P5.cercano90)}
        <label class="chk"><input type="checkbox" data-tfi="imanAngulo"${AJ.imanAngulo ? ' checked' : ''}> Imán de ángulo</label><label class="campo"><span>Paso del imán (°)</span><input type="number" min="1" step="1" data-tfi="angulo" value="${+AJ.angulo || 15}"></label><div class="fila">${bot('enderezar', 'Enderezar al paso del imán')}</div>
        <h3>Pivote y ejes</h3>${opc('pivote', 'Pivote', pivoteModo, PIVOTES)}<div class="fila">${bot('pivote-clic', 'Elegir el punto con un clic')}</div>
        <div class="fila">${['x', 'y', 'z'].map(e => `<label class="chk"><input type="checkbox" data-tfb="${e}"${L[e] ? ' checked' : ''}> Bloquear ${e.toUpperCase()}</label>`).join('')}</div>
        ${opc('espacio', 'Coordenadas del gizmo', AJ.espacio, [['auto', 'Automático'], ['local', 'Locales (ejes del objeto)'], ['global', 'Globales (ejes del mapa)']])}
        ${keys.length >= 2 ? `<h3>Alinear</h3>${opc('alEje', 'Eje', P5.alEje, [['x', 'X'], ['y', 'Y (altura)'], ['z', 'Z']])}${opc('alRef', 'Respecto a', P5.alRef, [['seleccion', 'La selección'], ['primero', 'El primero elegido']])}<div class="fila">${bot('al-min', 'Mínimo')}${bot('al-centro', 'Centro')}${bot('al-max', 'Máximo')}</div>` : ''}
        ${keys.length >= 3 ? `<h3>Distribuir</h3>${opc('diEje', 'Eje', P5.diEje, [['x', 'X'], ['y', 'Y'], ['z', 'Z']])}${opc('diModo', 'Modo', P5.diModo, [['centros', 'Centros a igual distancia'], ['huecos', 'Huecos iguales']])}<div class="fila">${bot('distribuir', 'Distribuir')}</div>` : ''}
        <h3>Reflejar</h3>${chk('copia', 'Reflejar una copia', P5.copia)}<div class="fila">${bot('ref-x', 'Reflejar en X')}${bot('ref-z', 'Reflejar en Z')}</div>
        <h3>Duplicar con desplazamiento</h3>${num('duN', 'Copias', P5.duN, 1)}${num('duX', 'ΔX', P5.duX)}${num('duY', 'ΔY', P5.duY)}${num('duZ', 'ΔZ', P5.duZ)}${num('duG', 'Giro (°)', P5.duG, 1)}<div class="fila">${bot('duplicar', 'Duplicar')}</div>
        <h3>Matriz</h3>${num('maF', 'Filas', P5.maF, 1)}${num('maC', 'Columnas', P5.maC, 1)}${num('maP', 'Pisos', P5.maP, 1)}${num('maSX', 'Sep. columnas (m)', P5.maSX)}${num('maSZ', 'Sep. filas (m)', P5.maSZ)}${num('maSY', 'Sep. pisos (m)', P5.maSY)}${chk('maLocal', 'En los ejes del objeto', P5.maLocal)}<div class="fila">${bot('matriz', 'Crear la matriz')}</div>
        <h3>Repetir</h3>${htmlRepetir()}${num('reDir', 'Dirección en línea recta (°)', P5.reDir, 15)}<div class="fila">${bot('rep-linea', 'Repetir en línea recta')}${bot('rep-camino', 'Dibujar el camino…')}</div>
      </div></details>`;
  }
  /* las secciones recuerdan si estaban abiertas al rehacer el panel */
  const abiertos = new Set(['medidas']);
  document.addEventListener('toggle', e => { const d = e.target; if (!d || !d.matches || !d.matches('#objCuerpo details[data-sec]')) return; if (d.open) abiertos.add(d.dataset.sec); else abiertos.delete(d.dataset.sec); }, true);
  E.on('panel', () => {
    if (A.herramienta !== 'sel') return; const keys = claves(A.sel); if (!keys.length) return; const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return;
    const div = document.createElement('div'); div.innerHTML = html(keys); const ref = c.querySelector('[data-sec="transform"]');
    const nodos = [...div.children]; let tras = ref; for (const n of nodos) { if (tras && tras.parentNode === c) { c.insertBefore(n, tras.nextSibling); tras = n; } else c.appendChild(n); }
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.tf) { const k = el.dataset.tf; const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return;
      if (k === 'pivote') { ponerPivote(v); return; } if (k === 'espacio') { ponerEspacio(v); return; } P5[k] = v; if (A.herramienta === 'repetir') previaCamino(null); return; }
    if (el.dataset.tfb) { bloquear(el.dataset.tfb, el.checked); return; }
    if (el.dataset.tfi) { if (el.dataset.tfi === 'imanAngulo') AJ.imanAngulo = el.checked; else { const v = parseFloat(el.value); if (v > 0) AJ.angulo = v; } A.guardarAjustes(); A.colocarPivote(); return; }
    if (el.dataset.tfm) { const v = parseFloat(el.value); if (isFinite(v)) medida(A.sel, el.dataset.tfm, v); return; }
    if (el.dataset.tfl) { const v = parseFloat(el.value); if (isFinite(v) && A.sel.length === 1) tamLocal(A.sel[0].slice(1), el.dataset.tfl, v); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-tf-a]'); if (!b) return; const a = b.dataset.tfA, keys = claves(A.sel);
    if (a === 'camino-fin') { terminarCamino(); return; }
    if (!keys.length) return;
    switch (a) {
      case 'mover': mover(keys, [P5.dx, P5.dy, P5.dz], P5.local); break;
      case 'girar': girar(keys, P5.giro); break; case 'alinear-con': iniciarAlinearCon(); break; case 'enderezar': enderezar(keys); break; case 'girar-neg': girar(keys, -P5.giro); break;
      case 'pivote-clic': sel0 = keys.slice(); A.ponerHerramienta('pivote-punto'); break;
      case 'al-min': alinear(keys, P5.alEje, 'min', P5.alRef); break; case 'al-centro': alinear(keys, P5.alEje, 'centro', P5.alRef); break; case 'al-max': alinear(keys, P5.alEje, 'max', P5.alRef); break;
      case 'distribuir': distribuir(keys, P5.diEje, P5.diModo); break;
      case 'ref-x': reflejar(keys, 'x', P5.copia); break; case 'ref-z': reflejar(keys, 'z', P5.copia); break;
      case 'duplicar': duplicarDesplazado(keys, { n: P5.duN, dx: P5.duX, dy: P5.duY, dz: P5.duZ, giro: P5.duG }); break;
      case 'matriz': matriz(keys, { filas: P5.maF, columnas: P5.maC, pisos: P5.maP, sepX: P5.maSX, sepZ: P5.maSZ, sepY: P5.maSY, local: P5.maLocal }); break;
      case 'rep-linea': repetirEnLinea(keys, { cantidad: P5.reN, separacion: P5.reSep, direccion: P5.reDir, moverOriginal: P5.reOriginal }); break;
      case 'rep-camino': origenRep = keys.slice(); camino = null; A.ponerHerramienta('repetir', { forzar: true }); break;
    }
  });
  /* menú Modelar */
  const item = (n, fn, ic) => E.agregarHerramienta('modelar', { n, ic: ic || 'modelar', fn });
  item('Repetir a lo largo de un camino', () => { if (!A.sel.length) { A.pista('Primero selecciona lo que quieres repetir.'); return; } origenRep = claves(A.sel); A.ponerHerramienta('repetir', { forzar: true }); }, 'guias');
  item('Alinear con otro objeto (copiar su giro)', () => iniciarAlinearCon(), 'girar'); item('Enderezar el giro', () => enderezar(A.sel));
  item('Reflejar en X', () => reflejar(A.sel, 'x', false)); item('Reflejar en Z', () => reflejar(A.sel, 'z', false));
  item('Transformar con valores exactos…', () => { abiertos.add('transformar'); A.mostrarTab('obj', true); const d = document.querySelector('[data-sec="transformar"]'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); } });

  window.OOTransformar = { mover, girar, alinear, distribuir, reflejar, duplicarDesplazado, matriz, repetirEnCamino, repetirEnLinea, medida, tamLocal, bloquear, ponerPivote, ponerEspacio, corregirUltima, terminarCamino, iniciarRepetir, alinearCon, enderezar, iniciarAlinearCon, yawDe,
    gizmo, pivoteMovido, restringir, restringirDelta, pivoteDe, muestrearCamino, enCamino, espejoDatos, params: P5, get pivote() { return { modo: pivoteModo, punto: pivotePunto && pivotePunto.toArray() }; }, get ultima() { return ultima; } };
})();
