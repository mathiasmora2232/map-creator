/* Editor del mapa (2.1, Map Editor Pro fase 5): terreno mejorado (sección 11 de la especificación).
   - Pinceles con radio, intensidad y suavidad (terreno.js: la suavidad decide cuánto del radio cae suave; 0 = borde duro).
   - Nivelar con una plataforma: el terreno bajo una fundación queda a la altura de su base y un talud lo une con lo de alrededor. También
     al revés: «Apoyar la plataforma en el terreno» pone la base de la fundación a la altura media del terreno de debajo.
   - Vegetación: herramienta Terreno → «Pintar vegetación» y «Borrar vegetación» (pincel con radio y densidad; árboles, palmeras, arbustos
     o mezcla, con tamaño y variación al azar). Las plantas son objetos normales que siguen el terreno. Un trazo = un paso de deshacer.
   - Adaptar caminos: un suelo/calle, carretera o acera seleccionado puede (a) apoyarse en el terreno (altura y pendiente de sus extremos)
     o (b) allanar el terreno bajo él con un talud a los lados, siguiendo la recta entre sus extremos.
   - Seguir el terreno en lote: con varios objetos elegidos, sección «Terreno» del inspector: que sigan el terreno (y se apoyen en él),
     que dejen de seguirlo o apoyarlos ahora. Al cambiar el terreno solo se mueven los que lo siguen (anclajes.js, seguirTerreno).
   API: OOTerrenoPro.nivelarConPlataforma(id, {talud}), apoyarPlataforma(id), pintarVegetacion([x, z], radio, opts), borrarVegetacion([x, z], radio, opts),
   adaptarCamino(id, 'apoyar' | 'terreno', {talud}), seguirLote(ids, si, {apoyar}), esVegetacion(o). */
