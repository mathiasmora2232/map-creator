/* Editor del mapa (2.1, Map Editor Pro fase 1): entidades con esquema versionado e identificadores estables.
   - Cada objeto nuevo es un documento de la colección «cambios» (formato en LEEME.md). Desde el esquema 2 el documento lleva `esquema: 2`
     y sus `datos` pueden llevar `soporte` (anclaje, ver anclajes.js) y `nivel` (reservado para los edificios de varias plantas, fase 3).
   - migrar(doc): lee un documento viejo (sin `esquema`, es decir v1) como v2 sin reescribirlo en disco. Lo único que deduce es el anclaje
     implícito de las puertas, ventanas y huecos a su pared (`datos.muro` con el id de una pared nueva → `soporte: {tipo: 'pared', id}`).
     El documento solo se guarda como v2 cuando se vuelve a editar.
   - uid(clave): identificador estable. Los objetos nuevos ya tienen uno (`n-<mapa>-…`); las piezas del mapa original se identifican por
     un hash de su sección, grupo, nombre, tipo y medidas/posición originales (no por su índice, que cambia si se regenera el mapa).
   - entidad(clave): vista normalizada de cualquier objeto (uid, tipo, nombre, transformación, medidas, material, soporte, padre, nivel,
     parámetros y datos de exportación) para el inspector, los exportadores y las fases siguientes.
   Se carga ANTES que editor.js: migrar() tiene que estar listo cuando llegan los cambios. */
