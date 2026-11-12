/* /verificar: escribir el código que llegó al correo tras crear la cuenta (o pedir otro). */
import { api, aviso, campoCodigo, cuentaAtras, esc, miniatura, siguiente } from '../comun';
import { $, type El } from '../dom';
import type { Usuario } from '../tipos';

$('#arte').innerHTML = miniatura('verificar', { ancho: 640, alto: 720, acento: true });
const f = $('#formVer') as El & HTMLFormElement, err = $('#errVer'), br = $('#bReenviar') as El & HTMLButtonElement;
const destino = siguiente('/app');
const valor = campoCodigo(f.codigo, () => f.requestSubmit());
api<Usuario>('/api/cuenta/yo').then(yo => {
  if (yo.email_verificado) { location.href = destino; return; }
  $('#subVer').innerHTML = `Te enviamos un código de 6 dígitos a <b>${esc(yo.email)}</b>. Escríbelo para empezar a usar Map Creator.`;
}).catch(() => { /* sin sesión: api() ya redirige */ });
cuentaAtras(br, 60);
f.addEventListener('submit', async e => {
  e.preventDefault(); err.textContent = '';
  if (valor().length !== 6) { err.textContent = 'Escribe los 6 dígitos.'; return; }
  const b = f.querySelector<HTMLButtonElement>('button[type=submit]')!; b.disabled = true;
  try { await api('/api/cuenta/verificar', { method: 'POST', json: { codigo: valor() } }); aviso('Correo verificado.'); location.href = destino; }
  catch (ex: any) { err.textContent = ex.message + (ex.code === 'codigo_caducado' ? ' Pulsa «Reenviar código».' : ''); b.disabled = false; f.codigo.select(); }
});
br.addEventListener('click', async () => {
  err.textContent = '';
  try { await api('/api/cuenta/verificar/reenviar', { method: 'POST' }); aviso('Te enviamos otro código.'); cuentaAtras(br, 60); }
  catch (ex: any) { err.textContent = ex.message; if (ex.status === 429) { const s = /(\d+) s/.exec(ex.message); if (s) cuentaAtras(br, +s[1]); } }
});
$('#bSalir').addEventListener('click', () => { api('/api/cuenta/salir', { method: 'POST' }).finally(() => { location.href = '/entrar'; }); });
