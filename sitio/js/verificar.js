/* /verificar: escribir el código que llegó al correo tras crear la cuenta (o pedir otro). */
(function () {
  'use strict';
  const { api, esc, aviso, siguiente, campoCodigo, cuentaAtras, miniatura } = window.MC;
  document.getElementById('arte').innerHTML = miniatura('verificar', { ancho: 640, alto: 720, acento: true });
  const f = document.getElementById('formVer'), err = document.getElementById('errVer'), br = document.getElementById('bReenviar');
  const destino = siguiente('/app');
  const valor = campoCodigo(f.codigo, () => f.requestSubmit());
  api('/api/cuenta/yo').then(yo => {
    if (yo.email_verificado) { location.href = destino; return; }
    document.getElementById('subVer').innerHTML = `Te enviamos un código de 6 dígitos a <b>${esc(yo.email)}</b>. Escríbelo para empezar a usar Map Creator.`;
  }).catch(() => { });
  cuentaAtras(br, 60);
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    if (valor().length !== 6) { err.textContent = 'Escribe los 6 dígitos.'; return; }
    const b = f.querySelector('button[type=submit]'); b.disabled = true;
    try { await api('/api/cuenta/verificar', { method: 'POST', json: { codigo: valor() } }); aviso('Correo verificado.'); location.href = destino; }
    catch (ex) { err.textContent = ex.message + (ex.code === 'codigo_caducado' ? ' Pulsa «Reenviar código».' : ''); b.disabled = false; f.codigo.select(); }
  });
  br.addEventListener('click', async () => {
    err.textContent = '';
    try { await api('/api/cuenta/verificar/reenviar', { method: 'POST' }); aviso('Te enviamos otro código.'); cuentaAtras(br, 60); }
    catch (ex) { err.textContent = ex.message; if (ex.status === 429) { const s = /(\d+) s/.exec(ex.message); if (s) cuentaAtras(br, +s[1]); } }
  });
  document.getElementById('bSalir').addEventListener('click', () => api('/api/cuenta/salir', { method: 'POST' }).finally(() => { location.href = '/entrar'; }));
})();
