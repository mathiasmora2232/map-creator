/* Editor del mapa (2.1, editor v2): prefabs. Amplía los «componentes» que ya existían (colección «componentes»: {nombre, partes, d0}).
   - «Crear prefab» con la selección (un coche, una casa, un edificio, una zona) lo guarda y sale en el catálogo, en «Mis prefabs».
   - Cada copia colocada lleva datos.prefab = id del prefab (copia enlazada). Se copia y se pega como cualquier objeto (Ctrl+C / Ctrl+V).
   - «Actualizar el prefab con la selección»: cambia el prefab y ofrece actualizar todas sus copias o desvincularlas (se quedan como
     estaban). Todo con deshacer, porque las copias son documentos de «cambios».
   - Botón derecho en la tarjeta del prefab: colocar, renombrar, actualizar, exportar y borrar. Importar y exportar en JSON. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const prefabs = () => [...A.efectivos('componentes')].filter(([, c]) => c && Array.isArray(c.partes));
  const copiasDe = id => [...E.nuevos().values()].filter(o => A.tipoBase(o.tipo) === 'copia' && o.datos && o.datos.prefab === id);
  /* datos de una copia con las partes nuevas del prefab, conservando su escala respecto al prefab */
  function datosActualizados(o, c) {
    const d = A.clon(o.datos), d0 = Array.isArray(d.d0) ? d.d0 : [d.sx || 1, d.sy || 1, d.sz || 1];
    const k = [(+d.sx || d0[0]) / (d0[0] || 1), (+d.sy || d0[1]) / (d0[1] || 1), (+d.sz || d0[2]) / (d0[2] || 1)];
    // la copia se apoya en el suelo por su centro (origen «centro»): se recoloca para que la base quede donde estaba
    const base = (+d.y || 0) - (+d.sy || d0[1]) / 2;
    Object.assign(d, { partes: A.clon(c.partes), d0: c.d0.slice(), sx: A.r3(c.d0[0] * k[0]), sy: A.r3(c.d0[1] * k[1]), sz: A.r3(c.d0[2] * k[2]), componente: c.nombre });
    d.y = A.r3(base + d.sy / 2);
    return d;
  }
  async function actualizarDesdeSeleccion(idPref) {
    const ps = A.partesSeleccion(A.sel); if (!ps) { A.pista('Selecciona lo que tendrá el prefab.'); return; }
    const lista = prefabs(); if (!lista.length) { A.pista('Todavía no hay prefabs: usa «Crear prefab».'); return; }
    if (!idPref) {
      const inst = A.sel.length === 1 && A.sel[0][0] === 'n' ? E.nuevos().get(A.sel[0].slice(1)) : null;
      idPref = inst && inst.datos && inst.datos.prefab;
    }
    let modo = 'actualizar', elegido = idPref || lista[0][0];
    const pr = A.abrirModal(`<div class="cab">${svg('prefab')} Actualizar un prefab con la selección</div><div class="cont">
      <label class="campo"><span>Prefab</span><select id="pfElegir">${lista.map(([id, c]) => `<option value="${esc(id)}"${id === elegido ? ' selected' : ''}>${esc(c.nombre)} · ${copiasDe(id).length} copias</option>`).join('')}</select></label>
      <p class="ayuda">Las piezas seleccionadas pasan a ser el prefab. ¿Qué hacemos con las copias que ya están colocadas?</p>
      <label class="chk"><input type="radio" name="pfModo" value="actualizar" checked> Actualizar todas las copias</label>
      <label class="chk"><input type="radio" name="pfModo" value="desvincular"> Desvincularlas (se quedan como están)</label></div>
      <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Actualizar prefab</button></div>`);
    setTimeout(() => { const s = $('#pfElegir'); if (s) s.addEventListener('change', () => { elegido = s.value; }); document.querySelectorAll('[name="pfModo"]').forEach(r => r.addEventListener('change', () => { if (r.checked) modo = r.value; })); }, 30);
    if (await pr !== true) return;
    const c0 = A.efectivos('componentes').get(elegido); if (!c0) return;
    const c = Object.assign({}, c0, { partes: ps.partes, d0: ps.d0, version: (c0.version || 1) + 1, actualizado: A.ahora() });
    const copias = copiasDe(elegido), docs = [];
    for (const o of copias) {
      if (modo === 'actualizar') o.datos = datosActualizados(o, c); else { delete o.datos.prefab; o.datos.desvinculado = elegido; }
      const doc = A.docActualizado(o); if (doc) docs.push(doc);
    }
    A.guardarCol('componentes', elegido, c);
    if (docs.length) A.guardar(docs);
    A.pista('Prefab «' + c.nombre + '» actualizado' + (copias.length ? (modo === 'actualizar' ? ' y sus ' + copias.length + ' copias también.' : '; ' + copias.length + ' copias desvinculadas.') : '.'));
  }
  function desvincular(keys) {
    const docs = [];
    for (const k of keys) { const o = k[0] === 'n' && E.nuevos().get(k.slice(1)); if (!o || !o.datos || !o.datos.prefab) continue; o.datos.desvinculado = o.datos.prefab; delete o.datos.prefab; const d = A.docActualizado(o); if (d) docs.push(d); }
    if (docs.length) { A.guardar(docs); A.pista(docs.length === 1 ? 'Copia desvinculada: ya no cambia con el prefab.' : docs.length + ' copias desvinculadas.'); }
  }
  async function renombrar(id) {
    const c = A.efectivos('componentes').get(id); if (!c) return; let nom = c.nombre;
    const pr = A.abrirModal(`<div class="cab">Renombrar prefab</div><div class="cont"><label class="campo"><span>Nombre</span><input type="text" id="pfNombre" value="${esc(c.nombre)}" data-foco></label></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Guardar</button></div>`);
    setTimeout(() => { const i = $('#pfNombre'); if (i) { i.select(); i.addEventListener('input', () => { nom = i.value; }); i.addEventListener('keydown', e => { if (e.key === 'Enter') A.cerrarModal(true); }); } }, 30);
    if (await pr !== true || !nom.trim()) return;
    A.guardarCol('componentes', id, Object.assign({}, c, { nombre: nom.trim(), actualizado: A.ahora() }));
  }
  async function borrar(id) {
    const c = A.efectivos('componentes').get(id); if (!c) return; const n = copiasDe(id).length;
    if (!await A.confirmar('¿Borrar el prefab «' + c.nombre + '»?', n ? 'Sus ' + n + ' copias se quedan en el mapa, desvinculadas.' : 'No tiene copias en este mapa.', 'Borrar')) return;
    if (n) desvincular(copiasDe(id).map(o => 'n' + o.id));
    A.guardarCol('componentes', id, null);
  }
  function exportar() {
    const l = prefabs().map(([id, c]) => ({ id, nombre: c.nombre, partes: c.partes, d0: c.d0, version: c.version || 1 }));
    const blob = new Blob([JSON.stringify({ formato: 'oo-prefabs', version: 1, generado: A.ahora(), prefabs: l }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'prefabs_operacion_oficina.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importarJSON(j) {
    const l = (j && (j.prefabs || j.componentes)) || []; let n = 0;
    for (const p of l) { if (!p || !Array.isArray(p.partes) || !Array.isArray(p.d0)) continue; const id = 'comp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); A.guardarCol('componentes', id, { nombre: p.nombre || 'Prefab importado', partes: p.partes, d0: p.d0, prefab: true, version: 1, creado: A.ahora(), importado: true }); n++; }
    A.pista(n ? n + ' prefab(s) importados en «Mis prefabs».' : 'Ese archivo no tiene prefabs.'); return n;
  }
  /* menú del botón derecho en una tarjeta del catálogo */
  let menu = null;
  function menuTarjeta(id, e) {
    if (!A.efectivos('componentes').has(id)) return false;
    if (!menu) { menu = document.createElement('div'); menu.className = 'menu-flot'; menu.id = 'menuPrefab'; menu.hidden = true; document.body.appendChild(menu); }
    menu.innerHTML = `<div class="menu-tit">Prefab</div><button data-pf="colocar" data-v="${esc(id)}">${svg('objeto')}Colocar</button><button data-pf="renombrar" data-v="${esc(id)}">${svg('lapiz')}Renombrar</button><button data-pf="actualizar" data-v="${esc(id)}">${svg('recargar')}Actualizar con la selección</button><button data-pf="copias" data-v="${esc(id)}">${svg('sel')}Seleccionar sus copias (${copiasDe(id).length})</button><button data-pf="exportar">${svg('bajar')}Exportar mis prefabs (.json)</button><hr><button data-pf="borrar" data-v="${esc(id)}">${svg('cerrar')}Borrar prefab</button>`;
    const fake = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), dataset: {} };
    if (window.OOUI) OOUI.abrirMenu('menuPrefab', fake, { izq: true, siempre: true });
    return true;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pf]'); if (b) { if (window.OOUI) OOUI.cerrarMenus(); const id = b.dataset.v;
      ({ colocar: () => A.iniciarColocar(id), renombrar: () => renombrar(id), actualizar: () => actualizarDesdeSeleccion(id), copias: () => { const ks = copiasDe(id).map(o => 'n' + o.id); A.seleccionar(ks); if (ks.length) A.encuadrarCaja(A.cajaEntidades(ks)); }, exportar, borrar: () => borrar(id) })[b.dataset.pf]();
      return; }
    const a = e.target.closest('[data-a^="pf-"]'); if (!a) return;
    const acc = a.dataset.a;
    if (acc === 'pf-desvincular') desvincular(A.sel);
    else if (acc === 'pf-actualizar') actualizarDesdeSeleccion();
    else if (acc === 'pf-copias') { const o = E.nuevos().get(A.sel[0].slice(1)); if (o) { const ks = copiasDe(o.datos.prefab).map(x => 'n' + x.id); A.seleccionar(ks); } }
  });
  /* aviso en el inspector cuando lo seleccionado es una copia de un prefab */
  E.on('panel', () => {
    const c = $('#objCuerpo [data-scope="sel"]'); if (!c || A.herramienta !== 'sel') return;
    const inst = A.sel.length === 1 && A.sel[0][0] === 'n' ? E.nuevos().get(A.sel[0].slice(1)) : null;
    let html = '';
    if (inst && inst.datos && inst.datos.prefab) { const p = A.efectivos('componentes').get(inst.datos.prefab); html = `<div class="aviso pf-aviso">${svg('prefab')} Copia del prefab <b>${esc(p ? p.nombre : inst.datos.componente || '?')}</b> (${copiasDe(inst.datos.prefab).length} copias). <div class="fila"><button data-a="pf-copias">Seleccionar copias</button><button data-a="pf-desvincular">Desvincular</button><button data-a="pf-actualizar">Actualizar el prefab…</button></div></div>`; }
    else if (inst && inst.datos && inst.datos.componente) html = `<p class="ayuda">${svg('prefab')} Copia desvinculada de «${esc(inst.datos.componente)}».</p>`;
    else if (A.sel.length) html = `<div class="fila pf-fila"><button data-a="ctx-componente">${svg('prefab')}Crear prefab</button>${prefabs().length ? '<button data-a="pf-actualizar">Actualizar un prefab…</button>' : ''}</div>`;
    if (!html) return;
    const cab = c.querySelectorAll('.ins-fila'); const ref = cab.length ? cab[cab.length - 1] : c.firstChild;
    if (ref && ref.insertAdjacentHTML) ref.insertAdjacentHTML('afterend', html); else c.insertAdjacentHTML('afterbegin', html);
  });
  window.OOPrefabs = { prefabs, copiasDe, actualizarDesdeSeleccion, desvincular, renombrar, borrar, exportar, importarJSON, menuTarjeta };
})();
