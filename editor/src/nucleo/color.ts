/* Color realista: se carga justo después de three.js y antes que el resto del editor, porque la gestión de color tiene que estar
   puesta antes de que se cree ningún color o material.
   - Los colores en hexadecimal se interpretan como sRGB y se convierten a lineal (THREE.ColorManagement.legacyMode = false); la luz
     se calcula en lineal y la imagen sale en sRGB con mapeo de tonos ACES (nucleo/editor.ts). Así las sombras, la luz y los colores
     se ven como en un motor de juego, y el GLB exporta los colores en lineal, como pide glTF (antes salían más claros en Unity).
   - Los lienzos (etiquetas, carteles, notas, calcos) se marcan como sRGB. Los mapas de normales se marcan lineales donde se crean.
   - Ajustes → «Color»: «Realista» (por defecto) o «Clásico» (como antes). Se aplica al recargar.
   window.OOColor = { realista } */
(function () {
  'use strict';
  const T = window.THREE; if (!T) return;
  let realista = true;
  try { const a = JSON.parse(localStorage.getItem('oo-editor-ajustes') || '{}'); if (a && a.color === 'clasico') realista = false; } catch { /* sin ajustes */ }
  window.OOColor = { realista };
  if (!realista) return;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  const Base = T.CanvasTexture;
  T.CanvasTexture = class extends Base { constructor(...a: any[]) { super(...a); this.encoding = T.sRGBEncoding; } };
  /* todos los renderers (la vista y las miniaturas del catálogo, materiales y modelos) salen en sRGB con ACES */
  const R = T.WebGLRenderer;
  T.WebGLRenderer = class extends R { constructor(...a: any[]) { super(...a); this.outputEncoding = T.sRGBEncoding; this.toneMapping = T.ACESFilmicToneMapping; this.toneMappingExposure = 1.45; } };
})();
