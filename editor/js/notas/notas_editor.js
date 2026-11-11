/* Editor del mapa (2.1): notas fáciles de crear y de editar.
   Antes el texto de una nota solo se podía escribir en el inspector, en la sección «Nota y fotos», que salía PLEGADA cuando la nota
   estaba vacía (el foco que se pedía al crearla caía en un textarea oculto dentro de un <details> cerrado: no se veía dónde escribir),
   y lo escrito solo se guardaba con el botón «Guardar nota»: al elegir otra cosa se perdía. En la pestaña Notas no había editor.
   Ahora:
   - botón grande «＋ Nota» en la pestaña Notas y en la barra de la vista (tecla N): clic en el mapa = nota creada y editor abierto con
     el foco puesto;
   - editor fijo arriba de la pestaña Notas (texto, fotos, hecha o pendiente, ir, ver en grande, borrar). No se repinta mientras se
     escribe: la lista de abajo se repinta sola sin tocar el textarea;
   - guardado automático al escribir (antirrebote de 0,7 s), al salir del campo y con el botón Guardar. Lo que se escribe seguido en la
     misma nota es un solo paso de deshacer;
   - el inspector abre siempre la sección «Nota y fotos» de una nota, la pone arriba y también guarda solo;
   - lista con botones Editar, Ir a, Hecha o Pendiente y Borrar (en notas_pro.js), y clic en la tarjeta 3D = editarla.
   API: OONotasEditor.editar(id, {foco, tab}), nueva(), guardarAhora(), borrar(id), get editando. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, esc = A.esc, tb = A.tipoBase, nv = () => E.nuevos();
  const blob = id => '/_blob/' + String(id).split('/').map(encodeURIComponent).join('/');
  const $ = s => document.querySelector(s);
  const esNota = o => !!o && tb(o.tipo) === 'nota';
  const notas = () => [...nv().values()].filter(esNota);
  const estado = o => (o && o.datos && o.datos.estado === 'hecha') ? 'hecha' : 'pendiente';

  let editando = null, pend = null, tPend = 0, ultimoPaso = null, ultimoT = 0, tEstado = 0;
  const RETARDO = 700;

  /* ---------- guardar ---------- */
  function docDe(id) { const o = nv().get(id); if (!esNota(o)) return null; const d = A.efectivos().get(o.docId); return d ? { o, d } : null; }
  function guardarDoc(id, cambios, etiqueta) {
    const r = docDe(id); if (!r) return false;
    const doc = Object.assign(A.clon(r.d), cambios);
    if (JSON.stringify([doc.texto || '', doc.fotos || [], (doc.datos || {}).estado]) === JSON.stringify([r.d.texto || '', r.d.fotos || [], (r.d.datos || {}).estado])) { marcarEstado(); return true; } /* nada nuevo: ya estaba guardado */
    doc.actualizado = A.ahora();
    const pasos = A.pasosDeshacer, soloTexto = Object.keys(cambios).length === 1 && 'texto' in cambios;
    const unir = soloTexto && ultimoPaso && pasos[pasos.length - 1] === ultimoPaso && ultimoPaso.notaTexto === id && Date.now() - ultimoT < 20000;
    A.guardar([{ id: r.o.docId, data: doc }], unir ? { unir: true } : { etiqueta: etiqueta || 'Texto de nota' });
    if (!unir) { ultimoPaso = soloTexto ? pasos[pasos.length - 1] : null; if (ultimoPaso) ultimoPaso.notaTexto = id; }
    ultimoT = Date.now(); marcarEstado();
    return true;
  }
  function programar(id, texto) {
    pend = { id, texto }; ponerEstado('Sin guardar…');
    clearTimeout(tPend); tPend = setTimeout(guardarAhora, RETARDO);
  }
  function guardarAhora() {
    clearTimeout(tPend); tPend = 0; if (!pend) return false; const p = pend; pend = null;
    return guardarDoc(p.id, { texto: String(p.texto).replace(/\s+$/, '') });
  }
  function ponerEstado(t) { const el = $('#neGuardado'); if (el) el.textContent = t; }
  function marcarEstado() {
    clearTimeout(tEstado); ponerEstado('Guardando…');
    (function mirar() { if (pend) return; if (A.pendientes > 0) { tEstado = setTimeout(mirar, 150); return; } ponerEstado('Guardado ✓'); })();
  }

  /* ---------- editor fijo en la pestaña Notas ---------- */
  const panel = document.querySelector('[data-panel="notas"]');
  const caja = document.createElement('div'); caja.id = 'notasEditor'; caja.className = 'notas-editor';
  if (panel) panel.prepend(caja);
  function htmlCab() { return `<div class="ne-cab"><button class="prim ne-nueva" data-ne="nueva" title="Nueva nota: clic en el mapa donde va (N)">＋ Nota <kbd>N</kbd></button><span class="ayuda">${A.herramienta === 'nota' ? '<b>Haz clic en el mapa</b> donde va la nota.' : 'Clic aquí y luego en el mapa.'}</span></div>`; }
  function htmlFotos(o) { return (o.fotos || []).map((f, j) => `<div class="f"><button class="ver" data-ne="foto-grande" data-i="${j}" title="Ver grande"><img src="${esc(blob(f))}" alt="Foto ${j + 1} de la nota" loading="lazy"></button><button class="quitar" data-ne="quitar-foto" data-i="${j}" title="Quitar esta foto" aria-label="Quitar foto">&times;</button></div>`).join('') || '<span class="ayuda">Sin fotos.</span>'; }
  function htmlEditor(o) {
    const h = estado(o) === 'hecha';
    return `<div class="ne-tarjeta${h ? ' hecha' : ''}" data-id="${esc(o.id)}">
      <div class="ne-tit"><b>Editando nota</b> <span class="etq ${h ? '' : 'mod'}" id="neEtq">${h ? 'hecha' : 'pendiente'}</span><small id="neGuardado">Guardado ✓</small></div>
      <label class="sr" for="neTexto">Texto de la nota</label>
      <textarea id="neTexto" rows="5" placeholder="Escribe aquí qué hay que corregir o cómo debería ser… (se guarda solo)">${esc(o.texto || '')}</textarea>
      <div class="fotos" id="neFotos">${htmlFotos(o)}</div>
      <div class="fila"><button class="prim" data-ne="guardar">Guardar</button><button data-ne="subir" class="req-assets">＋ Subir foto</button><button data-ne="galeria" class="req-assets">De la galería</button></div>
      <div class="fila"><button data-ne="estado" id="neBEstado">${h ? '↺ Marcar pendiente' : '✔ Marcar hecha'}</button><button data-ne="ir">Ir a</button><button data-ne="grande">Ver en grande</button><button data-ne="borrar" class="peligro">Borrar</button><button data-ne="cerrar" title="Dejar de editar">Cerrar</button></div>
    </div>`;
  }
  let pintadoId = null;
  function pintar(forzar) {
    if (!panel) return;
    let cab = caja.querySelector('.ne-cab'); const html = htmlCab();
    if (!cab) { caja.innerHTML = html + '<div id="neCuerpo"></div>'; } else if (cab.outerHTML !== html) cab.outerHTML = html;
    const cuerpo = caja.querySelector('#neCuerpo'); const o = editando ? nv().get(editando) : null;
    if (!esNota(o)) { if (editando) editando = null; pintadoId = null; cuerpo.innerHTML = notas().length ? '<p class="ayuda ne-vacio">Elige una nota de la lista (<b>Editar</b>) o crea una con <b>＋ Nota</b>.</p>' : '<p class="ayuda ne-vacio">Todavía no hay notas. Pulsa <b>＋ Nota</b> y haz clic en el mapa.</p>'; return; }
    if (forzar || pintadoId !== o.id || !cuerpo.querySelector('#neTexto')) { cuerpo.innerHTML = htmlEditor(o); pintadoId = o.id; enganchar(cuerpo.querySelector('#neTexto'), () => editando); return; }
    /* misma nota: se actualiza lo de alrededor sin tocar el textarea mientras se escribe */
    const ta = cuerpo.querySelector('#neTexto'); if (document.activeElement !== ta && !(pend && pend.id === o.id) && ta.value !== (o.texto || '')) ta.value = o.texto || '';
    const fo = cuerpo.querySelector('#neFotos'), hf = htmlFotos(o); if (fo.dataset.h !== hf) { fo.innerHTML = hf; fo.dataset.h = hf; }
    const h = estado(o) === 'hecha'; cuerpo.querySelector('.ne-tarjeta').classList.toggle('hecha', h);
    const et = cuerpo.querySelector('#neEtq'); et.textContent = h ? 'hecha' : 'pendiente'; et.className = 'etq ' + (h ? '' : 'mod');
    cuerpo.querySelector('#neBEstado').textContent = h ? '↺ Marcar pendiente' : '✔ Marcar hecha';
  }
  /* un textarea (el del panel o el del inspector) guarda solo y copia lo escrito al otro */
  function enganchar(ta, idDe) {
    if (!ta || ta.dataset.ne) return; ta.dataset.ne = '1';
    ta.addEventListener('input', () => {
      const id = idDe(); if (!id) return; programar(id, ta.value);
      for (const otro of document.querySelectorAll('#neTexto, #notaTexto')) if (otro !== ta && (otro.id === 'neTexto' ? editando === id : A.sel.length === 1 && A.sel[0] === 'n' + id)) otro.value = ta.value;
    });
    ta.addEventListener('blur', () => { if (pend) guardarAhora(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ta.blur(); } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); guardarAhora(); A.pista('Nota guardada.'); } });
  }
  function enfocar() { const ta = $('#neTexto'); if (!ta) return; ta.focus({ preventScroll: true }); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { } const t = caja.querySelector('.ne-tarjeta'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest' }); }
  function editar(id, opt) {
    opt = opt || {}; const o = nv().get(id); if (!esNota(o)) return false;
    if (pend && pend.id !== id) guardarAhora();
    editando = id;
    if (opt.tab !== false && opt.tab) A.mostrarTab('notas', true);
    pintar(); if (window.OONotas && OONotas.pintarLista) OONotas.pintarLista();
    if (opt.foco) { enfocar(); setTimeout(enfocar, 140); } /* después del foco que pide editor.js al crearla (50 ms) */
    return true;
  }
  function nueva() {
    if (A.vista === 'caminar' && window.OOCaminar && OOCaminar.notaAqui) { OOCaminar.notaAqui(); return; }
    if (A.vista === 'caminar') A.ponerVista('3d');
    A.ponerHerramienta('nota'); A.pista('Haz clic en el mapa donde va la nota.'); pintar();
  }
  async function borrar(id) {
    const r = docDe(id); if (!r) return false;
    if (!(await A.confirmar('Borrar nota', 'Se borrará la nota' + (r.o.texto ? ' «' + r.o.texto.slice(0, 60) + '»' : '') + ' y sus fotos dejarán de estar enlazadas. Se puede deshacer con Ctrl+Z.', 'Borrar'))) return false;
    if (pend && pend.id === id) { pend = null; clearTimeout(tPend); }
    if (editando === id) editando = null;
    A.guardar([{ id: r.o.docId, data: null }], { etiqueta: 'Borrar nota' }); pintar(); return true;
  }

  /* ---------- notas recién creadas: editor abierto con el foco ---------- */
  const conocidas = new Set(); let listas = false; const recien = new Set();
  function revisar() {
    const ef = A.efectivos(), ahora = Date.now();
    for (const o of notas()) {
      if (conocidas.has(o.id)) continue; conocidas.add(o.id);
      const d = ef.get(o.docId), t = d && Date.parse(d.creado);
      if (listas || (t && ahora - t < 5000)) { recien.add(o.id); setTimeout(() => recien.delete(o.id), 4000); } /* la primera vez solo cuentan las recién creadas */
    }
    listas = true;
  }
  E.on('mapa', () => { conocidas.clear(); listas = false; editando = null; pend = null; });
  E.on('recompute', () => { revisar(); pintar(); });
  E.on('seleccion', keys => {
    revisar();
    if (keys && keys.length === 1 && keys[0][0] === 'n') { const id = keys[0].slice(1), o = nv().get(id); if (esNota(o)) { const esNueva = recien.has(id); recien.delete(id); editar(id, esNueva ? { foco: true, tab: true } : {}); } }
  });
  E.on('tab', t => { if (t === 'notas') pintar(); });
  E.on('vista', () => pintar());

  /* ---------- inspector: «Nota y fotos» abierta, arriba y con guardado automático ---------- */
  E.on('panel', () => {
    const ta = $('#notaTexto'); if (!ta) return; const sec = ta.closest('details'); if (!sec) return;
    const k = A.sel.length === 1 ? A.sel[0] : null, o = k && k[0] === 'n' ? nv().get(k.slice(1)) : null;
    if (esNota(o)) {
      sec.open = true; sec.classList.add('ne-insp');
      const c = sec.parentElement, primero = c && c.querySelector(':scope > details.sec'); if (primero && primero !== sec) c.insertBefore(sec, primero);
      if (pend && pend.id === o.id) ta.value = pend.texto;
      enganchar(ta, () => (A.sel.length === 1 && A.sel[0] === k) ? o.id : null);
    } else if (!ta.dataset.ne) {
      /* nota sobre piezas del mapa: también se guarda sola (con el guardado de editor.js) */
      ta.dataset.ne = '1'; let t = 0; const b = () => document.querySelector('#objCuerpo [data-a="nota-guardar"]');
      ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const x = b(); if (x) x.click(); }, RETARDO); });
      ta.addEventListener('blur', () => { if (t) { clearTimeout(t); t = 0; const x = b(); if (x) x.click(); } });
    }
  });

  /* ---------- botones ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ne]'); if (!b) return; const a = b.dataset.ne, id = b.dataset.id || editando;
    if (a === 'nueva') { nueva(); return; }
    if (a === 'editar') { editar(b.dataset.id, { foco: true, tab: true }); A.seleccionar(['n' + b.dataset.id], { sinTab: true }); return; }
    if (a === 'borrar') { borrar(id); return; }
    if (!id) return; const o = nv().get(id); if (!esNota(o)) return;
    if (a === 'guardar') { const ta = $('#neTexto'); if (ta && editando === id && !pend) programar(id, ta.value); guardarAhora(); A.pista('Nota guardada.'); }
    if (a === 'cerrar') { guardarAhora(); editando = null; pintar(); if (window.OONotas && OONotas.pintarLista) OONotas.pintarLista(); }
    if (a === 'estado') { guardarAhora(); if (window.OONotas) OONotas.marcar(id, estado(o) === 'hecha' ? 'pendiente' : 'hecha'); }
    if (a === 'ir') { guardarAhora(); if (A.vista === 'caminar') A.ponerVista('3d'); const k = 'n' + id; A.seleccionar([k], { sinTab: true }); A.encuadrarCaja(A.cajaEntidades([k])); }
    if (a === 'grande') { guardarAhora(); if (window.OONotas) OONotas.abrir(id); }
    if (a === 'foto-grande') { const f = (o.fotos || [])[+b.dataset.i]; if (f) A.abrirModal(`<div class="cab">Foto de la nota</div><div class="cont nota-grande"><img class="foto-grande" src="${esc(blob(f))}" alt="Foto de la nota"></div><div class="pie"><button class="prim" data-a="m-no">Cerrar</button></div>`, 'ancho'); }
    if (a === 'quitar-foto') { guardarAhora(); const f = (o.fotos || []).slice(); f.splice(+b.dataset.i, 1); guardarDoc(id, { fotos: f }, 'Quitar foto de la nota'); }
    if (a === 'subir') { guardarAhora(); if (A.pedirArchivos) A.pedirArchivos(ids => { if (!ids || !ids.length) return; const o2 = nv().get(id); if (!o2) return; guardarDoc(id, { fotos: (o2.fotos || []).concat(ids.map(x => x.id).filter(x => !(o2.fotos || []).includes(x))) }, 'Foto a la nota'); }, true); }
    if (a === 'galeria') { guardarAhora(); if (A.elegirGaleria) A.elegirGaleria(true, 'Adjuntar fotos a la nota').then(ids => { if (!ids || !ids.length) return; const o2 = nv().get(id); if (!o2) return; guardarDoc(id, { fotos: (o2.fotos || []).concat(ids.filter(x => !(o2.fotos || []).includes(x))) }, 'Foto a la nota'); }); }
  });
  /* antes de cambiar de herramienta, de vista o de cerrar la página no se pierde lo escrito */
  window.addEventListener('beforeunload', () => { if (pend) guardarAhora(); });

  /* botón «＋ Nota» en la barra de la vista */
  const bf = document.getElementById('barraFlot');
  if (bf && !bf.querySelector('.ne-btn-vista')) bf.insertAdjacentHTML('beforeend', '<button data-ne="nueva" class="ne-btn-vista" title="Nueva nota (N): clic en el mapa donde va" aria-label="Nueva nota">＋ Nota</button>');
  const pintarCab = () => { const c = caja.querySelector('.ne-cab'); if (c && c.outerHTML !== htmlCab()) c.outerHTML = htmlCab(); document.querySelectorAll('[data-ne="nueva"]').forEach(x => x.classList.toggle('on', A.herramienta === 'nota')); };
  E.on('herramienta', pintarCab); E.on('panel', pintarCab);
  pintar();

  window.OONotasEditor = { editar, nueva, guardarAhora, borrar, pintar, get editando() { return editando; }, get pendiente() { return pend ? Object.assign({}, pend) : null; } };
})();
