/* Terreno procedural (menú Terreno → «Generar terreno…»): relieve, erosión, zonas (agua, arena, césped, bosque, tierra, roca,
   nieve), nivel del agua y vegetación, calculados por el motor de Rust (motor/src/procedural.rs).
   - Lo construido del mapa queda protegido: ahí no cambian ni la altura ni la pintura, y el relieve sube suave a su alrededor.
   - Un solo paso de deshacer del terreno («Deshacer trazo») y la vegetación generada es un objeto «vegetacion» por zona de 40 m
     (con props.procedural), que se sustituye al volver a generar.
   - Sin motor (WebAssembly) no hay generación: avisa en vez de fallar.
   API (la usan el diálogo y el asistente): OOProcedural.generar(opciones) → resumen, OOProcedural.abrir(), ESTILOS, PREDETERMINADOS. */
(function () {
  'use strict';
  const E = window.OOEditor, TR = window.OOTerreno; if (!E || !E.api || !TR) return;
  const A = E.api, esc = A.esc, r3 = A.r3;
  const ESTILOS: Record<string, { n: string; i: number; altura: number; escala: number; rugosidad: number; erosion: number; humedad: number; nieve: number; densidad: number }> = {
    llanura: { n: 'Llanura', i: 0, altura: 3, escala: 80, rugosidad: 0.4, erosion: 0, humedad: 0, nieve: 0, densidad: 2 },
    colinas: { n: 'Colinas', i: 1, altura: 12, escala: 70, rugosidad: 0.45, erosion: 0.3, humedad: 0.1, nieve: 0, densidad: 3 },
    montanas: { n: 'Montañas', i: 2, altura: 45, escala: 120, rugosidad: 0.6, erosion: 0.6, humedad: 0, nieve: 30, densidad: 2.5 },
    valle: { n: 'Valle', i: 3, altura: 25, escala: 150, rugosidad: 0.5, erosion: 0.5, humedad: 0.2, nieve: 0, densidad: 3 },
    isla: { n: 'Isla', i: 4, altura: 15, escala: 100, rugosidad: 0.5, erosion: 0.3, humedad: 0.1, nieve: 0, densidad: 3 },
    dunas: { n: 'Dunas (desierto)', i: 5, altura: 6, escala: 40, rugosidad: 0.3, erosion: 0, humedad: -0.8, nieve: 0, densidad: 0.6 }
  };
  const ZONAS = ['agua', 'arena', 'cesped', 'bosque', 'tierra', 'roca', 'nieve'];
  const PLANTAS = ['arbol', 'arbusto', 'palmera'];
  const PREDETERMINADOS = { estilo: 'colinas', semilla: 0, margen: 120, nivelAgua: -0.6, transicion: 25, rio: false, anchoRio: 10, vegetacion: true };
  const TESELA = 40;

  /* Celdas del terreno ocupadas por el mapa:
     - el suelo base del mapa (A.limitesMapa: la pieza 0 más un 8 %);
     - los objetos añadidos que no son vegetación;
     - las piezas sueltas de tamaño normal (las cajas de más de MAX_PIEZA son mallas agrupadas o suelos lejanos y no cuentan). */
  const MAX_PIEZA = 150;
  function mascara(T0: any): Uint8Array {
    const { nx, nz, paso, x0, z0 } = T0, m = new Uint8Array(nx * nz), s = new A.THREE.Vector3();
    const marcar = (b: any, holgura = 1): void => {
      if (b.isEmpty()) return;
      const i0 = Math.max(0, Math.floor((b.min.x - holgura - x0) / paso)), i1 = Math.min(nx - 1, Math.ceil((b.max.x + holgura - x0) / paso));
      const j0 = Math.max(0, Math.floor((b.min.z - holgura - z0) / paso)), j1 = Math.min(nz - 1, Math.ceil((b.max.z + holgura - z0) / paso));
      for (let j = j0; j <= j1; j++) if (i1 >= i0) m.fill(1, j * nx + i0, j * nx + i1 + 1);
    };
    if (A.N) marcar(A.limitesMapa, 0);
    for (let i = 0; i < A.N; i++) {
      const z = A.P[i]; if (!z || z.del || z.cat === 'luz' || z.cat === 'txt' || z.cat === 'col') continue;
      const b = A.cajaEntidades(['p' + i]); if (b.isEmpty() || b.max.y < 0.05) continue; b.getSize(s);
      if (s.x > MAX_PIEZA || s.z > MAX_PIEZA) continue; marcar(b);
    }
    const esVeg = window.OOTerrenoPro ? OOTerrenoPro.esVegetacion : (o: any) => o.tipo === 'vegetacion';
    for (const o of E.nuevos().values()) {
      if (A.tipoBase(o.tipo) === 'nota' || esVeg(o) || (o.props && o.props.procedural)) continue;
      const b = A.cajaEntidades(['n' + o.id]); if (b.isEmpty()) continue; b.getSize(s); if (s.x > MAX_PIEZA * 4 || s.z > MAX_PIEZA * 4) continue; marcar(b);
    }
    return m;
  }
  /* Suelo lejano del mapa: piezas planas por debajo de 0 más grandes que el mapa (el «complejo» trae un plano de 2 km). Si existe,
     el agua tiene que quedar por encima de él o no se vería. Devuelve la altura de su cara de arriba, o null. */
  function sueloLejano(): number | null {
    const L = A.limitesMapa, s = new A.THREE.Vector3(), tam = L.getSize(new A.THREE.Vector3()); let alto: number | null = null;
    for (let i = 0; i < A.N; i++) {
      const z = A.P[i]; if (!z || z.del || z.cat === 'col') continue;
      const b = A.cajaEntidades(['p' + i]); if (b.isEmpty() || b.max.y > 0.02 || b.max.y - b.min.y > 1.5) continue; b.getSize(s);
      if (s.x > tam.x * 1.5 && s.z > tam.z * 1.5) alto = alto == null ? b.max.y : Math.max(alto, b.max.y);
    }
    return alto;
  }

  /** Genera el terreno. opciones: estilo, semilla (0 = al azar), margen (m alrededor del mapa), altura, escala, rugosidad (0–1),
      erosion (0–1), nivelAgua (m, < 0), humedad (-1–1), densidad (plantas/100 m² en bosque), nieve (m, 0 = sin), rio, anchoRio,
      transicion (m), vegetacion (bool). Devuelve un resumen. */
  async function generar(op: any = {}): Promise<any> {
    if (!window.OOMotor) throw new Error('El motor no está cargado.');
    if (!(await OOMotor.listo) || !OOMotor.activo()) throw new Error('El terreno procedural necesita el motor (WebAssembly) y no se pudo cargar en este navegador.');
    const est = ESTILOS[op.estilo] ? op.estilo : PREDETERMINADOS.estilo, base = ESTILOS[est];
    const o = Object.assign({}, PREDETERMINADOS, { altura: base.altura, escala: base.escala, rugosidad: base.rugosidad, erosion: base.erosion, humedad: base.humedad, nieve: base.nieve, densidad: base.densidad }, op, { estilo: est });
    const num = (v: any, d: number, mn: number, mx: number): number => { const n = +v; return isFinite(n) ? Math.max(mn, Math.min(mx, n)) : d; };
    const semilla = Math.floor(num(o.semilla, 0, 0, 2147483647)) || (1 + Math.floor(Math.random() * 2147483646));
    /* versión automática antes de tocar nada (se puede volver a ella desde Historial → Versiones) */
    if (op.guardarVersion !== false && window.OOProductividad && OOProductividad.guardarVersion) { try { await OOProductividad.guardarVersion('Antes de generar el terreno (' + base.n + ')', { auto: true }); } catch (e) { /* sin versión no se bloquea */ } }
    const t0 = performance.now();
    if (TR.datos()) TR.apilarDeshacer();
    const margen = num(o.margen, 120, 20, 1000);
    let T0 = TR.datos();
    const L = A.limitesMapa, cubre = T0 && T0.x0 <= L.min.x - margen + T0.paso && T0.z0 <= L.min.z - margen + T0.paso && T0.x0 + (T0.nx - 1) * T0.paso >= L.max.x + margen - T0.paso && T0.z0 + (T0.nz - 1) * T0.paso >= L.max.z + margen - T0.paso;
    if (!cubre) T0 = TR.rehacer(margen);
    const masc = mascara(T0);
    let nivel = -Math.abs(num(o.nivelAgua, -0.6, -200, -0.05)), aviso = '';
    const lejos = sueloLejano();
    if (lejos != null && nivel < lejos + 0.03) { nivel = Math.min(-0.05, A.r3(lejos + 0.04)); aviso = 'El mapa tiene un suelo lejano a ' + A.r3(lejos) + ' m: el agua se puso a ' + nivel + ' m para que se vea.'; }
    const P = new Float64Array([T0.nx, T0.nz, T0.paso, semilla, base.i, num(o.altura, base.altura, 0, 500), num(o.escala, base.escala, 5, 5000),
      num(o.rugosidad, base.rugosidad, 0, 1), num(o.erosion, base.erosion, 0, 1), nivel, num(o.humedad, base.humedad, -1, 1),
      o.vegetacion === false ? 0 : num(o.densidad, base.densidad, 0, 50), num(o.transicion, 25, 0, 1000), num(o.nieve, base.nieve, 0, 1000),
      T0.x0, T0.z0, o.rio ? 1 : 0, num(o.anchoRio, 10, 1, 200)]);
    const res = OOMotor.terreno(P, masc);
    if (!res) throw new Error('El motor no pudo generar el terreno con esos parámetros.');
    const tMotor = performance.now() - t0;

    /* alturas y pintura (lo protegido se queda como estaba) */
    const idx = ZONAS.map((z) => TR.indicePaleta(z)), cuenta: Record<string, number> = {};
    for (let k = 0; k < masc.length; k++) {
      if (masc[k]) continue;
      T0.alt[k] = res.alturas[k]; const z = res.zonas[k];
      T0.pin[k] = z === 255 ? 255 : idx[z]; if (z !== 255) cuenta[ZONAS[z]] = (cuenta[ZONAS[z]] || 0) + 1;
    }
    /* Celdas protegidas sin nada encima del suelo base (el margen del 8 % de limitesMapa): sin pintar serían transparentes y se
       vería el agua de debajo. Se pintan, a altura 0, con el material del suelo del mapa. */
    if (A.N) {
      const base = A.cajaEntidades(['p0']), docMapa = A.efectivos('mapas').get(A.mapa), mat = TR.indicePaleta((docMapa && docMapa.terreno) || 'cesped');
      for (let j = 0; j < T0.nz; j++) for (let i = 0; i < T0.nx; i++) {
        const k = j * T0.nx + i; if (!masc[k] || T0.pin[k] !== 255) continue;
        const x = T0.x0 + i * T0.paso, z = T0.z0 + j * T0.paso;
        const m = T0.paso; /* también el borde de una celda hacia dentro: si no, el medio triángulo transparente deja ver el agua */
        if (base.isEmpty() || x < base.min.x + m || x > base.max.x - m || z < base.min.z + m || z > base.max.z - m) { T0.pin[k] = mat; T0.alt[k] = 0; }
      }
    }
    TR.ponerNivelAgua(cuenta.agua ? nivel : null); TR.refrescar(); TR.guardar();

    /* vegetación: fuera la generada antes; la nueva en grupos por teselas */
    const lista: any[] = [];
    for (const v of E.nuevos().values()) if (v.props && v.props.procedural) lista.push({ id: v.docId, data: null });
    let nPlantas = 0;
    if (o.vegetacion !== false && res.plantas.length && window.OOTerrenoPro && OOTerrenoPro.datosPlanta) {
      const azar = OOTerrenoPro.azar(semilla), teselas = new Map<string, any[]>();
      for (let i = 0; i < res.plantas.length; i += 3) {
        const x = res.plantas[i], z = res.plantas[i + 1], tipo = PLANTAS[res.plantas[i + 2]] || 'arbol';
        const pl = OOTerrenoPro.datosPlanta(tipo, azar); Object.assign(pl.datos, { x: r3(x), y: r3(TR.alturaEn(x, z)), z: r3(z) });
        const clave = Math.floor(x / TESELA) + ':' + Math.floor(z / TESELA); if (!teselas.has(clave)) teselas.set(clave, []);
        teselas.get(clave).push({ t: pl.tipo, d: pl.datos }); nPlantas++;
      }
      let n = 0;
      for (const plantas of teselas.values()) {
        let cx = 0, cz = 0; for (const p of plantas) { cx += p.d.x / plantas.length; cz += p.d.z / plantas.length; } cx = r3(cx); cz = r3(cz);
        for (const p of plantas) { p.d.x = r3(p.d.x - cx); p.d.z = r3(p.d.z - cz); }
        const cj = window.OOVegetacion ? OOVegetacion.caja(plantas) : { sx: 1, sy: 1, sz: 1 };
        const id = A.nuevoId() + 'pv' + (n++);
        lista.push({ id, data: A.docNuevo(id, 'vegetacion', Object.assign({ x: cx, y: 0, z: cz, giroY: 0, origen: 'base', vegetacion: true, plantas }, cj), { props: { nombre: 'Vegetación generada (' + plantas.length + ')', procedural: true } }) });
      }
    }
    if (lista.length) A.guardar(lista, { etiqueta: 'Terreno procedural: ' + base.n });
    const resumen = { estilo: est, semilla, celdas: masc.length, protegidas: masc.reduce((s: number, v: number) => s + v, 0), zonas: cuenta, plantas: nPlantas, agua: cuenta.agua ? nivel : null, ms_motor: Math.round(tMotor), ms_total: Math.round(performance.now() - t0), area_m: [r3((T0.nx - 1) * T0.paso), r3((T0.nz - 1) * T0.paso)], aviso };
    A.pista('Terreno generado (' + base.n + ', semilla ' + semilla + '): ' + A.fmtInt(nPlantas) + ' plantas. «Deshacer trazo» en el panel del terreno lo revierte.' + (aviso ? ' ' + aviso : ''));
    E.emit && E.emit('procedural', resumen);
    return resumen;
  }

  let ultimas: any = Object.assign({}, PREDETERMINADOS);
  async function abrir(): Promise<void> {
    const f: any = Object.assign({}, ultimas), b = ESTILOS[f.estilo] || ESTILOS.colinas;
    for (const k of ['altura', 'escala', 'rugosidad', 'erosion', 'humedad', 'nieve', 'densidad']) if (f[k] == null) f[k] = (b as any)[k];
    const campo = (k: string, n: string, paso: string, mn: string, mx: string, ayuda = '') => `<label class="campo"><span>${n}</span><input type="number" data-pg="${k}" step="${paso}" min="${mn}" max="${mx}" value="${esc(String(f[k]))}">${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
    const r = A.abrirModal(`<div class="cab">Generar terreno</div><div class="cont"><div class="campos">
      <label class="campo"><span>Estilo</span><select data-pg="estilo" data-foco>${Object.entries(ESTILOS).map(([k, v]) => `<option value="${k}"${k === f.estilo ? ' selected' : ''}>${v.n}</option>`).join('')}</select></label>
      ${campo('semilla', 'Semilla', '1', '0', '2147483647', '0 = una al azar')}
      ${campo('margen', 'Alrededor del mapa (m)', '10', '20', '1000')}
      ${campo('altura', 'Altura del relieve (m)', '1', '0', '500')}
      ${campo('escala', 'Tamaño de las formas (m)', '5', '5', '5000')}
      ${campo('rugosidad', 'Rugosidad (0–1)', '0.05', '0', '1')}
      ${campo('erosion', 'Erosión (0–1)', '0.05', '0', '1', 'Ríos de sedimento y laderas más naturales')}
      ${campo('nivelAgua', 'Nivel del agua (m, bajo el mapa)', '0.1', '-200', '-0.05')}
      ${campo('humedad', 'Humedad (-1 desierto, 1 selva)', '0.1', '-1', '1')}
      ${campo('nieve', 'Nieve desde (m, 0 = sin nieve)', '1', '0', '1000')}
      ${campo('densidad', 'Vegetación (plantas / 100 m²)', '0.5', '0', '50')}
      ${campo('transicion', 'Transición con el mapa (m)', '1', '0', '1000')}
      <label class="campo"><span>Río</span><select data-pg="rio"><option value="">Sin río</option><option value="1"${f.rio ? ' selected' : ''}>Con un río</option></select></label>
      ${campo('anchoRio', 'Ancho del río (m)', '1', '1', '200')}
      </div><p class="ayuda">Lo construido del mapa no se toca: el relieve sube suave a su alrededor. La vegetación generada se reemplaza cada vez que generas. «Deshacer trazo» en el panel del terreno vuelve al terreno de antes.</p></div>
      <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Generar</button></div>`);
    setTimeout(() => document.querySelectorAll<HTMLInputElement>('[data-pg]').forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.pg as string;
      f[k] = k === 'estilo' ? el.value : k === 'rio' ? !!el.value : +el.value;
      if (k === 'estilo') { const e = ESTILOS[el.value]; for (const c of ['altura', 'escala', 'rugosidad', 'erosion', 'humedad', 'nieve', 'densidad']) { f[c] = (e as any)[c]; const i = document.querySelector<HTMLInputElement>(`[data-pg="${c}"]`); if (i) i.value = String((e as any)[c]); } }
    })), 30);
    if ((await r) !== true) return;
    ultimas = Object.assign({}, f);
    A.pista('Generando el terreno…');
    try { const res = await generar(f); if (!+f.semilla) ultimas.semilla = 0; console.info('Terreno procedural', res); }
    catch (e: any) { A.pista(e.message || String(e)); }
  }

  /* Mapa nuevo con relieve: el documento del mapa (colección «mapas», lo crea el panel o «＋ Nuevo mapa…») trae «generar» con los
     parámetros. La primera vez que lo abre alguien que puede editar, se genera y se marca «generado» para no repetirlo. */
  let pendiente = '';
  async function generarSiToca(): Promise<void> {
    const mapa = A.mapa; if (!mapa || pendiente === mapa) return;
    for (let i = 0; i < 60 && A.mapa === mapa; i++) { if (A.efectivos('mapas').get(mapa) && A.N) break; await new Promise((r) => setTimeout(r, 250)); }
    const doc = A.efectivos('mapas').get(mapa);
    if (!doc || !doc.generar || doc.generado || A.mapa !== mapa) return;
    await new Promise((r) => setTimeout(r, 1200)); /* que llegue el terreno guardado, si ya lo hay */
    if (TR.datos() || A.mapa !== mapa) return;
    if (window.OONube) { const p = await OONube.info; if (!p || p.rol === 'lector') return; }
    pendiente = mapa;
    A.pista('Generando el relieve del mapa nuevo…');
    try {
      const r = await generar(Object.assign({}, doc.generar, { guardarVersion: false }));
      const act = A.efectivos('mapas').get(mapa) || doc;
      A.guardarCol('mapas', mapa, Object.assign({}, act, { generado: A.ahora(), semilla_usada: r.semilla }));
      if (A.encuadrarCaja && TR.datos()) { const T0 = TR.datos(), Th = A.THREE; A.encuadrarCaja(new Th.Box3(new Th.Vector3(T0.x0, -2, T0.z0), new Th.Vector3(T0.x0 + (T0.nx - 1) * T0.paso, 10, T0.z0 + (T0.nz - 1) * T0.paso))); }
    } catch (e: any) { A.pista('No se pudo generar el relieve: ' + (e.message || e) + ' Puedes hacerlo desde Terreno → «Generar terreno…».'); pendiente = ''; }
  }
  E.on('mapa', () => { generarSiToca(); });
  setTimeout(generarSiToca, 500);

  window.OOProcedural = { generar, abrir, ESTILOS, PREDETERMINADOS, mascara, sueloLejano, generarSiToca };
})();
