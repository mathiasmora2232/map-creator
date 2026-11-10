/* Editor del mapa (2.1, editor v2): pestaña «Material» del inspector y sombras por objeto.
   - Elegir entre los materiales del mapa (los de Unity/Godot, por color), los del catálogo (pintar) y los propios.
   - Materiales propios (colección «materiales»): color, textura importada, rugosidad, metal, emisión, transparencia y escala UV.
     Se asignan con props.material = "u:<id>" (con deshacer) y salen en la exportación (glTF con PBR y en el JSON).
   - Recibe/proyecta sombras por objeto (props.recibe_sombras / proyecta_sombras, se editan en «Propiedades»).
   Cómo se dibuja: las piezas con material propio o sombras propias dejan de pintarse en las mallas instanciadas (siguen pudiendo
   elegirse) y aquí se dibujan con su propio material. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const GEO = { b: new T.BoxGeometry(1, 1, 1), c: new T.CylinderGeometry(0.5, 0.5, 1, 18), s: new T.SphereGeometry(0.5, 18, 12) };
  const texLoader = new T.TextureLoader(), texturas = new Map(), mats = new Map();
  const propios = () => [...A.efectivos('materiales')].filter(([, m]) => m && m.nombre);
  function textura(assetId, rep) {
    const d = A.efectivos('assets').get(assetId); if (!d) return null;
    const k = assetId + '|' + rep; if (texturas.has(k)) return texturas.get(k);
    const t = texLoader.load(d.url || ('/_blob/' + d.archivo), () => A.marcar()); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); t.encoding = T.sRGBEncoding; t.anisotropy = 4; texturas.set(k, t); return t;
  }
  function material(id, base) {
    const m = A.efectivos('materiales').get(id); if (!m) return null;
    const k = id + '|' + JSON.stringify(m) + '|' + (base || ''); if (mats.has(k)) return mats.get(k);
    const op = m.opacidad == null ? 1 : +m.opacidad;
    const mt = new T.MeshStandardMaterial({ color: m.color || base || '#cccccc', roughness: m.rugosidad == null ? 0.8 : +m.rugosidad, metalness: +m.metal || 0, transparent: op < 1, opacity: op, depthWrite: op >= 0.98, clippingPlanes: [A.clip] });
    if (m.emision && +m.emisionInt > 0) { mt.emissive = new T.Color(m.emision); mt.emissiveIntensity = +m.emisionInt; }
    if (m.textura) mt.map = textura(m.textura, Math.max(0.05, +m.escalaUV || 1));
    if (window.OOMatPro) OOMatPro.extender(mt, m); /* (2.1 pro f4) presets, texturas procedurales, mapeo en metros, relieve, suciedad y desgaste */
    mt.name = 'oo_' + String(m.nombre).replace(/\W+/g, '_'); mats.set(k, mt); return mt;
  }
  /* ---------- objetos con dibujo propio ---------- */
  const grupo = new T.Group(); grupo.name = 'materialesPropios'; A.scene.add(grupo);
  let especiales = new Map(); // clave → props
  function buscar() {
    const m = new Map();
    const es = pr => pr && (String(pr.material || '').startsWith('u:') || pr.proyecta_sombras === false || pr.recibe_sombras === false);
    for (const o of E.nuevos().values()) if (es(o.props)) m.set('n' + o.id, o.props);
    const P = A.P; const cache = new Map();
    for (let i = 0; i < A.N; i++) { const z = P[i]; if (!z.props) continue; let pr = cache.get(z.props); if (pr === undefined) { const d = A.efectivos().get(z.props); pr = d && d.props || null; cache.set(z.props, pr); } if (es(pr) && !z.real) m.set('p' + i, pr); }
    return m;
  }
  function piezas(k) {
    const out = [];
    if (k[0] === 'p') { const z = A.P[+k.slice(1)]; if (!z || z.del || !A.visible(+k.slice(1))) return out; const g = /^cyl/.test(z.mesh) ? GEO.c : z.mesh === 'sph' ? GEO.s : GEO.b; for (const m4 of A.matricesEntidad(k)) out.push({ g, m: m4, c: '#' + z.c.getHexString(), t: z.mesh === 'boxT' || z.mesh === 'cylT' }); }
    else { const o = E.nuevos().get(k.slice(1)); if (!o) return out; for (const pt of o.partes || []) { if (!pt.m || pt.f === 't' || pt.f === 'poly' || pt.f === 'l' || pt.oculta) continue; out.push({ g: pt.f === 'c' ? GEO.c : pt.f === 's' ? GEO.s : GEO.b, m: pt.m, c: pt.c || '#cccccc', t: pt.t }); } }
    return out;
  }
  const lambert = new Map(); const matColor = (c, t) => { const k = c + (t ? 't' : ''); let m = lambert.get(k); if (!m) { m = new T.MeshLambertMaterial({ color: c, transparent: !!t, opacity: t ? 0.38 : 1, depthWrite: !t, clippingPlanes: [A.clip] }); lambert.set(k, m); } return m; };
  function reconstruir() {
    while (grupo.children.length) grupo.remove(grupo.children[0]);
    for (const [k, pr] of especiales) {
      const mid = String(pr.material || '').startsWith('u:') ? pr.material.slice(2) : null;
      const sel = A.selSet.has(k);
      for (const p of piezas(k)) {
        let mt = mid ? material(mid, p.c) : null; if (!mt) mt = matColor(p.c, p.t);
        if (sel) { const m0 = mt; mt = mt.clone(); mt.onBeforeCompile = m0.onBeforeCompile; mt.customProgramCacheKey = m0.customProgramCacheKey; mt.emissive = new T.Color('#ff7a00'); mt.emissiveIntensity = 0.35; }
        const me = new T.Mesh(p.g, mt); me.matrixAutoUpdate = false; me.matrix.copy(p.m); me.castShadow = pr.proyecta_sombras !== false; me.receiveShadow = pr.recibe_sombras !== false; me.userData.key = k; grupo.add(me);
      }
      // suelos y techos de habitación (formas): se les cambia el material directamente
      if (k[0] === 'n' && mid) { const o = E.nuevos().get(k.slice(1)); for (const f of (o && o.formas) || []) { const mt = material(mid, '#' + f.material.color.getHexString()); if (mt) f.material = mt; f.castShadow = pr.proyecta_sombras !== false; f.receiveShadow = pr.recibe_sombras !== false; } }
    }
    A.marcar();
  }
  function sincronizar() {
    const nuevo = buscar(); const antes = [...E.instOcultas].filter(k => !especiales.has(k) || true);
    let cambio = nuevo.size !== especiales.size; if (!cambio) for (const k of nuevo.keys()) if (!especiales.has(k)) { cambio = true; break; }
    especiales = nuevo;
    if (cambio) { E.instOcultas.clear(); for (const k of especiales.keys()) E.instOcultas.add(k); A.renderTodo(); }
    reconstruir(); void antes;
  }
  E.on('recompute', sincronizar); E.on('mapa', sincronizar);
  E.on('render', () => { if (especiales.size) reconstruir(); });
  E.on('seleccion', () => { if (especiales.size) reconstruir(); });
  let tM = 0; E.on('marcado', () => { if (!especiales.size) return; const t = performance.now(); if (t - tM > 60) { tM = t; let j = 0; const hijos = grupo.children; for (const k of especiales.keys()) for (const p of piezas(k)) { const me = hijos[j++]; if (me && me.userData.key === k) me.matrix.copy(p.m); } } });
  E.on('col', c => { if (c === 'materiales' || c === 'assets') { mats.clear(); reconstruir(); pintarTab(); } });
  /* ---------- pestaña Material ---------- */
  function materialesMapa() {
    const D = A.D; if (!D) return []; const vistos = new Map();
    for (const m of D.materiales || []) { if (!m || !m[0] || vistos.has(m[0])) continue; vistos.set(m[0], { n: m[0], c: m[1] || '#999999', tex: m[2] || '' }); }
    return [...vistos.values()].sort((a, b) => a.n.localeCompare(b.n)).slice(0, 120);
  }
  function actual() {
    if (!A.sel.length) return null; const pr = A.leerProps(A.objetivoProps()); if (pr.material) return pr.material;
    const k = A.sel[0]; if (k[0] === 'p') { const z = A.P[+k.slice(1)]; return z.material ? 'c:' + z.material : (z.mat >= 0 && A.D.materiales[z.mat] ? 'm:' + A.D.materiales[z.mat][0] : null); }
    const o = E.nuevos().get(k.slice(1)); return o && o.datos.material ? 'c:' + o.datos.material : null;
  }
  const muestra = (k, color, nombre, img, on) => `<button class="muestra${on ? ' on' : ''}" data-mat="${esc(k)}" title="${esc(nombre)}">${img ? `<img src="${esc(img)}" alt="">` : `<span class="sw" style="background:${esc(color)}"></span>`}<span>${esc(nombre)}</span></button>`;
  function pintarTab() {
    const el = $('#insMaterial'); if (!el) return; const act = actual();
    const ps = propios(); const sinSel = !A.sel.length;
    let h = sinSel ? '<p class="ayuda">Selecciona un objeto para cambiarle el material. Aquí puedes crear y editar tus materiales.</p>' : `<p class="ayuda">Material actual: <b>${esc(nombreDe(act))}</b>. Clic en una muestra para asignarla a lo seleccionado (se deshace con Ctrl+Z).</p>`;
    if (window.OOMatPro) h += OOMatPro.seccionTab(act); /* (2.1 pro f4) biblioteca, editar, seleccionar iguales y reemplazo masivo */
    h += `<h3>Mis materiales <span class="acciones"><button data-mat-nuevo>${svg('mas')}Nuevo</button></span></h3><div class="muestras">` + (ps.map(([id, m]) => muestra('u:' + id, m.color || '#ccc', m.nombre, (window.OOMatPro && OOMatPro.mini(m)) || (m.textura && A.efectivos('assets').get(m.textura) ? A.efectivos('assets').get(m.textura).mini : ''), act === 'u:' + id) + `<button class="mini-ed" data-mat-editar="${esc(id)}" title="Editar ${esc(m.nombre)}">${svg('lapiz')}</button>`).join('') || '<p class="ayuda">Todavía no hay. Crea uno con color, textura, rugosidad, metal, emisión…</p>') + '</div>';
    if (!sinSel) {
      h += '<h3>Catálogo</h3><div class="muestras">' + Object.keys(A.MATERIALES).map(k => muestra('c:' + k, A.MATERIALES[k].c, A.MATERIALES[k].n, A.OO_muestra ? '' : '', act === 'c:' + k)).join('') + '</div>';
      h += `<h3>Materiales del mapa <small>${materialesMapa().length}</small></h3><div class="muestras">` + materialesMapa().map(m => muestra('m:' + m.n, m.c, m.n.replace(/_/g, ' '), '', act === 'm:' + m.n)).join('') + '</div>';
      h += '<div class="fila"><button data-mat-quitar>Quitar material propio</button></div>';
    }
    el.innerHTML = h;
  }
  function nombreDe(k) { if (!k) return 'el original'; if (k.startsWith('u:')) { const m = A.efectivos('materiales').get(k.slice(2)); return m ? m.nombre : 'propio'; } if (k.startsWith('c:')) return (A.MATERIALES[k.slice(2)] || {}).n || k.slice(2); return k.slice(2).replace(/_/g, ' '); }
  function asignar(k) {
    if (!A.sel.length) return;
    if (k.startsWith('u:')) { if (window.OOMatPro) { OOMatPro.asignar(A.sel, k); return; } A.guardarProps({ material: k }); return; } /* (2.1 pro f4) también con varios objetos nuevos elegidos */
    const color = k.startsWith('c:') ? A.MATERIALES[k.slice(2)].c : (materialesMapa().find(m => 'm:' + m.n === k) || {}).c;
    const mat = k.startsWith('c:') ? k.slice(2) : 'pintura';
    A.params.pintar.material = mat; A.params.pintar.color = color;
    const b = document.createElement('button'); b.dataset.a = 'ctx-pintar'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
    const pr = A.leerProps(A.objetivoProps()); if (pr.material) setTimeout(() => A.guardarProps({ material: undefined }), 50);
  }
  async function editor(id) {
    if (window.OOMatPro) return OOMatPro.editor(id); /* (2.1 pro f4) editor completo: preset, hex, paletas, UV, relieve, suciedad, desgaste, local o global */
    const m0 =id ? A.efectivos('materiales').get(id) : null; const m = Object.assign({ nombre: 'Material ' + (propios().length + 1), color: '#c9c3b6', textura: '', rugosidad: 0.8, metal: 0, emision: '#000000', emisionInt: 0, opacidad: 1, escalaUV: 1 }, m0 || {});
    const txs = A.efectivos('assets'); const opsTex = [...txs].filter(([, d]) => d && d.tipo === 'textura').map(([tid, d]) => `<option value="${esc(tid)}"${m.textura === tid ? ' selected' : ''}>${esc(d.nombre)}</option>`).join('');
    const rng = (k, l, mn, mx, st) => `<label class="campo"><span>${l}: <output data-out="${k}">${m[k]}</output></span><input type="range" data-m="${k}" min="${mn}" max="${mx}" step="${st}" value="${m[k]}"></label>`;
    const pr = A.abrirModal(`<div class="cab">${svg('pintar')} ${id ? 'Editar' : 'Nuevo'} material</div><div class="cont"><div class="ajustes">
      <label class="campo"><span>Nombre</span><input type="text" data-m="nombre" value="${esc(m.nombre)}" data-foco></label><label class="campo"><span>Color</span><input type="color" data-m="color" value="${esc(m.color)}"></label>
      <label class="campo"><span>Textura</span><select data-m="textura"><option value="">(ninguna)</option>${opsTex}</select></label><label class="campo"><span>&nbsp;</span><button data-mat-imptex>${svg('subir')}Importar textura…</button></label>
      ${rng('rugosidad', 'Rugosidad', 0, 1, 0.05)}${rng('metal', 'Metal', 0, 1, 0.05)}
      <label class="campo"><span>Emisión (brillo propio)</span><input type="color" data-m="emision" value="${esc(m.emision)}"></label>${rng('emisionInt', 'Intensidad de emisión', 0, 3, 0.1)}
      ${rng('opacidad', 'Opacidad (1 = opaco)', 0.05, 1, 0.05)}${rng('escalaUV', 'Escala UV (repeticiones por cara)', 0.25, 20, 0.25)}
      </div></div><div class="pie">${id ? '<button class="peligro" data-mat-borrar>Borrar</button>' : ''}<button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">${id ? 'Guardar' : 'Crear'}${A.sel.length ? ' y asignar' : ''}</button></div>`);
    const caja = $('#modalCaja');
    caja.addEventListener('input', e => { const k = e.target.dataset.m; if (!k) return; m[k] = e.target.type === 'range' ? +e.target.value : e.target.value; const o = caja.querySelector(`[data-out="${k}"]`); if (o) o.textContent = m[k]; });
    caja.addEventListener('change', e => { const k = e.target.dataset.m; if (k) m[k] = e.target.type === 'range' ? +e.target.value : e.target.value; });
    caja.addEventListener('click', async e => {
      if (e.target.closest('[data-mat-imptex]') && window.OOImportados) { const ids = await OOImportados.importarTextura(); if (ids && ids[0]) { m.textura = ids[0]; const s = caja.querySelector('[data-m="textura"]'); if (s) { s.insertAdjacentHTML('beforeend', `<option value="${esc(ids[0])}" selected>Textura nueva</option>`); s.value = ids[0]; } } }
      if (e.target.closest('[data-mat-borrar]')) { A.guardarCol('materiales', id, null); A.cerrarModal(null); }
    });
    if (await pr !== true) return;
    const nid = id || ('mat-' + Date.now().toString(36));
    A.guardarCol('materiales', nid, Object.assign({}, m, { actualizado: A.ahora(), creado: (m0 && m0.creado) || A.ahora() }));
    if (A.sel.length && !id) A.guardarProps({ material: 'u:' + nid });
  }
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-mat]'); if (s) { asignar(s.dataset.mat); return; }
    if (e.target.closest('[data-mat-nuevo]')) { editor(null); return; }
    const ed = e.target.closest('[data-mat-editar]'); if (ed) { editor(ed.dataset.matEditar); return; }
    if (e.target.closest('[data-mat-quitar]')) A.guardarProps({ material: undefined });
  });
  E.on('tab', t => { if (t === 'material') pintarTab(); });
  E.on('seleccion', () => { const p = document.querySelector('[data-panel="material"]'); if (p && !p.hidden) pintarTab(); });
  E.on('recompute', () => { const p = document.querySelector('[data-panel="material"]'); if (p && !p.hidden && !document.querySelector('#insMaterial input:focus')) pintarTab(); });
  /* ---------- exportación ---------- */
  function materialExport(k, color) {
    const pr = A.propsDe(k); if (!pr || !String(pr.material || '').startsWith('u:')) return null;
    return material(pr.material.slice(2), color);
  }
  function listaExport() { return propios().map(([id, m]) => ({ id: 'u:' + id, nombre: m.nombre, color: m.color, textura: m.textura ? ((A.efectivos('assets').get(m.textura) || {}).archivo || null) : null, rugosidad: m.rugosidad, metal: m.metal, emision: m.emision, emision_intensidad: m.emisionInt, opacidad: m.opacidad, escala_uv: m.escalaUV, preset: m.preset || null, patron: m.patron || null, mapeo: m.mapeo || 'cara', escala_m: m.escala || null, rotacion_uv: m.rotacionUV || 0, relieve: m.relieve == null ? null : m.relieve, normal: m.normal ? ((A.efectivos('assets').get(m.normal) || {}).archivo || null) : null, suciedad: m.suciedad || 0, desgaste: m.desgaste || 0 })); } /* (2.1 pro f4) campos nuevos, añadidos al final */
  window.OOMateriales = { material, materialExport, listaExport, editor, asignar, especiales: () => especiales, pintarTab };
})();
