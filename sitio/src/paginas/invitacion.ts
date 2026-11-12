/* Página /invitacion/<token>: muestra quién invita y a qué. Con sesión: «Unirme». Sin sesión: crear la cuenta aquí mismo (vale
   aunque el registro esté cerrado) o entrar con una cuenta que ya existe y volver. */
import { api, esc, miniatura } from '../comun';
import { $, datosForm } from '../dom';
import type { InfoInvitacion, RespuestaEntrada, Usuario } from '../tipos';

const caja = $('#inv');
const token = decodeURIComponent(location.pathname.split('/').pop() || '');
const ROL: Record<string, string> = { editor: 'editar', lector: 'ver' };
const urlEditor = (p: { id: string; mapa_inicial: string }) => '/editor/?p=' + encodeURIComponent(p.id) + '&m=' + encodeURIComponent(p.mapa_inicial);
$('#arte').innerHTML = miniatura('invitacion-' + token.slice(0, 6), { ancho: 640, alto: 720, acento: true });

function error(msg: string): void {
  caja.innerHTML = `<h1>Invitación no válida</h1><p class="sub">${esc(msg)}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn prim" href="/entrar">Entrar</a><a class="btn" href="/">Ir al inicio</a></div>`;
}

async function cargar(): Promise<void> {
  let inv: InfoInvitacion, yo: Usuario | null = null;
  try { inv = await api<InfoInvitacion>('/api/invitacion/' + encodeURIComponent(token), { sinRedirigir: true }); }
  catch (ex: any) { return error(ex.message); }
  try { yo = await api<Usuario>('/api/cuenta/yo', { sinRedirigir: true }); } catch { yo = null; }

  const titulo = inv.tipo === 'proyecto'
    ? `${esc(inv.invita)} te invita a ${ROL[inv.rol || 'lector']} «${esc(inv.proyecto)}»`
    : `${esc(inv.invita)} te invita a Map Creator`;
  const ficha = inv.tipo === 'proyecto' ? `<div class="inv-ficha"><span class="inv-mini">${miniatura('inv-' + inv.proyecto, { ancho: 320, alto: 200 })}</span>
    <span><b>${esc(inv.proyecto)}</b><small>${inv.rol === 'editor' ? 'Podrás editar' : 'Solo podrás ver'}${inv.acceso_dias ? ' durante ' + inv.acceso_dias + (inv.acceso_dias === 1 ? ' día' : ' días') : ''}${inv.descripcion ? ' · ' + esc(inv.descripcion) : ''}</small></span></div>` : '';

  if (yo) {
    caja.innerHTML = `<h1>${titulo}</h1>${ficha}
      <p class="sub">Entraste como <b>${esc(yo.nombre)}</b> (${esc(yo.email)}).</p>
      <p class="error-form" id="errInv" role="alert"></p>
      <button class="btn prim grande" id="bUnirme">${inv.tipo === 'proyecto' ? 'Unirme y abrir el mapa' : 'Ir a mis mapas'}</button>
      <p class="alt">¿No eres tú? <a href="#" id="bOtra">Entrar con otra cuenta</a></p>`;
    const bu = $('#bUnirme') as HTMLButtonElement;
    bu.addEventListener('click', async () => {
      bu.disabled = true;
      try {
        const r = await api<{ proyecto: { id: string; mapa_inicial: string } | null }>('/api/invitacion/' + encodeURIComponent(token) + '/aceptar', { method: 'POST' });
        location.href = r.proyecto ? urlEditor(r.proyecto) : '/app';
      } catch (ex: any) { $('#errInv').textContent = ex.message; bu.disabled = false; }
    });
    $('#bOtra').addEventListener('click', async (e: Event) => {
      e.preventDefault(); await api('/api/cuenta/salir', { method: 'POST' }).catch(() => undefined); location.reload();
    });
    return;
  }

  const volver = encodeURIComponent(location.pathname);
  caja.innerHTML = `<h1>${titulo}</h1>${ficha}
    <p class="sub">Crea tu cuenta para aceptar. Si ya tienes una, <a href="/entrar?siguiente=${volver}">entra</a> y vuelve a este enlace.</p>
    <form id="formInv" novalidate>
      <label class="campo"><span>Nombre</span><input type="text" name="nombre" autocomplete="name" maxlength="80" required autofocus></label>
      <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="campo"><span>Contraseña</span><input type="password" name="clave" autocomplete="new-password" minlength="8" required><small>Mínimo 8 caracteres.</small></label>
      <p class="error-form" id="errInv" role="alert"></p>
      <button class="btn prim grande" type="submit">Crear cuenta y aceptar</button>
    </form>
    <p class="alt">¿Ya tienes cuenta? <a href="/entrar?siguiente=${volver}">Entra</a></p>`;
  const f = $('#formInv'), err = $('#errInv');
  f.addEventListener('submit', async (e: Event) => {
    e.preventDefault(); err.textContent = '';
    const d = datosForm(f);
    if (!d.nombre.trim() || !d.email.trim()) { err.textContent = 'Completa tu nombre y tu correo.'; return; }
    if (d.clave.length < 8) { err.textContent = 'La contraseña necesita al menos 8 caracteres.'; return; }
    const b = f.querySelector('button[type=submit]') as HTMLButtonElement; b.disabled = true;
    try {
      const r = await api<RespuestaEntrada>('/api/cuenta/registro', { method: 'POST', json: { ...d, invitacion: token }, sinRedirigir: true });
      const destino = r.proyecto ? urlEditor(r.proyecto) : '/app';
      location.href = r.verificar ? '/verificar?siguiente=' + encodeURIComponent(destino) : destino;
    } catch (ex: any) {
      err.innerHTML = esc(ex.message) + (ex.code === 'already_exists' ? ` <a href="/entrar?siguiente=${volver}">Entrar</a>` : '');
      b.disabled = false;
    }
  });
}
cargar();
