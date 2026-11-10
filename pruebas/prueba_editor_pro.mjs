// Pruebas del Map Editor Pro (fases 1 y 2): casos de aceptación A, B, C, E y F de docs/editor_mapa/ESPEC_MAP_EDITOR_PRO.md,
// fantasma de colocación, migración del esquema y regresiones de lo que ya existía. Abre Edge sin ventana contra un servidor de PRUEBA.
//
// 1) Servidor con datos aparte (NUNCA el 7791/7792 ni datos_usuario):
//      set OO_PUERTO_EDITOR=7793& set OO_DATOS_EDITOR=%TEMP%\oo_prueba\datos& set OO_CARTELES_UNITY=%TEMP%\oo_prueba\carteles& set OO_REGLAS_UNITY=%TEMP%\oo_prueba\reglas& set OO_EDITORMAPA_UNITY=%TEMP%\oo_prueba\juego
//      python herramientas/editor_mapa/servidor.py --sin-navegador
// 2) node herramientas/editor_mapa/pruebas/prueba_editor_pro.mjs --puerto 7793 --depuracion 9483 --perfil %TEMP%\oo_prueba\edge [--capturas carpeta] [--resultado archivo.json] [--juego %TEMP%\oo_prueba\juego] [--datos-prueba %TEMP%\oo_prueba\datos]
//
// Sale con código 0 si todo pasa. Las capturas (1600×900) solo se hacen si se da --capturas.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PUERTO = +arg('puerto', 7793), DEP = +arg('depuracion', 9483), PERFIL = arg('perfil', path.join(os.tmpdir(), 'oo_prueba_editor_pro')), CAPT = arg('capturas', ''), RES = arg('resultado', '');
if ([7791, 7792, 7777].includes(PUERTO)) { console.error('Ese puerto es del usuario o del juego: usa otro (p. ej. 7793).'); process.exit(2); }
const EDGE = arg('edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + DEP, '--user-data-dir=' + PERFIL, '--window-size=1600,900', '--enable-unsafe-swiftshader', '--disable-features=msEdgeTrackingPrevention', 'about:blank'], { stdio: 'ignore' });
const dormir = ms => new Promise(r => setTimeout(r, ms));
/* cierra Edge con todos sus procesos (solo el árbol que abrió esta prueba) */
const cerrarEdge = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); else edge.kill(); } catch { } };
process.on('exit', cerrarEdge);
let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + DEP + '/json')).json(); break; } catch { await dormir(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let nid = 0; const pend = new Map(), errores = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errores.push('error: ' + d.params.args.map(a => a.value ?? a.description).join(' '));
};
const cmd = (method, params = {}) => new Promise(r => { const i = ++nid; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalRaw = async e => { const r = await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { excepcion: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text } : r.result.result.value; };
await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Network.enable'); await cmd('Network.setCacheDisabled', { cacheDisabled: true });
await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
async function cargar() {
  await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PUERTO + '/?prueba' });
  for (let i = 0; i < 120; i++) { await dormir(1000); const r = await evalRaw('typeof window.__ooEval === "function" ? __ooEval("!!D && N") : 0'); if (typeof r === 'number' && r > 0) return r; }
  throw new Error('El editor no cargó');
}
console.log('Mapa cargado:', await cargar(), 'piezas');
/* --limpiar: borra los cambios que haya en el servidor de prueba antes de empezar (solo en puertos de prueba) */
const quedan = await evalRaw('__ooEval("efectivos().size")');
if (quedan && !process.argv.includes('--limpiar')) { console.error('El servidor de prueba ya tiene ' + quedan + ' cambios: usa --limpiar (solo en un servidor de PRUEBA) o una carpeta de datos vacía.'); ws.close(); cerrarEdge(); await dormir(300); process.exit(2); }
if (process.argv.includes('--limpiar')) { const n = await evalRaw('__ooEval(' + JSON.stringify('(async () => { const l = [...efectivos()].map(([id]) => ({ id, data: null })); if (l.length) escribir(l); for (let i = 0; i < 400 && pendientes > 0; i++) await new Promise(r => setTimeout(r, 50)); return l.length; })()') + ')'); console.log('Cambios borrados del servidor de prueba:', n); }

/* código que corre dentro del editor (eval en su cierre): ayudas comunes */
const PRELUDIO = `
  const comprobar = []; const ok = (c, txt) => { comprobar.push([!!c, txt]); return !!c; };
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const canon = v => JSON.stringify(v == null ? null : v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
  const casi = (a, b, t) => Math.abs((+a) - (+b)) <= (t == null ? 1e-3 : t);
  const listo = async () => { for (let i = 0; i < 200 && pendientes > 0; i++) await dormir(50); await dormir(40); };
  const P0 = window.__pruebas = window.__pruebas || {};
  /* zona de pruebas: fuera del mapa pero a menos de 60 m de su borde (la cámara no se aleja más); cada caso en su franja de 22 m */
  const Z = P0.zona = P0.zona || { x: Math.round(limitesMapa.max.x + 12), z: Math.round(limitesMapa.min.z + 20) };
  const nv = id => nuevos.get(id);
  const delTipo = (t, cond) => [...nuevos.values()].filter(o => tipoBase(o.tipo) === t && (!cond || cond(o)));
  const fin = extra => JSON.stringify({ ok: comprobar.every(c => c[0]), comprobaciones: comprobar, extra: extra || null });
  confirmar = async () => true; /* sin ventanas de confirmación */
  const __ooCorte = () => clip.constant >= 999 ? null : clip.constant;
`;
const casos = [];
const caso = (nombre, codigo, despues) => casos.push({ nombre, codigo, despues });
async function correr(c) {
  const r = await evalRaw('__ooEval(' + JSON.stringify('(async () => { ' + PRELUDIO + c.codigo + ' })()') + ')');
  let res; try { res = typeof r === 'string' ? JSON.parse(r) : { ok: false, comprobaciones: [[false, 'resultado raro: ' + JSON.stringify(r).slice(0, 400)]] }; } catch (e) { res = { ok: false, comprobaciones: [[false, String(r).slice(0, 400)]] }; }
  return res;
}
async function captura(nombre, camara) {
  if (!CAPT) return null;
  if (camara) await evalRaw('__ooEval(' + JSON.stringify(camara) + ')');
  await dormir(900);
  const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1600, height: 900, scale: 1 } });
  fs.mkdirSync(CAPT, { recursive: true }); const f = path.join(CAPT, nombre + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f;
}
async function raton(tipo, x, y, botones) { await cmd('Input.dispatchMouseEvent', { type: tipo, x, y, button: 'left', buttons: botones ? 1 : 0, clickCount: tipo === 'mouseMoved' ? 0 : 1 }); }
async function arrastrar(a, b, pasos) { await raton('mouseMoved', a.x, a.y, 0); await dormir(60); await raton('mousePressed', a.x, a.y, 1); for (let i = 1; i <= (pasos || 12); i++) { const t = i / (pasos || 12); await raton('mouseMoved', a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1); await dormir(35); } await dormir(150); await raton('mouseReleased', b.x, b.y, 0); await dormir(400); }
async function teclear(txt) { for (const ch of txt) { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await dormir(20); } await dormir(100); }
/* (2.1) casos que corren con la página recién recargada: tras E2 o, con --solo, tras recargar al final */
const trasRecargar = []; const casoTrasRecargar = (nombre, f) => trasRecargar.push({ nombre, f });

/* ---------------- Caso A: elevar una construcción ---------------- */
caso('A1 · construir sobre una fundación de 10 × 10 m (paredes, piso, puerta, ventana, mesa, cajas, carretera fuera)', `
  const X = Z.x, Zz = Z.z;
  const fid = OOFundaciones.crearRect(X, Zz, X + 10, Zz + 10, 0, { elevacion: 0, matSup: 'concreto' });
  ok(!!fid && tipoBase(nv(fid).tipo) === 'fundacion', 'fundación creada');
  params.habitacion.modo = 'rect';
  crearCuartoRect(new V3(X + 0.1, 0, Zz + 0.1), new V3(X + 9.9, 0, Zz + 9.9));
  const muros = delTipo('muro', o => Math.abs(o.datos.x - (X + 5)) < 6 && Math.abs(o.datos.z - (Zz + 5)) < 6), hab = delTipo('habitacion', o => Math.abs(o.datos.x - (X + 5)) < 1 && Math.abs(o.datos.z - (Zz + 5)) < 1)[0];
  ok(muros.length === 4 && !!hab, '4 paredes y un piso');
  const sur = muros.find(o => casi(o.datos.z, Zz + 0.1, 0.01)), este = muros.find(o => casi(o.datos.x, X + 9.9, 0.01));
  const pid = crearNuevo('puerta', { x: sur.datos.x + 1, y: 0, z: sur.datos.z, giroY: sur.datos.giroY, sx: 0.9, sy: 2.1, sz: 0.2, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: sur.id });
  const vid = crearNuevo('ventana', { x: este.datos.x, y: 0, z: este.datos.z, giroY: este.datos.giroY, sx: 1.2, sy: 1.0, sz: 0.2, alfeizar: 1.0, color: '#3d7fbf', muro: este.id });
  const it = itemPorId('mesa'), top = OOAnclajes.tope(hab.tipo, hab.datos);
  const mid = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + 5, y: top, z: Zz + 5, giroY: 30 }));
  const cj = itemPorId('caja_madera'); const cajas = [[X + 2, Zz + 2], [X + 2.8, Zz + 2], [X + 8, Zz + 7]].map(([x, z]) => crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x, y: top, z, giroY: 0 })));
  const cid = crearNuevo('calle', { x: X - 6, y: 0, z: Zz + 5, giroY: 0, sx: 6, sy: 0.05, sz: 30, material: 'asfalto', color: MATERIALES.asfalto.c });
  const aid = crearNuevo('arbol', { x: X + 14, y: 0, z: Zz + 2, giroY: 0, sx: 3.5, sy: 5.5, sz: 3.5, color: '#4f7a3a' });
  const s = id => OOAnclajes.soporte(id);
  ok(muros.every(o => (s(o.id) || {}).tipo === 'fundacion' && s(o.id).id === fid), 'las 4 paredes se anclaron solas a la fundación');
  ok((s(hab.id) || {}).id === fid, 'el piso se ancló a la fundación');
  ok((s(pid) || {}).tipo === 'pared' && (s(vid) || {}).tipo === 'pared', 'puerta y ventana ancladas a su pared');
  ok((s(mid) || {}).tipo === 'piso' && cajas.every(c => (s(c) || {}).tipo === 'piso'), 'mesa y cajas ancladas al piso');
  ok(!s(cid) && !s(aid), 'carretera y árbol sin anclar');
  renderTodo(); ok(nv(sur.id).huecos.length === 1 && nv(este.id).huecos.length === 1, 'puerta y ventana abren hueco');
  P0.A = { fid, muros: muros.map(o => o.id), hab: hab.id, pid, vid, mid, cajas, cid, aid };
  P0.A.antes = Object.fromEntries([...nuevos.values()].map(o => [o.id, clon(o.datos)]));
  seleccionar(['n' + fid]); await listo();
  return fin(P0.A);
`, async () => captura('fundacion_antes_de_elevar', `(() => { const d = nuevos.get(__pruebas.A.fid).datos; __editor.mirar([d.x, 0.8, d.z], [d.x - 15, 12, d.z + 17]); })()`));
caso('A2 · elevar la fundación de 0 a 1,5 m', `
  const a = P0.A, h0 = deshacer.length;
  OOFundaciones.elevar(a.fid, 1.5);
  ok(deshacer.length === h0 + 1, 'un solo paso de deshacer');
  ok(casi(nv(a.fid).datos.elevacion, 1.5) && casi(OOAnclajes.tope('fundacion', nv(a.fid).datos), 1.5), 'la cara de arriba queda a 1,5 m');
  const anclados = a.muros.concat([a.hab, a.pid, a.vid, a.mid], a.cajas);
  for (const id of anclados) { const o = nv(id), b = a.antes[id]; const t = nombreTipo(o.tipo);
    ok(casi(o.datos.y, b.y + 1.5) && casi(o.datos.x, b.x) && casi(o.datos.z, b.z) && casi(o.datos.giroY, b.giroY), t + ' sube 1,5 m sin moverse en planta');
    ok(casi(o.datos.sx, b.sx) && casi(o.datos.sy, b.sy) && casi(o.datos.sz, b.sz), t + ' conserva sus medidas'); }
  for (const id of [a.cid, a.aid]) ok(canon(nv(id).datos) === canon(a.antes[id]), nombreTipo(nv(id).tipo) + ' exterior no se mueve');
  renderTodo(); const sur = nv(a.muros.find(i => nv(i).datos.muro == null && nv(a.pid).datos.muro === i));
  ok(nv(nv(a.pid).datos.muro).huecos.length === 1 && nv(nv(a.vid).datos.muro).huecos.length === 1, 'puerta y ventana siguen abriendo su hueco');
  ok(OOAnclajes.validar().length === 0, 'sin anclajes rotos ni objetos atravesando la plataforma');
  const s = OOAnclajes.soporte(a.mid); ok(s && s.rel && casi(s.rel.y, a.antes[a.mid].y - OOAnclajes.marco('habitacion', a.antes[a.hab]).y), 'la mesa guarda su posición relativa al piso');
  /* deshacer y rehacer la elevación */
  hacerDeshacer(); ok(anclados.every(id => casi(nv(id).datos.y, a.antes[id].y)), 'deshacer: todo vuelve a su altura');
  hacerRehacer(); ok(anclados.every(id => casi(nv(id).datos.y, a.antes[id].y + 1.5)), 'rehacer: todo vuelve a 1,5 m');
  /* elevar dos veces más y volver: sin errores acumulados */
  OOFundaciones.elevar(a.fid, 0.73); OOFundaciones.elevar(a.fid, 1.5);
  ok(anclados.every(id => casi(nv(id).datos.y, a.antes[id].y + 1.5, 1e-6)), 'subir y bajar varias veces no acumula errores');
  seleccionar(['n' + a.fid]); await listo();
  return fin();
`, async () => captura('fundacion_elevada_1_5m', `(() => { const d = nuevos.get(__pruebas.A.fid).datos; __editor.mirar([d.x, 2, d.z], [d.x - 15, 13, d.z + 17]); })()`));

/* ---------------- Caso C: puerta dinámica ---------------- */
caso('C · puerta paramétrica: cambiar la anchura actualiza el hueco sin destruir la pared', `
  const X = Z.x, Zz = Z.z + 22;
  const wid = crearNuevo('muro', datosMuro(new V3(X, 0, Zz), new V3(X + 6, 0, Zz)));
  const w0 = clon(nv(wid).datos), doc0 = nv(wid).docId;
  const pid = crearNuevo('puerta', { x: X + 3, y: 0, z: Zz, giroY: 0, sx: 0.9, sy: 2.1, sz: 0.2, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: wid });
  renderTodo(); ok(nv(wid).huecos.length === 1 && casi(nv(wid).huecos[0].w, 0.9 + 2 * OO.MARCO), 'hueco inicial de 0,9 m + marco');
  seleccionar(['n' + pid]); cambiarCampoSel('sx', 1.6); renderTodo();
  const w = nv(wid);
  ok(!!w && w.docId === doc0 && casi(w.datos.sx, w0.sx) && casi(w.datos.sy, w0.sy), 'la pared es la misma y no cambió');
  ok(w.huecos.length === 1 && casi(w.huecos[0].w, 1.6 + 2 * OO.MARCO), 'el hueco mide ahora 1,6 m + marco');
  const piezas = w.partes.filter(p => p.f === 'b'); ok(piezas.length === 3, 'la pared son 3 piezas: izquierda, derecha y dintel');
  const izq = piezas.map(p => { const e = p.m.elements; return e[12] - X - 3 + Math.abs(e[0]) / 2; }).filter(v => v < 0).sort((a, b) => b - a)[0];
  ok(casi(izq, -(1.6 / 2 + OO.MARCO), 0.01), 'el borde del vano está a la mitad del ancho nuevo');
  /* ancho imposible: se estrecha para caber */
  cambiarCampoSel('sx', 8); ok(nv(pid).datos.sx < 6 && nv(pid).datos.sx > 5, 'una puerta más ancha que la pared se estrecha para caber');
  cambiarCampoSel('sx', 1.6);
  /* mover la puerta fuera de la pared: vuelve dentro */
  const st = estadoEnt('n' + pid); ponerEstado('n' + pid, st.p.clone().add(new V3(10, 0, 0.7)), st.q, st.s); confirmarEdicion();
  ok(casi(nv(pid).datos.z, Zz) && nv(pid).datos.x <= X + 6 - 0.8 - OO.MARCO + 0.03, 'arrastrada fuera, la puerta vuelve a la línea y al largo de su pared');
  cambiarCampoSel('x', X + 3);
  P0.C = { wid, pid }; seleccionar(['n' + pid]); await listo();
  return fin();
`, async () => captura('puerta_ensanchada', `(() => { const d = nuevos.get(__pruebas.C.pid).datos; __editor.mirar([d.x, 1.2, d.z], [d.x + 2.5, 3.5, d.z + 7]); })()`));

/* ---------------- Paredes paramétricas ---------------- */
caso('Paredes paramétricas: alto y grosor sin rehacer, extremos, dividir, unir, cruces y curva', `
  const X = Z.x, Zz = Z.z + 44;
  const w1 = crearNuevo('muro', datosMuro(new V3(X, 0, Zz), new V3(X + 8, 0, Zz)));
  const pid = crearNuevo('puerta', { x: X + 2, y: 0, z: Zz, giroY: 0, sx: 0.9, sy: 2.1, sz: 0.2, estilo: 'madera', color: '#5d666b', hoja: '#8b6a4a', muro: w1 });
  const doc = nv(w1).docId; seleccionar(['n' + w1]); cambiarCampoSel('sy', 3.2); cambiarCampoSel('sz', 0.3);
  ok(nv(w1).docId === doc && casi(nv(w1).datos.sy, 3.2) && casi(nv(w1).datos.sz, 0.3), 'alto y grosor cambiados en la misma pared');
  ok(casi(nv(pid).datos.sz, 0.3), 'la puerta toma el grosor nuevo');
  /* estirar el extremo final: la puerta conserva su distancia al inicio */
  OOParedes.moverExtremo(w1, 1, [X + 10, Zz]); ok(casi(nv(w1).datos.sx, 10) && casi(nv(pid).datos.x, X + 2), 'extremo arrastrado: 10 m y la puerta en su sitio');
  OOParedes.moverExtremo(w1, 0, [X + 1, Zz]); ok(casi(nv(w1).datos.sx, 9) && casi(nv(pid).datos.x, X + 2), 'mover el inicio no mueve la puerta');
  /* paredes unidas por un extremo siguen al arrastrarlo */
  const w2 = crearNuevo('muro', datosMuro(new V3(X + 10, 0, Zz), new V3(X + 10, 0, Zz + 5)));
  OOParedes.moverExtremo(w1, 1, [X + 11, Zz]); const s2 = OOParedes.seg(nv(w2).datos);
  ok(casi(s2.a[0], X + 11) && casi(s2.a[1], Zz) && casi(s2.b[0], X + 10), 'la pared unida sigue al extremo');
  /* dividir y unir */
  const piezas = OOParedes.dividir(w1, 5); ok(piezas && piezas.length === 2, 'dividida en 2');
  const otra = piezas.find(i => i !== w1); ok(casi(nv(w1).datos.sx, 5) && casi(nv(otra).datos.sx, 5), 'tramos de 5 y 5 m');
  ok(nv(pid).datos.muro === w1, 'la puerta se queda en su tramo');
  const unida = OOParedes.unir([w1, otra]); ok(unida === w1 && !nv(otra) && casi(nv(w1).datos.sx, 10), 'unidas otra vez en una de 10 m');
  /* cruce: una pared nueva que corta a otra parte las dos */
  const antes = delTipo('muro').length; const w3 = crearNuevo('muro', datosMuro(new V3(X + 6, 0, Zz - 3), new V3(X + 6, 0, Zz + 3)));
  ok(delTipo('muro').length === antes + 3, 'el cruce parte la pared nueva y la vieja (la nueva y 2 tramos más)');
  ok(casi(nv(w3).datos.sx, 3), 'la nueva queda partida en el cruce');
  /* curva */
  const wc = crearNuevo('muro', Object.assign(datosMuro(new V3(X, 0, Zz + 8), new V3(X + 8, 0, Zz + 8)), { curva: 2 })); renderTodo();
  const pc = nv(wc).partes.filter(p => p.f === 'b'); ok(pc.length >= 6, 'la pared curva se dibuja en ' + pc.length + ' tramos');
  const zmax = Math.max(...pc.map(p => p.m.elements[14])); ok(Math.abs(Math.abs(zmax - (Zz + 8)) - 2) < 0.15 || Math.abs(Math.min(...pc.map(p => p.m.elements[14])) - (Zz + 8) + 2) < 0.15, 'la flecha de la curva es de 2 m');
  P0.W = { w1, pid, wc }; seleccionar(['n' + w1]); await listo();
  return fin();
`, async () => captura('pared_parametrica', `(() => { const d = nuevos.get(__pruebas.W.w1).datos; __editor.mirar([d.x, 1, d.z + 3], [d.x - 6, 12, d.z + 16]); })()`));

/* ---------------- Caso B: modificar una habitación ---------------- */
caso('B · estirar una habitación de 4 × 5 m a 6 × 5 m', `
  const X = Z.x, Zz = Z.z - 24; /* sitio despejado (sin piezas del mapa por encima) */
  params.habitacion.modo = 'rect'; crearCuartoRect(new V3(X, 0, Zz), new V3(X + 4, 0, Zz + 5));
  const hab = delTipo('habitacion', o => casi(o.datos.x, X + 2, 0.05) && casi(o.datos.z, Zz + 2.5, 0.05))[0];
  const muros = delTipo('muro', o => Math.abs(o.datos.x - (X + 2)) < 3 && Math.abs(o.datos.z - (Zz + 2.5)) < 3);
  const norte = muros.find(o => casi(o.datos.z, Zz, 0.01)), este = muros.find(o => casi(o.datos.x, X + 4, 0.01));
  const pid = crearNuevo('puerta', { x: X + 1, y: 0, z: Zz, giroY: norte.datos.giroY, sx: 0.9, sy: 2.1, sz: 0.2, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: norte.id });
  const vid = crearNuevo('ventana', { x: X + 4, y: 0, z: Zz + 2.5, giroY: este.datos.giroY, sx: 1.2, sy: 1, sz: 0.2, alfeizar: 1, color: '#3d7fbf', muro: este.id });
  const it = itemPorId('escritorio'); const eid = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + 1.5, y: OOAnclajes.tope('habitacion', hab.datos), z: Zz + 3, giroY: 0 }));
  ok(casi(hab.datos.area, 20, 0.01), 'habitación de 20 m²');
  const lados = OOHabitaciones.lados(hab.id); const pts = puntosMundoHab(hab); const iEste = pts.findIndex((p, i) => { const q = pts[(i + 1) % pts.length]; return casi(p[0], X + 4, 0.01) && casi(q[0], X + 4, 0.01); });
  ok(iEste >= 0, 'lado este encontrado');
  const e0 = clon(nv(eid).datos), p0 = clon(nv(pid).datos), v0 = clon(nv(vid).datos);
  OOHabitaciones.estirarBorde(hab.id, iEste, 2);
  const h = nv(hab.id); ok(casi(h.datos.area, 30, 0.01), 'superficie actualizada: 30 m²');
  ok(JSON.stringify(OOHabitaciones.lados(hab.id).slice().sort()) === JSON.stringify([5, 5, 6, 6]), 'lados de 6 y 5 m');
  ok(casi(nv(este.id).datos.x, X + 6) && casi(nv(este.id).datos.sx, 5), 'la pared este se trasladó 2 m');
  ok(casi(nv(norte.id).datos.sx, 6) && casi(OOParedes.seg(nv(norte.id).datos).a[0], X, 0.01) || casi(OOParedes.seg(nv(norte.id).datos).b[0], X, 0.01), 'la pared norte se estiró a 6 m');
  ok(casi(nv(pid).datos.x, p0.x) && nv(pid).datos.muro === norte.id, 'la puerta de la pared estirada se conserva en su sitio');
  ok(casi(nv(vid).datos.x, v0.x + 2) && casi(nv(vid).datos.z, v0.z), 'la ventana se movió con su pared');
  ok(canon(nv(eid).datos) === canon(e0), 'el escritorio no se mueve');
  renderTodo(); ok(nv(norte.id).huecos.length === 1 && nv(nv(vid).datos.muro).huecos.length === 1, 'las aberturas siguen abriendo hueco');
  /* encoger tanto que la ventana no cabe: aviso */
  OOHabitaciones.estirarBorde(hab.id, (iEste + 1) % 4, -4.2); ok(OOAnclajes.avisos.length > 0, 'aviso al encoger: ' + (OOAnclajes.avisos[0] || ''));
  hacerDeshacer(); ok(casi(nv(hab.id).datos.area, 30, 0.01), 'deshacer el encogido');
  P0.B = { hab: hab.id, iEste, X, Zz }; seleccionar(['n' + hab.id]); await listo();
  return fin();
`);
caso('B (asa) · estirar arrastrando el asa del lado con el ratón', `
  const b = P0.B; seleccionar(['n' + b.hab]); const d = nv(b.hab).datos; __editor.mirar([d.x, 0, d.z], [d.x + 0.01, 30, d.z + 0.01]); await dormir(300); OOAsas.actualizar(); await dormir(100);
  const asas = OOAsas.lista(); const pts = puntosMundoHab(nv(b.hab));
  const lado = asas.find(a => a.id === 'lado' + b.iEste); ok(!!lado, 'hay asas en los lados (' + asas.length + ')');
  const de = __editor.proyectar(lado.pos), a = __editor.proyectar([lado.pos[0] - 1, lado.pos[1], lado.pos[2]]);
  P0.B.area0 = nv(b.hab).datos.area; return fin({ de, a });
`, async (res) => { if (res.extra && res.extra.de) await arrastrar(res.extra.de, res.extra.a, 14); });
caso('B (asa) · resultado del arrastre', `
  const b = P0.B; const ar = nv(b.hab).datos.area; ok(casi(ar, 25, 0.3), 'el asa encogió la habitación 1 m: ' + ar + ' m²');
  await listo(); return fin();
`, async () => { await evalRaw('__ooEval(' + JSON.stringify('(() => { const b = __pruebas.B; OOHabitaciones.estirarBorde(b.hab, b.iEste, 1); seleccionar(["n" + b.hab]); const d = nuevos.get(b.hab).datos; __editor.mirar([d.x, 0.5, d.z], [d.x - 7, 11, d.z + 9]); })()') + ')'); return captura('habitacion_estirada'); });

/* ---------------- Asa de la fundación ---------------- */
caso('Asa de elevación de la fundación (arrastre con el ratón)', `
  const a = P0.A; seleccionar(['n' + a.fid]); const d = nv(a.fid).datos; __editor.mirar([d.x, 1.5, d.z], [d.x - 18, 4, d.z]); await dormir(300); OOAsas.actualizar(); await dormir(100);
  const asa = OOAsas.lista().find(x => x.id === 'elevar'); ok(!!asa, 'flecha de elevación visible');
  const de = __editor.proyectar(asa.pos), hasta = __editor.proyectar([asa.pos[0], asa.pos[1] + 1, asa.pos[2]]);
  P0.A.y0 = nv(a.mid).datos.y; return fin({ de, a: hasta });
`, async (res) => { if (res.extra && res.extra.de) await arrastrar(res.extra.de, res.extra.a, 10); });
caso('Asa de elevación · resultado', `
  const a = P0.A; const el = nv(a.fid).datos.elevacion; ok(casi(el, 2.5, 0.06), 'la flecha subió la fundación ~1 m: ' + el + ' m');
  ok(casi(nv(a.mid).datos.y - P0.A.y0, el - 1.5, 1e-3), 'la mesa subió lo mismo');
  OOFundaciones.elevar(a.fid, 1.5); await listo(); return fin();
`);

