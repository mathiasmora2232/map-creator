/* Map Creator: utilidades del sitio (API, avisos, escape, miniaturas de plano). Sin dependencias ni build. */
(function () {
  'use strict';
  /* tema elegido en Cuenta → Preferencias (se aplica antes de pintar: sin destello del otro tema) */
  try { const t = localStorage.getItem('mc-tema'); if (t === 'claro') document.documentElement.dataset.theme = 'light'; else if (t === 'oscuro') document.documentElement.dataset.theme = 'dark'; } catch (e) { }

  /* Llamada a la API: JSON de ida y vuelta; los errores llegan como {error, code} y se lanzan como Error con .code y .status. */
  async function api(ruta, opciones) {
    const o = Object.assign({ method: 'GET' }, opciones || {});
    const cab = { Accept: 'application/json' };
    if (o.json !== undefined) { cab['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.json); }
    const r = await fetch(ruta, { method: o.method, headers: cab, body: o.body, credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const aqui = encodeURIComponent(location.pathname + location.search + location.hash);
      if (r.status === 401 && !o.sinRedirigir) { location.href = '/entrar?siguiente=' + aqui; }
      if (r.status === 403 && j.code === 'email_no_verificado' && !o.sinRedirigir) { location.href = '/verificar?siguiente=' + aqui; }
      const e = new Error(j.error || 'Algo salió mal (' + r.status + ').'); e.code = j.code; e.status = r.status; throw e;
    }
    return j;
  }

  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let tAviso = null;
  function aviso(texto, tipo) {
    let el = document.querySelector('.aviso');
    if (!el) { el = document.createElement('div'); el.className = 'aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = texto; el.classList.toggle('err', tipo === 'err');
    requestAnimationFrame(() => el.classList.add('ver'));
    clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove('ver'), 3200);
  }

  const fechaRel = iso => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    if (s < 86400 * 7) { const d = Math.round(s / 86400); return 'hace ' + d + (d === 1 ? ' día' : ' días'); }
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /* Miniatura de plano: subdivide un rectángulo en cuartos con una semilla (el id del proyecto), así cada mapa tiene la suya y
     siempre la misma. Paredes claras sobre azul plano, una puerta con barrido y la cota de abajo, como el Plano 2D del editor. */
  function miniatura(semilla, opciones) {
    const o = Object.assign({ ancho: 320, alto: 180, acento: false }, opciones || {});
    let h = 2166136261; for (const c of String(semilla)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
    const W = o.ancho, H = o.alto, m = 22, cuartos = [];
    const partir = (x, y, w, hh, n) => {
      if (n === 0 || (w < 70 && hh < 50)) { cuartos.push([x, y, w, hh]); return; }
      const vert = w / hh > 1.2 ? true : w / hh < .8 ? false : rnd() > .5, f = .35 + rnd() * .3;
      if (vert) { const a = Math.round(w * f); partir(x, y, a, hh, n - 1); partir(x + a, y, w - a, hh, n - 1); }
      else { const a = Math.round(hh * f); partir(x, y, w, a, n - 1); partir(x, y + a, w, hh - a, n - 1); }
    };
    partir(m, m, W - 2 * m, H - 2 * m - 8, 3);
    const lin = 'rgba(214,226,238,.9)', fino = 'rgba(159,179,200,.35)';
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><pattern id="g${h}" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="${fino}" stroke-width=".5"/></pattern></defs>`;
    s += `<rect width="${W}" height="${H}" fill="url(#g${h})"/>`;
    const relleno = ['rgba(240,122,26,.16)', 'rgba(90,160,255,.12)', 'rgba(70,194,90,.10)', 'rgba(255,255,255,.04)'];
    cuartos.forEach(([x, y, w, hh], i) => {
      s += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${o.acento && i === 0 ? relleno[0] : relleno[1 + Math.floor(rnd() * 3)]}" stroke="${lin}" stroke-width="2.4"/>`;
      if (w > 40 && hh > 30 && rnd() > .35) { // puerta: hueco en la pared de abajo y barrido de 90°
        const px = x + 8 + rnd() * (w - 30), py = y + hh, r = 13;
        s += `<line x1="${px}" y1="${py}" x2="${px + r}" y2="${py}" stroke="#1d2733" stroke-width="3.2"/>`;
        s += `<path d="M${px} ${py} L${px} ${py - r} A${r} ${r} 0 0 1 ${px + r} ${py}" fill="none" stroke="${lin}" stroke-width=".8" stroke-dasharray="2 2"/>`;
      }
    });
    const yb = H - m + 2;
    s += `<g stroke="${lin}" stroke-width=".8"><line x1="${m}" y1="${yb}" x2="${W - m}" y2="${yb}"/><line x1="${m}" y1="${yb - 4}" x2="${m}" y2="${yb + 4}"/><line x1="${W - m}" y1="${yb - 4}" x2="${W - m}" y2="${yb + 4}"/></g>`;
    s += `<text x="${W / 2}" y="${yb - 4}" fill="${lin}" font-family="IBM Plex Mono,monospace" font-size="8" text-anchor="middle">${(8 + rnd() * 40).toFixed(1).replace('.', ',')} m</text></svg>`;
    return s;
  }

  const LOGO = '<svg class="logo-ic" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--acc)"/><path d="M8 9h9v6h7v8H8z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M17 15v8" stroke="#fff" stroke-width="1.4"/><path d="M12 23a4 4 0 0 1 4-4" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="1.6 1.6"/></svg>';

  /* La cabecera de la landing gana borde al bajar. */
  const cab = document.querySelector('.cab');
  if (cab) { const f = () => cab.classList.toggle('con-borde', scrollY > 8); addEventListener('scroll', f, { passive: true }); f(); }
  document.querySelectorAll('[data-logo]').forEach(el => el.insertAdjacentHTML('afterbegin', LOGO));

  /* Registro cerrado (solo por invitación): los botones «Crear cuenta» de la landing pasan a «Entrar» y la página de registro lo
     explica en vez de mostrar un formulario que fallaría al final. */
  const conRegistro = document.querySelectorAll('[data-registro],[data-registro-alt],[data-si-correo],#formCuenta[data-modo=registro]');
  if (conRegistro.length) fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).then(c => {
    if (c.correo) document.querySelectorAll('[data-si-correo]').forEach(el => { el.hidden = false; });
    if (c.registro_abierto) return;
    document.querySelectorAll('[data-registro]').forEach(a => { a.href = '/entrar'; a.textContent = a.dataset.registro; });
    document.querySelectorAll('[data-registro-alt]').forEach(p => { p.textContent = '¿No tienes cuenta? El registro es solo por invitación: pide un enlace a quien te quiera dar acceso.'; });
    const f = document.querySelector('#formCuenta[data-modo=registro]');
    if (f) {
      const caja = f.closest('.form-caja');
      caja.innerHTML = '<h1>Registro por invitación</h1><p class="sub">En este servidor solo se puede crear una cuenta con un enlace de invitación. '
        + 'Pídeselo a quien te quiera compartir un mapa o al administrador, y ábrelo: allí mismo podrás crear tu cuenta.</p>'
        + '<a class="btn prim grande" href="/entrar">Ya tengo cuenta: entrar</a>';
    }
  }).catch(() => { });

  /* ?siguiente= solo si es una ruta de esta web. */
  const siguiente = (defecto) => { const s = new URLSearchParams(location.search).get('siguiente') || ''; return /^\/(?!\/)/.test(s) && !s.includes('\\') ? s : (defecto || '/app'); };

  /* Campo de código de 6 dígitos: solo cifras, y al completar los 6 llama a alCompletar (p. ej. enviar el formulario). */
  function campoCodigo(input, alCompletar) {
    input.setAttribute('inputmode', 'numeric'); input.setAttribute('autocomplete', 'one-time-code'); input.setAttribute('maxlength', '7');
    input.setAttribute('pattern', '[0-9 ]*'); input.classList.add('codigo-input');
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 6);
      input.value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
      if (d.length === 6 && alCompletar) alCompletar(d);
    });
    return () => input.value.replace(/\D/g, '');
  }

  /* Botón «Reenviar código» con cuenta atrás. */
  function cuentaAtras(boton, segundos) {
    const texto = boton.dataset.texto || (boton.dataset.texto = boton.textContent);
    let s = segundos; boton.disabled = true;
    const paso = () => { if (s <= 0) { boton.disabled = false; boton.textContent = texto; return; } boton.textContent = texto + ' (' + s + ' s)'; s--; setTimeout(paso, 1000); };
    paso();
  }

  /* Botón «ver contraseña» en todos los campos de contraseña (también en los que se pintan después: recuperar, invitación, cuenta). */
  function ojos(raiz) {
    (raiz || document).querySelectorAll('input[type=password]:not([data-ojo])').forEach(inp => {
      inp.dataset.ojo = '1'; const caja = document.createElement('span'); caja.className = 'clave-caja';
      inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ver-clave'; b.setAttribute('aria-label', 'Mostrar la contraseña'); b.title = 'Mostrar la contraseña';
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      b.addEventListener('click', () => { const ver = inp.type === 'password'; inp.type = ver ? 'text' : 'password'; b.classList.toggle('on', ver); b.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña'); inp.focus(); });
      caja.appendChild(b);
    });
  }
  ojos(); new MutationObserver(() => ojos()).observe(document.body, { childList: true, subtree: true });

  window.MC = { api, esc, aviso, fechaRel, miniatura, LOGO, siguiente, campoCodigo, cuentaAtras };
})();
