/* Compartir un mapa: personas (permiso y plazo), enlaces de invitación (quién los usó, extender, revocar) e invitar por correo.
   También el diálogo de enlaces de registro de administración. */
import { api, aviso, esc, fechaRel } from '../../comun';
import { $, datosForm, objetivo, type El } from '../../dom';
import type { EstadoInvitacion, Invitacion, Miembro, Proyecto } from '../../tipos';
import { avatarHtml, fechaCorta, fechaFut, guardarPref, nav, numONulo, pref, ROL, usos, vistaActual, yo } from '../estado';

export let compartiendo: Proyecto | null = null;
const ESTADO_INV: Record<EstadoInvitacion, string> = { activa: 'Activo', caducada: 'Caducado', agotada: 'Agotado', revocada: 'Revocado' };
const dlg = (sel: string) => $(sel) as El & HTMLDialogElement;

const plazoTxt = (m: Miembro): string => !m.expira ? '' : m.vencido
  ? `<span class="insignia vencido">Venció el ${fechaCorta(m.expira)}</span>`
  : `<span class="insignia plazo" title="${esc(new Date(m.expira).toLocaleString('es'))}">Hasta el ${fechaCorta(m.expira)}</span>`;

export async function pintarMiembros(): Promise<void> {
  const p = compartiendo; if (!p) return;
  const lista = await api<Miembro[]>('/api/proyectos/' + p.id + '/miembros'), dueno = p.rol === 'dueno';
  $('#listaMiembros').innerHTML = lista.map(m => `<div class="miembro${m.vencido ? ' miembro-vencido' : ''}">${avatarHtml(m)}
    <span class="datos"><b>${esc(m.nombre)}${m.id === yo.id ? ' (tú)' : ''} ${plazoTxt(m)}</b><small>${esc(m.email)}${m.invitacion_id ? ' · entró con un enlace' : ''}</small>
      ${dueno && m.rol !== 'dueno' ? `<span class="plazo-acc">${m.expira ? `<button class="enlace-btn" data-a="plazo-miembro" data-id="${esc(m.id)}" data-op="extender" data-dias="7">+7 días</button><button class="enlace-btn" data-a="plazo-miembro" data-id="${esc(m.id)}" data-op="extender" data-dias="30">+30 días</button><button class="enlace-btn" data-a="plazo-miembro" data-id="${esc(m.id)}" data-op="sin">Sin plazo</button>`
        : `<button class="enlace-btn" data-a="plazo-miembro" data-id="${esc(m.id)}" data-op="poner" data-dias="7">Poner plazo de 7 días</button>`}</span>` : ''}</span>
    ${m.rol === 'dueno' || !dueno ? `<span class="rol">${esc(ROL[m.rol])}</span>` : `<select data-miembro="${esc(m.id)}" aria-label="Permiso de ${esc(m.nombre)}">
      <option value="editor"${m.rol === 'editor' ? ' selected' : ''}>Puede editar</option><option value="lector"${m.rol === 'lector' ? ' selected' : ''}>Solo ver</option><option value="__quitar">Quitar acceso</option></select>`}</div>`).join('');
}

export function tarjetaEnlace(i: Invitacion, adm = false): string {
  const activa = i.estado === 'activa', quien = i.usado_por || [];
  const acc = (op: string, txt: string): string => `<button class="btn fantasma peq" data-a="inv-op" data-id="${esc(i.id)}" data-op="${op}"${adm ? ' data-admin="1"' : ''}>${txt}</button>`;
  return `<div class="enlace enlace-v2 ${activa ? '' : 'terminado'}">
    <div class="enlace-cab"><span class="enlace-ic" aria-hidden="true">🔗</span>
      <span class="datos"><b>${i.rol ? (i.rol === 'editor' ? 'Puede editar' : 'Solo ver') : (esc(i.nota) || 'Enlace de registro')} <span class="estado-inv ${i.estado}">${ESTADO_INV[i.estado]}</span></b>
      <small>${usos(i)} · ${activa ? fechaFut(i.expira) : i.expira ? 'caducaba el ' + fechaCorta(i.expira) : 'sin caducidad'}${i.rol ? ' · acceso ' + (i.acceso_dias ? 'por ' + i.acceso_dias + (i.acceso_dias === 1 ? ' día' : ' días') : 'sin plazo') : ''} · creado ${fechaRel(i.creado)}</small></span></div>
    ${quien.length ? `<div class="usado-por"><span class="tenue">Lo usaron:</span>${quien.map(u => `<span class="quien" title="${esc(new Date(u.fecha).toLocaleString('es'))}"><b>${esc(u.nombre)}</b> ${esc(u.email)} <span class="tenue">· ${fechaRel(u.fecha)}</span></span>`).join('')}</div>` : '<div class="usado-por tenue">Nadie lo ha usado todavía.</div>'}
    <div class="enlace-acc">${acc('dias7', '+7 días')}${acc('dias30', '+30 días')}${acc('sin_caducidad', 'Sin caducidad')}${acc('mas5', '+5 usos')}${i.usos_max ? acc('sin_limite', 'Sin límite de usos') : ''}${i.rol ? `<select class="sel-acceso" data-a-sel="inv-acceso" data-id="${esc(i.id)}" aria-label="Cuánto dura el acceso"><option value="">Acceso: ${i.acceso_dias ? i.acceso_dias + ' días' : 'siempre'}</option><option value="sin">Siempre</option><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option></select>` : ''}
      ${i.estado === 'revocada' ? acc('reactivar', 'Reactivar') : activa ? `<button class="btn fantasma peq peligro" data-a="revocar" data-id="${esc(i.id)}"${adm ? ' data-vista-tras="admin"' : ''}>Revocar</button>` : ''}</div>
  </div>`;
}