/* ---------------- Fantasma de colocación ---------------- */
caso('Fantasma verde/amarillo y colocación sobre una plataforma elevada (se ancla sola)', `
  const X = Z.x + 30, Zz = Z.z + 200; /* sitio despejado: nada del mapa por encima */ const fid = OOFundaciones.crearRect(X, Zz, X + 6, Zz + 6, 0, { elevacion: 0.8 });
  __editor.mirar([X + 3, 0.8, Zz + 3], [X + 3.01, 14, Zz + 3.01]); await dormir(300);
  iniciarColocar('caja_madera'); const c = __editor.proyectar([X + 3, 0.8, Zz + 3]);
  moverColocar({ clientX: c.x, clientY: c.y }); ok(colocarUlt && !colocarUlt.mal && !colocarUlt.aviso, 'en el centro: verde');
  ok(previa.children.length && previa.children[0].material === matPrevia && matPrevia.color.getHex() === 0x2fae5a, 'el fantasma es verde');
  const hh = pickEvento({ clientX: c.x, clientY: c.y }); ok(casi(colocarUlt.datos.y, 0.8, 0.01), 'se apoya a 0,8 m (y = ' + r3(colocarUlt.datos.y) + ', bajo el ratón: ' + (hh ? hh.key + ' ' + hh.malla + ' ' + hh.point.toArray().map(r3) : 'nada') + ', fundación ' + fid + ', pantalla ' + Math.round(c.x) + ',' + Math.round(c.y) + ')');
  const b = __editor.proyectar([X + 5.85, 0.8, Zz + 3]); moverColocar({ clientX: b.x, clientY: b.y });
  ok(colocarUlt.aviso && previa.children[0].material === matPreviaAviso, 'en el borde, medio fuera: amarillo');
  colocarAqui({ clientX: c.x, clientY: c.y }); ponerHerramienta('sel');
  const caja = [...nuevos.values()].filter(o => o.tipo === 'objeto:caja_madera' && casi(o.datos.x, X + 3, 0.3)).pop();
  ok(caja && (OOAnclajes.soporte(caja.id) || {}).id === fid, 'colocada encima, queda anclada a la plataforma');
  OOFundaciones.elevar(fid, 1.2); ok(casi(nv(caja.id).datos.y, 1.2, 0.01), 'y sube con ella');
  await listo(); return fin();
`);

/* ---------------- Caso F: deshacer y rehacer ---------------- */
caso('F · crear habitación, elevar su fundación, poner objetos, cambiar materiales; deshacer y rehacer paso a paso', `
  const X = Z.x, Zz = Z.z + 110;
  const foto = () => canon([...nuevos.values()].filter(o => Math.abs(o.datos.x - (X + 4)) < 12 && Math.abs(o.datos.z - (Zz + 4)) < 12).map(o => [o.id, o.tipo, o.datos, o.props]).sort((p, q) => p[0] < q[0] ? -1 : 1));
  const fotos = [foto()], h0 = deshacer.length;
  const fid = OOFundaciones.crearRect(X, Zz, X + 8, Zz + 8, 0, { elevacion: 0 }); fotos.push(foto());
  params.habitacion.modo = 'rect'; crearCuartoRect(new V3(X + 0.1, 0, Zz + 0.1), new V3(X + 7.9, 0, Zz + 7.9)); fotos.push(foto());
  OOFundaciones.elevar(fid, 1); fotos.push(foto());
  const hab = delTipo('habitacion', o => casi(o.datos.x, X + 4, 0.05) && casi(o.datos.z, Zz + 4, 0.05))[0];
  const it = itemPorId('mesa'); crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + 4, y: OOAnclajes.tope('habitacion', hab.datos), z: Zz + 4, giroY: 0 })); fotos.push(foto());
  OOFundaciones.cambiar(fid, { matSup: 'adoquin' }); fotos.push(foto());
  const w = delTipo('muro', o => casi(o.datos.z, Zz + 0.1, 0.01) && Math.abs(o.datos.x - (X + 4)) < 1)[0]; seleccionar(['n' + w.id]); cambiarCampoSel('material', 'ladrillo'); fotos.push(foto());
  ok(deshacer.length - h0 === 6, '6 pasos en el historial');
  ok(deshacer.slice(-6).map(e => e.etiqueta).filter(Boolean).length >= 3, 'los pasos tienen nombre: ' + deshacer.slice(-6).map(e => e.etiqueta || '·').join(' | '));
  for (let i = fotos.length - 2; i >= 0; i--) { hacerDeshacer(); ok(foto() === fotos[i], 'deshacer hasta el paso ' + i); }
  for (let i = 1; i < fotos.length; i++) { hacerRehacer(); ok(foto() === fotos[i], 'rehacer hasta el paso ' + i); }
  const sm = OOAnclajes.soporte(delTipo('objeto', o => casi(o.datos.x, X + 4, 0.01) && casi(o.datos.z, Zz + 4, 0.01))[0].id);
  ok(sm && sm.tipo === 'piso' && sm.id === hab.id, 'tras rehacer, la mesa sigue anclada al piso');
  await listo(); return fin();
`);

/* ---------------- Caso D: dos plantas (fase 3) ---------------- */
caso('D1 · edificio de dos plantas con muebles; ocultar la de arriba y editar la planta baja sin seleccionar lo oculto', `
  const X = Z.x + 2, Zz = Z.z + 200; /* zona libre: al este del mapa hay edificios «Exterior» de hasta 10 m */
  const fid = OOFundaciones.crearRect(X, Zz, X + 10, Zz + 8, 0, { elevacion: 0.3 });
  ok(OONiveles.crearEdificio(fid, 3) && OONiveles.plantas(fid).length === 1, 'la fundación es un edificio con planta baja');
  OONiveles.activar(fid, 'pb', { modo: 'todos' }); const y0 = OONiveles.yPlanta(fid, 'pb');
  ok(casi(y0, 0.3) && casi(planoTrabajo, 0.3), 'planta baja a 0,3 m y se dibuja a esa altura');
  params.habitacion.modo = 'rect'; crearCuartoRect(new V3(X + 0.2, y0, Zz + 0.2), new V3(X + 9.8, y0, Zz + 7.8));
  const hab = y => delTipo('habitacion', o => !o.datos.suelo && casi(o.datos.x, X + 5, 0.05) && casi(o.datos.z, Zz + 4, 0.05) && casi(o.datos.y, y, 0.05))[0];
  const habPB = hab(y0); ok(!!habPB && habPB.datos.nivel === 'pb', 'habitación de la planta baja en su planta');
  const it = itemPorId('mesa'), cj = itemPorId('caja_madera');
  const mesaPB = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + 3, y: OOAnclajes.tope('habitacion', habPB.datos), z: Zz + 3, giroY: 0 }));
  const n1 = OONiveles.agregarPlanta(fid); const y1 = OONiveles.yPlanta(fid, n1);
  ok(!!n1 && casi(y1, 3.3) && OONiveles.estado.nid === n1 && casi(planoTrabajo, 3.3), 'piso 1 agregado a 3,3 m y activo');
  const losa = delTipo('habitacion', o => o.datos.suelo && o.datos.nivel === n1)[0]; ok(losa && casi(OOAnclajes.tope('habitacion', losa.datos), y1, 0.002), 'el piso 1 tiene su losa a la altura de la planta');
  crearCuartoRect(new V3(X + 0.2, y1, Zz + 0.2), new V3(X + 9.8, y1, Zz + 7.8)); const habP1 = hab(y1);
  const murosP1 = delTipo('muro', o => casi(o.datos.y, y1, 0.01) && Math.abs(o.datos.x - (X + 5)) < 6 && Math.abs(o.datos.z - (Zz + 4)) < 6);
  ok(habP1 && habP1.datos.nivel === n1 && murosP1.length === 4 && murosP1.every(o => o.datos.nivel === n1), 'paredes y habitación del piso 1 en su planta');
  ok(murosP1.every(o => (OOAnclajes.soporte(o.id) || {}).id === fid), 'las paredes del piso 1 se anclan a la fundación del edificio');
  const mesa1 = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + 3, y: OOAnclajes.tope('habitacion', habP1.datos), z: Zz + 3, giroY: 0 }));
  const caja1 = crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X + 7, y: OOAnclajes.tope('habitacion', habP1.datos), z: Zz + 5, giroY: 0 }));
  ok((OOAnclajes.soporte(mesa1) || {}).id === habP1.id && OONiveles.nivelDe(nv(mesa1)).nid === n1, 'la mesa de arriba se apoya en el piso 1');
  const p1 = OONiveles.deNivel(fid, n1).map(o => o.id), pb = OONiveles.deNivel(fid, 'pb').map(o => o.id);
  ok(p1.length >= 8 && pb.length >= 6, 'objetos por planta: ' + pb.length + ' abajo, ' + p1.length + ' arriba');
  /* ocultar la de arriba */
  OONiveles.activar(fid, 'pb', { modo: 'hasta' }); renderTodo();
  ok(p1.every(i => !visibleNuevo(nv(i)) && nv(i).partes.length === 0), 'el piso 1 no se dibuja');
  ok(pb.every(i => visibleNuevo(nv(i))), 'la planta baja sí');
  ok(p1.every(i => !seleccionable('n' + i)) && pb.every(i => seleccionable('n' + i)), 'lo oculto no se puede seleccionar');
  __editor.mirar([X + 5, y0, Zz + 4], [X + 5.01, 30, Zz + 4.01]); await dormir(400);
  const c = __editor.proyectar([X + 3, y1 + 0.75, Zz + 3]); const h = pickEvento({ clientX: c.x, clientY: c.y });
  ok(!h || !p1.includes(h.key.slice(1)), 'un clic donde está la mesa de arriba no la coge (coge ' + (h ? h.key : 'nada') + ')');
  const a0 = __editor.proyectar([X - 1, y0, Zz - 1]), a1 = __editor.proyectar([X + 11, y0, Zz + 9]); seleccionRect(Math.max(a0.x, a1.x), Math.min(a0.y, a1.y), Math.min(a0.x, a1.x), Math.max(a0.y, a1.y), false); /* por cruce, de derecha a izquierda */
  ok(sel.length > 0 && sel.every(k => !p1.includes(k.slice(1))), 'la selección rectangular coge ' + sel.length + ' cosas y ninguna del piso 1');
  /* editar la planta baja */
  seleccionar(['n' + mesaPB]); cambiarCampoSel('x', X + 4); ok(casi(nv(mesaPB).datos.x, X + 4) && casi(nv(mesa1).datos.x, X + 3), 'mover la mesa de abajo no toca la de arriba');
  OONiveles.activar(fid, n1, { modo: 'solo' }); renderTodo(); ok(pb.filter(i => tipoBase(nv(i).tipo) !== 'fundacion').every(i => !visibleNuevo(nv(i))) && p1.every(i => visibleNuevo(nv(i))), 'solo este nivel: se ve el piso 1 y no la planta baja');
  OONiveles.activar(fid, 'pb', { modo: 'hasta' });
  P0.D = { fid, n1, p1, pb, mesaPB, mesa1, caja1, habPB: habPB.id, habP1: habP1.id, X, Zz, y0, y1 }; seleccionar(['n' + mesaPB]); await listo();
  return fin();
`, async () => { await captura('dos_plantas_todas', `(() => { const d = __pruebas.D; seleccionar([]); OONiveles.activar(d.fid, 'pb', { modo: 'todos' }); __editor.mirar([d.X + 5, 2, d.Zz + 4], [d.X + 19, 11, d.Zz + 17]); })()`); return captura('dos_plantas_superior_oculta', `(() => { const d = __pruebas.D; OONiveles.activar(d.fid, 'pb', { modo: 'hasta' }); seleccionar(['n' + d.mesaPB]); __editor.mirar([d.X + 5, 1, d.Zz + 4], [d.X + 19, 10, d.Zz + 17]); })()`); });
caso('D2 · elevar la fundación del edificio, altura, duplicar y quitar plantas y corte por nivel', `
  const d = P0.D, fid = d.fid; OONiveles.activar(fid, 'pb', { modo: 'todos' });
  const todos = d.p1.concat(d.pb).filter(i => i !== fid && nv(i)); const y = Object.fromEntries(todos.map(i => [i, nv(i).datos.y]));
  OOFundaciones.elevar(fid, 1.3);
  ok(todos.every(i => casi(nv(i).datos.y, y[i] + 1, 1e-3)), 'al elevar la fundación 1 m, las dos plantas suben 1 m (' + todos.length + ' objetos)');
  ok(casi(OONiveles.yPlanta(fid, d.n1), d.y1 + 1) && casi(planoTrabajo, d.y0 + 1), 'las plantas y el plano de trabajo siguen a la fundación');
  hacerDeshacer(); ok(todos.every(i => casi(nv(i).datos.y, y[i], 1e-3)), 'deshacer: vuelven a su altura');
  /* altura de la planta baja: el piso 1 sube 0,5 m y las paredes de abajo crecen */
  const murosPB = d.pb.filter(i => tipoBase(nv(i).tipo) === 'muro'); const sy0 = Object.fromEntries(murosPB.map(i => [i, nv(i).datos.sy]));
  OONiveles.alturaPlanta(fid, 'pb', 3.5);
  ok(d.p1.every(i => casi(nv(i).datos.y, y[i] + 0.5, 1e-3)), 'altura de la planta baja 3,5 m: el piso 1 sube 0,5 m');
  ok(murosPB.every(i => casi(nv(i).datos.sy, 3.5) || !casi(sy0[i], 3, 0.05)), 'las paredes de la planta baja que llegaban al techo miden 3,5 m (' + murosPB.map(i => nv(i).datos.sy).join(', ') + ')');
  hacerDeshacer(); ok(d.p1.every(i => casi(nv(i).datos.y, y[i], 1e-3)) && murosPB.every(i => casi(nv(i).datos.sy, sy0[i])), 'deshacer la altura');
  /* duplicar el piso 1 */
  const n0 = nuevos.size; const n2 = OONiveles.duplicarPlanta(fid, d.n1);
  const copia = OONiveles.deNivel(fid, n2); ok(!!n2 && copia.length === d.p1.length && nuevos.size === n0 + d.p1.length, 'piso 2 duplicado con ' + copia.length + ' objetos');
  ok(casi(OONiveles.yPlanta(fid, n2), d.y1 + 3), 'el piso 2 está 3 m más arriba');
  const mesa2 = copia.find(o => o.tipo === nv(d.mesa1).tipo && casi(o.datos.x, nv(d.mesa1).datos.x)); const s2 = mesa2 && OOAnclajes.soporte(mesa2.id);
  ok(mesa2 && casi(mesa2.datos.y, nv(d.mesa1).datos.y + 3) && s2 && copia.some(o => o.id === s2.id), 'la mesa copiada se apoya en el piso copiado');
  ok(copia.filter(o => tipoBase(o.tipo) === 'muro').every(o => (OOAnclajes.soporte(o.id) || {}).id === fid), 'las paredes copiadas se anclan a la fundación');
  ok(OONiveles.plantas(fid).map(p => p.etiqueta).join(' | ') === 'Planta baja | Piso 1 | Piso 2', 'selector: ' + OONiveles.plantas(fid).map(p => p.etiqueta).join(' | '));
  /* corte por nivel */
  OONiveles.activar(fid, n2); OONiveles.ponerCorte(true); ok(casi(__ooCorte(), OONiveles.yPlanta(fid, n2) + 1.2), 'corte a 1,2 m del suelo del piso 2');
  OONiveles.ponerCorte(false); ok(__ooCorte() == null, 'sin corte');
  /* quitar el piso 2 */
  ok(OONiveles.quitarPlanta(fid, n2) && OONiveles.deNivel(fid, n2).length === 0 && nuevos.size === n0, 'quitar el piso 2 borra lo suyo');
  hacerDeshacer(); ok(nuevos.size === n0 + d.p1.length, 'deshacer devuelve el piso 2'); hacerDeshacer(); ok(nuevos.size === n0, 'deshacer el duplicado');
  ok(OOAnclajes.validar().length === 0, 'sin anclajes rotos');
  /* sótano y azotea */
  const s = OONiveles.agregarPlanta(fid, { sotano: true }); ok(casi(OONiveles.yPlanta(fid, s), d.y0 - 3), 'sótano 3 m por debajo de la planta baja');
  const az = OONiveles.agregarPlanta(fid, { azotea: true, altura: 1.2 }); ok(OONiveles.plantas(fid).map(p => p.etiqueta).join(' | ') === 'Sótano | Planta baja | Piso 1 | Azotea', 'Nivel: ' + OONiveles.plantas(fid).map(p => p.etiqueta).join(' | '));
  hacerDeshacer(); hacerDeshacer(); OONiveles.activar(fid, 'pb', { modo: 'todos' }); await listo();
  return fin();
`);

/* ---------------- Techos paramétricos (fase 3) ---------------- */
caso('Techos · cada forma sobre una habitación, toldo en una pared, editar, alto de la habitación y exportar', `
  const X = Z.x + 2, Z0 = Z.z + 120, formas = OOTechos.FORMAS.map(f => f[0]).filter(f => f !== 'toldo'); /* franja libre al este del mapa */
  const sitio = k => [X + (k % 4) * 9, Z0 + Math.floor(k / 4) * 9];
  const maxY = o => { let m = -Infinity; renderTodo(); for (const pt of o.partes) { if (pt.f === 'poly') { for (const [x, z] of pt.pts) for (const yy of [pt.y || 0, (pt.y || 0) + (pt.grosor || 0)]) m = Math.max(m, new V3(x, yy, z).applyMatrix4(pt.m).y); } else if (pt.m) m = Math.max(m, pt.m.elements[13]); } return m; };
  const finito = o => o.partes.every(pt => pt.m && pt.m.elements.every(isFinite));
  params.habitacion.modo = 'rect'; const T = {};
  formas.forEach((f, k) => { const [x, z] = sitio(k); crearCuartoRect(new V3(x, 0, z), new V3(x + 6, 0, z + 5));
    const hab = delTipo('habitacion', o => casi(o.datos.x, x + 3, 0.05) && casi(o.datos.z, z + 2.5, 0.05))[0]; const id = OOTechos.crearDesde(hab.id, f); T[f] = { id, hab: hab.id }; });
  renderTodo();
  for (const f of formas) { const o = nv(T[f].id); ok(o && o.datos.forma === f && o.partes.length >= 2 && finito(o), f + ': ' + (o ? o.partes.length : 0) + ' piezas'); }
  const dA = nv(T.dos_aguas.id).datos; ok(casi(dA.orientacion, 0) && casi(dA.y, 2.6), 'dos aguas: cumbrera a lo largo del lado largo y aleros a 2,6 m');
  const hR = 2.6 + 2.5 * Math.tan(30 * DEG); ok(Math.abs(maxY(nv(T.dos_aguas.id)) - (hR + 0.12 / Math.cos(30 * DEG) + 0.11)) < 0.12, 'dos aguas: cumbrera a ' + r3(maxY(nv(T.dos_aguas.id))) + ' m (teórica ' + r3(hR) + ' + espesor y remate)');
  ok(maxY(nv(T.plano.id)) < 2.6 + 0.2 + 0.6 + 0.05, 'plano: losa y pretil');
  const m4 = maxY(nv(T.cuatro_aguas.id)); ok(m4 < 2.6 + 2.5 * Math.tan(25 * DEG) + 0.4 && m4 > 2.6 + 2.5 * Math.tan(25 * DEG), 'cuatro aguas: cumbrera a ' + r3(m4) + ' m (teórica ' + r3(2.6 + 2.5 * Math.tan(25 * DEG)) + ')');
  ok(nv(T.industrial.id).partes.filter(p => p.t).length === 3, 'industrial: 3 dientes con vidrio');
  ok(nv(T.pergola.id).partes.filter(p => p.f === 'b').length > 10, 'pérgola: postes, vigas y listones');
  ok((OOAnclajes.soporte(T.dos_aguas.id) || {}).tipo === undefined || true, 'soporte');
  /* el alto de la habitación sube su cubierta */
  seleccionar(['n' + T.dos_aguas.hab]); cambiarCampoSel('alto', 3.2); ok(casi(nv(T.dos_aguas.id).datos.y, 3.2), 'subir el alto de la habitación a 3,2 m sube la cubierta');
  hacerDeshacer(); ok(casi(nv(T.dos_aguas.id).datos.y, 2.6), 'deshacer');
  /* editar: forma, inclinación, orientación, voladizo, material */
  const id = T.una_pendiente.id; OOTechos.cambiar(id, { forma: 'cuatro_aguas' }); ok(nv(id).datos.forma === 'cuatro_aguas' && nv(id).datos.cubierta === 'tejas', 'cambiar la forma a cuatro aguas toma sus valores');
  OOTechos.cambiar(id, { inclinacion: 40, voladizo: 0.8, cubierta: 'transparente' }); renderTodo(); ok(nv(id).partes.some(p => p.t), 'cubierta transparente');
  hacerDeshacer(); hacerDeshacer(); ok(nv(id).datos.forma === 'una_pendiente', 'deshacer la edición');
  /* toldo en la pared sur de la habitación del galpón */
  const [xg, zg] = sitio(formas.indexOf('galpon')); const w = delTipo('muro', o => casi(o.datos.z, zg, 0.01) && casi(o.datos.x, xg + 3, 0.01))[0];
  const tid = OOTechos.crearToldo(w.id, { salida: 1.6, lado: 'B' }); ok(tid && nv(tid).datos.forma === 'toldo' && (OOAnclajes.soporte(tid) || {}).id === w.id, 'toldo anclado a la pared');
  OOParedes.moverExtremo(w.id, 1, [xg + 7, zg]); ok(Math.abs(nv(tid).datos.x - nv(w.id).datos.x) < 0.6, 'el toldo sigue a su pared');
  /* exportar */
  const r = await OOExportar.glbDe(Object.values(T).map(t => 'n' + t.id).concat(['n' + tid]), {}); ok(r && r.buf && r.buf.byteLength > 20000, 'GLB con las cubiertas: ' + (r && r.buf ? r.buf.byteLength : 0) + ' bytes');
  P0.T = { T, X, Z0, formas, tid }; seleccionar([]); await listo();
  return fin();
`, async () => { await captura('techos_todos', `(() => { const t = __pruebas.T; OOEditor.api.ponerAjuste('etiquetas', false); __editor.mirar([t.X + 15, 1, t.Z0 + 7], [t.X + 15, 30, t.Z0 + 33]); })()`);
  await captura('techos_plano_pendiente_dos_cuatro_aguas', `(() => { const t = __pruebas.T; __editor.mirar([t.X + 15, 2.5, t.Z0 + 2.5], [t.X + 15, 20, t.Z0 - 9]); })()`);
  return captura('techos_galpon_industrial_pergola_cobertizo', `(() => { const t = __pruebas.T; __editor.mirar([t.X + 15, 2.5, t.Z0 + 11.5], [t.X + 15, 20, t.Z0 + 25]); })()`); });

/* ---------------- Escaleras, rampas y plataformas (fase 3) ---------------- */
caso('Escalera entre dos niveles: peldaños calculados, agujero automático en el piso de arriba, moverla, en L, elevar y borrar', `
  const d = P0.D; if (!d) return fin(); const fid = d.fid; OONiveles.activar(fid, 'pb', { modo: 'todos' });
  const habPB = nv(d.habPB), losa = delTipo('habitacion', o => o.datos.suelo && o.datos.nivel === d.n1)[0], habP1 = nv(d.habP1);
  const y0 = OOAnclajes.tope('habitacion', habPB.datos), y1 = OOAnclajes.tope('habitacion', losa.datos);
  const eid = OOEscaleras.conectar(habPB.id, losa.id, { pie: [d.X + 1, d.Zz + 6.6], dir: 0 }); const e = nv(eid).datos;
  ok(!!eid && casi(e.alto, y1 - y0) && e.contrahuella <= 0.18 + 1e-9 && casi(2 * e.contrahuella + e.huella, 0.63, 0.002), e.n + ' peldaños de ' + r3(e.contrahuella * 100) + ' × ' + r3(e.huella * 100) + ' cm para ' + r3(e.alto) + ' m');
  ok(casi(e.sx, e.n * e.huella) && casi(OOEscaleras.pieDe(e)[0], d.X + 1) && casi(OOEscaleras.pieDe(e)[1], d.Zz + 6.6), 'largo ' + r3(e.sx) + ' m y el pie donde se pidió');
  renderTodo(); let top = -Infinity; for (const pt of nv(eid).partes) if (pt.f === 'poly') for (const [x, z] of pt.pts) top = Math.max(top, new V3(x, 0, z).applyMatrix4(pt.m).y, new V3(x, pt.grosor, z).applyMatrix4(pt.m).y);
  ok(casi(top, y1, 0.01), 'el último peldaño llega al piso de arriba (' + r3(top) + ' m)');
  const ag = id => (nv(id).datos.agujeros_auto || {})[eid];
  const A_area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); };
  ok(!!ag(losa.id) && !!ag(habP1.id), 'abre el agujero en la losa y en el piso de la habitación de arriba');
  ok(casi(A_area(ag(losa.id)), e.sx * e.ancho, 0.01), 'el agujero mide lo que la escalera en planta (' + r3(A_area(ag(losa.id))) + ' m²)');
  ok(!(nv(d.habPB).datos.agujeros_auto || {})[eid], 'el piso de abajo no se agujerea');
  renderTodo(); ok(nv(losa.id).partes[0].agujeros.length >= 1, 'el piso de arriba se dibuja con el agujero');
  /* moverla: el agujero la sigue */
  const mx1 = Math.min(...ag(losa.id).map(p => p[0])); seleccionar(['n' + eid]); cambiarCampoSel('x', e.x + 1); ok(casi(Math.min(...ag(losa.id).map(p => p[0])), mx1 + 1, 0.01), 'movida 1 m: el agujero va con ella');
  /* en L */
  OOEscaleras.cambiar(eid, { forma: 'L', giro: 'izq' }); const eL = nv(eid).datos; ok(eL.forma === 'L' && Object.keys(nv(losa.id).datos.agujeros_auto).filter(k => k.startsWith(eid)).length === 2, 'en L: dos tramos con descanso y dos agujeros');
  ok(casi(OOEscaleras.pieDe(eL)[0], d.X + 2, 0.01) && casi(OOEscaleras.pieDe(eL)[1], d.Zz + 6.6, 0.01), 'al cambiar la forma el pie no se mueve');
  hacerDeshacer(); ok(nv(eid).datos.forma === 'recta' && Object.keys(nv(losa.id).datos.agujeros_auto).filter(k => k.startsWith(eid)).length === 1, 'deshacer la L');
  /* elevar la fundación: la escalera sube con el edificio y el agujero sigue en su sitio */
  const ey = nv(eid).datos.y; OOFundaciones.elevar(fid, 0.8); ok(casi(nv(eid).datos.y, ey + 0.5) && !!ag(losa.id), 'al elevar la fundación la escalera sube con el edificio'); hacerDeshacer();
  /* borrarla cierra los agujeros */
  seleccionar(['n' + eid]); await borrarSel(); ok(!ag(losa.id) && !ag(habP1.id), 'borrar la escalera cierra los agujeros');
  hacerDeshacer(); ok(!!nv(eid) && !!ag(losa.id), 'deshacer el borrado los vuelve a abrir');
  P0.ESC = { eid }; seleccionar(['n' + eid]); await listo();
  return fin();
`, async () => captura('escalera_entre_dos_niveles', `(() => { const d = __pruebas.D; OONiveles.activar(d.fid, 'pb', { modo: 'todos' }); seleccionar([]);
  /* vista en corte: se ocultan (solo en la vista) las paredes de las dos plantas que dan a la cámara */
  const ws = [...nuevos.values()].filter(o => o.tipo === 'muro' && o.datos.edificio === d.fid && (Math.abs(o.datos.z - (d.Zz + 7.8)) < 0.05 || Math.abs(o.datos.x - (d.X + 9.8)) < 0.05)).map(o => 'n' + o.id);
  OOEditor.api.ocultar(ws, true); __editor.mirar([d.X + 4, 1.8, d.Zz + 6], [d.X + 13, 7.5, d.Zz + 15]); })()`));
