/* Editor del mapa (2.1 pro f6): validación del mapa (especificación §17). Panel «Revisar el mapa» con los avisos, «Ir» (selecciona y
   encuadra) y «Corregir» cuando hay una corrección segura; todo lo que corrige es un paso normal de deshacer.
   Comprueba:
   - escaleras y rampas sin conexión: el pie no apoya en nada o la llegada no da con un piso, plataforma o pieza del mapa a su altura;
   - rampas demasiado empinadas (más del 12 %: el máximo razonable para subirla a pie; más del 100 % no se sube);
   - objetos flotando o enterrados (muebles, objetos del catálogo, paredes, pisos, fundaciones, árboles y coches sin soporte);
   - anclajes rotos (soporte que ya no existe, ciclos, puerta sin pared, objeto que atraviesa una plataforma: OOAnclajes.validar);
   - materiales que faltan (material propio borrado, textura que ya no está, material desconocido);
   - duplicados accidentales (dos objetos iguales en el mismo sitio).
   Lo que se marca como «ignorar» no vuelve a salir (se guarda en este navegador). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, esc = A.esc;
  const TOL = 0.05;
  const tb = (t?) => A.tipoBase(t);
  const nombre = (o?) => A.nombreEntidades(['n' + o.id]);
  let ignorados = new Set<any>(); try { ignorados = new Set<any>(JSON.parse(localStorage.getItem('oo-validacion-ignorar') || '[]')); } catch (e) { /* sin almacenamiento */ }
  const guardarIgn = () => { try { localStorage.setItem('oo-validacion-ignorar', JSON.stringify([...ignorados])); } catch (e) { /* nada */ } };

  /* ---------- superficies donde se puede apoyar algo ---------- */
  const SUPERFICIES = new Set<any>(['fundacion', 'habitacion', 'techo', 'calle']);
  function superficiesNuevas() {
    const l = [];
    for (const o of E.nuevos().values()) {
      const b = tb(o.tipo); if (!SUPERFICIES.has(b)) continue;
      if (b === 'techo' && (o.datos.forma || 'plano') !== 'plano') continue;
      let hu = null, top = 0;
      try {
        if (b === 'calle') { const d = o.datos, g = (+d.giroY || 0) * A.DEG, c = Math.cos(g), s = Math.sin(g), hx = (+d.sx || 1) / 2, hz = (+d.sz || 1) / 2; hu = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [d.x + x * c + z * s, d.z - x * s + z * c]); top = (+d.y || 0) + (+d.sy || 0.05); }
        else { hu = OOAnclajes.huella(o.tipo, o.datos); top = b === 'techo' ? (+o.datos.y || 0) + (+o.datos.grosor || +o.datos.espesor || 0.2) : OOAnclajes.tope(o.tipo, o.datos); }
      } catch (e) { continue; }
      if (hu && hu.length >= 3) l.push({ id: o.id, tipo: b, hu, top });
    }
    /* el resto de objetos nuevos (jardineras, tarimas, muebles…): la cara de arriba de su caja */
    for (const o of E.nuevos().values()) {
      const b = tb(o.tipo); if (SUPERFICIES.has(b) || ['nota', 'luz', 'hueco', 'puerta', 'ventana', 'vegetacion', 'arbol', 'escalera', 'rampa'].includes(b) || o.tipo === 'vegetacion' || (o.datos && o.datos.vegetacion)) continue;
      const bx = A.cajaEntidades(['n' + o.id]); if (bx.isEmpty() || bx.max.x - bx.min.x > 80) continue;
      l.push({ id: o.id, tipo: b, hu: [[bx.min.x, bx.min.z], [bx.max.x, bx.min.z], [bx.max.x, bx.max.z], [bx.min.x, bx.max.z]], top: bx.max.y, caja: true });
    }
    return l;
  }
  /* cajas del mapa original con la cara de arriba horizontal (suelos, losas, mesas…) */
  const _q = new T.Quaternion(), _v = new T.Vector3();
  function topesOriginales(x?, z?) {
    const out = [], P = A.P;
    for (let i = 0; i < A.N; i++) {
      const p = P[i]; if (!p || p.del || p.t !== 0 || p.cat === 'luz' || p.cat === 'txt') continue;
      const hx = p.s.x / 2, hz = p.s.z / 2; if (Math.abs(x - p.p.x) > hx + hz || Math.abs(z - p.p.z) > hx + hz) continue;
      _q.copy(p.q).invert(); _v.set(x - p.p.x, 0, z - p.p.z).applyQuaternion(_q);
      if (Math.abs(p.q.x) > 0.02 || Math.abs(p.q.z) > 0.02) continue;
      if (Math.abs(_v.x) <= hx && Math.abs(_v.z) <= hz) out.push(p.p.y + p.s.y / 2);
    }
    return out;
  }
  function suelo(x?, z?) { return window.OOTerreno && OOTerreno.datos() ? Math.max(0, OOTerreno.alturaEn(x, z) || 0) : 0; }
  /* alturas de apoyo en (x, z): suelo, superficies nuevas y cajas del mapa */
  function apoyos(x?, z?, sup?, excluir?) {
    const l: any[] = [{ y: suelo(x, z), que: 'el suelo' }];
    for (const s of sup) if (s.id !== excluir && A.dentroPoligono(x, z, s.hu)) l.push({ y: s.top, que: '«' + A.nombreEntidades(['n' + s.id]) + '»', id: s.id, caja: !!s.caja });
    for (const y of topesOriginales(x, z)) l.push({ y, que: 'una pieza del mapa' });
    return l;
  }
  function baseY(d?) { return d.origen === 'centro' ? (+d.y || 0) - (+d.sy || 0) / 2 : (+d.y || 0); }

  /* ---------- comprobaciones ---------- */
  const PARED_TECHO = /letrero|cartel|extintor|lampara|l[aá]mpara|foco|cuadro|reloj|aire|camara|c[aá]mara|ventilador|tubo|cable|interruptor|enchufe|espejo|toallero|dispensador_jabon|secamanos|repisa|estante_pared|televisor|pantalla|altavoz|sirena|alarma|senal|se[nñ]al|placa|bandera|gabinete/;
  const APOYADOS = new Set<any>(['muro', 'habitacion', 'fundacion', 'arbol', 'coche', 'calle']);
  function revisaApoyo(o?, sup?, out?) {
    const b = tb(o.tipo), d = o.datos, t = String(o.tipo);
    if (!(APOYADOS.has(b) || t.startsWith('objeto:') || t.startsWith('proc:'))) return;
    if (PARED_TECHO.test(t) || (o.props && o.props.libre)) return;
    if (d.soporte && d.soporte.tipo && d.soporte.tipo !== 'terreno') return; /* lo anclado lo revisa OOAnclajes */
    if (b === 'fundacion' && d.base === 'pilotes') return;
    const y0 = baseY(d), alto = Math.max(0.02, +d.sy || 0.5);
    const ap = apoyos(+d.x || 0, +d.z || 0, sup, o.id);
    const debajo: any = ap.filter((a?) => a.y <= y0 + TOL || (a.caja && a.y < y0 + alto)).sort((a?, b2?) => b2.y - a.y)[0];
    const corta: any = ap.filter((a?) => !a.caja && a.y > y0 + TOL && a.y < y0 + alto - TOL).sort((a?, b2?) => b2.y - a.y)[0];
    if (corta && (b === 'objeto' || t.startsWith('objeto:') || t.startsWith('proc:') || b === 'coche' || b === 'arbol')) {
      out.push({ clase: 'enterrado', nivel: 'aviso', id: o.id, texto: nombre(o) + ' está ' + A.fmt(corta.y - y0, 2) + ' m metido en ' + corta.que + '.', arreglo: { y: corta.y, de: corta.id } });
      return;
    }
    if (debajo && y0 - debajo.y > TOL) out.push({ clase: 'flotando', nivel: 'aviso', id: o.id, texto: nombre(o) + ' flota ' + A.fmt(y0 - debajo.y, 2) + ' m por encima de ' + debajo.que + '.', arreglo: { y: debajo.y, de: debajo.id } });
  }
  function llegada(d?, signo?) { const g = (+d.giroY || 0) * A.DEG, L = +d.sx || 3; return [(+d.x || 0) + signo * Math.cos(g) * (L / 2 + 0.2), (+d.z || 0) - signo * Math.sin(g) * (L / 2 + 0.2)]; }
  function revisaEscalera(o?, sup?, out?) {
    const b = tb(o.tipo), d = o.datos; if (b !== 'escalera' && b !== 'rampa') return;
    const nv = E.nuevos();
    for (const k of ['desde', 'hasta']) if (d[k] && !nv.has(d[k])) out.push({ clase: 'anclaje', nivel: 'error', id: o.id, texto: nombre(o) + ': la superficie de ' + (k === 'desde' ? 'salida' : 'llegada') + ' ya no existe.', arreglo: { quitar: k } });
    if (b === 'rampa') {
      const p = +d.pendiente || (+d.alto / Math.max(0.1, +d.largo || 1) * 100);
      if (p > 100) out.push({ clase: 'pendiente', nivel: 'error', id: o.id, texto: nombre(o) + ' tiene ' + A.fmt(p, 0) + ' % de pendiente: no se puede subir.', arreglo: { pendiente: 10 } });
      else if (p > 12) out.push({ clase: 'pendiente', nivel: 'aviso', id: o.id, texto: nombre(o) + ' es muy empinada (' + A.fmt(p, 1) + ' %; lo razonable es hasta 12 %, y 8 % si es accesible).', arreglo: { pendiente: 10 } });
    }
    if (b === 'escalera' && d.forma && d.forma !== 'recta') return; /* L, U y caracol: la llegada no está en el eje */
    const y0 = +d.y || 0, y1 = y0 + (+d.alto || +d.sy || 0);
    const [ax, az] = llegada(d, 1), [px, pz] = llegada(d, -1);
    const arriba = apoyos(ax, az, sup, o.id).some((a?) => Math.abs(a.y - y1) <= 0.06);
    const abajo = apoyos(px, pz, sup, o.id).some((a?) => Math.abs(a.y - y0) <= 0.06);
    if (!arriba) {
      const masAlta = sup.find((s?) => A.dentroPoligono(ax, az, s.hu) && s.top - y0 > 0.1);
      out.push({ clase: 'escalera', nivel: 'aviso', id: o.id, texto: nombre(o) + ': al final (a ' + A.fmt(y1, 2) + ' m) no hay piso ni plataforma a su altura.', arreglo: masAlta ? { ajustarArriba: true } : null });
    }
    if (!abajo) out.push({ clase: 'escalera', nivel: 'aviso', id: o.id, texto: nombre(o) + ': el pie (a ' + A.fmt(y0, 2) + ' m) no apoya en el suelo ni en un piso.', arreglo: null });
  }
  function revisaMateriales(out?) {
    const mats = A.efectivos('materiales'), assets = A.efectivos('assets'), conocidos = new Set<any>(Object.keys(A.MATERIALES || {}));
    const presets = window.OOMaterialesPro && OOMaterialesPro.presets ? (typeof OOMaterialesPro.presets === 'function' ? OOMaterialesPro.presets() : OOMaterialesPro.presets) : null;
    if (presets) for (const k of Object.keys(presets)) conocidos.add(k);
    const revisaProps = (props?, key?, nom?, id?) => {
      const m = props && props.material; if (!m || !String(m).startsWith('u:')) return;
      const doc = mats.get(String(m).slice(2));
      if (!doc) out.push({ clase: 'material', nivel: 'error', key, id, texto: nom + ' usa un material propio que ya no existe.', arreglo: { quitarMaterial: true } });
      else for (const c of ['textura', 'normal']) if (doc[c] && !assets.has(doc[c])) out.push({ clase: 'material', nivel: 'aviso', key, id, texto: nom + ': la ' + (c === 'textura' ? 'textura' : 'textura de relieve') + ' del material «' + (doc.nombre || '') + '» ya no está.', arreglo: { quitarTextura: String(m).slice(2), campo: c } });
    };
    for (const o of E.nuevos().values()) {
      revisaProps(o.props, 'n' + o.id, nombre(o), o.id);
      for (const c of ['material', 'matSup', 'matLat']) { const v = o.datos[c]; if (v && typeof v === 'string' && !conocidos.has(v)) out.push({ clase: 'material', nivel: 'aviso', id: o.id, texto: nombre(o) + ': material «' + v + '» desconocido (se ve con su color).', arreglo: { material: c } }); }
    }
    for (let i = 0; i < A.N; i++) { const z = A.P[i]; if (z && z.props && !z.del) revisaProps(A.propsDe('p' + i), 'p' + i, A.nombreEntidades(['p' + i])); }
  }
  function revisaDuplicados(out?) {
    const vistos = new Map<any, any>();
    for (const o of E.nuevos().values()) {
      const d = o.datos; if (tb(o.tipo) === 'nota') continue;
      const k = [o.tipo, Math.round((+d.x || 0) * 200), Math.round((+d.y || 0) * 200), Math.round((+d.z || 0) * 200), Math.round((+d.giroY || 0) * 10), Math.round((+d.sx || 0) * 200), Math.round((+d.sy || 0) * 200), Math.round((+d.sz || 0) * 200)].join('|');
      const otro = vistos.get(k);
      if (otro) out.push({ clase: 'duplicado', nivel: 'aviso', id: o.id, texto: nombre(o) + ' está duplicado (igual que otro en el mismo sitio).', arreglo: { borrar: true, otro } });
      else vistos.set(k, o.id);
    }
  }
  function revisar() {
    const out = [];
    if (!A.D) return out;
    const sup = superficiesNuevas();
    try { for (const r of OOAnclajes.validar()) out.push({ clase: 'anclaje', nivel: r.nivel || 'aviso', id: r.id, texto: r.texto, arreglo: /soporte ya no existe/.test(r.texto) ? { quitarSoporte: true } : /atraviesa/.test(r.texto) ? { subirAPlataforma: true } : null }); } catch (e) { /* sin anclajes */ }
    for (const o of E.nuevos().values()) { try { revisaEscalera(o, sup, out); revisaApoyo(o, sup, out); } catch (e) { console.warn('validación', o.id, e); } }
    revisaMateriales(out); revisaDuplicados(out);
    for (const r of out) { r.key = r.key || 'n' + r.id; r.firma = r.clase + ':' + r.key + ':' + r.texto.replace(/[\d,.]+ (m|%)/g, ''); }
    return out.filter((r?) => !ignorados.has(r.firma));
  }

  /* ---------- correcciones ---------- */
  function correccion(r?) {
    const a = r.arreglo; if (!a) return null;
    const o = r.key[0] === 'n' ? E.nuevos().get(r.key.slice(1)) : null;
    const conDatos = (cambio?) => { if (!o) return null; const v = o.datos; o.datos = Object.assign(A.clon(v), cambio(A.clon(v))); const doc = A.docActualizado(o); o.datos = v; return doc; };
    if (a.y != null) return conDatos((d?) => { const dy = a.y - baseY(d); d.y = A.r3((+d.y || 0) + dy); if (a.de) d.soporte = { tipo: 'auto' }; return d; });
    if (a.quitar) return conDatos((d?) => { d[a.quitar] = null; return d; });
    if (a.pendiente) return conDatos((d?) => { d.pendiente = a.pendiente; if (window.OOEscaleras) OOEscaleras.normalizarRampa(d); return d; });
    if (a.quitarSoporte) return conDatos((d?) => { delete d.soporte; return d; });
    if (a.material) return conDatos((d?) => { d[a.material] = 'pintura'; return d; });
    if (a.borrar && o) return { id: o.docId, data: null };
    if (a.quitarMaterial) { const obj = A.objetivoProps([r.key]); if (obj) { const p = A.leerProps(obj); delete p.material; return { props: p, obj }; } }
    if (a.quitarTextura) { const m = A.efectivos('materiales').get(a.quitarTextura); if (m) { const n = Object.assign({}, m); delete n[a.campo]; return { col: 'materiales', id: a.quitarTextura, data: n }; } }
    if (a.subirAPlataforma && o) { const sup = superficiesNuevas().filter((s?) => A.dentroPoligono(+o.datos.x || 0, +o.datos.z || 0, s.hu)).sort((x?, y?) => y.top - x.top)[0]; if (sup) return conDatos((d?) => { d.y = A.r3((+d.y || 0) + sup.top - baseY(d)); d.soporte = { tipo: 'auto' }; return d; }); }
    return null;
  }
  const corregible = (r?) => !!r.arreglo && (r.arreglo.ajustarArriba || !!correccion(r));
  function corregir(lista?) {
    const docs = [], props = [], cols = [];
    for (const r of lista) {
      if (r.arreglo && r.arreglo.ajustarArriba) { if (window.OOEscaleras) OOEscaleras.ajustarArriba(r.id); continue; }
      const c = correccion(r); if (!c) continue;
      if (c.props) props.push(c); else if (c.col) cols.push(c); else docs.push(c);
    }
    if (docs.length) A.guardar(docs, { etiqueta: docs.length > 1 ? 'Corregir ' + docs.length + ' avisos' : 'Corregir un aviso' });
    for (const p of props) A.guardarProps({ material: undefined }, p.obj);
    for (const c of cols) A.guardarCol(c.col, c.id, c.data);
    return docs.length + props.length + cols.length;
  }

  /* ---------- panel ---------- */
  const ETQ = { escalera: 'Escaleras y rampas', pendiente: 'Pendientes', flotando: 'Flotando', enterrado: 'Enterrado', anclaje: 'Anclajes', material: 'Materiales', duplicado: 'Duplicados' };
  let ultima = [];
  function pintar() {
    ultima = revisar();
    const n = ultima.length, nc = ultima.filter(corregible).length, err = ultima.filter((r?) => r.nivel === 'error').length;
    const grupos = {}; for (const r of ultima) (grupos[r.clase] = grupos[r.clase] || []).push(r);
    const fila = (r?, i?) => `<li class="val-${r.nivel}"><span class="val-txt">${esc(r.texto)}</span><span class="val-acc"><button data-val-ir="${i}" title="Seleccionar y encuadrar">Ir</button>${corregible(r) ? `<button class="prim" data-val-fix="${i}">Corregir</button>` : ''}<button data-val-ign="${i}" title="No volver a avisar">Ignorar</button></span></li>`;
    const cuerpo = n ? Object.keys(grupos).map((c?) => `<details open class="val-grupo"><summary>${esc(ETQ[c] || c)} (${grupos[c].length})</summary><ul class="val-lista">${grupos[c].map((r?) => fila(r, ultima.indexOf(r))).join('')}</ul></details>`).join('')
      : '<p class="val-ok">Todo en orden: escaleras conectadas, pendientes bien, nada flotando ni enterrado, anclajes y materiales correctos.</p>';
    const html = `<div class="cab">Revisar el mapa</div><div class="cont val-cont"><p class="ayuda">${n ? `${n} aviso${n > 1 ? 's' : ''}${err ? ` (${err} error${err > 1 ? 'es' : ''})` : ''}; ${nc} se pueden corregir solos.` : ''}${ignorados.size ? ` ${ignorados.size} ignorado${ignorados.size > 1 ? 's' : ''} <button class="link" data-val-reset>volver a mostrarlos</button>` : ''}</p>${cuerpo}</div>
      <div class="pie">${nc ? `<button data-val-todo>Corregir todo (${nc})</button>` : ''}<button class="prim" data-a="m-si">Cerrar</button></div>`;
    const caja = document.querySelector('#modalCaja');
    if (caja && !document.querySelector('#modal').hidden && caja.querySelector('.val-cont')) caja.innerHTML = html; else A.abrirModal(html, 'ancho');
    return ultima;
  }
  document.addEventListener('click', (e?) => {
    const t = e.target.closest && e.target.closest('[data-val-ir],[data-val-fix],[data-val-ign],[data-val-todo],[data-val-reset],[data-a="validar-mapa"]'); if (!t) return;
    if (t.dataset.a === 'validar-mapa') { e.preventDefault(); const m = document.querySelector('#menuExportar'); if (m) m.hidden = true; pintar(); return; }
    if (t.dataset.valIr != null) { const r = ultima[+t.dataset.valIr]; if (!r) return; A.cerrarModal(null); if (A.existe(r.key)) { A.seleccionar([r.key]); const box = A.cajaEntidades([r.key]); if (!box.isEmpty()) A.encuadrarCaja(box); } return; }
    if (t.dataset.valFix != null) { const r = ultima[+t.dataset.valFix]; if (r) corregir([r]); setTimeout(pintar, 120); return; }
    if (t.dataset.valIgn != null) { const r = ultima[+t.dataset.valIgn]; if (r) { ignorados.add(r.firma); guardarIgn(); } pintar(); return; }
    if (t.dataset.valTodo != null) { corregir(ultima.filter(corregible)); setTimeout(pintar, 150); return; }
    if (t.dataset.valReset != null) { ignorados.clear(); guardarIgn(); pintar(); }
  });
  E.agregarHerramienta('seleccionar', { n: 'Revisar el mapa (avisos)', ic: 'medir', fn: () => pintar() });
  window.OOValidacion = { revisar, corregir, corregible, pintar, apoyos, get ignorados() { return ignorados; } };
})();
