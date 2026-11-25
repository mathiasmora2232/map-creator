/* Extrae el catálogo del editor (window.OO.ITEMS y CATEGORIAS) a editor/js/catalogo_items.json para el servidor (herramientas MCP:
   buscar en el catálogo y validar lo que se coloca). Ejecuta los scripts del catálogo ya compilados en un contexto aislado con
   THREE y el DOM de mentira: solo hacen falta los datos, no la geometría.
   Uso: node scripts/catalogo.mjs (lo llama scripts/build.mjs después de compilar el editor). */
import fs from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const hueco = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : hueco), apply: () => hueco, construct: () => hueco });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, Math, JSON, Object, Array, Map, Set, WeakMap, String, Number, Boolean, Date, RegExp, Error, Symbol, Promise, Proxy,
  parseFloat, parseInt, isFinite, isNaN, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
  Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array };
Object.assign(ctx, { window: ctx, self: ctx, THREE: hueco, document: hueco, navigator: {}, location: { search: '', href: '', origin: '' }, localStorage: { getItem: () => null, setItem() {} }, fetch: () => new Promise(() => {}) });
vm.createContext(ctx);
const ARCHIVOS = ['catalogo/catalogo.js', 'catalogo/catalogo_extra.js', 'catalogo/presets_muro.js', 'catalogo/prefabs_proc.js', 'catalogo/kits_edificios.js', 'catalogo/vegetacion.js'];
const fallos = [];
for (const f of ARCHIVOS) {
  try { vm.runInContext(fs.readFileSync(join(raiz, 'editor/js', f), 'utf8'), ctx, { filename: f, timeout: 5000 }); }
  catch (e) { fallos.push(f + ': ' + String(e).slice(0, 120)); }
}
const OO = ctx.OO;
if (!OO || !Array.isArray(OO.ITEMS) || !OO.ITEMS.length) { console.error('catálogo: no se pudo extraer', fallos.join(' | ')); process.exit(1); }
const cats = Object.fromEntries((OO.CATEGORIAS || []).map((c) => [c[0], c[1]]));
const items = OO.ITEMS.filter((i) => i && i.id && i.tipo).map((i) => ({ id: String(i.id), nombre: String(i.n || i.id), categoria: String(i.cat || ''), categoria_nombre: cats[i.cat] || String(i.cat || ''), tipo: String(i.tipo), datos: JSON.parse(JSON.stringify(i.datos || {})) }));
fs.writeFileSync(join(raiz, 'editor/js/catalogo_items.json'), JSON.stringify({ generado: new Date().toISOString(), categorias: cats, items }));
console.log('catálogo: editor/js/catalogo_items.json (' + items.length + ' objetos' + (fallos.length ? ', avisos: ' + fallos.join(' | ') : '') + ')');