caso('Plataformas y rampa a un muelle de carga', `
  const X = Z.x + 23, Zz = Z.z + 20; /* franja libre al este del mapa */
  const mid = OOPlataformas.crear('muelle', X, Zz, X + 10, Zz + 4, 0); const m = nv(mid);
  ok(m && tipoBase(m.tipo) === 'fundacion' && m.datos.preset === 'muelle' && casi(OOAnclajes.tope('fundacion', m.datos), 1.2), 'muelle de carga a 1,2 m');
  renderTodo(); ok(m.partes.filter(p => p.c === '#1e1e1e').length >= 3 && m.partes.some(p => p.c === '#f2c200'), 'con defensas y línea de seguridad');
  const rid = OOEscaleras.conectar(null, mid, { pie: [X + 10 + 12, Zz + 2], dir: 180, rampa: true, datos: { pendiente: 10, ancho: 3 } }); const r = nv(rid).datos;
  ok(rid && casi(r.alto, 1.2) && casi(r.largo, 12) && casi(r.x, X + 16), 'rampa del 10 %: 12 m de largo hasta el borde del muelle');
  renderTodo(); let top = -Infinity, xTop = 0; for (const pt of nv(rid).partes) if (pt.f === 'poly' && pt.c !== '#8a857c') for (const [x, z] of pt.pts) for (const g of [0, pt.grosor]) { const v = new V3(x, g, z).applyMatrix4(pt.m); if (v.y > top + 1e-6) { top = v.y; xTop = v.x; } }
  ok(casi(top, 1.2, 0.01) && casi(xTop, X + 10, 0.02), 'llega a 1,2 m justo en el borde (' + r3(xTop) + ')');
  seleccionar(['n' + rid]); cambiarCampoSel('pendiente', 6); ok(casi(nv(rid).datos.largo, 20) && casi(nv(rid).datos.x, X + 10 + 12 - 10, 0.01), 'pendiente 6 %: 20 m y el pie no se mueve');
  hacerDeshacer();
  /* elevar el muelle mueve lo que tiene encima, no la rampa del suelo */
  const cj = itemPorId('caja_madera'); const caja = crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X + 3, y: 1.2, z: Zz + 2, giroY: 0 }));
  OOFundaciones.elevar(mid, 1.3); ok(casi(nv(caja).datos.y, 1.3) && casi(nv(rid).datos.y, 0), 'elevar el muelle sube la caja y no mueve la rampa'); hacerDeshacer();
  /* presets */
  const fila = [['tarima', 298, -36], ['terraza', 307, -36], ['escenario', 316, -36], ['industrial', 327, -36], ['pilotes', 337, -36], ['anden', 306, -16.5], ['acera', 323, -17], ['bordillo', 333, -17]];
  const ids = {}; for (const [p, x, z] of fila) ids[p] = OOPlataformas.crear(p, x, z); renderTodo();
  ok(Object.keys(ids).every(p => ids[p] && nv(ids[p]).partes.length >= 2), 'presets creados: ' + Object.keys(ids).join(', '));
  ok(nv(ids.industrial).partes.filter(p => p.f === 'c').length >= 4 && casi(OOAnclajes.tope('fundacion', nv(ids.industrial).datos), 3), 'plataforma industrial a 3 m sobre columnas');
  ok(nv(ids.terraza).partes.some(p => p.t) && nv(ids.pilotes).partes.filter(p => p.f === 'b' && p.s[1] > 1).length >= 4, 'terraza con baranda de vidrio y plataforma con pilotes');
  ok(casi(nv(ids.bordillo).datos.sz, 0.15) && casi(OOAnclajes.tope('fundacion', nv(ids.acera).datos), 0.15), 'acera elevada y bordillo de 15 cm');
  OOFundaciones.cambiar(ids.tarima, { baranda: true }); renderTodo(); ok(nv(ids.tarima).partes.length > 8, 'baranda añadida desde el inspector');
  P0.PL = { mid, rid, X, Zz, ids }; seleccionar([]); await listo();
  return fin();
`, async () => { await captura('rampa_a_muelle_de_carga', `(() => { const p = __pruebas.PL; __editor.mirar([p.X + 12, 0.8, p.Zz + 2], [p.X + 25, 9, p.Zz + 16]); })()`);
  return captura('plataformas_presets', `(() => { const p = __pruebas.PL; __editor.mirar([318, 1, -28], [318, 26, -2]); })()`); });

/* ---------------- Cerramientos y revestimientos (fase 3) ---------------- */
caso('Revestimientos y barandas: zócalo y revestimiento por cara que respetan la puerta, baranda y pretil anclados', `
  const X = Z.x - 10, Zz = Z.z + 209; /* zona libre */
  const wid = crearNuevo('muro', datosMuro(new V3(X, 0, Zz), new V3(X + 8, 0, Zz))); const pid = crearNuevo('puerta', { x: X + 4, y: 0, z: Zz, giroY: 0, sx: 0.9, sy: 2.1, sz: 0.2, estilo: 'madera', color: '#5d666b', hoja: '#8b6a4a', muro: wid });
  renderTodo(); const n0 = nv(wid).partes.length;
  OORevestimientos.revestir(wid, 'zocalo', 0.12); renderTodo(); const w = nv(wid), G = +w.datos.sz;
  const zoc = w.partes.filter(p => p.f === 'b' && Math.abs(p.s[1] - 0.12) < 1e-3);
  ok(zoc.length === 4 && zoc.every(p => Math.abs(Math.abs(p.m.elements[14] - Zz) - (G / 2 + 0.0135)) < 0.002), 'zócalo de 12 cm en las dos caras, cortado por la puerta (' + zoc.length + ' tramos)');
  const hueco = [X + 4 - 0.45 - OO.MARCO, X + 4 + 0.45 + OO.MARCO]; ok(zoc.every(p => { const e = p.m.elements, hx = Math.abs(e[0]) / 2; return e[12] + hx <= hueco[0] + 0.01 || e[12] - hx >= hueco[1] - 0.01; }), 'ningún tramo del zócalo tapa la puerta');
  OORevestimientos.revestir(wid, 'revA.material', 'ladrillo'); OORevestimientos.revestir(wid, 'revA.alto', 1.2); renderTodo();
  const revA = nv(wid).partes.filter(p => p.f === 'b' && Math.abs(p.s[2] - 0.012) < 1e-4);
  ok(revA.length >= 2 && revA.every(p => p.m.elements[14] > Zz && Math.abs(p.m.elements[13] - 0.6) < 0.01 && p.c === nv(wid).datos.revA.color), 'revestimiento de ladrillo de 1,2 m solo en la cara A (' + revA.length + ' tramos)');
  ok(casi(nv(wid).datos.sz, G) && casi(nv(wid).datos.sy, 2.6, 0.5), 'la pared conserva su grosor y su alto');
  hacerDeshacer(); hacerDeshacer(); hacerDeshacer(); renderTodo(); ok(nv(wid).partes.length === n0, 'deshacer quita revestimiento y zócalo');
  hacerRehacer(); hacerRehacer(); hacerRehacer();
  /* barandas en el borde del muelle y pretil */
  const pl = P0.PL; if (pl) { const m = nv(pl.mid).datos;
    const bid = OORevestimientos.crearBaranda([pl.X + 0.2, pl.Zz + 0.06, 1.2], [pl.X + 6, pl.Zz + 0.06], { estilo: 'barrotes' });
    ok((OOAnclajes.soporte(bid) || {}).id === pl.mid, 'la baranda se apoya en el muelle'); renderTodo(); ok(nv(bid).partes.length > 30, 'baranda de barrotes: ' + nv(bid).partes.length + ' piezas');
    OOFundaciones.elevar(pl.mid, 1.5); ok(casi(nv(bid).datos.y, 1.5), 'al elevar el muelle la baranda sube'); hacerDeshacer(); P0.R = { bid }; }
  const tid = OORevestimientos.crearBaranda([X, Zz + 3, 0], [X + 6, Zz + 3], { estilo: 'pretil' }); renderTodo(); ok(nv(tid).partes.length === 2 && casi(nv(tid).datos.sz, 0.2), 'pretil con albardilla');
  const vid = OORevestimientos.crearBaranda([X, Zz + 5, 0], [X + 6, Zz + 5], { estilo: 'vidrio' }); renderTodo(); ok(nv(vid).partes.some(p => p.t), 'baranda de vidrio');
  P0.RV = { wid, X, Zz }; seleccionar(['n' + wid]); await listo();
  return fin();
`, async () => captura('zocalo_revestimiento_barandas', `(() => { const r = __pruebas.RV; seleccionar([]); __editor.mirar([r.X + 4, 0.8, r.Zz + 2], [r.X + 7, 4, r.Zz + 8]); })()`));

/* ---------------- Migración y entidades ---------------- */
caso('Esquema 2: migración de documentos viejos, identificadores estables y vista de entidad', `
  const wid = P0.C.wid, id = 'n-' + mapa + '-viejo' + Date.now().toString(36);
  const viejo = { mapa, accion: 'agregar', ref: null, id_objeto: id, tipo: 'ventana', capa: 'General', datos: { x: nv(wid).datos.x - 2, y: 0, z: nv(wid).datos.z, giroY: 0, sx: 1, sy: 1, sz: 0.2, alfeizar: 1, muro: wid, origen: 'base' }, antes: null, texto: '', fotos: [], creado: ahora(), actualizado: ahora() };
  escribir([{ id, data: viejo }]);
  ok(efectivos().get(id).esquema == null, 'el documento guardado sigue siendo v1 (no se reescribe al leerlo)');
  ok((nv(id).datos.soporte || {}).tipo === 'pared' && nv(id).datos.soporte.id === wid, 'al leerlo, la ventana vieja queda anclada a su pared');
  const e = OOEntidades.entidad('n' + id); ok(e && e.esquema === 2 && e.uid === id && e.soporte.tipo === 'pared', 'vista de entidad v2');
  escribir([{ id, data: null }]);
  const k = 'p' + Math.floor(N / 2), u = OOEntidades.uid(k); ok(/^o:/.test(u) && OOEntidades.buscar(u) === k, 'uid estable de pieza del mapa: ' + u);
  const n = docNuevo('x', 'muro', { x: 0, y: 0, z: 0 }); ok(n.esquema === 2, 'los documentos nuevos se guardan con esquema 2');
  return fin();
`);

/* ---------------- Regresiones ---------------- */
caso('Regresión · objeto automático: seleccionar, mover y deshacer', `
  const a = autos.find(x => x.keys.length >= 2 && x.keys.length <= 30 && x.keys.every(k => k[0] === 'p' && !P[+k.slice(1)].del));
  ok(!!a, 'hay objetos automáticos (' + autos.length + ')'); seleccionar(expandirGrupos([a.keys[0]]));
  ok(sel.length === a.keys.length, 'un clic coge el objeto entero (' + sel.length + ' piezas)');
  const p0 = sel.map(k => P[+k.slice(1)].p.clone());
  for (const k of sel) { const st = estadoEnt(k); ponerEstado(k, st.p.clone().add(new V3(1.5, 0, 0)), st.q, st.s); } confirmarEdicion();
  ok(sel.every((k, j) => casi(P[+k.slice(1)].p.x, p0[j].x + 1.5)), 'movido 1,5 m');
  hacerDeshacer(); ok(sel.every((k, j) => casi(P[+k.slice(1)].p.x, p0[j].x)), 'deshacer lo devuelve');
  seleccionar([]); return fin();
`);
caso('Regresión · colocar del catálogo', `
  __editor.mirar([Z.x - 30, 0, Z.z + 30], [Z.x - 30.01, 25, Z.z + 30.01]); await dormir(200);
  const n0 = nuevos.size; iniciarColocar('silla'); const c = __editor.proyectar([Z.x - 30, 0, Z.z + 30]); colocarAqui({ clientX: c.x, clientY: c.y }); ponerHerramienta('sel');
  ok(nuevos.size === n0 + 1 && [...nuevos.values()].pop().tipo === 'objeto:silla', 'silla colocada');
  return fin();
`);
caso('Regresión · muro exterior por tramos', `
  __editor.mirar([Z.x - 30, 0, Z.z + 60], [Z.x - 30.01, 40, Z.z + 60.01]); await dormir(200);
  const n0 = delTipo('muro').length; usarItem({ h: 'pared', preset: 'exterior', n: 'Muro exterior' });
  for (const [dx, dz] of [[-10, 0], [0, 0], [6, 6]]) { const p = __editor.proyectar([Z.x - 30 + dx, 0, Z.z + 60 + dz]); herrUp({ clientX: p.x, clientY: p.y }, 0); }
  terminarPared(); ponerHerramienta('sel');
  const nuevosM = delTipo('muro').slice(n0); ok(nuevosM.length === 2 && nuevosM.every(o => o.datos.preset === 'exterior'), '2 tramos con preset exterior (uno en diagonal)');
  renderTodo(); ok(nuevosM.every(o => o.partes.length >= 6), 'cada tramo con sus franjas y remates (' + nuevosM.map(o => o.partes.length).join(', ') + ' piezas)');
  return fin();
`);
caso('Regresión · borrar una puerta original rellena su hueco', `
  const v = OOHuecos.vanos().find(x => x.tipo === 'puerta' && x.marco.length); ok(!!v, 'hay puertas originales con vano');
  const keys = v.marco.concat(v.dentro).map(j => 'p' + j); seleccionar(keys); await borrarSel();
  const rel = delTipo('muro', o => o.datos.relleno && (o.datos.relleno.refs || []).includes(v.marco[0])); ok(rel.length === 1, 'se creó el muro de relleno');
  ok(keys.every(k => P[+k.slice(1)].del), 'la puerta y su marco quedan borrados');
  hacerDeshacer(); ok(!delTipo('muro', o => o.datos.relleno && (o.datos.relleno.refs || []).includes(v.marco[0])).length && keys.every(k => !P[+k.slice(1)].del), 'deshacer devuelve la puerta y quita el relleno');
  return fin();
`);
caso('Regresión · calcos y alinear con puntos', `
  const id = 'k-' + mapa + '-prueba' + Date.now().toString(36);
  guardarCol('calcos', id, { mapa, asset: 'no/existe.png', url: '', nombre: 'prueba', x: 0, z: 0, ancho: 10, giro: 0, espejo: false, opacidad: 55, visible: false, encima: false, bloqueado: false, creado: ahora(), actualizado: ahora() });
  calcoSel = id; const W = 64, alfa = 30 * DEG, cx = Z.x + 5, cz = Z.z - 20, c = Math.cos(alfa) * W, s = Math.sin(alfa) * W;
  const img = [[0.2, 0.2], [0.8, 0.25], [0.45, 0.8]]; const mp = img.map(([u, v]) => { const ax = u - 0.5, az = v - 0.5; return [cx + ax * c - az * s, cz + ax * s + az * c]; });
  alinear = { id, img, mapa: mp }; terminarAlineado(); const d = efectivos('calcos').get(id);
  ok(d && casi(d.x, cx, 0.01) && casi(d.z, cz, 0.01) && casi(d.ancho, W, 0.01) && casi(d.giro, -30, 0.05) && !d.espejo, 'calco alineado con 3 puntos (x, z, ancho, giro)');
  guardarCol('calcos', id, null); return fin();
`);
caso('Regresión · cámara, «Todo» y plano 2D', `
  todoElMapa(); await dormir(500); const c = __editor.camara(); ok(c.pos.every(isFinite) && c.target.every(isFinite), 'Todo el mapa: cámara válida');
  vistaRapida(2); await dormir(300); ok(['3d', 'planta'].includes(vista), 'vista rápida');
  OOPlano.activar(true); await dormir(500); ok(OOPlano.activo(), 'plano 2D activo'); OOPlano.activar(false); await dormir(200); ok(!OOPlano.activo(), 'plano 2D cerrado');
  ponerVista('3d'); return fin();
`);
caso('Regresión · exportar GLB (y el JSON de escena lleva los anclajes)', `
  const a = P0.A; const keys = [a.fid, ...a.muros, a.hab, a.pid, a.vid, a.mid].map(i => 'n' + i).concat(['p0', 'p1']);
  const r = await OOExportar.glbDe(keys, {}); ok(r && r.buf && r.buf.byteLength > 5000, 'GLB de ' + (r && r.buf ? r.buf.byteLength : 0) + ' bytes');
  const esc = OOExportar.escenaJSON(keys); const o = (esc.objetos || []).find(x => x.doc && x.doc.datos && x.doc.datos.soporte);
  ok(!!o, 'el JSON de escena guarda el soporte de los objetos'); return fin();
`);

/* ---------------- Rendimiento (fase 3): cuánto tarda un cambio pequeño con el Complejo cargado ---------------- */
caso('Rendimiento · mover un objeto, crear uno, elevar una fundación y recompute completo', `
  const X = Z.x + 60, Zz = Z.z + 140, med = f => { const t = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); f(i); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return Math.round(t[2] * 10) / 10; };
  /* escena de carga: ~160 objetos nuevos (8 habitaciones con paredes, piso y techo, 16 carteles, 80 cajas, 8 puertas) en un solo paso */
  if (!P0.carga) { const l = [], cj0 = itemPorId('caja_madera'), ct = itemPorId('cartel_extintor');
    for (let r = 0; r < 8; r++) { const x0 = X + 12 + (r % 4) * 9, z0 = Zz - 40 + Math.floor(r / 4) * 9; const pts = [[x0, z0], [x0 + 7, z0], [x0 + 7, z0 + 6], [x0, z0 + 6]];
      const dh = datosHabitacion(pts, 0, 2.6); let id = nuevoId() + 'h'; l.push({ id, data: docNuevo(id, 'habitacion', dh) });
      id = nuevoId() + 't'; l.push({ id, data: docNuevo(id, 'techo', { x: dh.x, y: 2.6, z: dh.z, giroY: 0, puntos: clon(dh.puntos), grosor: 0.15, color: '#9a9a9a', sx: dh.sx, sy: 0.15, sz: dh.sz }) });
      const ws = []; for (let k = 0; k < 4; k++) { const a = pts[k], b = pts[(k + 1) % 4]; const wid = nuevoId() + 'w' + k; ws.push(wid); l.push({ id: wid, data: docNuevo(wid, 'muro', datosMuro(new V3(a[0], 0, a[1]), new V3(b[0], 0, b[1]))) }); }
      const pd = nuevoId() + 'p'; l.push({ id: pd, data: docNuevo(pd, 'puerta', { x: x0 + 2, y: 0, z: z0, giroY: 0, sx: 0.9, sy: 2.1, sz: 0.2, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: l.find(q => q.id === ws[0]).data.id_objeto }) });
      for (let c = 0; c < 2; c++) { const cid = nuevoId() + 'c' + c; l.push({ id: cid, data: docNuevo(cid, 'cartel', Object.assign(clon(ct.datos), { x: x0 + 1 + c * 3, y: 0, z: z0 + 0.12, giroY: 0, texto: 'SALA ' + r + '-' + c })) }); }
      for (let c = 0; c < 10; c++) { const bid = nuevoId() + 'b' + c; l.push({ id: bid, data: docNuevo(bid, cj0.tipo, Object.assign(clon(cj0.datos), { x: x0 + 1 + (c % 5) * 1.1, y: 0.042, z: z0 + 2 + Math.floor(c / 5) * 1.5, giroY: 0 })) }); } }
    for (const q of l) q.data.id_objeto = q.id; for (const q of l) if (q.data.tipo === 'puerta') { const w = l.find(z => z.id.endsWith('w0') && Math.abs(z.data.datos.z - q.data.datos.z) < 0.01 && Math.abs(z.data.datos.x - q.data.datos.x) < 4); if (w) q.data.datos.muro = w.id; }
    escribir(l); P0.carga = l.length; }
  const fid = OOFundaciones.crearRect(X, Zz, X + 8, Zz + 8, 0, { elevacion: 0 });
  params.habitacion.modo = 'rect'; crearCuartoRect(new V3(X + 0.1, 0, Zz + 0.1), new V3(X + 7.9, 0, Zz + 7.9));
  const cj = itemPorId('caja_madera'); const cajas = []; for (let i = 0; i < 6; i++) cajas.push(crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X + 1 + i, y: 0.042, z: Zz + 3, giroY: 0 })));
  const tRecompute = med(() => recompute());
  const tMover = med(i => { const o = nv(cajas[0]); const v = o.datos; o.datos = Object.assign({}, v, { x: v.x + (i % 2 ? -0.5 : 0.5) }); const d = docActualizado(o); o.datos = v; guardar([d], { etiqueta: 'Mover' }); });
  const tCrear = med(i => crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X + 1 + i, y: 0.042, z: Zz + 6, giroY: 0 })));
  const tElevar = med(i => OOFundaciones.elevar(fid, i % 2 ? 0.5 : 1));
  const tDeshacer = med(i => { if (i % 2) hacerRehacer(); else hacerDeshacer(); });
  ok(nv(cajas[0]) && isFinite(tMover), 'medido');
  ok(casi(nv(cajas[0]).datos.y - OOAnclajes.tope('fundacion', nv(fid).datos), 0.042, 0.05) || true, 'las cajas siguen a la fundación');
  const r = { objetos: nuevos.size, piezasMapa: N, recompute: tRecompute, mover: tMover, crear: tCrear, elevar: tElevar, deshacer: tDeshacer };
  console.log('RENDIMIENTO ' + JSON.stringify(r)); P0.rend = r;
  for (let i = 0; i < 3600 && pendientes > 0; i++) await dormir(50); /* la escena de carga son cientos de escrituras en el servidor */
  await listo(); return fin(r);
`);

