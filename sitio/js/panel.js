/* Map Creator: panel del usuario (/app). Vistas por hash: #inicio, #mapas, #compartidos, #favoritos, #plantillas, #papelera,
   #atajos, #cuenta y #admin (solo administradores). */
(function () {
  'use strict';
  const { api, esc, aviso, fechaRel, miniatura } = window.MC;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const principal = $('#principal'), app = $('#app');
  const ROL = { dueno: 'Dueño', editor: 'Editor', lector: 'Solo ver' };
  const NOMBRE_PLANTILLA = { vacio: 'En blanco', complejo: 'Complejo', parqueadero: 'Parqueadero', copia: 'Copia', importado: 'Importado' };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  let yo = null, proyectos = [], plantillas = [], filtro = '';
  let orden = ls('mc-orden') || 'editado', modoVista = ls('mc-vista') === 'lista' ? 'lista' : 'cuadricula';

  const urlEditor = (p, extra) => '/editor/?p=' + encodeURIComponent(p.id) + '&m=' + encodeURIComponent(p.mapa_inicial) + (extra || '');
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const pref = k => (yo && yo.preferencias || {})[k];
  async function guardarPref(cambios) {
    Object.assign(yo.preferencias, cambios);
    try { const r = await api('/api/cuenta/yo', { method: 'PATCH', json: { preferencias: cambios } }); yo.preferencias = r.preferencias; } catch (e) { /* no es grave */ }
  }
  const fechaFut = iso => {
    if (!iso) return 'no caduca';
    const s = (new Date(iso).getTime() - Date.now()) / 1000;
    if (s <= 0) return 'caducado';
    if (s < 3600) return 'caduca en ' + Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return 'caduca en ' + Math.round(s / 3600) + ' h';
    const d = Math.round(s / 86400); return 'caduca en ' + d + (d === 1 ? ' día' : ' días');
  };
  const tamano = b => b < 1048576 ? Math.round(b / 1024) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    aviso('Enlace copiado.');
  }

  async function cargarYo() {
    yo = await api('/api/cuenta/yo');
    yo.preferencias = yo.preferencias || {};
    $('#yoNombre').textContent = yo.nombre; $('#yoEmail').textContent = yo.email; $('#yoAvatar').textContent = iniciales(yo.nombre);
    $$('[data-solo-admin]').forEach(el => { el.hidden = !yo.es_admin; });
  }
  async function cargarProyectos() {
    proyectos = await api('/api/proyectos');
    contar();
  }
  function contar() {
    const mios = proyectos.filter(p => p.rol === 'dueno').length;
    $('[data-n="mapas"]').textContent = mios || '';
    $('[data-n="compartidos"]').textContent = (proyectos.length - mios) || '';
    $('[data-n="favoritos"]').textContent = proyectos.filter(p => p.favorito).length || '';
  }

  // ───────────── Piezas ─────────────
  function cabecera(titulo, desc, herr) {
    return `<div class="principal-cab"><h1>${esc(titulo)}</h1>${herr ? `<div class="herr">${herr}</div>` : ''}${desc ? `<p class="desc">${desc}</p>` : ''}</div>`;
  }
  const ICONO_ESTRELLA = '<svg width="17" height="17" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
  const ICONO_MAS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
  const estrella = p => `<button class="estrella${p.favorito ? ' on' : ''}" data-a="favorito" data-id="${esc(p.id)}" aria-pressed="${!!p.favorito}"
      aria-label="${p.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}" title="${p.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${ICONO_ESTRELLA}</button>`;
  const quien = p => p.rol !== 'dueno' ? `<span class="rol ${esc(p.rol)}">${esc(ROL[p.rol])}</span><span>de ${esc(p.dueno_nombre)}</span>` : '';

  function tarjeta(p, papelera) {
    const meta = papelera
      ? `<span>En la papelera ${fechaRel(p.archivado)}</span>`
      : `<span>Editado ${fechaRel(p.actualizado)}</span><span>${p.n_cambios} cambios</span>${p.n_miembros > 1 ? `<span>${p.n_miembros} personas</span>` : ''}`;
    return `<article class="tarjeta" data-id="${esc(p.id)}"${papelera ? ' data-papelera="1"' : ''}>
      <a class="mini" href="${papelera ? '#papelera' : urlEditor(p)}" tabindex="-1" aria-hidden="true">${miniatura(p.id)}<span class="etq">${esc(NOMBRE_PLANTILLA[p.plantilla] || p.plantilla)}</span></a>
      ${papelera ? '' : estrella(p)}
      <div class="info">
        <h3>${papelera ? esc(p.nombre) : `<a href="${urlEditor(p)}">${esc(p.nombre)}</a>`}</h3>
        <div class="meta">${quien(p)}${meta}</div>
      </div>
      <button class="btn icono fantasma acc" data-a="menu-proyecto" data-id="${esc(p.id)}" aria-label="Opciones de ${esc(p.nombre)}" aria-haspopup="menu">${ICONO_MAS}</button>
    </article>`;
  }
  function fila(p) {
    return `<div class="fila-mapa" role="row" data-id="${esc(p.id)}">
      <span class="fm-mini" aria-hidden="true">${miniatura(p.id, { ancho: 320, alto: 200 })}</span>
      <span class="fm-nombre" role="cell"><a href="${urlEditor(p)}">${esc(p.nombre)}</a><small>${esc(NOMBRE_PLANTILLA[p.plantilla] || p.plantilla)}${p.descripcion ? ' · ' + esc(p.descripcion) : ''}</small></span>
      <span class="fm-quien" role="cell">${p.rol === 'dueno' ? 'Tú' : esc(p.dueno_nombre)}${p.n_miembros > 1 ? ` · ${p.n_miembros} personas` : ''}</span>
      <span class="fm-fecha" role="cell">${fechaRel(p.actualizado)}</span>
      <span class="fm-acc" role="cell">${estrella(p)}<button class="btn icono fantasma" data-a="menu-proyecto" data-id="${esc(p.id)}" aria-label="Opciones de ${esc(p.nombre)}" aria-haspopup="menu">${ICONO_MAS}</button></span>
    </div>`;
  }
  const ORDENES = { editado: 'Editados hace poco', abierto: 'Abiertos hace poco', nombre: 'Nombre (A-Z)', creado: 'Más nuevos' };
  function ordenar(lista) {
    const t = x => x ? new Date(x).getTime() : 0;
    const f = { editado: (a, b) => t(b.actualizado) - t(a.actualizado), abierto: (a, b) => t(b.abierto) - t(a.abierto) || t(b.actualizado) - t(a.actualizado),
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }), creado: (a, b) => t(b.creado) - t(a.creado) }[orden];
    return lista.slice().sort(f);
  }
  function rejilla(lista) {
    if (modoVista === 'lista') return `<div class="lista-mapas" role="table" aria-label="Mapas"><div class="fila-mapa cab" role="row"><span></span><span role="columnheader">Nombre</span><span role="columnheader">Dueño</span><span role="columnheader">Editado</span><span></span></div>${lista.map(fila).join('')}</div>`;
    return `<div class="tarjetas">${lista.map(p => tarjeta(p)).join('')}</div>`;
  }
  const herramientas = conNuevo => `<input type="search" id="buscar" placeholder="Buscar mapas…" aria-label="Buscar mapas" value="${esc(filtro)}">
    <select id="orden" aria-label="Ordenar">${Object.entries(ORDENES).map(([k, v]) => `<option value="${k}"${k === orden ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <div class="seg-vista" role="group" aria-label="Ver como">
      <button data-a="ver-como" data-v="cuadricula" aria-pressed="${modoVista === 'cuadricula'}" title="Cuadrícula"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg></button>
      <button data-a="ver-como" data-v="lista" aria-pressed="${modoVista === 'lista'}" title="Lista"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button>
    </div>${conNuevo ? '<button class="btn prim" data-a="nuevo">Nuevo mapa</button>' : ''}`;

  // ───────────── Vistas ─────────────
  function vistaInicio() {
    const primer = String(yo.nombre).trim().split(/\s+/)[0];
    const recientes = proyectos.slice().sort((a, b) => new Date(b.abierto || b.actualizado) - new Date(a.abierto || a.actualizado)).slice(0, 4);
    const hora = new Date().getHours(), saludo = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
    let html = `<div class="hola"><div><h1>${saludo}, ${esc(primer)}</h1><p>${proyectos.length ? 'Sigue donde lo dejaste o empieza algo nuevo.' : 'Bienvenido. Tu primer mapa está a un clic.'}</p></div>
      <div class="hola-acc"><button class="btn" data-a="recorrido">Ver el recorrido</button><button class="btn prim" data-a="nuevo">Nuevo mapa</button></div></div>`;
    html += pasosHtml();
    if (recientes.length) html += `<section class="bloque"><div class="bloque-cab"><h2>Continuar</h2><a href="#mapas">Ver todos</a></div><div class="tarjetas">${recientes.map(p => tarjeta(p)).join('')}</div></section>`;
    html += `<section class="bloque"><div class="bloque-cab"><h2>Empezar desde una plantilla</h2><a href="#plantillas">Ver plantillas</a></div><div class="plantillas">${htmlPlantillas()}</div></section>`;
    principal.innerHTML = html;
    principal.querySelectorAll('.plantillas [data-plantilla]').forEach(b => b.addEventListener('click', () => abrirNuevo(b.dataset.plantilla)));
  }

  // Primeros pasos: se deducen de los datos (nada que marcar a mano) y se pueden ocultar.
  function pasosHtml() {
    if (pref('pasos_ocultos')) return '';
    const mios = proyectos.filter(p => p.rol === 'dueno');
    const pasos = [
      { ok: mios.length > 0, t: 'Crea tu primer mapa', d: 'En blanco o desde una plantilla de ejemplo.', a: 'nuevo', b: 'Crear' },
      { ok: proyectos.some(p => p.abierto), t: 'Abre el editor', d: 'Dibuja en 2D o 3D y todo se guarda solo.', a: 'paso-abrir', b: 'Abrir' },
      { ok: !!pref('recorrido_editor'), t: 'Haz el recorrido del editor', d: 'Dos minutos para conocer herramientas, catálogo y vistas.', a: 'paso-recorrido', b: 'Empezar' },
      { ok: !!pref('enlace_creado') || mios.some(p => p.n_miembros > 1), t: 'Comparte un mapa', d: 'Crea un enlace de invitación para que otra persona edite contigo.', a: 'paso-compartir', b: 'Compartir' },
      { ok: proyectos.some(p => p.favorito), t: 'Marca un favorito', d: 'Pulsa ★ en un mapa para tenerlo siempre a mano.', a: 'paso-favorito', b: 'Ver mapas' }
    ];
    const hechos = pasos.filter(p => p.ok).length;
    if (hechos === pasos.length) return `<section class="primeros listo"><div><b>Ya dominas lo básico.</b> Completaste los primeros pasos.</div><button class="btn fantasma" data-a="ocultar-pasos">Ocultar</button></section>`;
    return `<section class="primeros" aria-label="Primeros pasos"><div class="primeros-cab"><h2>Primeros pasos</h2><span class="mono">${hechos}/${pasos.length}</span>
        <div class="barra-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${pasos.length}" aria-valuenow="${hechos}"><i style="width:${hechos / pasos.length * 100}%"></i></div>
        <button class="btn fantasma" data-a="ocultar-pasos">Ocultar</button></div>
      <ol>${pasos.map(p => `<li class="${p.ok ? 'ok' : ''}"><span class="chk" aria-hidden="true">${p.ok ? '✓' : ''}</span><span class="txt"><b>${p.t}</b><small>${p.d}</small></span>
        ${p.ok ? '<span class="hecho">Hecho</span>' : `<button class="btn" data-a="${p.a}">${p.b}</button>`}</li>`).join('')}</ol></section>`;
  }

  function vistaLista(tipo) {
    const base = { mapas: p => p.rol === 'dueno', compartidos: p => p.rol !== 'dueno', favoritos: p => p.favorito }[tipo];
    const lista = ordenar(proyectos.filter(base).filter(p => !filtro || (p.nombre + ' ' + p.descripcion + ' ' + p.dueno_nombre).toLowerCase().includes(filtro.toLowerCase())));
    const titulo = { mapas: 'Mis mapas', compartidos: 'Compartidos conmigo', favoritos: 'Favoritos' }[tipo];
    const desc = { mapas: '', compartidos: 'Mapas de otras personas en los que eres editor o lector.', favoritos: 'Los mapas que marcaste con ★, tuyos o compartidos.' }[tipo];
    let cuerpo;
    if (lista.length) cuerpo = rejilla(lista);
    else if (filtro) cuerpo = `<div class="vacio"><h3>Nada coincide con «${esc(filtro)}»</h3><p>Prueba con otro nombre.</p></div>`;
    else if (tipo === 'mapas') cuerpo = `<div class="vacio"><h3>Todavía no tienes mapas</h3><p>Crea uno en blanco o empieza desde una plantilla de ejemplo para aprender las herramientas.</p><button class="btn prim" data-a="nuevo">Crear mi primer mapa</button></div>`;
    else if (tipo === 'favoritos') cuerpo = `<div class="vacio"><h3>Aún no tienes favoritos</h3><p>Pulsa la estrella de cualquier mapa para tenerlo aquí.</p><a class="btn" href="#mapas">Ver mis mapas</a></div>`;
    else cuerpo = `<div class="vacio"><h3>Nadie ha compartido mapas contigo</h3><p>Cuando alguien te añada con tu correo (${esc(yo.email)}) o abras un enlace de invitación, el mapa aparecerá aquí.</p></div>`;
    principal.innerHTML = cabecera(titulo, desc, herramientas(tipo === 'mapas')) + cuerpo;
    const b = $('#buscar');
    b.addEventListener('input', () => { filtro = b.value; const pos = b.selectionStart; vistaLista(tipo); const n = $('#buscar'); n.focus(); n.setSelectionRange(pos, pos); });
    $('#orden').addEventListener('change', e => { orden = e.target.value; ls('mc-orden', orden); vistaLista(tipo); });
  }

  async function vistaPapelera() {
    const cab = cabecera('Papelera', 'Los mapas borrados se quedan aquí hasta que los borres para siempre.');
    principal.innerHTML = cab + '<div class="cargando">Cargando…</div>';
    const lista = await api('/api/proyectos?papelera=true');
    principal.innerHTML = cab + (lista.length ? `<div class="tarjetas">${lista.map(p => tarjeta(p, true)).join('')}</div>` : '<div class="vacio"><h3>La papelera está vacía</h3></div>');
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
    const g = (t, l) => `<div class="caja"><h2>${t}</h2><div class="atajos">${l.map(([k, d]) => `<div><span>${d}</span><kbd>${k}</kbd></div>`).join('')}</div></div>`;
    principal.innerHTML = cabecera('Atajos del editor', 'Dentro del editor pulsa <kbd>?</kbd> para ver la hoja completa.') + `<div class="ajustes ancho">
      ${g('Cámara', [['Rueda', 'Zoom hacia el cursor'], ['Botón central', 'Desplazar'], ['Botón derecho', 'Orbitar'], ['Inicio', 'Ver todo el mapa'], ['W A S D', 'Mover la cámara'], ['1 / 4 / 5', 'Planta / isométrica / caminar']])}
      ${g('Edición', [['Clic', 'Seleccionar'], ['Mayús+clic', 'Añadir o quitar'], ['Alt+arrastrar', 'Copiar y mover'], ['M / G / K', 'Mover, girar, escalar'], ['Supr', 'Borrar'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'], ['Ctrl+G', 'Agrupar'], ['F', 'Encuadrar la selección']])}
      ${g('Herramientas', [['L', 'Pared'], ['H', 'Habitación'], ['U', 'Puerta'], ['I', 'Ventana'], ['X', 'Techo'], ['B', 'Pintar'], ['T', 'Medir'], ['C', 'Catálogo'], ['N', 'Nota'], ['Enter', 'Terminar pared o polígono']])}
      ${g('Panel', [['N', 'Nuevo mapa'], ['/', 'Buscar mapas'], ['?', 'Recorrido guiado']])}
    </div>`;
  }

  function vistaCuenta() {
    const correo = yo.correo_activo;
    principal.innerHTML = cabecera('Cuenta') + `<div class="ajustes">
      <form class="caja" id="formNombre"><h2>Perfil</h2>
        <label class="campo"><span>Nombre</span><input type="text" name="nombre" maxlength="80" required value="${esc(yo.nombre)}"></label>
        <div><button class="btn prim" type="submit">Guardar</button></div></form>

      <div class="caja" id="cajaCorreo"><h2>Correo</h2>
        <div class="fila-correo"><span class="mono">${esc(yo.email)}</span>${correo ? (yo.email_verificado ? '<span class="insignia ok">Verificado</span>' : '<span class="insignia">Sin verificar</span>') : ''}
          ${correo ? '<button class="btn peq" type="button" data-a="cambiar-correo">Cambiar</button>' : ''}</div>
        ${correo ? '' : '<p class="ayuda">Este servidor no tiene el correo configurado: no se envían códigos ni avisos.</p>'}
        <form id="formCorreo" class="sub-form" hidden novalidate>
          <label class="campo"><span>Correo nuevo</span><input type="email" name="email_nuevo" autocomplete="email" required></label>
          <label class="campo"><span>Contraseña actual</span><input type="password" name="clave_actual" autocomplete="current-password" required></label>
          <p class="error-form" id="errCorreo" role="alert"></p>
          <div class="fila-btn"><button class="btn prim" type="submit">Enviar código al correo nuevo</button><button class="btn fantasma" type="button" data-a="cancelar-correo">Cancelar</button></div>
        </form>
        <form id="formCorreo2" class="sub-form" hidden novalidate>
          <p class="ayuda" id="txtCorreo2"></p>
          <label class="campo"><span>Código</span><input type="text" name="codigo" required></label>
          <p class="error-form" id="errCorreo2" role="alert"></p>
          <div class="fila-btn"><button class="btn prim" type="submit">Confirmar el cambio</button><button class="btn fantasma" type="button" data-a="cancelar-correo">Cancelar</button></div>
        </form>
      </div>

      <form class="caja" id="formClave"><h2>Contraseña</h2><p class="ayuda">Al cambiarla se cierran tus sesiones en otros dispositivos${correo ? ' y te avisamos por correo' : ''}.</p>
        <label class="campo"><span>Contraseña actual</span><input type="password" name="clave_actual" autocomplete="current-password" required></label>
        <label class="campo"><span>Contraseña nueva</span><input type="password" name="clave_nueva" autocomplete="new-password" minlength="8" required><small>Mínimo 8 caracteres.</small></label>
        <p class="error-form" id="errClave" role="alert"></p>
        <div><button class="btn prim" type="submit">Cambiar contraseña</button></div></form>

      <div class="caja"><h2>Verificación en dos pasos</h2>
        <p class="ayuda">Al entrar, además de la contraseña te pediremos un código que llega a tu correo. Así nadie entra solo con tu contraseña.</p>
        <div class="fila-correo"><span class="insignia ${yo.dos_pasos ? 'ok' : ''}">${yo.dos_pasos ? 'Activada' : 'Desactivada'}</span>
          ${correo || yo.dos_pasos ? `<button class="btn peq" type="button" data-a="dos-pasos">${yo.dos_pasos ? 'Desactivar' : 'Activar'}</button>` : '<span class="tenue">Necesita el correo configurado en el servidor.</span>'}</div>
        <form id="formDosPasos" class="sub-form" hidden novalidate>
          <label class="campo"><span>Confirma con tu contraseña</span><input type="password" name="clave_actual" autocomplete="current-password" required></label>
          <p class="error-form" id="errDosPasos" role="alert"></p>
          <div class="fila-btn"><button class="btn prim" type="submit">${yo.dos_pasos ? 'Desactivar' : 'Activar'}</button><button class="btn fantasma" type="button" data-a="cancelar-dos-pasos">Cancelar</button></div>
        </form>
      </div>

      <div class="caja"><h2>Ayuda</h2><p class="ayuda">Vuelve a ver los recorridos guiados y la lista de primeros pasos.</p>
        <div class="fila-btn"><button class="btn" data-a="recorrido">Recorrido del panel</button><button class="btn" data-a="reiniciar-ayuda">Volver a mostrar toda la ayuda</button></div></div>
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
    // Cambiar el correo: 1) correo nuevo + contraseña → código al correo nuevo; 2) código → cambiado.
    const f1 = $('#formCorreo'), f2 = $('#formCorreo2');
    const valorCodigo = MC.campoCodigo(f2.codigo, () => f2.requestSubmit());
    f1.addEventListener('submit', async e => {
      e.preventDefault(); $('#errCorreo').textContent = '';
      const d = Object.fromEntries(new FormData(f1));
      try {
        const r = await api('/api/cuenta/correo', { method: 'POST', json: d });
        f1.hidden = true; f2.hidden = false; f2.reset();
        $('#txtCorreo2').innerHTML = `Enviamos un código a <b>${esc(d.email_nuevo)}</b>. Escríbelo para confirmar que es tuyo.`;
        f2.codigo.focus();
      } catch (ex) { $('#errCorreo').textContent = ex.message; }
    });
    f2.addEventListener('submit', async e => {
      e.preventDefault(); $('#errCorreo2').textContent = '';
      if (valorCodigo().length !== 6) { $('#errCorreo2').textContent = 'Escribe los 6 dígitos.'; return; }
      try { await api('/api/cuenta/correo/confirmar', { method: 'POST', json: { codigo: valorCodigo() } }); await cargarYo(); vistaCuenta(); aviso('Correo cambiado.'); }
      catch (ex) { $('#errCorreo2').textContent = ex.message; }
    });
    $('#formDosPasos').addEventListener('submit', async e => {
      e.preventDefault(); $('#errDosPasos').textContent = '';
      try {
        await api('/api/cuenta/yo', { method: 'PATCH', json: { dos_pasos: !yo.dos_pasos, clave_actual: e.target.clave_actual.value } });
        await cargarYo(); vistaCuenta(); aviso(yo.dos_pasos ? 'Verificación en dos pasos activada.' : 'Verificación en dos pasos desactivada.');
      } catch (ex) { $('#errDosPasos').textContent = ex.message; }
    });
  }

  const ESTADO = { activa: 'Activo', caducada: 'Caducado', agotada: 'Agotado', revocada: 'Revocado' };
  const usos = i => i.usos_max ? `${i.usos}/${i.usos_max} usos` : `${i.usos} ${i.usos === 1 ? 'uso' : 'usos'}`;
  async function vistaAdmin() {
    if (!yo.es_admin) { location.hash = '#inicio'; return; }
    const cab = cabecera('Administración', 'Resumen del servidor, enlaces para crear cuentas y usuarios.', '<button class="btn prim" data-a="nuevo-registro">Crear enlace de registro</button>');
    principal.innerHTML = cab + '<div class="cargando">Cargando…</div>';
    const [r, enlaces, usuarios] = await Promise.all([api('/api/admin/resumen'), api('/api/invitaciones'), api('/api/admin/usuarios')]);
    const dato = (n, t) => `<div class="cifra"><b>${n}</b><span>${t}</span></div>`;
    principal.innerHTML = cab + `
      <div class="cifras">${dato(r.usuarios, 'usuarios')}${dato(r.activos_7d, 'activos esta semana')}${dato(r.proyectos, 'mapas')}${dato(r.documentos.toLocaleString('es'), 'documentos')}${dato(tamano(r.bytes_archivos), 'en archivos')}${dato(tamano(r.bytes_base), 'base de datos')}</div>
      <div class="nota-reg ${r.registro_abierto ? 'abierto' : ''}">${r.registro_abierto
        ? '<b>El registro está abierto:</b> cualquiera puede crearse una cuenta. Para que sea solo por invitación, pon <code>OO_REGISTRO_ABIERTO=false</code> en el <code>.env</code> del servidor y reinicia.'
        : '<b>El registro es solo por invitación.</b> Crea un enlace de registro, o pide a los dueños de los mapas que compartan con un enlace de invitación.'}</div>
      <section class="bloque"><div class="bloque-cab"><h2>Enlaces de registro</h2></div>
        ${enlaces.length ? `<div class="tabla"><table><thead><tr><th>Nota</th><th>Estado</th><th>Usos</th><th>Caducidad</th><th>Creado</th><th></th></tr></thead><tbody>
          ${enlaces.map(i => `<tr><td>${esc(i.nota) || '<span class="tenue">Sin nota</span>'}</td><td><span class="estado-inv ${i.estado}">${ESTADO[i.estado]}</span></td><td>${usos(i)}</td>
            <td>${i.estado === 'activa' ? fechaFut(i.expira) : '—'}</td><td>${fechaRel(i.creado)} · ${esc(i.creado_por_nombre)}</td>
            <td>${i.estado === 'activa' ? `<button class="btn fantasma peq" data-a="revocar" data-id="${esc(i.id)}" data-vista-tras="admin">Revocar</button>` : ''}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="vacio peq"><p>Todavía no hay enlaces de registro.</p></div>'}
      </section>
      <section class="bloque"><div class="bloque-cab"><h2>Usuarios <span class="mono tenue">${usuarios.length}</span></h2></div>
        <div class="tabla"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Mapas</th><th>Alta</th><th>Último acceso</th></tr></thead><tbody>
          ${usuarios.map(u => `<tr><td>${esc(u.nombre)}${u.es_admin ? ' <span class="rol">Admin</span>' : ''}${u.id === yo.id ? ' <span class="tenue">(tú)</span>' : ''}</td><td>${esc(u.email)}</td><td>${u.proyectos}</td>
            <td>${fechaRel(u.creado)}</td><td>${u.ultimo_acceso ? fechaRel(u.ultimo_acceso) : '<span class="tenue">nunca</span>'}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }

  const TITULOS = { inicio: 'Inicio', mapas: 'Mis mapas', compartidos: 'Compartidos conmigo', favoritos: 'Favoritos', plantillas: 'Plantillas', papelera: 'Papelera', atajos: 'Atajos', cuenta: 'Cuenta', admin: 'Administración' };
  async function mostrar() {
    let vista = (location.hash || '#inicio').slice(1);
    if (!TITULOS[vista]) vista = 'inicio';
    $$('.menu a[data-vista]').forEach(a => a.classList.toggle('on', a.dataset.vista === vista));
    app.classList.remove('menu-abierto');
    document.title = TITULOS[vista] + ' · Map Creator';
    try {
      if (vista === 'mapas' || vista === 'compartidos' || vista === 'favoritos') vistaLista(vista);
      else if (vista === 'plantillas') vistaPlantillas();
      else if (vista === 'papelera') await vistaPapelera();
      else if (vista === 'atajos') vistaAtajos();
      else if (vista === 'cuenta') vistaCuenta();
      else if (vista === 'admin') await vistaAdmin();
      else vistaInicio();
    } catch (ex) { principal.innerHTML = `<div class="vacio"><h3>No se pudo cargar</h3><p>${esc(ex.message)}</p></div>`; }
  }
  // Repinta la vista actual sin volver a pedir los datos (p. ej. tras marcar un favorito).
  const repintar = () => { const y = scrollY; mostrar().then(() => scrollTo(0, y)); };

  // ───────────── Nuevo mapa ─────────────
  const dlgNuevo = $('#dlgNuevo'), formNuevo = $('#formNuevo');
  let plantillaSel = 'vacio', nombreAuto = '';
  function abrirNuevo(plantilla) {
    plantillaSel = plantilla || 'vacio';
    formNuevo.reset(); $('#errNuevo').textContent = ''; $('#bCrear').disabled = false;
    $('#nuevoPlantillas').innerHTML = htmlPlantillas(plantillaSel);
    $('#nuevoTam').hidden = plantillaSel !== 'vacio';
    nombreAuto = ''; sugerirNombre();
    dlgNuevo.showModal(); formNuevo.nombre.focus(); formNuevo.nombre.select();
  }
  // Con una plantilla de ejemplo, propone su nombre mientras el usuario no haya escrito otro.
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
      location.href = urlEditor(p, pref('recorrido_editor') ? '' : '&recorrido=1');
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
      html += op('favorito-menu', p.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos');
      if (p.rol !== 'lector') html += op('renombrar', 'Renombrar…');
      html += op('compartir', p.rol === 'dueno' ? 'Compartir o invitar…' : 'Ver quién tiene acceso') + op('duplicar', 'Hacer una copia');
      html += '<hr>' + (p.rol === 'dueno' ? op('borrar', 'Mover a la papelera', 'peligro') : op('salir-proyecto', 'Salir de este mapa', 'peligro'));
    }
    const m = document.createElement('div'); m.className = 'menu-ctx'; m.setAttribute('role', 'menu'); m.innerHTML = html;
    document.body.appendChild(m); menuAbierto = m;
    const r = boton.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    m.querySelector('button').focus();
  }

  async function alternarFavorito(id) {
    const p = proyectos.find(x => x.id === id); if (!p) return;
    p.favorito = !p.favorito; contar(); repintar();
    try { await api('/api/proyectos/' + id + '/favorito', { method: 'PUT', json: { favorito: p.favorito } }); }
    catch (ex) { p.favorito = !p.favorito; contar(); repintar(); aviso(ex.message, 'err'); }
  }

  async function accion(a, id) {
    const p = proyectos.find(x => x.id === id);
    if (a === 'abrir') location.href = urlEditor(p);
    else if (a === 'abrir-nueva') window.open(urlEditor(p), '_blank', 'noopener');
    else if (a === 'favorito-menu') alternarFavorito(id);
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

  // ───────────── Compartir: personas y enlaces ─────────────
  let compartiendo = null;
  async function pintarMiembros() {
    const p = compartiendo, lista = await api('/api/proyectos/' + p.id + '/miembros'), dueno = p.rol === 'dueno';
    $('#listaMiembros').innerHTML = lista.map(m => `<div class="miembro"><span class="avatar">${esc(iniciales(m.nombre))}</span>
      <span class="datos"><b>${esc(m.nombre)}${m.id === yo.id ? ' (tú)' : ''}</b><small>${esc(m.email)}</small></span>
      ${m.rol === 'dueno' || !dueno ? `<span class="rol">${esc(ROL[m.rol])}</span>` : `<select data-miembro="${esc(m.id)}" aria-label="Permiso de ${esc(m.nombre)}">
        <option value="editor"${m.rol === 'editor' ? ' selected' : ''}>Puede editar</option><option value="lector"${m.rol === 'lector' ? ' selected' : ''}>Solo ver</option><option value="__quitar">Quitar acceso</option></select>`}</div>`).join('');
  }
  async function pintarEnlaces() {
    const lista = await api('/api/proyectos/' + compartiendo.id + '/invitaciones');
    $('#listaEnlaces').innerHTML = lista.length ? `<h4>Enlaces activos</h4>` + lista.map(i => `<div class="enlace">
        <span class="enlace-ic" aria-hidden="true">🔗</span>
        <span class="datos"><b>${i.rol === 'editor' ? 'Puede editar' : 'Solo ver'}</b><small>${usos(i)} · ${fechaFut(i.expira)} · creado ${fechaRel(i.creado)}</small></span>
        <button class="btn fantasma peq" data-a="revocar" data-id="${esc(i.id)}">Revocar</button></div>`).join('') : '';
  }
  function abrirCompartir(p) {
    compartiendo = p;
    const dueno = p.rol === 'dueno';
    $('#tCompartir').textContent = (dueno ? 'Compartir «' : 'Acceso a «') + p.nombre + '»';
    $('#secEnlace').hidden = !dueno; $('#secCorreo').hidden = !dueno;
    $('#ayudaCorreo').textContent = yo.correo_activo ? 'Si ya tiene cuenta entra al momento y le avisamos. Si no, le enviamos una invitación para que la cree.' : 'Para personas que ya tienen cuenta en este servidor.';
    $('#errInvitar').textContent = ''; $('#enlaceNuevo').hidden = true; $('#listaEnlaces').innerHTML = '';
    $('#listaMiembros').innerHTML = '<div class="cargando">Cargando…</div>';
    $('#dlgCompartir').showModal();
    pintarMiembros().catch(ex => aviso(ex.message, 'err'));
    if (dueno) pintarEnlaces().catch(ex => aviso(ex.message, 'err'));
  }
  const numONulo = v => v === '' ? null : +v;
  $('#formEnlace').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector('button'); b.disabled = true;
    try {
      const r = await api('/api/proyectos/' + compartiendo.id + '/invitaciones', { method: 'POST', json: { rol: d.rol, dias: numONulo(d.dias), usos_max: numONulo(d.usos_max) } });
      $('#enlaceUrl').value = location.origin + r.ruta; $('#enlaceNuevo').hidden = false; $('#enlaceUrl').select();
      await pintarEnlaces();
      if (!pref('enlace_creado')) guardarPref({ enlace_creado: true });
    } catch (ex) { aviso(ex.message, 'err'); }
    b.disabled = false;
  });
  $('#formInvitar').addEventListener('submit', async e => {
    e.preventDefault(); $('#errInvitar').textContent = '';
    const d = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api('/api/proyectos/' + compartiendo.id + '/miembros', { method: 'POST', json: d }); e.target.reset();
      if (r.invitado) { await pintarEnlaces(); aviso(r.enviado ? 'No tenía cuenta: le enviamos una invitación por correo.' : 'Se creó la invitación, pero el correo no salió. Revisa la configuración SMTP.', r.enviado ? '' : 'err'); }
      else { await pintarMiembros(); aviso('Añadido: ya puede abrir el mapa' + (yo.correo_activo ? ' y le avisamos por correo.' : '.')); refrescar(); }
    }
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

  // ───────────── Enlaces de registro (administración) ─────────────
  $('#formRegistro').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), b = $('#bCrearRegistro'); b.disabled = true;
    try {
      const r = await api('/api/invitaciones', { method: 'POST', json: { nota: d.nota, dias: numONulo(d.dias), usos_max: numONulo(d.usos_max), email: d.email || null } });
      if (d.email) aviso(r.enviado ? 'Invitación enviada a ' + d.email + '.' : 'El enlace se creó, pero el correo no salió.', r.enviado ? '' : 'err');
      $('#registroUrl').value = location.origin + r.ruta; $('#registroNuevo').hidden = false; $('#registroUrl').select();
      if ((location.hash || '').slice(1) === 'admin') mostrar();
    } catch (ex) { aviso(ex.message, 'err'); }
    b.disabled = false;
  });

  // ───────────── Recorrido guiado del panel ─────────────
  function recorrido() {
    if (!window.MCRecorrido) return;
    const movil = innerWidth <= 860;
    if (movil) app.classList.add('menu-abierto');
    MCRecorrido.iniciar([
      { titulo: 'Bienvenido a Map Creator', texto: 'Te enseño el panel en un minuto. Puedes saltarlo y repetirlo cuando quieras desde <b>Ayuda → Recorrido guiado</b>.' },
      { el: '.lateral [data-a=nuevo]', titulo: 'Crea un mapa', texto: 'En blanco, con el tamaño que elijas, o desde una plantilla de ejemplo para aprender. Atajo: tecla <kbd>N</kbd>.' },
      { el: '.menu a[data-vista=inicio]', titulo: 'Inicio', texto: 'Aquí retomas lo último que abriste y ves los primeros pasos que te faltan.' },
      { el: '.menu a[data-vista=compartidos]', titulo: 'Compartidos contigo', texto: 'Los mapas de otras personas aparecen aquí cuando te añaden o abres su enlace de invitación.' },
      { el: '.menu a[data-vista=favoritos]', titulo: 'Favoritos', texto: 'Pulsa la ★ de cualquier mapa para tenerlo siempre a mano.' },
      { el: () => (movil ? null : document.querySelector('.tarjeta [data-a=menu-proyecto]')), titulo: 'Opciones de cada mapa', texto: 'Con <b>⋮</b> lo renombras, haces una copia, lo mandas a la papelera o lo <b>compartes con un enlace de invitación</b>.' },
      { el: '.menu a[data-a=recorrido]', titulo: 'Ayuda', texto: 'Repite este recorrido cuando quieras. La primera vez que abras el editor tendrás otro recorrido.' }
    ], { textoFin: 'Listo', alTerminar: () => { app.classList.remove('menu-abierto'); if (!pref('recorrido_panel')) guardarPref({ recorrido_panel: true }); } });
  }

  // ───────────── Eventos generales ─────────────
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (menuAbierto && !e.target.closest('.menu-ctx')) cerrarMenu();
    if (!b) return;
    const a = b.dataset.a, id = b.dataset.id;
    if (b.closest('.menu-ctx')) { cerrarMenu(); accion(a, id).catch(ex => aviso(ex.message, 'err')); return; }
    if (a === 'nuevo') abrirNuevo(b.dataset.plantilla);
    else if (a === 'salir') api('/api/cuenta/salir', { method: 'POST' }).finally(() => { location.href = '/'; });
    else if (a === 'abrir-menu') app.classList.add('menu-abierto');
    else if (a === 'cerrar-menu') app.classList.remove('menu-abierto');
    else if (a === 'cerrar-dlg') b.closest('dialog').close();
    else if (a === 'menu-proyecto') { e.preventDefault(); abrirMenuProyecto(b); }
    else if (a === 'favorito') { e.preventDefault(); alternarFavorito(id); }
    else if (a === 'ver-como') { modoVista = b.dataset.v; ls('mc-vista', modoVista); repintar(); }
    else if (a === 'recorrido') { e.preventDefault(); recorrido(); }
    else if (a === 'ocultar-pasos') guardarPref({ pasos_ocultos: true }).then(repintar);
    else if (a === 'reiniciar-ayuda') guardarPref({ recorrido_panel: null, recorrido_editor: null, pasos_ocultos: null }).then(() => aviso('Listo: la ayuda volverá a aparecer.'));
    else if (a === 'paso-abrir') { const p = proyectos[0]; if (p) location.href = urlEditor(p); else abrirNuevo(); }
    else if (a === 'paso-recorrido') { const p = proyectos.find(x => x.rol !== 'lector') || proyectos[0]; if (p) location.href = urlEditor(p, '&recorrido=1'); else abrirNuevo(); }
    else if (a === 'paso-compartir') { const p = proyectos.find(x => x.rol === 'dueno'); if (p) abrirCompartir(p); else abrirNuevo(); }
    else if (a === 'paso-favorito') location.hash = '#mapas';
    else if (a === 'cambiar-correo') { $('#formCorreo').hidden = false; $('#formCorreo2').hidden = true; $('#formCorreo').email_nuevo.focus(); }
    else if (a === 'cancelar-correo') { $('#formCorreo').hidden = true; $('#formCorreo2').hidden = true; }
    else if (a === 'dos-pasos') { $('#formDosPasos').hidden = false; $('#formDosPasos').clave_actual.focus(); }
    else if (a === 'cancelar-dos-pasos') $('#formDosPasos').hidden = true;
    else if (a === 'copiar-enlace') copiar($('#enlaceUrl').value);
    else if (a === 'copiar-registro') copiar($('#registroUrl').value);
    else if (a === 'nuevo-registro') { $('#formRegistro').reset(); $('#registroNuevo').hidden = true; $('#campoEmailReg').hidden = !yo.correo_activo; $('#dlgRegistro').showModal(); }
    else if (a === 'revocar') {
      if (!confirm('¿Revocar este enlace? Quien lo tenga ya no podrá usarlo (las personas que ya entraron siguen dentro).')) return;
      api('/api/invitaciones/' + id, { method: 'DELETE' })
        .then(() => { aviso('Enlace revocado.'); return b.dataset.vistaTras === 'admin' ? mostrar() : pintarEnlaces(); })
        .catch(ex => aviso(ex.message, 'err'));
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarMenu();
    if (menuAbierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); const bs = [...menuAbierto.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    }
    const escribiendo = /input|textarea|select/i.test(document.activeElement.tagName) || document.querySelector('dialog[open]') || document.querySelector('.mcr-pop');
    if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n') { e.preventDefault(); abrirNuevo(); }
    else if (e.key === '/') { const b = $('#buscar'); if (b) { e.preventDefault(); b.focus(); } }
    else if (e.key === '?') { e.preventDefault(); recorrido(); }
  });
  addEventListener('hashchange', mostrar);
  async function refrescar() { await cargarProyectos(); await mostrar(); }

  (async () => {
    try { [, , plantillas] = await Promise.all([cargarYo(), cargarProyectos(), api('/api/plantillas')]); }
    catch (ex) { principal.innerHTML = `<div class="vacio"><h3>No se pudo conectar</h3><p>${esc(ex.message)}</p></div>`; return; }
    await mostrar();
    if (!pref('recorrido_panel')) setTimeout(recorrido, 400);
  })();
})();
