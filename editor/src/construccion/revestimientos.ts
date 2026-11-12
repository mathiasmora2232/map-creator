/* Editor del mapa (2.1, Map Editor Pro fase 3): cerramientos y revestimientos.
   - Paredes (`muro`): zócalo (`zocalo` alto en m, `colorZocalo`, `zocaloCaras` 'ambas' | 'A' | 'B') y revestimiento por cara
     (`revA`, `revB` = {material, color, alto}; la cara A es la +Z local de la pared, la B la −Z). Respetan los huecos de puertas y
     ventanas (se cortan con la misma función `tramos` que la pared) y van pegados a la cara, sin cambiar el grosor de la pared.
   - Objeto `baranda`: baranda o pretil lineal (x, y, z centro de la base, giroY, sx largo, sy alto, estilo 'tubos' | 'barrotes' |
     'vidrio' | 'reja' | 'pretil', color). Se dibuja con dos clics (Construir → «Baranda» / «Pretil») y se ancla a lo que tenga debajo.
   Inspector: sección «Revestimientos» en las paredes y «Baranda» en las barandas. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, r3 = A.r3, tb = A.tipoBase, MAT = A.MATERIALES, B = OO.B;
  A.ICON.baranda = '<path d="M3 8h18M3 8v12M9 8v12M15 8v12M21 8v12M3 14h18"/>';
  const MATS_REV = ['pintura', 'ladrillo', 'baldosa', 'madera', 'bloque', 'concreto', 'chapa', 'metal'].filter((m?) => MAT[m]);
  const colorMat = (m?) => (MAT[m] || {}).c || '#cccccc';

  /* ---------- paredes: zócalo y revestimiento por cara ---------- */
  function muro(e?, parts?, o?) {
    const z = +e.zocalo || 0; if (!(z > 0) && !(e.revA && e.revA.material) && !(e.revB && e.revB.material)) return parts;
    if (+e.curva) return parts;
    const L = +e.sx || 0, ext = (o && o.ext) || [0, 0], x0 = -L / 2 - ext[0], x1 = L / 2 + ext[1], H = +e.sy || 2.6, G = +e.sz || 0.2, hs = (o && o.huecos) || [];
    const out = parts.slice();
    const cara = (lado?, alto?, col?, t?) => { for (const p of OO.tramos(x0, x1, 0, Math.min(H, alto), t, hs, col, false)) { p.p[2] = lado * (G / 2 + t / 2 + 0.001); out.push(p); } };
    for (const [k, lado] of [['revA', 1], ['revB', -1]]) { const r = e[k]; if (!r || !r.material) continue; cara(lado, +r.alto > 0 ? +r.alto : H, r.color || colorMat(r.material), 0.012); }
    if (z > 0) { const c = e.zocaloCaras || 'ambas'; for (const lado of [1, -1]) if (c === 'ambas' || (c === 'A' && lado > 0) || (c === 'B' && lado < 0)) cara(lado, z, e.colorZocalo || '#4a4440', 0.025); }
    return out;
  }

  /* ---------- barandas y pretiles ---------- */
  const ESTILOS = [['tubos', 'Baranda de tubos'], ['barrotes', 'Baranda de barrotes'], ['vidrio', 'Baranda de vidrio'], ['reja', 'Reja alta'], ['pretil', 'Pretil (muro bajo con albardilla)']];
  const DEF = { tubos: { sy: 1.0, sz: 0.06, color: '#4a4f55' }, barrotes: { sy: 1.0, sz: 0.06, color: '#2f3337' }, vidrio: { sy: 1.0, sz: 0.06, color: '#9aa1a8' }, reja: { sy: 1.8, sz: 0.06, color: '#2f3337' }, pretil: { sy: 1.0, sz: 0.2, color: '#d9d4c8' } };
  function baranda(e?, col?) {
    const est = DEF[e.estilo] ? e.estilo : 'tubos', L = Math.max(0.2, +e.sx || 2), H = Math.max(0.2, +e.sy || DEF[est].sy), c = e.color || DEF[est].color, out = [];
    if (est === 'pretil') { const G = Math.max(0.1, +e.sz || 0.2); out.push(B(0, (H - 0.05) / 2, 0, L, H - 0.05, G, c), B(0, H - 0.025, 0, L + 0.04, 0.05, G + 0.06, OO.oscuro ? OO.oscuro(c, 0.85) : c)); return out; }
    const n = Math.max(1, Math.ceil(L / 1.5));
    for (let k = 0; k <= n; k++) out.push(B(-L / 2 + 0.025 + k * (L - 0.05) / n, H / 2, 0, 0.05, H, 0.05, c));
    out.push(B(0, H - 0.03, 0, L, 0.06, 0.06, c));
    if (est === 'tubos') { out.push(B(0, H * 0.55, 0, L, 0.03, 0.03, c), B(0, H * 0.15, 0, L, 0.03, 0.03, c)); }
    if (est === 'barrotes' || est === 'reja') { out.push(B(0, 0.08, 0, L, 0.04, 0.04, c)); const m = Math.min(300, Math.floor(L / 0.12)); for (let k = 1; k < m; k++) out.push(B(-L / 2 + k * L / m, H / 2, 0, 0.02, H - 0.1, 0.02, c)); if (est === 'reja') for (let k = 1; k < m; k += 2) out.push({ f: 'c', p: [-L / 2 + k * L / m, H + 0.04, 0], s: [0.035, 0.08, 0.035], c }); }
    if (est === 'vidrio') out.push(B(0, H * 0.5, 0, L - 0.1, H - 0.14, 0.015, '#9fd0ee', { t: true }));
    return out;
  }
  function crearBaranda(a?, b?, opts?) {
    opts = opts || {}; const est = DEF[opts.estilo] ? opts.estilo : (P.estilo || 'tubos'); const dm = A.datosMuro(new V3(a[0], a[2] || 0, a[1]), new V3(b[0], a[2] || 0, b[1]));
    const d = { x: dm.x, y: dm.y, z: dm.z, giroY: dm.giroY, sx: dm.sx, sy: +opts.sy || DEF[est].sy, sz: DEF[est].sz, estilo: est, color: opts.color || DEF[est].color };
    return A.crearNuevo('baranda', d, { props: { nombre: est === 'pretil' ? 'Pretil' : 'Baranda' } }, { etiqueta: est === 'pretil' ? 'Crear pretil' : 'Crear baranda' });
  }
  const P = { estilo: 'tubos' }; A.params.baranda = P;
  let a0 = null;
  E.agregarHerramientaPropia('baranda', {
    n: 'Baranda', ic: 'baranda', pista: 'Clic en el inicio y clic en el final (Esc para terminar). Se apoya en lo que tenga debajo (plataforma, losa, piso).',
    opciones: (it?) => { if (it.estilo) P.estilo = it.estilo; a0 = null; },
    move: (e?) => { const inf = A.inferir(e, a0); if (!a0 || !inf) return; const dm = A.datosMuro(a0, inf.p); A.mostrarPrevia('baranda', { x: dm.x, y: a0.y, z: dm.z, giroY: dm.giroY, sx: dm.sx, sy: DEF[P.estilo].sy, sz: DEF[P.estilo].sz, estilo: P.estilo }); A.etqVivas = [{ p: new V3(dm.x, a0.y + 1.3, dm.z), t: A.fmt(dm.sx) + ' m', c: 'vivo' }]; },
    up: (e?, mov?) => {
      if (mov > 6) return; const inf = A.inferir(e, a0); if (!inf) return;
      if (!a0) { a0 = inf.p.clone(); A.punto3D(a0); return; }
      const b = inf.p.clone(); if (b.distanceTo(a0) < 0.2) return; const id = crearBaranda([a0.x, a0.z, a0.y], [b.x, b.z], { estilo: P.estilo }); a0 = b; A.punto3D(b); A.limpiarPrevia(); A.etqVivas = []; void id;
    },
    fin: () => { a0 = null; A.limpiarPrevia(); A.etqVivas = []; },
    panel: () => `<div class="campos"><label class="campo ancho"><span>Estilo</span><select data-bp="estilo">${ESTILOS.map(([k, n]) => `<option value="${k}"${P.estilo === k ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label></div>`
  });
  E.agregarHerramienta('construir', { h: 'baranda', estilo: 'tubos', n: 'Baranda', ic: 'baranda' });
  E.agregarHerramienta('construir', { h: 'baranda', estilo: 'pretil', n: 'Pretil', ic: 'baranda' });

  /* ---------- inspector ---------- */
  const sel1 = (t?) => { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = E.nuevos().get(A.sel[0].slice(1)); return o && tb(o.tipo) === t ? o : null; };
  function cambiar(id?, f?, etiqueta?) { const o = E.nuevos().get(id); if (!o) return false; const v = o.datos; o.datos = A.clon(v); f(o.datos); const doc = A.docActualizado(o); o.datos = v; if (!doc) return false; A.guardar([doc], { etiqueta: etiqueta || 'Cambiar revestimiento' }); return true; }
  const opcMat = (k?, v?) => `<select data-rv="${k}.material"><option value="">Sin revestimiento</option>${MATS_REV.map((m?) => `<option value="${m}"${v === m ? ' selected' : ''}>${A.esc(MAT[m].n)}</option>`).join('')}</select>`;
  E.on('panel', () => {
    const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return; const w = sel1('muro'), b = sel1('baranda'); if (!w && !b) return;
    const div = document.createElement('div');
    if (w) {
      const d = w.datos, ra = d.revA || {}, rb = d.revB || {};
      div.innerHTML = `<details class="sec" data-sec="revestimientos"${d.zocalo || ra.material || rb.material ? ' open' : ''}><summary>Revestimientos</summary><div class="campos">
        <label class="campo"><span>Zócalo (m)</span><input type="number" step="0.05" min="0" data-rv="zocalo" value="${r3(+d.zocalo || 0)}"></label><label class="campo"><span>Color del zócalo</span><input type="color" data-rv="colorZocalo" value="${A.esc(d.colorZocalo || '#4a4440')}"></label>
        <label class="campo"><span>Zócalo en</span><select data-rv="zocaloCaras"><option value="ambas"${(d.zocaloCaras || 'ambas') === 'ambas' ? ' selected' : ''}>Las dos caras</option><option value="A"${d.zocaloCaras === 'A' ? ' selected' : ''}>Cara A</option><option value="B"${d.zocaloCaras === 'B' ? ' selected' : ''}>Cara B</option></select></label>
        ${[['revA', 'Cara A', ra], ['revB', 'Cara B', rb]].map(([k, n, r]) => `<label class="campo"><span>${n}</span>${opcMat(k, r.material)}</label><label class="campo"><span>Color ${n.toLowerCase()}</span><input type="color" data-rv="${k}.color" value="${A.esc(r.color || colorMat(r.material || 'pintura'))}"></label><label class="campo"><span>Alto ${n.toLowerCase()} (m, 0 = toda)</span><input type="number" step="0.1" min="0" data-rv="${k}.alto" value="${r3(+r.alto || 0)}"></label>`).join('')}
        <p class="ayuda">La cara A es la del lado +Z de la pared (la que mira a su izquierda yendo del inicio al final). Los revestimientos se cortan en las puertas y ventanas.</p></div></details>`;
    } else {
      const d = b.datos; div.innerHTML = `<details class="sec" open data-sec="baranda"><summary>${d.estilo === 'pretil' ? 'Pretil' : 'Baranda'}</summary><div class="campos"><label class="campo ancho"><span>Estilo</span><select data-bi="estilo">${ESTILOS.map(([k, n]) => `<option value="${k}"${d.estilo === k ? ' selected' : ''}>${A.esc(n)}</option>`).join('')}</select></label><label class="campo"><span>Color</span><input type="color" data-bi="color" value="${A.esc(d.color || '#4a4f55')}"></label></div></details>`;
    }
    const ref = c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
  });
  /* revestir: k = 'zocalo' | 'colorZocalo' | 'zocaloCaras' | 'revA.material' | 'revB.color'… */
  function revestir(id?, k?, v?) {
    return cambiar(id, (d?) => {
      const [a, b] = k.split('.');
      if (!b) { if (a === 'zocalo') { v = Math.max(0, +v || 0); if (v > 0) d.zocalo = r3(v); else delete d.zocalo; } else d[a] = v; return; }
      const r = Object.assign({}, d[a] || {}); if (b === 'material') { if (!v) { delete d[a]; return; } r.material = v; if (!r.color || !d[a] || d[a].material !== v) r.color = colorMat(v); } else if (b === 'alto') r.alto = r3(Math.max(0, +v || 0)); else r[b] = v;
      if (r.material) d[a] = r;
    }, k.startsWith('zocalo') || k === 'colorZocalo' ? 'Zócalo' : 'Revestir cara ' + (k[3] || ''));
  }
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.bp) { P[el.dataset.bp] = el.value; return; }
    if (el.dataset.rv) { const w = sel1('muro'); if (w) revestir(w.id, el.dataset.rv, el.type === 'number' ? parseFloat(el.value) : el.value); return; }
    if (el.dataset.bi) { const b = sel1('baranda'); if (!b) return; const k = el.dataset.bi, v = el.value; cambiar(b.id, (d?) => { d[k] = v; if (k === 'estilo' && DEF[v]) { d.sy = DEF[v].sy; d.sz = DEF[v].sz; d.color = DEF[v].color; } }, 'Cambiar baranda'); }
  });

  window.OORevestimientos = { muro, baranda, crearBaranda, revestir, ESTILOS, DEF };
})();