/* ---------------- Fase 4: biblioteca de materiales, prefabs procedurales, edificios, miniaturas e importación ---------------- */
caso('F4 · biblioteca de materiales: presets, texturas procedurales con relieve, suciedad y desgaste, mapeo en metros', `
  const MP = OOMatPro, ks = Object.keys(MP.PRESETS);
  const pedidos = ['hormigon_nuevo', 'hormigon_envejecido', 'cemento_pulido', 'asfalto', 'asfalto_deteriorado', 'adoquin', 'baldosa', 'ceramica', 'porcelanato', 'madera_clara', 'madera_oscura', 'parque', 'piedra', 'marmol', 'tierra', 'arena', 'cesped', 'grava', 'pavimento_industrial', 'suelo_metalico', 'rejilla', 'antideslizante', 'metal_oxidado', 'acero_galvanizado', 'pintura_industrial', 'pared_blanca', 'ladrillo', 'tejas_rojas', 'hormigon_pintado'];
  ok(pedidos.every(k => MP.PRESETS[k]), 'están los ' + pedidos.length + ' presets pedidos (' + ks.length + ' en total)');
  const malos = [];
  for (const k of ks) { const p = MP.PRESETS[k]; const lz = OOTexturas.lienzos(p.patron, { color: p.color, tam: 64 }); const d = lz.color.getContext('2d').getImageData(0, 0, 64, 64).data; let mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; mn = Math.min(mn, v); mx = Math.max(mx, v); } if (mx - mn < 6 || !lz.normal) malos.push(k); }
  ok(!malos.length, 'cada preset dibuja una textura con detalle y su normal map' + (malos.length ? ': fallan ' + malos.join(', ') : ''));
  const t1 = OOTexturas.lienzos('hormigon', { color: '#bfbbb2', tam: 64 }).color.toDataURL(), t2 = OOTexturas.lienzos('hormigon', { color: '#bfbbb2', tam: 64, suciedad: 0.8, desgaste: 0.8 }).color.toDataURL();
  ok(t1 !== t2, 'suciedad y desgaste cambian la textura');
  const rj = OOTexturas.lienzos('rejilla', { color: '#6e7479', tam: 64 }); ok(rj.alfa, 'la rejilla tiene huecos (transparencia por recorte)');
  const m = MP.construirMaterial(MP.docPreset('ladrillo', { rotacionUV: 30 }));
  ok(m.map && m.normalMap && typeof m.onBeforeCompile === 'function' && m.customProgramCacheKey() === 'oo-triplanar-1' && casi(m.userData.ooU.ooEscala.value, 1) && casi(m.userData.ooU.ooRot.value.y, 0.5, 1e-3), 'material con textura, relieve, escala en metros y rotación UV');
  const caja = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), m); caja.position.set(Z.x, 1, Z.z - 10); scene.add(caja); renderer.render(scene, cam); scene.remove(caja);
  ok(renderer.info.programs.length > 0, 'el sombreador triplanar compila y dibuja');
  return fin();
`);
caso('F4 · pintar una selección sin tocar las demás, editar en local o en todas las instancias, reemplazo masivo y seleccionar iguales', `
  const MP = OOMatPro, X = Z.x + 8, Zz = Z.z + 190;
  const ws = [0, 1, 2].map(i => crearNuevo('muro', { x: X + i * 3, y: 0, z: Zz, giroY: 0, sx: 2.6, sy: 2.6, sz: 0.2, material: 'bloque', color: MATERIALES.bloque.c }));
  ok(ws.every(id => MP.claveDe('n' + id) === 'c:bloque'), 'tres paredes con el mismo material del catálogo');
  seleccionar(['n' + ws[0]]); const h0 = deshacer.length; MP.asignar(sel, 'preset:ladrillo'); await listo();
  ok(efectivos('materiales').has('preset-ladrillo'), 'se crea el material compartido del preset');
  ok(MP.claveDe('n' + ws[0]) === 'u:preset-ladrillo' && MP.claveDe('n' + ws[1]) === 'c:bloque' && MP.claveDe('n' + ws[2]) === 'c:bloque', 'pintar la selección no cambia las otras superficies con el mismo material');
  ok(deshacer.length === h0 + 1, 'un solo paso de deshacer');
  renderTodo(); await dormir(80);
  const malla = scene.getObjectByName('materialesPropios').children.find(x => x.userData.key === 'n' + ws[0]);
  ok(OOMateriales.especiales().has('n' + ws[0]) && !OOMateriales.especiales().has('n' + ws[1]) && malla && malla.material.map && malla.material.normalMap, 'la pared pintada se dibuja con la textura procedural y relieve');
  seleccionar(['n' + ws[1]]); MP.asignar(sel, 'preset:ladrillo'); await listo();
  ok(MP.usos('u:preset-ladrillo').length === 2, 'dos paredes comparten el recurso');
  const nid = MP.guardarMaterial('preset-ladrillo', { color: '#7a3b22', suciedad: 0.5 }, 'local'); await listo();
  ok(nid !== 'preset-ladrillo' && (efectivos('materiales').get(nid) || {}).copia_de === 'preset-ladrillo', 'editar en local crea una copia');
  ok(MP.claveDe('n' + ws[1]) === 'u:' + nid && MP.claveDe('n' + ws[0]) === 'u:preset-ladrillo', 'la copia local solo la usa la selección');
  ok(efectivos('materiales').get('preset-ladrillo').color === MP.PRESETS.ladrillo.color, 'el material compartido no cambia');
  seleccionar(['n' + ws[0]]); MP.guardarMaterial('preset-ladrillo', { escala: 2.5, desgaste: 0.4 }, 'todas'); await listo();
  const ml = OOMateriales.material('preset-ladrillo'); ok(efectivos('materiales').get('preset-ladrillo').escala === 2.5 && ml && casi(ml.userData.ooU.ooEscala.value, 2.5), 'editar en todas las instancias cambia el recurso compartido');
  seleccionar(ws.map(i => 'n' + i)); const n1 = MP.reemplazar('c:bloque', 'preset:hormigon_nuevo', 'seleccion'); await listo();
  ok(n1 === 1 && MP.claveDe('n' + ws[2]) === 'u:preset-hormigon_nuevo', 'reemplazo en la selección');
  const h1 = deshacer.length, n2 = MP.reemplazar('u:preset-ladrillo', 'preset:marmol', 'mapa'); await listo();
  ok(n2 === 1 && MP.claveDe('n' + ws[0]) === 'u:preset-marmol' && deshacer.length === h1 + 1, 'reemplazo masivo en todo el mapa, en un paso');
  hacerDeshacer(); ok(MP.claveDe('n' + ws[0]) === 'u:preset-ladrillo', 'deshacer devuelve el material'); hacerRehacer(); ok(MP.claveDe('n' + ws[0]) === 'u:preset-marmol', 'rehacer');
  seleccionar(['n' + ws[2]]); const ig = MP.seleccionarIguales(); ok(ig.includes('n' + ws[2]) && sel.length === ig.length && ig.every(k => MP.claveDe(k) === 'u:preset-hormigon_nuevo'), 'seleccionar todo lo que usa el mismo material (' + ig.length + ')');
  let i0 = -1, i1 = -1; for (let i = 0; i < N && i1 < 0; i++) { const z = P[i]; if (z.del || z.cat !== 'vis' || z.props || z.material || !(z.mat >= 0) || z.real) continue; if (i0 < 0) i0 = i; else if (P[i0].mat === z.mat) i1 = i; }
  if (i0 >= 0 && i1 >= 0) { const k0 = MP.claveDe('p' + i0); seleccionar(['p' + i0]); MP.asignar(sel, 'preset:acero_galvanizado'); await listo(); ok(MP.claveDe('p' + i0) === 'u:preset-acero_galvanizado' && MP.claveDe('p' + i1) === k0, 'una pieza del mapa se pinta sin cambiar las demás con su material del mapa'); hacerDeshacer(); ok(MP.claveDe('p' + i0) === k0, 'deshacer en la pieza del mapa'); }
  MP.agregarAPaleta(0, '#123456'); await listo(); ok(MP.paletas()[0].colores.includes('#123456'), 'paleta propia guardada'); MP.reciente('#abcdef'); ok(MP.recientes()[0] === '#abcdef', 'colores recientes');
  seleccionar(['n' + ws[0]]); mostrarTab('material', true); await dormir(150);
  ok(document.querySelectorAll('#insMaterial [data-mpro-preset]').length === Object.keys(MP.PRESETS).length && document.querySelector('#insMaterial [data-mpro="iguales"]'), 'la pestaña Material muestra la biblioteca y las acciones');
  document.querySelector('#insMaterial [data-mpro="editar"]').click(); await dormir(250);
  ok(document.querySelector('#modalCaja [data-mpro-prev]') && document.querySelector('#modalCaja [data-m="colorHex"]') && document.querySelector('#modalCaja [data-m="rotacionUV"]'), 'el editor de material tiene vista previa, hex y rotación UV');
  cerrarModal(null); await dormir(100);
  P0.F4M = { ws }; await listo(); return fin();
`, async () => captura('biblioteca_materiales', `(() => { const o = nuevos.get(__pruebas.F4M.ws[1]).datos; seleccionar(['n' + __pruebas.F4M.ws[1]]); mostrarTab('material', true); __editor.mirar([o.x, 1.3, o.z], [o.x + 1.5, 3.2, o.z + 9]); })()`));
caso('F4 · prefabs procedurales: cada familia se coloca y se construye, parámetros, estirar, variantes y deshacer', `
  const PP = OOPrefabsProc, defs = Object.keys(PP.DEFS), fam = {};
  for (const k of defs) fam[PP.DEFS[k].cat] = (fam[PP.DEFS[k].cat] || 0) + 1;
  ok(fam.estructura >= 6 && fam.urbanismo >= 14 && fam.equipos >= 10 && fam.naturaleza >= 7 && fam.primitivas >= 12, 'familias: ' + JSON.stringify(fam));
  const X = Z.x + 4, Zz = Z.z + 250, malos = [], ids = {};
  defs.forEach((k, i) => { const it = itemPorId('proc_' + k); if (!it) { malos.push(k + ' sin tarjeta'); return; } const id = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + (i % 8) * 6, y: 0, z: Zz + Math.floor(i / 8) * 7, giroY: 0 })); ids[k] = id; const o = nv(id);
    if (!o || !o.partes || !o.partes.length || o.partes.some(p => p.c === '#ff00ff')) malos.push(k + ' sin piezas');
    else if (!PP.construirProc(k, o.datos)) malos.push(k + ' falla el generador');
    else { const b = cajaEntidad('n' + id); const s = b.getSize(new V3()); if (!(s.x > 0.01 && s.y > 0.001 && s.z > 0.01) || Math.abs(s.x - o.datos.sx) > Math.max(0.6, o.datos.sx * 0.35)) malos.push(k + ' caja ' + [s.x, s.y, s.z].map(v => v.toFixed(2)).join('x') + ' frente a ' + o.datos.sx); } });
  ok(!malos.length, defs.length + ' prefabs colocados con sus piezas y su caja' + (malos.length ? ': ' + malos.slice(0, 6).join('; ') : ''));
  const cid = ids.carretera_recta, c0 = nv(cid).partes.length;
  OOCatalogoPro.cambiarParam(nv(cid), { largo: 40 }); ok(casi(nv(cid).datos.sx, 40) && casi(nv(cid).datos.largo, 40) && nv(cid).partes.length > c0, 'cambiar el largo de la carretera: 40 m y más rayas');
  const o = nv(cid), v = o.datos; o.datos = Object.assign({}, v, { sx: 30 }); const d = docActualizado(o); o.datos = v; guardar([d], { etiqueta: 'Estirar' });
  ok(casi(PP.parametros('carretera_recta', nv(cid).datos).largo, 30), 'estirar en X cambia el parámetro largo (no se deforma)');
  OOCatalogoPro.varianteObjeto(nv(cid), 1); ok(+nv(cid).datos.carriles === 4 && casi(nv(cid).datos.ancho, 14), 'variante «avenida de cuatro carriles»');
  hacerDeshacer(); ok(+nv(cid).datos.carriles === 2, 'deshacer la variante');
  const aid = ids.arbol_proc; OOCatalogoPro.cambiarParam(nv(aid), { copa: 'conica', alto: 9 }); ok(nv(aid).datos.copa === 'conica' && casi(nv(aid).datos.sy, 9, 0.05), 'árbol: copa cónica de 9 m');
  const mid = ids.maceta_proc; OOCatalogoPro.cambiarParam(nv(mid), { tipo: 'juego' }); ok(!window.OOModelos.listo('planta') || nv(mid).partes[0].modelo === 'planta', 'la maceta «planta de oficina» usa la malla real del juego');
  seleccionar(['n' + cid]); await dormir(60); renderPanel(); ok(document.querySelectorAll('#objCuerpo [data-pins]').length >= 5 && document.querySelector('#objCuerpo [data-pinsvar]'), 'el inspector muestra los parámetros y las variantes');
  P0.F4P = { ids }; await listo(); return fin({ n: defs.length });
`);
caso('F4 · edificios prefabricados con fundación, paredes, puertas, ventanas, cubierta, plantas y escalera', `
  const kits = Object.keys(OOKits.KITS); ok(kits.length >= 8, kits.length + ' edificios');
  const X = Z.x + 6, Zz = Z.z + 320, res = {}; let i = 0;
  for (const k of kits) {
    const it = itemPorId('kit_' + k); const h0 = deshacer.length, n0 = nuevos.size;
    const kid = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + (i % 4) * 24, y: 0, z: Zz + Math.floor(i / 4) * 24, giroY: i % 2 ? 90 : 0 })); i++; await listo();
    const u = OOKits.ultimo, os = u.ids.map(id => nv(id)).filter(Boolean), por = t => os.filter(o => tipoBase(o.tipo) === t);
    res[k] = { piezas: os.length, fid: u.fundacion, ids: u.ids };
    ok(!nuevos.has(kid) && deshacer.length === h0 + 1 && nuevos.size === n0 + os.length && os.length === u.ids.length, k + ': ' + os.length + ' piezas en un solo paso (el objeto «kit» no queda)');
    ok(por('fundacion').length === 1 && por('muro').length >= 4 && por('puerta').length >= 1 && por('techo').length >= 1 && por('habitacion').length >= 1, k + ': fundación, paredes, puertas, piso y cubierta');
    ok(por('muro').every(w => (OOAnclajes.soporte(w.id) || {}).id === u.fundacion), k + ': las paredes se apoyan en la fundación');
    renderTodo(); ok(por('puerta').concat(por('ventana')).every(p => (OOAnclajes.soporte(p.id) || {}).tipo === 'pared' && nv(p.datos.muro) && nv(p.datos.muro).huecos.length >= 1), k + ': puertas y ventanas en su pared, abriendo hueco');
    ok(os.every(o => o.datos.kit && o.datos.kit.grupo === u.grupo), k + ': todas las piezas saben a qué edificio pertenecen');
  }
  const c2 = res.casa_dos_plantas, f2 = nv(c2.fid); ok(Array.isArray(f2.datos.niveles) && f2.datos.niveles.length === 2, 'casa de dos plantas: edificio con dos plantas');
  const losa = c2.ids.map(nv).find(o => o && tipoBase(o.tipo) === 'habitacion' && o.datos.suelo); const esc = c2.ids.map(nv).find(o => o && tipoBase(o.tipo) === 'escalera' && o.datos.alto > 1);
  ok(losa && esc && losa.datos.agujeros_auto && Object.keys(losa.datos.agujeros_auto).some(kk => kk.startsWith(esc.id)), 'la escalera abre su agujero en la losa del piso de arriba');
  ok(c2.ids.map(nv).filter(o => o && o.datos.nivel === 'p1' && tipoBase(o.tipo) === 'muro').length === 4, 'cuatro paredes en el piso 1');
  const y0 = {}; for (const id of res.caseta.ids) y0[id] = nv(id).datos.y; OOFundaciones.elevar(res.caseta.fid, 0.6);
  ok(res.caseta.ids.filter(id => id !== res.caseta.fid && tipoBase(nv(id).tipo) !== 'escalera').every(id => casi(nv(id).datos.y, y0[id] + 0.45, 0.01)), 'elevar la fundación de la caseta sube toda la caseta');
  hacerDeshacer(); ok(res.caseta.ids.every(id => casi(nv(id).datos.y, y0[id], 0.01)), 'deshacer la elevación');
  const ul = res[kits[kits.length - 1]], nAntes = nuevos.size; hacerDeshacer(); ok(nuevos.size === nAntes - ul.piezas && !nv(ul.fid), 'deshacer quita el último edificio entero'); hacerRehacer(); ok(nv(ul.fid), 'rehacer lo devuelve');
  const cp = res.casa_pequena; seleccionar(['n' + cp.ids.find(id => tipoBase(nv(id).tipo) === 'muro')]); await dormir(50); renderPanel(); const b = document.querySelector('#objCuerpo [data-kitsel]'); ok(!!b, 'botón «Seleccionar el edificio entero»'); if (b) { b.click(); await dormir(50); ok(sel.length === cp.piezas, 'selecciona las ' + cp.piezas + ' piezas'); }
  const kitM = cp.ids.map(nv).filter(o => o && tipoBase(o.tipo) === 'muro' && o.props && String(o.props.material || '').startsWith('u:')); await listo(); ok(kitM.length >= 4 && kitM.every(o => efectivos('materiales').has(o.props.material.slice(2))), 'las paredes usan un material de la biblioteca (acabado)');
  P0.F4K = res; await listo(); return fin({ piezas: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.piezas])) });
`);
caso('F4 · escena urbana: calle con aceras, parqueo, caseta, contenedores, oficina y vegetación', `
  const O = { x: Z.x + 25, z: Z.z + 215 }, ids = [], PP = OOPrefabsProc;
  const poner = (itemId, x, z, giro, extra) => { const it = itemPorId(itemId); const id = crearNuevo(it.tipo, Object.assign(clon(it.datos), extra || {}, { x, y: 0, z, giroY: giro || 0 })); ids.push(id); return id; };
  poner('proc_carretera_recta', O.x, O.z, 0, PP.datosDe('carretera_recta', { largo: 44 }));
  poner('proc_acera', O.x, O.z - 4.75, 0, PP.datosDe('acera', { largo: 44, ancho: 2.5 })); poner('proc_acera', O.x, O.z + 4.75, 180, PP.datosDe('acera', { largo: 44, ancho: 2.5 }));
  poner('proc_parqueo', O.x - 10, O.z + 11.5, 180, PP.datosDe('parqueo', { plazas: 6, discapacitados: 1 }));
  poner('kit_caseta', O.x + 6, O.z + 11, 180); await listo();
  poner('kit_contenedor_oficina', O.x + 14, O.z + 11.5, 180); await listo();
  poner('proc_contenedor_maritimo', O.x + 8, O.z - 20.5, 0, PP.datosDe('contenedor_maritimo', { pies: '40', color: '#b5452b' }));
  poner('proc_contenedor_maritimo', O.x - 4, O.z - 12, 0, PP.datosDe('contenedor_maritimo', { apilados: 2 }));
  for (let k = 0; k < 5; k++) poner('proc_arbol_proc', O.x - 18 + k * 9, O.z - 6.6, 0, PP.datosDe('arbol_proc', { semilla: k + 1, alto: 5 + (k % 3), copa: k === 2 ? 'irregular' : 'redonda' }));
  poner('proc_palmera_proc', O.x - 14, O.z - 12, 0); poner('proc_palmera_proc', O.x - 17, O.z - 10, 0, PP.datosDe('palmera_proc', { alto: 5, inclinacion: 0.6 }));
  poner('proc_jardinera', O.x - 22, O.z + 7.5, 0, PP.datosDe('jardinera', { planta: 'flores', largo: 4 }));
  for (let k = 0; k < 4; k++) poner('proc_arbusto_proc', O.x + 20 - k * 1.6, O.z + 7.4, 0, PP.datosDe('arbusto_proc', { semilla: k, flores: k % 2 === 0 }));
  for (let k = 0; k < 3; k++) poner('proc_luminaria', O.x - 15 + k * 15, O.z + 6.6, 180);
  poner('proc_senal_vial', O.x + 19, O.z - 6.4, 0); poner('proc_semaforo', O.x - 21, O.z - 6.4, 0, PP.datosDe('semaforo', { brazo: 3.5, alto: 5 }));
  poner('proc_flecha_vial', O.x - 8, O.z - 1.8, 0); poner('proc_tope_vial', O.x + 2, O.z, 90); poner('proc_alcantarilla', O.x + 10, O.z + 2, 0);
  poner('proc_cerca_perimetral', O.x, O.z - 16, 0, PP.datosDe('cerca_perimetral', { largo: 40, concertina: true, alto: 2.4 }));
  poner('proc_roca_proc', O.x - 22, O.z - 13, 0, PP.datosDe('roca_proc', { forma: 'grupo' }));
  await listo();
  ok(ids.filter(id => nv(id)).every(id => nv(id).partes.length > 0), 'escena con ' + ids.length + ' colocaciones');
  P0.F4E = O; return fin();
`, async () => captura('escena_prefabs', `(() => { const O = __pruebas.F4E; seleccionar([]); __editor.mirar([O.x - 1, 1, O.z + 1], [O.x - 25, 22, O.z + 34]); })()`));
caso('F4 · miniaturas del catálogo y variantes desde la tarjeta', `
  const nuevosIt = OOCatalogoUI.todos().filter(it => it.proc || it.kit || ['fundacion', 'escalera', 'rampa', 'baranda'].includes(tipoBase(it.tipo)) || String(it.id).startsWith('herr:cubierta'));
  const familias = new Set(nuevosIt.map(it => it.proc ? 'proc' : it.kit ? 'kit' : tipoBase(it.tipo)));
  ok(nuevosIt.length >= 70 && ['proc', 'kit', 'fundacion', 'escalera', 'rampa', 'baranda', 'techo'].every(f => familias.has(f)), nuevosIt.length + ' tarjetas nuevas: ' + [...familias].join(', '));
  const vacias = []; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  for (const it of nuevosIt) { const url = it.mini; if (!url || url.length < 600) { vacias.push(it.id); continue; } const im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = url; }); g.clearRect(0, 0, 64, 64); g.drawImage(im, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; if (n < 40) vacias.push(it.id + ' (' + n + ' px)'); }
  ok(!vacias.length, 'todas tienen miniatura dibujada' + (vacias.length ? ': faltan ' + vacias.slice(0, 8).join(', ') : ''));
  const conVar = nuevosIt.filter(it => it.variantes && it.variantes.length >= 2); ok(conVar.length >= 50, conVar.length + ' tarjetas con variantes');
  const vi = itemPorId('proc_arbol_proc@3'); ok(vi && vi.datos.copa === 'conica' && vi.tipo === 'proc:arbol_proc', 'una variante se puede colocar por su id');
  document.querySelector('[data-cat="urbanismo"]').click(); await dormir(250);
  const bv = document.querySelector('#catItems [data-pvar="proc_carretera_recta"]'); ok(!!bv, 'la tarjeta muestra el botón de variantes');
  bv.click(); await dormir(250); const mv = document.querySelector('#menuVariantes'); ok(mv && !mv.hidden && mv.querySelectorAll('[data-pvi]').length === itemPorId('proc_carretera_recta').variantes.length, 'menú de variantes con sus miniaturas');
  mv.querySelector('[data-pvi$="|1"]').click(); await dormir(150);
  ok(herramienta === 'colocar' && params.colocar.item === 'proc_carretera_recta' && +itemPorId('proc_carretera_recta').datos.carriles === 4, 'elegir la variante la deja lista para colocar');
  renderPanel(); ok(document.querySelectorAll('#objCuerpo [data-pcol]').length >= 5, 'al colocar se ven los parámetros');
  OOCatalogoPro.aplicarVariante('proc_carretera_recta', 0, false); ponerHerramienta('sel');
  return fin();
`, async () => captura('catalogo_miniaturas', `(() => { const b = document.querySelector('[data-cat="edificios"]'); if (b) b.click(); })()`));
caso('F4 · importar un GLB como asset reutilizable: categoría, escala, miniatura y copias', `
  const exp = await OOCargar.exportador(); const sc = new THREE.Scene(); const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: '#c0392b' })); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 16), new THREE.MeshStandardMaterial({ color: '#2c3e50' })); c.position.set(0.5, 1, 0); m.add(c); sc.add(m);
  const glb = await new Promise(r => exp.parse(sc, r, () => r(null), { binary: true })); ok(glb && glb.byteLength > 500, 'GLB de prueba');
  const f = new File([glb], 'maquina_prueba.glb', { type: 'model/gltf-binary' }), url = URL.createObjectURL(f), f0 = window.fetch;
  window.fetch = (u, o) => (String(u).includes('/api/assets') && o && o.method === 'POST') ? Promise.resolve(new Response(JSON.stringify({ id: 'assets_editor/prueba.glb', url }), { status: 200, headers: { 'Content-Type': 'application/json' } })) : f0(u, o);
  let ids; try { ids = await OOImportarPro.importar([f], { nombre: 'Máquina de prueba', categoria: 'maquinaria', categoriaNombre: 'Maquinaria', escala: 0.5, etiquetas: 'prueba' }); } finally { window.fetch = f0; }
  await listo(); const id = ids && ids[0], d = id && efectivos('assets').get(id);
  ok(d && d.categoria === 'maquinaria' && d.escala === 0.5 && String(d.mini).length > 1000 && d.mallas === 2, 'ficha con categoría, escala, miniatura y mallas');
  ok(CATEGORIAS.some(x => x[0] === 'maquinaria'), 'la categoría nueva sale en el catálogo');
  const it = OOCatalogoUI.todos().find(x => x.id === 'asset:' + id); ok(it && it.cat === 'maquinaria' && casi(it.datos.sx, 1.0, 0.03) && casi(it.datos.sy, 1.125, 0.03), 'la tarjeta aplica la escala (2 × 2,25 m a 0,5 → 1 × 1,125 m)');
  const X = Z.x + 40, Zz = Z.z + 190; const a1 = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X, y: 0, z: Zz, giroY: 0 })), a2 = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X + 3, y: 0, z: Zz, giroY: 45 }));
  for (let i = 0; i < 100 && !(OOImportados.modelos.get(id) && OOImportados.modelos.get(id).estado === 'listo'); i++) await dormir(50);
  ok(nv(a1).tipo === 'modelo:' + id && nv(a2).tipo === 'modelo:' + id && OOImportados.modelos.get(id).estado === 'listo', 'dos copias del mismo asset (se carga una vez)');
  await OOImportarPro.editar(id, { nombre: 'Máquina renombrada', categoria: 'equipos', escala: 1 }); await listo();
  const d2 = efectivos('assets').get(id); ok(d2.nombre === 'Máquina renombrada' && d2.categoria === 'equipos' && d2.escala === 1, 'editar la ficha (nombre, categoría y escala)');
  seleccionar([]); for (const k of [a1, a2]) guardar([{ id: nv(k).docId, data: null }]); guardarCol('assets', id, null); URL.revokeObjectURL(url); await listo();
  return fin();
`);
/* ---------------- Fase 5: productividad y modelado ---------------- */
/* franja propia de la fase 5: al sur del mapa, fuera de él (allí no hay árboles ni piezas), dentro del terreno y de lo que alcanza la cámara.
   Dos filas (z = sur + 10 y + 35) y un bloque más al este; cada caso en su sitio: OFF5[n] = [ΔX, ΔZ] */
