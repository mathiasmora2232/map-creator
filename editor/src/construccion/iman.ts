/* Editor del mapa (2.1, Map Editor Pro fase 1): imán y selección configurables.
   Botón con el imán y la flecha en la barra de la derecha de la vista → ventana «Imán y selección»:
   - Imán: rejilla (con su paso), extremos, puntos medios, ejes desde el punto anterior, guías y superficies (apoyar en lo de arriba de
     fundaciones, pisos y objetos). Colocación libre: lo desactiva todo de una vez.
   - Paredes: partir en los cruces al dibujar.
   - Selección: qué se puede elegir con clic o rectángulo (piezas del mapa original, estructura nueva, objetos nuevos).
   - Anclajes: ver las líneas de cada objeto a su soporte y revisar anclajes rotos, ciclos y objetos que atraviesan una plataforma.
   Se guarda en los ajustes del navegador (AJ.iman, AJ.cruces, AJ.selFiltro). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, AJ = A.AJ, ENT = window.OOEntidades;
  const IMAN = [['extremos', 'Extremos y esquinas'], ['medios', 'Puntos medios'], ['ejes', 'Ejes desde el punto anterior'], ['guias', 'Guías'], ['superficies', 'Superficies (apoyar encima)']];
  const SELF = [['mapa', 'Piezas del mapa original'], ['estructura', 'Estructura nueva (paredes, pisos, fundaciones, puertas…)'], ['objetos', 'Objetos nuevos (muebles, cajas, coches…)']];
  AJ.iman = Object.assign({ extremos: true, medios: true, ejes: true, guias: true, superficies: true }, AJ.iman || {});
  AJ.selFiltro = Object.assign({ mapa: true, estructura: true, objetos: true }, AJ.selFiltro || {});
  const estructura = (ENT && ENT.ESTRUCTURA) || ['muro', 'habitacion', 'techo', 'fundacion', 'puerta', 'ventana', 'hueco', 'edificio', 'calle'];
  /* filtro de selección: bloqueos de editor.js (true = no se puede elegir) */
  E.bloqueos.push((k?) => {
    const f = AJ.selFiltro; if (f.mapa && f.estructura && f.objetos) return false;
    if (k[0] === 'p') return !f.mapa;
    if (k[0] === 'n') { const o = E.nuevos().get(k.slice(1)); if (!o) return false; return estructura.includes(A.tipoBase(o.tipo)) ? !f.estructura : !f.objetos; }
    return false;
  });
  const chk = (grupo?, k?, n?, v?) => `<label class="chk"><input type="checkbox" data-im="${grupo}.${k}" ${v ? 'checked' : ''}> ${A.esc(n)}</label>`;
  function html() {
    const libre = !AJ.ajuste && !AJ.inferencias;
    const val = window.OOAnclajes ? OOAnclajes.validar() : [];
    return `<h3>Imán</h3>
      <label class="chk"><input type="checkbox" data-im="libre" ${libre ? 'checked' : ''}> <b>Colocación libre</b> (sin imán ni rejilla)</label>
      ${chk('aj', 'ajuste', 'Rejilla', AJ.ajuste)}
      <label class="campo"><span>Paso de la rejilla</span><select data-im="paso">${[[0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm'], [0.5, '50 cm'], [1, '1 m']].map(([v, n]) => `<option value="${v}"${+AJ.paso === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      ${chk('aj', 'inferencias', 'Inferencias (imantar a puntos)', AJ.inferencias)}
      ${IMAN.map(([k, n]) => chk('iman', k, n, AJ.iman[k] !== false)).join('')}
      <h3>Paredes</h3>${chk('aj', 'cruces', 'Partir paredes en los cruces al dibujar', AJ.cruces !== false)}
      <h3>Qué se puede seleccionar</h3>${SELF.map(([k, n]) => chk('sel', k, n, AJ.selFiltro[k] !== false)).join('')}
      <h3>Anclajes</h3>${chk('vista', 'anclajes', 'Ver líneas de cada objeto a su soporte', window.OOAnclajes && OOAnclajes.verLineasOn)}
      <p class="ayuda" data-im-val>${val.length ? val.slice(0, 6).map((v?) => (v.nivel === 'error' ? '⛔ ' : '⚠ ') + A.esc(v.texto)).join('<br>') + (val.length > 6 ? '<br>… y ' + (val.length - 6) + ' más' : '') : 'Anclajes correctos.'}</p>
      ${val.length ? '<div class="fila"><button data-im-a="sel-val">Seleccionar los afectados</button></div>' : ''}`;
  }
  const pop = document.createElement('div'); pop.id = 'popIman'; pop.className = 'pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Imán y selección');
  const vista = document.getElementById('vista'); if (vista) vista.appendChild(pop);
  const barra = document.getElementById('barraFlotDer');
  if (barra) { const b = document.createElement('button'); b.dataset.pop = 'popIman'; b.title = 'Imán y selección: a qué se imanta, qué se puede elegir y anclajes'; b.setAttribute('aria-label', 'Imán y selección'); b.innerHTML = window.OOUI ? OOUI.svg('imantar') : 'I'; barra.insertBefore(b, barra.firstChild); }
  window.addEventListener('oo-pop', (e?) => { if (e.detail === 'popIman') pop.innerHTML = html(); });
  pop.addEventListener('change', (e?) => {
    const el = e.target, k = el.dataset.im; if (!k) return;
    if (k === 'libre') { AJ.ajuste = !el.checked && AJ.ajuste; AJ.inferencias = !el.checked; if (!el.checked) AJ.inferencias = true; }
    else if (k === 'paso') AJ.paso = parseFloat(el.value) || 0.25;
    else { const [g, c] = k.split('.'); if (g === 'aj') AJ[c] = el.checked; if (g === 'iman') AJ.iman[c] = el.checked; if (g === 'sel') { AJ.selFiltro[c] = el.checked; A.seleccionar(A.sel.filter(A.seleccionable)); } if (g === 'vista' && c === 'anclajes' && window.OOAnclajes) OOAnclajes.verLineas(el.checked); }
    A.guardarAjustes(); A.aplicarAjustes(); pop.innerHTML = html();
  });
  pop.addEventListener('click', (e?) => { const b = e.target.closest('[data-im-a]'); if (b && b.dataset.imA === 'sel-val' && window.OOAnclajes) A.seleccionar([...new Set<any>(OOAnclajes.validar().map((v?) => 'n' + v.id))]); });
  window.OOIman = { html, abrir: () => { pop.innerHTML = html(); pop.hidden = false; } };
})();
