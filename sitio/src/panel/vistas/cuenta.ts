/* #cuenta: tarjeta del perfil a la izquierda y pestañas a la derecha (perfil, seguridad, preferencias, actividad, datos). */
import { api, aviso, campoCodigo, esc, fechaRel, miniatura } from '../../comun';
import { $, datosForm, ls, objetivo, type El } from '../../dom';
import type { Perfil, Sesion } from '../../tipos';
import { avatarHtml, cargarYo, guardarPref, orden, ORDENES, pintarAvatarMenu, ponerOrden, principal, proyectos, urlEditor, yo, type Orden } from '../estado';
import { cabecera, porEdicion } from '../piezas';

const COLORES_AV = ['#e2690b', '#1f6feb', '#2e7d32', '#8e44ad', '#c62828', '#00838f', '#6d4c41', '#37474f'];
const PESTANAS_CUENTA: [string, string][] = [['perfil', 'Perfil'], ['seguridad', 'Seguridad'], ['preferencias', 'Preferencias'], ['actividad', 'Actividad'], ['datos', 'Datos y cuenta']];
let pestanaCuenta = ls('mc-cuenta-tab') || 'perfil';
export function ponerPestanaCuenta(t: string): void { pestanaCuenta = t; ls('mc-cuenta-tab', t); }

