// «Enviar al juego» desde la línea de comandos (2.1 pro f6): abre el editor del mapa sin ventana sobre una COPIA de los datos y escribe
// unity/Assets/OperacionOficina/Resources/EditorMapa/cambios_<mapa>.json (lo mismo que el botón del menú Exportar). Después se compila
// el juego (Unity: Operación Oficina → Compilar juego) y los cambios salen en la escena.
//
//   node herramientas/editor_mapa/enviar_al_juego.mjs [--mapa complejo|parqueadero] [--datos carpeta] [--salida carpeta]
//        [--puerto 7821] [--depuracion 9521] [--python ruta\python.exe] [--edge ruta\msedge.exe]
//
// --datos: la carpeta con cambios.json, grupos.json… (por defecto herramientas/editor_mapa/datos_usuario). Se copia a una carpeta
// temporal: el editor nunca escribe en los datos del usuario. --salida: dónde dejar cambios_<mapa>.json (por defecto la de Unity).
// (2.1) Si el mapa se regeneró desde que se hicieron los datos, el servidor migra las referencias de la COPIA al arrancar (con su
// `_base_mapa_<mapa>.json`) y el editor comprueba que cada cambio casa con su pieza (`antes`): si alguno no casa no se escribe nada
// (sale con código 1) salvo con --forzar. Así se generó mal el JSON de la 2.1.2 (índices viejos sobre el mapa nuevo).
// --puerto 7791/7792 solo si no hay nada escuchando ahí (son los del editor del usuario); el 7777 es del juego.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const MAPA = arg('mapa', 'complejo');
if (!/^(complejo|parqueadero)$/.test(MAPA)) { console.error('Mapa desconocido: ' + MAPA); process.exit(2); }
const DATOS = path.resolve(arg('datos', path.join(AQUI, 'datos_usuario')));
const SALIDA = path.resolve(arg('salida', path.join(REPO, 'unity', 'Assets', 'OperacionOficina', 'Resources', 'EditorMapa')));
const PUERTO = +arg('puerto', 7821), DEP = +arg('depuracion', 9521);
if (PUERTO === 7777) { console.error('El 7777 es del juego: usa otro puerto.'); process.exit(2); }
if ([7791, 7792].includes(PUERTO)) {
  let ocupado = false; try { await fetch('http://127.0.0.1:' + PUERTO + '/api/db/capas', { signal: AbortSignal.timeout(1500) }); ocupado = true; } catch { }
  if (ocupado) { console.error('En el ' + PUERTO + ' hay un editor abierto (el del usuario): usa otro puerto.'); process.exit(2); }
}
const EDGE = arg('edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
function buscarPython() {
  const p = arg('python', ''); if (p) return p;
  for (const c of ['python', path.join(process.env.LOCALAPPDATA || '', 'Python', 'pythoncore-3.14-64', 'python.exe'), path.join(process.env.LOCALAPPDATA || '', 'Python', 'bin', 'python.exe')]) {
    try { const r = spawnSync(c, ['-c', 'print(1)'], { encoding: 'utf8' }); if (r.status === 0 && /1/.test(r.stdout)) return c; } catch { }
  }
  return 'python';
}
const dormir = ms => new Promise(r => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'oo_enviar_juego_'));
const COPIA = path.join(TMP, 'datos');
fs.mkdirSync(COPIA, { recursive: true });
if (fs.existsSync(DATOS)) for (const f of fs.readdirSync(DATOS)) { const o = path.join(DATOS, f); if (fs.statSync(o).isFile() && /\.(json|jsonl)$/.test(f)) fs.copyFileSync(o, path.join(COPIA, f)); }
else { console.error('No existe la carpeta de datos: ' + DATOS); process.exit(2); }

const env = Object.assign({}, process.env, { OO_PUERTO_EDITOR: String(PUERTO), OO_DATOS_EDITOR: COPIA, OO_CARTELES_UNITY: path.join(TMP, 'carteles'), OO_REGLAS_UNITY: path.join(TMP, 'reglas'), OO_EDITORMAPA_UNITY: SALIDA });
const srv = spawn(buscarPython(), ['-I', path.join(AQUI, 'servidor.py'), '--sin-navegador'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let edge = null;
const matar = p => { try { if (p && p.pid) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); } } catch { } };
const cerrar = () => { matar(edge); matar(srv); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } };
process.on('exit', cerrar);
try {
  for (let i = 0; ; i++) { try { const r = await fetch('http://127.0.0.1:' + PUERTO + '/api/db/capas'); await r.text(); if (r.ok) break; } catch { } if (i > 120) throw new Error('El servidor del editor no arrancó'); await dormir(250); }
  edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + DEP, '--user-data-dir=' + path.join(TMP, 'edge'), '--window-size=1280,800', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 80; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + DEP + '/json')).json(); break; } catch { await dormir(250); } }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let nid = 0; const pend = new Map(); ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++nid; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Page.navigate', { url: 'http://127.0.0.1:' + PUERTO + '/?prueba' });
  const cargado = async () => { for (let i = 0; i < 180; i++) { await dormir(1000); const n = await ev('typeof window.__ooEval === "function" ? __ooEval("!!D && N && efectivos().size >= 0 ? N : 0") : 0').catch(() => 0); if (n > 0) return n; } throw new Error('El editor no cargó'); };
  await cargado();
  if (await ev('__ooEval("mapa")') !== MAPA) { await ev(`(() => { const s = document.querySelector('#selMapa'); s.value = ${JSON.stringify(MAPA)}; s.dispatchEvent(new Event('change')); return 1; })()`); await dormir(1500); await cargado(); }
  for (let i = 0; i < 60; i++) { const ok = await ev('!!(window.OOModelos && (OOModelos.cargado() || OOModelos.error()))'); if (ok) break; await dormir(500); }
  await dormir(1500);
  const r = await ev('OOJuegoUnity.enviar({ sinDialogo: true, sinDescarga: true, forzar: ' + process.argv.includes('--forzar') + ' })');
  if (r.refs) console.log('Referencias a piezas del mapa: ' + r.refs.revisadas + ' cambios comprobados con su `antes`, ' + r.refs.descuadradas + ' no casan' + (r.refs.descuadradas ? ': ' + r.refs.ejemplos.map(x => 'p' + x.ref + ' (' + x.distancia + ' m)').join(', ') : ''));
  ws.close();
  if (!r.ok) { console.error('No se pudo guardar: ' + r.error); process.exitCode = 1; }
  else {
    const s = r.resumen;
    console.log('Guardado ' + r.ruta + ' (' + r.bytes + ' bytes)');
    console.log(`  ${s.objetos} objetos nuevos (${s.partes} piezas, ${s.puertas} hojas de puerta); piezas del mapa: ${s.borradas} borradas, ${s.movidas} movidas, ${s.cortadas} cortadas, ${s.pintadas} pintadas`);
    if (r.no_soportado.length) { console.log('  No se lleva o va aproximado (' + r.no_soportado.length + '):'); for (const x of r.no_soportado) console.log('   - ' + (x.nombre || x.id) + ': ' + x.motivo); }
    console.log('Ahora compila el juego (Unity: Operación Oficina → Compilar juego).');
  }
} catch (e) { console.error(e.message || e); process.exitCode = 1; }
finally { cerrar(); setTimeout(() => process.exit(), 300); }
