/* Editor del mapa (2.1, editor v2): mapa satelital interactivo para el calco.
   Antes había que saberse las coordenadas. Ahora se abre un mapa navegable (Leaflet 1.9.4 con las teselas de Esri World Imagery, las
   mismas que usa el servidor), con buscador de lugares (Nominatim, OpenStreetMap). Se mueve el mapa, se ve el cuadrado que se va a
   calcar (lado = 2 × radio) y «Calcar esta zona» llama a /api/satelital como antes (calcoSatelitalCon de editor.js). Guarda la última
   vista; las coordenadas a mano siguen pudiéndose escribir. Leaflet se carga al abrir el diálogo, no al arrancar el editor. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const CLAVE = 'oo-editor-satvista';
  const TESELAS = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const NOMBRES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  let cargando = null, mapa = null, cuadro = null, capaNombres = null, radioSel = 250, coordsTxt = '';
  function cargarLeaflet() {
    if (window.L && L.map) return Promise.resolve();
    if (cargando) return cargando;
    cargando = new Promise((ok, mal) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = () => ok(); s.onerror = () => { cargando = null; mal(new Error('no se pudo cargar Leaflet')); }; document.head.appendChild(s);
    });
    return cargando;
  }
  function vistaGuardada() {
    let v = null; try { v = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { }
    if (v && isFinite(v.lat) && isFinite(v.lon)) return v;
    const ult = (localStorage.getItem('oo-editor-sat') || '').match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    if (ult) return { lat: +ult[1], lon: +ult[2], zoom: 17, radio: 250 };
    return { lat: -2.170998, lon: -79.922359, zoom: 17, radio: 250 }; // el complejo (el ejemplo que ya traía el diálogo)
  }
  function guardarVista(radio) { if (!mapa) return; const c = mapa.getCenter(); try { localStorage.setItem(CLAVE, JSON.stringify({ lat: +c.lat.toFixed(7), lon: +c.lng.toFixed(7), zoom: mapa.getZoom(), radio: +radio })); } catch (e) { } }
  function limites(lat, lon, r) { const dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180)); return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]]; }
  function radioActual() { const el = $('#satRadio2'); if (el) radioSel = +el.value || radioSel; return radioSel; }
  function actualizarCuadro() {
    if (!mapa) return; const c = mapa.getCenter(), r = radioActual();
    const b = limites(c.lat, c.lng, r);
    if (!cuadro) cuadro = L.rectangle(b, { color: '#f07a1a', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(mapa); else cuadro.setBounds(b);
    const t = $('#satInfo'); if (t) t.textContent = `Centro ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} · se calcará un cuadrado de ${2 * r} m de lado`;
    const co = $('#satCoords2'); if (co && document.activeElement !== co) co.value = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
  }
  async function buscar() {
    const q = ($('#satBuscar') || {}).value || ''; const out = $('#satResultados'); if (!q.trim() || !out) return;
    out.hidden = false; out.innerHTML = '<span class="ayuda">Buscando…</span>';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=7&accept-language=es&q=' + encodeURIComponent(q.trim()));
      const l = await r.json();
      out.innerHTML = l.length ? l.map(x => `<button data-sat-ir="${+x.lat},${+x.lon}">${esc(x.display_name)}</button>`).join('') : '<span class="ayuda">No se encontró ese lugar. Prueba con otra forma de escribirlo o mueve el mapa a mano.</span>';
    } catch (e) { out.innerHTML = '<span class="ayuda">No se pudo buscar (¿sin internet?). Mueve el mapa a mano o escribe las coordenadas.</span>'; }
  }
  function irA(lat, lon, zoom) { if (!mapa) return; mapa.setView([lat, lon], zoom || Math.max(mapa.getZoom(), 17)); const out = $('#satResultados'); if (out) out.hidden = true; }
  async function abrir() {
    const v = vistaGuardada(); radioSel = +v.radio || 250; coordsTxt = v.lat.toFixed(6) + ', ' + v.lon.toFixed(6);
    const radios = [100, 150, 250, 400, 600, 800];
    const pr = A.abrirModal(`<div class="cab">${svg('mapa')} Mapa satelital: elige la zona que quieres calcar</div><div class="cont sat-cont">
      <div class="sat-barra">
        <label class="buscador-ic"><span>${svg('buscar')}</span><input type="search" id="satBuscar" placeholder="Buscar un lugar (p. ej. Empagran, Guayaquil)…" autocomplete="off" data-foco></label>
        <button id="satBuscarB">Buscar</button>
        <label class="campo-linea">Radio <select id="satRadio2">${radios.map(r => `<option value="${r}"${r === (+v.radio || 250) ? ' selected' : ''}>${r} m</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" id="satNombres" checked> Nombres</label>
      </div>
      <div id="satResultados" class="sat-res" hidden></div>
      <div class="sat-mapa"><div id="satMapa"></div><div class="sat-mira" aria-hidden="true"></div></div>
      <div class="sat-barra"><span id="satInfo" class="ayuda" style="margin:0;flex:1"></span>
        <label class="campo-linea" title="Opcional: pega coordenadas de Google Maps y pulsa Ir">Coordenadas <input type="text" id="satCoords2" placeholder="-2.170998, -79.922359" style="width:190px"></label><button id="satIr">Ir</button></div>
      <p class="ayuda" style="margin:6px 0 0">Arrastra el mapa o haz clic donde quieras centrar; la rueda acerca y aleja. La imagen sale a escala real; después alinéala con «Alinear con dos puntos» (su escala queda fija).</p>
    </div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si" id="satCalcar">${svg('mapa')} Calcar esta zona</button></div>`, 'ancha');
    let ok = true;
    try { await cargarLeaflet(); } catch (e) { ok = false; }
    if (!ok) { const m = $('#satMapa'); if (m) m.innerHTML = '<p class="ayuda" style="padding:20px">No se pudo cargar el mapa (¿sin internet?). Puedes escribir las coordenadas abajo y pulsar «Calcar esta zona».</p>'; }
    else {
      mapa = L.map('satMapa', { zoomControl: true, attributionControl: true, maxZoom: 20 }).setView([v.lat, v.lon], v.zoom || 17);
      L.tileLayer(TESELAS, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' }).addTo(mapa);
      capaNombres = L.tileLayer(NOMBRES, { maxZoom: 20, maxNativeZoom: 19, opacity: 0.9 }).addTo(mapa);
      cuadro = null;
      // calcos satelitales que ya hay en este mapa, como referencia
      for (const [, d] of A.efectivos('calcos')) if (d && d.mapa === A.mapa && isFinite(d.lat) && isFinite(d.lon) && d.ancho) L.rectangle(limites(d.lat, d.lon, d.ancho / 2), { color: '#5aa0ff', weight: 1, dashArray: '4 4', fillOpacity: 0.03, interactive: false }).addTo(mapa).bindTooltip(d.nombre || 'Calco');
      mapa.on('move', actualizarCuadro); mapa.on('click', e => mapa.panTo(e.latlng));
      setTimeout(() => { mapa.invalidateSize(); actualizarCuadro(); }, 60);
    }
    const bb = $('#satBuscarB'); if (bb) bb.onclick = buscar;
    const ib = $('#satBuscar'); if (ib) ib.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); buscar(); } });
    const rs = $('#satResultados'); if (rs) rs.addEventListener('click', e => { const b = e.target.closest('[data-sat-ir]'); if (b) { const [la, lo] = b.dataset.satIr.split(',').map(Number); irA(la, lo, 17); } });
    const rad = $('#satRadio2'); if (rad) rad.addEventListener('change', () => { radioSel = +rad.value || 250; actualizarCuadro(); });
    const nom = $('#satNombres'); if (nom) nom.addEventListener('change', () => { if (!mapa || !capaNombres) return; if (nom.checked) capaNombres.addTo(mapa); else mapa.removeLayer(capaNombres); });
    const leerCoords = () => { const el = $('#satCoords2'); if (el) coordsTxt = el.value; const m = String(coordsTxt || '').replace(/[()°]/g, ' ').match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; };
    const irb = $('#satIr'); if (irb) irb.onclick = () => { const c = leerCoords(); if (c) irA(c[0], c[1]); else A.pista('No entiendo esas coordenadas. Pega algo como «-2.170998, -79.922359».'); };
    const co = $('#satCoords2'); if (co) { co.value = v.lat.toFixed(6) + ', ' + v.lon.toFixed(6); co.addEventListener('input', () => { coordsTxt = co.value; }); co.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); irb.onclick(); } }); }
    const res = await pr;
    let lat, lon; const radio = radioSel || 250;
    if (mapa) { const c = mapa.getCenter(); lat = c.lat; lon = c.lng; guardarVista(radio); }
    else { const c = leerCoords(); if (c) { lat = c[0]; lon = c[1]; } }
    if (mapa) { try { mapa.remove(); } catch (e) { } mapa = null; cuadro = null; capaNombres = null; }
    if (res !== true) return null;
    if (!isFinite(lat) || !isFinite(lon)) { A.pista('Falta el sitio que se quiere calcar.'); return null; }
    try { localStorage.setItem('oo-editor-sat', lat.toFixed(6) + ', ' + lon.toFixed(6)); } catch (e) { }
    return A.calcoSatelitalCon(+lat.toFixed(7), +lon.toFixed(7), radio);
  }
  window.OOMapaSat = { abrir, cargarLeaflet };
})();
