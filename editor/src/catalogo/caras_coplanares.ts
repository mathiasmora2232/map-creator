/* Editor del mapa: desempate de caras coplanares (evita el parpadeo, «z-fighting»).
   Muchos objetos del catálogo están hechos de cajas que comparten caras en el mismo plano mirando hacia el mismo lado (una franja
   pegada a un lateral, una tapa del mismo tamaño que la caja…). La tarjeta gráfica no sabe cuál dibujar delante y la superficie
   parpadea o sale con rayas. Aquí, al construir las piezas, la caja más pequeña de cada pareja sobresale 2 mm por esa cara: los detalles
   siguen viéndose y ya no se pelean. Solo cajas sin girar; la estructura (paredes, pisos, techos, escaleras…) queda con sus medidas
   exactas. Envuelve OO.construir (se carga después de los demás envoltorios y antes de editor.js). */
(function () {
  'use strict';
  const OO = window.OO; if (!OO || !OO.construir) return;
  const EXACTA = new Set<any>(['muro', 'habitacion', 'techo', 'fundacion', 'escalera', 'rampa', 'puerta', 'ventana', 'hueco', 'calle', 'edificio', 'nota', 'luz', 'texto', 'terreno']);
  const E = 0.002, PLANO = 2e-4, AREA = 2e-4;
  const recta = (p?) => p && p.f === 'b' && Array.isArray(p.p) && Array.isArray(p.s) && !(p.r && (p.r[0] || p.r[1] || p.r[2])) && !(p.q && Math.abs(p.q[0]) + Math.abs(p.q[1]) + Math.abs(p.q[2]) > 1e-6);
  function desempatar(ps?) {
    const bs = []; for (let i = 0; i < ps.length; i++) if (recta(ps[i])) bs.push(i);
    if (bs.length < 2 || bs.length > 600) return ps;
    const out = ps.slice(), vol = (p?) => p.s[0] * p.s[1] * p.s[2];
    const copia = (i?) => { if (out[i] === ps[i]) out[i] = Object.assign({}, ps[i], { p: ps[i].p.slice(), s: ps[i].s.slice() }); return out[i]; };
    for (let x = 0; x < bs.length; x++) for (let y = x + 1; y < bs.length; y++) {
      const A = out[bs[x]], B = out[bs[y]];
      for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
        if (Math.abs(A.p[a] + sg * A.s[a] / 2 - (B.p[a] + sg * B.s[a] / 2)) > PLANO) continue;
        let area = 1; for (let k = 0; k < 3; k++) { if (k === a) continue; area *= Math.max(0, Math.min(A.p[k] + A.s[k] / 2, B.p[k] + B.s[k] / 2) - Math.max(A.p[k] - A.s[k] / 2, B.p[k] - B.s[k] / 2)); }
        if (area <= AREA) continue;
        const i = vol(A) <= vol(B) ? bs[x] : bs[y], p = copia(i); /* la más pequeña sobresale */
        p.s[a] += E; p.p[a] += sg * E / 2;
      }
    }
    return out;
  }
  const base = OO.construir;
  OO.construir = function (o?) {
    const ps = base(o); const t = String((o && o.tipo) || ''), b = t.split(':')[0];
    if (!Array.isArray(ps) || EXACTA.has(b)) return ps;
    try { return desempatar(ps); } catch (e) { return ps; }
  };
  window.OOCaras = { desempatar };
})();
