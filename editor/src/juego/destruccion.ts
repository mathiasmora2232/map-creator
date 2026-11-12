/* Editor del mapa (2.1): reglas de destrucción.
   - Reglas por tipo (colección «reglas», un documento por regla y mapa): filtro {malla, material, seccion, tipo, categoria} (listas;
     cada lista con algo tiene que coincidir con alguno de sus textos, sin distinguir mayúsculas) y propiedades {destructible, vida, modo,
     fisica, masa, escombro, sonido}. Gana la primera regla que coincide (el orden se cambia con las flechas). Mientras el mapa no tenga
     reglas propias se usan las de DEFECTO; al tocar una se guardan todas.
   - Excepciones por objeto: props.destruccion del objeto (con deshacer), por encima de la regla: {forzar: 'si'|'no', vida, modo, ...}.
   - Tinte de la vista: naranja lo destructible, gris lo indestructible, sin tinte lo que no tiene regla.
   - Envío al juego (como los carteles): POST /api/reglas/<mapa> → servidor.py guarda
     unity/Assets/OperacionOficina/Resources/Reglas/reglas_<mapa>.json con
     {version: 1, mapa, reglas: [{id, nombre, filtro: {malla, material, seccion, tipo}, destructible, vida, modo, fisica, masa, escombro,
     sonido}], objetos: [{pos, tam, malla, destructible, vida, modo, fisica, masa, escombro, sonido}]} en coordenadas de Unity (las del
     JSON del mapa: x, y, z = −z del editor). Los objetos son las excepciones de piezas del mapa, identificadas por su caja original. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, esc = A.esc, svg = A.svg, $ = (s?) => document.querySelector(s);
  const MODOS = [['romper', 'Romper en piezas'], ['volcar', 'Volcar o empujar'], ['vidrio', 'Vidrio que estalla'], ['arrancar', 'Arrancar de las bisagras'], ['ninguno', 'Indestructible']];
  const ESCOMBROS = [['madera', 'Madera'], ['metal', 'Metal'], ['vidrio', 'Vidrio'], ['yeso', 'Yeso'], ['plastico', 'Plástico'], ['concreto', 'Concreto']];
  const R = (id?, nombre?, filtro?, destructible?, vida?, modo?, fisica?, masa?, escombro?, sonido?) => ({ id, nombre, filtro: Object.assign({ malla: [], material: [], seccion: [], tipo: [], categoria: [] }, filtro), destructible, vida, modo, fisica, masa, escombro, sonido: sonido || '' });
  const DEFECTO = [
    R('coches', 'Coches (sus piezas)', { tipo: ['coche'] }, true, 300, 'romper', true, 1200, 'metal', 'choque_metal'),
    R('suelo', 'Suelo', { seccion: ['Suelo'] }, false, 0, 'ninguno', false, 0, 'concreto'),
    R('muro_exterior', 'Muros exteriores', { seccion: ['Perimetro'] }, false, 0, 'ninguno', false, 0, 'concreto'),
    R('muro_exterior_nuevo', 'Muros exteriores nuevos', { tipo: ['muro_exterior'] }, false, 0, 'ninguno', false, 0, 'concreto'),
    R('columnas', 'Columnas y pilares', { malla: ['columna', 'pilar', 'pilastra'] }, false, 0, 'ninguno', false, 0, 'concreto'),
    R('ventanas', 'Ventanas', { tipo: ['ventana'] }, true, 15, 'vidrio', false, 0, 'vidrio', 'vidrio_roto'),
    R('vidrios', 'Vidrios y mamparas', { malla: ['vidrio', 'mampara'] }, true, 15, 'vidrio', false, 0, 'vidrio', 'vidrio_roto'),
    R('puertas', 'Puertas', { tipo: ['puerta'] }, true, 120, 'arrancar', true, 25, 'madera', 'puerta_golpe'),
    R('sillas', 'Sillas', { malla: ['silla'] }, true, 40, 'romper', true, 6, 'plastico'),
    R('escritorios', 'Escritorios y mesas', { malla: ['escritorio', 'mesa'] }, true, 120, 'romper', true, 35, 'madera'),
    R('monitores', 'Monitores y pantallas', { malla: ['monitor', 'pantalla', 'televisor'] }, true, 20, 'romper', true, 5, 'plastico', 'vidrio_roto'),
    R('archivadores', 'Archivadores y armarios', { malla: ['archivador', 'armario'] }, true, 150, 'volcar', true, 60, 'metal'),
    R('estanterias', 'Estanterías', { malla: ['estanter', 'repisa', 'rack'] }, true, 120, 'volcar', true, 40, 'metal'),
    R('cajas', 'Cajas', { malla: ['caja'] }, true, 30, 'romper', true, 8, 'madera'),
    R('pales', 'Palés y tarimas', { malla: ['tarima', 'pale', 'palé', 'palet'] }, true, 60, 'romper', true, 20, 'madera'),
    R('barriles', 'Barriles', { malla: ['barril', 'bidon', 'bidón'] }, true, 80, 'volcar', true, 30, 'metal'),
    R('tabiques', 'Tabiques', { tipo: ['tabique'] }, true, 200, 'romper', false, 0, 'yeso'),
    R('techo_falso', 'Techo falso', { malla: ['falso', 'plafon', 'plafón'], material: [] }, true, 10, 'romper', false, 0, 'yeso'),
    R('techo_falso_mat', 'Placas de techo (material)', { material: ['plafon'] }, true, 10, 'romper', false, 0, 'yeso'),
    R('pisos', 'Pisos y losas', { tipo: ['suelo'] }, false, 0, 'ninguno', false, 0, 'concreto'),
    R('objetos_oficina', 'Objetos de oficina', { malla: ['botella', 'extintor', 'objeto_oficina', 'taza', 'telefono', 'teléfono', 'impresora', 'disco_duro', 'dispensador', 'planta', 'cerveza', 'paulaner', 'pilsener'] }, true, 10, 'romper', true, 1, 'plastico')
  ];
  const CLAVES_FILTRO = [['malla', 'Malla o nombre'], ['material', 'Material'], ['seccion', 'Sección'], ['tipo', 'Tipo (pieza, puerta, ventana, tabique, suelo, muro…)'], ['categoria', 'Categoría del catálogo']];

  /* ---------- reglas guardadas ---------- */
  function guardadas() { return [...A.efectivos('reglas').entries()].filter(([, d]) => d && d.mapa === A.mapa).sort((a?, b?) => (a[1].orden || 0) - (b[1].orden || 0)); }
  function reglas() { const g = guardadas(); return g.length ? g.map(([, d]) => d.regla) : DEFECTO.map((r?) => JSON.parse(JSON.stringify(r))); }
  const propias = () => guardadas().length > 0;
  function guardarTodas(lista?) {
    const viejas = new Set<any>(guardadas().map(([id]) => id)); const t = A.ahora();
    lista.forEach((r?, j?) => { const id = 'reg-' + A.mapa + '-' + r.id; viejas.delete(id); A.guardarCol('reglas', id, { mapa: A.mapa, orden: j, regla: r, actualizado: t }); });
    for (const id of viejas) A.guardarCol('reglas', id, null);
  }

  /* ---------- atributos de cada entidad y regla que le toca ---------- */
  let cacheAtr = new Map<any, any>(), cacheD = null;
  const tok = (g?) => g ? g.slice(g.indexOf(':') + 1).replace(/_\d+$/, '') : '';
  function atributos(k?) {
    if (cacheD !== A.D) { cacheD = A.D; cacheAtr = new Map<any, any>(); }
    if (k[0] === 'p') {
      if (cacheAtr.has(k)) return cacheAtr.get(k);
      const i = +k.slice(1), z = A.P[i]; if (!z) return null; const D = A.D;
      const grp = z.grp >= 0 ? D.grupos[z.grp] || '' : '', au = A.autoActivo(k);
      const material = z.mat >= 0 && D.materiales[z.mat] ? D.materiales[z.mat][0] : '', seccion = D.secciones[z.sec] || '';
      let tipo = 'pieza'; const v = window.OOHuecos && OOHuecos.vanoDe(i);
      const s = z.b.s, delgado = Math.min(s.x, s.z), largo = Math.max(s.x, s.z);
      if ((/^auto:/.test(grp) || /^(d|v):(auto|vidrio_movil|panel_auto|faro_auto|neumatico|carroceria)/.test(grp) || /^(sedan|suv|hatchback|pickup|furgoneta|camion)/.test(z.nom || '')) && largo < 8) tipo = 'coche';
      else if (v) tipo = v.tipo; else if (z.t === 7 || /^puerta:/.test(grp)) tipo = 'puerta';
      else if (/^suelo$/i.test(seccion) || (s.y < 0.35 && largo > 4)) tipo = 'suelo';
      else if (z.t === 0 && delgado <= 0.13 && s.y >= 2 && s.y <= 3.4 && largo >= 0.8 && !/perimetro/i.test(seccion) && /^(liso|bloque|panel|yeso|pintura|plafon)/i.test(material)) tipo = 'tabique';
      else if (z.t === 0 && s.y > 1.8 && largo > 2.5 && delgado < 0.6) tipo = 'muro';
      const a = { nombre: [z.nom, tok(grp), au ? au.nombre : ''].join(' ').toLowerCase(), material: material.toLowerCase(), seccion: seccion.toLowerCase(), tipo, categoria: '' };
      cacheAtr.set(k, a); return a;
    }
    const o = E.nuevos().get(k.slice(1)); if (!o) return null; const b = A.tipoBase(o.tipo), sub = String(o.tipo).slice(b.length + 1);
    let tipo = b; if (b === 'muro') tipo = o.datos.preset === 'exterior' ? 'muro_exterior' : o.datos.preset === 'tabique' ? 'tabique' : 'muro'; if (b === 'calle' || b === 'habitacion') tipo = 'suelo';
    const it = sub && A.itemPorId ? A.itemPorId(sub) : null;
    return { nombre: (A.nombreTipo(o.tipo) + ' ' + sub + ' ' + (o.datos.nombre || '')).toLowerCase(), material: String(o.datos.material || '').toLowerCase(), seccion: String(A.capaDeNuevo(o) || '').toLowerCase(), tipo, categoria: String((it && it.cat) || '').toLowerCase() };
  }
  const CAMPO = { malla: 'nombre', material: 'material', seccion: 'seccion', tipo: 'tipo', categoria: 'categoria' };
  function coincide(r?, a?) {
    let alguno = false;
    for (const k in CAMPO) { const l = (r.filtro && r.filtro[k]) || []; if (!l.length) continue; alguno = true; const v = a[CAMPO[k]] || ''; if (!l.some((t?) => t && v.includes(String(t).toLowerCase()))) return false; }
    return alguno;
  }
  function reglaDe(k?, lista?) { const a = atributos(k); if (!a) return null; for (const r of lista || reglas()) if (coincide(r, a)) return r; return null; }
  function efectivo(k?, lista?) {
    const r = reglaDe(k, lista), pr = A.propsDe(k), ex = pr && pr.destruccion;
    if (ex && (ex.forzar === 'si' || ex.forzar === 'no')) { const base = r || {}; return { regla: r, excepcion: true, destructible: ex.forzar === 'si', vida: ex.vida ?? base.vida ?? 50, modo: ex.forzar === 'no' ? 'ninguno' : (ex.modo || (base.modo !== 'ninguno' && base.modo) || 'romper'), fisica: ex.fisica ?? base.fisica ?? false, masa: ex.masa ?? base.masa ?? 0, escombro: ex.escombro || base.escombro || 'madera', sonido: ex.sonido ?? base.sonido ?? '' }; }
    if (!r) return null; return Object.assign({ regla: r, excepcion: false }, r);
  }

  /* ---------- tinte de la vista ---------- */
  let tinte = false; try { tinte = localStorage.getItem('oo-editor-tinte-destruccion') === '1'; } catch (e) { }
  const NAR = new T.Color('#ff6a00'), GRIS = new T.Color('#5f666e'), _c = new T.Color();
  function aplicarTinte() {
    if (!tinte || !A.D) return; const lista = reglas(), P = A.P, M = A.M, sel = A.selSet;
    for (let i = 0; i < A.N; i++) {
      const z = P[i]; if (z.t === 5 || z.t === 6 || z.cat === 'col' || z.del) continue; const k = 'p' + i; if (sel.has(k)) continue;
      const ef = efectivo(k, lista); if (!ef) continue; const col = ef.destructible ? NAR : GRIS, f = 0.75;
      _c.copy(z.c).lerp(col, f);
      if (z.real && window.OOMallas) OOMallas.escribir(z, A.visible(i), true, col);
      const m = M[z.mesh]; if (!m) continue;
      if (z.cortes) for (const ct of z.cortes) M[ct.k].mesh.setColorAt(ct.s, _c); else if (z.slot >= 0) m.mesh.setColorAt(z.slot, _c);
    }
    for (const o of E.nuevos().values()) {
      const k = 'n' + o.id; if (sel.has(k) || !o.slots) continue; const ef = efectivo(k, lista); if (!ef) continue; const col = ef.destructible ? NAR : GRIS;
      let j = 0; for (const pt of o.partes || []) { if (pt.f === 't' || pt.f === 'poly') continue; const sl = o.slots[j++]; if (!sl) continue; _c.set(pt.c || '#cccccc').lerp(col, 0.6); M[sl[0]].mesh.setColorAt(sl[1], _c); }
    }
    for (const k in M) M[k].mesh.instanceColor.needsUpdate = true; A.marcar();
  }
  function ponerTinte(v?) { tinte = !!v; try { localStorage.setItem('oo-editor-tinte-destruccion', tinte ? '1' : '0'); } catch (e) { } if (tinte) aplicarTinte(); else A.renderTodo(); pintarTodo(); }
  E.on('render', aplicarTinte); E.on('seleccion', () => { if (tinte) aplicarTinte(); });

  /* ---------- envío al juego ---------- */
  function cajaBase(refs?) {
    const bx = new T.Box3(), P = A.P;
    for (const r of refs) { const z = P[r]; if (!z) continue; const q = z.b.q, s = z.t === 7 ? new V3(0.9, 2.1, 0.06) : z.b.s, c = z.t === 7 ? new V3(0, 1.05, 0).applyQuaternion(q).add(z.b.p) : z.b.p; for (let a = 0; a < 8; a++) bx.expandByPoint(new V3((a & 1 ? 0.5 : -0.5) * s.x, (a & 2 ? 0.5 : -0.5) * s.y, (a & 4 ? 0.5 : -0.5) * s.z).applyQuaternion(q).add(c)); }
    return bx;
  }
  const r3 = A.r3, GENERICO = /^(malla|esfera|cilindro|#)/i;
  function contenido() {
    const lista = reglas(), out = { version: 1, mapa: A.mapa, reglas: [], objetos: [] };
    for (const r of lista) { const f: any = { malla: r.filtro.malla || [], material: r.filtro.material || [], seccion: r.filtro.seccion || [], tipo: r.filtro.tipo || [] }; if ((r.filtro.categoria || []).length) f.categoria = r.filtro.categoria; out.reglas.push({ id: r.id, nombre: r.nombre, filtro: f, destructible: !!r.destructible, vida: +r.vida || 0, modo: r.modo, fisica: !!r.fisica, masa: +r.masa || 0, escombro: r.escombro, sonido: r.sonido || '' }); }
    for (const [, d] of A.efectivos()) {
      if (!d || d.mapa !== A.mapa || d.accion !== 'propiedades' || !d.props || !d.props.destruccion) continue;
      const refs = (Array.isArray(d.ref) ? d.ref : [d.ref]).filter((r?) => A.P[r]); if (!refs.length) continue;
      const ef = efectivo('p' + refs[0], lista); if (!ef || !ef.excepcion) continue;
      const bx = cajaBase(refs), c = bx.getCenter(new V3()), s = bx.getSize(new V3());
      const nom = (refs.map((r?) => A.P[r].nom).find((n?) => n && !GENERICO.test(n)) || A.nombreEntidades(refs.map((r?) => 'p' + r)) || 'objeto').toLowerCase();
      out.objetos.push({ pos: [r3(c.x), r3(c.y), r3(-c.z)], tam: [r3(s.x), r3(s.y), r3(s.z)], malla: nom, destructible: ef.destructible, vida: +ef.vida || 0, modo: ef.modo, fisica: !!ef.fisica, masa: +ef.masa || 0, escombro: ef.escombro, sonido: ef.sonido || '' });
    }
    return out;
  }
  let ultimaFirma = null, temporizador = null, ultimoEnvio = null;
  async function enviar(forzar?) {
    if (!A.D) return null; const c = contenido(), firma = JSON.stringify(c);
    if (!forzar && firma === ultimaFirma) return null; ultimaFirma = firma;
    try {
      const r = await fetch('/api/reglas/' + encodeURIComponent(A.mapa), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: firma });
      ultimoEnvio = await r.json(); if (forzar) A.pista(ultimoEnvio.ruta ? 'Reglas enviadas al juego: ' + ultimoEnvio.reglas + ' reglas y ' + ultimoEnvio.objetos + ' excepciones.' : 'No se pudieron enviar las reglas: ' + (ultimoEnvio.error || '?'));
      return ultimoEnvio;
    } catch (e) { console.warn('reglas', e); return null; }
  }
  function programarEnvio() {
    if (!A.D) return; const firma = JSON.stringify(contenido());
    if (ultimaFirma === null) { ultimaFirma = firma; return; } // al abrir el mapa no se escribe nada
    if (firma === ultimaFirma) return; clearTimeout(temporizador); temporizador = setTimeout(() => enviar(false), 1200);
  }
  E.on('mapa', () => { ultimaFirma = null; cacheD = null; });
  E.on('col', (c?) => { if (c === 'reglas') { programarEnvio(); pintarTodo(); if (tinte) A.renderTodo(); } });
  E.on('recompute', () => { programarEnvio(); });

  /* ---------- panel de reglas (modal) ---------- */
  const lst = (l?) => esc((l || []).join(', '));
  function htmlReglas() {
    const l = reglas(); let cuenta = { si: 0, no: 0 };
    if (A.D) { for (let i = 0; i < A.N; i++) { const z = A.P[i]; if (z.t === 5 || z.t === 6 || z.cat === 'col') continue; const r = reglaDe('p' + i, l); if (r) cuenta[r.destructible ? 'si' : 'no']++; } }
    let h = `<div class="cab">${svg('rompible')} Reglas de destrucción <small>${esc(A.mapa)}</small></div><div class="cont reglas-destr" id="reglasDestr" style="max-height:66vh;overflow:auto">`;
    h += `<p class="ayuda" style="margin-top:0">Gana la primera regla que coincide. Cada filtro admite varios textos separados por comas; vacío = cualquiera. ${propias() ? '' : '<b>Son las reglas por defecto:</b> se guardan al cambiar cualquiera.'} Piezas del mapa: <b style="color:#ff7a1a">${cuenta.si} destructibles</b> · <b>${cuenta.no} indestructibles</b>.</p>`;
    h += `<div class="fila"><button data-regla-nueva>${svg('mas')}Nueva regla</button><button data-regla-defecto>Restaurar por defecto</button><label class="chk"><input type="checkbox" data-regla-tinte ${tinte ? 'checked' : ''}> Teñir la vista (naranja destructible, gris indestructible)</label><button class="prim" data-regla-enviar>Enviar al juego</button></div>`;
    l.forEach((r?, j?) => {
      h += `<details class="sec" ${j < 3 || r._abierta ? 'open' : ''}><summary><span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${r.destructible ? '#ff7a1a' : '#7d8590'}"></span>${esc(r.nombre)} <small>${r.destructible ? esc((MODOS.find((m?) => m[0] === r.modo) || ['', ''])[1]) + ' · vida ' + r.vida : 'indestructible'}</small><span class="esp"></span><button class="bi" data-regla-mover="${j}" data-dir="-1" title="Subir">↑</button><button class="bi" data-regla-mover="${j}" data-dir="1" title="Bajar">↓</button><button class="bi" data-regla-borrar="${j}" title="Borrar">${svg('cerrar')}</button></summary><div class="campos">`;
      h += `<label class="campo ancho"><span>Nombre</span><input type="text" data-regla="${j}" data-rk="nombre" value="${esc(r.nombre)}"></label>`;
      for (const [k, lb] of CLAVES_FILTRO) h += `<label class="campo ancho"><span>${esc(lb)}</span><input type="text" data-regla="${j}" data-rf="${k}" value="${lst(r.filtro[k])}" placeholder="cualquiera"></label>`;
      h += `<label class="chk campo ancho"><input type="checkbox" data-regla="${j}" data-rk="destructible" ${r.destructible ? 'checked' : ''}> Destructible</label>`;
      h += `<label class="campo"><span>Vida</span><input type="number" step="1" data-regla="${j}" data-rk="vida" value="${esc(r.vida)}"></label>`;
      h += `<label class="campo"><span>Modo</span><select data-regla="${j}" data-rk="modo">${MODOS.map(([a, b]) => `<option value="${a}"${r.modo === a ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
      h += `<label class="chk campo"><input type="checkbox" data-regla="${j}" data-rk="fisica" ${r.fisica ? 'checked' : ''}> Física</label>`;
      h += `<label class="campo"><span>Masa (kg)</span><input type="number" step="0.5" data-regla="${j}" data-rk="masa" value="${esc(r.masa)}"></label>`;
      h += `<label class="campo"><span>Escombro</span><select data-regla="${j}" data-rk="escombro">${ESCOMBROS.map(([a, b]) => `<option value="${a}"${r.escombro === a ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
      h += `<label class="campo"><span>Sonido</span><input type="text" data-regla="${j}" data-rk="sonido" value="${esc(r.sonido || '')}"></label></div></details>`;
    });
    h += `<p class="ayuda">Se guardan en <code>datos_usuario/reglas.json</code> y, al cambiar, se envían a <code>unity/Assets/OperacionOficina/Resources/Reglas/reglas_${esc(A.mapa)}.json</code>.</p></div><div class="pie"><button class="prim" data-a="m-no" data-foco>Cerrar</button></div>`;
    return h;
  }
  function abrir() { A.abrirModal(htmlReglas(), 'ancha'); }
  function pintarTodo() {
    const m = $('#reglasDestr'); if (m && !(document.activeElement && m.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) { const sc = m.scrollTop; $('#modalCaja').innerHTML = htmlReglas(); const n = $('#reglasDestr'); if (n) n.scrollTop = sc; }
    pintarExcepcion();
  }
  function editar(f?) { const l = reglas(); f(l); guardarTodas(l); }
  document.addEventListener('click', (e?) => {
    const t = e.target.closest && e.target.closest('[data-regla-nueva],[data-regla-defecto],[data-regla-enviar],[data-regla-borrar],[data-regla-mover],[data-destr-reglas]'); if (!t) return;
    if (t.dataset.destrReglas != null) { abrir(); return; }
    if (t.hasAttribute('data-regla-nueva')) { editar((l?) => l.unshift(R('r' + Date.now().toString(36), 'Regla nueva', {}, true, 50, 'romper', true, 10, 'madera'))); return; }
    if (t.hasAttribute('data-regla-defecto')) { guardarTodas(DEFECTO.map((r?) => JSON.parse(JSON.stringify(r)))); A.pista('Reglas por defecto restauradas.'); return; }
    if (t.hasAttribute('data-regla-enviar')) { enviar(true); return; }
    e.preventDefault();
    if (t.dataset.reglaBorrar != null) { editar((l?) => l.splice(+t.dataset.reglaBorrar, 1)); return; }
    if (t.dataset.reglaMover != null) { const j = +t.dataset.reglaMover, d = +t.dataset.dir; editar((l?) => { const k = j + d; if (k < 0 || k >= l.length) return; const [x] = l.splice(j, 1); l.splice(k, 0, x); }); }
  });
  document.addEventListener('change', (e?) => {
    const el = e.target; if (!el.dataset) return;
    if (el.hasAttribute('data-regla-tinte')) { ponerTinte(el.checked); return; }
    if (el.dataset.regla != null) {
      const j = +el.dataset.regla;
      editar((l?) => { const r = l[j]; if (!r) return; if (el.dataset.rf) r.filtro[el.dataset.rf] = el.value.split(',').map((s?) => s.trim()).filter(Boolean); else if (el.type === 'checkbox') r[el.dataset.rk] = el.checked; else if (el.type === 'number') { const v = parseFloat(el.value); if (isFinite(v)) r[el.dataset.rk] = v; } else r[el.dataset.rk] = el.value; if (el.dataset.rk === 'modo' && el.value === 'ninguno') r.destructible = false; });
      return;
    }
    if (el.dataset.destr != null) guardarExcepcion(el);
  });

  /* ---------- excepción del objeto elegido (pestaña Más) ---------- */
  function pintarExcepcion() {
    const caja = $('#insMas'); if (!caja) return; let el = $('#insDestr');
    if (!el) { el = document.createElement('div'); el.id = 'insDestr'; caja.appendChild(el); }
    if (!A.sel.length || !A.objetivoProps()) { el.innerHTML = `<h3>${svg('rompible')} Destrucción</h3><div class="fila"><button data-destr-reglas>Reglas de destrucción…</button><label class="chk"><input type="checkbox" data-regla-tinte ${tinte ? 'checked' : ''}> Teñir la vista</label></div>`; return; }
    const k = A.sel[0], ef = efectivo(k), ex = (A.leerProps(A.objetivoProps()).destruccion) || {}, forzar = ex.forzar || '';
    let h = `<h3>${svg('rompible')} Destrucción</h3><p class="ayuda">${ef ? (ef.excepcion ? 'Excepción de este objeto' : 'Regla «' + esc(ef.regla.nombre) + '»') + ': ' + (ef.destructible ? 'destructible (' + esc((MODOS.find((m?) => m[0] === ef.modo) || ['', ef.modo])[1]).toLowerCase() + ', vida ' + ef.vida + ')' : 'indestructible') : 'Ninguna regla lo cubre: el juego decide.'}</p>`;
    h += `<div class="campos"><label class="campo ancho"><span>Este objeto</span><select data-destr="forzar"><option value=""${!forzar ? ' selected' : ''}>Según la regla</option><option value="si"${forzar === 'si' ? ' selected' : ''}>Forzar destructible</option><option value="no"${forzar === 'no' ? ' selected' : ''}>Forzar indestructible</option></select></label>`;
    if (forzar === 'si') {
      const v = (c?, d?) => ex[c] != null ? ex[c] : (ef && ef[c] != null ? ef[c] : d);
      h += `<label class="campo"><span>Vida</span><input type="number" step="1" data-destr="vida" value="${esc(v('vida', 50))}"></label>`;
      h += `<label class="campo"><span>Modo</span><select data-destr="modo">${MODOS.filter((m?) => m[0] !== 'ninguno').map(([a, b]) => `<option value="${a}"${v('modo', 'romper') === a ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
      h += `<label class="chk campo"><input type="checkbox" data-destr="fisica" ${v('fisica', false) ? 'checked' : ''}> Física</label>`;
      h += `<label class="campo"><span>Masa (kg)</span><input type="number" step="0.5" data-destr="masa" value="${esc(v('masa', 0))}"></label>`;
      h += `<label class="campo"><span>Escombro</span><select data-destr="escombro">${ESCOMBROS.map(([a, b]) => `<option value="${a}"${v('escombro', 'madera') === a ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
      h += `<label class="campo"><span>Sonido</span><input type="text" data-destr="sonido" value="${esc(v('sonido', ''))}"></label>`;
    }
    h += `</div><div class="fila"><button data-destr-reglas>Reglas de destrucción…</button><label class="chk"><input type="checkbox" data-regla-tinte ${tinte ? 'checked' : ''}> Teñir la vista</label></div>`;
    el.innerHTML = h;
  }
  function guardarExcepcion(el?) {
    const ex = Object.assign({}, A.leerProps(A.objetivoProps()).destruccion || {}), k = el.dataset.destr;
    if (k === 'forzar') { if (!el.value) { A.guardarProps({ destruccion: undefined }); return; } ex.forzar = el.value; }
    else if (el.type === 'checkbox') ex[k] = el.checked; else if (el.type === 'number') { const v = parseFloat(el.value); if (!isFinite(v)) return; ex[k] = v; } else ex[k] = el.value;
    A.guardarProps({ destruccion: ex });
  }
  const masVisible = () => { const p = document.querySelector('[data-panel="mas"]'); return p && !p.hidden; };
  E.on('tab', (t?) => { if (t === 'mas') pintarExcepcion(); });
  E.on('seleccion', () => { if (masVisible()) pintarExcepcion(); });
  E.on('recompute', () => { if (masVisible() && !document.querySelector('#insDestr input:focus')) pintarExcepcion(); });

  E.agregarHerramienta('objetos', { fn: abrir, n: 'Reglas de destrucción' });
  E.agregarHerramienta('objetos', { fn: () => ponerTinte(!tinte), n: 'Teñir lo destructible (sí / no)' });
  window.OODestruccion = { DEFECTO, reglas, reglaDe, efectivo, atributos, contenido, enviar, abrir, ponerTinte, get tinte() { return tinte; } };
})();
