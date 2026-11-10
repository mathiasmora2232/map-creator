/* Editor del mapa (2.1): presets de muro para la herramienta Pared (menú Construir).
   Cada preset fija alto, grosor, material y color de la herramienta y, si dibuja algo más que una caja, sus piezas (datos.preset del muro).
   Cada tramo sigue siendo un objeto «muro» normal: se encadena, va en diagonal, muestra cotas en vivo, se une en las esquinas y las
   puertas, ventanas y huecos le abren vano (también en sus franjas y remates).
   Muro exterior: medidas y colores del perímetro del juego (scripts/mapa_parqueadero.gd, `muro(...)` del perímetro y `_muro_diagonal`,
   y la sección Perimetro de mapa_complejo.json): cuerpo 3,6 × 0,5 m Liso_Ecebe4, zócalo sucio de 0,6 m (#aaa69a), franja azul de 0,48 m
   arriba (#466879), franja verde de 0,1 m con centro a 2,98 m (#83ad93), las tres de 5 cm de grueso en cada cara (a 0,27 m del eje),
   juntas verticales entre paneles cada 2,5 m (#9a9c98, 5 × 3 cm, 2,7 m de alto) y albardilla de concreto de 0,7 × 0,1 m encima. */
(function () {
  'use strict';
  const PRESETS = {
    exterior: { n: 'Muro exterior', sy: 3.6, sz: 0.5, material: 'pintura', color: '#ecebe4', nota: 'Como el perímetro del juego: 3,6 × 0,5 m, zócalo, franjas azul y verde, juntas cada 2,5 m y albardilla.' },
    tabique: { n: 'Tabique de oficina', sy: 2.6, sz: 0.1, material: 'pintura', color: '#e8e6df', nota: 'Tabique liso de 10 cm con zócalo oscuro.' },
    bloque: { n: 'Pared de bloque', sy: 2.8, sz: 0.2, material: 'bloque', color: '#d9d6cf', nota: 'Bloque de 20 cm.' },
    malla: { n: 'Valla de malla', sy: 2.0, sz: 0.06, material: 'metal', color: '#7d848b', nota: 'Postes cada 2,5 m, malla y tubo arriba.' },
    reja: { n: 'Reja', sy: 1.8, sz: 0.06, material: 'metal', color: '#202428', nota: 'Barrotes cada 12 cm, pletinas y postes cada 2,5 m.' }
  };
  const ORDEN = ['', 'exterior', 'tabique', 'bloque', 'malla', 'reja'];

  function aplicar(pr, id) {
    if (!pr) return;
    if (!pr.preset && !pr._normal) pr._normal = { sy: pr.sy, sz: pr.sz, material: pr.material, color: pr.color };
    if (!id || !PRESETS[id]) { if (pr._normal) Object.assign(pr, pr._normal); pr._normal = null; pr.preset = ''; return; }
    if (!pr.preset) pr._normal = { sy: pr.sy, sz: pr.sz, material: pr.material, color: pr.color };
    const p = PRESETS[id]; Object.assign(pr, { sy: p.sy, sz: p.sz, material: p.material, color: p.color, preset: id });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function panel(pr) {
    const act = pr.preset || '';
    let s = '<h3>Tipo de muro</h3><div class="fila"><div class="seg" role="group" aria-label="Tipo de muro" style="flex-wrap:wrap">';
    for (const id of ORDEN) s += `<button data-preset-muro="${id}" class="${act === id ? 'on' : ''}">${esc(id ? PRESETS[id].n : 'Pared simple')}</button>`;
    s += '</div></div>';
    if (act && PRESETS[act]) s += `<p class="ayuda">${esc(PRESETS[act].nota)} Cada tramo es un objeto propio; se encadenan con clics (también en diagonal) y se puede escribir el largo.</p>`;
    return s;
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-preset-muro]'); if (!b || !window.OOEditor || !OOEditor.api) return;
    const A = OOEditor.api; aplicar(A.params.pared, b.dataset.presetMuro); A.renderPanel();
  });

  /* intervalos de [x0, x1] que quedan en la franja de alturas [ya, yb] después de quitar los huecos */
  function libres(x0, x1, ya, yb, huecos) {
    const hs = (huecos || []).filter(h => h.al < yb - 1e-4 && h.al + h.h > ya + 1e-4).map(h => [Math.max(x0, h.u - h.w / 2), Math.min(x1, h.u + h.w / 2)]).filter(h => h[1] > h[0]).sort((a, b) => a[0] - b[0]);
    const out = []; let x = x0;
    for (const [a, b] of hs) { if (a > x + 0.004) out.push([x, a]); x = Math.max(x, b); }
    if (x1 > x + 0.004) out.push([x, x1]);
    return out;
  }
  function dentroHueco(u, ya, yb, huecos, mg) { return (huecos || []).some(h => u > h.u - h.w / 2 - mg && u < h.u + h.w / 2 + mg && h.al < yb && h.al + h.h > ya); }

  function partes(e, x0, x1, huecos, H) {
    const id = e.preset; if (!PRESETS[id]) return null;
    const B = H.B, alto = Math.max(0.3, +e.sy || PRESETS[id].sy), G = Math.max(0.03, +e.sz || PRESETS[id].sz), col = e.color || PRESETS[id].color;
    const out = H.tramos(x0, x1, 0, alto, G, huecos, col, e.material === 'vidrio');
    const banda = (ya, yb, z, gz, c, o) => { for (const [a, b] of libres(x0, x1, ya, yb, huecos)) out.push(B((a + b) / 2, (ya + yb) / 2, z, b - a, yb - ya, gz, c, o)); };
    if (id === 'exterior') {
      const zc = G / 2 + 0.02;
      for (const s of [-1, 1]) {
        banda(0, Math.min(0.6, alto), s * zc, 0.05, '#aaa69a');
        if (alto > 1.2) { banda(alto - 0.48, alto, s * zc, 0.05, '#466879'); banda(alto - 0.67, alto - 0.57, s * zc, 0.05, '#83ad93'); }
      }
      const yj = Math.max(0.3, alto - 0.9);
      for (let k = x0 + 1.25; k < x1 - 0.5; k += 2.5) { if (dentroHueco(k, 0, yj, huecos, 0.05)) continue; for (const s of [-1, 1]) out.push(B(k, yj / 2, s * (G / 2 + 0.01), 0.05, yj, 0.03, '#9a9c98')); }
      banda(alto - 0.002, alto + 0.1, 0, G + 0.2, '#8c9095');
      return out;
    }
    if (id === 'tabique') { for (const s of [-1, 1]) banda(0, 0.1, s * (G / 2 + 0.006), 0.012, '#4a4f55'); return out; }
    if (id === 'bloque') return out;
    if (id === 'malla' || id === 'reja') {
      const metal = col, posts = [];
      const largo = x1 - x0, n = Math.max(1, Math.round(largo / 2.5));
      for (let k = 0; k <= n; k++) posts.push(x0 + largo * k / n);
      const res = [];
      for (const u of posts) if (!dentroHueco(u, 0, alto, huecos, 0.03)) res.push(B(u, alto / 2, 0, 0.06, alto, 0.06, metal));
      if (id === 'malla') {
        for (const [a, b] of libres(x0, x1, 0.05, alto - 0.05, huecos)) res.push(B((a + b) / 2, alto / 2, 0, b - a, alto - 0.1, 0.01, '#9aa3aa', { t: true }));
        for (const [a, b] of libres(x0, x1, alto - 0.05, alto, huecos)) res.push(B((a + b) / 2, alto - 0.025, 0, b - a, 0.04, 0.04, metal));
      } else {
        for (const y of [0.12, alto - 0.08]) for (const [a, b] of libres(x0, x1, y - 0.025, y + 0.025, huecos)) res.push(B((a + b) / 2, y, 0, b - a, 0.05, 0.03, metal));
        for (let u = x0 + 0.12; u < x1 - 0.06; u += 0.12) if (!dentroHueco(u, 0, alto, huecos, 0.01)) res.push(B(u, alto / 2, 0, 0.02, alto - 0.04, 0.02, metal));
      }
      return res;
    }
    return null;
  }

  window.OOPresetsMuro = { PRESETS, aplicar, panel, partes, libres };
})();