export async function pintarEnlaces(): Promise<void> {
  if (!compartiendo) return;
  const lista = await api<Invitacion[]>('/api/proyectos/' + compartiendo.id + '/invitaciones');
  const act = lista.filter(i => i.estado === 'activa'), fin = lista.filter(i => i.estado !== 'activa');
  $('#listaEnlaces').innerHTML = (act.length ? `<h4>Enlaces activos</h4>` + act.map(i => tarjetaEnlace(i)).join('') : '')
    + (fin.length ? `<details class="enlaces-fin"><summary>Enlaces terminados (${fin.length}) · ver quién los usó o reactivarlos</summary>${fin.map(i => tarjetaEnlace(i)).join('')}</details>` : '');
}

export function abrirCompartir(p: Proyecto): void {
  compartiendo = p;
  const dueno = p.rol === 'dueno';
  $('#tCompartir').textContent = (dueno ? 'Compartir «' : 'Acceso a «') + p.nombre + '»';
  $('#secEnlace').hidden = !dueno; $('#secCorreo').hidden = !dueno;
  $('#ayudaCorreo').textContent = yo.correo_activo ? 'Si ya tiene cuenta entra al momento y le avisamos. Si no, le enviamos una invitación para que la cree.' : 'Para personas que ya tienen cuenta en este servidor.';
  $('#errInvitar').textContent = ''; $('#enlaceNuevo').hidden = true; $('#listaEnlaces').innerHTML = '';
  $('#listaMiembros').innerHTML = '<div class="cargando">Cargando…</div>';
  dlg('#dlgCompartir').showModal();
  pintarMiembros().catch(ex => aviso(ex.message, 'err'));
  if (dueno) pintarEnlaces().catch(ex => aviso(ex.message, 'err'));
}

/* Acciones de los botones (las llama el manejador de clics de index.ts). */
export function plazoMiembro(b: HTMLElement, id: string): void {
  if (!compartiendo) return;
  const cuerpo = b.dataset.op === 'sin' ? { sin_plazo: true } : b.dataset.op === 'poner' ? { plazo_dias: +(b.dataset.dias || 7) } : { extender_dias: +(b.dataset.dias || 7) };
  api<{ expira: string | null }>('/api/proyectos/' + compartiendo.id + '/miembros/' + id, { method: 'PATCH', json: cuerpo })
    .then(r => { aviso(r.expira ? 'Acceso hasta el ' + fechaCorta(r.expira) + '.' : 'Acceso sin plazo.'); return pintarMiembros(); })
    .then(nav.refrescar).catch(ex => aviso(ex.message, 'err'));
}
const OPS_INV: Record<string, object> = { dias7: { dias: 7 }, dias30: { dias: 30 }, sin_caducidad: { sin_caducidad: true }, mas5: { mas_usos: 5 }, sin_limite: { sin_limite: true }, reactivar: { reactivar: true } };
export function operarEnlace(b: HTMLElement, id: string): void {
  api('/api/invitaciones/' + id, { method: 'PATCH', json: OPS_INV[b.dataset.op || ''] })
    .then(() => { aviso('Enlace actualizado.'); return b.dataset.admin ? nav.mostrar() : pintarEnlaces(); }).catch(ex => aviso(ex.message, 'err'));
}
export function revocarEnlace(b: HTMLElement, id: string): void {
  if (!confirm('¿Revocar este enlace? Quien lo tenga ya no podrá usarlo (las personas que ya entraron siguen dentro).')) return;
  api('/api/invitaciones/' + id, { method: 'DELETE' })
    .then(() => { aviso('Enlace revocado.'); return b.dataset.vistaTras === 'admin' ? nav.mostrar() : pintarEnlaces(); })
    .catch(ex => aviso(ex.message, 'err'));
}
export function abrirRegistro(): void {
  ($('#formRegistro') as El & HTMLFormElement).reset(); $('#registroNuevo').hidden = true; $('#campoEmailReg').hidden = !yo.correo_activo;
  dlg('#dlgRegistro').showModal();
}

