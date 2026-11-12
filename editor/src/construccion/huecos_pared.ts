/* Editor del mapa: hueco libre en pared. Arrastra un rectángulo sobre la cara de una pared nueva y el hueco toma ese ancho, ese alto
   y esa altura desde el suelo (sin tamaño fijo). Un clic sin arrastrar pone uno del tamaño del panel. Crea el mismo objeto `hueco` que
   «Hueco en pared» (vano sin marco, se pega a su pared, se exporta igual), así que después se mueve y se cambia en el inspector.
   Para las paredes del mapa original sigue «Hueco en pared» (tecla O). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase;
  A.ICON.hueco_libre = '<rect x="3" y="4" width="18" height="16" rx="1"/><rect x="8" y="8" width="7" height="8" stroke-dasharray="2 1.5"/><path d="M15 16l3 3"/>';
  const PH = { ancho: 1.0, alto: 1.2, alfeizar: 0.9 };
  A.params.hueco_libre = PH;

  /* pared nueva bajo el ratón y su marco: centro, eje u (a lo largo), normal de la cara clicada */
  function paredBajo(e?) {
    const h = A.pickEvento(e, { soloCajas: true }); if (!h || !h.key || h.key[0] !== 'n') return null;
    let o = E.nuevos().get(h.key.slice(1)); if (!o) return null;
    if (tb(o.tipo) === 'hueco' && o.datos.muro != null) o = E.nuevos().get(String(o.datos.muro)) || o; /* clic dentro de otro hueco */
    if (tb(o.tipo) !== 'muro') return null;
    const d = o.datos, g = (+d.giroY || 0) * DEG, u = new V3(Math.cos(g), 0, -Math.sin(g));
    let n = h.normal.clone(); n.y = 0; if (n.lengthSq() < 1e-6) return null; n.normalize();
    if (Math.abs(n.dot(u)) > 0.7) return null; /* cara del extremo: no */
    const nn = new V3(-u.z, 0, u.x); if (nn.dot(n) < 0) nn.negate();
    return { o, d, u, n: nn, c: new V3(+d.x || 0, +d.y || 0, +d.z || 0), L: +d.sx || 1, base: +d.y || 0, alto: +d.sy || 2.6, grosor: +d.sz || 0.15 };
  }
  /* punto del ratón sobre el plano de la pared → [u, altura] */
  function enPared(e?, P?) {
    const ray = A.rayDe(e).ray, pl = new T.Plane().setFromNormalAndCoplanarPoint(P.n, P.c), p = new V3();
    if (!ray.intersectPlane(pl, p)) return null;
    return [p.clone().sub(P.c).dot(P.u), p.y];
  }
  function datosHueco(P?, u0?, u1?, v0?, v1?) {
    const L = P.L, lo = -L / 2 + 0.05, hi = L / 2 - 0.05;
    let a = Math.max(lo, Math.min(u0, u1)), b = Math.min(hi, Math.max(u0, u1));
    let y0 = Math.max(P.base, Math.min(v0, v1)), y1 = Math.min(P.base + P.alto, Math.max(v0, v1));
    if (A.AJ.ajuste) { const s = Math.min(0.1, A.AJ.paso || 0.25); a = Math.round(a / s) * s; b = Math.round(b / s) * s; y0 = Math.round((y0 - P.base) / s) * s + P.base; y1 = Math.round((y1 - P.base) / s) * s + P.base; }
    if (b - a < 0.1 || y1 - y0 < 0.1) return null;
    const uc = (a + b) / 2, c = P.c.clone().addScaledVector(P.u, uc);
    return { x: r3(c.x), y: r3(P.base), z: r3(c.z), giroY: r3(Math.atan2(P.n.x, P.n.z) / DEG), sx: r3(b - a), sy: r3(y1 - y0), sz: r3(P.grosor), alfeizar: r3(y0 - P.base), muro: P.o.id, muro_alto: r3(P.alto) };
  }
  function porDefecto(P?, uv?) {
    const al = Math.min(PH.alfeizar, Math.max(0, P.alto - 0.2)), alto = Math.min(PH.alto, P.alto - al);
    return datosHueco(P, uv[0] - PH.ancho / 2, uv[0] + PH.ancho / 2, P.base + al, P.base + al + alto);
  }
  const etiqueta = (d?) => ({ p: new V3(d.x, d.y + d.alfeizar + d.sy + 0.35, d.z), t: A.fmt(d.sx) + ' × ' + A.fmt(d.sy) + ' m · a ' + A.fmt(d.alfeizar) + ' m del suelo' });

  let est = null;
  E.agregarHerramientaPropia('hueco_libre', {
    n: 'Hueco libre en pared', ic: 'hueco_libre',
    pista: 'Arrastra un rectángulo sobre la cara de una pared: el hueco toma ese ancho, ese alto y esa altura desde el suelo. Un clic pone uno del tamaño del panel. Para paredes del mapa original usa «Hueco en pared» (O).',
    down: (e?) => { const P = paredBajo(e); if (!P) return; const uv = enPared(e, P); if (uv) est = { P, uv }; },
    move: (e?) => {
      if (!est) { const P = paredBajo(e); const uv = P && enPared(e, P); const d = uv && porDefecto(P, uv); if (d) { A.mostrarPrevia('hueco', d); A.etqVivas = [etiqueta(d)]; } else { A.limpiarPrevia(); A.etqVivas = []; } return; }
      const uv = enPared(e, est.P); if (!uv) return; const d = datosHueco(est.P, est.uv[0], uv[0], est.uv[1], uv[1]);
      if (d) { A.mostrarPrevia('hueco', d); A.etqVivas = [etiqueta(d)]; }
    },
    up: (e?, mov?) => {
      if (!est) { A.pista('Haz clic o arrastra sobre la cara de una pared nueva.'); return; }
      const { P, uv } = est; est = null; const uv2 = enPared(e, P);
      const d = mov > 6 && uv2 ? datosHueco(P, uv[0], uv2[0], uv[1], uv2[1]) : porDefecto(P, uv);
      A.limpiarPrevia(); A.etqVivas = [];
      if (!d) { A.pista('El hueco es demasiado pequeño o queda fuera de la pared.'); return; }
      const id = A.crearNuevo('hueco', d, { props: { nombre: 'Hueco' } }, { etiqueta: 'Hueco libre en pared' }); if (id) A.seleccionar(['n' + id], { sinTab: true });
    },
    fin: () => { est = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => `<div class="campos"><label class="campo"><span>Ancho con un clic (m)</span><input type="number" step="0.05" min="0.1" data-hp="ancho" value="${PH.ancho}"></label>
      <label class="campo"><span>Alto con un clic (m)</span><input type="number" step="0.05" min="0.1" data-hp="alto" value="${PH.alto}"></label>
      <label class="campo"><span>Desde el suelo (m)</span><input type="number" step="0.05" min="0" data-hp="alfeizar" value="${PH.alfeizar}"></label></div>
      <p class="ayuda">Arrastrando no hay tamaño fijo: dibujas el hueco del tamaño que quieras. Con el ajuste a la rejilla activo, las medidas se redondean.</p>`
  });
  E.agregarHerramienta('construir', { h: 'hueco_libre', n: 'Hueco libre en pared' });
  document.addEventListener('change', (e?) => { const el = e.target; if (el && el.dataset && el.dataset.hp) { const v = parseFloat(el.value); if (isFinite(v) && v >= 0) PH[el.dataset.hp] = v; } });
  window.OOHuecosPared = { paredBajo, datosHueco };
})();