(function () {
  'use strict';
  const E = window.OOEditor, TR = window.OOTerreno; if (!E || !TR || !TR.pincel) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, DEG = A.DEG, r3 = A.r3, tb = A.tipoBase, clon = A.clon, nv = () => E.nuevos();
  const VEG = ['arbol', 'proc:arbol_proc', 'proc:palmera_proc', 'proc:arbusto_proc'];
  const esVegetacion = (o?) => !!o && (VEG.includes(o.tipo) || tb(o.tipo) === 'arbol' || o.tipo === 'vegetacion' || !!o.datos.vegetacion);
  /* (2.1 pro f6) posiciones en el mundo de las plantas (sueltas o dentro de un grupo «vegetacion», vegetacion.js) */
  const posPlantas = (o?) => o.tipo === 'vegetacion' ? (o.datos.plantas || []).map((p?) => { const g = (+o.datos.giroY || 0) * DEG, c = Math.cos(g), s = Math.sin(g), x = +p.d.x || 0, z = +p.d.z || 0; return [(+o.datos.x || 0) + x * c + z * s, (+o.datos.z || 0) - x * s + z * c]; }) : [[+o.datos.x || 0, +o.datos.z || 0]];
  const PV = { tipo: 'mezcla', radio: 6, densidad: 4, variacion: 0.3, semilla: 0 }; A.params.vegetacion = PV;
  function azar(sem?) { let a = (sem >>> 0) || ((Math.random() * 4294967295) >>> 0); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- nivelar y apoyar plataformas ---------- */
  function huella(o?) { return window.OOAnclajes ? OOAnclajes.huella(o.tipo, o.datos) : null; }
  function distPol(x?, z?, pts?) { if (A.dentroPoligono(x, z, pts)) return 0; let m = Infinity; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let t = L2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)); } return m; }
  /* aplica h(x, z, actual, distancia) a las celdas de la caja del polígono más el margen */
  function editarZona(pts?, margen?, fn?) {
    TR.asegurar(); const D = TR.datos(); if (!D) return 0; TR.apilarDeshacer();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const i0 = Math.max(0, Math.floor((x0 - margen - D.x0) / D.paso)), i1 = Math.min(D.nx - 1, Math.ceil((x1 + margen - D.x0) / D.paso)), j0 = Math.max(0, Math.floor((z0 - margen - D.z0) / D.paso)), j1 = Math.min(D.nz - 1, Math.ceil((z1 + margen - D.z0) / D.paso));
    let n = 0; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = D.x0 + i * D.paso, z = D.z0 + j * D.paso, dd = distPol(x, z, pts); if (dd > margen) continue; const k = j * D.nx + i, v = fn(x, z, D.alt[k], dd); if (v != null && isFinite(v)) { D.alt[k] = v; n++; } }
    TR.refrescarZona(i0, j0, i1, j1); TR.guardar(); return n;
  }
  /* el talud se suaviza con la misma curva coseno del pincel */
  const mezcla = (h?, act?, dd?, talud?) => dd <= 0 ? h : act + (h - act) * Math.pow(Math.cos(Math.min(1, dd / talud) * Math.PI / 2), 2);
  function nivelarConPlataforma(id?, o?) {
    o = o || {}; const F = nv().get(id); if (!F) return 0; const pts = huella(F); if (!pts) return 0; const h = +F.datos.y || 0, talud = Math.max(0.5, +o.talud || 4), D0 = TR.datos(), m = (D0 ? D0.paso : 2) * 0.75;
    const n = editarZona(pts, talud + m, (x?, z?, act?, dd?) => mezcla(h, act, Math.max(0, dd - m), talud));
    A.pista('Terreno nivelado con la plataforma a ' + A.fmt(h) + ' m (' + n + ' puntos).'); return n;
  }
  function apoyarPlataforma(id?) {
    const F = nv().get(id); if (!F || !window.OOFundaciones) return false; const pts = huella(F); if (!pts) return false; let s = 0, n = 0; const [cx, cz] = A.centroide(pts);
    for (const p of pts.concat([[cx, cz]])) { s += TR.alturaEn(p[0], p[1]); n++; } return OOFundaciones.cambiar(id, { y: r3(s / n) }, 'Apoyar la plataforma en el terreno');
  }

  /* ---------- vegetación ---------- */
  function datosPlanta(tipo?, r?) {
    const elegir = tipo === 'mezcla' ? (r() < 0.6 ? 'arbol' : r() < 0.6 ? 'arbusto' : 'palmera') : tipo, it = A.itemPorId('proc_' + (elegir === 'arbol' ? 'arbol_proc' : elegir === 'palmera' ? 'palmera_proc' : 'arbusto_proc'));
    if (!it) return { tipo: 'arbol', datos: { giroY: 0, sx: 3.5, sy: 5.5, sz: 3.5, color: '#4f7a3a' } };
    const d = clon(it.datos), f = 1 + (r() * 2 - 1) * PV.variacion; d.semilla = 1 + Math.floor(r() * 49); d.giroY = r3(r() * 360);
    for (const k of ['alto', 'diametroCopa', 'ancho']) if (d[k] != null) d[k] = r3(+d[k] * f); for (const k of ['sx', 'sy', 'sz']) if (d[k] != null) d[k] = r3(+d[k] * f);
    return { tipo: it.tipo, datos: d };
  }
  function pintarVegetacion(c?, radio?, o?) {
    o = Object.assign({}, PV, o || {}); const r = azar(o.semilla), R = Math.max(0.5, +radio || PV.radio), area = Math.PI * R * R, quiero = Math.max(1, Math.round(o.densidad * area / 100)), sep = Math.max(0.8, 10 / Math.sqrt(Math.max(0.1, o.densidad)) * 0.7);
    const hay = [...nv().values()].filter(esVegetacion).flatMap(posPlantas), lista = [], ids = [];
    for (let t = 0; t < quiero * 12 && lista.length < quiero; t++) {
      const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * R, x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
      if (hay.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < sep)) continue; hay.push([x, z]);
      const P = datosPlanta(o.tipo, r); Object.assign(P.datos, { x: r3(x), y: r3(TR.alturaEn(x, z)), z: r3(z), vegetacion: true, soporte: { tipo: 'terreno', manual: true } });
      const id = A.nuevoId() + 'v' + lista.length; ids.push(id); lista.push({ id, data: A.docNuevo(id, P.tipo, P.datos, { props: { nombre: 'Vegetación' } }) });
    }
    if (lista.length) A.guardar(lista, { etiqueta: 'Pintar vegetación (' + lista.length + ')' }); return ids;
  }
  /* (2.1 pro f6) un trazo del pincel = un objeto «vegetacion» con todas sus plantas (instanciadas; vegetacion.js) */
  function pintarVegetacionGrupo(pts?, radio?, o?) {
    o = Object.assign({}, PV, o || {}); const r = azar(o.semilla), R = Math.max(0.5, +radio || PV.radio), quiero = Math.max(1, Math.round(o.densidad * Math.PI * R * R / 100)), sep = Math.max(0.8, 10 / Math.sqrt(Math.max(0.1, o.densidad)) * 0.7);
    const hay = [...nv().values()].filter(esVegetacion).flatMap(posPlantas), plantas = [];
    for (const c of pts) { let n = 0; for (let t = 0; t < quiero * 12 && n < quiero; t++) {
      const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * R, x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
      if (hay.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < sep)) continue; hay.push([x, z]); n++;
      const P = datosPlanta(o.tipo, r); Object.assign(P.datos, { x: r3(x), y: r3(TR.alturaEn(x, z)), z: r3(z) }); plantas.push({ t: P.tipo, d: P.datos });
    } }
    if (!plantas.length) return null;
    let cx = 0, cz = 0; for (const p of plantas) { cx += p.d.x / plantas.length; cz += p.d.z / plantas.length; } cx = r3(cx); cz = r3(cz);
    for (const p of plantas) { p.d.x = r3(p.d.x - cx); p.d.z = r3(p.d.z - cz); }
    const cj = window.OOVegetacion ? OOVegetacion.caja(plantas) : { sx: 1, sy: 1, sz: 1 };
    const id = A.nuevoId() + 'veg';
    A.guardar([{ id, data: A.docNuevo(id, 'vegetacion', Object.assign({ x: cx, y: 0, z: cz, giroY: 0, origen: 'base', vegetacion: true, plantas }, cj), { props: { nombre: 'Vegetación (' + plantas.length + ' plantas)' } }) }], { etiqueta: 'Pintar vegetación (' + plantas.length + ')' });
    return id;
  }
  function borrarVegetacion(c?, radio?, o?) {
    o = o || {}; const R = Math.max(0.5, +radio || PV.radio), lista = [], fuera = new Set<any>();
    for (const v of nv().values()) if (v.tipo === 'vegetacion') { /* (2.1 pro f6) quitar plantas de un grupo */
      const pos = posPlantas(v), quedan = v.datos.plantas.filter((p?, i?) => Math.hypot(pos[i][0] - c[0], pos[i][1] - c[1]) > R); if (quedan.length === v.datos.plantas.length) continue;
      if (!quedan.length) { lista.push({ id: v.docId, data: null }); fuera.add('n' + v.id); continue; }
      const dv = v.datos; v.datos = Object.assign(clon(dv), { plantas: quedan }, window.OOVegetacion ? OOVegetacion.caja(quedan) : {}); const doc = A.docActualizado(v); v.datos = dv; if (doc) lista.push(doc);
    }
    for (const v of nv().values()) if (v.tipo !== 'vegetacion' && esVegetacion(v) && Math.hypot((+v.datos.x || 0) - c[0], (+v.datos.z || 0) - c[1]) <= R && (!o.soloPintada || v.datos.vegetacion)) { lista.push({ id: v.docId, data: null }); fuera.add('n' + v.id); }
    if (lista.length) { if (A.sel.some((k?) => fuera.has(k))) A.seleccionar(A.sel.filter((k?) => !fuera.has(k))); A.guardar(lista, { etiqueta: 'Borrar vegetación (' + lista.length + ')' }); }
    return lista.length;
  }
  /* pincel en la vista: acumula el trazo y lo guarda al soltar (un paso de deshacer) */
  let trazo = null;
  const anillo = new T.Mesh(new T.RingGeometry(0.94, 1, 48), new T.MeshBasicMaterial({ color: 0x2fae5a, depthTest: false, transparent: true, opacity: 0.9, side: T.DoubleSide })); anillo.rotation.x = -Math.PI / 2; anillo.renderOrder = 47; anillo.visible = false; A.scene.add(anillo);
  function punto(e?) { const h = A.pickEvento(e); return h ? h.point : A.puntoPlano(e, 0); }
  function herrVeg(modo?) {
    return { n: modo === 'pintar' ? 'Pintar vegetación' : 'Borrar vegetación', ic: 'terreno', pista: modo === 'pintar' ? 'Arrastra para sembrar árboles y arbustos (siguen el terreno). Radio y densidad en el panel.' : 'Arrastra sobre la vegetación para quitarla.',
      down: (e?) => { const p = punto(e); if (!p) return; trazo = { pts: [[p.x, p.z]] }; },
      move: (e?) => { const p = punto(e); if (!p) return; anillo.visible = true; anillo.scale.setScalar(PV.radio); anillo.position.set(p.x, p.y + 0.2, p.z); anillo.material.color.set(modo === 'pintar' ? 0x2fae5a : 0xe5484d); A.marcar();
        if (trazo) { const u = trazo.pts[trazo.pts.length - 1]; if (Math.hypot(p.x - u[0], p.z - u[1]) > PV.radio * 0.6) { trazo.pts.push([p.x, p.z]); A.punto3D(p, modo === 'pintar' ? 0x2fae5a : 0xe5484d); } } },
      up: () => { if (!trazo) return; const pts = trazo.pts; trazo = null; A.limpiarPrevia(); let n = 0;
        const h0 = A.pasosDeshacer.length;
        if (modo === 'pintar') { const gid = pintarVegetacionGrupo(pts, PV.radio); const g = gid && nv().get(gid); n = g ? g.datos.plantas.length : 0; } else { for (const p of pts) n += borrarVegetacion(p, PV.radio); }
        for (let i = A.pasosDeshacer.length - h0; i > 1; i--) unir(modo === 'pintar' ? 'Pintar vegetación' : 'Borrar vegetación');
        A.pista((modo === 'pintar' ? 'Sembradas ' : 'Quitadas ') + n + ' plantas.'); },
      fin: () => { trazo = null; anillo.visible = false; A.limpiarPrevia(); },
      panel: () => `<div class="campos"><label class="campo"><span>Radio (m)</span><input type="number" step="0.5" min="0.5" data-veg="radio" value="${PV.radio}"></label>${modo === 'pintar' ? `<label class="campo"><span>Densidad (por 100 m²)</span><input type="number" step="0.5" min="0.1" data-veg="densidad" value="${PV.densidad}"></label><label class="campo"><span>Variación de tamaño</span><input type="number" step="0.05" min="0" max="0.8" data-veg="variacion" value="${PV.variacion}"></label><label class="campo ancho"><span>Plantas</span><select data-veg="tipo">${[['mezcla', 'Mezcla'], ['arbol', 'Árboles'], ['palmera', 'Palmeras'], ['arbusto', 'Arbustos']].map(([k, n]) => `<option value="${k}"${PV.tipo === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}</div>` };
  }
  /* junta los pasos de un trazo de varios puntos */
  function unir(txt?) { const L = A.pasosDeshacer; if (L.length < 2) return; const u = L.pop(), a = L[L.length - 1]; a.push(...u); a.etiqueta = txt + ' (' + a.length + ')'; A.actualizarBotonesHistorial(); }
  E.agregarHerramientaPropia('vegetacion', herrVeg('pintar')); E.agregarHerramientaPropia('vegetacion-borrar', herrVeg('borrar'));
  E.agregarHerramienta('terreno', { h: 'vegetacion', n: 'Pintar vegetación', ic: 'terreno' }); E.agregarHerramienta('terreno', { h: 'vegetacion-borrar', n: 'Borrar vegetación', ic: 'terreno' });
  document.addEventListener('change', (e?) => { const k = e.target.dataset && e.target.dataset.veg; if (!k) return; PV[k] = k === 'tipo' ? e.target.value : parseFloat(e.target.value) || PV[k]; });

  /* ---------- adaptar caminos ---------- */
  const CAMINO = (o?) => !!o && (tb(o.tipo) === 'calle' || /^proc:(carretera|acera)/.test(o.tipo));
  function extremos(o?) { const d = o.datos, largoZ = (+d.sz || 0) >= (+d.sx || 0), L = largoZ ? +d.sz || 1 : +d.sx || 1, W = largoZ ? +d.sx || 1 : +d.sz || 1, g = (+d.giroY || 0) * DEG; const u = largoZ ? [Math.sin(g), Math.cos(g)] : [Math.cos(g), -Math.sin(g)];
    return { largoZ, L, W, u, a: [(+d.x || 0) - u[0] * L / 2, (+d.z || 0) - u[1] * L / 2], b: [(+d.x || 0) + u[0] * L / 2, (+d.z || 0) + u[1] * L / 2] }; }
  function adaptarCamino(id?, modo?, o?) {
    o = o || {}; const C = nv().get(id); if (!CAMINO(C)) { A.pista('Selecciona un suelo, una calle, una carretera o una acera.'); return false; }
    const X = extremos(C), ha = TR.alturaEn(X.a[0], X.a[1]), hb = TR.alturaEn(X.b[0], X.b[1]), d = clon(C.datos), pend = Math.atan2(hb - ha, X.L) / DEG;
    d.y = r3((ha + hb) / 2); if (X.largoZ) { d.incX = r3(-pend); d.incZ = 0; } else { d.incZ = r3(pend); d.incX = 0; } d.soporte = { tipo: 'libre' };
    if (modo === 'terreno') { /* el terreno sigue la recta del camino, con talud a los lados */
      const talud = Math.max(0.5, +o.talud || 3), hw = X.W / 2, n = [-X.u[1], X.u[0]], pts = [[X.a[0] + n[0] * hw, X.a[1] + n[1] * hw], [X.b[0] + n[0] * hw, X.b[1] + n[1] * hw], [X.b[0] - n[0] * hw, X.b[1] - n[1] * hw], [X.a[0] - n[0] * hw, X.a[1] - n[1] * hw]];
      editarZona(pts, talud, (x?, z?, act?, dd?) => { const t = Math.max(0, Math.min(1, ((x - X.a[0]) * X.u[0] + (z - X.a[1]) * X.u[1]) / X.L)); return mezcla(ha + (hb - ha) * t - 0.03, act, dd, talud); });
    }
    const v = C.datos; C.datos = d; const doc = A.docActualizado(C); C.datos = v; if (!doc) return false;
    A.guardar([doc], { etiqueta: modo === 'terreno' ? 'Allanar el terreno bajo el camino' : 'Apoyar el camino en el terreno' }); return true;
  }

  /* ---------- seguir el terreno en lote ---------- */
  function seguirLote(ids?, si?, o?) {
    o = o || {}; const lista = [];
    for (const id of ids) { const ob = nv().get(id); if (!ob || ['fundacion', 'nota'].includes(tb(ob.tipo)) || typeof ob.datos.muro === 'string') continue; const d = clon(ob.datos);
      if (si) { d.soporte = { tipo: 'terreno', manual: true }; if (o.apoyar) d.y = r3(TR.alturaEn(+d.x || 0, +d.z || 0)); } else d.soporte = { tipo: 'auto' };
      const v = ob.datos; ob.datos = d; const doc = A.docActualizado(ob); ob.datos = v; if (doc) lista.push(doc); }
    if (lista.length) A.guardar(lista, { etiqueta: (si ? 'Seguir el terreno' : 'Dejar de seguir el terreno') + ' (' + lista.length + ')' }); return lista.length;
  }
  const sigue = (o?) => !!(o && o.datos.soporte && o.datos.soporte.tipo === 'terreno');

  /* ---------- inspector ---------- */
  E.on('panel', () => {
    if (A.herramienta !== 'sel' || !A.sel.length) return; const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return;
    const objs = A.sel.filter((k?) => k[0] === 'n').map((k?) => nv().get(k.slice(1))).filter(Boolean); if (!objs.length) return; const uno = objs.length === 1 ? objs[0] : null;
    let h = `<p class="ayuda" style="margin:0 0 4px">${objs.filter(sigue).length} de ${objs.length} siguen el terreno: solo esos se mueven cuando cambia.</p><div class="fila"><button data-tp5="seguir">Seguir el terreno</button><button data-tp5="apoyar">Apoyar y seguir</button><button data-tp5="dejar">Dejar de seguirlo</button></div>`;
    if (uno && tb(uno.tipo) === 'fundacion') h += `<div class="fila"><button data-tp5="nivelar">Nivelar el terreno con la plataforma</button><button data-tp5="apoyar-plat">Apoyar la plataforma en el terreno</button></div>`;
    if (uno && CAMINO(uno)) h += `<div class="fila"><button data-tp5="camino-apoyar">Apoyar el camino en el terreno</button><button data-tp5="camino-terreno">Allanar el terreno bajo el camino</button></div>`;
    const div = document.createElement('div'); div.innerHTML = `<details class="sec" data-sec="terreno-pro"><summary>Terreno</summary><div class="campos">${h}</div></details>`; c.appendChild(div.firstElementChild);
  });
  document.addEventListener('click', (e?) => {
    const b = e.target.closest && e.target.closest('[data-tp5]'); if (!b) return; const ids = A.sel.filter((k?) => k[0] === 'n').map((k?) => k.slice(1)), a = b.dataset.tp5;
    if (a === 'seguir') seguirLote(ids, true); if (a === 'apoyar') seguirLote(ids, true, { apoyar: true }); if (a === 'dejar') seguirLote(ids, false);
    if (a === 'nivelar') nivelarConPlataforma(ids[0]); if (a === 'apoyar-plat') apoyarPlataforma(ids[0]);
    if (a === 'camino-apoyar') adaptarCamino(ids[0], 'apoyar'); if (a === 'camino-terreno') adaptarCamino(ids[0], 'terreno');
  });

  window.OOTerrenoPro = { nivelarConPlataforma, apoyarPlataforma, pintarVegetacion, pintarVegetacionGrupo, borrarVegetacion, adaptarCamino, seguirLote, esVegetacion, editarZona, params: PV };
})();
