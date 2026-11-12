/* Compila el motor de Rust (motor/) a WebAssembly y lo deja en editor/wasm/motor.wasm.
   Usa `cargo` si está instalado (con el target wasm32-unknown-unknown); si no, un contenedor oficial de Rust con podman o docker.
   Sin ninguno de los tres no falla: el editor funciona igual con su versión en TypeScript (solo más lento en lo que hace el motor).
   Uso: node scripts/motor.mjs [--obligatorio]   (lo llama scripts/build.mjs) */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const obligatorio = process.argv.includes('--obligatorio');
const salida = join(raiz, 'editor/wasm/motor.wasm');
const wasm = join(raiz, 'motor/target/wasm32-unknown-unknown/release/motor.wasm');
const hay = cmd => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const ARGS = ['build', '--release', '--target', 'wasm32-unknown-unknown'];

function compilar() {
  if (hay('cargo')) {
    execFileSync('cargo', ARGS, { cwd: join(raiz, 'motor'), stdio: 'inherit' });
    return 'cargo';
  }
  const motor = hay('podman') ? 'podman' : hay('docker') ? 'docker' : null;
  if (!motor) return null;
  execFileSync(motor, ['run', '--rm', '-v', join(raiz, 'motor') + ':/motor:Z', '-w', '/motor', 'docker.io/library/rust:1-alpine',
    'sh', '-c', 'rustup target add wasm32-unknown-unknown >/dev/null 2>&1 && cargo ' + ARGS.join(' ')], { stdio: 'inherit' });
  return motor + ' (rust:1-alpine)';
}

let con = null;
try { con = compilar(); } catch (e) { if (obligatorio) throw e; console.warn('motor: no se pudo compilar:', e.message); }
if (con && existsSync(wasm)) {
  mkdirSync(join(raiz, 'editor/wasm'), { recursive: true });
  copyFileSync(wasm, salida);
  console.log('motor: editor/wasm/motor.wasm listo (' + con + ')');
} else {
  const msg = 'motor: sin cargo, podman ni docker; el editor usará la versión en TypeScript.';
  if (obligatorio) { console.error(msg); process.exit(1); }
  console.warn(msg);
}
