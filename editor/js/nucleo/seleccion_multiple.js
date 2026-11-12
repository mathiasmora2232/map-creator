/* Editor del mapa: opciones para varias cosas a la vez (selección múltiple o un grupo).
   En el inspector, sección «Selección» con:
   - qué hay: «5 paredes · 2 puertas · 1 techo», y botones para quedarse solo con un tipo;
   - paredes: alto, grosor, material y color de todas a la vez; puertas y ventanas: ancho y alto;
   - color para todo lo nuevo seleccionado; agrupar o desagrupar.
   Todos los cambios van en un solo paso de deshacer. Las piezas del mapa original solo cuentan en el resumen. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, tb = A.tipoBase, r3 = A.r3;
  const NOMBRES = { muro: ['pared', 'paredes'], puerta: ['puerta', 'puertas'], ventana: ['ventana', 'ventanas'], hueco: ['hueco', 'huecos'], habitacion: ['piso', 'pisos'],
    techo: ['techo', 'techos'], escalera: ['escalera', 'escaleras'], rampa: ['rampa', 'rampas'], fundacion: ['plataforma', 'plataformas'], baranda: ['baranda', 'barandas'], objeto: ['objeto', 'objetos'] };
  const nombre = (b, n) => (NOMBRES[b] || [b, b + 's'])[n === 1 ? 0 : 1];
  const baseDe = o => { const b = tb(o.tipo); return NOMBRES[b] ? b : 'objeto'; };
  const MATS = () => (window.OO && OO.MAT_MURO) || ['bloque', 'pintura', 'ladrillo', 'chapa', 'concreto', 'madera', 'metal', 'vidrio'];
  const nomMat = k => (A.MATERIALES && A.MATERIALES[k] && A.MATERIALES[k].n) || k;

  function nuevosSel() { return A.sel.filter(k => k[0] === 'n').map(k => E.nuevos().get(k.slice(1))).filter(Boolean); }
  /* aplica cambios a varios objetos en un solo guardado */
  function aplicar(objs, cambio, etiqueta) {
    const docs = [];
    for (const o of objs) { const v = o.datos, c = typeof cambio === 'function' ? cambio(o) : cambio; if (!c) continue; o.datos = Object.assign({}, v, c); const d = A.docActualizado(o); o.datos = v; if (d) docs.push(d); }
    if (docs.length) A.guardar(docs, { etiqueta }); return docs.length;
  }
  const valorComun = (objs, k) => { const vs = [...new Set(objs.map(o => o.datos[k]))]; return vs.length === 1 ? vs[0] : ''; };

  E.on('panel', () => {
    if (A.sel.length < 2) return; const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return;
    const objs = nuevosSel(), orig = A.sel.length - objs.length, cuenta = {};
    for (const o of objs) { const b = baseDe(o); cuenta[b] = (cuenta[b] || 0) + 1; }
    const muros = objs.filter(o => tb(o.tipo) === 'muro'), vanos = objs.filter(o => ['puerta', 'ventana', 'hueco'].includes(tb(o.tipo)));
    const resumen = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([b, n]) => `<button class="chip-sel" data-ms="solo" data-tipo="${b}" title="Quedarse solo con ${nombre(b, 2)}">${n} ${nombre(b, n)}</button>`).join('') + (orig ? `<span class="chip-sel fijo">${orig} del mapa original</span>` : '');
    const enGrupo = A.sel.some(k => A.grupoDe && A.grupoDe(k));
    const num = (k, l, v, st) => `<label class="campo"><span>${l}</span><input type="number" step="${st || 0.05}" data-msv="${k}" value="${v === '' ? '' : r3(+v)}" placeholder="varios"></label>`;
    let html = `<details class="sec" open data-sec="multiple"><summary>Selección · ${A.sel.length} elementos</summary><div class="chips-sel">${resumen}</div>`;
    if (muros.length) html += `<h4 class="sub-sec">${muros.length} ${nombre('muro', muros.length)}</h4><div class="campos">${num('m:sy', 'Alto (m)', valorComun(muros, 'sy'))}${num('m:sz', 'Grosor (m)', valorComun(muros, 'sz'), 0.01)}
      <label class="campo"><span>Material</span><select data-msv="m:material"><option value="">${valorComun(muros, 'material') ? '' : 'Varios'}</option>${MATS().map(k => `<option value="${k}"${valorComun(muros, 'material') === k ? ' selected' : ''}>${A.esc(nomMat(k))}</option>`).join('')}</select></label>
      <label class="campo"><span>Color</span><input type="color" data-msv="m:color" value="${A.esc(valorComun(muros, 'color') || '#d8d4cc')}"></label></div>
      ${muros.length > 1 ? '<div class="fila"><button data-ms="igualar-alto">Igualar a la más alta</button></div>' : ''}`;
    if (vanos.length) html += `<h4 class="sub-sec">${vanos.length} ${vanos.length === 1 ? 'puerta, ventana o hueco' : 'puertas, ventanas o huecos'}</h4><div class="campos">${num('v:sx', 'Ancho (m)', valorComun(vanos, 'sx'))}${num('v:sy', 'Alto (m)', valorComun(vanos, 'sy'))}</div>`;
    if (objs.length) html += `<h4 class="sub-sec">Todo lo seleccionado</h4><div class="campos"><label class="campo"><span>Color de todo</span><input type="color" data-msv="t:color" value="${A.esc(valorComun(objs, 'color') || '#cccccc')}"></label></div>`;
    html += `<div class="fila">${enGrupo ? '<button data-a="ctx-desagrupar">Desagrupar</button>' : '<button data-a="ctx-agrupar" title="Ctrl+G">Agrupar</button>'}<button data-a="encuadrar-sel">Encuadrar</button></div></details>`;
    const div = document.createElement('div'); div.innerHTML = html; c.insertBefore(div.firstElementChild, c.firstChild);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.msv) return;
    const [grupo, k] = el.dataset.msv.split(':'), objs = nuevosSel(); let v = el.type === 'number' ? parseFloat(el.value) : el.value;
    if (el.type === 'number' && (!isFinite(v) || v <= 0)) return; if (v === '') return;
    const destino = grupo === 'm' ? objs.filter(o => tb(o.tipo) === 'muro') : grupo === 'v' ? objs.filter(o => ['puerta', 'ventana', 'hueco'].includes(tb(o.tipo))) : objs;
    const cambio = k === 'material' ? (o => { const m = A.MATERIALES && A.MATERIALES[v]; return Object.assign({ material: v }, m && m.c ? { color: m.c } : {}); }) : { [k]: v };
    const n = aplicar(destino, cambio, 'Cambiar ' + destino.length + ' a la vez'); if (n) A.pista('Cambiado en ' + n + (n === 1 ? ' objeto.' : ' objetos.'));
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ms]'); if (!b) return; const objs = nuevosSel();
    if (b.dataset.ms === 'solo') { const t = b.dataset.tipo; A.seleccionar(objs.filter(o => baseDe(o) === t).map(o => 'n' + o.id)); }
    else if (b.dataset.ms === 'igualar-alto') { const muros = objs.filter(o => tb(o.tipo) === 'muro'), max = Math.max(...muros.map(o => +o.datos.sy || 0)); aplicar(muros, { sy: max }, 'Igualar el alto de las paredes'); }
  });
  window.OOSeleccionMultiple = { aplicar };
})();