(function () {
  'use strict';
  const ESQUEMA = 2;
  const TIPOS_SOPORTE = ['terreno', 'piso', 'fundacion', 'pared', 'techo', 'libre'];
  const ESTRUCTURA = ['muro', 'habitacion', 'techo', 'fundacion', 'puerta', 'ventana', 'hueco', 'edificio', 'calle'];
  const ABERTURAS = ['puerta', 'ventana', 'hueco'];
  const tipoBase = t => { t = String(t || ''); const i = t.indexOf(':'); return i < 0 ? t : t.slice(0, i); };
  const num = (v, d) => { v = +v; return isFinite(v) ? v : d; };

  /* soporte válido o null: {tipo, id?, rel?: {x, y, z, g}, auto?, manual?} */
  function normSoporte(s) {
    if (!s || typeof s !== 'object' || !TIPOS_SOPORTE.includes(s.tipo)) return null;
    const o = { tipo: s.tipo };
    if (s.tipo !== 'libre' && s.tipo !== 'terreno') { if (s.id == null || s.id === '') return null; o.id = String(s.id); }
    if (s.rel && typeof s.rel === 'object') o.rel = { x: num(s.rel.x, 0), y: num(s.rel.y, 0), z: num(s.rel.z, 0), g: num(s.rel.g, 0) };
    if (s.auto) o.auto = true; if (s.manual) o.manual = true;
    return o;
  }
  function migrar(d) {
    if (!d || typeof d !== 'object' || (+d.esquema || 1) >= ESQUEMA) return d;
    const c = Object.assign({}, d, { esquema: ESQUEMA });
    if (d.accion === 'agregar' && d.datos && typeof d.datos === 'object') {
      const x = Object.assign({}, d.datos), b = tipoBase(d.tipo);
      if (x.soporte != null) { const s = normSoporte(x.soporte); if (s) x.soporte = s; else delete x.soporte; }
      else if (ABERTURAS.includes(b) && typeof x.muro === 'string') x.soporte = { tipo: 'pared', id: x.muro };
      c.datos = x;
    }
    return c;
  }
  /* FNV-1a de 32 bits en base 36 */
  function hash(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

  const OOEnt = { ESQUEMA, TIPOS_SOPORTE, ESTRUCTURA, ABERTURAS, tipoBase, normSoporte, migrar, hash };
  window.OOEntidades = OOEnt;

  window.addEventListener('oo-editor-listo', () => {
    const E = window.OOEditor, A = E && E.api; if (!A) return;
    let cacheUid = null, cacheD = null;
    function uidPieza(i) {
      const z = A.P[i], D = A.D; if (!z || !D) return null; const b = z.b;
      const r = v => Math.round(v * 100);
      return 'o:' + hash([D.secciones[z.sec] || '', z.grp >= 0 ? D.grupos[z.grp] : '', z.nom || '', z.t, r(b.p.x), r(b.p.y), r(b.p.z), r(b.s.x), r(b.s.y), r(b.s.z)].join('|'));
    }
    function uid(k) { if (!k) return null; if (k[0] === 'n') return k.slice(1); if (k[0] === 'p') return uidPieza(+k.slice(1)); return null; }
    /* uid → clave ('p123' o 'n…'); las piezas con el mismo hash (piezas idénticas superpuestas) se distinguen con #2, #3… */
    function buscar(u) {
      if (!u) return null; if (u[0] === 'n' && E.nuevos().has(u)) return 'n' + u;
      if (cacheD !== A.D || !cacheUid) {
        cacheD = A.D; cacheUid = new Map(); const vistos = new Map();
        for (let i = 0; i < A.N; i++) { let h = uidPieza(i); const n = (vistos.get(h) || 0) + 1; vistos.set(h, n); if (n > 1) h += '#' + n; cacheUid.set(h, 'p' + i); }
      }
      return cacheUid.get(u) || null;
    }
    function entidad(k) {
      if (!k) return null;
      if (k[0] === 'n') {
        const o = E.nuevos().get(k.slice(1)); if (!o) return null; const d = o.datos || {}, pr = o.props || {}, b = tipoBase(o.tipo);
        const params = {}; for (const c in d) if (!['x', 'y', 'z', 'giroY', 'incX', 'incZ', 'sx', 'sy', 'sz', 'soporte', 'nivel', 'origen', 'color', 'material'].includes(c)) params[c] = d[c];
        return {
          esquema: ESQUEMA, uid: o.id, clave: k, origen: 'nuevo', tipo: o.tipo, base: b, estructura: ESTRUCTURA.includes(b),
          nombre: pr.nombre || d.nombre || A.nombreTipo(o.tipo), capa: A.capaDeNuevo(o), nivel: d.nivel || null,
          transform: { posicion: [num(d.x, 0), num(d.y, 0), num(d.z, 0)], giroY: num(d.giroY, 0), incX: num(d.incX, 0), incZ: num(d.incZ, 0), origen: d.origen || 'base' },
          medidas: { sx: num(d.sx, null), sy: num(d.sy, null), sz: num(d.sz, null) }, material: pr.material || d.material || null, color: d.color || null,
          soporte: normSoporte(d.soporte), padre: (A.grupoDe('n' + o.id)) || null, params, exportar: { coleccion: 'cambios', doc: o.docId, colision: pr.colision !== false }
        };
      }
      if (k[0] === 'p') {
        const i = +k.slice(1), z = A.P[i], D = A.D; if (!z) return null;
        const eu = new A.THREE.Euler().setFromQuaternion(z.q, 'YXZ');
        return {
          esquema: ESQUEMA, uid: uidPieza(i), clave: k, origen: 'mapa', ref: i, tipo: 'pieza', base: 'pieza', estructura: false, nombre: A.nombreEntidades([k]),
          seccion: D.secciones[z.sec] || null, grupo: z.grp >= 0 ? D.grupos[z.grp] : null, nivel: null,
          transform: { posicion: z.p.toArray(), giroY: eu.y / A.DEG, incX: eu.x / A.DEG, incZ: eu.z / A.DEG, origen: 'centro' },
          medidas: { sx: z.s.x, sy: z.s.y, sz: z.s.z }, material: z.material || null, color: '#' + z.c.getHexString(), soporte: null, padre: A.grupoDe(k) || null,
          params: {}, exportar: { coleccion: 'mapa', ref: i, colision: !!(z.fl & 1) }
        };
      }
      return null;
    }
    Object.assign(OOEnt, { uid, uidPieza, buscar, entidad });
    A.entidad = entidad; A.uid = uid;
  });
})();
