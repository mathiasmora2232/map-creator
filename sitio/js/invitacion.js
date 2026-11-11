/* Página /invitacion/<token>: muestra quién invita y a qué. Con sesión: «Unirme». Sin sesión: crear la cuenta aquí mismo (vale
   aunque el registro esté cerrado) o entrar con una cuenta que ya existe y volver. */
(function () {
  'use strict';
  const { api, esc, miniatura } = window.MC;
  const caja = document.getElementById('inv');
  const token = decodeURIComponent(location.pathname.split('/').pop() || '');
  const ROL = { editor: 'editar', lector: 'ver' };
  const urlEditor = p => '/editor/?p=' + encodeURIComponent(p.id) + '&m=' + encodeURIComponent(p.mapa_inicial);
  document.getElementById('arte').innerHTML = miniatura('invitacion-' + token.slice(0, 6), { ancho: 640, alto: 720, acento: true });

  function error(msg) {
    caja.innerHTML = `<h1>Invitación no válida</h1><p class="sub">${esc(msg)}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn prim" href="/entrar">Entrar</a><a class="btn" href="/">Ir al inicio</a></div>`;
  }

  async function cargar() {
    let inv, yo = null;
    try { inv = await api('/api/invitacion/' + encodeURIComponent(token), { sinRedirigir: true }); }
    catch (ex) { return error(ex.message); }
    try { yo = await api('/api/cuenta/yo', { sinRedirigir: true }); } catch (ex) { yo = null; }

    const titulo = inv.tipo === 'proyecto'
      ? `${esc(inv.invita)} te invita a ${ROL[inv.rol]} «${esc(inv.proyecto)}»`
      : `${esc(inv.invita)} te invita a Map Creator`;
    const ficha = inv.tipo === 'proyecto' ? `<div class="inv-ficha"><span class="inv-mini">${miniatura('inv-' + inv.proyecto, { ancho: 320, alto: 200 })}</span>
      <span><b>${esc(inv.proyecto)}</b><small>${inv.rol === 'editor' ? 'Podrás editar' : 'Solo podrás ver'}${inv.descripcion ? ' · ' + esc(inv.descripcion) : ''}</small></span></div>` : '';

    if (yo) {
      caja.innerHTML = `<h1>${titulo}</h1>${ficha}
        <p class="sub">Entraste como <b>${esc(yo.nombre)}</b> (${esc(yo.email)}).</p>
        <p class="error-form" id="errInv" role="alert"></p>
        <button class="btn prim grande" id="bUnirme">${inv.tipo === 'proyecto' ? 'Unirme y abrir el mapa' : 'Ir a mis mapas'}</button>
        <p class="alt">¿No eres tú? <a href="#" id="bOtra">Entrar con otra cuenta</a></p>`;
      document.getElementById('bUnirme').addEventListener('click', async e => {
        e.target.disabled = true;
        try {
          const r = await api('/api/invitacion/' + encodeURIComponent(token) + '/aceptar', { method: 'POST' });
          location.href = r.proyecto ? urlEditor(r.proyecto) : '/app';
        } catch (ex) { document.getElementById('errInv').textContent = ex.message; e.target.disabled = false; }
      });
      document.getElementById('bOtra').addEventListener('click', async e => {
        e.preventDefault(); await api('/api/cuenta/salir', { method: 'POST' }).catch(() => { }); location.reload();
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
    const f = document.getElementById('formInv'), err = document.getElementById('errInv');
    f.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      const d = Object.fromEntries(new FormData(f));
      if (!d.nombre.trim() || !d.email.trim()) { err.textContent = 'Completa tu nombre y tu correo.'; return; }
      if (d.clave.length < 8) { err.textContent = 'La contraseña necesita al menos 8 caracteres.'; return; }
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      try {
        const r = await api('/api/cuenta/registro', { method: 'POST', json: Object.assign(d, { invitacion: token }), sinRedirigir: true });
        const destino = r.proyecto ? urlEditor(r.proyecto) : '/app';
        location.href = r.verificar ? '/verificar?siguiente=' + encodeURIComponent(destino) : destino;
      } catch (ex) {
        err.innerHTML = esc(ex.message) + (ex.code === 'already_exists' ? ` <a href="/entrar?siguiente=${volver}">Entrar</a>` : '');
        b.disabled = false;
      }
    });
  }
  cargar();
})();
