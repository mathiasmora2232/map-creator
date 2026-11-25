/* Exportar a GLB con el motor de Rust (motor/src/glb.rs). Recorre la escena de three.js una vez, la empaqueta en el formato «OOGB»
   (ver la cabecera de glb.rs) y Rust escribe el JSON, el binario y el contenedor GLB.
   Cubre lo que genera la exportación del editor: grupos, mallas con MeshStandardMaterial sin texturas (color, rugosidad, metal,
   emisión, transparencia, alphaTest, doble cara), geometrías con position/normal/uv/color en float32 e índices, y luces puntuales.
   Si encuentra algo más (texturas, huesos, morph, instancias, otros materiales o luces), devuelve null y se usa el GLTFExporter de
   three.js, así que el resultado nunca pierde nada. Los nombres y extras (userData) se escriben igual que GLTFExporter r147. */
(function () {
  'use strict';
  const MAGIA = 0x42474f4f, VERSION = 1;
  const ATTRS: Record<string, number> = { position: 0, normal: 1, uv: 2, color: 3 };
  const MAPAS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];
  const enc = new TextEncoder();
  let ultimoMotivo = '';

  const esIdentidad = (e: ArrayLike<number>): boolean => { for (let i = 0; i < 16; i++) if (e[i] !== (i % 5 === 0 ? 1 : 0)) return false; return true; };
  const igual = (a: number[], b: number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
  function textoObjeto(o: any): string {
    let t = o.name !== '' && o.name != null ? '"name":' + JSON.stringify(String(o.name)) : '';
    if (o.userData && typeof o.userData === 'object') {
      let s = ''; try { s = JSON.stringify(o.userData); } catch (e) { s = ''; }
      if (s && s !== '{}') t += (t ? ',' : '') + '"extras":' + s;
    }
    return t;
  }
  function materialDef(m: any): any {
    const d: any = { pbrMetallicRoughness: {} };
    const color = m.color.toArray().concat([m.opacity]);
    if (!igual(color, [1, 1, 1, 1])) d.pbrMetallicRoughness.baseColorFactor = color;
    d.pbrMetallicRoughness.metallicFactor = m.metalness; d.pbrMetallicRoughness.roughnessFactor = m.roughness;
    if (m.emissive) {
      const e = m.emissive.clone().multiplyScalar(m.emissiveIntensity), mx = Math.max(e.r, e.g, e.b);
      if (mx > 1) e.multiplyScalar(1 / mx);
      if (mx > 0) d.emissiveFactor = e.toArray();
    }
    if (m.transparent) d.alphaMode = 'BLEND'; else if (m.alphaTest > 0) { d.alphaMode = 'MASK'; d.alphaCutoff = m.alphaTest; }
    if (m.side === THREE.DoubleSide) d.doubleSided = true;
    if (m.name !== '') d.name = m.name;
    try { const s = JSON.stringify(m.userData); if (s && s !== '{}') d.extras = JSON.parse(s); } catch (e) { /* como GLTFExporter: sin extras */ }
    return d;
  }
  function materialSoportado(m: any): string {
    if (!m || Array.isArray(m)) return 'varios materiales en una malla';
    if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return 'material ' + (m.type || '?');
    for (const k of MAPAS) if (m[k]) return 'material con textura (' + k + ')';
    return '';
  }
  function geometriaSoportada(g: any): string {
    if (!g || !g.isBufferGeometry) return 'geometría que no es BufferGeometry';
    if (g.morphAttributes && Object.keys(g.morphAttributes).some((k) => g.morphAttributes[k].length)) return 'geometría con morph';
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k];
      if (!(k in ATTRS)) return 'atributo ' + k;
      if (a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array) || a.normalized) return 'atributo ' + k + ' no float32';
    }
    if (!g.attributes.position) return 'geometría sin posiciones';
    if (g.index && !(g.index.array instanceof Uint16Array || g.index.array instanceof Uint32Array || g.index.array instanceof Uint8Array)) return 'índices raros';
    return '';
  }

  /** raiz (ya con updateMatrixWorld) → ArrayBuffer del .glb, o null si hay algo que solo sabe exportar GLTFExporter. */
  function exportar(raiz: any): ArrayBuffer | null {
    ultimoMotivo = '';
    if (!window.OOMotor || !OOMotor.activo() || !OOMotor.glb) { ultimoMotivo = 'motor no cargado'; return null; }
    const nodos: any[] = [], padres: number[] = [], mallaDe: number[] = [], luzDe: number[] = [];
    const geos = new Map<any, number>(), listaGeos: any[] = [], mats = new Map<any, number>(), defsMat: any[] = [];
    const mallas = new Map<string, number>(), listaMallas: { geo: number; mat: number; txt: string }[] = [], luces: any[] = [];
    let motivo = '';
    const visitar = (o: any, padre: number): void => {
      if (motivo) return;
      const i = nodos.length; nodos.push(o); padres.push(padre); mallaDe.push(-1); luzDe.push(-1);
      if (o.isMesh) {
        if (o.isSkinnedMesh || o.isInstancedMesh) { motivo = o.type; return; }
        motivo = materialSoportado(o.material) || geometriaSoportada(o.geometry); if (motivo) return;
        let gi = geos.get(o.geometry); if (gi === undefined) { gi = listaGeos.length; geos.set(o.geometry, gi); listaGeos.push(o.geometry); }
        let mi = mats.get(o.material); if (mi === undefined) { mi = defsMat.length; mats.set(o.material, mi); defsMat.push(materialDef(o.material)); }
        const clave = gi + ':' + mi; let me = mallas.get(clave);
        if (me === undefined) { me = listaMallas.length; mallas.set(clave, me); listaMallas.push({ geo: gi, mat: mi, txt: o.name ? '"name":' + JSON.stringify(String(o.name)) : '' }); }
        mallaDe[i] = me;
      } else if (o.isPointLight) {
        const d: any = {}; if (o.name) d.name = o.name; d.color = o.color.toArray(); d.intensity = o.intensity; d.type = 'point'; if (o.distance > 0) d.range = o.distance;
        luzDe[i] = luces.length; luces.push(d);
      } else if (!(o.type === 'Group' || o.type === 'Object3D')) { motivo = 'objeto ' + o.type; return; }
      for (const h of o.children) visitar(h, i);
    };
    visitar(raiz, -1);
    if (motivo) { ultimoMotivo = motivo; return null; }

    /* ── textos (UTF-8): nombre + extras de cada nodo, nombre de cada malla ── */
    const trozos: Uint8Array[] = []; let lenTxt = 0;
    const txt = (s: string): [number, number] => { if (!s) return [0, 0]; const b = enc.encode(s); trozos.push(b); const o = lenTxt; lenTxt += b.length; return [o, b.length]; };
    const txtNodo = nodos.map((o) => txt(textoObjeto(o)));
    const txtMalla = listaMallas.map((m) => txt(m.txt));
    const cab: any = { asset: { version: '2.0', generator: 'Map Creator (motor Rust)' } };
    if (defsMat.length) cab.materials = defsMat;
    if (luces.length) { cab.extensionsUsed = ['KHR_lights_punctual']; cab.extensions = { KHR_lights_punctual: { lights: luces } }; }
    const cabB = enc.encode(JSON.stringify(cab).slice(1, -1));

    /* ── datos binarios: atributos e índices de cada geometría ── */
    const attrs: { clase: number; comp: number; cuenta: number; off: number; arr: Float32Array }[] = [];
    const geoRec: { a0: number; na: number; ti: number; ni: number; oi: number; arr: Uint16Array | Uint32Array | null }[] = [];
    let lenDatos = 0;
    for (const g of listaGeos) {
      const a0 = attrs.length;
      for (const k of ['position', 'normal', 'uv', 'color']) {
        const a = g.attributes[k]; if (!a) continue;
        const arr = a.array.length === a.count * a.itemSize ? a.array : a.array.subarray(0, a.count * a.itemSize);
        attrs.push({ clase: ATTRS[k], comp: a.itemSize, cuenta: a.count, off: lenDatos, arr }); lenDatos += arr.byteLength;
      }
      let ti = 0, ni = 0, oi = 0, arr: Uint16Array | Uint32Array | null = null;
      if (g.index) {
        arr = g.index.array instanceof Uint8Array ? Uint16Array.from(g.index.array) : g.index.array; ti = arr instanceof Uint16Array ? 1 : 2; ni = g.index.count;
        if (arr.length !== ni) arr = arr.subarray(0, ni);
        oi = lenDatos; lenDatos += arr.byteLength; lenDatos = (lenDatos + 3) & ~3;
      }
      geoRec.push({ a0, na: attrs.length - a0, ti, ni, oi, arr });
    }

    /* ── paquete ── */
    const al = (n: number, a: number) => (n + a - 1) & ~(a - 1);
    const N = nodos.length;
    let tam = 28 + al(cabB.length, 4); tam += N * 24; tam = al(tam, 8); const offMat = tam; tam += N * 128;
    tam += 4; const offTxt = tam; tam += al(lenTxt, 4);
    tam += listaMallas.length * 16 + geoRec.length * 20 + attrs.length * 16 + 4; const offDatos = tam; tam += lenDatos;
    const buf = new ArrayBuffer(tam), dv = new DataView(buf), u8 = new Uint8Array(buf);
    let p = 0; const u = (v: number): void => { dv.setUint32(p, v >>> 0, true); p += 4; };
    for (const v of [MAGIA, VERSION, N, listaMallas.length, geoRec.length, attrs.length, cabB.length]) u(v);
    u8.set(cabB, p); p = al(p + cabB.length, 4);
    const conMatriz: boolean[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const o = nodos[i]; if (o.matrixAutoUpdate) o.updateMatrix();
      conMatriz[i] = !esIdentidad(o.matrix.elements);
      u(padres[i]); u(mallaDe[i]); u(luzDe[i]); u(conMatriz[i] ? 1 : 0); u(txtNodo[i][0]); u(txtNodo[i][1]);
    }
    p = offMat; const f64 = new Float64Array(buf, offMat, N * 16);
    for (let i = 0; i < N; i++) if (conMatriz[i]) f64.set(nodos[i].matrix.elements, i * 16);
    p = offTxt - 4; u(lenTxt); let q = offTxt; for (const b of trozos) { u8.set(b, q); q += b.length; } p = offTxt + al(lenTxt, 4);
    listaMallas.forEach((m, i) => { u(m.geo); u(m.mat); u(txtMalla[i][0]); u(txtMalla[i][1]); });
    for (const g of geoRec) { u(g.a0); u(g.na); u(g.ti); u(g.ni); u(g.oi); }
    for (const a of attrs) { u(a.clase); u(a.comp); u(a.cuenta); u(a.off); }
    u(lenDatos);
    if (p !== offDatos) throw new Error('paquete OOGB mal medido');
    for (const a of attrs) u8.set(new Uint8Array(a.arr.buffer, a.arr.byteOffset, a.arr.byteLength), offDatos + a.off);
    for (const g of geoRec) if (g.arr) u8.set(new Uint8Array(g.arr.buffer, g.arr.byteOffset, g.arr.byteLength), offDatos + g.oi);

    const glb = OOMotor.glb(u8);
    if (!glb) { ultimoMotivo = 'el motor rechazó el paquete'; return null; }
    return glb.buffer.byteLength === glb.byteLength ? glb.buffer as ArrayBuffer : glb.slice().buffer as ArrayBuffer;
  }

  window.OOGlbMotor = { exportar, motivo: () => ultimoMotivo };
})();