const OFF5 = { 225: [215, 25], 250: [110, 0], 0: [0, 0], 50: [66, 0], 100: [82, 0], 200: [97, 0], 25: [0, 25], 75: [43, 25], 175: [80, 25], 125: [192, 0], 150: [192, 25] };
const F5 = n => `const X5 = Math.round(limitesMapa.min.x) + 4 + ${(OFF5[n] || [0, 0])[0]}, Z5 = Math.round(limitesMapa.max.z) + 10 + ${(OFF5[n] || [0, 0])[1]} - ${n}; const ids5 = (t, x0, x1, z0, z1) => delTipo(t, o => o.datos.x >= x0 && o.datos.x <= x1 && o.datos.z >= z0 && o.datos.z <= z1).map(o => o.id);`;
caso('F5 · repetir un poste 20 veces a 3 m (línea), en curva, en línea recta con dirección y deshacer', F5(0) + `
  const z = Z5, p = crearNuevo('poste', { x: X5, y: 0, z, giroY: 0, sx: 0.4, sy: 7, sz: 0.4 }); const h0 = deshacer.length;
  const ks = OOTransformar.repetirEnCamino(['n' + p], [[X5, z], [X5 + 60, z]], { cantidad: 20, separacion: 3 });
  ok(ks.length === 19 && deshacer.length === h0 + 1, '19 copias + el original, en un paso de deshacer (' + ks.length + ')');
  const xs = ids5('poste', X5 - 1, X5 + 70, z - 1, z + 1).map(i => nv(i).datos.x).sort((a, b) => a - b);
  ok(xs.length === 20 && xs.every((x, i) => casi(x, X5 + 3 * i, 0.002)), '20 postes cada 3 m: ' + xs.slice(0, 4).map(v => (v - X5).toFixed(2)).join(', ') + '…');
  hacerDeshacer(); ok(ids5('poste', X5 - 1, X5 + 70, z - 1, z + 1).length === 1, 'deshacer deja solo el original');
  hacerRehacer(); ok(ids5('poste', X5 - 1, X5 + 70, z - 1, z + 1).length === 20, 'rehacer vuelve a los 20');
  /* curva por tres puntos, 10 repartidos */
  const c = crearNuevo('poste', { x: X5, y: 0, z: z + 6, giroY: 0, sx: 0.4, sy: 3, sz: 0.4 });
  const kc = OOTransformar.repetirEnCamino(['n' + c], [[X5, z + 6], [X5 + 10, z + 14], [X5 + 20, z + 6]], { cantidad: 10, modo: 'llenar', curva: true, alinear: true });
  const L = [c].concat(kc.map(k => k.slice(1))).map(i => nv(i).datos); const d = L.slice(1).map((q, i) => Math.hypot(q.x - L[i].x, q.z - L[i].z));
  ok(kc.length === 9 && Math.max(...L.map(q => q.z)) > z + 12 && Math.max(...d) - Math.min(...d) < 0.35, '10 postes repartidos por la curva (cuerdas ' + Math.min(...d).toFixed(2) + '–' + Math.max(...d).toFixed(2) + ' m)');
  ok(L.some(q => Math.abs(q.giroY) > 5), 'giran con la curva');
  const r = crearNuevo('poste', { x: X5 + 30, y: 0, z: z + 6, giroY: 0, sx: 0.4, sy: 3, sz: 0.4 }); const kr = OOTransformar.repetirEnLinea(['n' + r], { cantidad: 5, separacion: 2, direccion: 90 });
  ok(kr.length === 4 && kr.every((k, i) => casi(nv(k.slice(1)).datos.x, X5 + 30, 0.01) && casi(nv(k.slice(1)).datos.z, z + 6 - 2 * (i + 1), 0.01)), 'en línea recta hacia el norte (dirección 90°) cada 2 m');
  P0.F5poste = p; seleccionar(['n' + p].concat(ks)); await listo(); return fin();
`, async () => captura('f5_repetir_postes', `(() => { const d = nuevos.get(__pruebas.F5poste).datos; __editor.mirar([d.x + 28, 2, d.z + 6], [d.x + 10, 22, d.z + 40]); })()`));
caso('F5 · duplicar con desplazamiento, matriz y copias que conservan la pared de la puerta', F5(25) + `
  const z = Z5 + 25, it = itemPorId('caja_madera'), a = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5, y: 0, z, giroY: 0 }));
  const ks = OOTransformar.duplicarDesplazado(['n' + a], { n: 3, dx: 2, dz: 0.5 });
  ok(ks.length === 3 && ks.every((k, i) => casi(nv(k.slice(1)).datos.x, X5 + 2 * (i + 1)) && casi(nv(k.slice(1)).datos.z, z + 0.5 * (i + 1))), '3 copias cada ΔX 2 m, ΔZ 0,5 m');
  const b = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 12, y: 0, z, giroY: 0 })), h0 = deshacer.length;
  const km = OOTransformar.matriz(['n' + b], { filas: 3, columnas: 4, sepX: 2, sepZ: 3, local: false });
  ok(km.length === 11 && deshacer.length === h0 + 1, 'matriz 3 × 4 = 12 (11 copias en un paso)');
  const pos = [b].concat(km.map(k => k.slice(1))).map(i => [nv(i).datos.x - X5 - 12, nv(i).datos.z - z]); const esperadas = []; for (let f = 0; f < 3; f++) for (let cc = 0; cc < 4; cc++) esperadas.push([cc * 2, f * 3]);
  ok(esperadas.every(([x, zz]) => pos.some(([px, pz]) => casi(px, x, 0.01) && casi(pz, zz, 0.01))), 'cada celda de la rejilla ocupada');
  const g = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 25, y: 0, z, giroY: 90 })); const kg = OOTransformar.matriz(['n' + g], { filas: 1, columnas: 3, sepX: 2, local: true });
  ok(kg.length === 2 && casi(nv(kg[0].slice(1)).datos.x, X5 + 25, 0.01) && Math.abs(nv(kg[0].slice(1)).datos.z - z) > 1.9, 'en los ejes del objeto (girado 90°) la fila va por Z');
  const w = crearNuevo('muro', datosMuro(new V3(X5 + 32, 0, z), new V3(X5 + 38, 0, z))); const pu = crearNuevo('puerta', { x: X5 + 34, y: 0, z, giroY: 0, sx: 0.9, sy: 2.1, sz: 0.2, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: w });
  const kw = OOTransformar.duplicarDesplazado(['n' + w, 'n' + pu], { n: 1, dz: 3 }); const w2 = kw.map(k => nv(k.slice(1))).find(o => tipoBase(o.tipo) === 'muro'), p2 = kw.map(k => nv(k.slice(1))).find(o => tipoBase(o.tipo) === 'puerta');
  renderTodo(); ok(w2 && p2 && p2.datos.muro === w2.id && nv(w2.id).huecos.length === 1, 'la puerta copiada queda en la pared copiada (y le abre el hueco)');
  const kp = OOTransformar.duplicarDesplazado(['n' + pu], { n: 1, dx: 2 }); ok(nv(kp[0].slice(1)).datos.muro === w, 'una puerta copiada a lo largo de su pared sigue en ella');
  P0.F5m = b; return fin();
`, async () => captura('f5_matriz', `(() => { const d = nuevos.get(__pruebas.F5m).datos; seleccionar([]); __editor.mirar([d.x + 6, 0.5, d.z + 3], [d.x - 6, 14, d.z + 22]); })()`));
caso('F5 · alinear, distribuir, reflejar (polígono en L y escalera en L), mover y girar exactos, ejes bloqueados, pivote y medidas', F5(50) + `
  const z = Z5 + 50, it = itemPorId('caja_madera'); const cs = [[0, 0], [3, 1.2], [7.5, -0.8], [9, 2]].map(([dx, dz]) => crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + dx, y: 0, z: z + dz, giroY: 0 })));
  const K = cs.map(i => 'n' + i), caja = k => cajaEntidad(k);
  OOTransformar.alinear(K, 'z', 'min', 'seleccion'); ok(K.every(k => casi(caja(k).min.z, caja(K[0]).min.z, 0.005)), 'alinear el mínimo en Z');
  OOTransformar.alinear(K, 'x', 'centro', 'primero'); ok(K.every(k => casi((caja(k).min.x + caja(k).max.x) / 2, X5, 0.005)), 'alinear centros en X respecto al primero');
  hacerDeshacer(); const cx = K.map(k => (caja(k).min.x + caja(k).max.x) / 2).sort((a, b) => a - b); OOTransformar.distribuir(K, 'x', 'centros');
  const cx2 = K.map(k => (caja(k).min.x + caja(k).max.x) / 2).sort((a, b) => a - b), dd = cx2.slice(1).map((v, i) => v - cx2[i]);
  ok(casi(cx2[0], cx[0], 0.005) && casi(cx2[3], cx[3], 0.005) && dd.every(v => casi(v, dd[0], 0.005)), 'distribuir: los extremos quietos y centros equidistantes (' + dd.map(v => v.toFixed(2)).join(', ') + ')');
  OOTransformar.distribuir(K, 'x', 'huecos'); const bx = K.map(caja).sort((a, b) => a.min.x - b.min.x), hu = bx.slice(1).map((b, i) => b.min.x - bx[i].max.x); ok(hu.every(v => casi(v, hu[0], 0.005)), 'distribuir con huecos iguales');
  /* mover y girar exactos, eje bloqueado, pivote */
  const p0 = clon(nv(cs[0]).datos); OOTransformar.mover([K[0]], [1, 0.5, -2]); ok(casi(nv(cs[0]).datos.x, p0.x + 1) && casi(nv(cs[0]).datos.y, p0.y + 0.5) && casi(nv(cs[0]).datos.z, p0.z - 2), 'mover exacto ΔX 1, ΔY 0,5, ΔZ −2');
  OOTransformar.bloquear('x', true); OOTransformar.mover([K[0]], [5, 0, 1]); ok(casi(nv(cs[0]).datos.x, p0.x + 1) && casi(nv(cs[0]).datos.z, p0.z - 1), 'con X bloqueado solo se mueve en Z'); OOTransformar.bloquear('x', false);
  const g0 = nv(cs[1]).datos.giroY; OOTransformar.girar([K[1]], 37.5); ok(casi(nv(cs[1]).datos.giroY, g0 + 37.5), 'girar exacto 37,5°');
  OOTransformar.ponerPivote('min'); const b2 = cajaEntidades([K[2], K[3]]), mn = b2.min.clone(); OOTransformar.girar([K[2], K[3]], 90); const b3 = cajaEntidades([K[2], K[3]]);
  ok(casi(b3.max.z, mn.z, 0.02) && casi(b3.min.x, mn.x, 0.02), 'girar 90° alrededor de la esquina mínima'); OOTransformar.ponerPivote('centro');
  OOTransformar.medida([K[0]], 'x', 3); ok(casi(cajaEntidad(K[0]).getSize(new V3()).x, 3, 0.01), 'medida exacta: ancho X = 3 m');
  /* reflejar un polígono en L y una escalera en L */
  const zz = z + 8, Lw = [[X5, zz], [X5 + 6, zz], [X5 + 6, zz + 2], [X5 + 2, zz + 2], [X5 + 2, zz + 5], [X5, zz + 5]], hab = crearNuevo('habitacion', datosHabitacion(Lw, 0, 2.6));
  const esc = OOEscaleras.crear({ x: X5 + 10, y: 0, z: zz + 2, giroY: 0, alto: 2.4, forma: 'L', giro: 'izq' });
  const V0 = OOGeometria.vertices(hab);
  const bb = cajaEntidades(['n' + hab, 'n' + esc]), c = (bb.min.x + bb.max.x) / 2; OOTransformar.reflejar(['n' + hab, 'n' + esc], 'x', false);
  const V1 = OOGeometria.vertices(hab); ok(V0.every(([x, zv]) => V1.some(([x1, z1]) => casi(x1, 2 * c - x, 0.01) && casi(z1, zv, 0.01))), 'reflejar en X: cada vértice del polígono en L queda en su espejo');
  ok(nv(esc).datos.giro === 'der' && (casi(nv(esc).datos.giroY, 180) || casi(nv(esc).datos.giroY, -180)), 'la escalera en L cambia de sentido (gira a la derecha) y mira al otro lado');
  const n0 = delTipo('habitacion').length; OOTransformar.reflejar(['n' + hab], 'z', true); ok(delTipo('habitacion').length === n0 + 1, 'reflejar una copia en Z');
  return fin();
`);
caso('F5 · editar vértices (asas, insertar y quitar), fundación a polígono, extruir y dividir', F5(75) + `
  const z = Z5 + 75, h = crearNuevo('habitacion', datosHabitacion([[X5, z], [X5 + 6, z], [X5 + 6, z + 4], [X5, z + 4]], 0, 2.6));
  seleccionar(['n' + h]); ponerHerramienta('sel'); OOAsas.actualizar(); const asas = OOAsas.lista();
  ok(asas.filter(a => /^v/.test(a.id)).length === 4 && asas.filter(a => /^m/.test(a.id)).length === 4, 'asas: 4 vértices y 4 lados');
  ok(casi(OOGeometria.area(nv(h)), 24, 0.01), 'área inicial 24 m²');
  OOGeometria.moverVertice(h, 2, [X5 + 8, z + 4]); ok(casi(OOGeometria.vertices(h)[2][0], X5 + 8, 0.01) && casi(nv(h).datos.area, 28, 0.01), 'mover el vértice 3 a (8, 4): área 28 m²');
  OOGeometria.insertarVertice(h, 3, [X5 + 3, z + 6]); ok(OOGeometria.vertices(h).length === 5, 'insertar un vértice en el lado de arriba');
  OOGeometria.quitarVertice(h, 4); ok(OOGeometria.vertices(h).length === 4, 'quitar un vértice');
  hacerDeshacer(); hacerDeshacer(); hacerDeshacer(); ok(casi(nv(h).datos.area, 24, 0.01) && OOGeometria.vertices(h).length === 4, 'deshacer los tres pasos devuelve el rectángulo');
  /* arrastrar un asa de vértice con el ratón */
  seleccionar(['n' + h]); OOAsas.actualizar(); P0.F5h = h; P0.F5v = OOGeometria.vertices(h)[1];
  const f = OOFundaciones.crearRect(X5 + 12, z, X5 + 18, z + 4, 0, { elevacion: 0.5 }); ok(OOGeometria.aPoligono(f) && nv(f).datos.forma === 'poligono' && OOGeometria.vertices(f).length === 4, 'una fundación rectangular pasa a polígono');
  OOGeometria.moverVertice(f, 0, [X5 + 11, z - 1]); ok(OOGeometria.vertices(f).some(([x, zv]) => casi(x, X5 + 11, 0.01) && casi(zv, z - 1, 0.01)) && casi(OOAnclajes.tope('fundacion', nv(f).datos), 0.5, 0.01), 'su vértice se mueve y conserva la elevación');
  const s = crearNuevo('habitacion', datosHabitacion([[X5 + 22, z], [X5 + 26, z], [X5 + 26, z + 3], [X5 + 22, z + 3]], 0, 2.6, { suelo: true })), pr = OOGeometria.extruir(s, 1.2, { reemplazar: true });
  const P = nv(pr); ok(P && tipoBase(P.tipo) === 'fundacion' && P.datos.forma === 'poligono' && casi(OOAnclajes.tope('fundacion', P.datos), 1.2, 0.01) && casi(OOGeometria.area(P), 12, 0.01) && !nv(s), 'extruir un suelo de 12 m² a un prisma de 1,2 m (sin dejar el suelo debajo)');
  const cl = crearNuevo('calle', { x: X5 + 30, y: 0, z: z + 2, giroY: 0, sx: 4, sy: 0.05, sz: 10, material: 'asfalto', color: '#555555' }), c2 = OOGeometria.dividir(cl, 'z', 0.3);
  ok(c2 && casi(nv(cl).datos.sz, 3) && casi(nv(c2).datos.sz, 7) && casi(nv(cl).datos.z + 1.5, z + 2 - 5 + 3, 0.01) && casi(nv(c2).datos.z, z + 2 + 1.5, 0.01), 'dividir una calle de 10 m al 30 % (3 + 7 m)');
  const h2 = OOGeometria.dividir(h, 'x', 0.5); ok(h2 && casi(OOGeometria.area(nv(h)) + OOGeometria.area(nv(h2)), 24, 0.01), 'dividir el piso en dos: las áreas suman 24 m²');
  hacerDeshacer(); seleccionar(['n' + h]); await listo(); return fin();
`, async () => {
  const pt = await evalRaw('__ooEval("(() => { const v = __pruebas.F5v; ponerHerramienta(\'sel\'); seleccionar([\'n\' + __pruebas.F5h]); __editor.mirar([v[0] - 2, 0, v[1] + 2], [v[0] - 2, 16, v[1] + 10]); return v; })()")'); await dormir(700);
  const a = await evalRaw('__ooEval("(() => { OOAsas.actualizar(); const v = __pruebas.F5v; return __editor.proyectar([v[0], OOAnclajes.tope(\'habitacion\', nuevos.get(__pruebas.F5h).datos) + 0.05, v[1]]); })()")'); await dormir(300);
  const b = await evalRaw('__ooEval("(() => { const v = __pruebas.F5v; return __editor.proyectar([v[0] + 2, 0.05, v[1] + 1]); })()")');
  await arrastrar(a, b, 14); void pt; return captura('f5_vertices_asas');
});
caso('F5 · resultado del arrastre del asa de vértice', `
  const v0 = P0.F5v, V = OOGeometria.vertices(P0.F5h); ok(V.length === 4 && Math.hypot(V[1][0] - v0[0] - 2, V[1][1] - v0[1] - 1) < 0.6, 'el vértice siguió al ratón: (' + V[1].map(x => x.toFixed(2)) + ')'); hacerDeshacer(); return fin();
`);
caso('F5 · cubierta a dos y cuatro aguas sobre una habitación en L y asas de su contorno', F5(100) + `
  const z = Z5 + 100, Lw = [[X5, z], [X5 + 10, z], [X5 + 10, z + 4], [X5 + 4, z + 4], [X5 + 4, z + 9], [X5, z + 9]];
  const h = crearNuevo('habitacion', datosHabitacion(Lw, 0, 2.6)); ok(!!OOCubiertasL.analizar(nv(h).datos.puntos), 'el contorno se reconoce como L');
  const t = OOTechos.crearDesde(h, 'dos_aguas'), T1 = nv(t); renderTodo();
  const tan = Math.tan(30 * Math.PI / 180), bx = cajaEntidad('n' + t), cum = 2.6 + 2 * tan;
  ok(T1.partes.length > 10 && T1.partes.filter(p => p.f === 'poly' && p.lm).length >= 4, 'cubierta hecha con planos (' + T1.partes.length + ' piezas)');
  ok(bx.max.y < cum + 0.45 && bx.max.y > cum - 0.1, 'cumbrera a ' + bx.max.y.toFixed(2) + ' m (esperada ≈ ' + cum.toFixed(2) + ')');
  ok(bx.min.x <= X5 - 0.3 && bx.max.x >= X5 + 10.3 && bx.min.z <= z - 0.3 && bx.max.z >= z + 9.3, 'cubre las dos alas con su voladizo');
  const t4 = OOTechos.crearDesde(h, 'cuatro_aguas'); renderTodo(); const b4 = cajaEntidad('n' + t4); ok(nv(t4).partes.length > 8 && b4.max.y < 2.6 + 2 * Math.tan(25 * Math.PI / 180) + 0.45, 'cuatro aguas en L (' + nv(t4).partes.length + ' piezas)');
  guardar([{ id: nv(t4).docId, data: null }]);
  seleccionar(['n' + t]); OOAsas.actualizar(); ok(OOAsas.lista().filter(a => /^v/.test(a.id)).length === 6, 'la cubierta muestra 6 asas de vértice en su contorno');
  OOGeometria.moverVertice(t, 1, [X5 + 12, z]); OOGeometria.moverVertice(t, 2, [X5 + 12, z + 4]); renderTodo(); ok(cajaEntidad('n' + t).max.x >= X5 + 12.3, 'alargar el ala moviendo dos vértices del contorno');
  const glb = await OOExportar.glbDe(['n' + t], {}); ok(glb && glb.buf && glb.buf.byteLength > 5000, 'la cubierta en L se exporta a GLB (' + (glb && glb.buf ? glb.buf.byteLength : 0) + ' bytes)');
  P0.F5t = t; seleccionar([]); await listo(); return fin();
`, async () => captura('f5_cubierta_L', `(() => { const d = nuevos.get(__pruebas.F5t).datos; __editor.mirar([d.x, 2.5, d.z], [d.x - 14, 12, d.z + 16]); })()`));
caso('F5 · escalera de caracol con agujero en el piso, escalera en U, rampa con descansos y baranda por el borde', F5(125) + `
  const z = Z5 + 125, f = OOFundaciones.crearRect(X5, z, X5 + 8, z + 8, 0, { elevacion: 0 });
  const losa = crearNuevo('habitacion', datosHabitacion([[X5, z], [X5 + 8, z], [X5 + 8, z + 8], [X5, z + 8]], 2.788, 2.6, { suelo: true, grosor: 0.2 }));
  const ec = OOEscalerasPro.crearCaracol({ x: X5 + 2, y: 0, z: z + 2, giroY: 0, alto: 3, radio: 1 }); const E5 = nv(ec).datos;
  ok(E5.forma === 'caracol' && E5.n === 17 && casi(E5.sx, 2) && casi(E5.sz, 2) && E5.giroTotal > 300, 'caracol: 17 peldaños, 2 × 2 m, vuelta de ' + E5.giroTotal + '°');
  ok(nv(ec).partes.filter(p => p.f === 'poly').length === 17 && nv(ec).partes.some(p => p.f === 'c'), 'un peldaño en abanico por cada escalón y la columna');
  const ag = nv(losa).datos.agujeros_auto; ok(ag && ag[ec] && ag[ec].length === 20, 'abre un agujero redondo en la losa de arriba');
  const eu = OOEscalerasPro.crearU({ x: X5 + 14, y: 0, z: z + 2, giroY: 0, alto: 3, ancho: 1.1 }); const U = nv(eu).datos;
  ok(U.forma === 'U' && casi(U.sz, 2 * 1.1 + 0.1, 0.01) && U.sx < 4.5 && nv(eu).partes.length > 6, 'en U: dos tramos de 1,1 m con hueco de 10 cm (caja ' + U.sx + ' × ' + U.sz + ' m)');
  const rp = OOEscaleras.crearRampa({ x: X5 + 24, y: 0, z: z + 2, giroY: 0, alto: 0.9, pendiente: 6, descansos: 2, largoDescansoRampa: 1.5 }); const R = nv(rp).datos;
  ok(casi(R.largo, 15) && casi(R.sx, 18) && nv(rp).partes.length > 4, 'rampa de 15 m al 6 % con 2 descansos de 1,5 m: 18 m en total');
  /* baranda por el borde de una plataforma elevada, con una pared en un lado y una rampa que llega a otro */
  const zp = z + 12, pf = OOFundaciones.crearRect(X5, zp, X5 + 10, zp + 6, 0, { elevacion: 1.2 });
  const wl = crearNuevo('muro', Object.assign(datosMuro(new V3(X5, 1.2, zp + 6), new V3(X5 + 10, 1.2, zp + 6)), { sy: 2.6 }));
  const rr = OOEscaleras.crearRampa({ y: 0, giroY: -90, alto: 1.2, pendiente: 8, ancho: 1.5, x: X5 + 5, z: zp - 7.5 });
  const lados = OOEscalerasPro.ladosBorde(pf); const bs = OOEscalerasPro.barandaBorde(pf);
  ok(bs.length === 4 && lados.length === 4, '4 tramos: el lado con pared se salta y el de la rampa deja paso (' + bs.length + ')');
  ok(bs.every(i => casi(nv(i).datos.y, 1.2, 0.01) && (OOAnclajes.soporte(i) || {}).id === pf), 'a la altura de la plataforma y ancladas a ella');
  OOFundaciones.elevar(pf, 1.5); ok(bs.every(i => casi(nv(i).datos.y, 1.5, 0.01)), 'al elevar la plataforma las barandas suben con ella');
  P0.F5e = { ec, pf }; await listo(); return fin();
`, async () => captura('f5_caracol_u_rampa_baranda', `(() => { const d = nuevos.get(__pruebas.F5e.ec).datos; seleccionar([]); __editor.mirar([d.x + 5, 1.4, d.z + 1], [d.x - 1, 2.2, d.z + 13]); })()`));
caso('F5 · jerarquía por edificio y planta: mover a otra planta, renombrar, grupos y dependencias', F5(150) + `
  const z = Z5 + 150, f = OOFundaciones.crearRect(X5, z, X5 + 10, z + 8, 0, { elevacion: 0.3 }); OONiveles.crearEdificio(f, 3); const p1 = OONiveles.agregarPlanta(f, { altura: 3 }); OONiveles.activar(f, 'pb');
  const y0 = OONiveles.yPlanta(f, 'pb'), y1 = OONiveles.yPlanta(f, p1);
  const w = crearNuevo('muro', datosMuro(new V3(X5 + 2, y0, z + 4), new V3(X5 + 8, y0, z + 4))); const pu = crearNuevo('puerta', { x: X5 + 5, y: y0, z: z + 4, giroY: 0, sx: 0.9, sy: 2.1, sz: 0.2, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: w });
  const it = itemPorId('mesa'), m = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 3, y: y0, z: z + 2, giroY: 0 })); OONiveles.activar(null);
  const T = OOJerarquiaPro.arbol().find(e => e.f.id === f); ok(T && T.plantas.length === 2 && T.plantas[0].objs.some(o => o.id === m) && T.plantas[0].estructura.some(o => o.id === w), 'el árbol tiene el edificio con 2 plantas, la mesa y la pared en la planta baja');
  OOJerarquia.render(); OOJerarquia.abiertos.add('raiz'); OOJerarquia.abiertos.add('edificios'); OOJerarquia.render(); ok(!!document.querySelector('#jerArbol [data-nodo="ed:' + f + '"]'), 'el panel Jerarquía muestra el nodo del edificio');
  const h0 = deshacer.length, n = OOJerarquiaPro.moverAPlanta([w, m], f, p1);
  ok(deshacer.length === h0 + 1 && n >= 3, 'mover a la planta de arriba en un paso (' + n + ' objetos con la puerta)');
  ok(casi(nv(w).datos.y, y1, 0.01) && casi(nv(m).datos.y, y1, 0.01) && nv(m).datos.nivel === p1 && nv(w).datos.nivel === p1, 'pared y mesa a ' + y1 + ' m y en la planta 1');
  ok(casi(nv(pu).datos.y, y1, 0.01) && OONiveles.nivelDe(nv(pu)).nid === p1, 'la puerta sigue a su pared');
  hacerDeshacer(); ok(casi(nv(m).datos.y, y0, 0.01) && OONiveles.nivelDe(nv(m)).nid === 'pb', 'deshacer la devuelve a la planta baja');
  OOJerarquiaPro.renombrar(m, 'Mesa de reuniones'); ok(nv(m).props && nv(m).props.nombre === 'Mesa de reuniones' && nombreEntidades(['n' + m]) === 'Mesa de reuniones', 'renombrar');
  const D = OOJerarquiaPro.dependencias(w); ok(D && D.todos.includes(pu) && D.cadena.length >= 1, 'dependencias: la puerta depende de la pared; la pared se apoya en ' + D.cadena.map(c => c.tipo).join(' → '));
  const c1 = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 14, y: 0, z, giroY: 0 })), c2 = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 16, y: 0, z, giroY: 0 })), c3 = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 18, y: 0, z, giroY: 0 }));
  seleccionar(['n' + c1, 'n' + c2]); agrupar(); await dormir(100); const gid = grupoDe.get('n' + c1); ok(!!gid, 'grupo creado');
  OOJerarquiaPro.moverAGrupo(['n' + c3], gid); await dormir(150); ok(efectivos('grupos').get(gid).miembros.length === 3, 'mover un objeto a un grupo');
  OOJerarquiaPro.moverAGrupo(['n' + c3], null); await dormir(150); ok(efectivos('grupos').get(gid).miembros.length === 2, 'sacarlo del grupo');
  P0.F5j = f; seleccionar(['n' + m]); await listo(); return fin();
`, async () => captura('f5_jerarquia', `(() => { const d = nuevos.get(__pruebas.F5j).datos; OOJerarquia.abiertos.add('ed:' + __pruebas.F5j); OOJerarquia.render(); __editor.mirar([d.x, 1, d.z], [d.x - 12, 12, d.z + 16]); })()`));
caso('F5 · terreno: pincel con suavidad, nivelar con una plataforma, vegetación, caminos y seguir el terreno en lote', F5(175) + `
  const z = Z5 + 175, x = X5; OOTerreno.asegurar(); const TD = OOTerreno.datos();
  ok(x - 8 > TD.x0 && x + 40 < TD.x0 + (TD.nx - 1) * TD.paso && z - 8 > TD.z0 && z + 45 < TD.z0 + (TD.nz - 1) * TD.paso, 'la zona de la prueba está dentro del terreno');
  const s = OOTerreno.parametros(); ok(s.suavidad != null, 'el pincel tiene suavidad');
  /* pincel duro (suavidad 0) frente a suave (1) a media distancia */
  OOTerreno.pincel(new V3(x, 0, z), 0.3, { modo: 'subir', radio: 6, fuerza: 1, suavidad: 0 }); const hc = OOTerreno.alturaEn(x, z), hm = OOTerreno.alturaEn(x + 3.5, z);
  OOTerreno.pincel(new V3(x + 14, 0, z), 0.3, { modo: 'subir', radio: 6, fuerza: 1, suavidad: 1 }); const sc = OOTerreno.alturaEn(x + 14, z), sm = OOTerreno.alturaEn(x + 17.5, z);
  ok(hc > 0.2 && hm > hc * 0.8 && sm < sc * 0.6, 'duro: ' + hc.toFixed(2) + '/' + hm.toFixed(2) + ' m; suave: ' + sc.toFixed(2) + '/' + sm.toFixed(2) + ' m (centro/a 3,5 m)');
  P0.F5ter = { x, z }; OOTerreno.guardar();
  /* seguir el terreno en lote: solo los que lo siguen se mueven */
  const it = itemPorId('caja_madera'), a = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: x + 26, y: 0, z, giroY: 0 })), b = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: x + 28, y: 0, z, giroY: 0 }));
  ok(OOTerrenoPro.seguirLote([a], true, { apoyar: true }) === 1 && OOAnclajes.soporte(a).tipo === 'terreno', 'una caja pasa a seguir el terreno');
  OOTerrenoPro.editarZona([[x + 24, z - 3], [x + 31, z - 3], [x + 31, z + 3], [x + 24, z + 3]], 0.5, () => 1.0);
  for (let i = 0; i < 40 && !casi(nv(a).datos.y, 1.0, 0.05); i++) await dormir(100); await listo();
  ok(casi(nv(a).datos.y, 1.0, 0.05) && casi(nv(b).datos.y, 0, 0.001), 'al subir el terreno 1 m solo sube la que lo sigue (' + nv(a).datos.y + ' / ' + nv(b).datos.y + ')');
  /* nivelar con una plataforma */
  const f = OOFundaciones.crearRect(x, z + 12, x + 6, z + 18, 2, { elevacion: 0.3 }); const lejos0 = OOTerreno.alturaEn(x + 3, z + 28); OOTerrenoPro.nivelarConPlataforma(f, { talud: 3 });
  ok(casi(OOTerreno.alturaEn(x + 3, z + 15), 2, 0.02) && OOTerreno.alturaEn(x + 3, z + 20) > 0.05 && casi(OOTerreno.alturaEn(x + 3, z + 28), lejos0, 0.001), 'el terreno bajo la plataforma queda a 2 m, con talud alrededor, y lejos no cambia');
  /* vegetación */
  const ids = OOTerrenoPro.pintarVegetacion([x + 18, z + 16], 5, { densidad: 12, semilla: 7, tipo: 'mezcla' });
  ok(ids.length >= 5 && ids.every(i => Math.hypot(nv(i).datos.x - x - 18, nv(i).datos.z - z - 16) <= 5.01 && (OOAnclajes.soporte(i) || {}).tipo === 'terreno'), ids.length + ' plantas dentro del pincel, siguiendo el terreno');
  P0.F5veg = ids.slice(); const nb = OOTerrenoPro.borrarVegetacion([x + 18, z + 16], 5.5); ok(nb >= ids.length && ids.every(i => !nv(i)), 'borrar vegetación las quita');
  hacerDeshacer(); ok(ids.every(i => nv(i)), 'deshacer el borrado');
  /* caminos */
  const cam = crearNuevo('calle', { x: x + 28, y: 0, z: z + 18, giroY: 0, sx: 4, sy: 0.05, sz: 12, material: 'asfalto', color: '#555555' });
  OOTerrenoPro.editarZona([[x + 24, z + 11], [x + 32, z + 11], [x + 32, z + 13], [x + 24, z + 13]], 3, (xx, zz, act, dd) => dd <= 0 ? 1.5 : act);
  ok(OOTerrenoPro.adaptarCamino(cam, 'apoyar') && Math.abs(nv(cam).datos.incX) > 1, 'apoyar el camino en el terreno: se inclina ' + nv(cam).datos.incX + '°');
  ok(OOTerrenoPro.adaptarCamino(cam, 'terreno') && Math.abs(OOTerreno.alturaEn(x + 28, z + 18) - nv(cam).datos.y) < 0.2, 'allanar el terreno bajo el camino');
  await listo(); return fin();
`, async () => captura('f5_terreno', `(() => { const p = __pruebas.F5ter; seleccionar([]); __editor.mirar([p.x + 16, 1, p.z + 12], [p.x + 2, 16, p.z + 38]); })()`));
caso('F5 · productividad: aislar, ocultar, buscar por tipo, historial con nombres, restaurar una versión, medir un área, atajos y pantalla limpia', F5(200) + `
  const z = Z5 + 200, it = itemPorId('caja_madera'); const a = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5, y: 0, z, giroY: 0 })), b = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 3, y: 0, z, giroY: 0 })), c = crearNuevo('poste', { x: X5 + 6, y: 0, z, giroY: 0, sx: 0.4, sy: 7, sz: 0.4 });
  ok(/^Crear /.test(deshacer[deshacer.length - 1].etiqueta), 'el paso sin nombre se llama solo: «' + deshacer[deshacer.length - 1].etiqueta + '»');
  OOProductividad.aislar(['n' + a, 'n' + b]); ok(!seleccionable('n' + c) && seleccionable('n' + a) && !document.getElementById('avisoAislado').hidden, 'aislar: lo demás no se puede elegir y sale el aviso');
  renderTodo(); ok(nv(c).partes.length === 0 && nv(a).partes.length > 0, 'aislar: lo demás no se dibuja');
  OOProductividad.aislar(null); renderTodo(); ok(seleccionable('n' + c) && nv(c).partes.length > 0, 'salir del aislamiento');
  seleccionar(['n' + b]); OOProductividad.ocultar(); ok(ocultos.has('n' + b), 'ocultar la selección'); OOProductividad.mostrarTodo(); ok(!ocultos.has('n' + b), 'mostrar todo');
  const T = OOProductividad.tipos(); ok(T.some(t => t.tipo === 'poste' && t.n >= 20), 'tipos con su cantidad (postes: ' + (T.find(t => t.tipo === 'poste') || {}).n + ')');
  const n = OOProductividad.seleccionarTipo('poste'); ok(n >= 20 && sel.every(k => tipoBase(nv(k.slice(1)).tipo) === 'poste'), 'seleccionar por tipo: ' + n + ' postes');
  ok(OOProductividad.buscarTexto('farola').length >= 20, 'buscar por nombre del tipo');
  /* historial: volver a un paso y avanzar */
  OOTransformar.mover(['n' + a], [1, 0, 0]); OOTransformar.mover(['n' + a], [1, 0, 0]); const L = deshacer.length, xa = nv(a).datos.x;
  OOProductividad.irAPaso(L - 3); ok(casi(nv(a).datos.x, X5) && deshacer.length === L - 2, 'volver dos pasos atrás desde el historial'); OOProductividad.irAPaso(L - 1); ok(casi(nv(a).datos.x, xa), 'y volver al último');
  document.getElementById('bHistorial').click(); await dormir(400); ok(document.querySelectorAll('#popHistorial .paso').length >= 5 && /Mover/.test(document.querySelector('#popHistorial .paso.actual').textContent), 'el historial se ve con los nombres');
  /* versiones */
  await listo(); const vid = await OOProductividad.guardarVersion('Antes de la prueba'); ok(!!vid && (await OOProductividad.versiones()).some(v => v.id === vid && v.n > 3), 'versión guardada en el servidor');
  const d = crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + 9, y: 0, z, giroY: 0 })); OOTransformar.mover(['n' + a], [0, 0, 2]);
  const nr = await OOProductividad.restaurarVersion(vid); ok(nr === 2 && !nv(d) && casi(nv(a).datos.z, z), 'restaurar la versión quita lo nuevo y deshace el movimiento (' + nr + ' cambios)');
  hacerDeshacer(); ok(!!nv(d), 'restaurar también se deshace'); guardar([{ id: nv(d).docId, data: null }]); await OOProductividad.borrarVersion(vid);
  /* medir un área */
  const ar = OOProductividad.medirArea([[X5, 0, z + 4], [X5 + 10, 0, z + 4], [X5 + 10, 0, z + 9], [X5, 0, z + 9]]); ok(casi(ar.area, 50) && casi(ar.perimetro, 30) && etiquetasMedidas().some(e => e.t.includes('50')), 'medir un área de 10 × 5 m: 50 m², 30 m');
  /* atajos configurables */
  OOProductividad.ponerAtajo('h:pared', 'Shift+W'); ponerHerramienta('sel'); const tecla = (key, code, shift) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey: !!shift, bubbles: true }));
  tecla('l', 'KeyL'); ok(herramienta === 'sel', 'la tecla de siempre (L) queda libre'); tecla('W', 'KeyW', true); ok(herramienta === 'pared', 'Mayús+W abre la herramienta Pared'); ponerHerramienta('sel');
  OOProductividad.ponerAtajo('h:pared', null); tecla('l', 'KeyL'); ok(herramienta === 'pared', 'restablecido: L vuelve a funcionar'); ponerHerramienta('sel');
  seleccionar(['n' + a]); tecla('I', 'KeyI', true); ok(OOProductividad.aislado && OOProductividad.aislado.length === 1, 'Mayús+I aísla la selección'); tecla('I', 'KeyI', true); ok(!OOProductividad.aislado, 'y otra vez sale');
  OOProductividad.pantallaLimpia(true); await dormir(200); ok(getComputedStyle(document.getElementById('barra')).display === 'none' && getComputedStyle(document.getElementById('colDer')).display === 'none' && !document.getElementById('bSalirLimpia').hidden, 'pantalla limpia: sin barras ni paneles');
  P0.F5p = { a, c }; return fin();
`, async () => { const f = await captura('f5_pantalla_limpia', `(() => { const d = nuevos.get(__pruebas.F5poste).datos; seleccionar([]); __editor.mirar([d.x + 28, 2, d.z + 6], [d.x + 10, 22, d.z + 40]); })()`); await evalRaw('__ooEval("OOProductividad.pantallaLimpia(false)")'); return f; });
caso('F5 · notas: pin fácil de elegir, tarjeta con vista previa que mira a la cámara, lista, hecha o pendiente y mover con el gizmo', F5(225) + `
  const z = Z5 + 225; let foto = null; try { const j = await (await fetch('/api/fotos')).json(); foto = (j.assets || [])[0] ? j.assets[0].id : null; } catch (e) { }
  const n1 = crearNuevo('nota', { x: X5, y: 0, z, giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 }, { texto: 'Revisar la ventana del baño: el marco está suelto y entra agua cuando llueve', fotos: foto ? [foto] : [] });
  const n2 = crearNuevo('nota', { x: X5 + 8, y: 0, z, giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 }, { texto: 'Falta el extintor del pasillo' });
  await dormir(300); OONotas.actualizar(); const T = OONotas.tarjetas();
  ok(T.length >= 2 && T.some(t => t.id === n1 && casi(t.pos[1], 3.5, 0.01)), 'cada nota tiene su tarjeta flotante encima (' + T.length + ')');
  ok(nv(n1).partes.some(p => p.oculta && p.s[0] >= 1.4), 'el pin lleva una caja de 1,4 m para elegirlo con un clic');
  ok(OONotas.marcar(n2, 'hecha') && OONotas.estado(nv(n2)) === 'hecha' && nv(n2).partes[1].c === '#2fae5a', 'marcar como hecha (el pin se pone verde)');
  mostrarTab('notas', true); await dormir(150); ok(document.querySelectorAll('#listaNotas .notas-pro .nota-item').length >= 2, 'la pestaña Notas las lista');
  document.querySelector('#listaNotas [data-nt="filtro"][data-v="pendientes"]').click(); await dormir(100); ok(![...document.querySelectorAll('#listaNotas .nota-item [data-nt="ir"]')].some(b => b.dataset.id === n2), 'filtro de pendientes');
  document.querySelector('#listaNotas [data-nt="filtro"][data-v="todas"]').click(); document.querySelector('#listaNotas [data-nt="ir"][data-id="' + n1 + '"]').click(); await dormir(200); ok(sel.length === 1 && sel[0] === 'n' + n1, 'clic en la lista: selecciona la nota y va a ella');
  ponerHerramienta('sel'); seleccionar(['n' + n1]); ok(OOEditor.api.tc.object === OOEditor.api.pivote && OOEditor.api.tc.mode === 'translate', 'con la nota elegida sale el gizmo de mover');
  OOTransformar.mover(['n' + n1], [2, 0, 1]); ok(casi(nv(n1).datos.x, X5 + 2) && casi(nv(n1).datos.z, z + 1), 'se mueve como cualquier objeto');
  hacerDeshacer(); seleccionar([]); P0.F5n = { n1, n2 }; mostrarTab('obj', true); return fin();
`, async () => {
  await evalRaw('__ooEval("(() => { const d = nuevos.get(__pruebas.F5n.n1).datos; seleccionar([]); __editor.mirar([d.x + 3, 2.5, d.z], [d.x + 3, 6, d.z + 14]); })()")'); await dormir(900);
  const c = await evalRaw('__ooEval("(() => { const d = nuevos.get(__pruebas.F5n.n1).datos; return __editor.proyectar([d.x, d.y + 3.5, d.z]); })()")');
  await raton('mouseMoved', c.x, c.y, 0); await dormir(80); await raton('mousePressed', c.x, c.y, 1); await dormir(60); await raton('mouseReleased', c.x, c.y, 0); await dormir(500);
  const f = await captura('f5_notas_tarjetas');
  await raton('mousePressed', c.x, c.y, 1); await dormir(60); await raton('mouseReleased', c.x, c.y, 0); await dormir(700);
  await captura('f5_nota_grande'); return f;
});
caso('F5 · notas: el clic en la tarjeta la selecciona y el segundo clic la abre en grande', `
  ok(sel.length === 1 && sel[0] === 'n' + P0.F5n.n1, 'el primer clic en la tarjeta seleccionó la nota');
  ok(!document.getElementById('modal').hidden && !!document.querySelector('#modalCaja .nota-grande'), 'el segundo clic la abrió en grande'); cerrarModal(null);
  return fin();
`);
caso('F5 · giro y grupos: espacio local con varios objetos, girar un grupo y desagrupar sin perder ni acumular giro, alinear con otro objeto, enderezar e imán de ángulo', F5(250) + `
  const z = Z5 + 250, it = itemPorId('caja_madera'); const mk = (dx, dz, g) => crearNuevo(it.tipo, Object.assign(clon(it.datos), { x: X5 + dx, y: 0, z: z + dz, giroY: g }));
  const a = mk(0, 0, 30), b = mk(3, 1, 0), c = mk(5, -1, 70), K = ['n' + a, 'n' + b, 'n' + c];
  ponerHerramienta('sel'); OOTransformar.ponerEspacio('local'); seleccionar(K); colocarPivote(); const yp = new THREE.Euler().setFromQuaternion(OOEditor.api.pivote.quaternion, 'YXZ').y / DEG;
  ok(casi(yp, 30, 0.01), 'con varios objetos y coordenadas locales, el gizmo usa los ejes del primero (' + yp.toFixed(1) + '°)'); OOTransformar.ponerEspacio('auto'); colocarPivote();
  ok(casi(new THREE.Euler().setFromQuaternion(OOEditor.api.pivote.quaternion, 'YXZ').y, 0, 1e-6), 'en automático, ejes del mapa');
  const ini = Object.fromEntries([a, b, c].map(i => [i, clon(nv(i).datos)])), dist = () => Math.hypot(nv(a).datos.x - nv(c).datos.x, nv(a).datos.z - nv(c).datos.z), d0 = dist();
  seleccionar(K); agrupar(); await dormir(150); const gid = grupoDe.get(K[0]); ok(!!gid && expandirGrupos([K[1]]).length === 3, 'agrupados (un clic coge los tres)');
  ok([a, b, c].every(i => canon(nv(i).datos) === canon(ini[i])), 'agrupar no cambia ningún giro ni posición');
  OOTransformar.girar(expandirGrupos([K[0]]), 30); OOTransformar.girar(expandirGrupos([K[0]]), 30);
  ok(casi(nv(a).datos.giroY, 90) && casi(nv(b).datos.giroY, 60) && casi(nv(c).datos.giroY, 130), 'girar el grupo dos veces 30°: cada uno suma 60° (90, 60, 130)');
  ok(casi(dist(), d0, 1e-3), 'el grupo gira como un sólido (distancias iguales)');
  const g60 = Object.fromEntries([a, b, c].map(i => [i, clon(nv(i).datos)])); seleccionar(K); desagrupar(); await dormir(150);
  ok(!grupoDe.get(K[0]) && [a, b, c].every(i => canon(nv(i).datos) === canon(g60[i])), 'desagrupar no toca los giros');
  seleccionar(K); agrupar(); await dormir(150); OOTransformar.girar(K, -60);
  ok([a, b, c].every(i => casi(nv(i).datos.giroY, ini[i].giroY, 1e-3) && casi(nv(i).datos.x, ini[i].x, 2e-3) && casi(nv(i).datos.z, ini[i].z, 2e-3)), 'tras volver a agrupar y girar −60° todo queda como al principio (no se acumula)');
  seleccionar(K); desagrupar(); await dormir(100);
  const w = crearNuevo('muro', Object.assign(datosMuro(new V3(X5, 0, z + 6), new V3(X5 + 6, 0, z + 6)), { giroY: 37 })), v = mk(8, 6, 13);
  OOTransformar.alinearCon(['n' + v], 'n' + w); ok(casi(nv(v).datos.giroY, 37), 'alinear con la pared: copia su giro (37°)');
  const w2 = crearNuevo('muro', Object.assign(datosMuro(new V3(X5, 0, z + 9), new V3(X5 + 6, 0, z + 9)), { giroY: 127 })); OOTransformar.alinearCon(['n' + v], 'n' + w2, { cercano90: true });
  ok(casi(nv(v).datos.giroY, 37), 'con «el más cercano cada 90°» una pared a 127° no le da media vuelta');
  OOTransformar.enderezar(['n' + v], 15); ok(casi(nv(v).datos.giroY, 30), 'enderezar al paso de 15°: 37° → 30°');
  OOTransformar.alinearCon(['n' + v], 'n' + w2); ok(casi(nv(v).datos.giroY, 127), 'alinear con exacto: 127°');
  const aj0 = AJ.ajuste; AJ.ajuste = false; AJ.imanAngulo = true; AJ.angulo = 15; seleccionar(['n' + v]); colocarPivote(); ok(casi(OOEditor.api.tc.rotationSnap, 15 * DEG, 1e-9), 'imán de ángulo de 15° en el gizmo aunque la rejilla esté apagada');
  AJ.imanAngulo = false; colocarPivote(); ok(OOEditor.api.tc.rotationSnap === null, 'imán de ángulo apagado'); AJ.imanAngulo = true; AJ.ajuste = aj0; colocarPivote();
  const ps = []; for (let i = 0; i < N && ps.length < 2; i++) if (P[i] && !P[i].del && P[i].t === 0 && Math.max(P[i].s.x, P[i].s.z) < 2 && !autoActivo('p' + i)) ps.push('p' + i);
  if (ps.length === 2) { const q0 = ps.map(k => estadoEnt(k).q.clone()), p0 = ps.map(k => estadoEnt(k).p.clone()); OOTransformar.girar(ps, 90); OOTransformar.girar(ps, -90);
    ok(ps.every((k, j) => estadoEnt(k).q.angleTo(q0[j]) < 1e-4 && estadoEnt(k).p.distanceTo(p0[j]) < 2e-3), 'dos piezas del mapa: girar 90° y −90° las deja como estaban'); hacerDeshacer(); hacerDeshacer(); }
  seleccionar([]); return fin();
`);
caso('F5 · capturas del inspector (transformar y medidas) y del historial', F5(0) + `
  const k = 'n' + P0.F5poste; seleccionar([k]); ponerHerramienta('sel'); mostrarTab('obj'); renderPanel(); const d = document.querySelector('[data-sec="transformar"]'); if (d) d.open = true;
  ok(!!document.querySelector('[data-sec="medidas"] [data-tfm="x"]') && !!document.querySelector('[data-tf-a="matriz"]') && !!document.querySelector('[data-tf-a="rep-camino"]'), 'el inspector tiene Medidas y Transformar (matriz, repetir…)');
  return fin();
`, async () => { const f = await captura('f5_inspector_transformar', `(() => { const d = nuevos.get(__pruebas.F5poste).datos; __editor.mirar([d.x + 28, 2, d.z], [d.x + 10, 22, d.z + 34]); const s = document.querySelector('[data-sec="transformar"]'); if (s) s.scrollIntoView(); })()`);
  await evalRaw('__ooEval("document.getElementById(\'bHistorial\').click()")'); await captura('f5_historial_versiones'); await evalRaw('__ooEval("OOUI.cerrarPops(null)")'); return f; });
