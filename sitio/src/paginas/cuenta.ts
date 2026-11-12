/* Entrar y crear cuenta (/entrar, /registro). Tras entrar vuelve a ?siguiente= (solo rutas de esta web) o al panel.
   - Registro con correo activo: lleva a /verificar para escribir el código que llegó al correo.
   - Entrar con verificación en dos pasos: tras la contraseña pide el código que llegó al correo. */
import { api, aviso, campoCodigo, cuentaAtras, esc, miniatura, siguiente as sig } from '../comun';
import { $, datosForm, type El } from '../dom';
import type { RespuestaEntrada } from '../tipos';

const f = document.getElementById('formCuenta') as HTMLFormElement | null;
if (f) {
  const form = f, err = $('#errorForm'), modo = form.dataset.modo as 'entrar' | 'registro';
  const siguiente = sig('/app');
  document.querySelectorAll<HTMLAnchorElement>('.alt a').forEach(a => { if (siguiente !== '/app') a.href += '?siguiente=' + encodeURIComponent(siguiente); });
  const arte = document.getElementById('arte');
  if (arte) arte.innerHTML = miniatura('map-creator-' + modo, { ancho: 640, alto: 720, acento: true });

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const datos = datosForm(form);
    if (modo === 'registro' && String(datos.clave || '').length < 8) { err.textContent = 'La contraseña necesita al menos 8 caracteres.'; return; }
    if (!form.checkValidity()) { err.textContent = 'Completa todos los campos.'; return; }
    const b = form.querySelector<HTMLButtonElement>('button[type=submit]')!; b.disabled = true;
    try {
      const r = await api<RespuestaEntrada>('/api/cuenta/' + modo, { method: 'POST', json: datos, sinRedirigir: true });
      if (r.dos_pasos) return pasoCodigo(r);
      location.href = r.verificar ? '/verificar?siguiente=' + encodeURIComponent(siguiente) : siguiente;
    } catch (ex: any) { err.textContent = ex.message; b.disabled = false; }
  });

  /* Segundo paso: el código que llegó al correo. */
  function pasoCodigo(r: RespuestaEntrada): void {
    let desafio = r.desafio || '';
    const caja = form.closest('.form-caja')!;
    caja.innerHTML = `<h1>Revisa tu correo</h1>
      <p class="sub">Tu cuenta tiene la verificación en dos pasos. Enviamos un código de 6 dígitos a <b>${esc(r.email)}</b>.</p>
      <form id="formCodigo" novalidate>
        <label class="campo"><span>Código</span><input type="text" name="codigo" required autofocus aria-describedby="ayudaCodigo"></label>
        <small class="ayuda-codigo" id="ayudaCodigo">Caduca en 15 minutos. Mira también en la carpeta de spam.</small>
        <p class="error-form" id="errCodigo" role="alert"></p>
        <button class="btn prim grande" type="submit">Entrar</button>
      </form>
      <p class="alt"><button class="enlace-btn" type="button" id="bReenviar">Reenviar código</button> · <a href="/entrar">Volver</a></p>`;
    const fc = $('#formCodigo') as El & HTMLFormElement, ec = $('#errCodigo'), br = $('#bReenviar') as El & HTMLButtonElement;
    const valor = campoCodigo(fc.codigo, () => fc.requestSubmit());
    cuentaAtras(br, 60);
    fc.addEventListener('submit', async e => {
      e.preventDefault(); ec.textContent = '';
      if (valor().length !== 6) { ec.textContent = 'Escribe los 6 dígitos.'; return; }
      const b = fc.querySelector<HTMLButtonElement>('button[type=submit]')!; b.disabled = true;
      try { await api('/api/cuenta/entrar/codigo', { method: 'POST', json: { desafio, codigo: valor() }, sinRedirigir: true }); location.href = siguiente; }
      catch (ex: any) {
        ec.textContent = ex.message; b.disabled = false; fc.codigo.select();
        if (ex.code === 'codigo_caducado') ec.textContent += ' Pulsa «Reenviar código».';
      }
    });
    br.addEventListener('click', async () => {
      ec.textContent = '';
      try { const n = await api<{ desafio: string }>('/api/cuenta/entrar/reenviar', { method: 'POST', json: { desafio }, sinRedirigir: true }); desafio = n.desafio; aviso('Te enviamos otro código.'); cuentaAtras(br, 60); }
      catch (ex: any) { ec.textContent = ex.message; }
    });
  }
}
