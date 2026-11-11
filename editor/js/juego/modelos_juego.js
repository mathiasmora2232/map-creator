/* Editor del mapa (2.1): modelos reales del juego para los objetos del catálogo (silla, monitor, botellas, barril, coches…).
   El servidor manda en /_modelos las mallas OOM1 que usa Unity (las mismas de mallas_reales.js) con la colocación de cada pieza.
   catalogo_extra.js devuelve para esos objetos una sola caja invisible ("h", con `modelo`); aquí, en cada fotograma, se viste esa caja
   con la malla real escalada a su tamaño, y se dibujan las miniaturas del catálogo con la malla. Si no hay mallas, se ven las piezas. */
(function () {
  'use strict';
  const T = window.THREE;
  const MODELOS = {};
  /* giro en Y (rad) para que el frente del modelo mire a +Z (los coches, con el morro a +X), como el resto del catálogo */
  const GIRO = { silla: 0, monitor: 0, taza: 0, telefono: 0, disco_duro: 0, impresora: 0, planta: 0, dispensador_agua: 0, archivador: 0, armario: 0, barril: 0, tarima: 0, caja_madera: 0, caja_carton: 0, pilsener: 0, paulaner: 0, sedan: 0, suv: 0, pickup: 0, hatchback: 0 };
  let listo = false, error = '';

  function geometria(buf, off, n) {
    const dv = new DataView(buf, off, n);
    if (n < 16 || dv.getUint8(0) !== 79 || dv.getUint8(1) !== 79 || dv.getUint8(2) !== 77 || dv.getUint8(3) !== 49) return null;
    const nv = dv.getInt32(4, true), ni = dv.getInt32(8, true), completa = dv.getInt32(12, true) === 1;
    let p = off + 16;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(buf.slice(p, p + nv * 12)), 3)); p += nv * 12;
    if (completa) { g.setAttribute('normal', new T.BufferAttribute(new Float32Array(buf.slice(p, p + nv * 12)), 3)); p += nv * 12 + nv * 8; }
    const i32 = new Int32Array(buf.slice(p, p + ni * 4));
    g.setIndex(new T.BufferAttribute(nv < 65536 ? Uint16Array.from(i32) : Uint32Array.from(i32), 1));
    g.scale(1, 1, -1); // Unity → editor; con la Z invertida las caras quedan bien orientadas (igual que en mallas_reales.js)
    if (!completa) g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }

  async function cargar() {
    try {
      const r = await fetch('/_modelos', { cache: 'no-cache' });
      if (!r.ok) { error = 'HTTP ' + r.status; return; }
      const buf = await r.arrayBuffer(); const dv = new DataView(buf);
      if (buf.byteLength < 12 || dv.getUint8(0) !== 79 || dv.getUint8(3) !== 74) { error = 'formato'; return; }
      const nj = dv.getUint32(4, true);
      const js = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, nj)));
      let p = 8 + nj; const n = dv.getUint32(p, true); p += 4;
      const tam = []; for (let i = 0; i < n; i++) { tam.push(dv.getUint32(p, true)); p += 4; }
      const geos = []; for (let i = 0; i < n; i++) { try { geos.push(tam[i] ? geometria(buf, p, tam[i]) : null); } catch (e) { geos.push(null); } p += tam[i]; }
      for (const clave in js.modelos) {
        const md = js.modelos[clave], R = new T.Matrix4().makeRotationY(GIRO[clave] || 0);
        const piezas = md.piezas.filter(q => geos[q.g]).map(q => ({ geo: geos[q.g], color: q.c, tinte: q.p, vidrio: !!q.v, m: new T.Matrix4().fromArray(q.m).premultiply(R) }));
        if (!piezas.length) continue;
        const caja = new T.Box3(); for (const q of piezas) caja.union(q.geo.boundingBox.clone().applyMatrix4(q.m));
        const size = caja.getSize(new T.Vector3()), centro = caja.getCenter(new T.Vector3());
        // N: lleva la caja del modelo al cubo unidad centrado (la caja invisible del objeto es ese cubo escalado y colocado)
        const N = new T.Matrix4().makeScale(1 / Math.max(size.x, 1e-4), 1 / Math.max(size.y, 1e-4), 1 / Math.max(size.z, 1e-4)).multiply(new T.Matrix4().makeTranslation(-centro.x, -centro.y, -centro.z));
        MODELOS[clave] = { piezas, size, N, pintura: md.pintura };
      }
      listo = Object.keys(MODELOS).length > 0;
      if (listo) alCargar();
    } catch (e) { error = String(e); console.warn('Sin modelos reales del catálogo: se ven las piezas', e); }
  }

  /* medidas del catálogo = las del modelo en el juego; repinta lo ya colocado y las miniaturas */
  function alCargar() {
    const OO = window.OO; if (!OO) return;
    const med = s => [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)];
    for (const k in OO.OBJ) { const o = OO.OBJ[k]; if (o.modelo && MODELOS[o.modelo]) o.d = med(MODELOS[o.modelo].size); }
    for (const k in OO.COCHES) { const c = OO.COCHES[k]; if (c.modelo && MODELOS[c.modelo]) { const d = med(MODELOS[c.modelo].size); c[1] = d[0]; c[2] = d[1]; c[3] = d[2]; } }
    for (const it of OO.ITEMS) {
      const cl = claveItem(it); if (!cl) continue;
      const d = med(MODELOS[cl].size); it.datos.sx = d[0]; it.datos.sy = d[1]; it.datos.sz = d[2];
    }
    const repintar = () => {
      const E = window.OOEditor; if (!E) { setTimeout(repintar, 200); return; }
      for (const it of OO.ITEMS) { const cl = claveItem(it); if (cl) { const url = miniatura(cl, it.datos.color); if (url) E.miniaturas[it.id] = url; } }
      try { E.renderTodo(); } catch (e) { console.warn(e); }
      const pan = document.querySelector('[data-panel="catalogo"]');
      if (pan && !pan.hidden) E.renderCatalogo();
    };
    repintar();
  }
  function claveItem(it) {
    const OO = window.OO, t = String(it.tipo || '');
    if (t.startsWith('objeto:')) { const o = OO.OBJ[t.slice(7)]; return o && o.modelo && MODELOS[o.modelo] ? o.modelo : null; }
    if (t === 'coche') { const c = OO.COCHES[it.datos.subtipo]; return c && c.modelo && MODELOS[c.modelo] ? c.modelo : null; }
    return null;
  }

  /* color de una pieza: la pintura del coche (tinte × color elegido), el color del objeto si es de una pieza o el del juego */
  const _c = new T.Color(), _t = new T.Color();
  function colorPieza(M, q, color) {
    if (q.tinte) return _c.set(color).multiply(_t.set(q.tinte)).getHex();
    if (M.piezas.length === 1) return _c.set(color).getHex();
    return _c.set(q.color).getHex();
  }
  function material(q, hex, recorte) {
    const comun = { color: hex, clippingPlanes: recorte ? [recorte] : [] };
    if (q.vidrio) return new T.MeshPhongMaterial(Object.assign(comun, { transparent: true, opacity: 0.38, depthWrite: false, shininess: 90, specular: 0x666666 }));
    if (q.tinte) return new T.MeshPhongMaterial(Object.assign(comun, { shininess: 70, specular: 0x3a3a3a }));
    return new T.MeshLambertMaterial(comun);
  }

  /* ---------- en la escena ---------- */
  const vivos = new Map(); let grupo = null;
  const RES = new T.Color('#ff7a00');
  function crear(M) {
    const g = new T.Group(); g.matrixAutoUpdate = false;
    const recorte = window.OOEditor.clip || null;
    for (const q of M.piezas) {
      const mesh = new T.Mesh(q.geo, material(q, 0xffffff, recorte));
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(q.m);
      mesh.castShadow = !q.vidrio; mesh.receiveShadow = !q.vidrio; if (q.vidrio) mesh.renderOrder = 2;
      g.add(mesh);
    }
    grupo.add(g);
    return g;
  }
  function quitar(v) { grupo.remove(v.g); v.g.traverse(o => { if (o.isMesh) o.material.dispose(); }); }
  function pintar(v, M, color, sel) {
    v.g.children.forEach((mesh, i) => { mesh.material.color.setHex(colorPieza(M, M.piezas[i], color)); if (sel) mesh.material.color.lerp(RES, 0.55); });
    v.color = color; v.sel = sel;
  }
  function sincronizar() {
    requestAnimationFrame(sincronizar);
    const E = window.OOEditor; if (!listo || !E) return;
    if (!grupo) { grupo = new T.Group(); grupo.name = 'modelosCatalogo'; E.scene.add(grupo); }
    let cambio = false; const vistos = new Set(), selSet = E.selSet();
    for (const o of E.nuevos().values()) {
      const an = o.partes && o.partes[0];
      if (!an || !an.modelo || !an.m) continue;
      const M = MODELOS[an.modelo]; if (!M) continue;
      vistos.add(o.id);
      let v = vivos.get(o.id);
      if (!v || v.clave !== an.modelo) { if (v) quitar(v); v = { g: crear(M), clave: an.modelo, m: null, color: null, sel: null }; vivos.set(o.id, v); }
      if (!v.m || !v.m.equals(an.m)) { v.m = an.m.clone(); v.g.matrix.multiplyMatrices(an.m, M.N); v.g.matrixWorldNeedsUpdate = true; cambio = true; }
      const sel = selSet.has('n' + o.id);
      if (sel !== v.sel || an.c !== v.color) { pintar(v, M, an.c, sel); cambio = true; }
    }
    for (const [id, v] of vivos) if (!vistos.has(id)) { quitar(v); vivos.delete(id); cambio = true; }
    if (cambio) E.marcar();
  }

  /* ---------- miniaturas del catálogo (misma cámara que las de editor.js) ---------- */
  let rend = null;
  function miniatura(clave, color) {
    const M = MODELOS[clave]; if (!M) return '';
    try {
      if (!rend) { rend = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rend.setSize(128, 128, false); rend.setPixelRatio(1); }
      const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x777777, 0.9)); const dl = new T.DirectionalLight(0xffffff, 0.6); dl.position.set(-3, 5, 4); sc.add(dl);
      const g = new T.Group();
      for (const q of M.piezas) { const m = new T.Mesh(q.geo, material(q, colorPieza(M, q, color || M.pintura || '#888888'), null)); m.matrixAutoUpdate = false; m.matrix.copy(q.m); g.add(m); }
      sc.add(g); g.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(g); const c = box.getCenter(new T.Vector3()), r = Math.max(0.05, box.getSize(new T.Vector3()).length() / 2);
      const giro = /^(sedan|suv|pickup|hatchback)$/.test(clave) ? new T.Vector3(1.15, 0.75, 1) : new T.Vector3(1, 0.75, 1.15);
      const cm = new T.PerspectiveCamera(30, 1, 0.01, 1000); cm.position.copy(c).add(giro.normalize().multiplyScalar(r / Math.sin(15 * Math.PI / 180) * 1.02)); cm.lookAt(c);
      rend.setClearColor(0x000000, 0); rend.render(sc, cm);
      const url = rend.domElement.toDataURL('image/png');
      g.traverse(o => { if (o.isMesh) o.material.dispose(); });
      return url;
    } catch (e) { return ''; }
  }

  /* miniaturas de objetos pequeños por piezas (latas, tazas, vasos…): las de editor.js usan un radio mínimo de 0,2 m y salen diminutas */
  const GEO = { b: new T.BoxGeometry(1, 1, 1), c: new T.CylinderGeometry(0.5, 0.5, 1, 18), s: new T.SphereGeometry(0.5, 16, 12) };
  function miniaturaPartes(it) {
    const OO = window.OO; let parts;
    try { parts = OO.construir({ tipo: it.tipo, datos: Object.assign({}, it.datos), fotos: [] }); } catch (e) { return ''; }
    const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x777777, 0.9)); const dl = new T.DirectionalLight(0xffffff, 0.6); dl.position.set(-3, 5, 4); sc.add(dl);
    const g = new T.Group(), q = new T.Quaternion();
    for (const pt of parts) {
      if (pt.oculta || !GEO[pt.f === 'l' ? 's' : pt.f]) continue;
      if (pt.q) q.fromArray(pt.q).normalize(); else if (pt.r) q.setFromEuler(new T.Euler(pt.r[0], pt.r[1], pt.r[2])); else q.set(0, 0, 0, 1);
      const m = new T.Mesh(GEO[pt.f === 'l' ? 's' : pt.f], new T.MeshLambertMaterial({ color: pt.c || '#cccccc', transparent: !!pt.t, opacity: pt.t ? 0.5 : 1 }));
      m.position.fromArray(pt.p); m.quaternion.copy(q); m.scale.set(Math.abs(pt.s[0]) || 1e-4, Math.abs(pt.s[1]) || 1e-4, Math.abs(pt.s[2]) || 1e-4); g.add(m);
    }
    if (!g.children.length) return '';
    sc.add(g); g.updateMatrixWorld(true);
    if (!rend) { rend = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rend.setSize(128, 128, false); rend.setPixelRatio(1); }
    const box = new T.Box3().setFromObject(g), c = box.getCenter(new T.Vector3()), r = Math.max(0.02, box.getSize(new T.Vector3()).length() / 2);
    const cm = new T.PerspectiveCamera(30, 1, 0.005, 100); cm.position.copy(c).add(new T.Vector3(1, 0.75, 1.15).normalize().multiplyScalar(r / Math.sin(15 * Math.PI / 180) * 1.02)); cm.lookAt(c);
    rend.setClearColor(0x000000, 0); rend.render(sc, cm);
    const url = rend.domElement.toDataURL('image/png');
    g.traverse(o => { if (o.isMesh) o.material.dispose(); });
    return url;
  }
  function miniaturasPequenas() {
    const E = window.OOEditor, OO = window.OO; if (!E || !OO) { setTimeout(miniaturasPequenas, 200); return; }
    for (const it of OO.ITEMS) {
      if (claveItem(it) || !String(it.tipo).startsWith('objeto:')) continue;
      const d = it.datos; if (Math.hypot(+d.sx || 1, +d.sy || 1, +d.sz || 1) / 2 >= 0.2) continue;
      try { const url = miniaturaPartes(it); if (url) E.miniaturas[it.id] = url; } catch (e) { /* queda la de editor.js */ }
    }
  }

  window.OOModelos = { listo: k => listo && !!MODELOS[k], cargado: () => listo, error: () => error, modelos: MODELOS, miniatura, GIRO };
  setTimeout(miniaturasPequenas, 0);
  cargar();
  requestAnimationFrame(sincronizar);
})();