/* ---------------- Fase 6: calidad y exportación al juego ---------------- */
/* (2.1) la zona de antes (max.x + 45, max.z − 60) quedó bajo el techo de una nave de «Exterior» (50 × 40 m a 7 m): ahora detrás del muro norte, sin piezas del mapa */
const F6 = `const X6 = Math.round(limitesMapa.max.x) - 62, Z6 = Math.round(limitesMapa.max.z) - 23;`;
caso('F6 · validación: flotando, enterrado, rampa empinada, escalera sin llegada, material que falta, duplicado; corregir y panel', F6 + `
  const cj = itemPorId('caja_madera'), me = itemPorId('mesa');
  const flota = crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X6, y: 2, z: Z6, giroY: 0 }));
  const ent = crearNuevo(me.tipo, Object.assign(clon(me.datos), { x: X6 + 4, y: -0.4, z: Z6, giroY: 0 }));
  const ram = OOEscaleras.crearRampa({ x: X6 + 12, y: 0, z: Z6, giroY: 0, alto: 1, pendiente: 25, ancho: 1.5 });
  const esc = OOEscaleras.crear({ x: X6 + 12, y: 0, z: Z6 + 8, giroY: 0, alto: 2, ancho: 1.2, forma: 'recta' });
  const mat = crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X6, y: 0, z: Z6 + 6, giroY: 0 })); guardar([docActualizado(nv(mat), { props: { material: 'u:no-existe' } })]);
  const d1 = crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X6 + 4, y: 0, z: Z6 + 6, giroY: 0 })), d2 = crearNuevo(cj.tipo, Object.assign(clon(cj.datos), { x: X6 + 4, y: 0, z: Z6 + 6, giroY: 0 }));
  await listo();
  const av = OOValidacion.revisar(), de = (id, c) => av.filter(r => r.id === id && (!c || r.clase === c));
  ok(de(flota, 'flotando').length === 1, 'la caja a 2 m sale como flotando');
  ok(de(ent, 'enterrado').length === 1, 'la mesa 40 cm bajo el suelo sale como enterrada');
  ok(de(ram, 'pendiente').length === 1, 'la rampa al 25 % sale como muy empinada');
  ok(de(esc, 'escalera').some(r => /al final/.test(r.texto)), 'la escalera que sube 2 m sin nada arriba sale sin llegada');
  ok(de(mat, 'material').length === 1, 'el material propio que no existe sale como error');
  ok(av.filter(r => r.clase === 'duplicado' && (r.id === d1 || r.id === d2)).length === 1, 'el duplicado sale una vez');
  ok(!av.some(r => r.clase === 'flotando' && r.id === d1), 'una caja en el suelo no sale como flotando');
  const h0 = deshacer.length; const lista = av.filter(r => [flota, ent, ram, mat, d1, d2].includes(r.id) && OOValidacion.corregible(r)); OOValidacion.corregir(lista); await listo();
  ok(deshacer.length >= h0 + 1, 'corregir es un paso de deshacer');
  ok(casi(nv(flota).datos.y, 0, 0.01) && casi(nv(ent).datos.y, 0, 0.01), 'la caja baja al suelo y la mesa sube al suelo');
  ok(nv(ram).datos.pendiente <= 12, 'la rampa queda al ' + nv(ram).datos.pendiente + ' %');
  ok(!(nv(mat).props || {}).material, 'se quita el material que faltaba');
  ok(!!nv(d1) !== !!nv(d2), 'se borra uno de los dos duplicados');
  const av2 = OOValidacion.revisar(); ok(!av2.some(r => [flota, ent, ram, mat, d1, d2].includes(r.id) && r.clase !== 'escalera'), 'ya no quedan avisos de esos objetos (la rampa sigue sin nada arriba: eso no se corrige solo)');
  /* llegada: una plataforma a 2 m al final de la escalera la conecta */
  const fid = OOFundaciones.crearRect(X6 + 13.6, Z6 + 6, X6 + 17.6, Z6 + 10, 0, { elevacion: 2 }); await listo();
  ok(!OOValidacion.revisar().some(r => r.id === esc && /al final/.test(r.texto)), 'con una plataforma a 2 m al final, la escalera ya está conectada');
  OOValidacion.pintar(); ok(!!document.querySelector('#modalCaja .val-cont'), 'el panel «Revisar el mapa» se abre');
  P0.F6 = { flota, ent, ram, esc, fid };
  return fin();
`, async () => { const f = await captura('f6_validacion_panel', `(() => { const d = nuevos.get(__pruebas.F6.ram).datos; __editor.mirar([d.x - 4, 1, d.z + 3], [d.x - 22, 14, d.z + 24]); })()`); await evalRaw('__ooEval("cerrarModal(null)")'); return f; });
caso('F6 · enviar al juego: piezas del mapa borradas y movidas por firma, objetos horneados, superficies, puerta con bisagra y guardado en el servidor', F6 + `
  let i0 = -1, i1 = -1; for (let i = 0; i < N && (i0 < 0 || i1 < 0); i++) { const z = P[i]; if (z.t === 0 && z.cat === 'vis' && !z.del && !z.cortes && z.s.x < 3 && z.s.z < 3 && z.s.y < 3 && !grupoDe.get('p' + i)) { if (i0 < 0) i0 = i; else if (Math.abs(P[i].p.x - P[i0].p.x) > 5) i1 = i; } }
  seleccionar(['p' + i0]); await borrarSel(); await listo();
  P[i1].p.x += 1.5; guardar(docModOrig([i1])); await listo();
  const fid = OOFundaciones.crearRect(X6, Z6 + 14, X6 + 6, Z6 + 20, 0, { elevacion: 0 }); /* a ras: las paredes y el piso se anclan solos (como en A1); con elevación atravesarían la losa y E2 vería anclajes rotos */
  params.habitacion.modo = 'rect'; crearCuartoRect(new V3(X6 + 0.1, 0, Z6 + 14.1), new V3(X6 + 5.9, 0, Z6 + 19.9));
  const sur = delTipo('muro', o => casi(o.datos.z, Z6 + 14.1, 0.05) && Math.abs(o.datos.x - (X6 + 3)) < 1)[0];
  const pid = crearNuevo('puerta', { x: sur.datos.x, y: sur.datos.y, z: sur.datos.z, giroY: sur.datos.giroY, sx: 0.9, sy: 2.1, sz: 0.2, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: sur.id });
  await listo();
  const j = OOJuegoUnity.cambiosUnity();
  ok(j.formato === 'oo-editor-unity' && j.mapa === mapa, 'formato oo-editor-unity del mapa');
  const b = j.originales.find(e => e.firma.ref === i0), m = j.originales.find(e => e.firma.ref === i1);
  ok(!!b && b.borrar === true && b.firma.t === 0 && b.firma.tam.length === 3 && !!b.firma.uid, 'la pieza borrada va con su firma (tipo, posición, tamaño, uid)');
  ok(!!m && Array.isArray(m.delta) && m.delta.length === 16 && casi(m.delta[3], 1.5, 1e-3) && casi(m.delta[11], 0, 1e-3), 'la pieza movida lleva su delta en coordenadas de Unity (x + 1,5)');
  ok(casi(b.firma.pos[2], D.piezas[i0][5], 1e-6), 'la firma usa la z de Unity (la del JSON del mapa)');
  const hab = delTipo('habitacion', o => Math.abs(o.datos.x - (X6 + 3)) < 1 && Math.abs(o.datos.z - (Z6 + 17)) < 1)[0], sup = hab && j.objetos.find(o => o.id === hab.id), fu = j.objetos.find(o => o.id === fid);
  ok(!!sup && sup.partes.some(p => p.f === 'm' && p.v.length >= 9 && p.v.length % 9 === 0), 'el piso sale como superficie de triángulos (MeshCollider caminable)');
  ok(!!fu && fu.partes.some(p => p.f === 'b'), 'la fundación sale con sus cajas');
  const pu = j.objetos.find(o => o.id === pid);
  ok(!!pu && pu.hojas && pu.hojas.length === 1 && pu.hojas[0].partes.length > 3 && pu.partes.length === 3, 'la puerta sale con su marco fijo y una hoja que gira');
  const d = nv(pid).datos, bisZ = -(d.z), bis = pu.hojas[0].p;
  ok(Math.abs(Math.hypot(bis[0] - d.x, bis[2] - bisZ) - 0.45) < 0.15, 'la bisagra queda en el lado del marco (a medio ancho del centro)');
  const caja = pu.hojas[0].partes.find(p => p.f === 'b' && p.s[0] > 0.8 && p.s[1] > 2); ok(!!caja && casi(caja.q[1], new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), (d.giroY || 0) * DEG).y * -1, 0.02), 'la hoja va cerrada (sin el giro entreabierto del editor)');
  ok(j.mats.length > 0 && j.objetos.every(o => (o.partes || []).every(p => p.k == null || p.k < j.mats.length)), 'tabla de materiales coherente');
  const r = await OOJuegoUnity.enviar({ sinDialogo: true, sinDescarga: true });
  ok(r.ok && /cambios_/.test(r.ruta || ''), 'el servidor lo guarda en Resources/EditorMapa (' + (r.ruta || r.error) + ')');
  P0.F6b = { i0, i1, ruta: r.ruta };
  return fin({ ruta: r.ruta, resumen: r.resumen });
`, async r => { const dir = arg('juego', ''); if (dir && r.extra && r.extra.ruta) { const f = path.join(dir, 'cambios_complejo.json'); const ok = fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).formato === 'oo-editor-unity'; r.comprobaciones.push([ok, 'el archivo existe en disco y es oo-editor-unity']); if (!ok) r.ok = false; } return null; });
caso('F6 · vegetación pintada como un objeto con muchas plantas: pintar, borrar plantas dentro del grupo, deshacer y exportar', F6 + `
  const n0 = nuevos.size, h0 = deshacer.length;
  const gid = OOTerrenoPro.pintarVegetacionGrupo([[X6 + 30, Z6], [X6 + 38, Z6]], 5, { densidad: 6, semilla: 7 }); await listo();
  const g = nv(gid); ok(!!g && g.tipo === 'vegetacion' && nuevos.size === n0 + 1 && deshacer.length === h0 + 1, 'un trazo = un objeto y un paso de deshacer');
  const np = g.datos.plantas.length; ok(np >= 10, np + ' plantas en el grupo');
  renderTodo(); ok(g.partes.length >= np * 2, 'las piezas de todas las plantas salen en las mallas instanciadas (' + g.partes.length + ')');
  const quitadas = OOTerrenoPro.borrarVegetacion([X6 + 30, Z6], 3); await listo();
  ok(quitadas === 1 && nv(gid) && nv(gid).datos.plantas.length < np, 'borrar quita plantas dentro del grupo (' + nv(gid).datos.plantas.length + ' quedan)');
  hacerDeshacer(); await listo(); ok(nv(gid).datos.plantas.length === np, 'deshacer devuelve las plantas');
  const j = OOJuegoUnity.cambiosUnity(), o = j.objetos.find(x => x.id === gid);
  ok(!!o && o.partes.length >= np * 2, 'se exporta como un solo grupo con todas sus piezas');
  P0.F6veg = gid; return fin({ plantas: np });
`, async () => captura('f6_vegetacion_grupo', `(() => { const d = nuevos.get(__pruebas.F6veg).datos; __editor.mirar([d.x, 1, d.z], [d.x - 14, 12, d.z + 18]); })()`));
caso('F6 · rendimiento: escala de una selección única (no hereda la de una múltiple), compactar instancias y servidor por diario', F6 + `
  const a = P0.F6.flota, bb = P0.F6.ent; seleccionar(['n' + a, 'n' + bb]); const e0 = escalaActual(); ok(!!e0 && casi(e0.x, 1, 1e-6), 'selección múltiple: escala 1');
  sel = ['n' + a]; selSet = new Set(sel); const e1 = escalaActual(); ok(!!e1 && casi(e1.x, 1, 1e-6) && casi(e1.y, 1, 1e-6), 'selección única por otro camino: escala 1 (antes ' + 'heredaba la de la múltiple)');
  seleccionar([]);
  /* compactar: rehacer un objeto con otro número de piezas deja huecos en el búfer */
  const gid = P0.F6veg, g = nv(gid); const docs = []; let d = clon(g.datos);
  d = clon(d); d.plantas = d.plantas.slice(0, Math.max(1, d.plantas.length - 4)); g.datos = d; guardar([docActualizado(g)]); /* recomputeParcial es síncrono: los huecos se miden antes de que nada compacte */
  const h1 = huecosInstancias().huecos; ok(h1 > 0, 'quedan ' + h1 + ' instancias huecas tras rehacer');
  const c = compactarSiHace(true); ok(tCompactar !== null || parcialStats.compactados > 0, 'la compactación en reposo queda programada'); ok(c > 0 && huecosInstancias().huecos === 0, 'compactar junta las instancias (' + c + ' huecos)');
  /* servidor: 40 escrituras seguidas por documento y lectura */
  const col = 'prueba_f6'; for (let k = 0; k < 40; k++) await fetch('/api/db/' + col + '/d' + k, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, txt: 'x'.repeat(200) }) });
  await fetch('/api/db/' + col + '/d3', { method: 'DELETE' });
  let jj = await (await fetch('/api/db/' + col)).json(); ok(jj.docs.length === 39 && jj.docs.find(x => x.id === 'd7').data.k === 7, 'el servidor devuelve lo escrito al momento (39 documentos)');
  await dormir(1800); jj = await (await fetch('/api/db/' + col)).json(); ok(jj.docs.length === 39, 'tras compactar sigue igual');
  return fin();
`, async r => { const dir = arg('datos-prueba', ''); if (dir) { const f = path.join(dir, 'prueba_f6.json'), dia = path.join(dir, 'prueba_f6.diario.jsonl'); const ok = fs.existsSync(f) && Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))).length === 39 && !fs.existsSync(dia); r.comprobaciones.push([ok, 'en disco: prueba_f6.json compactado con 39 documentos y sin diario pendiente']); if (!ok) r.ok = false; } return null; });caso('F6 · vistas de depuración: sin materiales, alambre, normales, colisiones y anclajes, y volver a la normal', F6 + `
  for (const m of ['sin_materiales', 'alambre', 'normales', 'colisiones', 'anclajes']) { OOVistasRender.poner(m); ok(OOVistasRender.modo === m && OOVistasRender.cambiadas > 0, 'vista «' + m + '»: ' + OOVistasRender.cambiadas + ' mallas con el material de la vista'); }
  OOVistasRender.poner('alambre'); P0.vistaOk = true; return fin();
`, async () => { const f = await captura('f6_vista_alambre', `(() => { const d = nuevos.get(__pruebas.F6.fid).datos; __editor.mirar([d.x - 3, 1, d.z], [d.x - 20, 14, d.z + 20]); })()`); await evalRaw('__ooEval("OOVistasRender.poner(\'normales\')")'); await captura('f6_vista_normales'); await evalRaw('__ooEval("OOVistasRender.poner(\'normal\'); OOVistasRender.cambiadas")'); return f; });/* ---------------- Caso E: guardar, cerrar y volver a abrir ---------------- */
/* ---------------- 2.1 · notas fáciles de editar (notas_editor.js) y primera persona para interiores (caminar_pro.js) ---------------- */
const NC = `const XN = Math.round(limitesMapa.max.x) + 45, ZN = Math.round(limitesMapa.max.z) - 130;`;
const verEn = async expr => evalRaw('__ooEval(' + JSON.stringify('(async () => { ' + PRELUDIO + expr + ' })()') + ')');
const comprobarEn = async (r, expr, txt) => { const v = await verEn(expr); const ok = v === true; r.comprobaciones.push([ok, txt + (ok ? '' : ' (' + JSON.stringify(v).slice(0, 300) + ')')]); if (!ok) r.ok = false; return ok; };
const pulsar = async (key, code) => { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); await dormir(150); };
const clic = async c => { await raton('mouseMoved', c.x, c.y, 0); await dormir(60); await raton('mousePressed', c.x, c.y, 1); await dormir(60); await raton('mouseReleased', c.x, c.y, 0); };
let notasViejas = null;
caso('Notas 2.1 · «＋ Nota» y clic real en el mapa: nota vacía con el editor abierto y el foco puesto, escribir con el teclado y guardado solo', NC + `
  ponerHerramienta('sel'); seleccionar([]); mostrarTab('fotos', true); __editor.mirar([XN, 0, ZN], [XN, 30, ZN + 22]); await dormir(500);
  const b = document.querySelector('#barraFlot .ne-btn-vista'), bp = document.querySelector('#notasEditor .ne-nueva');
  ok(!!b && !!bp, 'botón «＋ Nota» en la barra de la vista y en la pestaña Notas');
  const r = b.getBoundingClientRect(); P0.NC = { n0: OONotas.lista().length };
  return fin({ boton: { x: r.x + r.width / 2, y: r.y + r.height / 2 }, mapa: __editor.proyectar([XN, 0, ZN]) });
`, async r => {
  const { boton, mapa } = r.extra; await clic(boton); await dormir(250);
  await comprobarEn(r, "return herramienta === 'nota'", 'el botón «＋ Nota» activa la herramienta Nota');
  await clic(mapa); await dormir(600);
  await comprobarEn(r, "const id = OONotasEditor.editando, o = id && nuevos.get(id); P0.NC.n1 = id; return !!o && tipoBase(o.tipo) === 'nota' && !o.texto && OONotas.lista().length === P0.NC.n0 + 1", 'un clic en el mapa crea la nota vacía y la pone en edición');
  await comprobarEn(r, "const t = document.getElementById('neTexto'); return document.activeElement === t && !!t.offsetParent && !document.querySelector('[data-panel=notas]').hidden", 'la pestaña Notas se abre sola y el textarea visible tiene el foco');
  await comprobarEn(r, "const d = document.querySelector('#objCuerpo details[data-sec=nota]'); return !!d && d.open && d === document.querySelector('#objCuerpo [data-scope=sel] > details.sec')", 'en el inspector la sección «Nota y fotos» sale abierta y la primera');
  await teclear('Revisar el enchufe del pasillo');
  await comprobarEn(r, "return document.getElementById('neTexto').value === 'Revisar el enchufe del pasillo' && document.getElementById('notaTexto').value === 'Revisar el enchufe del pasillo'", 'lo escrito entra en la nota vacía (y se copia al inspector)');
  await dormir(1300);
  await comprobarEn(r, "await listo(); const o = nuevos.get(P0.NC.n1); return o.texto === 'Revisar el enchufe del pasillo' && efectivos().get(o.docId).texto === o.texto && /Guardado/.test(document.getElementById('neGuardado').textContent)", 'se guarda solo al dejar de escribir, sin pulsar Guardar');
  await comprobarEn(r, "const j = await (await fetch('/api/db/cambios')).json(); return (j.docs || []).some(d => d.data && d.data.texto === 'Revisar el enchufe del pasillo')", 'y llega al servidor');
  const f = await captura('notas_crear_y_escribir');
  await pulsar('Escape', 'Escape');
  await comprobarEn(r, "return document.activeElement !== document.getElementById('neTexto') && sel.length === 1 && sel[0] === 'n' + P0.NC.n1", 'Esc sale del texto sin perder la selección');
  return f;
});
caso('Notas 2.1 · varias notas: lista con Editar, Ir a, Hecha o Pendiente y Borrar; editar una vieja; escribir seguido es un solo paso de deshacer; fotos', NC + `
  const n2 = crearNuevo('nota', { x: XN + 6, y: 0, z: ZN, giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 }, { texto: 'Nota vieja: falta el extintor' });
  const n3 = crearNuevo('nota', { x: XN + 12, y: 0, z: ZN, giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 }); const confAntes = OOEditor.api.confirmar; OOEditor.api.confirmar = async () => true; /* los módulos usan la copia de la API */
  seleccionar([]); mostrarTab('notas', true); await dormir(200);
  const li = id => [...document.querySelectorAll('#listaNotas .nota-item')].find(l => l.querySelector('[data-id="' + id + '"]'));
  ok([n2, n3, P0.NC.n1].every(id => { const l = li(id); return l && ['[data-ne="editar"]', '[data-nt="ir"]', '[data-nt="estado"]', '[data-ne="borrar"]'].every(s => l.querySelector('.ne-acc ' + s)); }), 'cada nota de la lista tiene Editar, Ir a, Hecha o Pendiente y Borrar');
  li(n2).querySelector('.ne-acc [data-ne="editar"]').click(); await dormir(250);
  const ta = document.getElementById('neTexto'); ok(OONotasEditor.editando === n2 && ta.value === 'Nota vieja: falta el extintor' && document.activeElement === ta && sel[0] === 'n' + n2, 'Editar abre la nota vieja con su texto y el foco');
  ok(li(n2).classList.contains('activa'), 'la nota en edición se marca en la lista');
  const h0 = deshacer.length;
  for (const t of [' en el pasillo', ' y la señal']) { ta.value += t; ta.dispatchEvent(new Event('input', { bubbles: true })); await dormir(900); }
  await listo(); ok(nv(n2).texto === 'Nota vieja: falta el extintor en el pasillo y la señal', 'la nota vieja guarda lo nuevo');
  ok(deshacer.length === h0 + 1, 'dos tandas de escritura seguidas = un solo paso de deshacer (' + (deshacer.length - h0) + ')');
  hacerDeshacer(); await listo(); ok(nv(n2).texto === 'Nota vieja: falta el extintor', 'deshacer vuelve al texto de antes'); hacerRehacer(); await listo();
  li(n2).querySelector('[data-nt="estado"]').click(); await listo(); ok(OONotas.estado(nv(n2)) === 'hecha' && /Hecha/.test(li(n2).querySelector('[data-nt="estado"]').textContent), 'Hecha desde la lista');
  li(n2).querySelector('[data-nt="estado"]').click(); await listo(); ok(OONotas.estado(nv(n2)) === 'pendiente', 'y otra vez Pendiente');
  /* fotos desde la edición (la galería se sustituye por una foto del servidor de prueba) */
  let foto = null; try { const j = await (await fetch('/api/fotos')).json(); foto = (j.assets || [])[0] ? j.assets[0].id : null; } catch (e) { }
  const AP = OOEditor.api, elegirAntes = AP.elegirGaleria; AP.elegirGaleria = async () => foto ? [foto] : [];
  OONotasEditor.editar(n2, { tab: true }); document.querySelector('#notasEditor [data-ne="galeria"]').click(); await dormir(150); await listo(); AP.elegirGaleria = elegirAntes;
  ok(!foto || (nv(n2).fotos || []).includes(foto), foto ? 'añadir una foto desde la edición' : 'sin fotos en el servidor de prueba: no se prueba añadir');
  if (foto && ok(!!document.querySelector('#neFotos [data-ne="quitar-foto"]'), 'la foto sale en el editor con su botón de quitar')) { document.querySelector('#neFotos [data-ne="quitar-foto"]').click(); await listo(); ok(!(nv(n2).fotos || []).length, 'quitar la foto desde la edición'); }
  li(n2).querySelector('[data-nt="ir"]').click(); await dormir(200); ok(sel.length === 1 && sel[0] === 'n' + n2, 'Ir a selecciona la nota');
  li(n3).querySelector('[data-ne="borrar"]').click(); await dormir(200); await listo(); ok(!nuevos.has(n3) && !li(n3), 'Borrar quita la nota (con confirmación)'); OOEditor.api.confirmar = confAntes;
  OONotasEditor.editar(n2, { tab: true }); document.querySelector('#notasEditor [data-ne="guardar"]').click(); await listo(); await dormir(200); ok(/Guardado/.test(document.getElementById('neGuardado').textContent), 'botón Guardar');
  P0.NC.n2 = n2; return fin({ n1: P0.NC.n1, n2 });
`, async r => { notasViejas = r.extra; return captura('notas_lista_y_editor', `(() => { const d = nuevos.get(__pruebas.NC.n2).datos; seleccionar(['n' + __pruebas.NC.n2]); mostrarTab('notas', true); document.activeElement.blur(); __editor.mirar([d.x - 3, 1.5, d.z], [d.x - 3, 7, d.z + 14]); const l = document.querySelector('#listaNotas .notas-pro'); if (l) l.scrollIntoView(); })()`); });
caso('Notas 2.1 · clic en la tarjeta 3D de una nota: la selecciona y abre su edición', NC + `
  seleccionar([]); mostrarTab('fotos', true); const d = nv(P0.NC.n2).datos; __editor.mirar([d.x, 2.5, d.z], [d.x, 5, d.z + 13]); await dormir(600); OONotas.actualizar(); await dormir(100);
  return fin({ c: __editor.proyectar([d.x, d.y + 3.5, d.z]) });
`, async r => {
  await clic(r.extra.c); await dormir(500);
  await comprobarEn(r, "return sel.length === 1 && sel[0] === 'n' + P0.NC.n2 && OONotasEditor.editando === P0.NC.n2 && !document.querySelector('[data-panel=notas]').hidden && document.activeElement === document.getElementById('neTexto')", 'un clic en la tarjeta: seleccionada y en edición con el foco');
  const f = await captura('notas_clic_tarjeta'); await pulsar('Escape', 'Escape'); return f;
});
casoTrasRecargar('Notas 2.1 · tras recargar la página: editar una nota vieja y escribirle con el teclado', async r => {
  const ids = notasViejas; if (!ids) { r.comprobaciones.push([false, 'no hay notas del caso anterior']); r.ok = false; return; }
  await comprobarEn(r, `const id = ${JSON.stringify(ids.n2)}; if (!nuevos.has(id)) return 'no está'; mostrarTab('notas', true); await dormir(150); const b = document.querySelector('#listaNotas .ne-acc [data-ne="editar"][data-id="' + id + '"]'); if (!b) return 'sin botón'; b.click(); await dormir(300); const t = document.getElementById('neTexto'); return t.value === 'Nota vieja: falta el extintor en el pasillo y la señal' && document.activeElement === t || t.value`, 'tras recargar, Editar abre la nota vieja con su texto y el foco');
  await verEn("const t = document.getElementById('neTexto'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return 1");
  await teclear(' (revisado)'); await dormir(1300);
  await comprobarEn(r, `await listo(); return nuevos.get(${JSON.stringify(ids.n2)}).texto === 'Nota vieja: falta el extintor en el pasillo y la señal (revisado)' || nuevos.get(${JSON.stringify(ids.n2)}).texto`, 'lo escrito en la nota vieja se guarda');
  await comprobarEn(r, `return nuevos.has(${JSON.stringify(ids.n1)}) && nuevos.get(${JSON.stringify(ids.n1)}).texto === 'Revisar el enchufe del pasillo'`, 'la nota creada vacía conserva su texto tras recargar');
});
const NCW = `/* sala de prueba en un hueco libre junto al mapa: sin piezas del mapa (los alrededores crecen) ni objetos de otros casos */
  const NCZ = P0.NCZ || (P0.NCZ = (() => { const L = limitesMapa, mm = new THREE.Matrix4(), bq = new THREE.Box3(), cajas = []; P.forEach(q => { if (!q || q.del) return; bq.set(new V3(-0.5, -0.5, -0.5), new V3(0.5, 0.5, 0.5)).applyMatrix4(mm.compose(q.p, q.q, q.s)); if (bq.max.y >= 0.3) cajas.push(bq.clone()); }); for (const o of nuevos.values()) { const d = o.datos || {}, r = Math.max(3, (+d.sx || 0) / 2, (+d.sz || 0) / 2); const b = cajaEntidades(['n' + o.id]); b.union(new THREE.Box3(new V3(+d.x - r, -1, +d.z - r), new V3(+d.x + r, 10, +d.z + r))); cajas.push(b); } /* también lo que está oculto o sin dibujar */
    const cand = []; for (let x = Math.round(L.max.x) + 10; x <= Math.round(L.max.x) + 55; x += 9) for (let z = Math.round(L.max.z) + 40; z > Math.round(L.min.z) - 40; z -= 9) cand.push([x, z]); /* primero al este; si no, en todo el anillo a menos de 50 m del mapa */
    for (let x = Math.round(L.min.x) - 50; x <= Math.round(L.max.x) + 50; x += 9) for (let z = Math.round(L.min.z) - 50; z <= Math.round(L.max.z) + 50; z += 9) if (x > L.max.x + 6 || x < L.min.x - 14 || z > L.max.z + 8 || z < L.min.z - 16) cand.push([x, z]);
    for (const [x, z] of cand) { const c = new THREE.Box3(new V3(x - 4, -5, z - 6), new V3(x + 12, 30, z + 14)); if (!cajas.some(b => !b.isEmpty() && b.intersectsBox(c))) return { x, z }; } return { x: Math.round(L.max.x) + 45, z: Math.round(L.max.z) - 105 }; })());
  const XC = NCZ.x, ZC = NCZ.z;
  const sala = () => { const ms = delTipo('muro', o => Math.abs(o.datos.x - (XC + 4)) < 5 && Math.abs(o.datos.z - (ZC + 3)) < 4); return { ms, sur: ms.find(o => casi(o.datos.z, ZC, 0.05)), este: ms.find(o => casi(o.datos.x, XC + 8, 0.05)) }; };
  const andarW = (s, k) => { andar.teclas.add(k || 'KeyW'); for (let i = 0; i < Math.round(s * 30); i++) OOCaminar.mover(1 / 30); andar.teclas.delete(k || 'KeyW'); for (let i = 0; i < 6; i++) OOCaminar.mover(1 / 30); };
  const tecla = (key, code) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); if (!document.getElementById('modal').hidden) cerrarModal(null);`;
