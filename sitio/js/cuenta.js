/* Entrar y crear cuenta. Tras entrar vuelve a ?siguiente= (solo rutas de esta web) o al panel. */
(function () {
  'use strict';
  const f = document.getElementById('formCuenta'); if (!f) return;
  const err = document.getElementById('errorForm'), modo = f.dataset.modo;
  const siguiente = (() => { const s = new URLSearchParams(location.search).get('siguiente') || ''; return /^\/(?!\/)/.test(s) ? s : '/app'; })();
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
      await MC.api('/api/cuenta/' + modo, { method: 'POST', json: datos, sinRedirigir: true });
      location.href = siguiente;
    } catch (ex) { err.textContent = ex.message; b.disabled = false; }
  });
})();