$('#formEnlace').addEventListener('submit', async e => {
  e.preventDefault(); if (!compartiendo) return;
  const f = objetivo(e), d = datosForm(f), b = f.querySelector('button') as HTMLButtonElement; b.disabled = true;
  try {
    const r = await api<Invitacion>('/api/proyectos/' + compartiendo.id + '/invitaciones', { method: 'POST', json: { rol: d.rol, dias: numONulo(d.dias), usos_max: numONulo(d.usos_max), acceso_dias: numONulo(d.acceso_dias) } });
    const url = $('#enlaceUrl') as HTMLInputElement; url.value = location.origin + r.ruta; $('#enlaceNuevo').hidden = false; url.select();
    await pintarEnlaces();
    if (!pref('enlace_creado')) guardarPref({ enlace_creado: true });
  } catch (ex: any) { aviso(ex.message, 'err'); }
  b.disabled = false;
});
$('#formInvitar').addEventListener('submit', async e => {
  e.preventDefault(); $('#errInvitar').textContent = ''; if (!compartiendo) return;
  const f = objetivo(e) as El & HTMLFormElement, d = datosForm(f);
  try {
    const r = await api<{ invitado?: boolean; enviado?: boolean }>('/api/proyectos/' + compartiendo.id + '/miembros', { method: 'POST', json: { email: d.email, rol: d.rol, dias: numONulo(d.dias || '') } });
    f.reset();
    if (r.invitado) { await pintarEnlaces(); aviso(r.enviado ? 'No tenía cuenta: le enviamos una invitación por correo.' : 'Se creó la invitación, pero el correo no salió. Revisa la configuración SMTP.', r.enviado ? '' : 'err'); }
    else { await pintarMiembros(); aviso('Añadido: ya puede abrir el mapa' + (yo.correo_activo ? ' y le avisamos por correo.' : '.')); nav.refrescar(); }
  } catch (ex: any) { $('#errInvitar').textContent = ex.message; }
});
document.addEventListener('change', e => {
  const s = (e.target as Element).closest?.<HTMLSelectElement>('[data-a-sel="inv-acceso"]'); if (!s || !s.value) return;
  api('/api/invitaciones/' + s.dataset.id, { method: 'PATCH', json: s.value === 'sin' ? { acceso_sin_plazo: true } : { acceso_dias: +s.value } })
    .then(() => { aviso('El acceso que da este enlace se cambió (vale para quienes entren a partir de ahora).'); return pintarEnlaces(); }).catch(ex => aviso(ex.message, 'err'));
});
$('#listaMiembros').addEventListener('change', async e => {
  const s = (e.target as Element).closest<HTMLSelectElement>('[data-miembro]'); if (!s || !compartiendo) return;
  const ruta = '/api/proyectos/' + compartiendo.id + '/miembros/' + s.dataset.miembro;
  try {
    if (s.value === '__quitar') await api(ruta, { method: 'DELETE' });
    else await api(ruta, { method: 'PATCH', json: { rol: s.value } });
    await pintarMiembros(); aviso('Permisos actualizados.'); nav.refrescar();
  } catch (ex: any) { aviso(ex.message, 'err'); }
});

/* Enlaces de registro (administración) */
$('#formRegistro').addEventListener('submit', async e => {
  e.preventDefault();
  const d = datosForm(objetivo(e)), b = $('#bCrearRegistro') as HTMLButtonElement; b.disabled = true;
  try {
    const r = await api<Invitacion>('/api/invitaciones', { method: 'POST', json: { nota: d.nota, dias: numONulo(d.dias), usos_max: numONulo(d.usos_max), email: d.email || null } });
    if (d.email) aviso(r.enviado ? 'Invitación enviada a ' + d.email + '.' : 'El enlace se creó, pero el correo no salió.', r.enviado ? '' : 'err');
    const url = $('#registroUrl') as HTMLInputElement; url.value = location.origin + r.ruta; $('#registroNuevo').hidden = false; url.select();
    if (vistaActual() === 'admin') nav.mostrar();
  } catch (ex: any) { aviso(ex.message, 'err'); }
  b.disabled = false;
});