export function vistaCuenta(): void {
  const correo = yo.correo_activo, colorAv = (yo.preferencias && yo.preferencias.color_avatar) || '', P = yo.preferencias || {};
  if (!PESTANAS_CUENTA.some(([k]) => k === pestanaCuenta)) pestanaCuenta = 'perfil';
  const tarjeta = `<aside class="caja cuenta-tarjeta">
      <div class="avatar-editable">${avatarHtml(yo, 'enorme')}<label class="cambiar-foto" title="Cambiar la foto"><input type="file" accept="image/png,image/jpeg,image/webp" id="fotoPerfil" hidden>📷</label></div>
      <h2>${esc(yo.nombre)}</h2>
      ${yo.empresa ? `<p class="tenue">${esc(yo.empresa)}</p>` : ''}
      <p class="tenue mono peq-t">${esc(yo.email)}</p>
      <div class="insignias">${yo.es_admin ? '<span class="rol">Admin</span>' : ''}${correo && yo.email_verificado ? '<span class="insignia ok">Correo verificado</span>' : ''}${yo.dos_pasos ? '<span class="insignia ok">Dos pasos</span>' : ''}</div>
      ${yo.bio ? `<p class="bio">${esc(yo.bio)}</p>` : ''}
      <div class="cifras-mini" id="perfilCifras"></div>
      <p class="tenue peq-t" id="perfilDesde"></p>
      <div class="colores-avatar" role="group" aria-label="Color del avatar">${COLORES_AV.map(c => `<button type="button" data-a="color-avatar" data-color="${c}" style="background:${c}" aria-label="Color ${c}" class="${c === colorAv || (!colorAv && c === COLORES_AV[0]) ? 'on' : ''}"></button>`).join('')}</div>
      ${yo.avatar_v ? '<button class="btn fantasma peq" type="button" data-a="quitar-foto">Quitar la foto</button>' : '<p class="tenue peq-t">Toca la cámara para poner una foto.</p>'}
    </aside>`;
  const pest = `<nav class="pestanas-cuenta" role="tablist">${PESTANAS_CUENTA.map(([k, n]) => `<button role="tab" data-a="pestana-cuenta" data-t="${k}" aria-selected="${k === pestanaCuenta}" class="${k === pestanaCuenta ? 'on' : ''}">${n}</button>`).join('')}</nav>`;
  const secciones: Record<string, string> = {
    perfil: `<form class="caja" id="formPerfil"><h2>Tu perfil</h2><p class="ayuda">Lo ven las personas con las que compartes mapas.</p>
        <div class="dos-col"><label class="campo"><span>Nombre</span><input type="text" name="nombre" maxlength="80" required value="${esc(yo.nombre)}"></label>
        <label class="campo"><span>Empresa o equipo</span><input type="text" name="empresa" maxlength="80" value="${esc(yo.empresa || '')}" placeholder="Opcional"></label></div>
        <label class="campo"><span>Sobre ti</span><textarea name="bio" maxlength="280" rows="3" placeholder="Arquitecta, diseñador de niveles, estudiante… (opcional)">${esc(yo.bio || '')}</textarea><small><span id="bioN">${(yo.bio || '').length}</span>/280</small></label>
        <div><button class="btn prim" type="submit">Guardar perfil</button></div></form>
      <div class="caja"><h2>Foto de perfil</h2><p class="ayuda">PNG, JPG o WebP. Se recorta en cuadrado y se reduce a 256 × 256.</p>
        <div class="fila-btn"><label class="btn"><input type="file" accept="image/png,image/jpeg,image/webp" id="fotoPerfil2" hidden>Subir una foto…</label>${yo.avatar_v ? '<button class="btn fantasma" type="button" data-a="quitar-foto">Quitar la foto</button>' : ''}</div></div>`,
    seguridad: `<div class="caja" id="cajaCorreo"><h2>Correo</h2>
        <div class="fila-correo"><span class="mono">${esc(yo.email)}</span>${correo ? (yo.email_verificado ? '<span class="insignia ok">Verificado</span>' : '<span class="insignia">Sin verificar</span>') : ''}
          ${correo ? '<button class="btn peq" type="button" data-a="cambiar-correo">Cambiar</button>' : ''}</div>
        ${correo ? '' : '<p class="ayuda">Este servidor no tiene el correo configurado: no se envían códigos ni avisos.</p>'}
        <form id="formCorreo" class="sub-form" hidden novalidate>
          <div class="dos-col"><label class="campo"><span>Correo nuevo</span><input type="email" name="email_nuevo" autocomplete="email" required></label>
          <label class="campo"><span>Contraseña actual</span><input type="password" name="clave_actual" autocomplete="current-password" required></label></div>
          <p class="error-form" id="errCorreo" role="alert"></p>
          <div class="fila-btn"><button class="btn prim" type="submit">Enviar código al correo nuevo</button><button class="btn fantasma" type="button" data-a="cancelar-correo">Cancelar</button></div>
        </form>
        <form id="formCorreo2" class="sub-form" hidden novalidate>
          <p class="ayuda" id="txtCorreo2"></p>
          <label class="campo"><span>Código</span><input type="text" name="codigo" required></label>
          <p class="error-form" id="errCorreo2" role="alert"></p>
          <div class="fila-btn"><button class="btn prim" type="submit">Confirmar el cambio</button><button class="btn fantasma" type="button" data-a="cancelar-correo">Cancelar</button></div>
        </form></div>
      <form class="caja" id="formClave"><h2>Contraseña</h2><p class="ayuda">Al cambiarla se cierran tus sesiones en otros dispositivos${correo ? ' y te avisamos por correo' : ''}.</p>
        <div class="dos-col"><label class="campo"><span>Contraseña actual</span><input type="password" name="clave_actual" autocomplete="current-password" required></label>
        <label class="campo"><span>Contraseña nueva</span><input type="password" name="clave_nueva" autocomplete="new-password" minlength="8" required><small>Mínimo 8 caracteres.</small></label></div>
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
        </form></div>
      <div class="caja"><h2>Sesiones abiertas</h2><p class="ayuda">Los dispositivos y navegadores donde tu cuenta está abierta. Cierra los que no reconozcas.</p>
        <div class="sesiones" id="listaSesiones"><div class="cargando">Cargando…</div></div>
        <div><button class="btn" type="button" data-a="cerrar-otras">Cerrar todas las demás sesiones</button></div></div>`,
    preferencias: `<div class="caja"><h2>Apariencia</h2><p class="ayuda">Tema del panel y de la web en este navegador y en los demás donde entres.</p>
        <div class="opciones-tema" role="radiogroup" aria-label="Tema">${[['sistema', 'Como el sistema', '🖥️'], ['claro', 'Claro', '☀️'], ['oscuro', 'Oscuro', '🌙']].map(([k, n, ic]) => `<button type="button" role="radio" data-a="tema" data-t="${k}" aria-checked="${(P.tema || 'sistema') === k}" class="${(P.tema || 'sistema') === k ? 'on' : ''}"><span>${ic}</span>${n}</button>`).join('')}</div></div>
      <div class="caja"><h2>Editor</h2>
        <div class="dos-col"><label class="campo"><span>Vista al abrir un mapa</span><select data-pref="vista_inicial">${[['', '3D (la de siempre)'], ['planta', 'Planta (desde arriba)'], ['iso', 'Isométrica']].map(([k, n]) => `<option value="${k}"${(P.vista_inicial || '') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="campo"><span>Ordenar mis mapas por</span><select data-pref-local="mc-orden">${Object.entries(ORDENES).map(([k, n]) => `<option value="${k}"${orden === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <label class="chk"><input type="checkbox" data-pref="sin_recorridos"${P.sin_recorridos ? ' checked' : ''}> No mostrar los recorridos guiados automáticamente</label></div>
      <div class="caja"><h2>Ayuda</h2><p class="ayuda">Vuelve a ver los recorridos guiados y la lista de primeros pasos.</p>
        <div class="fila-btn"><button class="btn" data-a="recorrido">Recorrido del panel</button><button class="btn" data-a="reiniciar-ayuda">Volver a mostrar toda la ayuda</button></div></div>`,
    actividad: `<div class="caja"><h2>Actividad reciente</h2><p class="ayuda">Los mapas en los que se trabajó hace poco (tuyos y compartidos).</p><div class="actividad" id="listaActividad"></div></div>
      <div class="caja"><h2>Tus números</h2><div class="perfil-cifras" id="perfilCifras2"></div></div>`,
    datos: `<div class="caja"><h2>Descargar mis datos</h2><p class="ayuda">Un archivo JSON con tu cuenta, tus preferencias y todos tus mapas con sus documentos. Sirve de copia de seguridad.</p>
        <div><a class="btn" href="/api/cuenta/exportar" download>Descargar mis datos (.json)</a></div></div>
      <form class="caja peligro-caja" id="formBorrar"><h2>Eliminar la cuenta</h2>
        <p class="ayuda">Se borran tu cuenta, <b>todos tus mapas</b> con sus archivos y tu acceso a los mapas de otros. No se puede deshacer. Descarga tus datos antes si quieres conservar algo.</p>
        <label class="campo"><span>Escribe tu contraseña para confirmar</span><input type="password" name="clave" autocomplete="current-password" required></label>
        <p class="error-form" id="errBorrar" role="alert"></p>
        <div><button class="btn peligro-btn" type="submit">Eliminar mi cuenta para siempre</button></div></form>`
  };
  principal.innerHTML = cabecera('Cuenta') + `<div class="cuenta-grid">${tarjeta}<div class="cuenta-der">${pest}<div class="cuenta-panel" role="tabpanel">${secciones[pestanaCuenta]}</div></div></div>`;
  cargarPerfil();
  const enlazar = (sel: string, ev: string, f: (e: Event) => void): void => { const el = $(sel); if (el) el.addEventListener(ev, f); };
  for (const id of ['#fotoPerfil', '#fotoPerfil2']) enlazar(id, 'change', e => { const f = objetivo(e).files && objetivo(e).files[0]; if (f) subirFoto(f); });
  enlazar('#formPerfil', 'submit', async e => {
    e.preventDefault(); const d = datosForm(objetivo(e));
    if (!d.nombre.trim()) { aviso('El nombre no puede quedar vacío.', 'err'); return; }
    try { await api('/api/cuenta/yo', { method: 'PATCH', json: { nombre: d.nombre, empresa: d.empresa, bio: d.bio } }); await cargarYo(); vistaCuenta(); aviso('Perfil guardado.'); }
    catch (ex: any) { aviso(ex.message, 'err'); }
  });
  enlazar('#formPerfil textarea', 'input', e => { const n = $('#bioN'); if (n) n.textContent = String(objetivo(e).value.length); });
  enlazar('#formBorrar', 'submit', async e => {
    e.preventDefault(); $('#errBorrar').textContent = '';
    if (!confirm('¿Seguro? Se borran tu cuenta y todos tus mapas. No se puede deshacer.')) return;
    try { await api('/api/cuenta', { method: 'DELETE', json: { clave: objetivo(e).clave.value } }); location.href = '/'; }
    catch (ex: any) { $('#errBorrar').textContent = ex.message; }
  });
  enlazar('#formClave', 'submit', async e => {
    e.preventDefault(); $('#errClave').textContent = '';
    const d = datosForm(objetivo(e));
    if (d.clave_nueva.length < 8) { $('#errClave').textContent = 'La contraseña nueva necesita al menos 8 caracteres.'; return; }
    try { await api('/api/cuenta/yo', { method: 'PATCH', json: d }); objetivo(e).reset(); aviso('Contraseña cambiada.'); }
    catch (ex: any) { $('#errClave').textContent = ex.message; }
  });
  const f1 = $('#formCorreo'), f2 = $('#formCorreo2');
  if (f1 && f2) {
    const valorCodigo = campoCodigo(f2.codigo, () => f2.requestSubmit());
    f1.addEventListener('submit', async e => {
      e.preventDefault(); $('#errCorreo').textContent = '';
      const d = datosForm(f1);
      try { await api('/api/cuenta/correo', { method: 'POST', json: d }); f1.hidden = true; f2.hidden = false; f2.reset(); $('#txtCorreo2').innerHTML = `Enviamos un código a <b>${esc(d.email_nuevo)}</b>. Escríbelo para confirmar que es tuyo.`; f2.codigo.focus(); }
      catch (ex: any) { $('#errCorreo').textContent = ex.message; }
    });
    f2.addEventListener('submit', async e => {
      e.preventDefault(); $('#errCorreo2').textContent = '';
      if (valorCodigo().length !== 6) { $('#errCorreo2').textContent = 'Escribe los 6 dígitos.'; return; }
      try { await api('/api/cuenta/correo/confirmar', { method: 'POST', json: { codigo: valorCodigo() } }); await cargarYo(); vistaCuenta(); aviso('Correo cambiado.'); }
      catch (ex: any) { $('#errCorreo2').textContent = ex.message; }
    });
  }
  enlazar('#formDosPasos', 'submit', async e => {
    e.preventDefault(); $('#errDosPasos').textContent = '';
    try { await api('/api/cuenta/yo', { method: 'PATCH', json: { dos_pasos: !yo.dos_pasos, clave_actual: objetivo(e).clave_actual.value } }); await cargarYo(); vistaCuenta(); aviso(yo.dos_pasos ? 'Verificación en dos pasos activada.' : 'Verificación en dos pasos desactivada.'); }
    catch (ex: any) { $('#errDosPasos').textContent = ex.message; }
  });
  principal.querySelectorAll<El>('[data-pref]').forEach(el => el.addEventListener('change', () => { guardarPref({ [el.dataset.pref as string]: el.type === 'checkbox' ? (el.checked || null) : (el.value || null) }).then(() => aviso('Preferencia guardada.')); }));
  principal.querySelectorAll<El>('[data-pref-local]').forEach(el => el.addEventListener('change', () => { ponerOrden(el.value as Orden); aviso('Preferencia guardada.'); }));
}

/* foto: recorte cuadrado al centro, 256 × 256, WebP (PNG si el navegador no sabe WebP) */
function subirFoto(archivo: File): void {
  if (!/^image\//.test(archivo.type)) { aviso('Elige una imagen.', 'err'); return; }
  const img = new Image(), url = URL.createObjectURL(archivo);
  img.onload = () => {
    const lado = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = 256;
    cv.getContext('2d')!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256); URL.revokeObjectURL(url);
    const enviar = async (blob: Blob | null): Promise<void> => {
      try {
        if (!blob) throw new Error('No se pudo preparar la imagen.');
        const r = await fetch('/api/cuenta/avatar', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, credentials: 'same-origin' });
        const j: { avatar_v?: number; error?: string } = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'No se pudo subir la foto.');
        yo.avatar_v = j.avatar_v || 0; pintarAvatarMenu(); vistaCuenta(); aviso('Foto actualizada.');
      } catch (ex: any) { aviso(ex.message, 'err'); }
    };
    cv.toBlob(b => { if (b && b.type === 'image/webp') enviar(b); else cv.toBlob(enviar, 'image/png'); }, 'image/webp', 0.86);
  };
  img.onerror = () => { URL.revokeObjectURL(url); aviso('No se pudo leer la imagen.', 'err'); };
  img.src = url;
}

async function cargarPerfil(): Promise<void> {
  try {
    const [p, ses] = await Promise.all([api<Perfil>('/api/cuenta/perfil'), $('#listaSesiones') ? api<Sesion[]>('/api/cuenta/sesiones') : Promise.resolve(null as Sesion[] | null)]);
    const d = $('#perfilDesde'); if (d) d.textContent = 'Miembro desde ' + new Date(p.creado).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
    const cif = [[p.mapas, 'mapas'], [p.compartidos, 'compartidos'], [p.cambios, 'cambios'], [p.invitaciones, 'invitaciones']].map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join('');
    for (const id of ['#perfilCifras', '#perfilCifras2']) { const c = $(id); if (c) c.innerHTML = cif; }
    if (ses) pintarSesiones(ses);
    const act = $('#listaActividad');
    if (act) {
      const lista = proyectos.slice().sort(porEdicion).slice(0, 8);
      act.innerHTML = lista.length ? lista.map(x => `<a class="act" href="${urlEditor(x)}"><span class="act-mini" aria-hidden="true">${miniatura(x.id, { ancho: 320, alto: 200 })}</span>
        <span class="act-txt"><b>${esc(x.nombre)}</b><small>${x.rol === 'dueno' ? 'Tuyo' : 'De ' + esc(x.dueno_nombre)} · editado ${fechaRel(x.actualizado)} · ${x.n_cambios} cambios${x.abierto ? ' · lo abriste ' + fechaRel(x.abierto) : ''}</small></span><span class="act-ir">Abrir →</span></a>`).join('') : '<p class="tenue">Todavía no hay actividad.</p>';
    }
  } catch (ex: any) { const l = $('#listaSesiones'); if (l) l.innerHTML = `<p class="error-form">${esc(ex.message)}</p>`; }
}
export function pintarSesiones(ses: Sesion[]): void {
  const l = $('#listaSesiones'); if (!l) return;
  l.innerHTML = ses.map(x => `<div class="sesion"><span class="sesion-ic" aria-hidden="true">${/iPhone|Android/.test(x.dispositivo) ? '📱' : '💻'}</span>
    <span class="datos"><b>${esc(x.dispositivo)}${x.actual ? ' <span class="insignia ok">Esta sesión</span>' : ''}</b><small>${x.ip ? esc(x.ip) + ' · ' : ''}abierta ${fechaRel(x.creado)}</small></span>
    ${x.actual ? '' : `<button class="btn fantasma peq" data-a="cerrar-sesion" data-id="${esc(x.id)}">Cerrar</button>`}</div>`).join('') || '<p class="tenue">Solo esta sesión.</p>';
}

