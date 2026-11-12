/* Editor del mapa (2.1): primera persona («Caminar») para revisar interiores.
   editor.js deja en moverAndar() el gancho OOCaminar.mover(dt); el resto (teclas, ratón, interfaz) vive aquí.
   - Colisión con paredes y objetos (rayos a la altura de rodilla, pecho y ojos contra las mismas cajas que se eligen con el ratón),
     se desliza a lo largo de la pared. «Atravesar paredes» (G) vuelve al vuelo libre de antes (Espacio sube, C o Ctrl baja).
   - Gravedad, suelo y escalones de hasta 50 cm: ojos a 1,65 m del suelo; agacharse con Ctrl o C (ojos a 1,0 m); Espacio salta.
   - Puertas (las del mapa, grupo «puerta:…», y las puestas en el editor): E o clic las abre o las cierra (la hoja gira 90° sobre la
     bisagra, hacia el lado contrario al jugador) y empujarlas un momento las abre solas. Una puerta abierta no choca.
   - Techos: al entrar bajo un techo o techo falso se corta la vista justo por debajo (T lo apaga); al salir vuelve el corte de antes.
   - Velocidad con la rueda o + / −, correr con Mayús, linterna (F), campo de visión ([ ] o el deslizador).
   - Punto de mira con el nombre de lo que se mira; clic = elegirlo y verlo en el inspector sin salir; Tab o Esc sueltan el ratón.
   - «Teletransportarse aquí» en el menú del clic derecho (3D y planta): entra en primera persona en ese punto mirando hacia donde
     miraba la cámara. N pone una nota donde se mira.
   - Minimapa con la posición y ayuda de teclas plegable.
   API (pruebas): OOCaminar.mover(dt), estado(), teletransportar(p, yaw), usar(), puertaDe(key), alternarPuerta(key), abierta(key),
   ponerAtravesar(v), ponerLinterna(v), ponerTechos(v), notaAqui(), mirando(). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E) return;
  const A = E.api, T = A.THREE, V3 = T.Vector3, esc = A.esc, tb = A.tipoBase, nv = () => E.nuevos(), DEG = Math.PI / 180;
  const camP = A.camP, andar = A.andar; if (!andar) return;
  const leer = (k?) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const st = Object.assign({ vel: 4, fov: 75, atravesar: false, techos: true, ayuda: false }, leer('oo-caminar') || {});
  const guardarSt = () => { try { localStorage.setItem('oo-caminar', JSON.stringify({ vel: st.vel, fov: st.fov, atravesar: st.atravesar, techos: st.techos, ayuda: st.ayuda })); } catch (e) { } };
  const OJOS = 1.65, OJOS_AG = 1.0, RADIO = 0.3, PASO = 0.5, GRAV = 20, ALCANCE = 3.5;
  const ABAJO = new V3(0, -1, 0), ARRIBA = new V3(0, 1, 0);
  const j: any = { pies: 0, vy: 0, alto: OJOS, ctrl: false, enSuelo: true, fovAntes: null, corteAntes: null, corte: null, cajaTecho: null, empuje: null, tEmp: 0, mira: null, tMira: 0, tTecho: 0, linterna: false, activo: false };

  /* ---------- rayos (las cajas de elegir del editor: A.pickRayo) ---------- */
  const rc = new T.Raycaster();
  function rayo(o?, d?, max?, opts?) { rc.set(o, d); rc.near = 0; rc.far = max; const h = A.pickRayo(rc, opts); return h && h.t <= max ? h : null; }
  let excl = null; const sucioExcl = () => { excl = null; };
  function excluidos() {
    if (excl) return excl; excl = new Set<any>();
    for (const o of nv().values()) if (tb(o.tipo) === 'nota' || tb(o.tipo) === 'luz') excl.add('n' + o.id);
    for (const a of abiertas.values()) for (const k of a.p.keys) excl.add(k);
    return excl;
  }
  E.on('recompute', sucioExcl); E.on('mapa', () => { sucioExcl(); puertasOrig = null; abiertas.clear(); });

  /* ---------- puertas ---------- */
  let puertasOrig = null; const abiertas = new Map<any, any>();
  function indexar() {
    puertasOrig = new Map<any, any>(); const D = A.D, P = A.P; if (!D || !P) return;
    const por = new Map<any, any>();
    for (let i = 0; i < P.length; i++) { const z = P[i]; if (!z || z.grp < 0) continue; const n = D.grupos[z.grp] || ''; if (!/^puerta:/.test(n)) continue; let g = por.get(z.grp); if (!g) por.set(z.grp, g = { id: 'g' + z.grp, nombre: 'Puerta ' + n.slice(7).replace(/_/g, ' '), idx: [] }); g.idx.push(i); }
    for (const g of por.values()) {
      g.keys = new Set<any>(g.idx.map((i?) => 'p' + i));
      /* el marco (malla real cuya caja tapa todo el vano) y lo demás del objeto automático de la puerta (huecos.js) van con ella */
      const extra = new Set<any>(); for (const k of g.keys) { const a = A.autoActivo && A.autoActivo(k); if (a && a.keys) a.keys.forEach((x?) => extra.add(x)); }
      for (const k of extra) { if (g.keys.has(k) || k[0] !== 'p') continue; const z = P[+k.slice(1)]; if (z && Math.max(z.s.x, z.s.z) <= 3 && z.s.y <= 3.5) g.keys.add(k); }
      for (const k of g.keys) if (!puertasOrig.has(k)) puertasOrig.set(k, g);
    }
  }
  function puertaDe(key?) {
    if (!key) return null;
    if (key[0] === 'p') { if (!puertasOrig) indexar(); return puertasOrig.get(key) || null; }
    if (key[0] === 'n') { const o = nv().get(key.slice(1)); if (o && tb(o.tipo) === 'puerta') return { id: key, nombre: A.nombreTipo(o.tipo), o, keys: new Set<any>([key]) }; }
    return null;
  }
  const _m = new T.Matrix4(), _mb = new T.Matrix4(), _mr = new T.Matrix4(), _t1 = new T.Matrix4(), _t2 = new T.Matrix4(), _inv = new T.Matrix4();
  /* bisagra y centro de la hoja de una puerta, en el mundo */
  function geometriaPuerta(p?) {
    if (p.o) { const d = p.o.datos, w = +d.sx || 0.9, g = (+d.sz || 0.2) + 0.03, gy = (+d.giroY || 0) * DEG; const bis = new V3(-w / 2, 0, g / 2).applyAxisAngle(ARRIBA, gy).add(new V3(+d.x, +d.y || 0, +d.z)); const cen = new V3(0, 0, g / 2).applyAxisAngle(ARRIBA, gy).add(new V3(+d.x, +d.y || 0, +d.z)); return { bis, cen }; }
    const P = A.P; let t7 = p.idx.find((i?) => P[i].t === 7), big = p.idx[0]; for (const i of p.idx) if (P[i].s.x * P[i].s.y > P[big].s.x * P[big].s.y) big = i;
    const cen = P[big].p.clone();
    const bis = t7 != null ? P[t7].p.clone() : new V3(-P[big].s.x / 2, 0, 0).applyQuaternion(P[big].q).add(P[big].p);
    return { bis, cen };
  }
  /* matrices cerradas → abiertas: la hoja gira «ang» sobre la vertical de la bisagra */
  function aplicarPuerta(a?) {
    const M = A.M, P = A.P; const { bis } = a.g;
    _t1.makeTranslation(bis.x, 0, bis.z); _t2.makeTranslation(-bis.x, 0, -bis.z); _mr.makeRotationY(a.ang).premultiply(_t1).multiply(_t2);
    const toca = new Set<any>();
    const poner = (mesh?, slot?, base?) => { mesh.getMatrixAt(slot, _m); if (Math.abs(_m.determinant()) < 1e-12) return; _m.copy(base).premultiply(_mr); mesh.setMatrixAt(slot, _m); toca.add(mesh); };
    if (a.p.o) {
      const o = a.p.o; const inst = (o.partes || []).filter((pt?) => pt.f !== 't' && pt.f !== 'poly');
      (o.slots || []).forEach((sl?, k?) => { if (k < 3 || !inst[k] || !M[sl[0]]) return; poner(M[sl[0]].mesh, sl[1], inst[k].m); }); /* las 3 primeras: el marco */
    } else for (const i of a.p.idx) {
      const z = P[i]; if (!z || z.slot < 0 || !M[z.mesh]) continue;
      A.matrizPieza(i, _mb); poner(M[z.mesh].mesh, z.slot, _mb);
      const r = z.real; if (r && r.lote && r.lote.mesh) { let base = r.w0; if (!(z.p.equals(z.b.p) && z.q.equals(z.b.q) && z.s.equals(z.b.s))) { _inv.compose(z.b.p, z.b.q, z.b.s).invert(); base = _mb.compose(z.p, z.q, z.s).multiply(_inv).multiply(r.w0); } poner(r.lote.mesh, r.slot, base); }
    }
    for (const m of toca) m.instanceMatrix.needsUpdate = true;
  }
  function reaplicar() { for (const a of abiertas.values()) aplicarPuerta(a); if (abiertas.size) A.marcar(); }
  E.on('render', () => setTimeout(reaplicar, 0)); E.on('seleccion', () => setTimeout(reaplicar, 0));
  function alternarPuerta(key?, abrir?) {
    const p = puertaDe(key); if (!p) return false; const a0 = abiertas.get(p.id);
    if (abrir == null) abrir = !a0 || a0.obj === 0;
    const g = geometriaPuerta(p);
    let obj = 0;
    if (abrir) { /* hacia el lado contrario al jugador */ const yo = camP.position, c = g.cen.clone().sub(g.bis); const lado = (s?) => c.clone().applyAxisAngle(ARRIBA, s * Math.PI / 2).add(g.bis).distanceToSquared(yo); obj = lado(1) >= lado(-1) ? Math.PI / 2 : -Math.PI / 2; }
    const a = a0 || { p, g, ang: 0, obj: 0 }; a.p = p; a.g = g; a.obj = obj; abiertas.set(p.id, a); sucioExcl();
    if (!abrir && a.ang === 0) abiertas.delete(p.id);
    A.pista((abrir ? 'Abierta: ' : 'Cerrada: ') + p.nombre + '.'); A.marcar(); return true;
  }
  function animarPuertas(dt?) {
    let mov = false;
    for (const [id, a] of abiertas) { if (a.ang === a.obj) continue; const v = 5 * dt; a.ang = Math.abs(a.obj - a.ang) <= v ? a.obj : a.ang + Math.sign(a.obj - a.ang) * v; aplicarPuerta(a); mov = true; if (a.ang === 0 && a.obj === 0) { abiertas.delete(id); sucioExcl(); } }
    return mov;
  }
  const abierta = (key?) => { const p = puertaDe(key); return !!(p && abiertas.has(p.id) && abiertas.get(p.id).obj !== 0); };

  /* ---------- movimiento ---------- */
  function choque(d?, L?) {
    const p = camP.position; let mejor = null;
    for (const y of [j.pies + PASO - 0.05, j.pies + 1.0, p.y - 0.05]) { if (y > p.y + 0.001) continue; const h = rayo(new V3(p.x, y, p.z), d, L, { todo: true, excluir: excluidos() }); if (h && (!mejor || h.t < mejor.t)) mejor = h; }
    return mejor;
  }
  function intentar(dx?, dz?) {
    const L = Math.hypot(dx, dz); if (L < 1e-7) return true;
    const h = choque(new V3(dx / L, 0, dz / L), L + RADIO); if (!h) { camP.position.x += dx; camP.position.z += dz; return true; }
    return h;
  }
  function empujar(h?, dt?) {
    const p = h && puertaDe(h.key); if (!p || abiertas.has(p.id)) { j.empuje = null; j.tEmp = 0; return; }
    if (j.empuje !== p.id) { j.empuje = p.id; j.tEmp = 0; } j.tEmp += dt;
    if (j.tEmp > 0.25) { alternarPuerta(h.key, true); j.empuje = null; j.tEmp = 0; }
  }
  function suelo() { const p = camP.position, o = new V3(p.x, j.pies + PASO, p.z); const h = rayo(o, ABAJO, 400, { todo: true, excluir: excluidos() }); return h ? o.y - h.t : null; }
  function mover(dt?) {
    const K = andar.teclas; dt = Math.min(dt, 0.1);
    const ag = (j.ctrl || K.has('KeyC')) && !st.atravesar, corre = K.has('ShiftLeft') || K.has('ShiftRight');
    const sp = st.vel * (corre ? 2.5 : 1) * (ag ? 0.45 : 1);
    const f = new V3(-Math.sin(andar.yaw), 0, -Math.cos(andar.yaw)), r = new V3(Math.cos(andar.yaw), 0, -Math.sin(andar.yaw)), d = new V3();
    if (K.has('KeyW') || K.has('ArrowUp')) d.add(f); if (K.has('KeyS') || K.has('ArrowDown')) d.sub(f);
    if (K.has('KeyD') || K.has('ArrowRight')) d.add(r); if (K.has('KeyA') || K.has('ArrowLeft')) d.sub(r);
    let mov = false; const p = camP.position, y0 = p.y;
    if (st.atravesar) {
      if (K.has('Space')) d.y += 1; if (K.has('KeyC') || j.ctrl) d.y -= 1;
      if (d.lengthSq() > 0) { d.normalize().multiplyScalar(sp * dt); p.add(d); mov = true; }
      j.pies = p.y - j.alto; j.vy = 0;
    } else {
      if (d.lengthSq() > 0) {
        d.normalize().multiplyScalar(sp * dt);
        const x0 = p.x, z0 = p.z; const h = intentar(d.x, d.z);
        if (h !== true) { empujar(h, dt); intentar(d.x, 0); intentar(0, d.z); } else { j.empuje = null; j.tEmp = 0; }
        if (p.x !== x0 || p.z !== z0) mov = true;
      } else { j.empuje = null; j.tEmp = 0; }
      if (K.has('Space') && j.enSuelo) { j.vy = 4.6; j.enSuelo = false; }
      const fy = suelo(), piso = fy == null ? Math.min(0, j.pies) : fy;
      if (j.vy > 0 || j.pies > piso + 0.001) { j.vy -= GRAV * dt; j.pies += j.vy * dt; if (j.pies <= piso) { j.pies = piso; j.vy = 0; j.enSuelo = true; } else j.enSuelo = false; }
      else { j.pies = piso; j.vy = 0; j.enSuelo = true; }
      const obj = ag ? OJOS_AG : OJOS; if (Math.abs(obj - j.alto) > 1e-3) j.alto += (obj - j.alto) * Math.min(1, dt * 12); else j.alto = obj;
      p.y = j.pies + j.alto; if (Math.abs(p.y - y0) > 1e-5) mov = true;
    }
    if (animarPuertas(dt)) mov = true;
    if (j.linterna && luz) { luz.position.copy(p); luz.target.position.copy(p).add(new V3(0, 0, -1).applyQuaternion(camP.quaternion)); }
    if (mov || andar.cambio) { camP.quaternion.setFromEuler(new T.Euler(andar.pitch, andar.yaw, 0, 'YXZ')); andar.cambio = false; if (j.linterna && luz) luz.target.position.copy(p).add(new V3(0, 0, -1).applyQuaternion(camP.quaternion)); j.tMira = 0; mov = true; }
    const t = performance.now(); if (t - j.tMira > 120) { j.tMira = t; actualizarMira(); }
    if (st.techos && (t - j.tTecho > 150 || !j.pTecho || j.pTecho.distanceToSquared(p) > 0.5)) { j.tTecho = t; j.pTecho = p.clone(); revisarTecho(); } /* cada 150 ms o cada ~70 cm */
    return mov;
  }

  /* ---------- techos: corte justo bajo el techo que hay encima ---------- */
  function revisarTecho() {
    const p = camP.position;
    if (j.cajaTecho) { const b = j.cajaTecho; if (p.x > b.min.x - 0.2 && p.x < b.max.x + 0.2 && p.z > b.min.z - 0.2 && p.z < b.max.z + 0.2 && p.y < j.corte + 0.3) return; quitarTecho(); }
    const c0 = A.clip.constant; A.clip.constant = 1000; /* el rayo también ve lo que ya está cortado */
    let h = null; try { h = rayo(new V3(p.x, p.y, p.z), ARRIBA, 10, { todo: true, excluir: excluidos() }); } finally { A.clip.constant = c0; }
    if (!h || h.malla === 'sph' || /^cyl/.test(h.malla) || h.normal.y > -0.5) return;
    const k = h.key; if (k[0] === 'n') { const o = nv().get(k.slice(1)); if (o && ['arbol', 'poste', 'luz'].includes(tb(o.tipo))) return; }
    const b = A.cajaEntidades([k]); if (b.isEmpty()) return; const sz = b.getSize(new V3()); if (Math.min(sz.x, sz.z) < 1.5) return;
    const corte = Math.round((p.y + h.t - 0.06) * 100) / 100; if (corte <= p.y + 0.05) return;
    if (j.corte == null) j.corteAntes = A.corte;
    if (j.corteAntes != null && j.corteAntes <= corte) return; /* ya había un corte más bajo puesto a mano */
    j.corte = corte; j.cajaTecho = b; A.ponerCorte(corte); estadoHud();
  }
  function quitarTecho() { if (j.corte == null) return; const antes = j.corteAntes; j.corte = null; j.cajaTecho = null; j.corteAntes = null; A.ponerCorte(antes); estadoHud(); }

  /* ---------- linterna ---------- */
  let luz = null;
  function ponerLinterna(v?) {
    j.linterna = v == null ? !j.linterna : !!v;
    if (j.linterna && !luz) { luz = new T.SpotLight(0xfff3dd, 0, 40, 0.6, 0.45, 1.1); A.scene.add(luz); A.scene.add(luz.target); }
    if (luz) { luz.intensity = j.linterna ? 1.8 : 0; luz.position.copy(camP.position); luz.target.position.copy(camP.position).add(new V3(0, 0, -1).applyQuaternion(camP.quaternion)); }
    estadoHud(); A.marcar(); return j.linterna;
  }

  /* ---------- punto de mira ---------- */
  const ndc0 = new T.Vector2(0, 0);
  function actualizarMira() {
    camP.updateMatrixWorld(); rc.setFromCamera(ndc0, camP); rc.near = 0; rc.far = 400;
    const h = A.pickRayo(rc, { excluir: null }); j.mira = h;
    const el = hud && hud.mira; if (!el) return;
    if (!h) { el.hidden = true; return; }
    const keys = A.expandirGrupos([h.key]); const pu = puertaDe(h.key); let n = pu ? pu.nombre : (A.nombreEntidades(keys) || '');
    if (h.key[0] === 'n') { const o = nv().get(h.key.slice(1)); if (o && tb(o.tipo) === 'nota') n = 'Nota: ' + (o.texto || '(vacía)').slice(0, 40); }
    let extra = ''; if (pu && h.t <= ALCANCE) extra = abierta(h.key) ? ' · E cierra' : ' · E abre';
    el.innerHTML = `<b>${esc(n || 'Objeto')}</b> <small>${A.fmt(h.t, 1)} m${esc(extra)}</small>`; el.hidden = false;
  }
  function elegirMirado() {
    const h = j.mira; if (!h) { A.seleccionar([]); return; }
    const pu = puertaDe(h.key); if (pu && h.t <= ALCANCE) alternarPuerta(h.key);
    if (A.seleccionable(h.key)) { A.seleccionar(A.expandirGrupos([h.key])); A.pista('Elegido: ' + (pu ? pu.nombre : A.nombreEntidades(A.sel)) + '. Tab suelta el ratón para tocar el inspector.'); }
    if (h.key[0] === 'n' && window.OONotasEditor) { const o = nv().get(h.key.slice(1)); if (o && tb(o.tipo) === 'nota') OONotasEditor.editar(o.id, { tab: true }); }
  }
  function usar() {
    const h = j.mira; if (h && h.t <= ALCANCE && puertaDe(h.key)) return alternarPuerta(h.key);
    /* sin apuntar: la puerta más cercana a menos de 2 m */
    const p = camP.position; let mejor = null, dm = 4;
    if (!puertasOrig) indexar();
    const vistas = new Set<any>(); for (const pu of puertasOrig.values()) { if (vistas.has(pu.id)) continue; vistas.add(pu.id); const g = geometriaPuerta(pu), c = g.cen; const dd = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (dd < dm && Math.abs(c.y + 1 - j.pies - 1) < 2.5) { dm = dd; mejor = [...pu.keys][0]; } }
    for (const o of nv().values()) if (tb(o.tipo) === 'puerta') { const dd = (o.datos.x - p.x) ** 2 + (o.datos.z - p.z) ** 2; if (dd < dm) { dm = dd; mejor = 'n' + o.id; } }
    if (mejor) return alternarPuerta(mejor);
    A.pista('No hay ninguna puerta a mano: apunta a una con el punto de mira.'); return false;
  }
  function notaAqui() {
    const h = j.mira; const dir = new V3(); camP.getWorldDirection(dir);
    let p = h ? h.point.clone() : camP.position.clone().addScaledVector(dir, 3);
    if (!h || h.normal.y < 0.6) { p.addScaledVector(new V3(dir.x, 0, dir.z).normalize(), -0.4); p.y = j.pies; }
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
    const id = A.crearNuevo('nota', { x: A.r3(p.x), y: A.r3(p.y), z: A.r3(p.z), giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 });
    if (id) A.seleccionar(['n' + id]); return id;
  }

  /* ---------- entrar, salir y teletransportarse ---------- */
  function entrar() {
    j.activo = true; j.vy = 0; j.alto = OJOS; j.corte = null; j.cajaTecho = null; j.corteAntes = null;
    const p = camP.position; const o = new V3(p.x, p.y + 0.3, p.z); const h = rayo(o, ABAJO, 60, { todo: true, excluir: excluidos() });
    j.pies = h ? o.y - h.t : Math.max(0, p.y - 1.7); p.y = j.pies + OJOS;
    j.fovAntes = camP.fov; camP.fov = st.fov; camP.updateProjectionMatrix();
    if (A.AJ && !A.AJ.minimapa) { j.mmAntes = false; A.AJ.minimapa = true; A.aplicarAjustes(); } else j.mmAntes = null;
    mostrarHud(true); andar.cambio = true; A.marcar();
  }
  function salir() {
    if (!j.activo) return; j.activo = false; quitarTecho(); if (j.linterna) ponerLinterna(false); j.ctrl = false; for (const x of abiertas.values()) { x.ang = 0; aplicarPuerta(x); } abiertas.clear(); sucioExcl(); /* fuera de la primera persona las puertas vuelven a como están en el mapa */
    if (j.fovAntes) { camP.fov = j.fovAntes; camP.updateProjectionMatrix(); }
    if (j.mmAntes === false) { A.AJ.minimapa = false; A.aplicarAjustes(); } j.mmAntes = null;
    mostrarHud(false); A.marcar();
  }
  E.on('vista', (v?) => { if (v === 'caminar' && !j.activo) entrar(); else if (v !== 'caminar' && j.activo) salir(); });
  function teletransportar(p?, yaw?) {
    if (A.vista !== 'caminar') A.ponerVista('caminar');
    j.pies = p.y; j.vy = 0; j.alto = OJOS; camP.position.set(p.x, p.y + OJOS, p.z);
    if (yaw != null) andar.yaw = yaw; andar.pitch = 0; andar.cambio = true; quitarTecho(); j.tTecho = 0; j.pTecho = null; A.marcar();
    A.pista('En primera persona. Clic en la vista para mirar con el ratón; Esc sale.');
  }
  function teleDesde(ev?) {
    const cam = A.cam; let h = A.pickEvento(ev), p = null;
    if (h && h.normal.y > 0.6) p = h.point.clone();
    else if (h) { const r = A.rayDe(ev).ray.direction.clone(); p = h.point.clone().addScaledVector(new V3(r.x, 0, r.z).normalize(), -0.45); const o = new V3(p.x, p.y + 0.2, p.z); const hs = rayo(o, ABAJO, 60, { todo: true, excluir: excluidos() }); p.y = hs ? o.y - hs.t : 0; }
    else p = A.puntoPlano(ev, 0); /* sin nada debajo: al suelo (no al plano de la planta activa, que puede estar en el aire) */
    if (!p) return false;
    let f; if (A.vista === 'planta') f = new V3(0, 1, 0).applyQuaternion(cam.quaternion); else { f = new V3(); cam.getWorldDirection(f); }
    f.y = 0; const yaw = f.lengthSq() > 1e-6 ? Math.atan2(-f.x, -f.z) : andar.yaw;
    teletransportar(p, yaw); return true;
  }
  /* menú del clic derecho: «Teletransportarse aquí» */
  const menu = document.getElementById('menuCtx'); let evMenu = null;
  A.dom.addEventListener('pointerup', (e?) => {
    if (e.button !== 2 || A.vista === 'caminar' || !menu || menu.hidden || menu.querySelector('[data-cam="tele"]')) return;
    evMenu = { clientX: e.clientX, clientY: e.clientY };
    menu.insertAdjacentHTML('beforeend', '<hr><button role="menuitem" data-cam="tele">Teletransportarse aquí (1.ª persona)<kbd>5</kbd></button>');
    const r = menu.getBoundingClientRect(); if (r.bottom > innerHeight - 6) menu.style.top = Math.max(6, innerHeight - r.height - 6) + 'px';
  });

  /* ---------- interfaz: panel, mira, minimapa y ayuda ---------- */
  let hud = null;
  function crearHud() {
    const v = A.vistaEl; const div = document.createElement('div'); div.id = 'caminarHud'; div.className = 'flot cam-hud'; div.hidden = true;
    div.innerHTML = `<div class="cam-fila"><b>Primera persona</b><span id="camModo"></span><span id="camVel" title="Rueda o + / −"></span><button data-cam="salir" title="Volver a la vista 3D (Esc)">Salir</button></div>
      <div class="cam-fila chips"><button data-cam="atravesar" title="Atravesar paredes (G)">Atravesar paredes <kbd>G</kbd></button><button data-cam="linterna" title="Linterna (F)">Linterna <kbd>F</kbd></button><button data-cam="techos" title="Ocultar el techo de encima al entrar (T)">Ocultar techos <kbd>T</kbd></button></div>
      <label class="cam-fov">Campo de visión <input type="range" min="40" max="110" step="1" data-cam="fov" aria-label="Campo de visión"><output id="camFov"></output></label>
      <details class="cam-ayuda"${st.ayuda ? ' open' : ''}><summary>Teclas</summary><ul>
        <li><kbd>W A S D</kbd> andar · <kbd>Mayús</kbd> correr · <kbd>Espacio</kbd> saltar</li>
        <li><kbd>Rueda</kbd> o <kbd>+</kbd> <kbd>−</kbd> velocidad · <kbd>[</kbd> <kbd>]</kbd> campo de visión</li>
        <li><kbd>Ctrl</kbd> o <kbd>C</kbd> agacharse (bajar si atraviesas)</li>
        <li><kbd>E</kbd> o clic: abrir o cerrar la puerta (empujarla también la abre)</li>
        <li><kbd>Clic</kbd> elegir lo que miras (sale en el inspector)</li>
        <li><kbd>G</kbd> atravesar paredes · <kbd>F</kbd> linterna · <kbd>T</kbd> techos · <kbd>N</kbd> nota aquí</li>
        <li><kbd>Tab</kbd> o <kbd>Esc</kbd> soltar el ratón · <kbd>Esc</kbd> otra vez: salir</li></ul></details>`;
    v.appendChild(div);
    const mira = document.createElement('div'); mira.id = 'caminarMira'; mira.className = 'cam-mira'; mira.hidden = true; v.appendChild(mira);
    const mm = document.createElement('canvas'); mm.id = 'caminarMapa'; mm.className = 'cam-mapa'; mm.width = 200; mm.height = 200; mm.hidden = true; mm.title = 'Minimapa: tu posición'; v.appendChild(mm);
    div.querySelector('.cam-ayuda').addEventListener('toggle', (e?) => { st.ayuda = e.target.open; guardarSt(); });
    div.querySelector('[data-cam="fov"]').addEventListener('input', (e?) => ponerFov(+e.target.value));
    hud = { div, mira, mm }; estadoHud();
  }
  function estadoHud() {
    if (!hud) return; const q = (s?) => hud.div.querySelector(s);
    q('#camModo').textContent = st.atravesar ? 'Volando (atraviesa paredes)' : (j.ctrl ? 'Agachado' : 'Andando');
    q('#camVel').textContent = A.fmt(st.vel, 1) + ' m/s';
    q('[data-cam="atravesar"]').classList.toggle('on', st.atravesar); q('[data-cam="linterna"]').classList.toggle('on', j.linterna); q('[data-cam="techos"]').classList.toggle('on', st.techos);
    q('[data-cam="techos"]').title = st.techos ? (j.corte != null ? 'Techo oculto por encima de ' + A.fmt(j.corte, 2) + ' m (T)' : 'Ocultar el techo de encima al entrar (T)') : 'Los techos se ven (T para ocultarlos)';
    q('[data-cam="fov"]').value = st.fov; q('#camFov').textContent = Math.round(st.fov) + '°';
  }
  function mostrarHud(v?) { if (!hud) crearHud(); hud.div.hidden = !v; hud.mm.hidden = !v; if (!v) hud.mira.hidden = true; estadoHud(); }
  function ponerFov(v?) { st.fov = Math.max(40, Math.min(110, v)); if (A.vista === 'caminar') { camP.fov = st.fov; camP.updateProjectionMatrix(); A.marcar(); } guardarSt(); estadoHud(); }
  function ponerVel(v?) { st.vel = Math.max(0.5, Math.min(40, Math.round(v * 10) / 10)); guardarSt(); estadoHud(); A.pista('Velocidad: ' + A.fmt(st.vel, 1) + ' m/s'); }
  function ponerAtravesar(v?) { st.atravesar = v == null ? !st.atravesar : !!v; j.vy = 0; guardarSt(); estadoHud(); A.pista(st.atravesar ? 'Atravesar paredes: sí (vuelo libre; Espacio sube, C baja).' : 'Atravesar paredes: no (chocas con paredes y objetos).'); return st.atravesar; }
  function ponerTechos(v?) { st.techos = v == null ? !st.techos : !!v; if (!st.techos) quitarTecho(); else { j.tTecho = 0; revisarTecho(); } guardarSt(); estadoHud(); return st.techos; }
  (function bucle() { requestAnimationFrame(bucle); if (!j.activo || !hud) return; const t = performance.now(); if (t - (hud.tMapa || 0) < 150) return; hud.tMapa = t; const src = document.getElementById('minimapa'); if (!src || !src.width) return; const g = hud.mm.getContext('2d');
    /* recorte de ~140 m alrededor del jugador (misma escala que el minimapa del editor: 340 px para el lado mayor del mapa) */
    const L = A.limitesMapa, w = L.max.x - L.min.x, h = L.max.z - L.min.z, e = 340 / Math.max(w, h), ox = (340 - w * e) / 2, oz = (340 - h * e) / 2, p = camP.position;
    const px = ox + (p.x - L.min.x) * e, pz = oz + (p.z - L.min.z) * e, s = 70 * e;
    g.fillStyle = '#5c7d45'; g.fillRect(0, 0, 200, 200); g.drawImage(src, px - s, pz - s, 2 * s, 2 * s, 0, 0, 200, 200);
    const f = new V3(); camP.getWorldDirection(f); const a = Math.atan2(f.z, f.x);
    g.save(); g.translate(100, 100); g.fillStyle = 'rgba(255,122,0,.35)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 30, a - 0.5, a + 0.5); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fillStyle = '#ff7a00'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); g.restore();
    g.fillStyle = '#fff'; g.font = '600 12px sans-serif'; g.fillText('N', 94, 14); })();

  /* ---------- entrada ---------- */
  const enCampo = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  document.addEventListener('keydown', (e?) => {
    if (A.vista !== 'caminar' || enCampo() || !document.getElementById('modal').hidden) return;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') { j.ctrl = true; estadoHud(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase(); let hecho = true;
    if (e.code === 'KeyE') usar();
    else if (e.code === 'KeyG') ponerAtravesar();
    else if (e.code === 'KeyF') ponerLinterna();
    else if (e.code === 'KeyT') ponerTechos();
    else if (e.code === 'KeyN') notaAqui();
    else if (e.key === 'Tab') { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (er) { } A.pista('Ratón suelto: usa los paneles. Clic en la vista para volver a mirar.'); }
    else if (e.key === '+' || e.code === 'NumpadAdd' || (k === '=' && !e.shiftKey)) ponerVel(st.vel * 1.25);
    else if (e.key === '-' || e.code === 'NumpadSubtract') ponerVel(st.vel / 1.25);
    else if (e.key === '[') ponerFov(st.fov - 5);
    else if (e.key === ']') ponerFov(st.fov + 5);
    else hecho = false;
    if (hecho) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', (e?) => { if (e.code === 'ControlLeft' || e.code === 'ControlRight') { j.ctrl = false; estadoHud(); } }, true);
  window.addEventListener('blur', () => { j.ctrl = false; });
  window.addEventListener('wheel', (e?) => {
    if (A.vista !== 'caminar' || !A.vistaEl.contains(e.target) || (hud && hud.div.contains(e.target))) return;
    e.preventDefault(); e.stopImmediatePropagation(); ponerVel(st.vel * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { capture: true, passive: false });
  /* clic con el ratón capturado (o sin captura, sin arrastrar): elegir lo que se mira */
  let abajo = null;
  A.vistaEl.addEventListener('pointerdown', (e?) => { if (A.vista !== 'caminar' || e.target !== A.dom || e.button !== 0) return; abajo = { x: e.clientX, y: e.clientY, lock: andar.lock || andar.sinLock }; }, true);
  A.vistaEl.addEventListener('pointerup', (e?) => { if (A.vista !== 'caminar' || e.button !== 0 || !abajo) return; const a = abajo; abajo = null; if (!a.lock) return; if (!andar.lock && Math.hypot(e.clientX - a.x, e.clientY - a.y) > 4) return; actualizarMira(); elegirMirado(); }, true);
  document.addEventListener('click', (e?) => {
    const b = e.target.closest && e.target.closest('[data-cam]'); if (!b) return; const a = b.dataset.cam;
    if (a === 'tele') { if (A.cerrarMenu) A.cerrarMenu(); if (evMenu) teleDesde(evMenu); }
    if (a === 'salir') A.ponerVista('3d');
    if (a === 'atravesar') ponerAtravesar(); if (a === 'linterna') ponerLinterna(); if (a === 'techos') ponerTechos();
  });

  window.OOCaminar = { mover, estado: () => ({ pies: j.pies, ojos: camP.position.y - j.pies, alto: j.alto, vel: st.vel, fov: st.fov, atravesar: st.atravesar, linterna: j.linterna, techos: st.techos, corte: j.corte, enSuelo: j.enSuelo, abiertas: [...abiertas.keys()], pos: camP.position.toArray(), activo: j.activo }),
    teletransportar, teleDesde, usar, puertaDe, alternarPuerta, abierta, ponerAtravesar, ponerLinterna, ponerTechos, ponerVel, ponerFov, notaAqui, mirando: () => { actualizarMira(); return j.mira ? { key: j.mira.key, t: j.mira.t } : null; },
    set agachado(v) { j.ctrl = !!v; }, get agachado() { return j.ctrl; }, quitarTecho };
})();
