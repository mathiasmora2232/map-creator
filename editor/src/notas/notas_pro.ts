/* Editor del mapa (2.1, Map Editor Pro fase 5): notas con vista previa.
   Las notas (objeto `nota`: pin con texto y fotos) ahora:
   - tienen una cabeza grande y una caja invisible de 1,4 m alrededor para elegirlas con un clic fácil;
   - muestran en el mapa una tarjeta flotante que mira siempre a la cámara, con la miniatura de la primera foto, las primeras palabras y si
     está pendiente o hecha. Clic en la tarjeta = seleccionar la nota; clic otra vez (o doble clic) = abrirla en grande;
   - se listan en la pestaña Notas (arriba, «Notas del mapa»: filtro todas / pendientes / hechas, miniatura, casilla de hecha, clic para ir);
   - se marcan como hechas o pendientes (`datos.estado`: 'pendiente' | 'hecha'; el pin se pone verde) desde el inspector, la tarjeta grande o la lista;
   - se mueven con el gizmo como cualquier objeto (solo mover).
   API: OONotas.partes(e, o), lista(), marcar(id, estado), abrir(id), tarjetas() (posición en pantalla de cada tarjeta, para pruebas). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, esc = A.esc, tb = A.tipoBase, nv = () => E.nuevos();
  const blob = (id?) => '/_blob/' + String(id).split('/').map(encodeURIComponent).join('/');
  const COL = { hecha: '#2fae5a', foto: '#1f6feb', texto: '#e5484d' };
  const estado = (o?) => (o && o.datos && o.datos.estado === 'hecha') ? 'hecha' : 'pendiente';
  /* pin: palo, cabeza grande y caja invisible para el clic */
  function partes(e?, o?) {
    const c = e.estado === 'hecha' ? COL.hecha : (o && o.fotos && o.fotos.length ? COL.foto : COL.texto);
    return [{ f: 'c', p: [0, 1.1, 0], s: [0.08, 2.2, 0.08], c: '#3a3f45' }, { f: 's', p: [0, 2.35, 0], s: [0.7, 0.7, 0.7], c }, { f: 'b', p: [0, 1.9, 0], s: [1.4, 1.6, 1.4], c, oculta: true }];
  }
  const lista = () => [...nv().values()].filter((o?) => tb(o.tipo) === 'nota');

  /* ---------- tarjetas flotantes ---------- */
  const grupo = new T.Group(); grupo.renderOrder = 55; A.scene.add(grupo);
  const tarj = new Map<any, any>(), imgs = new Map<any, any>();
  function imagen(id?, listo?) { let r = imgs.get(id); if (!r) { r = { im: new Image(), ok: false, cbs: [] }; r.im.onload = () => { r.ok = true; r.cbs.splice(0).forEach((f?) => f()); }; r.im.onerror = () => { r.cbs = []; }; r.im.src = blob(id); imgs.set(id, r); } if (r.ok) return r.im; r.cbs.push(listo); return null; }
  function lineas(g?, txt?, max?, ancho?) { const pal = String(txt || '').replace(/\s+/g, ' ').trim().split(' '), L = []; let l = ''; for (const p of pal) { const t = l ? l + ' ' + p : p; if (g.measureText(t).width > ancho && l) { L.push(l); l = p; if (L.length >= max) break; } else l = t; } if (L.length < max && l) L.push(l); if (L.length === max && pal.join(' ').length > L.join(' ').length) L[max - 1] = L[max - 1].replace(/\s*\S*$/, '') + '…'; return L; }
  function dibujar(t?, o?) {
    const cv = t.cv, g = cv.getContext('2d'), W = cv.width, H = cv.height, hecha = estado(o) === 'hecha', foto = o.fotos && o.fotos[0];
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(20,24,28,.92)'; g.strokeStyle = hecha ? COL.hecha : (foto ? COL.foto : COL.texto); g.lineWidth = 8;
    g.beginPath(); g.roundRect ? g.roundRect(6, 6, W - 12, H - 12, 28) : g.rect(6, 6, W - 12, H - 12); g.fill(); g.stroke();
    let x0 = 30; if (foto) { const im = imagen(foto, () => { dibujar(t, o); t.tex.needsUpdate = true; A.marcar(); }); const s = H - 60; if (im) { const k = Math.max(s / im.width, s / im.height), w = im.width * k, h = im.height * k; g.save(); g.beginPath(); g.rect(30, 30, s, s); g.clip(); g.drawImage(im, 30 + (s - w) / 2, 30 + (s - h) / 2, w, h); g.restore(); } else { g.fillStyle = '#3a4048'; g.fillRect(30, 30, s, s); } x0 = 30 + s + 24; }
    g.fillStyle = hecha ? COL.hecha : '#f0a020'; g.font = '600 30px "IBM Plex Sans", sans-serif'; g.fillText(hecha ? '✔ HECHA' : '● PENDIENTE', x0, 64);
    g.fillStyle = '#f2f4f6'; g.font = '30px "IBM Plex Sans", sans-serif'; lineas(g, o.texto || (foto ? '(foto sin texto)' : '(nota vacía)'), foto ? 5 : 5, W - x0 - 30).forEach((l?, i?) => g.fillText(l, x0, 112 + i * 40));
  }
  function firma(o?) { return JSON.stringify([o.texto, o.fotos, estado(o)]); }
  function actualizar() {
    const vivos = new Set<any>();
    for (const o of lista()) {
      const k = 'n' + o.id; if (!A.verNotas || A.ocultos.has(k) || !(o.partes && o.partes.length)) continue; vivos.add(o.id);
      let t = tarj.get(o.id); if (!t) { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 320; const tex = new T.CanvasTexture(cv); tex.anisotropy = 4; const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.renderOrder = 56; sp.userData.nota = o.id; grupo.add(sp); t = { cv, tex, sp, f: '' }; tarj.set(o.id, t); }
      const f = firma(o); if (f !== t.f) { t.f = f; dibujar(t, o); t.tex.needsUpdate = true; }
      t.sp.position.set(+o.datos.x || 0, (+o.datos.y || 0) + 3.5, +o.datos.z || 0); t.o = o;
    }
    for (const [id, t] of tarj) if (!vivos.has(id)) { grupo.remove(t.sp); t.tex.dispose(); t.sp.material.dispose(); tarj.delete(id); }
    escalar(); A.marcar();
  }
  /* tamaño: 3,2 × 1,6 m de cerca y crece con la distancia para seguir legible; lejos de 300 m no se dibuja */
  function escalar() { const cp = A.cam.position; for (const t of tarj.values()) { const d = cp.distanceTo(t.sp.position), k = Math.min(8, Math.max(1, d / 16)); t.sp.scale.set(3.2 * k, 1.6 * k, 1); t.sp.visible = d < 300 && A.vista !== 'caminar'; } }
  let prog = 0; const programar = () => { if (prog) return; prog = setTimeout(() => { prog = 0; actualizar(); }, 30); };
  ['recompute', 'render', 'vista', 'mapa'].forEach((ev?) => E.on(ev, programar));
  (function bucle() { if (tarj.size) escalar(); requestAnimationFrame(bucle); })();

  /* ---------- clic en una tarjeta ---------- */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function tarjetaBajo(e?) { const r = A.dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); A.cam.updateMatrixWorld(); ray.setFromCamera(ndc, A.cam); ray.camera = A.cam; const h = ray.intersectObjects([...tarj.values()].filter((t?) => t.sp.visible).map((t?) => t.sp), false)[0]; return h ? h.object.userData.nota : null; }
  A.vistaEl.addEventListener('pointerdown', (e?) => {
    if (e.button !== 0 || e.target !== A.dom || A.herramienta !== 'sel' || !tarj.size || (window.OOAsas && OOAsas.arrastrando)) return;
    const id = tarjetaBajo(e); if (!id) return; e.stopImmediatePropagation(); e.preventDefault();
    const k = 'n' + id; if (A.sel.length === 1 && A.sel[0] === k || e.detail >= 2) abrir(id); else { A.seleccionar([k]); if (window.OONotasEditor) OONotasEditor.editar(id, { foco: true, tab: true }); } /* (2.1) primer clic: seleccionar y editar */
  }, true);

  /* ---------- nota en grande ---------- */
  function abrir(id?) {
    const o = nv().get(id); if (!o) return false; const h = estado(o) === 'hecha';
    A.abrirModal(`<div class="cab">Nota <span class="etq ${h ? '' : 'mod'}">${h ? 'hecha' : 'pendiente'}</span></div><div class="cont nota-grande">${(o.fotos || []).map((f?) => `<img class="foto-grande" src="${esc(blob(f))}" alt="Foto de la nota">`).join('')}<p style="white-space:pre-wrap">${esc(o.texto || '(sin texto)')}</p></div>
      <div class="pie"><button data-nt="estado" data-id="${esc(id)}" data-v="${h ? 'pendiente' : 'hecha'}">${h ? 'Marcar pendiente' : 'Marcar hecha'}</button><button data-nt="ir" data-id="${esc(id)}">Ir a la nota</button><button class="prim" data-a="m-no">Cerrar</button></div>`, 'ancho');
    return true;
  }
  function marcar(id?, est?) { const o = nv().get(id); if (!o) return false; const d = A.clon(o.datos); d.estado = est === 'hecha' ? 'hecha' : 'pendiente'; const v = o.datos; o.datos = d; const doc = A.docActualizado(o); o.datos = v; if (!doc) return false; A.guardar([doc], { etiqueta: d.estado === 'hecha' ? 'Nota hecha' : 'Nota pendiente' }); return true; }
  function ir(id?) { const k = 'n' + id; if (!A.existe(k)) return; A.seleccionar([k]); A.encuadrarCaja(A.cajaEntidades([k])); }

  /* ---------- lista en la pestaña Notas ---------- */
  let filtro = 'todas';
  function htmlLista() {
    const L = lista().filter((o?) => filtro === 'todas' || estado(o) === (filtro === 'hechas' ? 'hecha' : 'pendiente')), n = lista(), pend = n.filter((o?) => estado(o) !== 'hecha').length;
    return `<section class="notas-pro"><h3>Notas del mapa <small>${pend} pendientes de ${n.length}</small></h3><div class="seg" role="group">${[['todas', 'Todas'], ['pendientes', 'Pendientes'], ['hechas', 'Hechas']].map(([k, t]) => `<button data-nt="filtro" data-v="${k}" class="${filtro === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <ul class="lista notas-lista">${L.map((o?) => { const h = estado(o) === 'hecha', ed = window.OONotasEditor && OONotasEditor.editando === o.id; /* (2.1) botones claros: Editar, Ir a, Hecha o Pendiente y Borrar */
        return `<li class="nota-item${h ? ' hecha' : ''}${ed ? ' activa' : ''}"><button class="ne-cuerpo" data-ne="editar" data-id="${esc(o.id)}" title="Editar esta nota">${o.fotos && o.fotos[0] ? `<img src="${esc(blob(o.fotos[0]))}" alt="" loading="lazy">` : '<span class="sin-foto"></span>'}<span>${esc((o.texto || '(nota vacía: clic para escribir)').slice(0, 90))}</span></button>
          <div class="ne-acc"><button data-ne="editar" data-id="${esc(o.id)}">Editar</button><button data-nt="ir" data-id="${esc(o.id)}">Ir a</button><button data-nt="estado" data-id="${esc(o.id)}" data-v="${h ? 'pendiente' : 'hecha'}" class="${h ? 'on' : ''}" title="${h ? 'Volver a pendiente' : 'Marcar como hecha'}">${h ? '✔ Hecha' : 'Pendiente'}</button><button data-ne="borrar" data-id="${esc(o.id)}" class="peligro" title="Borrar la nota">Borrar</button></div></li>`; }).join('') || '<li class="vacio">No hay notas con este filtro.</li>'}</ul></section>`;
  }
  function pintarLista() { const el = document.getElementById('listaNotas'); if (!el) return; const p = el.querySelector('.notas-pro'); if (p) p.remove(); el.insertAdjacentHTML('afterbegin', htmlLista()); }
  E.on('tab', (t?) => { if (t === 'notas') pintarLista(); });
  E.on('recompute', () => { const p = document.querySelector('[data-panel="notas"]'); if (p && !p.hidden) pintarLista(); });

  /* ---------- inspector ---------- */
  E.on('panel', () => {
    if (A.herramienta !== 'sel' || A.sel.length !== 1 || A.sel[0][0] !== 'n') return; const o = nv().get(A.sel[0].slice(1)); if (!o || tb(o.tipo) !== 'nota') return;
    const c = document.querySelector('#objCuerpo [data-scope="sel"]'); if (!c) return; const h = estado(o) === 'hecha', div = document.createElement('div');
    div.innerHTML = `<details class="sec" open data-sec="nota-estado"><summary>Estado de la nota</summary><div class="fila"><div class="seg" role="group"><button data-nt="estado" data-id="${esc(o.id)}" data-v="pendiente" class="${h ? '' : 'on'}">Pendiente</button><button data-nt="estado" data-id="${esc(o.id)}" data-v="hecha" class="${h ? 'on' : ''}">Hecha</button></div><button data-nt="abrir" data-id="${esc(o.id)}">Ver en grande</button></div></details>`;
    const ref = c.querySelector('[data-sec="transform"]'); const sec = div.firstElementChild; if (ref && ref.nextSibling) c.insertBefore(sec, ref.nextSibling); else c.prepend(sec);
  });
  document.addEventListener('click', (e?) => {
    const b = e.target.closest && e.target.closest('[data-nt]'); if (!b || b.type === 'checkbox') return; const a = b.dataset.nt, id = b.dataset.id;
    if (a === 'filtro') { filtro = b.dataset.v; pintarLista(); }
    if (a === 'estado') { marcar(id, b.dataset.v); if (b.closest('.modal')) A.cerrarModal(null); }
    if (a === 'ir') { if (b.closest('.modal')) A.cerrarModal(null); ir(id); }
    if (a === 'abrir') abrir(id);
  });
  document.addEventListener('change', (e?) => { const el = e.target; if (el.dataset && el.dataset.nt === 'hecha') marcar(el.dataset.id, el.checked ? 'hecha' : 'pendiente'); });

  window.OONotas = { partes, lista, marcar, abrir, estado, actualizar, pintarLista: () => { const p = document.querySelector('[data-panel="notas"]'); if (p && !p.hidden) pintarLista(); },tarjetas: () => [...tarj.entries()].map(([id, t]) => ({ id, pos: t.sp.position.toArray(), visible: t.sp.visible, escala: t.sp.scale.x })) };
})();
