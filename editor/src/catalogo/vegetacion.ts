/* Editor del mapa (2.1 pro f6): vegetación pintada como UN objeto con muchas plantas (tipo «vegetacion»). Antes cada planta del pincel
   era un documento y un objeto suelto: con miles de plantas el historial, el guardado, la lista de cambios y la exportación cargaban
   con miles de entradas. Ahora un trazo del pincel es un documento con `datos.plantas = [{t: tipo, d: datos}]` (posición relativa al
   origen del objeto); sus piezas salen ya en las mallas instanciadas del editor y se exportan como un solo grupo (GLB, Godot, Unity).
   Se carga antes que editor.js porque envuelve OO.construir (como prefabs_proc.js). terreno_pro.js usa OOVegetacion para pintar y
   borrar plantas dentro de estos grupos. */
(function () {
  'use strict';
  const OO = window.OO, T = window.THREE; if (!OO || !OO.construir || !T) return;
  const base = OO.construir;
  const _q = new T.Quaternion(), _qp = new T.Quaternion(), _v = new T.Vector3(), _e = new T.Euler(), _m = new T.Matrix4(), _s = new T.Vector3(1, 1, 1);
  const cache = new Map<any, any>(); /* las piezas de cada planta (tipo + datos) no cambian: se reutilizan entre reconstrucciones */
  function piezasPlanta(p?) {
    const clave = p.t + '|' + JSON.stringify(Object.assign({}, p.d, { x: 0, y: 0, z: 0, giroY: 0 }));
    let ps = cache.get(clave);
    if (!ps) { try { ps = base({ tipo: p.t, datos: Object.assign({}, p.d, { x: 0, y: 0, z: 0, giroY: 0 }) }) || []; } catch (e) { ps = []; } if (cache.size > 4000) cache.clear(); cache.set(clave, ps); }
    return ps;
  }
  function construirVeg(e?) {
    const out = [];
    for (const p of Array.isArray(e.plantas) ? e.plantas : []) {
      if (!p || !p.t || !p.d) continue;
      const d = p.d, g = (+d.giroY || 0) * Math.PI / 180;
      _qp.setFromAxisAngle(_v.set(0, 1, 0), g);
      const t = [+d.x || 0, +d.y || 0, +d.z || 0];
      for (const pt of piezasPlanta(p)) {
        if (pt.f === 'poly') { const lm = Array.isArray(pt.lm) && pt.lm.length === 16 ? new T.Matrix4().fromArray(pt.lm) : new T.Matrix4(); _m.compose(_v.set(t[0], t[1], t[2]), _qp, _s); out.push(Object.assign({}, pt, { lm: _m.clone().multiply(lm).toArray() })); continue; }
        if (!Array.isArray(pt.p)) continue;
        if (pt.q) _q.fromArray(pt.q).normalize(); else if (pt.r) _q.setFromEuler(_e.set(pt.r[0], pt.r[1], pt.r[2])); else _q.set(0, 0, 0, 1);
        _q.premultiply(_qp); _v.fromArray(pt.p).applyQuaternion(_qp);
        const n = Object.assign({}, pt, { p: [_v.x + t[0], _v.y + t[1], _v.z + t[2]], q: [_q.x, _q.y, _q.z, _q.w] }); delete n.r;
        out.push(n);
      }
    }
    return out.length ? out : [OO.B(0, 0.05, 0, 0.3, 0.1, 0.3, '#4f7a3a')];
  }
  OO.construir = function (o?) { if (o && o.tipo === 'vegetacion') return construirVeg((o && o.datos) || {}); return base(o); };
  /* caja que envuelve las plantas (para elegir el objeto y el inspector) */
  function caja(plantas?) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = 0;
    for (const p of plantas) { const d = p.d, r = Math.max(+d.sx || 1, +d.sz || 1) / 2; x0 = Math.min(x0, d.x - r); x1 = Math.max(x1, d.x + r); z0 = Math.min(z0, d.z - r); z1 = Math.max(z1, d.z + r); y1 = Math.max(y1, (+d.y || 0) + (+d.sy || 3)); }
    return { sx: Math.max(0.3, x1 - x0), sy: Math.max(0.3, y1), sz: Math.max(0.3, z1 - z0) };
  }
  window.OOVegetacion = { construir: construirVeg, caja, piezasPlanta };
})();
