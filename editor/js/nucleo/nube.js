/* Modo nube (Map Creator): barra del proyecto en el editor. Solo actúa si local.js arrancó en modo nube (?p=<proyecto>).
   - «← Mis mapas», nombre del proyecto y rol en la barra superior; aviso fijo si el usuario solo puede ver.
   - El selector de mapas deja solo los del proyecto: el mapa de su plantilla y los propios (u-…); los mapas base de otras plantillas
     se quitan para no mezclar proyectos. «＋ Nuevo mapa…» sigue disponible. */
(function () {
  'use strict';
  const N = window.OONube; if (!N) return;
  document.documentElement.classList.add('modo-nube');
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLES = { dueno: 'Dueño', editor: 'Editor', lector: 'Solo lectura' };
  N.info.then(p => {
    if (!p) return;
    document.title = p.nombre + ' · Map Creator';
    const marca = document.querySelector('#barra .marca');
    if (marca) {
      marca.innerHTML = `<a class="nube-volver" href="/app" title="Volver a Mis mapas">←</a>`
        + `<span class="nube-nombre" title="${esc(p.descripcion || p.nombre)}">${esc(p.nombre)}</span>`
        + `<span class="nube-rol rol-${esc(p.rol)}">${esc(ROLES[p.rol] || p.rol)}</span>`;
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
  });
})();