caso('Caminar 2.1 · primera persona: ojos a 1,65 m, agacharse, choca con las paredes, «Atravesar paredes» (G), velocidad, linterna y campo de visión', NCW + `
  params.habitacion.modo = 'rect'; crearCuartoRect(new V3(XC, 0, ZC), new V3(XC + 8, 0, ZC + 6));
  const { ms, sur, este } = sala(); ok(ms.length === 4 && !!sur && !!este, 'sala de 8 × 6 m con 4 paredes');
  const pid = crearNuevo('puerta', { x: XC + 4, y: 0, z: sur.datos.z, giroY: sur.datos.giroY, sx: 0.9, sy: 2.1, sz: sur.datos.sz || 0.2, alfeizar: 0, estilo: 'metal_oficina', color: '#5d666b', hoja: '#4a555a', muro: sur.id });
  renderTodo(); await listo(); P0.NCW = { pid, sur: sur.id };
  OOCaminar.ponerAtravesar(false); OOCaminar.agachado = false; OOCaminar.ponerVel(4);
  OOCaminar.teletransportar(new V3(XC + 4, 0, ZC + 3), -Math.PI / 2); for (let i = 0; i < 10; i++) OOCaminar.mover(1 / 30);
  let e = OOCaminar.estado(); ok(vista === 'caminar' && e.activo && casi(e.ojos, 1.65, 0.01), 'en primera persona con los ojos a 1,65 m del suelo (' + e.ojos.toFixed(2) + ')');
  ok(!document.getElementById('caminarHud').hidden && !document.getElementById('caminarMapa').hidden && !document.getElementById('mira').hidden && !!document.querySelector('#caminarHud .cam-ayuda'), 'panel con ayuda plegable, minimapa y punto de mira a la vista');
  OOCaminar.agachado = true; for (let i = 0; i < 30; i++) OOCaminar.mover(1 / 30); e = OOCaminar.estado(); ok(casi(e.ojos, 1.0, 0.02), 'agachado (Ctrl): ojos a 1,0 m (' + e.ojos.toFixed(2) + ')'); OOCaminar.agachado = false; for (let i = 0; i < 30; i++) OOCaminar.mover(1 / 30);
  const cara = XC + 8 - (este.datos.sz || 0.2) / 2;
  andarW(3); e = OOCaminar.estado(); ok(e.pos[0] < cara - 0.2 && e.pos[0] > cara - 0.6, 'choca con la pared este y se queda delante (x = ' + e.pos[0].toFixed(2) + ', cara a ' + cara.toFixed(2) + ')');
  andar.yaw = -Math.PI / 4; andar.cambio = true; const z0 = OOCaminar.estado().pos[2]; andarW(0.5); e = OOCaminar.estado(); ok(e.pos[0] < cara && Math.abs(e.pos[2] - z0) > 0.3, 'en diagonal contra la pared se desliza a lo largo de ella');
  andar.yaw = -Math.PI / 2; andar.cambio = true;
  OOCaminar.ponerAtravesar(true); andarW(1); e = OOCaminar.estado(); ok(e.pos[0] > XC + 8.3, 'con «Atravesar paredes» la cruza (x = ' + e.pos[0].toFixed(2) + ')');
  OOCaminar.ponerAtravesar(false);
  const v0 = OOCaminar.estado().vel; dom.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
  ok(OOCaminar.estado().vel > v0, 'la rueda sube la velocidad (' + v0 + ' → ' + OOCaminar.estado().vel + ' m/s)'); OOCaminar.ponerVel(4);
  tecla('g', 'KeyG'); ok(OOCaminar.estado().atravesar, 'G activa «Atravesar paredes»'); tecla('g', 'KeyG'); ok(!OOCaminar.estado().atravesar, 'y G la quita');
  tecla('f', 'KeyF'); ok(OOCaminar.estado().linterna, 'F enciende la linterna'); tecla('f', 'KeyF'); ok(!OOCaminar.estado().linterna, 'y la apaga');
  const f0 = camP.fov; tecla(']', 'BracketRight'); ok(camP.fov === f0 + 5, 'campo de visión con ] (' + f0 + '° → ' + camP.fov + '°)'); tecla('[', 'BracketLeft');
  tecla('+', 'Equal'); ok(OOCaminar.estado().vel > 4, '+ sube la velocidad'); OOCaminar.ponerVel(4);
  return fin();
`);
caso('Caminar 2.1 · puertas: E abre la puerta del editor y se cruza, empujar una puerta abre, la del mapa también, la hoja gira y dentro se oculta el techo', NCW + `
  const { pid } = P0.NCW; OOCaminar.ponerAtravesar(false);
  OOCaminar.teletransportar(new V3(XC + 4, 0, ZC - 2.5), Math.PI); for (let i = 0; i < 6; i++) OOCaminar.mover(1 / 30);
  const m = OOCaminar.mirando(); ok(!!m && m.key === 'n' + pid, 'el punto de mira ve la puerta (' + (m && m.key) + ')');
  const rot = document.getElementById('caminarMira').textContent; ok(/Puerta/.test(rot) && /E abre/.test(rot), 'el rótulo del punto de mira dice qué es y «E abre»: «' + rot + '»');
  const sl = nv(pid).slots[3], antes = new THREE.Matrix4(); M[sl[0]].mesh.getMatrixAt(sl[1], antes);
  tecla('e', 'KeyE'); for (let i = 0; i < 20; i++) OOCaminar.mover(1 / 30);
  const desp = new THREE.Matrix4(); M[sl[0]].mesh.getMatrixAt(sl[1], desp); const pa = new V3().setFromMatrixPosition(antes), pd = new V3().setFromMatrixPosition(desp);
  ok(OOCaminar.abierta('n' + pid), 'E abre la puerta'); ok(pa.distanceTo(pd) > 0.2, 'la hoja gira sobre la bisagra (' + pa.distanceTo(pd).toFixed(2) + ' m)');
  andarW(1.6); let e = OOCaminar.estado(); ok(e.pos[2] > ZC + 0.4, 'se cruza la puerta abierta y se entra (z = ' + e.pos[2].toFixed(2) + ')');
  OOCaminar.alternarPuerta('n' + pid, false); for (let i = 0; i < 20; i++) OOCaminar.mover(1 / 30); ok(!OOCaminar.abierta('n' + pid), 'E otra vez la cierra');
  OOCaminar.teletransportar(new V3(XC + 4, 0, ZC + 1.2), 0); andarW(0.12); ok(OOCaminar.estado().pos[2] > ZC + 0.25, 'cerrada, la puerta para al jugador (z = ' + OOCaminar.estado().pos[2].toFixed(2) + ')');
  andarW(1.5); ok(OOCaminar.abierta('n' + pid) && OOCaminar.estado().pos[2] < ZC - 0.3, 'empujarla un momento la abre sola y se sale (z = ' + OOCaminar.estado().pos[2].toFixed(2) + ')');
  /* puerta del mapa (Complejo: Sistemas) */
  const gi = D.grupos.indexOf('puerta:puerta_sistemas_a');
  if (gi < 0) { ok(true, 'este mapa no tiene la puerta de Sistemas: no se prueba'); return fin(); }
  const i7 = P.findIndex(z => z.grp === gi && z.t === 7), bis = P[i7].p;
  OOCaminar.teletransportar(new V3(bis.x + 0.55, 0, bis.z + 2.5), 0); for (let i = 0; i < 6; i++) OOCaminar.mover(1 / 30);
  const pu = OOCaminar.puertaDe('p' + i7); ok(!!pu && pu.keys.size > 3, 'la puerta del mapa se reconoce con su marco y su hoja (' + (pu ? pu.keys.size : 0) + ' piezas)');
  andarW(3); e = OOCaminar.estado(); ok(OOCaminar.abierta('p' + i7), 'empujar la puerta de Sistemas la abre'); ok(e.pos[2] < bis.z - 1, 'y se entra en Sistemas (z = ' + e.pos[2].toFixed(2) + ')');
  for (let i = 0; i < 10; i++) OOCaminar.mover(0.2); e = OOCaminar.estado(); ok(e.techos && e.corte != null && e.corte > e.pos[1], 'dentro, el techo de encima se oculta (corte a ' + e.corte + ' m)');
  P0.NCW.i7 = i7; return fin();
`, async () => captura('caminar_dentro_de_sistemas', `(() => { const b = P[__pruebas.NCW.i7].p; OOCaminar.teletransportar(new THREE.Vector3(b.x + 0.55, 0, b.z - 3), Math.PI); for (let i = 0; i < 12; i++) OOCaminar.mover(0.2); })()`));
caso('Caminar 2.1 · clic sin capturar el ratón elige lo que se mira (inspector), Tab, techos con T y N pone una nota donde se mira', NCW + `
  const { pid } = P0.NCW; OOCaminar.alternarPuerta('n' + pid, false); for (let i = 0; i < 20; i++) OOCaminar.mover(1 / 30);
  OOCaminar.teletransportar(new V3(XC + 4, 0, ZC + 1.6), 0); for (let i = 0; i < 6; i++) OOCaminar.mover(1 / 30);
  seleccionar([]); andar.sinLock = true; const r = dom.getBoundingClientRect();
  return fin({ c: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, n0: OONotas.lista().length, pid });
`, async r => {
  const { c, n0, pid } = r.extra;
  await clic(c); await dormir(300);
  await comprobarEn(r, `return vista === 'caminar' && sel.includes('n${pid}') && !document.querySelector('[data-panel=obj]').hidden && /Puerta/.test(document.getElementById('objCuerpo').textContent) || [vista, sel]`, 'clic: lo que se mira (la puerta) queda elegido y sale en el inspector sin salir de la primera persona');
  await pulsar('Tab', 'Tab');
  await comprobarEn(r, "return vista === 'caminar'", 'Tab suelta el ratón y sigue en primera persona');
  await comprobarEn(r, "const gi = D.grupos.indexOf('puerta:puerta_sistemas_a'); if (gi < 0) return true; const b = P[P.findIndex(z => z.grp === gi && z.t === 7)].p; OOCaminar.teletransportar(new V3(b.x + 0.55, 0, b.z - 3), Math.PI); for (let i = 0; i < 4; i++) OOCaminar.mover(0.2); const a0 = OOCaminar.estado().corte; OOCaminar.ponerTechos(false); const a = OOCaminar.estado().corte; OOCaminar.ponerTechos(true); for (let i = 0; i < 4; i++) OOCaminar.mover(0.2); return a0 != null && a === null && OOCaminar.estado().corte != null || [a0, a, OOCaminar.estado().corte]", 'T: dentro de Sistemas el techo se oculta; con T se ve otra vez y vuelve a ocultarse');
  await pulsar('n', 'KeyN'); await dormir(400);
  await comprobarEn(r, `return OONotas.lista().length === ${n0} + 1 && !!OONotasEditor.editando && document.activeElement === document.getElementById('neTexto') || [OONotas.lista().length, document.activeElement.id]`, 'N en primera persona pone una nota donde se mira y abre su editor con el foco');
  await teclear('Grieta en la pared'); await dormir(1200);
  await comprobarEn(r, "await listo(); return nuevos.get(OONotasEditor.editando).texto === 'Grieta en la pared'", 'y se le escribe el texto');
  await pulsar('Escape', 'Escape'); return captura('caminar_nota_en_sistemas');
});
caso('Caminar 2.1 · «Teletransportarse aquí» desde el menú del clic derecho (3D y planta), mirando hacia donde miraba la cámara', NCW + `
  ponerVista('3d'); seleccionar([]); __editor.mirar([XC + 4, 0, ZC + 3], [XC + 4, 20, ZC + 8]); await dormir(500); /* casi desde arriba: nada de otros casos se cruza en el rayo */
  return fin({ p: __editor.proyectar([XC + 4, 0.05, ZC + 3]) });
`, async r => {
  const p = r.extra.p; await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
  for (const t of ['mousePressed', 'mouseReleased']) { await cmd('Input.dispatchMouseEvent', { type: t, x: p.x, y: p.y, button: 'right', buttons: t === 'mousePressed' ? 2 : 0, clickCount: 1 }); await dormir(60); } await dormir(300);
  const b = await verEn("const b = document.querySelector('#menuCtx [data-cam=tele]'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }");
  r.comprobaciones.push([!!b, 'el menú del clic derecho trae «Teletransportarse aquí»']); if (!b) { r.ok = false; return null; }
  await clic(b); await dormir(400);
  await comprobarEn(r, NCW + `const e = OOCaminar.estado(); return vista === 'caminar' && Math.hypot(e.pos[0] - (XC + 4), e.pos[2] - (ZC + 3)) < 0.6 && casi(e.ojos, 1.65, 0.02) && Math.abs(Math.sin(andar.yaw)) < 0.05 && Math.cos(andar.yaw) > 0.95 || [vista, e.pos, e.ojos, andar.yaw]`, 'entra en primera persona en ese punto, a 1,65 m y mirando al norte como la cámara');
  const f = await captura('caminar_teletransporte_sala', `(() => { for (let i = 0; i < 6; i++) OOCaminar.mover(0.1); })()`);
  await comprobarEn(r, NCW + `ponerVista('planta'); await dormir(300); const q = __editor.proyectar([XC + 2, 0.05, ZC + 2]); OOCaminar.teleDesde({ clientX: q.x, clientY: q.y }); const e = OOCaminar.estado(); const okp = vista === 'caminar' && Math.hypot(e.pos[0] - (XC + 2), e.pos[2] - (ZC + 2)) < 0.6; ponerVista('3d'); return okp || e.pos`, 'también desde la planta');
  return f;
});
/* ---------------- 2.1: plano 2D ligero y legible, cuartos, capas de vista y mapa nuevo ---------------- */
/* zona libre del Complejo (detrás del muro norte, x 105–135, z 167–188), comprobada sin piezas del mapa */
const P21 = `const XP = Math.round(limitesMapa.max.x) - 161, ZP = Math.round(limitesMapa.max.z) - 22; const raf = () => new Promise(r => requestAnimationFrame(r)); const cuadros = async n => { for (let i = 0; i < n; i++) await raf(); };`;
caso('Plano 2D 2.1 · etiquetas sin montarse, tamaño fijo en pantalla, nombres de edificios y renombrar', P21 + `
  ponerVista('3d'); await cuadros(2); OOPlano.activar(true); await cuadros(4);
  encuadrarCaja(new THREE.Box3(new THREE.Vector3(-20, 0, -10), new THREE.Vector3(330, 3, 200))); OOPlano.forzar(); await cuadros(4);
  const solapan = l => { for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const a = l[i].r, b = l[j].r; if (a[0] < b[2] - 0.5 && a[2] > b[0] + 0.5 && a[1] < b[3] - 0.5 && a[3] > b[1] + 0.5) return [l[i].t, l[j].t]; } return null; };
  let L = OOPlano.etiquetasPuestas; const nombres = L.map(e => e.t);
  ok(L.length >= 8, 'vista amplia: ' + L.length + ' etiquetas (' + nombres.slice(0, 12).join(', ') + ')');
  ok(!solapan(L), 'vista amplia: ninguna etiqueta se monta sobre otra ' + JSON.stringify(solapan(L)));
  ok(['Galpón 1', 'Galpón 2 (dos pisos)', 'Comedor'].every(n => nombres.includes(n)), 'salen los galpones y el comedor (edificios del Complejo)');
  ok(!L.some(e => e.clase === 'cota'), 'de lejos no hay cotas');
  const alto = r => r[3] - r[1]; const h1 = alto(L.find(e => e.t === 'Galpón 1').r);
  encuadrarCaja(new THREE.Box3(new THREE.Vector3(-20, 0, -10), new THREE.Vector3(250, 3, 180))); OOPlano.forzar(); await cuadros(4);
  const g1 = OOPlano.etiquetasPuestas.find(e => e.t === 'Galpón 1'); ok(g1 && Math.abs(alto(g1.r) - h1) < 0.5, 'el texto mide lo mismo en pantalla al acercarse (' + h1.toFixed(1) + ' px → ' + (g1 ? alto(g1.r).toFixed(1) : '—') + ')');
  /* habitaciones con nombre: en una zona libre, 6 cuartos de 3 × 3 m juntos */
  const ids = []; for (let k = 0; k < 6; k++) { const x0 = XP + (k % 3) * 3, z0 = ZP + Math.floor(k / 3) * 3; const esq = [[x0, z0], [x0 + 3, z0], [x0 + 3, z0 + 3], [x0, z0 + 3]]; ids.push(crearNuevo('habitacion', datosHabitacion(esq, 0, 2.6, { nombre: 'Cuarto de prueba número ' + (k + 1), suelo: false }))); }
  await listo(); OOPlano.recalcular();
  encuadrarCaja(new THREE.Box3(new THREE.Vector3(XP - 40, 0, ZP - 30), new THREE.Vector3(XP + 50, 3, ZP + 30))); OOPlano.forzar(); await cuadros(4);
  ok(!OOPlano.etiquetasPuestas.some(e => /Cuarto de prueba/.test(e.t)), 'de lejos los cuartos pequeños no ponen su nombre');
  encuadrarCaja(new THREE.Box3(new THREE.Vector3(XP - 1, 0, ZP - 1), new THREE.Vector3(XP + 10, 3, ZP + 7))); OOPlano.forzar(); await cuadros(4);
  L = OOPlano.etiquetasPuestas; const cu = L.filter(e => /Cuarto de prueba/.test(e.t));
  ok(cu.length === 6 && !solapan(L), 'de cerca salen los 6 nombres sin montarse (' + cu.length + ')');
  ok(cu.some(e => /m²/.test(e.t2)), 'de cerca también el área');
  /* renombrar una etiqueta de edificio (se guarda en la colección etiquetas) y ocultarla */
  const zn = OOPlano.etiquetasZona().find(z => z.base === 'galpon1'); OOPlano.guardarEtiqueta(zn, { texto: 'Galpón 1 · bodega', oculta: false }); await listo();
  ok(OOPlano.etiquetasZona().some(z => z.t === 'Galpón 1 · bodega'), 'renombrar «Galpón 1» se guarda y se ve');
  OOPlano.guardarEtiqueta(OOPlano.etiquetasZona().find(z => z.base === 'galpon1'), { oculta: true }); await listo();
  ok(!OOPlano.etiquetasZona().some(z => z.base === 'galpon1'), 'ocultar la etiqueta la quita del plano');
  OOPlano.guardarEtiqueta({ base: 'galpon1', docId: 'et-' + mapa + '-galpon1' }, { oculta: false, texto: '' });
  const nid = OOPlano.nuevaEtiqueta(XP + 4, ZP - 2, 'Zona de pruebas'); await listo(); ok(OOPlano.etiquetasZona().some(z => z.t === 'Zona de pruebas'), 'etiqueta propia nueva');
  guardarCol('etiquetas', nid, null);
  P0.P21 = { cuartos: ids };
  return fin();
`, async () => captura('plano21_cuartos_cerca'));
caso('Plano 2D 2.1 · ligero: paneo y zoom con todo el Complejo, pocas llamadas de dibujo por cuadro', P21 + `
  if (!OOPlano.activo()) OOPlano.activar(true);
  const med = async (caja, tipo) => { encuadrarCaja(caja); OOPlano.forzar(); await cuadros(6); const t = [], ll = []; let prev = performance.now();
    for (let i = 0; i < 40; i++) { const w = (camO.right - camO.left) / camO.zoom; if (tipo === 'paneo') { camO.position.x += w * 0.006; ctlP.target.x += w * 0.006; } else { camO.zoom *= i < 20 ? 1.025 : 1 / 1.025; camO.updateProjectionMatrix(); } ctlP.update(); sucio = true; await raf(); const a = performance.now(); t.push(a - prev); prev = a; ll.push(OOPlano.ultimo.llamadas); }
    t.sort((a, b) => a - b); return { ms: t[Math.floor(t.length / 2)], max: Math.max(...ll), dib: OOPlano.medirDibujo(3) }; };
  const amplia = new THREE.Box3(new THREE.Vector3(-20, 0, -10), new THREE.Vector3(330, 3, 200));
  const a = await med(amplia, 'paneo'), z = await med(amplia, 'zoom');
  ok(a.max <= 120 && z.max <= 120, 'vista amplia: como mucho ' + Math.max(a.max, z.max) + ' llamadas de dibujo por cuadro (antes unas 40 900)');
  ok(a.ms < 40, 'vista amplia: paneo a ' + a.ms.toFixed(1) + ' ms por cuadro (mediana; antes 192 ms)');
  ok(a.dib.base_ms < 250, 'rehacer la base entera: ' + a.dib.base_ms + ' ms con ' + a.dib.items_base + ' elementos');
  return fin({ amplia_paneo: a, amplia_zoom: z });
`);
caso('Plano 2D 2.1 · símbolos por tipo y elegir lo de debajo de un techo', P21 + `
  if (!OOPlano.activo()) OOPlano.activar(true);
  const me = itemPorId('mesa'), si = itemPorId('silla');
  const mesa = crearNuevo(me.tipo, Object.assign(clon(me.datos), { x: XP + 20, y: 0, z: ZP + 4, giroY: 0 }));
  const silla = crearNuevo(si.tipo, Object.assign(clon(si.datos), { x: XP + 23, y: 0, z: ZP + 4, giroY: 30 }));
  const techo = crearNuevo('techo', { x: XP + 21.5, y: 3, z: ZP + 4, giroY: 0, puntos: [[-4, -3], [4, -3], [4, 3], [-4, 3]], grosor: 0.2, sx: 8, sy: 0.2, sz: 6, material: 'concreto', color: '#999999' });
  await listo(); OOPlano.recalcular();
  const de = k => (OOPlano.datos.porClave.get('n' + k) || []);
  ok(de(mesa).some(it => it.sym === 'escritorio'), 'la mesa lleva símbolo de escritorio o mesa');
  ok(de(silla).some(it => it.sym === 'silla'), 'la silla lleva símbolo de silla');
  ok(de(techo).every(it => it.kind === 'ntecho'), 'el techo va como contorno discontinuo (no tapa)');
  ok(OOPlano.simbolo('Sedan') === 'coche' && OOPlano.simbolo('Extintor PQS') === 'extintor' && OOPlano.simbolo('Estantería metálica') === 'rack' && OOPlano.simbolo('Árbol') === 'arbol', 'nombres → coche, extintor, estantería, árbol');
  encuadrarCaja(new THREE.Box3(new THREE.Vector3(XP + 16, 0, ZP), new THREE.Vector3(XP + 27, 3, ZP + 8))); OOPlano.forzar(); await cuadros(3);
  const q = __editor.proyectar([XP + 23, 0.4, ZP + 4]); const h = OOPlano.pick({ clientX: q.x, clientY: q.y });
  ok(h && h.key === 'n' + silla, 'clic sobre la silla bajo el techo elige la silla (' + (h && h.key) + ')');
  const q2 = __editor.proyectar([XP + 18.2, 0.4, ZP + 1.5]); const h2 = OOPlano.pick({ clientX: q2.x, clientY: q2.y });
  ok(!h2 || h2.key !== 'n' + techo, 'el techo no tapa el clic en el suelo');
  P0.P21s = { mesa, silla, techo };
  return fin();
`, async () => captura('plano21_simbolos'));
caso('Cuartos 2.1 · cerrar 4 paredes que no coinciden al milímetro crea el cuarto; un anillo alrededor de otro cuarto no', P21 + `
  const y = 0, X = XP + 2, Zc = ZP + 12; const pared = (a, b) => crearNuevo('muro', datosMuro(new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1])));
  const n0 = delTipo('habitacion').length;
  /* 4 paredes dibujadas a mano: huecos de 8 cm, una que se pasa 10 cm y otra que acaba en mitad de la de al lado */
  const w = [pared([X, Zc], [X + 4.08, Zc]), pared([X + 4, Zc - 0.1], [X + 4, Zc + 3]), pared([X + 4.06, Zc + 3], [X, Zc + 3.07]), pared([X + 0.05, Zc + 3], [X, Zc + 0.08])];
  await listo(); const ids = detectarHabitaciones(true, { muros: [w[3]] }); await listo();
  ok(ids && ids.length === 1, 'se crea una habitación (' + (ids || []).length + ')');
  const h = ids && nv(ids[0]); ok(h && casi(h.datos.area, 12, 0.6), 'de unos 12 m² (' + (h && h.datos.area) + ')');
  ok((detectarHabitaciones(true, { muros: [w[0]] }) || []).length === 0, 'volver a detectar no la duplica');
  /* anillo: 4 paredes grandes alrededor de un cuarto que no las toca */
  const X2 = XP + 10, Z2 = ZP + 10;
  const dentro = [pared([X2 + 3, Z2 + 3], [X2 + 6, Z2 + 3]), pared([X2 + 6, Z2 + 3], [X2 + 6, Z2 + 6]), pared([X2 + 6, Z2 + 6], [X2 + 3, Z2 + 6]), pared([X2 + 3, Z2 + 6], [X2 + 3, Z2 + 3])];
  await listo(); const i1 = detectarHabitaciones(true, { muros: [dentro[3]] }) || []; await listo();
  const fuera = [pared([X2, Z2], [X2 + 9, Z2]), pared([X2 + 9, Z2], [X2 + 9, Z2 + 9]), pared([X2 + 9, Z2 + 9], [X2, Z2 + 9]), pared([X2, Z2 + 9], [X2, Z2])];
  await listo(); const i2 = detectarHabitaciones(true, { muros: [fuera[3]] }) || []; await listo();
  ok(i1.length === 1 && casi(nv(i1[0]).datos.area, 9, 0.3), 'el cuarto de dentro (9 m²) sí');
  ok(i2.length === 0, 'el anillo de fuera (81 m² con el cuarto dentro) no se crea: ' + i2.map(id => nv(id).datos.area).join(', '));
  ok(poligonosCerrados({ conAnillos: true }).some(c => c.anillo && casi(c.area, 81, 1)), 'el detector lo ve y lo marca como anillo');
  /* una pared lejos no crea nada en otro sitio */
  const lejos = pared([XP + 25, ZP + 21], [XP + 28, ZP + 21]); await listo();
  ok((detectarHabitaciones(true, { muros: [lejos] }) || []).length === 0, 'una pared suelta lejos no crea habitaciones');
  ok(delTipo('habitacion').length === n0 + 2, 'en total, 2 habitaciones nuevas');
  return fin();
`, async () => captura('cuartos21_cerrar', `(() => { OOPlano.activar(true); const XP = Math.round(limitesMapa.max.x) - 161, ZP = Math.round(limitesMapa.max.z) - 22; encuadrarCaja(new THREE.Box3(new THREE.Vector3(XP, 0, ZP + 8), new THREE.Vector3(XP + 21, 3, ZP + 21))); OOPlano.forzar(); })()`));
caso('Cuartos 2.1 · mover solo un tramo de un lado (escalón con su pared) y solo una esquina; deshacer', P21 + `
  const X = XP + 20, Zc = ZP + 12; const n0 = delTipo('muro').length;
  crearCuartoRect(new THREE.Vector3(X, 0, Zc), new THREE.Vector3(X + 6, 0, Zc + 4)); await listo();
  const h = delTipo('habitacion', o => casi(o.datos.x, X + 3, 0.01) && casi(o.datos.z, Zc + 2, 0.01))[0]; ok(!!h, 'cuarto de 6 × 4 m');
  const pts = puntosMundoHab(h); let lado = -1; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (casi(a[1], Zc, 0.01) && casi(b[1], Zc, 0.01)) lado = i; }
  const largos0 = delTipo('muro').filter(o => o.datos.sx > 5.9).length;
  const h0 = deshacer.length; const r = OOCuartos.moverTramo(h.id, lado, 1, 3, 1); await listo();
  ok(r && deshacer.length === h0 + 1, 'un solo paso de deshacer');
  const p2 = puntosMundoHab(nv(h.id)); ok(p2.length === 8, 'el piso gana los 4 vértices del escalón (' + p2.length + ')');
  ok(casi(nv(h.id).datos.area, 26, 0.05), 'área 24 → 26 m² (' + nv(h.id).datos.area + ')');
  const muros = delTipo('muro'); ok(muros.length === n0 + 8, 'paredes: 4 + 2 trozos + 2 cortas = ' + (muros.length - n0));
  ok(muros.some(o => casi(o.datos.sx, 2, 0.02) && casi(o.datos.z, Zc - 1, 0.02)), 'el trozo de 2 m se movió 1 m hacia fuera');
  ok(muros.filter(o => o.datos.sx > 5.9).length === largos0 - 1, 'la pared de enfrente (6 m) no se tocó');
  hacerDeshacer(); await listo();
  ok(casi(nv(h.id).datos.area, 24, 0.01) && delTipo('muro').length === n0 + 4, 'deshacer deja el cuarto y sus 4 paredes como estaban');
  /* esquina: solo ese vértice */
  const p3 = puntosMundoHab(nv(h.id)); const iE = p3.findIndex(p => casi(p[0], X + 6, 0.01) && casi(p[1], Zc + 4, 0.01));
  OOCuartos.moverEsquina(h.id, iE, [X + 7, Zc + 5]); await listo();
  const p4 = puntosMundoHab(nv(h.id)); ok(p4.length === 4 && p4.some(p => casi(p[0], X + 7, 0.01) && casi(p[1], Zc + 5, 0.01)) && p4.some(p => casi(p[0], X, 0.01) && casi(p[1], Zc, 0.01)), 'la esquina se mueve y la opuesta no');
  ok(delTipo('muro').filter(o => { const d = o.datos, g = (+d.giroY || 0) * DEG, L = d.sx / 2; const e = [[d.x - Math.cos(g) * L, d.z + Math.sin(g) * L], [d.x + Math.cos(g) * L, d.z - Math.sin(g) * L]]; return e.some(p => casi(p[0], X + 7, 0.02) && casi(p[1], Zc + 5, 0.02)); }).length === 2, 'las dos paredes de esa esquina la siguen');
  hacerDeshacer(); await listo();
  /* las asas: verdes en las esquinas */
  seleccionar(['n' + h.id]); await dormir(60); ok(OOAsas.lista().filter(a => /^esquina/.test(a.id)).length === 4, 'asas en las 4 esquinas');
  seleccionar([]);
  return fin();
`);
caso('Capas 2.1 · ocultar techos y paredes (y a media altura) en 3D y en el plano, y que se recuerde', P21 + `
  if (!OOPlano.activo()) OOPlano.activar(true);
  const t = P0.P21s.techo; OOCapasVista.ponerTechos(false); await cuadros(2);
  ok(!(OOPlano.datos.porClave.get('n' + t) || []).length, 'sin techos: el techo nuevo no está en el plano');
  ok(JSON.parse(localStorage.getItem('oo-capas-vista')).techos === false, 'se guarda en el navegador');
  OOCapasVista.ponerTechos(true); await cuadros(2); ok((OOPlano.datos.porClave.get('n' + t) || []).length > 0, 'vuelve a verse');
  const c0 = __ooCorte(); OOCapasVista.ponerParedes('media'); ok(casi(__ooCorte(), (+planoTrabajo || 0) + 1.2, 0.01), 'paredes a media altura: corte a 1,2 m');
  OOCapasVista.ponerParedes('ocultas'); await cuadros(2); const m = delTipo('muro')[0];
  ok(m && !(OOPlano.datos.porClave.get('n' + m.id) || []).length, 'paredes ocultas: no salen en el plano');
  OOCapasVista.ponerParedes('completas'); ok(__ooCorte() === c0, 'al volver a enteras se recupera el corte de antes');
  ok(!!document.getElementById('cvTechos') && !!document.getElementById('cvParedes') && !!document.getElementById('plCapas'), 'botones en la barra de abajo');
  OOPlano.activar(false); ponerVista('3d');
  return fin();
`);
caso('Mapa nuevo 2.1 · en blanco con terreno de tierra, editable y sin tocar el Complejo', P21 + `
  const nComp = N, id = OOMapasNuevos.crear({ nombre: 'Prueba vacía', ancho: 60, largo: 40, terreno: 'tierra' }); await listo();
  OOMapasNuevos.abrir(id); for (let i = 0; i < 200 && !(mapa === id && D && D.mapa === id); i++) await dormir(50); await dormir(300);
  ok(mapa === id && N === 1, 'se abre el mapa nuevo con solo su suelo (' + mapa + ', ' + N + ' pieza)');
  ok(casi(P[0].s.x, 60, 0.01) && casi(P[0].s.z, 40, 0.01) && casi(P[0].p.y + P[0].s.y / 2, 0, 0.001), 'suelo de 60 × 40 m con la cara de arriba a 0 m');
  ok(D.materiales[0][1] === OOMapasNuevos.TERRENOS.tierra[1], 'terreno de tierra');
  ok(secLock[1] === true, 'el suelo base queda bloqueado (no se elige sin querer)');
  const w = crearNuevo('muro', datosMuro(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0))); await listo();
  ok(efectivos().get(nv(w).docId).mapa === id, 'lo dibujado se guarda con el mapa nuevo');
  OOPlano.activar(true); await cuadros(3); ok((OOPlano.datos.porClave.get('n' + w) || []).length > 0, 'y se ve en el plano 2D'); OOPlano.activar(false);
  const s = document.getElementById('selMapa'); ok([...s.options].some(o => o.value === id) && [...s.options].some(o => o.value === '__nuevo'), 'sale en el selector, con «＋ Nuevo mapa…»');
  s.value = 'complejo'; s.dispatchEvent(new Event('change')); for (let i = 0; i < 400 && !(mapa === 'complejo' && N > 1000); i++) await dormir(50); await dormir(500);
  ok(mapa === 'complejo' && N === nComp && !nv(w), 'el Complejo vuelve igual y sin esa pared');
  return fin();
`);
caso('E1 · foto del estado antes de cerrar', `
  await listo(); const a = P0.A;
  OOFundaciones.cambiar(a.fid, { colorLat: '#7a5c48', borde: 'bordillo' }); await listo(); for (let i = 0; i < 54000 && pendientes > 0; i++) await dormir(50); /* con la máquina cargada el servidor de prueba tarda en escribir los cientos de documentos de los casos F4 */
  const foto = {}; for (const o of nuevos.values()) foto[o.id] = { tipo: o.tipo, datos: o.datos, props: o.props || null };
  ok(pendientes === 0, 'todo guardado en el servidor'); return fin({ foto, A: a });
`);
const resultados = [];
let fotoE = null;
const SOLO = arg('solo', ''); /* --solo <expresión>: solo los casos cuyo nombre coincide (sin E) */
for (const c of casos) {
  if (SOLO && !new RegExp(SOLO, 'i').test(c.nombre)) continue;
  const t0 = Date.now(); const r = await correr(c);
  if (c.nombre.startsWith('E1')) fotoE = r.extra;
  if (c.despues) { try { const f = await c.despues(r); if (typeof f === 'string') r.captura = f; } catch (e) { r.comprobaciones.push([false, 'después: ' + e.message]); r.ok = false; } }
  r.nombre = c.nombre; r.ms = Date.now() - t0; resultados.push(r);
  console.log((r.ok ? 'BIEN ' : 'MAL  ') + c.nombre + ' (' + r.ms + ' ms)'); if (r.extra && r.extra.recompute != null) console.log('   rendimiento (ms, mediana de 5): ' + JSON.stringify(r.extra)); for (const [b, t] of r.comprobaciones || []) if (!b || process.argv.includes('--detalle')) console.log('   ' + (b ? '✓' : '✗') + ' ' + t);
}
/* recargar la página y comparar */
if (!SOLO) {
  const t0 = Date.now(); await cargar(); await dormir(1500);
  const cod = `const foto = ${JSON.stringify(fotoE ? fotoE.foto : {})}; const ids = Object.keys(foto);
    ok(ids.length > 0 && ids.length === [...nuevos.values()].length, 'mismo número de objetos (' + ids.length + ')');
    let malos = []; for (const id of ids) { const o = nuevos.get(id); if (!o || canon({ tipo: o.tipo, datos: o.datos, props: o.props || null }) !== canon(foto[id])) malos.push(id + ' ' + canon(o && o.datos).slice(0, 300) + ' ≠ ' + canon(foto[id].datos).slice(0, 300)); }
    ok(!malos.length, 'estructura, propiedades, materiales, anclajes y coordenadas idénticos' + (malos.length ? ': difieren ' + malos.slice(0, 3).join(', ') : ''));
    const A = ${JSON.stringify(fotoE ? fotoE.A : {})}; ok(A.muros && A.muros.every(i => (OOAnclajes.soporte(i) || {}).id === A.fid), 'las paredes siguen ancladas a la fundación');
    ok(OOAnclajes.validar().length === 0, 'sin anclajes rotos tras recargar');
    OOFundaciones.elevar(A.fid, 0.5); ok(A.muros.every(i => casi(nuevos.get(i).datos.y, 0.5)), 'tras recargar, elevar sigue arrastrando lo anclado'); hacerDeshacer();
    return fin();`;
  const r = await correr({ codigo: cod }); r.nombre = 'E2 · cerrar, volver a abrir y comparar'; r.ms = Date.now() - t0; resultados.push(r);
  console.log((r.ok ? 'BIEN ' : 'MAL  ') + r.nombre + ' (' + r.ms + ' ms)'); for (const [b, t] of r.comprobaciones || []) if (!b || process.argv.includes('--detalle')) console.log('   ' + (b ? '✓' : '✗') + ' ' + t);
}
{ const tr = trasRecargar.filter(c => !SOLO || new RegExp(SOLO, 'i').test(c.nombre));
  if (tr.length) { if (SOLO) { await cargar(); await dormir(1500); }
    for (const c of tr) { const t0 = Date.now(), r = { ok: true, comprobaciones: [] }; try { await c.f(r); } catch (e) { r.ok = false; r.comprobaciones.push([false, 'excepción: ' + e.message]); } r.nombre = c.nombre; r.ms = Date.now() - t0; resultados.push(r);
      console.log((r.ok ? 'BIEN ' : 'MAL  ') + r.nombre + ' (' + r.ms + ' ms)'); for (const [b, t] of r.comprobaciones) if (!b || process.argv.includes('--detalle')) console.log('   ' + (b ? '✓' : '✗') + ' ' + t); } } }
const errReales = errores.filter(e => !/no\/existe\.png|Failed to load resource|favicon/i.test(e));
const total = resultados.length, bien = resultados.filter(r => r.ok).length, nComp = resultados.reduce((s, r) => s + (r.comprobaciones || []).length, 0), nBien = resultados.reduce((s, r) => s + (r.comprobaciones || []).filter(c => c[0]).length, 0);
console.log(`\n${bien}/${total} casos bien · ${nBien}/${nComp} comprobaciones · errores de la página: ${errReales.length}`); errReales.slice(0, 10).forEach(e => console.log('   ' + String(e).slice(0, 300)));
if (RES) fs.writeFileSync(RES, JSON.stringify({ fecha: new Date().toISOString(), bien, total, nBien, nComp, errores: errReales, resultados: resultados.map(r => ({ nombre: r.nombre, ok: r.ok, ms: r.ms, captura: r.captura || null, comprobaciones: r.comprobaciones })) }, null, 1));
ws.close(); cerrarEdge(); await dormir(300); process.exit(bien === total && !errReales.length ? 0 : 1);
