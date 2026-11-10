/* Editor del mapa (2.1, Map Editor Pro fase 3): edificios de varias plantas.
   Un edificio es una fundación con plantas: `datos.niveles = [{id, altura, sotano?, azotea?, nombre?}]`, de abajo arriba. La planta baja
   es la primera que no es sótano y su suelo es la cara de arriba de la fundación; las de encima suman las alturas y los sótanos las restan.
   Cada objeto de una planta guarda `datos.nivel` (id de la planta) y `datos.edificio` (id de la fundación). Lo que se apoya en algo de una
   planta (muebles en su losa, puertas en sus paredes) hereda la planta de su soporte. La estructura de las plantas se ancla a la fundación
   (`soporte` manual con `rel`): al elevar la fundación todas las plantas suben con ella sin cambiar de medidas.
   - Selector visible arriba de la vista: «Nivel: Sótano | Planta baja | Piso 1 | Piso 2 | Azotea», con «Ver todos», «Solo este nivel» y
     «Ocultar superiores», y «Corte» (corta la vista a 1,2 m del suelo de la planta activa, como un plano).
   - Lo que oculta el selector no se dibuja ni se puede elegir (filtro de selección de editor.js, el mismo que usa iman.js).
   - Con una planta activa se dibuja a su altura (plano de trabajo) y lo que se crea dentro del edificio queda en esa planta.
   - Plantas: agregar encima o un sótano (con su losa), duplicar la planta activa (copia todo y sube las de encima), quitarla (borra lo
     suyo y baja las de encima) y cambiar su altura (mueve las de encima y ajusta las paredes de la planta). Todo en un solo paso de deshacer. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, r3 = A.r3, tb = A.tipoBase, clon = A.clon;
  const ANC = () => window.OOAnclajes;
  A.ICON.niveles = '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v18" stroke-dasharray="2 2"/>';
  const ESTRUCT = ['muro', 'habitacion', 'techo', 'escalera', 'rampa', 'baranda', 'edificio'];
  const CORTE_H = 1.2;
  const lsKey = () => 'oo-editor-niveles-' + A.mapa;
  let est = { fid: null, nid: null, modo: 'todos', corte: false };
  try { const g = JSON.parse(localStorage.getItem(lsKey()) || 'null'); if (g) est = Object.assign(est, g); } catch (e) { }
  const guardarEst = () => { try { localStorage.setItem(lsKey(), JSON.stringify(est)); } catch (e) { } };

  /* ---------- plantas de un edificio ---------- */
  const nv = () => E.nuevos();
  const esEdificio = o => !!(o && tb(o.tipo) === 'fundacion' && Array.isArray(o.datos.niveles) && o.datos.niveles.length);
  const edificios = () => [...nv().values()].filter(esEdificio);
  function plantas(f) {
    if (typeof f === 'string') f = nv().get(f); if (!f) return [];
    const d = f.datos || f, L = (d.niveles || []).map(n => Object.assign({}, n));
    let base = L.findIndex(n => !n.sotano); if (base < 0) base = L.length - 1;
    let off = 0; for (let i = base; i < L.length; i++) { L[i].offset = off; off += Math.max(0.5, +L[i].altura || 3); }
    off = 0; for (let i = base - 1; i >= 0; i--) { off -= Math.max(0.5, +L[i].altura || 3); L[i].offset = off; }
    let s = 0, p = 0; for (let i = base - 1; i >= 0; i--) L[i].auto = 'Sótano' + (++s > 1 ? ' ' + s : '');
    for (let i = base; i < L.length; i++) L[i].auto = L[i].azotea ? 'Azotea' : i === base ? 'Planta baja' : 'Piso ' + (++p);
    L.forEach((n, i) => { n.idx = i; n.esBase = i === base; n.etiqueta = n.nombre || n.auto; n.altura = Math.max(0.5, +n.altura || 3); });
    return L;
  }
  const topeF = f => ANC() ? ANC().tope(f.tipo || 'fundacion', f.datos || f) : (+f.datos.y || 0) + (+f.datos.elevacion || 0);
  function yPlanta(f, nid) { if (typeof f === 'string') f = nv().get(f); if (!f) return null; const p = plantas(f).find(n => n.id === nid); return p ? r3(topeF(f) + p.offset) : null; }
  /* planta efectiva de un objeto: la suya o la de su soporte (cadena de soportes, sin ciclos) */
  function nivelDe(o, prof) {
    if (!o || !o.datos) return null; const d = o.datos;
    if (d.nivel && d.edificio) return { fid: d.edificio, nid: d.nivel };
    if ((prof || 0) > 8) return null;
    const s = d.soporte && d.soporte.id ? d.soporte.id : (typeof d.muro === 'string' ? d.muro : null); if (!s) return null;
    const S = nv().get(s); if (!S) return null;
    if (esEdificio(S)) { const pb = plantas(S).find(n => n.esBase); return pb ? { fid: S.id, nid: pb.id } : null; }
    return nivelDe(S, (prof || 0) + 1);
  }
  const activo = () => { const f = est.fid ? nv().get(est.fid) : null; return esEdificio(f) ? f : null; };
  function indice(f, nid) { const p = plantas(f); const i = p.findIndex(n => n.id === nid); return i; }
  /* ¿lo oculta el selector? */
  function oculto(o) {
    if (est.modo === 'todos') return false; const f = activo(); if (!f || !o || o.id === f.id) return false;
    const n = nivelDe(o); if (!n || n.fid !== f.id) return false;
    const ia = indice(f, est.nid), io = indice(f, n.nid); if (ia < 0 || io < 0) return false;
    return est.modo === 'solo' ? io !== ia : io > ia;
  }
  E.filtrosVis.push((key, o) => !(key[0] === 'n' && o && oculto(o)));
  E.bloqueos.push(k => { if (k[0] !== 'n' || est.modo === 'todos') return false; const o = nv().get(k.slice(1)); return !!o && oculto(o); });

  /* ---------- planta activa ---------- */
  function activar(fid, nid, opts) {
    opts = opts || {}; const f = fid ? nv().get(fid) : null;
    if (!esEdificio(f)) { est.fid = null; est.nid = null; A.planoTrabajo = 0; guardarEst(); pintarBarra(); return false; }
    const p = plantas(f); if (!p.some(n => n.id === nid)) nid = (p.find(n => n.esBase) || p[0]).id;
    est.fid = fid; est.nid = nid; if (opts.modo) est.modo = opts.modo; if (opts.corte != null) est.corte = !!opts.corte;
    A.planoTrabajo = yPlanta(f, nid) || 0;
    aplicarCorte(); guardarEst(); pintarBarra();
    A.seleccionar(A.sel.filter(A.seleccionable)); A.renderTodo();
    return true;
  }
  function aplicarCorte() { const f = activo(); if (est.corte && f) A.ponerCorte(r3(yPlanta(f, est.nid) + CORTE_H)); else if (corteMio) A.ponerCorte(null); corteMio = !!(est.corte && f); A.renderTodo(); }
  let corteMio = false;
  function ponerModo(m) { est.modo = ['todos', 'solo', 'hasta'].includes(m) ? m : 'todos'; guardarEst(); pintarBarra(); A.seleccionar(A.sel.filter(A.seleccionable)); A.renderTodo(); }
  function ponerCorteNivel(v) { est.corte = !!v; guardarEst(); aplicarCorte(); pintarBarra(); }

  /* ---------- regla: lo que se crea dentro del edificio con una planta activa queda en ella ---------- */
  if (ANC()) ANC().reglas.push((id, d, prev, ctx) => {
    if (prev || !est.fid || !est.nid) return; const x = d.datos, b = tb(d.tipo);
    if (x.nivel || b === 'fundacion' || b === 'nota' || b === 'calle') return;
    const Fd = ctx.est(ctx.docDe.get(est.fid)); if (!Fd || !Fd.datos || !Array.isArray(Fd.datos.niveles)) return;
    const hu = ANC().huella('fundacion', Fd.datos); if (!ANC().dentroCerca(+x.x || 0, +x.z || 0, hu, 0.35)) return;
    x.nivel = est.nid; x.edificio = est.fid;
    if (['puerta', 'ventana', 'hueco'].includes(b) && typeof x.muro === 'string') return;
    const s = x.soporte; if (s && (s.manual || s.tipo === 'libre' || s.tipo === 'terreno')) return;
    const yP = (+Fd.datos.y || 0) + Math.max(0, +Fd.datos.elevacion || 0) + (plantas(Fd.datos).find(n => n.id === est.nid) || { offset: 0 }).offset;
    let losa = false;
    if (!ESTRUCT.includes(b)) for (const [, H] of ctx.todos()) { if (!ctx.esAgr(H) || tb(H.tipo) !== 'habitacion') continue; if (Math.abs(ANC().tope(H.tipo, H.datos) - (+x.y || 0)) < 0.1 && A.dentroPoligono(+x.x || 0, +x.z || 0, A.puntosMundoHab({ datos: H.datos }))) { losa = true; break; } }
    if (!losa && Math.abs((+x.y || 0) - yP) < 0.6) x.soporte = { tipo: 'fundacion', id: est.fid, manual: true };
  });

  /* ---------- operaciones (un solo paso de deshacer cada una) ---------- */
  const docDeObj = o => { const v = o.datos; return (nd) => { o.datos = nd; const doc = A.docActualizado(o); o.datos = v; return doc; }; };
  function conNiveles(f, niveles) { return docDeObj(f)(Object.assign(clon(f.datos), { niveles })); }
  const nuevoIdNivel = () => 'nv' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
  function losaDe(f, nid, niveles) {
    const fake = { datos: Object.assign({}, f.datos, { niveles }) }; const p = plantas(fake).find(n => n.id === nid); if (!p) return null;
    const y = topeF(f) + p.offset, G = 0.2, hu = ANC().huella('fundacion', f.datos);
    const dh = A.datosHabitacion(hu, r3(y - 0.012 - G), p.altura, { suelo: true, grosor: G, nombre: 'Losa ' + p.etiqueta.toLowerCase(), material: 'concreto', color: (A.MATERIALES.concreto || {}).c || '#b9b4aa', nivel: nid, edificio: f.id, soporte: { tipo: 'fundacion', id: f.id, manual: true } });
    const id = A.nuevoId() + 'l'; return { id, data: A.docNuevo(id, 'habitacion', dh) };
  }
  function crearEdificio(fid, altura) {
    const f = nv().get(fid); if (!f || tb(f.tipo) !== 'fundacion') return false; if (esEdificio(f)) { activar(fid, null); return true; }
    const doc = conNiveles(f, [{ id: 'pb', altura: r3(Math.max(2, +altura || 3)) }]); if (!doc) return false;
    A.guardar([doc], { etiqueta: 'Convertir en edificio con plantas' }); activar(fid, 'pb'); return true;
  }
  function agregarPlanta(fid, opts) {
    opts = opts || {}; const f = nv().get(fid); if (!esEdificio(f)) return null;
    const L = clon(f.datos.niveles), n = { id: nuevoIdNivel(), altura: r3(Math.max(2, +opts.altura || (L[L.length - 1] || {}).altura || 3)) };
    if (opts.sotano) { n.sotano = true; L.unshift(n); } else { if (opts.azotea) n.azotea = true; L.push(n); }
    const lista = [conNiveles(f, L)]; if (opts.losa !== false) { const l = losaDe(f, n.id, L); if (l) lista.push(l); }
    A.guardar(lista, { etiqueta: opts.sotano ? 'Agregar sótano' : opts.azotea ? 'Agregar azotea' : 'Agregar planta' });
    activar(fid, n.id); return n.id;
  }
  /* objetos de una planta (con los heredados) */
  function deNivel(fid, nid) { return [...nv().values()].filter(o => { const n = nivelDe(o); return n && n.fid === fid && n.nid === nid; }); }
  /* mueve en vertical lo de cada planta según dy por planta; solo las raíces (lo apoyado en ellas sigue por anclajes) */
  function docsMover(fid, dyPor, extra) {
    const mov = new Map(); for (const o of nv().values()) { const n = nivelDe(o); if (!n || n.fid !== fid) continue; const dy = dyPor.get(n.nid) || 0; if (Math.abs(dy) > 1e-6) mov.set(o.id, dy); }
    const out = [], hechos = new Set();
    for (const [id, dy] of mov) {
      const o = nv().get(id), s = o.datos.soporte, sid = s && s.id ? s.id : (typeof o.datos.muro === 'string' ? o.datos.muro : null);
      if (sid && mov.has(sid)) continue; /* lo mueve su soporte (anclajes.js) */
      const base = extra && extra.has(id) ? extra.get(id) : o.datos; const d = docDeObj(o)(Object.assign(clon(base), { y: r3((+base.y || 0) + dy) })); if (d) { out.push(d); hechos.add(id); }
    }
    if (extra) for (const [id, nd] of extra) { if (hechos.has(id)) continue; const o = nv().get(id); if (!o) continue; const d = docDeObj(o)(nd); if (d) out.push(d); }
    return out;
  }
  function offsets(f, niveles) { const m = new Map(); for (const p of plantas({ datos: Object.assign({}, f.datos, { niveles }) })) m.set(p.id, p.offset); return m; }
  function diffOffsets(f, L0, L1) { const a = offsets(f, L0), b = offsets(f, L1), m = new Map(); for (const [id, v] of a) if (b.has(id)) m.set(id, r3(b.get(id) - v)); return m; }
  function alturaPlanta(fid, nid, h) {
    const f = nv().get(fid); if (!esEdificio(f)) return false; h = r3(Math.max(2, +h || 3));
    const L0 = clon(f.datos.niveles), L1 = clon(L0), n = L1.find(x => x.id === nid); if (!n) return false; const viejo = Math.max(0.5, +n.altura || 3); if (Math.abs(viejo - h) < 1e-4) return true; n.altura = h;
    const extra = new Map(), yP = yPlanta(f, nid);
    for (const o of deNivel(fid, nid)) { const b = tb(o.tipo), d = o.datos;
      if (b === 'muro' && Math.abs((+d.sy || 0) - viejo) < 0.05 && Math.abs((+d.y || 0) - yP) < 0.1) extra.set(o.id, Object.assign(clon(d), { sy: h }));
      if (b === 'techo' && Math.abs((+d.y || 0) - (yP + viejo)) < 0.1) extra.set(o.id, Object.assign(clon(d), { y: r3(yP + h) }));
      if (b === 'habitacion' && !d.suelo && Math.abs((+d.alto || 0) - viejo) < 0.05) extra.set(o.id, Object.assign(clon(d), { alto: h })); }
    const lista = [conNiveles(f, L1)].concat(docsMover(fid, diffOffsets(f, L0, L1), extra));
    A.guardar(lista, { etiqueta: 'Altura de planta: ' + A.fmt(h) + ' m' }); activar(fid, est.fid === fid ? est.nid : nid); return true;
  }
  function quitarPlanta(fid, nid) {
    const f = nv().get(fid); if (!esEdificio(f)) return false; const p = plantas(f), n = p.find(x => x.id === nid); if (!n || n.esBase) { A.pista('La planta baja no se puede quitar.'); return false; }
    const L0 = clon(f.datos.niveles), L1 = L0.filter(x => x.id !== nid);
    const borrar = deNivel(fid, nid); const ids = new Set(borrar.map(o => o.id));
    const lista = [conNiveles(f, L1)].concat(borrar.map(o => ({ id: o.docId, data: null })));
    const dy = diffOffsets(f, L0, L1); const mov = docsMover(fid, dy).filter(d => !ids.has(d.data.id_objeto)); lista.push(...mov);
    A.guardar(lista, { etiqueta: 'Quitar ' + n.etiqueta.toLowerCase() });
    activar(fid, (p.find(x => x.esBase) || p[0]).id); return true;
  }
  function duplicarPlanta(fid, nid) {
    const f = nv().get(fid); if (!esEdificio(f)) return null; const p = plantas(f), n = p.find(x => x.id === nid); if (!n) return null;
    const L0 = clon(f.datos.niveles), i = L0.findIndex(x => x.id === nid), nn = { id: nuevoIdNivel(), altura: n.altura }; if (n.sotano) nn.sotano = true;
    const L1 = clon(L0); L1.splice(i + 1, 0, nn); /* un sótano duplicado queda encima del original (sigue siendo sótano) */
    const dy = diffOffsets(f, L0, L1), lista = [conNiveles(f, L1)];
    /* las plantas que se desplazan (encima, o debajo si es un sótano) */
    lista.push(...docsMover(fid, dy));
    const offN = offsets(f, L1), dCopia = r3(offN.get(nn.id) - offsets(f, L0).get(nid));
    const orig = deNivel(fid, nid), mapa = new Map(orig.map(o => [o.id, A.nuevoId() + Math.random().toString(36).slice(2, 5)]));
    let hayLosa = false;
    for (const o of orig) {
      const d = clon(o.datos), nid2 = mapa.get(o.id); d.y = r3((+d.y || 0) + dCopia); d.nivel = nn.id; d.edificio = fid;
      if (d.soporte && d.soporte.id) { if (mapa.has(d.soporte.id)) { d.soporte = Object.assign({}, d.soporte, { id: mapa.get(d.soporte.id) }); delete d.soporte.rel; } else if (d.soporte.id === fid) d.soporte = { tipo: 'fundacion', id: fid, manual: true }; else delete d.soporte; }
      if (typeof d.muro === 'string') d.muro = mapa.get(d.muro) || d.muro;
      if (d.de_habitacion) d.de_habitacion = mapa.get(d.de_habitacion) || d.de_habitacion;
      if (d.agujeros_auto) { const a = {}; for (const k in d.agujeros_auto) if (mapa.has(k)) a[mapa.get(k)] = d.agujeros_auto[k]; d.agujeros_auto = a; }
      if (tb(o.tipo) === 'habitacion' && d.suelo) hayLosa = true;
      const prev = A.efectivos().get(o.docId) || {};
      const ext = { capa: prev.capa || A.capaActiva }; if (o.props) ext.props = clon(o.props); lista.push({ id: nid2, data: A.docNuevo(nid2, o.tipo, d, ext) });
    }
    if (!hayLosa) { const l = losaDe(f, nn.id, L1); if (l) lista.push(l); }
    A.guardar(lista, { etiqueta: 'Duplicar ' + n.etiqueta.toLowerCase() });
    activar(fid, nn.id); return nn.id;
  }
  function renombrarPlanta(fid, nid, nombre) { const f = nv().get(fid); if (!esEdificio(f)) return false; const L = clon(f.datos.niveles), n = L.find(x => x.id === nid); if (!n) return false; if (nombre && String(nombre).trim()) n.nombre = String(nombre).trim(); else delete n.nombre; A.guardar([conNiveles(f, L)], { etiqueta: 'Renombrar planta' }); pintarBarra(); return true; }
  function marcarAzotea(fid, nid, v) { const f = nv().get(fid); if (!esEdificio(f)) return false; const L = clon(f.datos.niveles), n = L.find(x => x.id === nid); if (!n || n.sotano) return false; if (v) n.azotea = true; else delete n.azotea; A.guardar([conNiveles(f, L)], { etiqueta: v ? 'Marcar azotea' : 'Quitar azotea' }); pintarBarra(); return true; }

  /* ---------- selector «Nivel: …» ---------- */
  const barra = document.createElement('div'); barra.id = 'barraNiveles'; barra.className = 'flot'; barra.setAttribute('role', 'toolbar'); barra.setAttribute('aria-label', 'Nivel'); barra.hidden = true;
  barra.style.cssText = 'position:absolute;top:60px;left:0;right:0;margin:0 auto;width:max-content;display:flex;flex-wrap:nowrap;align-items:center;gap:4px;padding:4px 6px;z-index:3;font-size:12px;max-width:calc(100% - 150px);white-space:nowrap';
  const vista = document.getElementById('vista'); if (vista) vista.appendChild(barra);
  const pop = document.createElement('div'); pop.id = 'popNiveles'; pop.className = 'pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Plantas del edificio'); if (vista) vista.appendChild(pop);
  const nombreF = f => (f.props && f.props.nombre) || f.datos.nombre || 'Edificio';
  function pintarBarra() {
    const ed = edificios(); if (!ed.length) { barra.hidden = true; return; }
    let f = activo(); if (!f) { f = ed[0]; est.fid = f.id; }
    const p = plantas(f); if (!p.some(n => n.id === est.nid)) est.nid = null;
    barra.hidden = false;
    // (2.1) Plegada por defecto (el usuario la encontraba molesta encima de la vista): solo una pastilla «Plantas ▸» hasta que se abre o hay una planta activa.
    let pleg = true; try { pleg = localStorage.getItem('oo-niveles-abierta') !== '1'; } catch (er) { }
    if (pleg) {
      const act = est.nid ? p.find(n => n.id === est.nid) : null;
      barra.style.top = 'auto'; barra.style.bottom = '44px'; barra.style.left = '12px'; barra.style.right = 'auto'; barra.style.margin = '0';
      barra.innerHTML = `<button data-niv="abrir" title="Mostrar el selector de plantas del edificio" style="height:26px;padding:0 9px;border:0;border-radius:6px;background:transparent">Plantas${act && est.modo !== 'todos' ? ' · ' + A.esc(act.etiqueta) : ''} ▸</button>`;
      return;
    }
    barra.style.top = '60px'; barra.style.bottom = ''; barra.style.left = '0'; barra.style.right = '0'; barra.style.margin = '0 auto';
    barra.innerHTML = `<button data-niv="plegar" title="Ocultar el selector de plantas" style="height:30px;padding:0 6px;border:0;border-radius:6px;background:transparent">✕</button>` + (ed.length > 1 ? `<select data-niv="edif" aria-label="Edificio">${ed.map(x => `<option value="${A.esc(x.id)}"${x.id === f.id ? ' selected' : ''}>${A.esc(nombreF(x))}</option>`).join('')}</select>` : '') +
      `<b style="margin:0 4px">Nivel:</b>` + p.map(n => `<button data-niv="ir" data-id="${A.esc(n.id)}" class="${n.id === est.nid ? 'on' : ''}" style="height:30px;padding:0 9px;border:0;border-radius:6px;background:${n.id === est.nid ? 'var(--acc)' : 'transparent'};color:${n.id === est.nid ? 'var(--acc-fg)' : 'inherit'}" title="${A.esc(n.etiqueta)} · suelo a ${A.fmt(yPlanta(f, n.id))} m · ${A.fmt(n.altura)} m de alto">${A.esc(n.etiqueta)}</button>`).join('<span style="opacity:.4">|</span>') +
      `<select data-niv="modo" aria-label="Qué plantas se ven" style="margin-left:6px"><option value="todos"${est.modo === 'todos' ? ' selected' : ''}>Ver todos</option><option value="solo"${est.modo === 'solo' ? ' selected' : ''}>Solo este nivel</option><option value="hasta"${est.modo === 'hasta' ? ' selected' : ''}>Ocultar superiores</option></select>` +
      `<label class="chk" title="Corta la vista a ${A.fmt(CORTE_H)} m del suelo de la planta activa"><input type="checkbox" data-niv="corte"${est.corte ? ' checked' : ''}> Corte</label>` +
      `<button data-pop="popNiveles" title="Agregar, duplicar o quitar plantas y cambiar su altura" style="height:30px;padding:0 9px;border:0;border-radius:6px;background:transparent">Plantas…</button>`;
  }
  function htmlPop() {
    const f = activo(); if (!f) return '<p class="ayuda">Selecciona una fundación y conviértela en edificio con plantas (inspector).</p>';
    const p = plantas(f), a = p.find(n => n.id === est.nid);
    return `<h3>${A.esc(nombreF(f))}: plantas</h3>
      ${p.slice().reverse().map(n => `<div class="fila" style="align-items:center;gap:6px"><button data-niv="ir" data-id="${A.esc(n.id)}" class="${n.id === est.nid ? 'prim' : ''}" style="min-width:96px">${A.esc(n.etiqueta)}</button><label class="campo" style="flex:1"><span>Alto (m)</span><input type="number" step="0.1" min="2" data-niv="alto" data-id="${A.esc(n.id)}" value="${r3(n.altura)}"></label><small>${A.fmt(yPlanta(f, n.id))} m</small></div>`).join('')}
      <div class="fila"><button data-niv="mas">Agregar planta encima</button><button data-niv="sotano">Agregar sótano</button></div>
      <div class="fila"><button data-niv="azotea">Agregar azotea</button>${a ? `<button data-niv="dup">Duplicar ${A.esc(a.etiqueta.toLowerCase())}</button>` : ''}</div>
      ${a && !a.esBase ? `<div class="fila"><button data-niv="quitar">Quitar ${A.esc(a.etiqueta.toLowerCase())}</button></div>` : ''}
      ${a ? `<label class="campo ancho"><span>Nombre de la planta activa</span><input type="text" data-niv="nombre" value="${A.esc(a.nombre || '')}" placeholder="${A.esc(a.auto)}"></label>` : ''}
      <p class="ayuda">Duplicar copia paredes, pisos, puertas y muebles de la planta y sube las de encima. Quitar borra lo que hay en ella y baja las de encima. Al cambiar el alto se mueven las plantas de encima y se ajustan las paredes de esa planta. Todo se deshace con Ctrl+Z.</p>`;
  }
  window.addEventListener('oo-pop', e => { if (e.detail === 'popNiveles') pop.innerHTML = htmlPop(); });
  function onClick(e) {
    const b = e.target.closest && e.target.closest('[data-niv]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const f = activo(); const k = b.dataset.niv;
    if (k === 'abrir' || k === 'plegar') { try { localStorage.setItem('oo-niveles-abierta', k === 'abrir' ? '1' : '0'); } catch (er) { } if (k === 'plegar') { est.nid = null; est.modo = 'todos'; est.corte = false; A.planoTrabajo = 0; aplicarCorte(); guardarEst(); A.seleccionar(A.sel.filter(A.seleccionable)); A.renderTodo(); } pintarBarra(); return; }
    if (k === 'ir') activar(est.fid, b.dataset.id);
    else if (f && k === 'mas') agregarPlanta(f.id);
    else if (f && k === 'sotano') agregarPlanta(f.id, { sotano: true });
    else if (f && k === 'azotea') agregarPlanta(f.id, { azotea: true, altura: 1.2 });
    else if (f && k === 'dup' && est.nid) duplicarPlanta(f.id, est.nid);
    else if (f && k === 'quitar' && est.nid) A.confirmar('¿Quitar esta planta?', 'Se borra todo lo que hay en ella y bajan las de encima. Se puede deshacer.', 'Quitar').then(ok => { if (ok) { quitarPlanta(f.id, est.nid); pop.innerHTML = htmlPop(); } });
    else if (k === 'edificio') { const o = selFund(); if (o) crearEdificio(o.id); }
    if (!pop.hidden) pop.innerHTML = htmlPop();
  }
  function onChange(e) {
    const el = e.target, k = el.dataset && el.dataset.niv; if (!k) return; const f = activo();
    if (k === 'edif') activar(el.value, null);
    else if (k === 'modo') ponerModo(el.value);
    else if (k === 'corte') ponerCorteNivel(el.checked);
    else if (f && k === 'alto') alturaPlanta(f.id, el.dataset.id, parseFloat(el.value));
    else if (f && k === 'nombre' && est.nid) renombrarPlanta(f.id, est.nid, el.value);
    else if (k === 'ialto') { const o = selFund(); if (o) alturaPlanta(o.id, el.dataset.id, parseFloat(el.value)); }
    if (!pop.hidden) pop.innerHTML = htmlPop();
  }
  barra.addEventListener('click', onClick); pop.addEventListener('click', onClick); barra.addEventListener('change', onChange); pop.addEventListener('change', onChange);

  /* ---------- inspector de la fundación: «Plantas del edificio» ---------- */
  function selFund() { if (A.sel.length !== 1 || A.sel[0][0] !== 'n') return null; const o = nv().get(A.sel[0].slice(1)); return o && tb(o.tipo) === 'fundacion' ? o : null; }
  E.on('panel', () => {
    const o = selFund(); const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!o || !c) return;
    const div = document.createElement('div');
    div.innerHTML = `<details class="sec" open data-sec="plantas"><summary>Plantas del edificio</summary><div class="campos">${esEdificio(o)
      ? plantas(o).slice().reverse().map(n => `<label class="campo"><span>${A.esc(n.etiqueta)} (alto, m)</span><input type="number" step="0.1" min="2" data-niv="ialto" data-id="${A.esc(n.id)}" value="${r3(n.altura)}"></label>`).join('') + '<p class="ayuda">Usa el selector «Nivel» de arriba de la vista para ver, ocultar y editar cada planta.</p>'
      : '<p class="ayuda">Convierte la fundación en un edificio: la planta baja es su cara de arriba y puedes agregar pisos, sótanos y azotea.</p><div class="fila"><button data-niv="edificio" class="prim">Convertir en edificio con plantas</button></div>'}</div></details>`;
    const ref = c.querySelector('[data-sec="fundacion"]') || c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild;
    if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.appendChild(sec);
    sec.addEventListener('click', onClick); sec.addEventListener('change', onChange);
  });
  /* el selector se refresca con los cambios (plantas nuevas, edificios borrados) y el plano de trabajo sigue a la fundación */
  E.on('recompute', () => { pintarBarra(); const f = activo(); if (f && est.nid) A.planoTrabajo = yPlanta(f, est.nid) || 0; else if (est.fid && !f) { est.fid = null; est.nid = null; A.planoTrabajo = 0; } if (corteMio && f && est.corte) { const h = r3(yPlanta(f, est.nid) + CORTE_H); if (A.corte !== h) A.ponerCorte(h); } });
  E.on('mapa', () => { try { const g = JSON.parse(localStorage.getItem(lsKey()) || 'null'); est = Object.assign({ fid: null, nid: null, modo: 'todos', corte: false }, g || {}); } catch (e) { } pintarBarra(); });

  window.OONiveles = { plantas, yPlanta, nivelDe, oculto, activar, ponerModo, ponerCorte: ponerCorteNivel, crearEdificio, agregarPlanta, duplicarPlanta, quitarPlanta, alturaPlanta, renombrarPlanta, marcarAzotea, deNivel, edificios,
    get estado() { return Object.assign({}, est); }, CORTE_H };
})();
