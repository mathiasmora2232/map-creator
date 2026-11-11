/* Editor del mapa: huecos en suelos, losas y techos planos (la herramienta de paredes ya existe: «Hueco en pared»).
   Herramienta Construir → «Hueco en suelo o techo»: arrastra un rectángulo sobre un piso, una losa de planta o un techo plano; o haz
   clic y se abre uno del tamaño del panel (rectangular o redondo). En los techos puede llevar vidrio (claraboya / tragaluz).
   Los huecos van en `datos.agujeros` (polígonos en el marco del objeto), los vidrios en `datos.claraboyas`. Se dibujan, se exportan
   (GLB, Godot, Unity) y se quitan desde el inspector («Huecos»: quitar el último o todos).
   Los techos inclinados (dos aguas, etc.) todavía no admiten huecos: la herramienta lo avisa. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase;
  A.ICON.hueco_losa = '<rect x="3" y="7" width="18" height="10" rx="1"/><rect x="8" y="10" width="8" height="4" stroke-dasharray="2 1.5"/>';
  const PH = { forma: 'rect', ancho: 1.2, largo: 1.2, vidrio: false };
  A.params.hueco_losa = PH;

  const esTechoPlano = o => tb(o.tipo) === 'techo' && (!o.datos.forma || o.datos.forma === 'plano');
  const admite = o => !!o && (tb(o.tipo) === 'habitacion' || esTechoPlano(o));
  function objetoDe(h) { if (!h || !h.key || h.key[0] !== 'n') return null; return E.nuevos().get(h.key.slice(1)) || null; }
  const aLocal = (d, [x, z]) => { const g = (+d.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), dx = x - (+d.x || 0), dz = z - (+d.z || 0); return [r3(dx * c - dz * s), r3(dx * s + dz * c)]; };
  function contorno(cx, cz, a, b, forma) {
    if (forma === 'circulo') { const n = 28, r = Math.max(0.1, a / 2), out = []; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; out.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]); } return out; }
    return [[cx - a / 2, cz - b / 2], [cx + a / 2, cz - b / 2], [cx + a / 2, cz + b / 2], [cx - a / 2, cz + b / 2]];
  }
  function abrir(o, ptsMundo, vidrio) {
    const pts = A.puntosMundoHab(o);
    if (!ptsMundo.every(([x, z]) => A.dentroPoligono(x, z, pts))) { A.pista('El hueco tiene que quedar dentro de la superficie.'); return false; }
    const loc = ptsMundo.map(p => aLocal(o.datos, p)), v = o.datos;
    const nuevo = Object.assign({}, v, { agujeros: (Array.isArray(v.agujeros) ? v.agujeros : []).concat([loc]) });
    if (vidrio && esTechoPlano(o)) nuevo.claraboyas = (Array.isArray(v.claraboyas) ? v.claraboyas : []).concat([loc]);
    o.datos = nuevo; const doc = A.docActualizado(o); o.datos = v; if (!doc) return false;
    A.guardar([doc], { etiqueta: esTechoPlano(o) ? (vidrio ? 'Claraboya en techo' : 'Hueco en techo') : 'Hueco en suelo' });
    return true;
  }

  /* vista previa: contorno rojo a la altura de la superficie */
  const previa = new T.LineLoop(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xff4d4d, depthTest: false, transparent: true }));
  previa.renderOrder = 999; previa.visible = false; previa.frustumCulled = false; if (A.scene) A.scene.add(previa);
  function verPrevia(pts, y) { previa.geometry.dispose(); previa.geometry = new T.BufferGeometry().setFromPoints(pts.map(([x, z]) => new V3(x, y + 0.02, z))); previa.visible = true; }
  const ocultar = () => { previa.visible = false; A.etqVivas = []; };

  let est = null;
  const sobre = e => { const h = A.pickEvento(e); const o = objetoDe(h); if (!h || !o) return null; if (h.normal.y < 0.6 && h.normal.y > -0.6) return { o, h, pared: true }; return { o, h }; };
  E.agregarHerramientaPropia('hueco_losa', {
    n: 'Hueco en suelo o techo', ic: 'hueco_losa',
    pista: 'Arrastra un rectángulo sobre un piso, una losa o un techo plano para abrir un hueco. Un clic abre uno del tamaño del panel (rectangular o redondo). Para paredes usa «Hueco en pared» (tecla O).',
    down: e => {
      const s = sobre(e); if (!s) return;
      if (s.pared || !admite(s.o)) { A.pista(tb(s.o.tipo) === 'techo' ? 'Los techos inclinados aún no admiten huecos: usa un techo plano.' : 'Eso no es un piso, una losa ni un techo plano.'); return; }
      est = { o: s.o, a: s.h.point.clone(), y: s.h.point.y };
    },
    move: e => {
      if (!est) { const s = sobre(e); if (s && !s.pared && admite(s.o)) { const p = s.h.point; verPrevia(contorno(p.x, p.z, PH.ancho, PH.forma === 'circulo' ? PH.ancho : PH.largo, PH.forma), p.y); } else ocultar(); return; }
      const p = A.puntoPlano(e, est.y); if (!p) return; const a = est.a;
      const w = Math.abs(p.x - a.x), l = Math.abs(p.z - a.z); if (w < 0.1 && l < 0.1) return;
      verPrevia(contorno((a.x + p.x) / 2, (a.z + p.z) / 2, w, l, 'rect'), est.y);
      A.etqVivas = [{ p: new V3((a.x + p.x) / 2, est.y + 0.4, (a.z + p.z) / 2), t: A.fmt(w) + ' × ' + A.fmt(l) + ' m' }];
    },
    up: (e, mov) => {
      if (!est) return; const { o, a, y } = est; est = null; ocultar();
      const p = A.puntoPlano(e, y); let pts;
      if (mov <= 6 || !p || (Math.abs(p.x - a.x) < 0.1 && Math.abs(p.z - a.z) < 0.1)) pts = contorno(a.x, a.z, PH.ancho, PH.forma === 'circulo' ? PH.ancho : PH.largo, PH.forma);
      else pts = contorno((a.x + p.x) / 2, (a.z + p.z) / 2, Math.abs(p.x - a.x), Math.abs(p.z - a.z), 'rect');
      if (abrir(o, pts, PH.vidrio)) A.pista('Hueco abierto. Se quita desde el inspector del ' + (esTechoPlano(o) ? 'techo' : 'piso') + ' (Huecos).');
    },
    fin: () => { est = null; ocultar(); },
    panel: () => `<div class="campos">
      <label class="campo ancho"><span>Forma (con un clic)</span><select data-hl="forma"><option value="rect"${PH.forma === 'rect' ? ' selected' : ''}>Rectangular</option><option value="circulo"${PH.forma === 'circulo' ? ' selected' : ''}>Redondo</option></select></label>
      <label class="campo"><span>${PH.forma === 'circulo' ? 'Diámetro' : 'Ancho X'} (m)</span><input type="number" step="0.05" min="0.1" data-hl="ancho" value="${PH.ancho}"></label>
      ${PH.forma === 'circulo' ? '' : `<label class="campo"><span>Largo Z (m)</span><input type="number" step="0.05" min="0.1" data-hl="largo" value="${PH.largo}"></label>`}
      <label class="chk" style="grid-column:1/-1"><input type="checkbox" data-hl="vidrio"${PH.vidrio ? ' checked' : ''}> Con vidrio en techos (claraboya)</label></div>`
  });
  E.agregarHerramienta('construir', { h: 'hueco_losa', n: 'Hueco en suelo o techo' });
  document.addEventListener('change', e => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.hl) return; const k = el.dataset.hl;
    if (k === 'vidrio') PH.vidrio = el.checked; else if (k === 'forma') { PH.forma = el.value; if (A.renderPanel) A.renderPanel(); }
    else { const v = parseFloat(el.value); if (isFinite(v) && v >= 0.1) PH[k] = v; }
  });

  /* inspector: huecos del piso o del techo seleccionado */
  E.on('panel', () => {
    if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return; const o = E.nuevos().get(A.sel[0].slice(1)); if (!o || !esTechoPlano(o)) return;
    const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return;
    const n = Array.isArray(o.datos.agujeros) ? o.datos.agujeros.length : 0, na = o.datos.agujeros_auto ? Object.keys(o.datos.agujeros_auto).length : 0;
    const sec = document.createElement('details'); sec.className = 'sec'; sec.open = true; sec.dataset.sec = 'huecos-techo';
    sec.innerHTML = `<summary>Huecos</summary><p class="ayuda" style="margin:0 0 6px">${n ? n + (n > 1 ? ' huecos' : ' hueco') + ' propios' : 'Sin huecos propios'}${na ? ' · ' + na + ' de escaleras (se abren y cierran solos)' : ''}.</p>
      <div class="fila"><button data-hla="nuevo">Abrir un hueco…</button>${n ? '<button data-hla="ultimo">Quitar el último</button><button data-hla="todos">Quitar todos</button>' : ''}</div>`;
    c.appendChild(sec);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-hla]'); if (!b) return;
    if (b.dataset.hla === 'nuevo') { A.ponerHerramienta('hueco_losa'); return; }
    const o = A.sel.length === 1 && E.nuevos().get(A.sel[0].slice(1)); if (!o) return;
    const v = o.datos, ag = (v.agujeros || []).slice(), cl = (v.claraboyas || []).slice();
    if (b.dataset.hla === 'ultimo') { const q = ag.pop(); const j = cl.findIndex(x => JSON.stringify(x) === JSON.stringify(q)); if (j >= 0) cl.splice(j, 1); }
    o.datos = Object.assign({}, v, { agujeros: b.dataset.hla === 'todos' ? [] : ag, claraboyas: b.dataset.hla === 'todos' ? [] : cl });
    const doc = A.docActualizado(o); o.datos = v; if (doc) A.guardar([doc], { etiqueta: 'Quitar huecos del techo' });
  });
  window.OOHuecosLosas = { abrir, contorno };
})();
