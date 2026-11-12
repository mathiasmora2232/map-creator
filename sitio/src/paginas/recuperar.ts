/* /recuperar: olvidé mi contraseña. Paso 1: el correo. Paso 2: el código que llegó y la contraseña nueva.
   El enlace del correo trae ?email= para saltar al paso 2. */
import { api, aviso, campoCodigo, cuentaAtras, esc, miniatura } from '../comun';
import { $, type El } from '../dom';

$('#arte').innerHTML = miniatura('recuperar', { ancho: 640, alto: 720, acento: true });
const caja = $('#caja');
const qs = new URLSearchParams(location.search);

function paso1(email = '', error = ''): void {
  caja.innerHTML = `<h1>¿Olvidaste tu contraseña?</h1>
    <p class="sub">Escribe el correo de tu cuenta y te enviaremos un código para elegir una nueva.</p>
    <form id="f1" novalidate>
      <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="email" required autofocus value="${esc(email)}"></label>
      <p class="error-form" id="e1" role="alert">${esc(error)}</p>
      <button class="btn prim grande" type="submit">Enviar código</button>
    </form>
    <p class="alt"><a href="/entrar">Volver a entrar</a></p>`;
  const f = $('#f1');
  f.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const correo = String(f.email.value).trim();
    if (!/^\S+@\S+\.\S+$/.test(correo)) { $('#e1').textContent = 'Escribe un correo válido.'; return; }
    const b = f.querySelector('button') as HTMLButtonElement; b.disabled = true;
    try { await api('/api/cuenta/recuperar', { method: 'POST', json: { email: correo }, sinRedirigir: true }); paso2(correo, true); }
    catch (ex: any) { $('#e1').textContent = ex.message; b.disabled = false; }
  });
}

function paso2(email: string, recienEnviado: boolean): void {
  caja.innerHTML = `<h1>Elige una contraseña nueva</h1>
    <p class="sub">Si <b>${esc(email)}</b> tiene una cuenta, le llegó un código de 6 dígitos. <a href="#" id="otroCorreo">¿Otro correo?</a></p>
    <form id="f2" novalidate>
      <label class="campo"><span>Código</span><input type="text" name="codigo" required autofocus></label>
      <label class="campo"><span>Contraseña nueva</span><input type="password" name="clave_nueva" autocomplete="new-password" minlength="8" required><small>Mínimo 8 caracteres.</small></label>
      <p class="error-form" id="e2" role="alert"></p>
      <button class="btn prim grande" type="submit">Cambiar la contraseña y entrar</button>
    </form>
    <p class="alt"><button class="enlace-btn" type="button" id="bReenviar">Reenviar código</button> · <a href="/entrar">Volver a entrar</a></p>`;
  const f = $('#f2'), e2 = $('#e2'), br = $('#bReenviar') as El & HTMLButtonElement;
  const valor = campoCodigo(f.codigo, () => f.clave_nueva.focus());
  if (recienEnviado) cuentaAtras(br, 60);
  $('#otroCorreo').addEventListener('click', (e: Event) => { e.preventDefault(); paso1(email); });
  f.addEventListener('submit', async (e: Event) => {
    e.preventDefault(); e2.textContent = '';
    if (valor().length !== 6) { e2.textContent = 'Escribe los 6 dígitos del código.'; f.codigo.focus(); return; }
    if (f.clave_nueva.value.length < 8) { e2.textContent = 'La contraseña nueva necesita al menos 8 caracteres.'; f.clave_nueva.focus(); return; }
    const b = f.querySelector('button[type=submit]') as HTMLButtonElement; b.disabled = true;
    try {
      await api('/api/cuenta/recuperar/confirmar', { method: 'POST', json: { email, codigo: valor(), clave_nueva: f.clave_nueva.value }, sinRedirigir: true });
      aviso('Contraseña cambiada.'); location.href = '/app';
    } catch (ex: any) { e2.textContent = ex.message + (ex.code === 'codigo_caducado' ? ' Pulsa «Reenviar código».' : ''); b.disabled = false; }
  });
  br.addEventListener('click', async () => {
    e2.textContent = '';
    try { await api('/api/cuenta/recuperar', { method: 'POST', json: { email }, sinRedirigir: true }); aviso('Si la cuenta existe, le enviamos otro código.'); cuentaAtras(br, 60); }
    catch (ex: any) { e2.textContent = ex.message; }
  });
}

fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).then((c: { correo: boolean }) => {
  if (!c.correo) {
    caja.innerHTML = `<h1>Recuperar la contraseña</h1><p class="sub">Este servidor todavía no tiene el correo configurado, así que no puede enviarte un código.
      Pide al administrador que te cambie la contraseña.</p><a class="btn prim grande" href="/entrar">Volver a entrar</a>`;
    return;
  }
  const email = qs.get('email');
  if (email) paso2(email, false); else paso1();
}).catch(() => paso1());
