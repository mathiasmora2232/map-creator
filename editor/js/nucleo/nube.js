/* Modo nube (Map Creator): barra del proyecto en el editor. Solo actúa si local.js arrancó en modo nube (?p=<proyecto>).
   - «← Mis mapas», nombre del proyecto y rol en la barra superior; aviso fijo si el usuario solo puede ver.
   - El selector de mapas deja solo los del proyecto: el mapa de su plantilla y los propios (u-…); los mapas base de otras plantillas
     se quitan para no mezclar proyectos. «＋ Nuevo mapa…» sigue disponible.
   - Recorrido guiado (sitio/js/recorrido.js) la primera vez que el usuario abre el editor, con ?recorrido=1 o con el botón «Guía». */
(function () {
  'use strict';
  const N = window.OONube; if (!N) return;
  document.documentElement.classList.add('modo-nube');
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLES = { dueno: 'Dueño', editor: 'Editor', lector: 'Solo lectura' };
  N.info.then(p => {
    if (!p) return;
    N.nombre = p.nombre; /* lo usa la exportación para nombrar la raíz de la escena */
    document.title = p.nombre + ' · Map Creator';
    const marca = document.querySelector('#barra .marca');
    if (marca) {
      marca.innerHTML = `<a class="nube-volver" href="/app" title="Volver a Mis mapas">←</a>`
        + `<span class="nube-nombre" title="${esc(p.descripcion || p.nombre)}">${esc(p.nombre)}</span>`
        + `<span class="nube-rol rol-${esc(p.rol)}">${esc(ROLES[p.rol] || p.rol)}</span>`
        + `<button class="nube-guia" type="button" title="Recorrido guiado por el editor">Guía</button>`;
      marca.querySelector('.nube-guia').addEventListener('click', () => recorrido(p));
    }
    if (p.rol === 'lector') {
      const a = document.createElement('div'); a.className = 'nube-aviso';
      a.innerHTML = 'Estás viendo este mapa en <b>solo lectura</b>: los cambios no se guardan. <a href="/app">Haz una copia</a> para editarla.';
      document.body.appendChild(a);
    }
    const podar = () => {
      const s = document.getElementById('selMapa'); if (!s) return;
      for (const o of [...s.options]) if (!o.dataset.u && o.value !== p.mapa_inicial && o.value !== s.value) o.remove();
    };
    podar(); new MutationObserver(podar).observe(document.getElementById('selMapa'), { childList: true, subtree: true });

    // Primera vez (o ?recorrido=1): cuando termina de cargar el mapa.
    const forzar = new URLSearchParams(location.search).get('recorrido') === '1';
    N.yo.then(u => {
      const pr = (u && u.preferencias) || {};
      /* vista con la que abre el editor (Cuenta → Preferencias) */
      if (pr.vista_inicial && window.OOEditor) cuandoCargue(() => { try { OOEditor.api.vistaRapida(pr.vista_inicial === 'planta' ? 1 : 4); } catch (e) { } });
      if (!forzar && (pr.recorrido_editor || pr.sin_recorridos)) return;
      cuandoCargue(() => recorrido(p));
    });
  });

  function cuandoCargue(fn) {
    const t0 = Date.now();
    (function mirar() {
      const c = document.getElementById('carga');
      if (!c || c.hidden || getComputedStyle(c).display === 'none') return setTimeout(fn, 600);
      if (Date.now() - t0 < 90000) setTimeout(mirar, 400);
    })();
  }

  function cargarRecorrido() {
    if (window.MCRecorrido) return Promise.resolve();
    return new Promise((ok, mal) => {
      const yo = document.querySelector('script[src*="nucleo/nube.js"]'), v = yo && /[?&]v=([\w]+)/.exec(yo.src);
      const s = document.createElement('script'); s.src = '/sitio/js/recorrido.js' + (v ? '?v=' + v[1] : ''); s.onload = ok; s.onerror = mal; document.head.appendChild(s);
    });
  }

  async function recorrido(p) {
    try { await cargarRecorrido(); } catch (e) { return; }
    const lector = p.rol === 'lector';
    const pasos = [
      { titulo: 'Bienvenido al editor', texto: 'Un recorrido rápido por lo esencial. Todo lo que hagas <b>se guarda solo</b>. Puedes repetirlo con el botón <b>Guía</b> de arriba.' },
      { el: '#barra .marca', titulo: 'Tu proyecto', texto: 'El nombre del mapa y tu permiso. La flecha <b>←</b> te devuelve a Mis mapas.' },
      { el: '.seg-vista', titulo: 'Tres formas de ver', texto: '<b>3D</b> para construir, <b>Planta</b> para dibujar con medidas desde arriba y <b>Caminar</b> para recorrerlo en primera persona (<kbd>WASD</kbd>).' },
      { el: '#vista', titulo: 'Moverte por el mapa', texto: 'Rueda: zoom hacia el cursor. Botón derecho: orbitar. Botón central: desplazar. Clic: seleccionar; <kbd>Mayús</kbd>+clic añade a la selección. <kbd>Inicio</kbd> encuadra todo el mapa.' },
      lector ? null : { el: '#herramientas', titulo: 'Herramientas', texto: 'Paredes (<kbd>L</kbd>), habitaciones (<kbd>H</kbd>), puertas (<kbd>U</kbd>), ventanas (<kbd>I</kbd>), techos (<kbd>X</kbd>), pintar (<kbd>B</kbd>) y medir (<kbd>T</kbd>). Cada botón despliega sus variantes.' },
      lector ? null : { el: '[data-pnl=catalogo]', titulo: 'Catálogo', texto: 'Más de 200 objetos y prefabs: muebles, vehículos, vegetación, señalización… Arrástralos a la vista o haz clic y colócalos.' },
      { el: '[data-pnl=inspector]', titulo: 'Inspector', texto: 'Las medidas, la posición, el material y las propiedades de lo que tengas seleccionado. Escribe un número y pulsa Enter.' },
      { el: '[data-pnl=jerarquia]', titulo: 'Jerarquía y capas', texto: 'Todo lo que hay en la escena, por grupos. Busca, oculta o bloquea partes para trabajar más cómodo.' },
      { el: '#estado', titulo: 'Guardado automático', texto: 'Aquí ves si tus cambios ya están guardados. Si hay más personas en el mapa, sus cambios aparecen en unos segundos.' },
      lector ? null : { el: '#bDeshacer', titulo: 'Deshacer sin miedo', texto: '<kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace y <kbd>Ctrl</kbd>+<kbd>Y</kbd> rehace. El contador de cambios guarda el historial completo.' },
      { el: '#bAtajos', titulo: 'Atajos', texto: 'Pulsa <kbd>?</kbd> en cualquier momento para ver todos los atajos de teclado.' },
      { el: '#bExportar', titulo: 'Exportar', texto: 'Descarga el mapa en <b>GLB</b>, para <b>Godot</b> o para <b>Unity</b>, o como JSON para guardarlo aparte.' }
    ];
    MCRecorrido.iniciar(pasos, {
      textoFin: lector ? 'Entendido' : 'A construir',
      alTerminar: () => {
        fetch('/api/cuenta/yo', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferencias: { recorrido_editor: true } }) }).catch(() => { });
        if (new URLSearchParams(location.search).has('recorrido')) {
          const u = new URL(location.href); u.searchParams.delete('recorrido'); history.replaceState(null, '', u);
        }
      }
    });
  }
})();
