/* Editor del mapa (2.1, editor v2): comportamientos por objeto (pestaña «Más» del inspector).
   Se guardan en props.comportamientos del objeto (con deshacer): [{tipo, ...parámetros}]. Salen en la jerarquía con su icono y en la
   exportación (extras del glTF, metadatos del .tscn de Godot, JSON de escena y JSON para el juego). Cómo leerlos en Godot y Unity:
   LEEME.md, sección «Comportamientos». Para añadir un tipo nuevo basta con añadirlo a TIPOS (o con OOComportamientos.agregar). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const TIPOS = {
    puerta: { n: 'Puerta', ic: 'puerta', campos: [['modo', 'Tipo', 'sel', 'simple', [['simple', 'Simple (abatible)'], ['doble', 'Doble'], ['corrediza', 'Corrediza'], ['enrollable', 'Enrollable / persiana'], ['basculante', 'Portón basculante']]], ['hojas', 'Hojas (si es doble)', 'sel', 'conjunto', [['conjunto', 'Se abren en conjunto'], ['individual', 'Cada hoja por separado']]], ['bisagra', 'Bisagra', 'sel', 'izquierda', [['izquierda', 'Izquierda'], ['derecha', 'Derecha'], ['centro', 'Centro (doble)']]], ['sentido', 'Abre hacia', 'sel', 'adentro', [['adentro', 'Adentro'], ['afuera', 'Afuera'], ['ambos', 'Ambos lados (vaivén)']]], ['angulo', 'Ángulo de apertura (°)', 'num', 95], ['recorrido', 'Recorrido si es corrediza (m)', 'num', 0.9], ['tiempo', 'Tiempo en abrir (s)', 'num', 0.6], ['empieza_abierta', 'Empieza abierta', 'chk', false], ['con_llave', 'Necesita llave', 'chk', false], ['automatica', 'Se abre sola al acercarse', 'chk', false]] },
    coche: { n: 'Coche conducible', ic: 'coche', campos: [['conducible', 'Se puede conducir', 'chk', true], ['velocidad_max', 'Velocidad máxima (km/h)', 'num', 60], ['aceleracion', 'Aceleración (0-1)', 'num', 0.5], ['asientos', 'Asientos', 'num', 4], ['vida', 'Vida', 'num', 300], ['color_aleatorio', 'Color al azar al aparecer', 'chk', false], ['bocina', 'Bocina', 'chk', true]] },
    rompible: { n: 'Rompible / destructible', ic: 'rompible', campos: [['vida', 'Vida (golpes o daño)', 'num', 50], ['material', 'Se rompe como', 'sel', 'madera', [['madera', 'Madera (astillas)'], ['vidrio', 'Vidrio'], ['metal', 'Metal'], ['concreto', 'Concreto (escombros)'], ['plastico', 'Plástico'], ['botella', 'Botella']]], ['destructible', 'Desaparece del todo', 'chk', true], ['explota', 'Explota', 'chk', false], ['reaparece_s', 'Reaparece a los (s, 0 = nunca)', 'num', 0]] },
    interactuable: { n: 'Interactuable', ic: 'mano', campos: [['accion', 'Acción', 'sel', 'usar', [['usar', 'Usar'], ['recoger', 'Recoger'], ['abrir', 'Abrir'], ['leer', 'Leer'], ['hablar', 'Hablar'], ['sentarse', 'Sentarse'], ['comprar', 'Comprar']]], ['texto', 'Texto en pantalla', 'txt', 'Pulsa E para usar'], ['tecla', 'Tecla', 'txt', 'E'], ['distancia', 'Distancia (m)', 'num', 2], ['evento', 'Evento que dispara (nombre)', 'txt', '']] },
    luz_interruptor: { n: 'Luz con interruptor', ic: 'bombilla', campos: [['grupo', 'Grupo de luces (nombre)', 'txt', 'luces_sala'], ['radio', 'Luces a menos de (m) si no hay grupo', 'num', 8], ['encendida', 'Empieza encendida', 'chk', true], ['texto', 'Texto', 'txt', 'Pulsa E para encender o apagar']] },
    aparicion: { n: 'Zona de aparición', ic: 'bandera', campos: [['equipo', 'Equipo', 'sel', 'todos', [['todos', 'Todos'], ['rojo', 'Rojo'], ['azul', 'Azul'], ['zombis', 'Zombis / enemigos'], ['vehiculos', 'Vehículos']]], ['radio', 'Radio (m)', 'num', 3], ['max', 'Máximo a la vez', 'num', 4], ['modos', 'Modos de juego (coma)', 'txt', ''], ['orientacion', 'Mirar hacia el giro del objeto', 'chk', true]] },
    sonido: { n: 'Sonido', ic: 'sonido', campos: [['archivo', 'Archivo (res:// o nombre)', 'txt', ''], ['volumen', 'Volumen (0-1)', 'num', 0.8], ['alcance', 'Alcance (m)', 'num', 15], ['bucle', 'En bucle', 'chk', true], ['al_entrar', 'Solo al entrar en el alcance', 'chk', false], ['aleatorio_s', 'Repetir cada (s, 0 = continuo)', 'num', 0]] }
  };
  const defecto = t => { const o = { tipo: t }; for (const [k, , , v] of TIPOS[t].campos) o[k] = v; return o; };
  function lista() { return (A.leerProps(A.objetivoProps()).comportamientos || []).map(c => Object.assign({}, c)); }
  function guardarLista(l) { A.guardarProps({ comportamientos: l.length ? l : undefined }); }
  function sugerido() {
    if (!A.sel.length) return null; const n = A.nombreEntidades(A.sel).toLowerCase();
    if (/puerta|porton|portón/.test(n) || (A.sel.length === 1 && A.sel[0][0] === 'n' && /^puerta/.test((E.nuevos().get(A.sel[0].slice(1)) || {}).tipo || ''))) return 'puerta';
    if (/sedan|suv|pickup|hatchback|coche|camion|camión|auto/.test(n)) return 'coche';
    if (/botella|vidrio|caja|barril|silla/.test(n)) return 'rompible';
    if (/luz|lampara|lámpara|foco/.test(n)) return 'luz_interruptor';
    return null;
  }
  function pintar() {
    const el = $('#insMas'); if (!el) return;
    if (!A.sel.length || !A.objetivoProps()) { el.innerHTML = '<p class="ayuda">Selecciona un objeto (uno nuevo, o piezas del mapa) para darle comportamientos: puerta, coche conducible, rompible, interactuable, luz con interruptor, zona de aparición o sonido.</p><h3>Tipos</h3><ul class="lista">' + Object.entries(TIPOS).map(([, t]) => `<li class="chk">${svg(t.ic)} ${esc(t.n)}</li>`).join('') + '</ul>'; return; }
    const l = lista(), sug = sugerido();
    let h = `<h2>${svg('mano')} Comportamientos <small>${esc(A.nombreEntidades(A.sel))}</small></h2>`;
    h += l.map((c, j) => { const t = TIPOS[c.tipo]; if (!t) return `<details class="sec" open><summary>${esc(c.tipo)} <small>(desconocido)</small></summary><button data-comp-quitar="${j}">Quitar</button></details>`;
      return `<details class="sec comp-ficha" open><summary>${svg(t.ic)} ${esc(t.n)}<span class="esp"></span><button class="bi" data-comp-quitar="${j}" title="Quitar">${svg('cerrar')}</button></summary><div class="campos">` +
        t.campos.map(([k, lb, tipo, def, ops]) => { const v = c[k] == null ? def : c[k];
          if (tipo === 'chk') return `<label class="chk campo ancho"><input type="checkbox" data-comp="${j}" data-cprop="${k}" ${v ? 'checked' : ''}> ${esc(lb)}</label>`;
          if (tipo === 'sel') return `<label class="campo ancho"><span>${esc(lb)}</span><select data-comp="${j}" data-cprop="${k}">${ops.map(([a, b]) => `<option value="${a}"${String(v) === String(a) ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
          if (tipo === 'txt') return `<label class="campo ancho"><span>${esc(lb)}</span><input type="text" data-comp="${j}" data-cprop="${k}" value="${esc(v)}"></label>`;
          return `<label class="campo"><span>${esc(lb)}</span><input type="number" step="0.1" data-comp="${j}" data-cprop="${k}" value="${esc(v)}"></label>`; }).join('') + '</div></details>'; }).join('');
    h += `<div class="fila"><select id="compTipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}"${k === sug ? ' selected' : ''}>${esc(t.n)}</option>`).join('')}</select><button class="prim" data-comp-agregar>${svg('mas')}Añadir</button></div>`;
    h += '<p class="ayuda">Se guardan con el objeto y salen al exportar (glTF «extras», Godot, JSON). El juego los aplicará al importar el mapa.</p>';
    el.innerHTML = h;
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-comp-agregar]')) { const t = ($('#compTipo') || {}).value; if (!TIPOS[t]) return; guardarLista(lista().concat([defecto(t)])); return; }
    const q = e.target.closest('[data-comp-quitar]'); if (q) { e.preventDefault(); const l = lista(); l.splice(+q.dataset.compQuitar, 1); guardarLista(l); }
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || el.dataset.comp == null || !el.closest('#insMas')) return;
    const l = lista(), c = l[+el.dataset.comp]; if (!c) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value; if (el.type === 'number' && !isFinite(v)) return;
    c[el.dataset.cprop] = v; guardarLista(l);
  });
  E.on('tab', t => { if (t === 'mas') pintar(); });
  E.on('seleccion', () => { const p = document.querySelector('[data-panel="mas"]'); if (p && !p.hidden) pintar(); });
  E.on('recompute', () => { const p = document.querySelector('[data-panel="mas"]'); if (p && !p.hidden && !document.querySelector('#insMas input:focus')) pintar(); });
  window.OOComportamientos = { TIPOS, pintar, agregar: (k, def) => { TIPOS[k] = def; } };
})();
