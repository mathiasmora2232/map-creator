/* Editor del mapa (2.1, editor v2): exportar e importar para otros motores y para el juego.
   Exportar (menú naranja «Exportar»):
   - glTF binario (.glb) de todo el mapa, una zona o la selección (GLTFExporter de three r147). Jerarquía de nodos con nombre:
     <Mapa> / <Sección> / <Objeto> / piezas, «Objetos nuevos» / <capa> / <objeto> y «Luces». Las piezas reales del juego salen con su
     malla; el resto con cajas, cilindros y esferas. Comportamientos y propiedades van en `extras` de cada nodo de objeto.
     Las piezas que solo son colisión llevan el sufijo «-colonly» (Godot las convierte en colisión al importar).
   - Godot 4.4: el .glb y una escena .tscn que lo instancia, con nodos de colisión básicos (StaticBody3D + caja/cilindro) y marcadores
     con los comportamientos en metadatos. Se ponen los dos archivos en la misma carpeta del proyecto y se abre el .tscn.
   - Unity: el .glb, el JSON de escena y un LEEME con los pasos (glTFast o UnityGLTF).
   - JSON de escena del juego («oo-escena», ver LEEME.md) y JSON «para el juego» («oo-cambios-juego»): los cambios del usuario
     listos para aplicarse a los generadores (scripts/mapa_complejo.gd, mapa_parqueadero.gd) o al constructor de Unity.
   Importar: JSON de escena o zona, GLB/GLTF de una escena (cada nodo pasa a ser un objeto editable) y catálogos de prefabs. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc, $ = s => document.querySelector(s);
  const MZ = new T.Matrix4().makeScale(1, 1, -1);
  const GEO = { b: new T.BoxGeometry(1, 1, 1), c: new T.CylinderGeometry(0.5, 0.5, 1, 16), s: new T.SphereGeometry(0.5, 16, 12) };
  const r4 = v => Math.round(v * 1e4) / 1e4;
  function descargar(datos, nombre, tipo) {
    const blob = datos instanceof Blob ? datos : new Blob([datos], { type: tipo || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  const limpio = s => String(s || 'objeto').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'objeto';
  /* nombre del mapa para la raíz de la escena (antes salía siempre «Complejo»): el del mapa propio, el del proyecto o el de la plantilla */
  function nombreMapa() {
    const m = /^u-/.test(A.mapa) && A.efectivos ? A.efectivos('mapas').get(A.mapa) : null;
    if (m && m.nombre) return String(m.nombre);
    if (window.OONube && OONube.nombre) return String(OONube.nombre);
    return A.mapa === 'parqueadero' ? 'Parqueadero' : A.mapa === 'complejo' ? 'Complejo' : String(A.mapa || 'Mapa');
  }
  /* Nombre de los archivos exportados: <proyecto>[_<zona>]_<AAAA-MM-DD>_<HHMM> (hora local). El proyecto se recorta a 32 caracteres
     y la zona a 20, así el nombre nunca crece tanto como para que se corte la fecha y la hora, y dos exportaciones no chocan. */
  const MAX_PROYECTO = 32, MAX_ZONA = 20;
  const dos = n => String(n).padStart(2, '0');
  const sello = (d = new Date()) => d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + '_' + dos(d.getHours()) + dos(d.getMinutes());
  const corta = (t, n) => limpio(t).toLowerCase().slice(0, n).replace(/[_-]+$/, '') || 'mapa';
  const nombreArchivo = base => corta(nombreMapa(), MAX_PROYECTO) + (base ? '_' + corta(base, MAX_ZONA) : '') + '_' + sello();

  /* ---------- ZIP sin compresión (los .glb ya van comprimidos por dentro): un solo archivo con todo lo de Unity o Godot ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function zip(archivos) { /* [{ nombre, datos: string | ArrayBuffer | Uint8Array | Blob }] → Blob */
    const enc = new TextEncoder(), ahora = new Date(), partes = [], central = []; let off = 0;
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1), dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    for (const a of archivos) {
      const datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos instanceof Blob ? new Uint8Array(await a.datos.arrayBuffer()) : new Uint8Array(a.datos.buffer || a.datos, a.datos.byteOffset || 0, a.datos.byteLength);
      const nom = enc.encode(a.nombre), crc = crc32(datos), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, hora, true); h.setUint16(12, dia, true);
      h.setUint32(14, crc, true); h.setUint32(18, datos.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, nom.length, true); h.setUint16(28, 0, true);
      partes.push(h.buffer, nom, datos);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, hora, true); c.setUint16(14, dia, true);
      c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, nom.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, nom); off += 30 + nom.length + datos.length;
    }
    const tamC = central.reduce((s, b) => s + (b.byteLength || b.length), 0), fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tamC, true); fin.setUint32(16, off, true);
    return new Blob([...partes, ...central, fin.buffer], { type: 'application/zip' });
  }
  /* ---------- qué se exporta ---------- */
  function todasLasClaves() { const ks = []; for (let i = 0; i < A.N; i++) if (!A.P[i].del) ks.push('p' + i); for (const o of E.nuevos().values()) if (A.tipoBase(o.tipo) !== 'nota') ks.push('n' + o.id); return ks; }
  /* agrupa: objetos automáticos o grupos del usuario como un objeto; el resto pieza a pieza */
  function entidades(keys) {
    const vistos = new Set(), out = [];
    for (const k of keys) {
      if (vistos.has(k)) continue;
      if (k[0] === 'n') { vistos.add(k); out.push({ tipo: 'nuevo', keys: [k] }); continue; }
      const gid = A.grupoDe(k); const a = A.autoActivo(k);
      let ks = [k];
      if (gid) { const g = A.efectivos('grupos').get(gid); if (g) ks = g.miembros.filter(x => x[0] === 'p' && keys.includes(x)); }
      else if (a) ks = a.keys.filter(x => !A.P[+x.slice(1)].del);
      ks.forEach(x => vistos.add(x)); out.push({ tipo: ks.length > 1 ? 'objeto' : 'pieza', keys: ks });
    }
    return out;
  }
  function seccionDe(k) { if (k[0] !== 'p') return null; const z = A.P[+k.slice(1)]; return A.D.secciones[z.sec] || 'Sin sección'; }
  function propsDeEnt(ent) { const p = A.leerProps(A.objetivoProps(ent.keys)); return p && Object.keys(p).length ? p : null; }
  /* ---------- escena three para el GLB ---------- */
  function exportarEscena(keys, opts) {
    opts = opts || {};
    const mats = new Map(), geosReales = new Map();
    const mat = (hex, transp, emis) => { const k = hex + (transp ? 't' : '') + (emis || ''); let m = mats.get(k); if (!m) { m = new T.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, transparent: !!transp, opacity: transp ? 0.4 : 1 }); if (emis) m.emissive = new T.Color(emis); m.name = 'oo_' + hex.replace('#', '') + (transp ? '_vidrio' : ''); mats.set(k, m); } return m; };
    const matPropio = window.OOMateriales ? (k, color) => OOMateriales.materialExport(k, color) : () => null;
    const geoReal = g => { let r = geosReales.get(g); if (!r) { r = g.clone(); r.scale(1, 1, -1); const ix = r.index; if (ix) { const a = ix.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } } r.computeVertexNormals(); geosReales.set(g, r); } return r; };
    const raiz = new T.Group(); raiz.name = limpio(nombreMapa()); raiz.userData = { oo_mapa: A.mapa, oo_formato: 'oo-glb-1', oo_coordenadas: 'X este, Y arriba, Z sur (como el juego en Godot)' };
    const secciones = new Map(), capas = new Map();
    const nodoSec = n => { let g = secciones.get(n); if (!g) { g = new T.Group(); g.name = limpio(n); raiz.add(g); secciones.set(n, g); } return g; };
    let nuevosG = null; const nodoCapa = n => { if (!nuevosG) { nuevosG = new T.Group(); nuevosG.name = 'Objetos_nuevos'; raiz.add(nuevosG); } let g = capas.get(n); if (!g) { g = new T.Group(); g.name = limpio(n); nuevosG.add(g); capas.set(n, g); } return g; };
    let lucesG = null; const nodoLuces = () => { if (!lucesG) { lucesG = new T.Group(); lucesG.name = 'Luces'; raiz.add(lucesG); } return lucesG; };
    const malla = (geo, m, mat4, nombre) => { const me = new T.Mesh(geo, m); me.matrixAutoUpdate = false; me.matrix.copy(mat4); me.name = nombre; return me; };
    const tmp = new T.Matrix4(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
    let nPiezas = 0;
    function piezaOriginal(i, padre, propias) {
      const z = A.P[i], k = 'p' + i; if (z.cat === 'txt') return;
      if (z.cat === 'luz') { const l = new T.PointLight(z.c.getHex(), 1, Math.max(1, +z.raw[0] || 8)); l.position.copy(z.p); l.name = 'Luz_' + i; l.userData = { oo_ref: i }; nodoLuces().add(l); return; }
      const nombre = (z.nom && !/^(caja|malla|cilindro|esfera)$/.test(z.nom) ? limpio(z.nom) : 'pieza') + '_' + i + (z.cat === 'col' ? '-colonly' : '');
      const mp = matPropio(k, '#' + z.c.getHexString()) || mat('#' + z.c.getHexString(), z.mesh === 'boxT' || z.mesh === 'cylT' || z.cat === 'vidrio');
      if (z.real && z.real.lote && z.real.lote.geo) {
        const r = z.real; let W;
        if (z.p.equals(z.b.p) && z.q.equals(z.b.q) && z.s.equals(z.b.s)) W = r.w0.clone(); else W = new T.Matrix4().compose(z.p, z.q, z.s).multiply(new T.Matrix4().compose(z.b.p, z.b.q, z.b.s).invert()).multiply(r.w0);
        padre.add(malla(geoReal(r.lote.geo), mp, W.multiply(MZ), nombre)); nPiezas++; return;
      }
      const g = /^cyl/.test(z.mesh) ? GEO.c : z.mesh === 'sph' ? GEO.s : GEO.b;
      const ms = A.matricesEntidad(k);
      ms.forEach((m4, j) => { if (!sano(m4)) return; padre.add(malla(g, mp, m4, nombre + (ms.length > 1 ? '_' + j : ''))); nPiezas++; });
      if (propias) padre.children[padre.children.length - 1].userData = propias;
    }
    function objetoNuevo(o, padre) {
      const k = 'n' + o.id;
      const g = new T.Group(); g.name = limpio(A.nombreEntidades([k])) + '_' + o.id.slice(-5);
      const d = o.datos; g.userData = Object.assign({ oo_obj: true, oo_key: k, oo_tipo: o.tipo, oo_doc: { tipo: o.tipo, datos: A.clon(d) } }, propsDeEnt({ keys: [k] }) || {});
      for (const pt of o.partes || []) {
        if (!pt.m) continue;
        if (pt.f === 't' || pt.ayuda) continue; /* (2.1) marcas del editor (borde de un hueco propio): no son geometría */
        if (pt.f === 'l') { const l = new T.PointLight(new T.Color(pt.c || '#ffe8b0').getHex(), +d.intensidad || 1, +d.alcance || 10); pt.m.decompose(_p, _q, _s); l.position.copy(_p); l.name = 'Luz_' + o.id.slice(-5); g.add(l); continue; }
        if (pt.f === 'poly') { if (!pt.pts || pt.pts.length < 3) continue; const sh = new T.Shape(pt.pts.map(([x, zz]) => new T.Vector2(x, -zz))); if (Array.isArray(pt.agujeros)) for (const ag of pt.agujeros) if (Array.isArray(ag) && ag.length >= 3) sh.holes.push(new T.Path(ag.map(([x, zz]) => new T.Vector2(x, -zz)))); /* (2.1 pro) agujeros del piso */ const geo = new T.ExtrudeGeometry(sh, { depth: pt.grosor || 0.03, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, pt.y || 0, 0); g.add(malla(geo, matPropio(k, pt.c) || mat(pt.c || '#cccccc'), pt.m, 'suelo')); nPiezas++; continue; }
        if (pt.oculta && pt.modelo && window.OOModelos && OOModelos.modelos[pt.modelo]) { const M = OOModelos.modelos[pt.modelo]; const sub = new T.Group(); sub.matrixAutoUpdate = false; sub.matrix.multiplyMatrices(pt.m, M.N); sub.name = pt.modelo; for (const q of M.piezas) { sub.add(malla(q.geo, mat(q.tinte ? (pt.c || q.color) : q.color, q.vidrio), q.m, pt.modelo + '_pieza')); nPiezas++; } g.add(sub); continue; }
        if (pt.oculta && pt.asset && window.OOImportados) { const m = OOImportados.modelos.get(pt.asset); const f = m && m.estado === 'listo' ? (pt.nodo ? OOImportados.parteNodo(m, pt.nodo) : m) : null; if (f) { const sub = f.escena.clone(true); const w = new T.Group(); w.matrixAutoUpdate = false; w.matrix.multiplyMatrices(pt.m, f.N); w.name = 'modelo'; w.add(sub); g.add(w); nPiezas++; continue; } }
        const geo = pt.f === 'c' ? GEO.c : pt.f === 's' ? GEO.s : GEO.b;
        g.add(malla(geo, matPropio(k, pt.c) || mat(pt.c || '#cccccc', pt.t), pt.m, 'pieza')); nPiezas++;
      }
      padre.add(g);
    }
    for (const ent of entidades(keys)) {
      if (ent.tipo === 'nuevo') { const o = E.nuevos().get(ent.keys[0].slice(1)); if (o) objetoNuevo(o, nodoCapa(A.capaDeNuevo(o))); continue; }
      const sec = nodoSec(seccionDe(ent.keys[0])); const props = propsDeEnt(ent);
      if (ent.tipo === 'objeto') {
        const g = new T.Group(); g.name = limpio((props && props.nombre) || A.nombreEntidades(ent.keys)) + '_' + ent.keys[0].slice(1);
        g.userData = Object.assign({ oo_obj: true, oo_refs: ent.keys.map(x => +x.slice(1)) }, props || {});
        ent.keys.forEach(x => piezaOriginal(+x.slice(1), g)); if (g.children.length) sec.add(g);
      } else { const i = +ent.keys[0].slice(1); piezaOriginal(i, sec, Object.assign({ oo_obj: true, oo_refs: [i] }, props || {})); }
    }
    if (opts.zona) raiz.userData.oo_zona = { nombre: opts.zona.nombre, puntos: opts.zona.puntos };
    return { raiz, nPiezas };
  }
  async function glbDe(keys, opts) {
    let ex; try { ex = await OOCargar.exportador(); } catch (e) { A.pista('No se pudo cargar el exportador glTF (¿sin internet?).'); return null; }
    const { raiz, nPiezas } = exportarEscena(keys, opts);
    if (opts && opts.todo && window.OOTerreno) { const t = OOTerreno.mallaExport(); if (t) raiz.add(t); }
    A.pista('Exportando ' + A.fmtInt(nPiezas) + ' piezas a glTF…'); await new Promise(r => setTimeout(r, 30));
    raiz.updateMatrixWorld(true);
    const buf = await new Promise((ok, mal) => { try { ex.parse(raiz, ok, mal, { binary: true, onlyVisible: false, maxTextureSize: 2048 }); } catch (e) { mal(e); } });
    return { buf, raiz, nPiezas };
  }
  async function exportarGLB(keys, nombre, zona) {
    const todo = !(keys && keys.length); keys = todo ? todasLasClaves() : keys; const r = await glbDe(keys, { zona, todo }); if (!r) return null;
    const fn = nombreArchivo(nombre) + '.glb'; descargar(new Blob([r.buf], { type: 'model/gltf-binary' }), fn);
    A.pista('Exportado ' + fn + ' (' + A.fmtInt(r.nPiezas) + ' piezas, ' + A.fmt(r.buf.byteLength / 1048576, 1) + ' MB). Unity, Godot y Unreal lo importan.'); return r;
  }
  /* ---------- JSON de escena («oo-escena», versión 1) ---------- */
  function escenaJSON(keys, opts) {
    opts = opts || {}; if (!(keys && keys.length)) { keys = todasLasClaves(); opts.todo = true; }
    const objetos = [], luces = [];
    const forma = m => /^cyl/.test(m) ? 'cilindro' : m === 'sph' ? 'esfera' : 'caja';
    const _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
    for (const ent of entidades(keys)) {
      if (ent.tipo === 'nuevo') {
        const o = E.nuevos().get(ent.keys[0].slice(1)); if (!o) continue; const d = o.datos;
        const q = new T.Quaternion().setFromEuler(new T.Euler((+d.incX || 0) * A.DEG, (+d.giroY || 0) * A.DEG, (+d.incZ || 0) * A.DEG, 'YXZ'));
        const pr = o.props || {};
        objetos.push({ id: 'n' + o.id, nombre: A.nombreEntidades(['n' + o.id]), origen: 'nuevo', tipo: o.tipo, capa: A.capaDeNuevo(o), posicion: [r4(+d.x || 0), r4(+d.y || 0), r4(+d.z || 0)], rotacion: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)], tamano: [r4(+d.sx || 0), r4(+d.sy || 0), r4(+d.sz || 0)], props: pr, comportamientos: pr.comportamientos || [], doc: { tipo: o.tipo, datos: A.clon(d), texto: o.texto || '', fotos: o.fotos || [] } });
        continue;
      }
      const box = A.cajaEntidades(ent.keys); if (box.isEmpty()) continue; const c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3());
      const props = propsDeEnt(ent) || {};
      const piezas = [];
      for (const k of ent.keys) {
        const i = +k.slice(1), z = A.P[i];
        if (z.cat === 'luz') { luces.push({ ref: i, tipo: 'puntual', posicion: [r4(z.p.x), r4(z.p.y), r4(z.p.z)], color: '#' + z.c.getHexString(), alcance: +z.raw[0] || 8 }); continue; }
        if (z.cat === 'txt') { piezas.push({ ref: i, forma: 'texto', texto: z.nom, pos: [r4(z.p.x - c.x), r4(z.p.y - c.y), r4(z.p.z - c.z)], quat: z.q.toArray().map(r4) }); continue; }
        for (const m4 of A.matricesEntidad(k)) { m4.decompose(_p, _q, _s); piezas.push({ ref: i, forma: z.real ? 'malla' : forma(z.mesh), malla: z.real && A.D.archivos ? (A.D.archivos[A.D.piezas[i][16]] || null) : null, pos: [r4(_p.x - c.x), r4(_p.y - c.y), r4(_p.z - c.z)], quat: [_q.x, _q.y, _q.z, _q.w].map(r4), escala: [r4(_s.x), r4(_s.y), r4(_s.z)], color: '#' + z.c.getHexString(), transparente: z.mesh === 'boxT' || z.mesh === 'cylT', colision: !!(z.fl & 1), solo_colision: z.cat === 'col' }); }
      }
      if (!piezas.length) continue;
      objetos.push({ id: ent.keys.length > 1 ? 'a' + ent.keys[0].slice(1) : ent.keys[0], nombre: props.nombre || A.nombreEntidades(ent.keys), origen: 'mapa', tipo: ent.tipo, seccion: seccionDe(ent.keys[0]), refs: ent.keys.map(x => +x.slice(1)), posicion: [r4(c.x), r4(c.y), r4(c.z)], rotacion: [0, 0, 0, 1], tamano: [r4(sz.x), r4(sz.y), r4(sz.z)], props, comportamientos: props.comportamientos || [], piezas });
    }
    return { formato: 'oo-escena', version: 1, mapa: A.mapa, generado: A.ahora(), unidades: 'metros', coordenadas: 'X este, Y arriba, Z sur (Godot). En Unity: x = X, y = Y, z = -Z (y el cuaternión con x e y cambiados de signo).', zona: opts.zona ? { nombre: opts.zona.nombre, puntos: opts.zona.puntos } : null, materiales: window.OOMateriales ? OOMateriales.listaExport() : [], terreno: opts.todo && window.OOTerreno ? OOTerreno.terrenoJSON() : null, objetos, luces };
  }
  function exportarJSON(keys, nombre, zona) { const j = escenaJSON(keys, { zona }); const fn = nombreArchivo(nombre) + '_escena.json'; descargar(JSON.stringify(j, null, 1), fn, 'application/json'); A.pista('Exportado ' + fn + ': ' + j.objetos.length + ' objetos.'); return j; }
  /* ---------- Godot 4.4: .tscn que instancia el .glb ---------- */
  const sano = m4 => { const e = m4.elements; if (e.some(v => !isFinite(v))) return false; return Math.abs(m4.determinant()) > 1e-9; };
  const fx = v => { v = Math.abs(v) < 1e-7 ? 0 : v; return String(Math.round(v * 1e5) / 1e5); };
  function transformGodot(m4) { const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(); m4.decompose(p, q, s); const e = new T.Matrix4().makeRotationFromQuaternion(q).elements; return { t: `Transform3D(${[e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10], p.x, p.y, p.z].map(fx).join(', ')})`, s }; }
  const cadenaGd = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  function tscnDe(keys, glbNombre, nombreRaiz) {
    const sub = [], nodos = [], marcas = []; let nCol = 0; const MAX = 6000;
    nodos.push(`[node name=${cadenaGd(limpio(nombreRaiz))} type="Node3D"]\nmetadata/oo_mapa = ${cadenaGd(A.mapa)}\nmetadata/oo_generado = ${cadenaGd(A.ahora())}\n`);
    nodos.push(`[node name="Modelo" parent="." instance=ExtResource("1_glb")]\n`);
    nodos.push(`[node name="Colisiones" type="Node3D" parent="."]\n`);
    const forma = (tipo, s) => { const id = 'Forma_' + (sub.length + 1); sub.push(tipo === 'c' ? `[sub_resource type="CylinderShape3D" id="${id}"]\nheight = ${fx(s.y)}\nradius = ${fx(Math.max(s.x, s.z) / 2)}\n` : `[sub_resource type="BoxShape3D" id="${id}"]\nsize = Vector3(${fx(s.x)}, ${fx(s.y)}, ${fx(s.z)})\n`); return id; };
    const cuerpo = (nombre, m4, tipo, meta) => { if (nCol >= MAX || !sano(m4)) return; const g = transformGodot(m4); const id = forma(tipo, g.s); nCol++; const nn = limpio(nombre) + '_' + nCol; nodos.push(`[node name=${cadenaGd(nn)} type="StaticBody3D" parent="Colisiones"]\ntransform = ${g.t}\n${meta || ''}`); nodos.push(`[node name="Forma" type="CollisionShape3D" parent=${cadenaGd('Colisiones/' + nn)}]\nshape = SubResource("${id}")\n`); };
    for (const ent of entidades(keys)) {
      const props = propsDeEnt(ent) || {};
      const conCol = props.colision;
      if (ent.tipo === 'nuevo') {
        const o = E.nuevos().get(ent.keys[0].slice(1)); if (!o) continue; const b = A.tipoBase(o.tipo);
        if (conCol !== false && !['nota', 'luz', 'habitacion', 'calle', 'techo', 'cartel'].includes(b)) for (const m4 of A.matricesEntidad(ent.keys[0])) cuerpo(A.nombreEntidades(ent.keys), m4, 'b', `metadata/oo_key = ${cadenaGd(ent.keys[0])}\n`);
      } else {
        for (const k of ent.keys) { const z = A.P[+k.slice(1)]; const col = conCol == null ? (z.fl & 1) || z.cat === 'col' : conCol; if (!col || z.cat === 'luz' || z.cat === 'txt') continue; for (const m4 of A.matricesEntidad(k)) cuerpo((z.nom || 'pieza'), m4, /^cyl/.test(z.mesh) ? 'c' : 'b', `metadata/oo_ref = ${+k.slice(1)}\n`); }
      }
      if (props.comportamientos && props.comportamientos.length) {
        const box = A.cajaEntidades(ent.keys); if (box.isEmpty()) continue; const c = box.getCenter(new T.Vector3());
        const nn = limpio(props.nombre || A.nombreEntidades(ent.keys)) + '_' + (marcas.length + 1);
        marcas.push(`[node name=${cadenaGd(nn)} type="Marker3D" parent="Comportamientos"]\ntransform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${fx(c.x)}, ${fx(c.y)}, ${fx(c.z)})\nmetadata/oo_claves = ${cadenaGd(ent.keys.join(','))}\nmetadata/oo_comportamientos = ${cadenaGd(JSON.stringify(props.comportamientos))}\nmetadata/oo_tamano = Vector3(${box.getSize(new T.Vector3()).toArray().map(fx).join(', ')})\n`);
      }
    }
    if (marcas.length) { nodos.push(`[node name="Comportamientos" type="Node3D" parent="."]\n`); nodos.push(...marcas); }
    const cab = `[gd_scene load_steps=${sub.length + 2} format=3]\n\n[ext_resource type="PackedScene" path=${cadenaGd(glbNombre)} id="1_glb"]\n`;
    return { texto: cab + '\n' + sub.join('\n') + '\n' + nodos.join('\n'), nCol, nMarcas: marcas.length, recortado: nCol >= MAX };
  }
  async function exportarGodot(keys, nombre, zona) {
    const todo = !(keys && keys.length); keys = todo ? todasLasClaves() : keys; const base = nombreArchivo(nombre);
    const r = await glbDe(keys, { zona, todo }); if (!r) return null;
    const t = tscnDe(keys, base + '.glb', nombre || limpio(nombreMapa()));
    /* un .zip con una carpeta: el .glb y el .tscn juntos (el .tscn busca el .glb a su lado) */
    const z = await zip([{ nombre: base + '/' + base + '.glb', datos: r.buf }, { nombre: base + '/' + base + '.tscn', datos: t.texto }]);
    descargar(z, base + '_godot.zip', 'application/zip');
    A.pista('Godot: ' + base + '_godot.zip (' + t.nCol + ' colisiones' + (t.recortado ? ', recortadas' : '') + ', ' + t.nMarcas + ' comportamientos).');
    setTimeout(() => guia('godot', base + '_godot.zip descargado'), 600);
    return { glb: r, tscn: t, zip: z };
  }
  /* ---------- guía «¿Cómo lo abro?» (menú y después de exportar) ---------- */
  const GUIAS = {
    unity: { n: 'Unity', html: `<ol>
      <li>Abre tu proyecto en <b>Unity 2022.3 o Unity 6</b> (sirve 3D, URP o HDRP).</li>
      <li>Instala el importador de glTF una sola vez: <b>Window → Package Manager → + → Add package by name…</b> y escribe <code>com.unity.cloud.gltfast</code>. Pulsa <b>Add</b>.</li>
      <li>Descomprime el <code>_unity.zip</code> (trae una carpeta con el nombre del proyecto, el día y la hora). Arrastra el <code>.glb</code> de esa carpeta a la ventana <b>Project</b> (por ejemplo a <code>Assets/Mapas/</code>). Unity lo importa como un modelo.</li>
      <li>Arrastra ese modelo a la <b>Hierarchy</b> y ponle posición 0, 0, 0. Las medidas están en metros, con Y hacia arriba.</li>
      <li>Para que se pueda caminar encima: selecciona las piezas (o el objeto raíz y sus hijos) y añade <b>Add Component → Mesh Collider</b>. Las piezas que acaban en <code>-colonly</code> son solo colisión: quítales el <i>Mesh Renderer</i>.</li>
      <li>Luces: <b>Window → Rendering → Lighting → Generate Lighting</b>.</li></ol>
      <p class="nota-exp">El <code>_escena.json</code> trae cada objeto con sus propiedades y comportamientos (puertas, coches, zonas…), por si quieres un script que los convierta en componentes. Si los materiales salen rosados, revisa que glTFast esté instalado y que importaste el <code>.glb</code> (no otro formato).</p>` },
    godot: { n: 'Godot', html: `<ol>
      <li>Abre tu proyecto en <b>Godot 4.2 o más nuevo</b>.</li>
      <li>Descomprime el <code>_godot.zip</code> y copia su carpeta (el <code>.glb</code> y el <code>.tscn</code> juntos) dentro del proyecto (por ejemplo <code>res://mapas/</code>). Godot importa el <code>.glb</code> solo.</li>
      <li>En el panel <b>Sistema de archivos</b>, haz doble clic en el <code>.tscn</code>: es la escena del mapa, con el modelo y las colisiones (StaticBody3D) ya puestas.</li>
      <li>Para jugarla, instánciala en tu escena principal (arrástrala) o pon una <b>Camera3D</b> y una luz y pulsa <b>F6</b>.</li></ol>
      <p class="nota-exp">Las piezas que acaban en <code>-colonly</code> Godot las convierte en colisión al importar. Los comportamientos van como metadatos en el nodo «Comportamientos».</p>` },
    blender: { n: 'Blender', html: `<ol>
      <li>En Blender: <b>Archivo → Importar → glTF 2.0 (.glb/.gltf)</b> y elige el archivo.</li>
      <li>El mapa entra como un objeto raíz con el nombre del mapa y, dentro, sus secciones: <code>Objetos_nuevos</code> (lo que hiciste en el editor, por capas), <code>Suelo</code>, <code>Luces</code>…</li></ol>
      <h4>Lo que puede extrañarte</h4>
      <p class="nota-exp"><b>Las líneas punteadas</b> que salen del centro hacia los objetos son las <i>líneas de relación</i> de Blender: unen cada objeto con su padre (el grupo que lo contiene, que está en el origen). Son normales; se ocultan en <b>Superposiciones → Líneas de relación</b>.<br>
      <b>Camera y Light</b> no vienen del mapa: son la cámara y la luz de la escena nueva de Blender.<br>
      <b>Los nombres con números</b> (<code>pieza_123</code>, <code>.001</code>) son piezas sin nombre propio o repetidas: Blender añade <code>.001</code> cuando dos se llaman igual.</p>` }
  };
  function guia(motor, exportado) {
    let actual = GUIAS[motor] ? motor : 'unity';
    const pintar = () => `<div class="cab">${exportado ? 'Listo: ' + esc(exportado) : '¿Cómo abro el mapa?'}</div><div class="cont guia-exp">
      <div class="pestanas-exp">${Object.entries(GUIAS).map(([k, g]) => `<button data-guia="${k}" class="${k === actual ? 'on' : ''}">${g.n}</button>`).join('')}</div>
      ${GUIAS[actual].html}</div><div class="pie"><button class="prim" data-a="m-si">Entendido</button></div>`;
    A.abrirModal(pintar(), 'guia');
    const caja = $('#modalCaja'); caja.onclick = e => { const b = e.target.closest('[data-guia]'); if (!b) return; actual = b.dataset.guia; caja.innerHTML = pintar(); };
  }

  /* ---------- Unity: GLB + JSON de escena + LEEME ---------- */
  const LEEME_UNITY = `Abrir el mapa en Unity (Map Creator)
====================================
1. Unity 2022.3 o Unity 6 (proyecto 3D, URP o HDRP).
2. Instala el importador de glTF una sola vez: Window → Package Manager → + → Add package by name… → com.unity.cloud.gltfast → Add.
3. Descomprime el zip y arrastra el .glb a la ventana Project (por ejemplo Assets/Mapas/). Unity lo importa como un modelo.
4. Arrastra el modelo a la Hierarchy, posición 0, 0, 0. Medidas en metros, Y hacia arriba (el importador ya convierte los ejes).
5. Colisiones: selecciona las piezas y Add Component → Mesh Collider. Las que acaban en «-colonly» son solo colisión: quítales el
   Mesh Renderer.
6. Luces: Window → Rendering → Lighting → Generate Lighting.

Nombres: <Mapa>/<Sección>/<Objeto>, Objetos_nuevos/<capa>/<objeto> y Luces.
El *_escena.json trae cada objeto (nombre, posición, rotación, tamaño, propiedades y comportamientos: puerta, coche, rompible,
interactuable, luz con interruptor, zona de aparición, sonido). En coordenadas de Unity: x = X, y = Y, z = -Z; cuaternión
(−qx, −qy, qz, qw). glTFast no lee los «extras» de glTF, por eso los comportamientos van también en el JSON.
Si los materiales salen rosados: revisa que glTFast esté instalado y que importaste el .glb.
`;
  async function exportarUnity(keys, nombre, zona) {
    const todo = !(keys && keys.length); keys = todo ? todasLasClaves() : keys; const base = nombreArchivo(nombre);
    const r = await glbDe(keys, { zona, todo }); if (!r) return null; const j = escenaJSON(null, { zona, todo });
    /* un .zip con una carpeta: el .glb, la escena .json y el LEEME (con la fecha y la hora de la exportación) */
    const leeme = LEEME_UNITY + '\nExportado: ' + new Date().toLocaleString('es') + ' · mapa «' + nombreMapa() + '»' + (zona ? ' · zona «' + zona.nombre + '»' : '') + '\n';
    const z = await zip([{ nombre: base + '/' + base + '.glb', datos: r.buf }, { nombre: base + '/' + base + '_escena.json', datos: JSON.stringify(j, null, 1) }, { nombre: base + '/LEEME_unity.txt', datos: leeme }]);
    descargar(z, base + '_unity.zip', 'application/zip');
    A.pista('Unity: ' + base + '_unity.zip descargado (.glb, escena .json y LEEME).'); setTimeout(() => guia('unity', base + '_unity.zip descargado'), 800);
    return { glb: r, json: j, zip: z };
  }
  /* ---------- JSON «para el juego» («oo-cambios-juego», versión 1) ---------- */
  function cambiosJuego() {
    const docs = [...A.efectivos()].filter(([, d]) => d && d.mapa === A.mapa).sort((a, b) => String(a[1].creado || '').localeCompare(String(b[1].creado || '')));
    const D = A.D, info = r => { const a = D.piezas[r]; return { ref: r, seccion: D.secciones[a[1]] || null, grupo: a[2] >= 0 ? D.grupos[a[2]] : null, nombre: a[15] >= 0 ? D.nombres[a[15]] : null, malla: D.archivos && a[16] >= 0 ? D.archivos[a[16]] : null, original: { pos: [a[3], a[4], -a[5]], escala: [a[6], a[7], a[8]] } }; };
    const out = { formato: 'oo-cambios-juego', version: 1, mapa: A.mapa, generado: A.ahora(), coordenadas: 'Godot (scripts/mapa_*.gd): X este, Y arriba, Z sur. Unity: x = X, y = Y, z = -Z. «ref» = índice de la pieza en mapa_<mapa>.json (orden de exportar_mapa_web.py); seccion/grupo/nombre/original sirven para volver a encontrarla si el mapa cambia.', piezas_modificadas: [], piezas_borradas: [], objetos_nuevos: [], propiedades: [], notas: [], zonas: [] };
    for (const [id, d] of docs) {
      const refs = d.ref == null ? [] : (Array.isArray(d.ref) ? d.ref : [d.ref]);
      if (d.accion === 'modificar') { const ps = d.datos && Array.isArray(d.datos.piezas) ? d.datos.piezas : [Object.assign({ ref: d.ref }, d.datos)]; for (const z of ps) if (z && z.ref != null && D.piezas[z.ref]) out.piezas_modificadas.push(Object.assign(info(z.ref), { pos: [z.x, z.y, z.z], quat: z.q || null, giroY: z.giroY, tam: z.sx != null ? [z.sx, z.sy, z.sz] : null, color: z.color || null, material: z.material || null, doc: id })); }
      else if (d.accion === 'borrar') { for (const r of refs) if (D.piezas[r]) out.piezas_borradas.push(Object.assign(info(r), { doc: id })); }
      else if (d.accion === 'agregar') out.objetos_nuevos.push({ id: d.id_objeto, tipo: d.tipo, capa: d.capa || 'General', datos: d.datos, props: d.props || null, comportamientos: (d.props && d.props.comportamientos) || [], doc: id });
      else if (d.accion === 'propiedades') out.propiedades.push({ refs, props: d.props || {}, doc: id });
      else if (d.accion === 'nota') out.notas.push({ refs, id_objeto: d.id_objeto || null, texto: d.texto || '', fotos: d.fotos || [], posicion: d.datos ? [d.datos.x, d.datos.y, d.datos.z] : null });
    }
    if (window.OOZonas) out.zonas = OOZonas.lista().map(z => ({ nombre: z.nombre, puntos: z.puntos }));
    if (window.OOMateriales) out.materiales = OOMateriales.listaExport();
    if (window.OOTerreno && OOTerreno.datos()) out.terreno = OOTerreno.terrenoJSON();
    return out;
  }
  function exportarJuego() { const j = cambiosJuego(); const fn = 'cambios_juego_' + corta(nombreMapa(), MAX_PROYECTO) + '_' + sello() + '.json'; descargar(JSON.stringify(j, null, 1), fn, 'application/json'); A.pista('Exportado ' + fn + ': ' + j.piezas_modificadas.length + ' piezas movidas, ' + j.piezas_borradas.length + ' borradas, ' + j.objetos_nuevos.length + ' objetos nuevos.'); return j; }
  /* ---------- importar ---------- */
  function capaImportada(nombre) { const n = 'Importado ' + (nombre || new Date().toLocaleDateString('es')); if (!A.capasLista().some(c => c.nombre === n)) A.guardarCapa(n, { color: '#b07cff' }); return n; }
  function destino() { const t = A.vista === 'planta' ? A.ctlP.target : A.ctl3.target; return { x: t.x, z: t.z }; }
  function importarEscena(j, nombre) {
    if (!j || j.formato !== 'oo-escena' || !Array.isArray(j.objetos)) { A.pista('Ese JSON no es una escena del editor (formato «oo-escena»).'); return 0; }
    const capa = capaImportada(nombre || (j.zona && j.zona.nombre)); const lista = [];
    const objs = j.objetos; let cx = 0, cz = 0; for (const o of objs) { cx += o.posicion[0] / objs.length; cz += o.posicion[2] / objs.length; }
    const dst = destino(), dx = dst.x - cx, dz = dst.z - cz; let n = 0;
    for (const o of objs) {
      const id = A.nuevoId() + (n++);
      if (o.doc && o.doc.tipo) { const d = A.clon(o.doc.datos || {}); d.x = +d.x + dx; d.z = +d.z + dz; delete d.muro; if (Array.isArray(d.puntos_mundo)) delete d.puntos_mundo; const doc = A.docNuevo(id, o.doc.tipo, d, { capa, props: o.props && Object.keys(o.props).length ? o.props : undefined }); lista.push({ id, data: doc }); continue; }
      const piezas = (o.piezas || []).filter(p => p.forma !== 'texto' && p.escala);
      if (!piezas.length) continue;
      const box = new T.Box3(); for (const p of piezas) { const r = Math.max(...p.escala) / 2; box.expandByPoint(new T.Vector3(p.pos[0] - r, p.pos[1] - r, p.pos[2] - r)); box.expandByPoint(new T.Vector3(p.pos[0] + r, p.pos[1] + r, p.pos[2] + r)); }
      const sz = box.getSize(new T.Vector3()), d0 = [Math.max(0.05, A.r3(sz.x)), Math.max(0.05, A.r3(sz.y)), Math.max(0.05, A.r3(sz.z))];
      const partes = piezas.map(p => ({ f: p.forma === 'cilindro' ? 'c' : p.forma === 'esfera' ? 's' : 'b', p: p.pos, s: p.escala, q: p.quat, c: p.color || '#999999', t: !!p.transparente }));
      lista.push({ id, data: A.docNuevo(id, 'copia', { x: o.posicion[0] + dx, y: o.posicion[1], z: o.posicion[2] + dz, giroY: 0, sx: d0[0], sy: d0[1], sz: d0[2], d0, partes, origen: 'centro', nombre: o.nombre }, { capa, props: o.props && Object.keys(o.props).length ? o.props : undefined }) });
    }
    if (!lista.length) { A.pista('La escena no tiene objetos que importar.'); return 0; }
    A.guardar(lista); A.seleccionar(lista.map(x => 'n' + x.id));
    if (j.zona && Array.isArray(j.zona.puntos) && j.zona.puntos.length >= 3) A.guardarCol('zonas', 'z-' + A.mapa + '-' + Date.now().toString(36), { mapa: A.mapa, nombre: (j.zona.nombre || 'Zona') + ' (importada)', puntos: j.zona.puntos.map(([x, z]) => [A.r3(x + dx), A.r3(z + dz)]), color: '#b07cff', oculta: false, aislada: false, creado: A.ahora() });
    A.pista(lista.length + ' objetos importados en la capa «' + capa + '», centrados donde mira la cámara.'); return lista.length;
  }
  /* GLB/GLTF de una escena: se guarda como modelo importado y cada nodo pasa a ser un objeto «modelo:» editable; los objetos nuevos
     exportados por este editor (extras.oo_doc) vuelven como lo que eran (pared, habitación, objeto del catálogo…). */
  async function importarGLBEscena(f) {
    if (!window.OOImportados) return;
    let ld; try { ld = await OOCargar.cargador(); } catch (e) { A.pista('No se pudo cargar el lector glTF.'); return; }
    A.pista('Importando ' + f.name + '…');
    const buf = await f.arrayBuffer(); let g; try { g = await new Promise((ok, mal) => ld.parse(buf, '', ok, mal)); } catch (e) { A.pista('No se pudo leer ' + f.name + ' (' + (e.message || e) + '). Usa .glb o un .gltf con todo incrustado.'); return; }
    const r = await OOImportados.subir(f); const pr = OOImportados.preparar(g.scene);
    const aid = 'as-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    A.guardarCol('assets', aid, { tipo: 'modelo', nombre: f.name.replace(/\.(glb|gltf)$/i, ''), archivo: r.id, url: r.url, d0: [A.r3(pr.size.x), A.r3(pr.size.y), A.r3(pr.size.z)], mini: OOImportados.miniatura(g.scene), escena: true, creado: A.ahora() });
    // elegir los nodos «objeto»: marcados por este editor, o los hijos de la raíz (bajando mientras haya un solo hijo)
    const objetos = []; g.scene.traverse(o => { if (o.userData && (o.userData.oo_obj || o.userData.oo_doc)) objetos.push(o); });
    if (!objetos.length) { let base = g.scene; while (base.children.length === 1 && !base.children[0].isMesh) base = base.children[0]; (base.children.length ? base.children : [base]).forEach(o => objetos.push(o)); }
    const usados = new Set(); for (const o of objetos) { if (!o.name || usados.has(o.name)) o.name = (o.name || 'nodo') + '_' + objetos.indexOf(o); usados.add(o.name); }
    const capa = capaImportada(f.name.replace(/\.\w+$/, '')); const lista = []; let n = 0;
    g.scene.updateMatrixWorld(true);
    const box0 = new T.Box3().setFromObject(g.scene), c0 = box0.getCenter(new T.Vector3()), dst = destino();
    const propio = !!g.scene.getObjectByProperty('name', 'Objetos_nuevos') || objetos.some(o => o.userData.oo_obj);
    const dx = propio ? 0 : dst.x - c0.x, dz = propio ? 0 : dst.z - c0.z;
    for (const o of objetos.slice(0, 3000)) {
      const id = A.nuevoId() + (n++);
      const ud = o.userData || {};
      if (ud.oo_doc && ud.oo_doc.tipo) { const d = A.clon(ud.oo_doc.datos || {}); delete d.muro; lista.push({ id, data: A.docNuevo(id, ud.oo_doc.tipo, d, { capa }) }); continue; }
      const b = new T.Box3().setFromObject(o); if (b.isEmpty()) continue; const s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
      const props = {}; ['nombre', 'etiqueta', 'colision', 'recibe_sombras', 'proyecta_sombras', 'comportamientos', 'material'].forEach(k => { if (ud[k] != null) props[k] = ud[k]; });
      lista.push({ id, data: A.docNuevo(id, 'modelo:' + aid, { x: c.x + dx, y: b.min.y, z: c.z + dz, giroY: 0, sx: Math.max(0.01, s.x), sy: Math.max(0.01, s.y), sz: Math.max(0.01, s.z), nodo: o.name, nombre: ud.nombre || o.name }, { capa, props: Object.keys(props).length ? props : undefined }) });
    }
    if (!lista.length) { A.pista('No se encontraron objetos en ' + f.name + '.'); return; }
    A.guardar(lista); A.pista(lista.length + ' objetos de ' + f.name + ' importados en la capa «' + capa + '»: se pueden mover, girar, escalar y borrar uno a uno.');
  }
  function pedir(accept) { return new Promise(ok => { const inp = $('#archivoGen'); inp.accept = accept; inp.multiple = false; inp.value = ''; inp.onchange = () => ok((inp.files || [])[0] || null); inp.click(); }); }
  async function importarArchivo() {
    const f = await pedir('.json,.glb,.gltf,application/json,model/gltf-binary'); if (!f) return;
    if (/\.(glb|gltf)$/i.test(f.name)) return importarGLBEscena(f);
    let j; try { j = JSON.parse(await f.text()); } catch (e) { A.pista('No se pudo leer ' + f.name + ': no es un JSON válido.'); return; }
    if (j.formato === 'oo-prefabs' || Array.isArray(j.prefabs) || Array.isArray(j.componentes)) { if (window.OOPrefabs) OOPrefabs.importarJSON(j); return; }
    importarEscena(j, f.name.replace(/\.\w+$/, ''));
  }
  async function importarCatalogo() {
    const f = await pedir('.json,.glb,.gltf'); if (!f) return;
    if (/\.(glb|gltf)$/i.test(f.name)) { if (window.OOImportados) OOImportados.importarModelo([f]); return; }
    try { const j = JSON.parse(await f.text()); if (window.OOPrefabs) OOPrefabs.importarJSON(j); } catch (e) { A.pista('No se pudo leer ' + f.name + '.'); }
  }
  async function elegirZona(titulo) {
    const zs = window.OOZonas ? OOZonas.lista() : []; if (!zs.length) { A.pista('No hay zonas en este mapa: dibuja una con la herramienta Zonas.'); return null; }
    let el = zs[0].id; const pr = A.abrirModal(`<div class="cab">${esc(titulo)}</div><div class="cont"><label class="campo"><span>Zona</span><select id="expZona">${zs.map(z => `<option value="${esc(z.id)}">${esc(z.nombre)} · ${z.n} objetos</option>`).join('')}</select></label></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Exportar</button></div>`);
    setTimeout(() => { const s = $('#expZona'); if (s) s.addEventListener('change', () => { el = s.value; }); }, 30);
    if (await pr !== true) return null; const z = zs.find(x => x.id === el); return z ? { z, keys: OOZonas.contenido(z).keys.filter(A.existe) } : null;
  }
  const selOTodo = () => { if (!A.sel.length) { A.pista('No hay nada seleccionado.'); return null; } return A.expandirGrupos(A.sel); };
  const ACC = {
    'exp-glb-todo': () => exportarGLB(null, ''), 'exp-glb-sel': () => { const k = selOTodo(); if (k) exportarGLB(k, 'seleccion'); },
    'exp-glb-zona': async () => { const r = await elegirZona('Exportar una zona (.glb)'); if (r) exportarGLB(r.keys, r.z.nombre, r.z); },
    'exp-json-todo': () => exportarJSON(null, ''), 'exp-json-zona': async () => { const r = await elegirZona('Exportar una zona como escena (.json)'); if (r) exportarJSON(r.keys, r.z.nombre, r.z); },
    'exp-godot-todo': () => exportarGodot(null, ''), 'exp-godot-zona': async () => { const r = await elegirZona('Exportar una zona para Godot'); if (r) exportarGodot(r.keys, r.z.nombre, r.z); },
    'exp-unity-todo': () => exportarUnity(null, ''), 'exp-unity-zona': async () => { const r = await elegirZona('Exportar una zona para Unity'); if (r) exportarUnity(r.keys, r.z.nombre, r.z); }, 'exp-juego': () => exportarJuego(), 'exp-prefabs': () => { if (window.OOPrefabs) OOPrefabs.exportar(); },
    'imp-zona': () => importarArchivo(), 'imp-escena': () => importarArchivo(), 'importar-catalogo': () => importarCatalogo()
  };
  ACC['exp-ayuda'] = b => guia(b && b.dataset.motor);
  document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || !ACC[b.dataset.a]) return; e.preventDefault(); ACC[b.dataset.a](b); });
  window.OOExportar = { guia, nombreMapa, nombreArchivo, zip, exportarEscena, glbDe, exportarGLB, escenaJSON, exportarJSON, tscnDe, exportarGodot, exportarUnity, cambiosJuego, exportarJuego, importarEscena, importarGLBEscena, todasLasClaves, entidades };
})();
