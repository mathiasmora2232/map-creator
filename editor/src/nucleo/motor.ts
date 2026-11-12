/* Puente con el motor de Rust (motor/ → editor/wasm/motor.wasm). Carga el .wasm en segundo plano; mientras no esté (o si falla,
   o en un navegador sin WebAssembly) cada función devuelve null y quien la llama usa su versión en TypeScript.
   window.OOMotor = { listo: Promise<boolean>, activo(), crc32(Uint8Array) → number | null, version } */
(function () {
  'use strict';
  const VERSION_INTERFAZ = 1;
  let ex: any = null;
  const yo = document.querySelector('script[src*="nucleo/motor.js"]') as HTMLScriptElement | null;
  const v = yo && /[?&]v=(\w+)/.exec(yo.src);
  const url = new URL('../../wasm/motor.wasm' + (v ? '?v=' + v[1] : ''), yo ? yo.src : location.href).href;

  const listo: Promise<boolean> = (async () => {
    try {
      if (typeof WebAssembly !== 'object') return false;
      const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) return false;
      const { instance } = await WebAssembly.instantiate(await r.arrayBuffer(), {});
      const e: any = instance.exports;
      if (typeof e.version !== 'function' || e.version() !== VERSION_INTERFAZ) { console.warn('motor.wasm: versión distinta, se usa TypeScript'); return false; }
      ex = e; return true;
    } catch (err) { console.warn('motor.wasm no disponible, se usa TypeScript:', err && err.message); return false; }
  })();

  /* Copia los bytes a la memoria del módulo, llama a f(puntero, n) y libera. La vista se crea después de reservar porque
     reservar puede hacer crecer la memoria (y eso invalida las vistas anteriores). */
  function conBytes<R>(u8: Uint8Array, f: (p: number, n: number) => R): R {
    const n = u8.byteLength, p = ex.reservar(n);
    try { new Uint8Array(ex.memory.buffer, p, n).set(u8); return f(p, n); }
    finally { ex.liberar(p, n); }
  }

  function crc32(u8: Uint8Array): number | null {
    if (!ex) return null;
    try { return conBytes(u8, (p, n) => ex.crc32_bytes(p, n) >>> 0); } catch (err) { console.warn('motor.wasm crc32:', err); return null; }
  }

  window.OOMotor = { listo, activo: () => !!ex, crc32, version: VERSION_INTERFAZ };
})();
