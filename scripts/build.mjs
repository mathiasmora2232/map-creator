/* Compila el TypeScript con esbuild (tsc solo comprueba tipos: `npm run tipos`).
   - Sitio: cada página es un bundle IIFE en sitio/js/<página>.js (lo que cargan los .html).
     sitio/js/recorrido.js va suelto porque el editor lo carga a demanda (window.MCRecorrido).
   - Editor: cada editor/src/**.ts se transforma 1:1 a editor/js/**.js (son scripts clásicos que comparten globales window.OO*;
     index.html los carga en orden). Las declaraciones .d.ts no se emiten.
   - Motor (Rust → WebAssembly): scripts/motor.mjs deja editor/wasm/motor.wasm (se salta con --sin-motor).
   Uso: node scripts/build.mjs [--watch] [--min] [--sin-motor]  */
import * as esbuild from 'esbuild';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--min');
const conMotor = !process.argv.includes('--sin-motor');

const PAGINAS = {
  landing: 'sitio/src/paginas/landing.ts',
  cuenta: 'sitio/src/paginas/cuenta.ts',
  verificar: 'sitio/src/paginas/verificar.ts',
  recuperar: 'sitio/src/paginas/recuperar.ts',
  invitacion: 'sitio/src/paginas/invitacion.ts',
  panel: 'sitio/src/panel/index.ts',
  recorrido: 'sitio/src/recorrido.ts'
};

function archivos(dir, ext) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...archivos(p, ext));
    else if (p.endsWith(ext) && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const comun = { target: 'es2022', sourcemap: 'linked', minify, logLevel: 'info', charset: 'utf8', legalComments: 'none' };

const sitio = {
  ...comun,
  entryPoints: Object.fromEntries(Object.entries(PAGINAS).map(([k, v]) => [k, join(raiz, v)])),
  outdir: join(raiz, 'sitio/js'),
  bundle: true,
  format: 'iife'
};

const srcEditor = join(raiz, 'editor/src');
const editor = {
  ...comun,
  entryPoints: archivos(srcEditor, '.ts').map(p => ({ in: p, out: relative(srcEditor, p).replace(/\.ts$/, '') })),
  outdir: join(raiz, 'editor/js'),
  bundle: false,
  // sin format: se transforma tal cual (sin import/export, sigue siendo un script clásico)
};

if (!watch) {
  // Que no queden .js de archivos .ts borrados o renombrados.
  for (const d of ['sitio/js', 'editor/js']) rmSync(join(raiz, d), { recursive: true, force: true });
}

if (conMotor) spawnSync(process.execPath, [join(raiz, 'scripts/motor.mjs')], { stdio: 'inherit' });

if (watch) {
  const ctxs = await Promise.all([esbuild.context(sitio), esbuild.context(editor)]);
  await Promise.all(ctxs.map(c => c.watch()));
  console.log('Vigilando sitio/src y editor/src… (Ctrl+C para salir)');
} else {
  await Promise.all([esbuild.build(sitio), esbuild.build(editor)]);
}
