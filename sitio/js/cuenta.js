/* Entrar y crear cuenta. Tras entrar vuelve a ?siguiente= (solo rutas de esta web) o al panel.
   - Registro con correo activo: lleva a /verificar para escribir el código que llegó al correo.
   - Entrar con verificación en dos pasos: tras la contraseña pide el código que llegó al correo. */
(function () {
  'use strict';
  const { api, esc, siguiente: sig, campoCodigo, cuentaAtras } = window.MC;
  const f = document.getElementById('formCuenta'); if (!f) return;
  const err = document.getElementById('errorForm'), modo = f.dataset.modo;
  const siguiente = sig('/app');
  document.querySelectorAll('.alt a').forEach(a => { if (siguiente !== '/app') a.href += '?siguiente=' + encodeURIComponent(siguiente); });
  const arte = document.getElementById('arte');
  if (arte) arte.innerHTML = MC.miniatura('map-creator-' + modo, { ancho: 640, alto: 720, acento: true });

  f.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const datos = Object.fromEntries(new FormData(f));
    if (modo === 'registro' && String(datos.clave || '').length < 8) { err.textContent = 'La contraseña necesita al menos 8 caracteres.'; return; }
    if (!f.checkValidity()) { err.textContent = 'Completa todos los campos.'; return; }
    const b = f.querySelector('button[type=submit]'); b.disabled = true;
    try {
      const r = await api('/api/cuenta/' + modo, { method: 'POST', json: datos, sinRedirigir: true });
      if (r.dos_pasos) return pasoCodigo(r);
      location.href = r.verificar ? '/verificar?siguiente=' + encodeURIComponent(siguiente) : siguiente;
    } catch (ex) { err.textContent = ex.message; b.disabled = false; }
  });

  // Segundo paso: el código que llegó al correo.
  function pasoCodigo(r) {
    let desafio = r.desafio;
    const caja = f.closest('.form-caja');
    caja.innerHTML = `<h1>Revisa tu correo</h1>
      <p class="sub">Tu cuenta tiene la verificación en dos pasos. Enviamos un código de 6 dígitos a <b>${esc(r.email)}</b>.</p>
      <form id="formCodigo" novalidate>
        <label class="campo"><span>Código</span><input type="text" name="codigo" required autofocus aria-describedby="ayudaCodigo"></label>
        <small class="ayuda-codigo" id="ayudaCodigo">Caduca en 15 minutos. Mira también en la carpeta de spam.</small>
        <p class="error-form" id="errCodigo" role="alert"></p>
        <button class="btn prim grande" type="submit">Entrar</button>
      </form>
      <p class="alt"><button class="enlace-btn" type="button" id="bReenviar">Reenviar código</button> · <a href="/entrar">Volver</a></p>`;
    const fc = document.getElementById('formCodigo'), ec = document.getElementById('errCodigo'), br = document.getElementById('bReenviar');
    const valor = campoCodigo(fc.codigo, () => fc.requestSubmit());
    cuentaAtras(br, 60);
    fc.addEventListener('submit', async e => {
      e.preventDefault(); ec.textContent = '';
      if (valor().length !== 6) { ec.textContent = 'Escribe los 6 dígitos.'; return; }
      const b = fc.querySelector('button[type=submit]'); b.disabled = true;
      try { await api('/api/cuenta/entrar/codigo', { method: 'POST', json: { desafio, codigo: valor() }, sinRedirigir: true }); location.href = siguiente; }
      catch (ex) {
        ec.textContent = ex.message; b.disabled = false; fc.codigo.select();
        if (ex.code === 'codigo_caducado') ec.textContent += ' Pulsa «Reenviar código».';
      }
    });
    br.addEventListener('click', async () => {
      ec.textContent = '';
      try { const n = await api('/api/cuenta/entrar/reenviar', { method: 'POST', json: { desafio }, sinRedirigir: true }); desafio = n.desafio; MC.aviso('Te enviamos otro código.'); cuentaAtras(br, 60); }
      catch (ex) { ec.textContent = ex.message; }
    });
  }
})();
