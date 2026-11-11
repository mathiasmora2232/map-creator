/* Map Creator: panel del usuario (/app). Vistas por hash: #mapas, #compartidos, #plantillas, #papelera, #atajos y #cuenta. */
(function () {
  'use strict';
  const { api, esc, aviso, fechaRel, miniatura } = window.MC;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const principal = $('#principal'), app = $('#app');
  const ROL = { dueno: 'Dueño', editor: 'Editor', lector: 'Solo ver' };
  const NOMBRE_PLANTILLA = { vacio: 'En blanco', complejo: 'Complejo', parqueadero: 'Parqueadero', copia: 'Copia', importado: 'Importado' };
  let yo = null, proyectos = [], plantillas = [], filtro = '';

  const urlEditor = p => '/editor/?p=' + encodeURIComponent(p.id) + '&m=' + encodeURIComponent(p.mapa_inicial);
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

  async function cargarYo() {
    yo = await api('/api/cuenta/yo');
    $('#yoNombre').textContent = yo.nombre; $('#yoEmail').textContent = yo.email; $('#yoAvatar').textContent = iniciales(yo.nombre);
  }
  async function cargarProyectos() {
    proyectos = await api('/api/proyectos');
    const mios = proyectos.filter(p => p.rol === 'dueno').length;
    $('[data-n="mapas"]').textContent = mios || '';
    $('[data-n="compartidos"]').textContent = (proyectos.length - mios) || '';
  }

  // ───────────── Vistas ─────────────
  function cabecera(titulo, desc, herr) {
    return `<div class="principal-cab"><h1>${esc(titulo)}</h1>${herr ? `<div class="herr">${herr}</div>` : ''}${desc ? `<p class="desc">${desc}</p>` : ''}</div>`;
  }
  const buscador = `<input type="search" id="buscar" placeholder="Buscar mapas…" aria-label="Buscar mapas" value="${esc(filtro)}">`;

  function tarjeta(p, papelera) {
    const meta = papelera
      ? `<span>En la papelera ${fechaRel(p.archivado)}</span>`
      : `<span>Editado ${fechaRel(p.actualizado)}</span><span>${p.n_cambios} cambios</span>${p.n_miembros > 1 ? `<span>${p.n_miembros} personas</span>` : ''}`;
    return `<article class="tarjeta" data-id="${esc(p.id)}">
      <a class="mini" href="${papelera ? '#papelera' : urlEditor(p)}" tabindex="-1" aria-hidden="true">${miniatura(p.id)}<span class="etq">${esc(NOMBRE_PLANTILLA[p.plantilla] || p.plantilla)}</span></a>
      <div class="info">
        <h3>${papelera ? esc(p.nombre) : `<a href="${urlEditor(p)}">${esc(p.nombre)}</a>`}</h3>
        <div class="meta">${p.rol !== 'dueno' ? `<span class="rol ${esc(p.rol)}">${esc(ROL[p.rol])}</span><span>de ${esc(p.dueno_nombre)}</span>` : ''}${meta}</div>
      </div>
      <button class="btn icono fantasma acc" data-a="menu-proyecto" data-id="${esc(p.id)}" aria-label="Opciones de ${esc(p.nombre)}" aria-haspopup="menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>
    </article>`;
  }

  function vistaLista(tipo) {
    const lista = proyectos.filter(p => (tipo === 'mapas' ? p.rol === 'dueno' : p.rol !== 'dueno'))
      .filter(p => !filtro || (p.nombre + ' ' + p.descripcion).toLowerCase().includes(filtro.toLowerCase()));
    const titulo = tipo === 'mapas' ? 'Mis mapas' : 'Compartidos conmigo';
    const desc = tipo === 'mapas' ? '' : 'Mapas de otras personas en los que eres editor o lector.';
    let cuerpo;
    if (lista.length) cuerpo = `<div class="tarjetas">${lista.map(p => tarjeta(p)).join('')}</div>`;
    else if (filtro) cuerpo = `<div class="vacio"><h3>Nada coincide con «${esc(filtro)}»</h3><p>Prueba con otro nombre.</p></div>`;
    else if (tipo === 'mapas') cuerpo = `<div class="vacio"><h3>Todavía no tienes mapas</h3><p>Crea uno en blanco o empieza desde una plantilla de ejemplo para aprender las herramientas.</p><button class="btn prim" data-a="nuevo">Crear mi primer mapa</button></div>`;
    else cuerpo = `<div class="vacio"><h3>Nadie ha compartido mapas contigo</h3><p>Cuando alguien te invite con tu correo (${esc(yo.email)}), el mapa aparecerá aquí.</p></div>`;
    principal.innerHTML = cabecera(titulo, desc, buscador + (tipo === 'mapas' ? '<button class="btn prim" data-a="nuevo">Nuevo mapa</button>' : '')) + cuerpo;
    const b = $('#buscar');
    b.addEventListener('input', () => { filtro = b.value; const pos = b.selectionStart; vistaLista(tipo); const n = $('#buscar'); n.focus(); n.setSelectionRange(pos, pos); });
  }

  async function vistaPapelera() {
    principal.innerHTML = cabecera('Papelera', 'Los mapas borrados se quedan aquí hasta que los borres para siempre.') + '<div class="cargando">Cargando…</div>';
    const lista = await api('/api/proyectos?papelera=true');
    principal.innerHTML = cabecera('Papelera', 'Los mapas borrados se quedan aquí hasta que los borres para siempre.')
      + (lista.length ? `<div class="tarjetas">${lista.map(p => tarjeta(p, true)).join('')}</div>` : '<div class="vacio"><h3>La papelera está vacía</h3></div>');
    principal.querySelectorAll('.tarjeta').forEach(t => { t.dataset.papelera = '1'; });
  }

  function htmlPlantillas(sel) {
    return plantillas.map(t => `<button type="button" class="plantilla${t.id === sel ? ' on' : ''}" data-plantilla="${esc(t.id)}" aria-pressed="${t.id === sel}">
      <span class="mini">${miniatura('plantilla-' + t.id, { ancho: 320, alto: 160, acento: t.id !== 'vacio' })}</span>
      <span class="info"><b>${esc(t.nombre)}<small>${esc(t.etiqueta)}</small></b><p>${esc(t.descripcion)}</p></span></button>`).join('');
  }
  function vistaPlantillas() {
    principal.innerHTML = cabecera('Plantillas', 'Empieza un mapa nuevo desde una de estas bases.') + `<div class="plantillas">${htmlPlantillas()}</div>`;
    principal.querySelectorAll('[data-plantilla]').forEach(b => b.addEventListener('click', () => abrirNuevo(b.dataset.plantilla)));
  }

  function vistaAtajos() {
    const g = (t, l) => `<div class="caja"><h2>${t}</h2><div style="display:grid;gap:8px">${l.map(([k, d]) => `<div style="display:flex;justify-content:space-between;gap:16px;font-size:14.5px"><span>${d}</span><kbd class="mono" style="background:var(--bg2);border:1px solid var(--line);border-radius:5px;padding:2px 7px;font-size:12.5px;white-space:nowrap">${k}</kbd></div>`).join('')}</div></div>`;
    principal.innerHTML = cabecera('Atajos del editor', 'Dentro del editor pulsa <kbd>?</kbd> para ver la hoja completa.') + `<div class="ajustes" style="max-width:none;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      ${g('Cámara', [['Rueda', 'Zoom hacia el cursor'], ['Botón central', 'Desplazar'], ['Botón derecho', 'Orbitar'], ['Inicio', 'Ver todo el mapa'], ['W A S D', 'Mover la cámara'], ['1 / 4 / 5', 'Planta / isométrica / caminar']])}
      ${g('Edición', [['Clic', 'Seleccionar'], ['Mayús+clic', 'Añadir o quitar'], ['Alt+arrastrar', 'Copiar y mover'], ['M / G / K', 'Mover, girar, escalar'], ['Supr', 'Borrar'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'], ['Ctrl+G', 'Agrupar'], ['F', 'Encuadrar la selección']])}
      ${g('Herramientas', [['L', 'Pared'], ['H', 'Habitación'], ['U', 'Puerta'], ['I', 'Ventana'], ['X', 'Techo'], ['B', 'Pintar'], ['T', 'Medir'], ['C', 'Catálogo'], ['N', 'Nota'], ['Enter', 'Terminar pared o polígono']])}
    </div>`;
  }

  function vistaCuenta() {
    principal.innerHTML = cabecera('Cuenta') + `<div class="ajustes">
      <form class="caja" id="formNombre"><h2>Perfil</h2>
        <label class="campo"><span>Nombre</span><input type="text" name="nombre" maxlength="80" required value="${esc(yo.nombre)}"></label>
        <label class="campo"><span>Correo</span><input type="email" value="${esc(yo.email)}" disabled></label>
        <div><button class="btn prim" type="submit">Guardar</button></div></form>
      <form class="caja" id="formClave"><h2>Contraseña</h2><p class="ayuda">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
        <label class="campo"><span>Contraseña actual</span><input type="password" name="clave_actual" autocomplete="current-password" required></label>
        <label class="campo"><span>Contraseña nueva</span><input type="password" name="clave_nueva" autocomplete="new-password" minlength="8" required><small>Mínimo 8 caracteres.</small></label>
        <p class="error-form" id="errClave" role="alert"></p>
        <div><button class="btn prim" type="submit">Cambiar contraseña</button></div></form>
    </div>`;
    $('#formNombre').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/cuenta/yo', { method: 'PATCH', json: { nombre: e.target.nombre.value } }); await cargarYo(); aviso('Nombre guardado.'); }
      catch (ex) { aviso(ex.message, 'err'); }
    });
    $('#formClave').addEventListener('submit', async e => {
      e.preventDefault(); $('#errClave').textContent = '';
      const d = Object.fromEntries(new FormData(e.target));
      if (d.clave_nueva.length < 8) { $('#errClave').textContent = 'La contraseña nueva necesita al menos 8 caracteres.'; return; }
      try { await api('/api/cuenta/yo', { method: 'PATCH', json: d }); e.target.reset(); aviso('Contraseña cambiada.'); }
      catch (ex) { $('#errClave').textContent = ex.message; }
    });
  }

  async function mostrar() {
    const vista = (location.hash || '#mapas').slice(1);
    $$('.menu a').forEach(a => a.classList.toggle('on', a.dataset.vista === vista));
    app.classList.remove('menu-abierto');
    document.title = ({ mapas: 'Mis mapas', compartidos: 'Compartidos conmigo', plantillas: 'Plantillas', papelera: 'Papelera', atajos: 'Atajos', cuenta: 'Cuenta' }[vista] || 'Mis mapas') + ' · Map Creator';
    try {
      if (vista === 'compartidos') vistaLista('compartidos');
      else if (vista === 'plantillas') vistaPlantillas();
      else if (vista === 'papelera') await vistaPapelera();
      else if (vista === 'atajos') vistaAtajos();
      else if (vista === 'cuenta') vistaCuenta();
      else vistaLista('mapas');
    } catch (ex) { principal.innerHTML = `<div class="vacio"><h3>No se pudo cargar</h3><p>${esc(ex.message)}</p></div>`; }
  }

  // ───────────── Nuevo mapa ─────────────
  const dlgNuevo = $('#dlgNuevo'), formNuevo = $('#formNuevo');
  let plantillaSel = 'vacio';
  function abrirNuevo(plantilla) {
    plantillaSel = plantilla || 'vacio';
    formNuevo.reset(); $('#errNuevo').textContent = '';
    $('#nuevoPlantillas').innerHTML = htmlPlantillas(plantillaSel);
    $('#nuevoTam').hidden = plantillaSel !== 'vacio';
    nombreAuto = ''; sugerirNombre();
    dlgNuevo.showModal(); formNuevo.nombre.focus(); formNuevo.nombre.select();
  }
  // Con una plantilla de ejemplo, propone su nombre mientras el usuario no haya escrito otro.
  let nombreAuto = '';
  function sugerirNombre() {
    const campo = formNuevo.nombre;
    if (campo.value.trim() && campo.value !== nombreAuto) return;
    const t = plantillas.find(x => x.id === plantillaSel);
    nombreAuto = t && plantillaSel !== 'vacio' ? t.nombre : '';
    campo.value = nombreAuto;
  }
  $('#nuevoPlantillas').addEventListener('click', e => {
    const b = e.target.closest('[data-plantilla]'); if (!b) return;
    plantillaSel = b.dataset.plantilla;
    $$('#nuevoPlantillas .plantilla').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    $('#nuevoTam').hidden = plantillaSel !== 'vacio';
    sugerirNombre();
  });
  formNuevo.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(formNuevo));
    if (!d.nombre.trim()) { $('#errNuevo').textContent = 'Ponle un nombre al mapa.'; formNuevo.nombre.focus(); return; }
    $('#bCrear').disabled = true;
    try {
      const p = await api('/api/proyectos', { method: 'POST', json: { nombre: d.nombre, plantilla: plantillaSel, ancho: +d.ancho, largo: +d.largo, terreno: d.terreno } });
      location.href = urlEditor(p);
    } catch (ex) { $('#errNuevo').textContent = ex.message; $('#bCrear').disabled = false; }
  });

  // ───────────── Menú de cada mapa ─────────────
  let menuAbierto = null;
  function cerrarMenu() { if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; } }
  function abrirMenuProyecto(boton) {
    cerrarMenu();
    const papelera = !!boton.closest('[data-papelera]');
    const id = boton.dataset.id, p = proyectos.find(x => x.id === id) || { id, rol: 'dueno' };
    const op = (a, t, cls) => `<button role="menuitem" data-a="${a}" data-id="${esc(id)}"${cls ? ` class="${cls}"` : ''}>${t}</button>`;
    let html = '';
    if (papelera) html = op('restaurar', 'Restaurar') + '<hr>' + op('borrar-definitivo', 'Borrar para siempre', 'peligro');
    else {
      html = op('abrir', 'Abrir en el editor') + op('abrir-nueva', 'Abrir en otra pestaña');
      if (p.rol !== 'lector') html += op('renombrar', 'Renombrar…');
      html += op('compartir', p.rol === 'dueno' ? 'Compartir…' : 'Ver quién tiene acceso') + op('duplicar', 'Hacer una copia');
      html += '<hr>' + (p.rol === 'dueno' ? op('borrar', 'Mover a la papelera', 'peligro') : op('salir-proyecto', 'Salir de este mapa', 'peligro'));
    }
    const m = document.createElement('div'); m.className = 'menu-ctx'; m.setAttribute('role', 'menu'); m.innerHTML = html;
    document.body.appendChild(m); menuAbierto = m;
    const r = boton.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    m.querySelector('button').focus();
  }

  async function accion(a, id) {
    const p = proyectos.find(x => x.id === id);
    if (a === 'abrir') location.href = urlEditor(p);
    else if (a === 'abrir-nueva') window.open(urlEditor(p), '_blank', 'noopener');
    else if (a === 'renombrar') {
      const f = $('#formRenombrar'); f.nombre.value = p.nombre; f.descripcion.value = p.descripcion || '';
      $('#dlgRenombrar').showModal(); f.nombre.select();
      f.onsubmit = async e => {
        e.preventDefault();
        if (!f.nombre.value.trim()) { aviso('El nombre no puede quedar vacío.', 'err'); f.nombre.focus(); return; }
        try { await api('/api/proyectos/' + id, { method: 'PATCH', json: { nombre: f.nombre.value, descripcion: f.descripcion.value } }); $('#dlgRenombrar').close(); await refrescar(); aviso('Mapa renombrado.'); }
        catch (ex) { aviso(ex.message, 'err'); }
      };
    }
    else if (a === 'compartir') abrirCompartir(p);
    else if (a === 'duplicar') {
      aviso('Haciendo la copia…');
      try { const n = await api('/api/proyectos/' + id + '/duplicar', { method: 'POST' }); await refrescar(); aviso('Copia creada: «' + n.nombre + '».'); location.hash = '#mapas'; }
      catch (ex) { aviso(ex.message, 'err'); }
    }
    else if (a === 'borrar') {
      if (!confirm('¿Mover «' + p.nombre + '» a la papelera? Puedes restaurarlo después.')) return;
      await api('/api/proyectos/' + id, { method: 'DELETE' }); await refrescar(); aviso('Movido a la papelera.');
    }
    else if (a === 'salir-proyecto') {
      if (!confirm('¿Salir de «' + p.nombre + '»? Ya no lo verás hasta que te vuelvan a invitar.')) return;
      await api('/api/proyectos/' + id + '/miembros/' + yo.id, { method: 'DELETE' }); await refrescar(); aviso('Saliste del mapa.');
    }
    else if (a === 'restaurar') { await api('/api/proyectos/' + id + '/restaurar', { method: 'POST' }); await refrescar(); aviso('Mapa restaurado.'); }
    else if (a === 'borrar-definitivo') {
      if (!confirm('¿Borrar para siempre? Se pierden todos sus cambios y archivos. No se puede deshacer.')) return;
      await api('/api/proyectos/' + id + '?definitivo=true', { method: 'DELETE' }); await refrescar(); aviso('Borrado para siempre.');
    }
  }

  // ───────────── Compartir ─────────────
  let compartiendo = null;
  async function pintarMiembros() {
    const p = compartiendo, lista = await api('/api/proyectos/' + p.id + '/miembros'), dueno = p.rol === 'dueno';
    $('#listaMiembros').innerHTML = lista.map(m => `<div class="miembro"><span class="avatar">${esc(iniciales(m.nombre))}</span>
      <span class="datos"><b>${esc(m.nombre)}${m.id === yo.id ? ' (tú)' : ''}</b><small>${esc(m.email)}</small></span>
      ${m.rol === 'dueno' || !dueno ? `<span class="rol">${esc(ROL[m.rol])}</span>` : `<select data-miembro="${esc(m.id)}" aria-label="Permiso de ${esc(m.nombre)}">
        <option value="editor"${m.rol === 'editor' ? ' selected' : ''}>Puede editar</option><option value="lector"${m.rol === 'lector' ? ' selected' : ''}>Solo ver</option><option value="__quitar">Quitar acceso</option></select>`}</div>`).join('');
  }
  function abrirCompartir(p) {
    compartiendo = p;
    $('#tCompartir').textContent = 'Compartir «' + p.nombre + '»';
    $('#formInvitar').hidden = p.rol !== 'dueno'; $('#errInvitar').textContent = '';
    $('#listaMiembros').innerHTML = '<div class="cargando">Cargando…</div>';
    $('#dlgCompartir').showModal(); pintarMiembros();
  }
  $('#formInvitar').addEventListener('submit', async e => {
    e.preventDefault(); $('#errInvitar').textContent = '';
    const d = Object.fromEntries(new FormData(e.target));
    try { await api('/api/proyectos/' + compartiendo.id + '/miembros', { method: 'POST', json: d }); e.target.reset(); await pintarMiembros(); aviso('Invitación hecha: ya puede abrir el mapa.'); refrescar(); }
    catch (ex) { $('#errInvitar').textContent = ex.message; }
  });
  $('#listaMiembros').addEventListener('change', async e => {
    const s = e.target.closest('[data-miembro]'); if (!s) return;
    const ruta = '/api/proyectos/' + compartiendo.id + '/miembros/' + s.dataset.miembro;
    try {
      if (s.value === '__quitar') await api(ruta, { method: 'DELETE' });
      else await api(ruta, { method: 'PATCH', json: { rol: s.value } });
      await pintarMiembros(); aviso('Permisos actualizados.'); refrescar();
    } catch (ex) { aviso(ex.message, 'err'); }
  });

  // ───────────── Eventos generales ─────────────
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (menuAbierto && !e.target.closest('.menu-ctx')) cerrarMenu();
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'nuevo') abrirNuevo();
    else if (a === 'salir') api('/api/cuenta/salir', { method: 'POST' }).finally(() => { location.href = '/'; });
    else if (a === 'abrir-menu') app.classList.add('menu-abierto');
    else if (a === 'cerrar-menu') app.classList.remove('menu-abierto');
    else if (a === 'cerrar-dlg') b.closest('dialog').close();
    else if (a === 'menu-proyecto') { e.preventDefault(); abrirMenuProyecto(b); }
    else if (b.closest('.menu-ctx')) { cerrarMenu(); accion(a, b.dataset.id).catch(ex => aviso(ex.message, 'err')); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarMenu();
    if (menuAbierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); const bs = [...menuAbierto.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    }
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !/input|textarea|select/i.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); abrirNuevo(); }
  });
  addEventListener('hashchange', mostrar);
  async function refrescar() { await cargarProyectos(); await mostrar(); }

  (async () => {
    try { [, , plantillas] = await Promise.all([cargarYo(), cargarProyectos(), api('/api/plantillas')]); }
    catch (ex) { principal.innerHTML = `<div class="vacio"><h3>No se pudo conectar</h3><p>${esc(ex.message)}</p></div>`; return; }
    await mostrar();
  })();
})();
