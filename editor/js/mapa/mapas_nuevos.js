/* Editor del mapa (2.1): «Nuevo mapa» en blanco.
   - Selector de mapa de la barra superior → «＋ Nuevo mapa…»: nombre, ancho y fondo (m) y terreno de ejemplo (césped, tierra, concreto o
     asfalto). Se guarda en la colección `mapas` ({nombre, ancho, largo, terreno, creado}) con id `u-<nombre>`; sus cambios van, como los
     de cualquier mapa, en `cambios` con `mapa: 'u-…'`, así que no tocan el Complejo ni el Parqueadero.
   - La base del mapa se genera aquí (no hay archivo mapa_u-….json): una sola pieza de suelo del tamaño elegido, en la sección «Suelo»,
     bloqueada para que no se elija sin querer (se desbloquea en la jerarquía). Todo lo demás se dibuja con las herramientas de siempre.
   - Todavía no pasa al juego (Unity): «Enviar al juego» y los exportadores GLB/Godot sí funcionan con lo dibujado. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, $ = s => document.querySelector(s);
  const TERRENOS = { cesped: ['Césped', '#5f8a3e', 'leafy_grass'], tierra: ['Tierra', '#8a6a48', 'brown_mud_dry'], concreto: ['Concreto', '#9a9b97', 'concrete_floor_worn_001'], asfalto: ['Asfalto', '#3f3d3a', 'asphalt_02'] };
  const lista = () => [...A.efectivos('mapas')].filter(([id, d]) => d && /^u-/.test(id)).sort((a, b) => String(a[1].nombre).localeCompare(String(b[1].nombre)));
  function baseDe(id, m) {
    const ter = TERRENOS[m.terreno] || TERRENOS.cesped, w = Math.max(10, Math.min(2000, +m.ancho || 100)), l = Math.max(10, Math.min(2000, +m.largo || 100));
    return { mapa: id, formato: 2, archivos: [], coordenadas: 'unity', materiales: [[ter[0] + '_suelo', ter[1], '', ter[2]]], secciones: ['Suelo'], grupos: [], nombres: [],
      piezas: [[0, 0, -1, 0, -0.5, 0, w, 1, l, 0, 0, 0, 1, 0, 7, -1]] };
  }
  async function base(id) {
    for (let i = 0; i < 100; i++) { const m = A.efectivos('mapas').get(id); if (m) return baseDe(id, m); await new Promise(r => setTimeout(r, 100)); }
    return null;
  }
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mapa';
  function crear(o) {
    o = o || {}; let id = 'u-' + slug(o.nombre); const ya = A.efectivos('mapas'); if (ya.get(id)) id += '-' + Date.now().toString(36).slice(-4);
    const doc = { nombre: String(o.nombre || 'Mapa nuevo').slice(0, 60), ancho: Math.max(10, Math.min(2000, +o.ancho || 100)), largo: Math.max(10, Math.min(2000, +o.largo || 100)), terreno: TERRENOS[o.terreno] ? o.terreno : 'cesped', creado: A.ahora() };
    A.guardarCol('mapas', id, doc); opciones(); return id;
  }
  function abrir(id) { const s = $('#selMapa'); if (!s) return; opciones(); s.value = id; s.dispatchEvent(new Event('change')); }
  function opciones() {
    const s = $('#selMapa'); if (!s) return; const actual = A.mapa;
    s.querySelectorAll('option[data-u], optgroup[data-u]').forEach(x => x.remove());
    const l = lista(); let html = '';
    if (l.length) html += '<optgroup data-u label="Mis mapas">' + l.map(([id, d]) => `<option data-u value="${A.esc(id)}">${A.esc(d.nombre || id)}</option>`).join('') + '</optgroup>';
    html += '<option data-u value="__nuevo">＋ Nuevo mapa…</option>';
    s.insertAdjacentHTML('beforeend', html); s.value = actual;
  }
  async function dialogo() {
    const f = { nombre: 'Mapa nuevo', ancho: 120, largo: 80, terreno: 'cesped' };
    const r = A.abrirModal(`<div class="cab">Nuevo mapa en blanco</div><div class="cont"><div class="campos">
      <label class="campo"><span>Nombre</span><input type="text" data-nm="nombre" data-foco value="${f.nombre}"></label>
      <label class="campo"><span>Ancho (X, m)</span><input type="number" min="10" max="2000" step="5" data-nm="ancho" value="${f.ancho}"></label>
      <label class="campo"><span>Fondo (Z, m)</span><input type="number" min="10" max="2000" step="5" data-nm="largo" value="${f.largo}"></label>
      <label class="campo"><span>Terreno</span><select data-nm="terreno">${Object.entries(TERRENOS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label></div>
      <p class="ayuda">Se guarda como un mapa propio: el Complejo y el Parqueadero no cambian. Se edita con todas las herramientas; el suelo base queda bloqueado (desbloquéalo en la jerarquía si quieres cambiarlo). Todavía no se puede jugar en él (Unity).</p></div>
      <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Crear y abrir</button></div>`);
    setTimeout(() => document.querySelectorAll('[data-nm]').forEach(el => el.addEventListener('input', () => { f[el.dataset.nm] = el.type === 'number' ? +el.value : el.value; })), 30);
    const ok = (await r) === true; if (!ok) { opciones(); return null; }
    const id = crear(f); abrir(id); return id;
  }
  /* el editor cambia de mapa en su propio «change»: «＋ Nuevo mapa…» se intercepta antes */
  document.addEventListener('change', e => { if (e.target && e.target.id === 'selMapa' && e.target.value === '__nuevo') { e.stopImmediatePropagation(); e.target.value = A.mapa; dialogo(); } }, true);
  E.on('col', c => { if (c === 'mapas') opciones(); });
  E.on('mapa', nombre => { opciones(); if (/^u-/.test(String(nombre || A.mapa))) A.ponerSecLock(1, true); });
  opciones();
  window.OOMapasNuevos = { base, baseDe, crear, abrir, dialogo, lista, TERRENOS };
})();
