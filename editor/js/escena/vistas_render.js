/* Editor del mapa (2.1 pro f6): vistas de depuración (especificación §15). Menú Seleccionar → «Vista: …» o OOVistasRender.poner(modo):
   - normal: los materiales de siempre;
   - sin materiales: todo en gris claro con luz simple (se ve la forma, sin colores ni texturas);
   - alambre: las aristas de los triángulos;
   - normales: el color de cada cara es su normal (sirve para ver caras al revés o mal orientadas);
   - colisiones: sin materiales + las colisiones del mapa a la vista; lo que no choca (colisión desactivada) se oculta;
   - anclajes: sin materiales + las líneas de soporte (qué se apoya en qué).
   Solo cambia el dibujo: los datos, la selección y la exportación siguen igual. Los materiales se cambian en las mallas de la escena
   (instanciadas, superficies y mallas reales), no con overrideMaterial, para no tocar el gizmo, las guías ni los textos. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, T = A.THREE;
  const VS = `varying vec3 vN;
    void main() {
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      vN = normalize(transformedNormal);
      #include <begin_vertex>
      #include <project_vertex>
    }`;
  const FS_GRIS = `varying vec3 vN; void main() { float l = 0.42 + 0.5 * max(dot(normalize(vN), normalize(vec3(0.35, 0.8, 0.45))), 0.0); gl_FragColor = vec4(vec3(0.86, 0.86, 0.84) * l, 1.0); }`;
  const FS_NORMAL = `varying vec3 vN; void main() { gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0); }`;
  const mats = {
    gris: new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_GRIS, side: T.DoubleSide }),
    alambre: new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_GRIS, wireframe: true }),
    normales: new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_NORMAL }),
  };
  const MODOS = { normal: null, sin_materiales: 'gris', alambre: 'alambre', normales: 'normales', colisiones: 'gris', anclajes: 'gris' };
  const NOMBRES = { normal: 'Vista: normal', sin_materiales: 'Vista: sin materiales', alambre: 'Vista: alambre', normales: 'Vista: normales', colisiones: 'Vista: colisiones', anclajes: 'Vista: anclajes' };
  let modo = 'normal', verColAntes = null, lineasAntes = null;
  const cambiadas = new Set();
  function esAyuda(o) { for (let p = o; p; p = p.parent) { if (p.isTransformControls || p.type === 'TransformControlsGizmo' || p.type === 'TransformControlsPlane') return true; if (p === A.grupoGuias || p === A.grupoCalcos || p === A.grupoTextos) return true; } return false; }
  function restaurar() { for (const m of cambiadas) { if (m.userData.matVista0) { m.material = m.userData.matVista0; delete m.userData.matVista0; } } cambiadas.clear(); }
  function aplicar() {
    const clave = MODOS[modo];
    restaurar(); if (!clave) { A.marcar(); return; }
    const mat = mats[clave];
    A.scene.traverse(o => {
      if (!o.isMesh || o.isSprite || !o.visible || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      if (o.material && (o.material.transparent && o.material.opacity < 0.2)) return; /* cajas invisibles para elegir */
      if (o.name === 'cielo' || o === A.cielo || (o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map)) return;
      if (esAyuda(o)) return;
      o.userData.matVista0 = o.material; o.material = mat; cambiadas.add(o);
    });
    A.marcar();
  }
  const filtroCol = (k, z) => { if (modo !== 'colisiones') return true; if (k[0] === 'n') { const p = z && z.props; return !(p && p.colision === false); } const pr = A.propsDe(k); return !(pr && pr.colision === false); };
  E.filtrosVis.push(filtroCol);
  function poner(m) {
    if (!(m in MODOS)) return modo;
    const antes = modo; modo = m;
    if (m === 'colisiones') { if (verColAntes == null) verColAntes = A.verCol; A.ponerVerCol(true); } else if (antes === 'colisiones' && verColAntes != null) { A.ponerVerCol(verColAntes); verColAntes = null; }
    if (window.OOAnclajes && OOAnclajes.verLineas) { if (m === 'anclajes') { if (lineasAntes == null) lineasAntes = OOAnclajes.verLineasOn; OOAnclajes.verLineas(true); } else if (antes === 'anclajes' && lineasAntes != null) { OOAnclajes.verLineas(lineasAntes); lineasAntes = null; } }
    if (m === 'colisiones' || antes === 'colisiones') A.renderTodo();
    aplicar(); A.pista(NOMBRES[m] + (m === 'normal' ? '' : '. Vuelve a «Vista: normal» en el menú Seleccionar.'));
    return modo;
  }
  /* las mallas se rehacen (recrearMalla, crearExtras, mallas reales): se vuelve a poner el material de la vista */
  for (const ev of ['render', 'recompute', 'marcado']) E.on(ev, () => { if (modo === 'normal') return; let falta = false; A.scene.traverse(o => { if (o.isMesh && o.visible && !o.userData.matVista0 && !esAyuda(o) && o.material && !Object.values(mats).includes(o.material) && !(o.material.transparent && o.material.opacity < 0.2)) falta = true; }); if (falta) aplicar(); });
  for (const m of Object.keys(MODOS)) E.agregarHerramienta('seleccionar', { n: NOMBRES[m], ic: 'sel', fn: () => poner(m) });
  window.OOVistasRender = { poner, get modo() { return modo; }, modos: Object.keys(MODOS), get cambiadas() { return cambiadas.size; } };
})();
