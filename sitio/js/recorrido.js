/* Map Creator: recorrido guiado (walkthrough). Lo usan el panel (/app) y el editor en modo nube (editor/js/nucleo/nube.js).
   Sin dependencias; trae su propio CSS para no depender de los estilos de cada página.

   MCRecorrido.iniciar([{ el: '#selector' | () => Element | null, titulo, texto }], { alTerminar(completo) })
   - Ilumina el elemento y pone una ficha al lado. Si el elemento no existe o no se ve, la ficha sale centrada.
   - Teclado: → o Enter = siguiente, ← = atrás, Esc = saltar. */
(function () {
  'use strict';
  if (window.MCRecorrido) return;

  const CSS = `
.mcr-velo{position:fixed;inset:0;z-index:100000;background:transparent}
.mcr-velo.sin-foco{background:rgba(8,11,16,.6)}
.mcr-foco{position:fixed;z-index:100001;border-radius:10px;box-shadow:0 0 0 3px #f07a1a,0 0 0 9999px rgba(8,11,16,.6);pointer-events:none;
  transition:left .25s ease,top .25s ease,width .25s ease,height .25s ease}
.mcr-pop{position:fixed;z-index:100002;width:min(340px,calc(100vw - 24px));background:#1b1e23;color:#e8eaed;border:1px solid #2c3138;
  border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:18px 18px 14px;font:14.5px/1.5 "IBM Plex Sans",system-ui,sans-serif;
  transition:left .25s ease,top .25s ease;text-align:left}
.mcr-pop h3{margin:0 0 6px;font-size:16.5px;font-weight:600;letter-spacing:-.01em;color:#fff}
.mcr-pop p{margin:0;color:#c3c9d1}
.mcr-pop p kbd{font:500 12px/1 "IBM Plex Mono",monospace;background:#2c3138;border:1px solid #3a4049;border-radius:4px;padding:2px 5px;color:#e8eaed}
.mcr-pop p b{color:#fff;font-weight:600}
.mcr-pie{display:flex;align-items:center;gap:8px;margin-top:16px}
.mcr-pasos{display:flex;gap:4px;margin-right:auto}
.mcr-pasos i{width:6px;height:6px;border-radius:50%;background:#3a4049}
.mcr-pasos i.on{background:#f07a1a;width:16px;border-radius:3px}
.mcr-pop button{all:unset;cursor:pointer;font:500 13.5px/1 "IBM Plex Sans",system-ui,sans-serif;padding:8px 12px;border-radius:7px;color:#c3c9d1}
.mcr-pop button:hover{background:#2c3138;color:#fff}
.mcr-pop button:focus-visible{outline:2px solid #f07a1a;outline-offset:2px}
.mcr-pop button.mcr-sig{background:#e2690b;color:#fff}
.mcr-pop button.mcr-sig:hover{background:#f07a1a}
.mcr-pop .mcr-x{position:absolute;right:8px;top:8px;padding:6px 8px;font-size:15px;color:#8a939d}
@media (prefers-reduced-motion:reduce){.mcr-foco,.mcr-pop{transition:none}}`;

  function visible(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    return r;
  }

  function iniciar(pasos, opciones) {
    const o = opciones || {};
    pasos = pasos.filter(Boolean);
    if (!pasos.length) return;
    if (!document.getElementById('mcr-css')) {
      const st = document.createElement('style'); st.id = 'mcr-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const previo = document.activeElement;
    const velo = document.createElement('div'); velo.className = 'mcr-velo';
    const foco = document.createElement('div'); foco.className = 'mcr-foco';
    const pop = document.createElement('div'); pop.className = 'mcr-pop';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-labelledby', 'mcr-tit');
    document.body.append(velo, foco, pop);
    let i = 0, terminado = false;

    const elemento = p => { try { return typeof p.el === 'function' ? p.el() : p.el ? document.querySelector(p.el) : null; } catch (e) { return null; } };

    function colocar() {
      const p = pasos[i], el = elemento(p), r = visible(el), m = 8;
      if (r) {
        foco.style.display = ''; velo.classList.remove('sin-foco');
        Object.assign(foco.style, { left: r.left - m + 'px', top: r.top - m + 'px', width: r.width + 2 * m + 'px', height: r.height + 2 * m + 'px' });
      } else { foco.style.display = 'none'; velo.classList.add('sin-foco'); }
      const w = pop.offsetWidth, h = pop.offsetHeight, g = 14;
      let x, y;
      if (!r) { x = (innerWidth - w) / 2; y = (innerHeight - h) / 2; }
      else if (r.bottom + m + g + h < innerHeight) { x = r.left + r.width / 2 - w / 2; y = r.bottom + m + g; }        // debajo
      else if (r.top - m - g - h > 0) { x = r.left + r.width / 2 - w / 2; y = r.top - m - g - h; }                   // encima
      else if (r.right + m + g + w < innerWidth) { x = r.right + m + g; y = r.top + r.height / 2 - h / 2; }          // derecha
      else if (r.left - m - g - w > 0) { x = r.left - m - g - w; y = r.top + r.height / 2 - h / 2; }                 // izquierda
      else { x = (innerWidth - w) / 2; y = innerHeight - h - 16; }                                                    // elemento enorme
      pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, x)) + 'px';
      pop.style.top = Math.max(12, Math.min(innerHeight - h - 12, y)) + 'px';
    }

    function pintar() {
      const p = pasos[i], ultimo = i === pasos.length - 1;
      const el = elemento(p);
      if (el && !visible(el) && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      pop.innerHTML = `<button class="mcr-x" data-r="saltar" aria-label="Cerrar el recorrido">✕</button>
        <h3 id="mcr-tit">${p.titulo}</h3><p>${p.texto}</p>
        <div class="mcr-pie"><span class="mcr-pasos" aria-label="Paso ${i + 1} de ${pasos.length}">${pasos.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
        ${i > 0 ? '<button data-r="atras">Atrás</button>' : '<button data-r="saltar">Saltar</button>'}
        <button class="mcr-sig" data-r="sig">${ultimo ? (o.textoFin || 'Empezar') : 'Siguiente'}</button></div>`;
      colocar();
      pop.querySelector('.mcr-sig').focus();
    }

    function cerrar(completo) {
      if (terminado) return; terminado = true;
      velo.remove(); foco.remove(); pop.remove();
      removeEventListener('resize', colocar); removeEventListener('scroll', colocar, true); document.removeEventListener('keydown', tecla, true);
      if (previo && previo.focus) try { previo.focus(); } catch (e) { }
      if (o.alTerminar) o.alTerminar(completo);
    }
    const ir = d => { const n = i + d; if (n >= pasos.length) return cerrar(true); if (n >= 0) { i = n; pintar(); } };
    function tecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target.closest && !e.target.closest('.mcr-pop button:not(.mcr-sig)'))) { e.preventDefault(); e.stopPropagation(); ir(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); ir(-1); }
      else if (e.key === 'Tab') { // el foco se queda en la ficha
        const bs = [...pop.querySelectorAll('button')], k = bs.indexOf(document.activeElement);
        e.preventDefault(); bs[(k + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
      } else if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); // que los atajos del editor no se disparen debajo
    }
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      if (b.dataset.r === 'sig') ir(1); else if (b.dataset.r === 'atras') ir(-1); else cerrar(false);
    });
    addEventListener('resize', colocar); addEventListener('scroll', colocar, true); document.addEventListener('keydown', tecla, true);
    pintar();
    return { cerrar: () => cerrar(false) };
  }

  window.MCRecorrido = { iniciar };
})();
