/* Editor del mapa (2.1): mallas reales del juego en la vista 3D.
   Antes las mallas (puertas con sus tableros, manijas y bisagras, coches, sillas, objetos) se veían como su caja envolvente: puertas
   como cajas lisas y la furgoneta como un ladrillo blanco. Ahora el servidor manda los .bytes OOM1 que usa Unity (/_mallas/<mapa>) y
   cada pieza se dibuja con su malla, agrupadas por (malla, material) en InstancedMesh. La caja sigue existiendo, invisible ("boxH"),
   para elegir, mover y medir como antes; si la pieza se mueve o se escala, la malla la sigue. */
(function () {
  'use strict';
  const T = window.THREE;
  const MZ = new T.Matrix4().makeScale(1, 1, -1); // Unity → editor (Z invertida)
  const CERO_M = new T.Matrix4().makeScale(0, 0, 0);
  const COCHE = /^(suv|sedan|hatchback|pickup|furgoneta|camion|auto)/i;
  let geos = [], lotes = [], grupo = null;
  const _m = new T.Matrix4(), _mb = new T.Matrix4(), _c = new T.Color();

  function geometria(buf, off, n) {
    const dv = new DataView(buf, off, n);
    if (n < 16 || dv.getUint8(0) !== 79 || dv.getUint8(1) !== 79 || dv.getUint8(2) !== 77 || dv.getUint8(3) !== 49) return null;
    const nv = dv.getInt32(4, true), ni = dv.getInt32(8, true), completa = dv.getInt32(12, true) === 1;
    let p = off + 16;
    const pos = new Float32Array(buf.slice(p, p + nv * 12)); p += nv * 12;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    if (completa) { g.setAttribute('normal', new T.BufferAttribute(new Float32Array(buf.slice(p, p + nv * 12)), 3)); p += nv * 12 + nv * 8; }
    const i32 = new Int32Array(buf.slice(p, p + ni * 4));
    g.setIndex(new T.BufferAttribute(nv < 65536 ? Uint16Array.from(i32) : Uint32Array.from(i32), 1));
    if (!completa) g.computeVertexNormals();
    return g;
  }

  async function cargar(nombre, d) {
    geos = [];
    if (!d || !d.archivos || !d.archivos.length) return;
    try {
      const r = await fetch('/_mallas/' + nombre, { cache: 'no-cache' });
      if (!r.ok) return;
      const buf = await r.arrayBuffer();
      const dv = new DataView(buf); const n = dv.getUint32(0, true);
      let off = 4 + 4 * n;
      for (let i = 0; i < n; i++) { const s = dv.getUint32(4 + 4 * i, true); if (s > 0) { try { geos[i] = geometria(buf, off, s); } catch (e) { geos[i] = null; } } off += s; }
    } catch (e) { console.warn('Sin mallas reales: se ven las cajas', e); geos = []; }
  }

  function tiene(a) { return a && a[0] === 1 && a.length > 16 && a[16] >= 0 && !!geos[a[16]]; }

  function material(tipo) {
    const comun = { color: 0xffffff, clippingPlanes: (window.OOEditor && OOEditor.clip) ? [OOEditor.clip] : [] };
    if (tipo === 'vidrio') return new T.MeshPhongMaterial(Object.assign(comun, { transparent: true, opacity: 0.38, depthWrite: false, shininess: 90, specular: 0x666666 }));
    if (tipo === 'pintura') return new T.MeshPhongMaterial(Object.assign(comun, { shininess: 70, specular: 0x3a3a3a }));
    if (tipo === 'metal') return new T.MeshPhongMaterial(Object.assign(comun, { shininess: 40, specular: 0x2a2a2a }));
    return new T.MeshLambertMaterial(comun);
  }

  let escena = null;
  function construir(d, P, sc) {
    if (sc) escena = sc;
    limpiar();
    if (!geos.length) return;
    grupo = new T.Group(); grupo.name = 'mallasReales';
    const por = new Map();
    for (let i = 0; i < P.length; i++) {
      const z = P[i]; if (!z || z.mesh !== 'boxH') continue;
      const a = d.piezas[i];
      const nm = z.mat >= 0 && d.materiales[z.mat] ? String(d.materiales[z.mat][0]) : '';
      const grp = z.grp >= 0 ? String(d.grupos[z.grp] || '') : '';
      let tipo = 'mate';
      if (/vidrio|cristal/i.test(nm) || /vidrio|cristal/i.test(grp)) tipo = 'vidrio';
      else if (COCHE.test(z.nom) || /^auto:/.test(grp)) tipo = 'pintura';
      else if (/acero|aluminio|metal|chapa|cromo/i.test(nm)) tipo = 'metal';
      const k = a[16] + '|' + tipo;
      let l = por.get(k); if (!l) { l = { geo: geos[a[16]], tipo, piezas: [] }; por.set(k, l); }
      // Unity: T(pivote) · R(q) · S(escala); en el editor con la Z invertida.
      const w0 = new T.Matrix4().compose(new T.Vector3(a[17], a[18], a[19]), new T.Quaternion(a[9], a[10], a[11], a[12]).normalize(), new T.Vector3(a[20], a[21], a[22])).premultiply(MZ);
      z.real = { lote: l, slot: l.piezas.length, w0, inv: null };
      l.piezas.push(z);
    }
    for (const l of por.values()) {
      const mesh = new T.InstancedMesh(l.geo, material(l.tipo), l.piezas.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(l.piezas.length * 3), 3);
      mesh.frustumCulled = false; // three r147 no calcula la esfera de las instancias
      mesh.castShadow = l.tipo !== 'vidrio'; mesh.receiveShadow = l.tipo !== 'vidrio';
      if (l.tipo === 'vidrio') mesh.renderOrder = 2;
      l.mesh = mesh; grupo.add(mesh); lotes.push(l);
    }
    escena.add(grupo);
  }

  function escribir(z, vis, sel, resalte) {
    const r = z.real; if (!r || !r.lote.mesh) return;
    const mesh = r.lote.mesh;
    if (!vis) mesh.setMatrixAt(r.slot, CERO_M);
    else {
      const b = z.b;
      if (z.p.equals(b.p) && z.q.equals(b.q) && z.s.equals(b.s)) mesh.setMatrixAt(r.slot, r.w0);
      else {
        if (!r.inv) r.inv = new T.Matrix4().compose(b.p, b.q, b.s).invert();
        _m.compose(z.p, z.q, z.s).multiply(r.inv).multiply(r.w0);
        mesh.setMatrixAt(r.slot, _m);
      }
    }
    _c.copy(z.c); if (sel && resalte) _c.lerp(resalte, 0.55);
    mesh.setColorAt(r.slot, _c);
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }

  function limpiar() {
    if (grupo && escena) { escena.remove(grupo); for (const l of lotes) { if (l.mesh) { l.mesh.material.dispose(); l.mesh.dispose(); } } }
    grupo = null; lotes = [];
  }

  function hayMallas() { return geos.length > 0; }

  window.OOMallas = { cargar, tiene, construir, escribir, limpiar, hayMallas };
})();
