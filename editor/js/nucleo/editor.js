/* Editor del mapa de Operación Oficina (2.0.6). Vista 3D/planta/caminar del mapa exportado de Unity, herramientas tipo Sims/Planner 5D
   (paredes con medidas, habitaciones, puertas que abren hueco, pintar, catálogo) y tipo SketchUp (empujar/tirar, cinta, guías,
   inferencias, capas, grupos, componentes). Cada cambio se guarda como documento en la colección "cambios" (formato en BACKLOG). */
(function () {
'use strict';
/* ====================== utilidades ====================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r3 = n => Math.round((+n || 0) * 1000) / 1000;
const fmt = (n, d = 2) => { n = +n || 0; if (Math.abs(n) < Math.pow(10, -d) / 2) n = 0; return n.toFixed(d).replace('.', ',').replace('-', '−'); };
const fmtInt = n => Number(n).toLocaleString('es');
const ahora = () => new Date().toISOString();
const esperar = ms => new Promise(r => setTimeout(r, ms));
const cuadro = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const clon = o => o == null ? o : JSON.parse(JSON.stringify(o));
const DEG = Math.PI / 180;
const normAng = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return r3(a); };
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }
function ponerCarga(txt) { const c = $('#carga'); if (txt == null) { c.hidden = true; return; } c.hidden = false; $('#cargaTxt').textContent = txt; }
const blobUrl = id => '/_blob/' + String(id).split('/').map(encodeURIComponent).join('/');

if (!window.THREE || !THREE.OrbitControls || !THREE.TransformControls || !window.OO) {
  ponerCarga('No se pudo cargar la librería 3D (three.js). Revisa la conexión a internet y recarga la página.');
  const g = document.querySelector('#carga .giro'); if (g) g.style.display = 'none';
  return;
}
const V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4;
const { MATERIALES, MAT_MURO, MAT_SUELO, OBJ, COCHES, CONTS, CATEGORIAS, ITEMS, construir, tramos, huecoDe, oscuro } = window.OO;

/* ====================== ajustes ====================== */
const AJ_DEF = { sens: 1, velocidad: 1, invertirGiro: false, invertirZoom: false, orbitarCursor: true, ayudaHerr: false, ajuste: false, paso: 0.25, angulo: 15, inferencias: true, unidades: 'm', calidad: 'media', sombras: true, cotas: true, etiquetas: true, minimapa: true, fondo: '#a9c8e6', tema: 'oscuro', resolucion: 1, distancia: 2800, mallasReales: true }; /* (editor v2) tema oscuro por defecto, como el concepto; gráficos */
let AJ = Object.assign({}, AJ_DEF); try { Object.assign(AJ, JSON.parse(ls('oo-editor-ajustes') || '{}')); } catch (e) { }
function guardarAjustes() { ls('oo-editor-ajustes', JSON.stringify(AJ)); }
const fmtLen = m => AJ.unidades === 'cm' ? fmt(m * 100, 0) + ' cm' : fmt(m, 2) + ' m';

/* ====================== iconos y herramientas ====================== */
const ICON = {
  sel: '<path d="M5 3l13 7.5-5.5 1.6L10 18z"/><path d="M13 13l5 6"/>',
  pared: '<path d="M3 7h18v10H3zM3 12h18M9 7v5M15 12v5"/>',
  habitacion: '<path d="M4 4h16v16H4z"/><path d="M4 14h6v6"/><path d="M14 4v6h6"/>',
  puerta: '<path d="M6 21V4h12v17M3 21h18"/><path d="M14 12.5h1"/>',
  ventana: '<path d="M4 5h16v14H4zM12 5v14M4 12h16"/>',
  suelo: '<path d="M3 17l5-10h13l-5 10z"/><path d="M8 12h11"/>',
  techo: '<path d="M2 12L12 4l10 8"/><path d="M5 10v10h14V10"/>',
  pintar: '<path d="M4 15l8-8 6 6-8 8z"/><path d="M12 7l2-2 6 6-2 2"/><path d="M19 17s2 2.2 2 3.3a2 2 0 0 1-4 0c0-1.1 2-3.3 2-3.3z"/>',
  empujar: '<path d="M4 14h12v6H4z"/><path d="M10 14V4M7 7l3-3 3 3"/>',
  medir: '<path d="M3 15l12-12 6 6-12 12z"/><path d="M7 11l2 2M10 8l2 2M13 5l2 2"/>',
  catalogo: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
  nota: '<path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  objeto: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>'
};
if (window.OOUI) for (const k in OOUI.ICONOS) if (!ICON[k]) ICON[k] = OOUI.ICONOS[k]; /* (editor v2) iconos de ui_paneles.js */
const svg = (k, c = 'ic') => `<svg class="${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.objeto}</svg>`;
const HERR = [['sel', 'Seleccionar', 'Espacio'], 'Construir', ['pared', 'Pared', 'L'], ['habitacion', 'Habitación', 'H'], ['puerta', 'Puerta', 'U'], ['ventana', 'Ventana', 'I'], ['suelo', 'Suelo / calle', 'J'], ['techo', 'Techo', 'X'], ['pintar', 'Pintar', 'B'], 'Modelar', ['empujar', 'Empujar / tirar', 'P'], ['medir', 'Medir / guía', 'T'], 'Objetos', ['catalogo', 'Catálogo', 'C'], ['nota', 'Nota', 'N']];
const NOMBRE_HERR = {}; HERR.forEach(h => { if (Array.isArray(h)) NOMBRE_HERR[h[0]] = h[1]; });
/* (editor v2) Barra de herramientas con menús: cada botón despliega sus subherramientas. Un elemento es [herramienta, nombre, tecla]
   o un objeto {h: herramienta, n, k: tecla, ...parámetros} o {a: acción de ACCIONES, v: valor, n}. Otros archivos añaden menús o
   elementos con OOEditor.agregarMenu(menu) y OOEditor.agregarHerramienta(idMenu, elemento). */
const MENUS = [
  { id: 'seleccionar', n: 'Seleccionar', ic: 'sel', items: [['sel', 'Seleccionar', 'Espacio'], { a: 'gz', v: 'translate', n: 'Mover con el gizmo', k: 'M' }, { a: 'gz', v: 'rotate', n: 'Girar con el gizmo', k: 'G' }, { a: 'gz', v: 'scale', n: 'Escalar con el gizmo', k: 'K' }, { a: 'mostrar-ocultos', n: 'Mostrar lo ocultado' }] },
  { id: 'construir', n: 'Construir', ic: 'construir', items: [{ h: 'pared', preset: 'exterior', n: 'Muro exterior (como el del juego)' }, ['pared', 'Pared', 'L'], { h: 'pared', preset: 'tabique', n: 'Tabique de oficina' }, { h: 'pared', preset: 'bloque', n: 'Pared de bloque' }, { h: 'pared', preset: 'malla', n: 'Valla de malla' }, { h: 'pared', preset: 'reja', n: 'Reja' }, ['habitacion', 'Habitación', 'H'], { h: 'habitacion', modo: 'poligono', n: 'Habitación (polígono)' }, { h: 'habitacion', modo: 'edificio', n: 'Edificio' }, ['puerta', 'Puerta', 'U'], ['ventana', 'Ventana', 'I'], ['hueco', 'Hueco en pared', 'O'], ['techo', 'Techo', 'X']] },
  { id: 'modelar', n: 'Modelar', ic: 'modelar', items: [['empujar', 'Empujar / tirar', 'P'], { a: 'tab-obj', n: 'Techo o rampa con pendiente', nota: 'Selecciona una pieza: sección del inspector' }, { a: 'ctx-agrupar', n: 'Agrupar la selección', k: 'Ctrl+G' }, { a: 'ctx-desagrupar', n: 'Desagrupar', k: 'Ctrl+Mayús+G' }, { a: 'ctx-componente', n: 'Crear prefab con la selección' }, { a: 'duplicar', n: 'Duplicar', k: 'Ctrl+D' }] },
  { id: 'pintar', n: 'Pintar', ic: 'pintar', items: [['pintar', 'Pintar con material', 'B'], { a: 'tab-material', n: 'Material del objeto seleccionado' }] },
  { id: 'terreno', n: 'Terreno', ic: 'terreno', items: [['suelo', 'Suelo / calle', 'J'], { h: 'suelo', material: 'asfalto', n: 'Calle de asfalto' }, { h: 'suelo', material: 'concreto', n: 'Vereda de concreto' }, { h: 'suelo', material: 'adoquin', n: 'Adoquín' }, { h: 'suelo', material: 'cesped', n: 'Césped' }, { h: 'suelo', material: 'tierra', n: 'Tierra' }] },
  { id: 'objetos', n: 'Objetos', ic: 'objeto', items: [['catalogo', 'Colocar objeto del catálogo', 'C'], { a: 'panel-catalogo', n: 'Mostrar el catálogo' }, { a: 'ctx-componente', n: 'Crear prefab con la selección' }] },
  { id: 'medir', n: 'Medir', ic: 'medir', items: [{ h: 'medir', modo: 'distancia', n: 'Distancia', k: 'T' }, { h: 'medir', modo: 'angulo', n: 'Ángulo' }, { a: 'medidas-borrar', n: 'Borrar medidas' }] },
  { id: 'guias', n: 'Guías', ic: 'guias', items: [{ h: 'medir', modo: 'guia', guia: 'x', n: 'Guía este-oeste' }, { h: 'medir', modo: 'guia', guia: 'z', n: 'Guía norte-sur' }, { a: 'guias-borrar', n: 'Borrar todas las guías' }, { a: 'rejilla', n: 'Mostrar u ocultar la rejilla' }] },
  { id: 'notas', n: 'Notas', ic: 'nota', items: [['nota', 'Nota con fotos', 'N'], { a: 'tab-notas', n: 'Lista de notas' }, { a: 'tab-fotos', n: 'Fotos de referencia' }] }
];
/* (editor v2) avisos para los módulos (jerarquia.js, catalogo_ui.js…): recompute, render, seleccion, herramienta, vista, panel, marcado, mapa, fondo, col */
const oyentes = {};
function avisar(ev, x) { const l = oyentes[ev]; if (l) for (const f of l) { try { f(x); } catch (e) { console.warn('oyente ' + ev, e); } } }
const filtrosVis = [], bloqueos = [], fuentesItems = [], instOcultas = new Set();
Object.assign(NOMBRE_HERR, { 'calco-mover': 'Mover calco', 'calco-alinear': 'Alinear calco', 'calco-medida': 'Escala con una medida', colocar: 'Colocar objeto', hueco: 'Hueco en pared' });
const TECLA_HERR = { ' ': 'sel', l: 'pared', h: 'habitacion', u: 'puerta', i: 'ventana', o: 'hueco', j: 'suelo', x: 'techo', b: 'pintar', p: 'empujar', t: 'medir', c: 'catalogo', n: 'nota' };
const PISTAS = {
  sel: 'Clic: seleccionar · Mayús+clic: añadir · arrastrar en vacío: selección por rectángulo (→ dentro, ← cruce) · arrastrar lo seleccionado: mover (Alt: copia) · rueda: zoom · botón central: desplazar · botón derecho: orbitar.',
  pared: 'Clic para empezar y clic para cada esquina: las medidas se ven en vivo y se imanta a extremos, puntos medios y ejes. Enter, Esc o doble clic termina.',
  habitacion: 'Rectángulo: arrastra para crear 4 paredes con su suelo. Polígono: clic en cada esquina y clic en el primer punto (o Enter) para cerrar.',
  puerta: 'Clic sobre la cara de una pared: la puerta se encaja y abre el hueco.',
  ventana: 'Clic sobre la cara de una pared: la ventana se encaja y abre el hueco.',
  hueco: 'Clic sobre la cara de una pared (original o nueva): abre un vano con el ancho, el alto y la altura desde el suelo elegidos. Luego se mueve a lo largo de la pared y se cambia de tamaño en el inspector; si se borra, la pared vuelve a quedar entera.',
  suelo: 'Arrastra una franja sobre el suelo para crear calle, vereda o piso.',
  techo: 'Clic dentro de una habitación (o de un recinto de paredes cerrado) para generar su techo.',
  pintar: 'Elige un material y haz clic en paredes, suelos u objetos. Alt+clic: cuentagotas.',
  empujar: 'Arrastra una cara para extruirla: la cara de arriba sube o baja; las de los lados alargan o acortan.',
  medir: 'Distancia: clic en dos puntos. Ángulo: vértice y dos puntos. Guía: clic para trazar una línea guía.',
  catalogo: 'Elige un objeto en la pestaña Catálogo y colócalo en el mapa (o arrástralo).',
  colocar: 'Clic para colocar · R o rueda: girar · se imanta a paredes · rojo = choca con algo · Esc para terminar.',
  nota: 'Clic en el mapa para dejar un pin con nota y fotos.',
  'calco-mover': 'Arrastra sobre el mapa para mover el calco. Esc para terminar.',
  'calco-alinear': 'Marca en el mapa el punto 1 y luego el punto 2 (los mismos que marcaste en la imagen). Esc para cancelar.',
  'calco-medida': 'Marca sobre el calco los dos extremos de algo cuya medida real conozcas (una pared, una plaza de parqueo…). Esc para cancelar.',
  caminar: 'Clic en la vista para capturar el ratón (Tab o Esc lo suelta). W A S D para andar, Mayús correr, E abre puertas, G atraviesa paredes. Si no se captura, arrastra para mirar.'
};
const CAMPOS = {
  muro: [['sx', 'Largo (m)'], ['sy', 'Alto (m)'], ['sz', 'Grosor (m)'], ['material', 'Material', 'matmuro'], ['color', 'Color', 'color']],
  puerta: [['estilo', 'Tipo de puerta', 'opc'], ['sx', 'Ancho (m)'], ['sy', 'Alto (m)'], ['color', 'Color del marco', 'color'], ['hoja', 'Color de la hoja', 'color']],
  cartel: (window.OOCartel ? OOCartel.CAMPOS : [['texto', 'Texto', 'text']]),
  ventana: [['sx', 'Ancho (m)'], ['sy', 'Alto (m)'], ['alfeizar', 'Alféizar (m)'], ['color', 'Color del marco', 'color']],
  hueco: [['sx', 'Ancho (m)'], ['sy', 'Alto (m)'], ['alfeizar', 'Altura desde el suelo (m)']],
  edificio: [['sx', 'Ancho X (m)'], ['sz', 'Fondo Z (m)'], ['alto', 'Alto por piso (m)'], ['pisos', 'Pisos', 'int'], ['grosor', 'Grosor muros (m)'], ['material', 'Material', 'matmuro'], ['color', 'Color', 'color']],
  calle: [['sx', 'Ancho X (m)'], ['sz', 'Largo Z (m)'], ['material', 'Superficie', 'matsuelo'], ['color', 'Color', 'color']],
  habitacion: [['nombre', 'Nombre', 'text'], ['material', 'Suelo', 'matsuelo'], ['color', 'Color', 'color'], ['alto', 'Alto de paredes (m)']],
  techo: [['grosor', 'Grosor (m)'], ['material', 'Material', 'matmuro'], ['color', 'Color', 'color']],
  poste: [['sy', 'Alto (m)'], ['alcance', 'Alcance luz (m)']],
  luz: [['altura', 'Altura (m)'], ['alcance', 'Alcance (m)'], ['color', 'Color de la luz', 'color']],
  arbol: [['sy', 'Alto (m)'], ['sx', 'Ancho copa (m)'], ['color', 'Color copa', 'color']],
  coche: [['subtipo', 'Modelo', 'coche'], ['color', 'Color', 'color']],
  contenedor: [['subtipo', 'Largo', 'cont'], ['color', 'Color', 'color']],
  trailer: [['sx', 'Largo (m)'], ['color', 'Color', 'color']],
  copia: [['sx', 'Largo X (m)'], ['sy', 'Alto (m)'], ['sz', 'Ancho Z (m)']],
  modelo: [['sx', 'Largo X (m)'], ['sy', 'Alto (m)'], ['sz', 'Ancho Z (m)'], ['color', 'Tinte', 'color']],
  nota: []
};
const NOMBRES_TIPO = { modelo: 'Modelo importado', cartel: 'Cartel', muro: 'Pared', puerta: 'Puerta', ventana: 'Ventana', hueco: 'Hueco', edificio: 'Edificio', calle: 'Suelo / calle', poste: 'Farola', luz: 'Luz', arbol: 'Árbol', coche: 'Coche', contenedor: 'Contenedor', trailer: 'Tráiler', objeto: 'Objeto', nota: 'Nota', copia: 'Copia', pieza: 'Pieza', grupo: 'Grupo', seleccion: 'Selección', habitacion: 'Habitación', techo: 'Techo', pintura: 'Pintura', fundacion: 'Fundación', escalera: 'Escalera', rampa: 'Rampa', baranda: 'Baranda' };
const TIPO_N = ['Caja', 'Malla', 'Cilindro', 'Tubo de colisión', 'Bloque de colisión', 'Luz', 'Letrero', 'Puerta del entorno'];
const ACC = { agregar: 'Agregado', modificar: 'Modificado', borrar: 'Borrado', nota: 'Nota' };
function tipoBase(t) { t = String(t || ''); const i = t.indexOf(':'); return i < 0 ? t : t.slice(0, i); }
function nombreTipo(t) {
  t = String(t || ''); const i = t.indexOf(':'); const base = i < 0 ? t : t.slice(0, i), sub = i < 0 ? '' : t.slice(i + 1);
  if (base === 'objeto') return (OBJ[sub] && OBJ[sub].n) || ('Objeto ' + sub);
  if (base === 'pieza') return 'Pieza (' + sub + ')';
  if (base === 'grupo') return 'Grupo ' + sub;
  if (base === 'seleccion') return 'Selección de ' + sub + ' piezas';
  if (base === 'pintura') return 'Pintura' + (sub ? ' (' + sub + ')' : '');
  return NOMBRES_TIPO[base] || t || '—';
}

/* ====================== estado ====================== */
let D = null, N = 0, P = [], mapa = ls('oo-editor-mapa') === 'parqueadero' ? 'parqueadero' : /^u-[A-Za-z0-9_\-]{1,60}$/.test(ls('oo-editor-mapa') || '') ? ls('oo-editor-mapa') : 'complejo'; /* (2.1) u-…: mapa nuevo del usuario (mapas_nuevos.js) */
const cacheMapas = {};
let nuevos = new Map(), notasMarcas = [];
const cols = {}; // colecciones: {snap: Map, ov: Map}
['cambios', 'calcos', 'capas', 'grupos', 'componentes', 'guias', 'zonas', 'materiales', 'assets', 'terreno', 'reglas', 'etiquetas', 'mapas'].forEach(c => cols[c] = { snap: new Map(), ov: new Map() }); /* (editor v2) zonas, materiales propios y modelos importados */
let db = null, userCap = null, assets = null, autor = null;
let estadoBD = 'cargando', errMsg = '', sinPermiso = false, pendientes = 0, segCarga = 10;
let cola = Promise.resolve();
let deshacer = [], rehacer = [];
let herramienta = 'sel', vista = ['3d', 'planta'].includes(ls('oo-editor-vista')) ? ls('oo-editor-vista') : '3d', gizmoModo = 'translate';
let verCol = false, verLuces = false, verNotas = true, verRejilla = true;
let secOn = [], secLock = [];
let sel = [], selSet = new Set(), selGrupo = null;
let arrastre = null, pendRecompute = false, sucio = true;
let calcoArr = null, calcoSel = null, alinear = null;
let notaTrabajo = { fotos: [] };
let galeria = [], galeriaCargada = false, visor = { lista: [], i: 0 };
let ocultos = new Set(), portapapeles = null, medidas = [], ultimoRaton = null;
let capaActiva = ls('oo-editor-capa') || 'General';
let grupoDe = new Map();
let solapeSel = false;
let escBase = null, escUniforme = true; /* (editor v2) escala del inspector: tamaño de la selección al elegirla y candado de escala uniforme */
const params = {
  pared: { sy: 2.6, sz: 0.2, material: 'bloque', color: MATERIALES.bloque.c, preset: '' },
  habitacion: { modo: 'rect', material: 'baldosa', color: MATERIALES.baldosa.c, alto: 2.6, grosor: 0.2, matmuro: 'bloque', colormuro: MATERIALES.bloque.c, pisos: 1 },
  puerta: { estilo: 'metal_oficina', sx: 0.9, sy: 2.1, color: '#5d666b', hoja: '#4a555a' },
  ventana: { sx: 1.2, sy: 1.0, alfeizar: 1.0, color: '#3d7fbf' },
  hueco: { sx: 1.0, sy: 1.2, alfeizar: 0.9 },
  suelo: { material: 'asfalto', color: MATERIALES.asfalto.c },
  techo: { grosor: 0.15, material: 'chapa', color: MATERIALES.chapa.c, alto: 2.6 },
  pintar: { material: 'pintura', color: '#e8e6df' },
  medir: { modo: 'distancia', guia: 'x' },
  nota: { fotoPendiente: null },
  colocar: { item: null, giro: 0 }
};

/* ====================== escena ====================== */
const vistaEl = $('#vista');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.localClippingEnabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const dom = renderer.domElement; dom.id = 'lienzo'; dom.tabIndex = 0; dom.setAttribute('aria-label', 'Vista 3D del mapa');
vistaEl.prepend(dom);
const scene = new THREE.Scene();
const camP = new THREE.PerspectiveCamera(55, 1, 0.3, 6000); camP.position.set(60, 80, 120);
const camO = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 4000); camO.up.set(0, 0, -1); camO.position.set(0, 1000, 0); camO.lookAt(0, 0, 0);
let cam = camP;
const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x8a8577, 0.62); scene.add(hemi);
const sol = new THREE.DirectionalLight(0xfff4e0, 0.78); sol.position.set(-80, 150, 60); scene.add(sol); scene.add(sol.target);
const solDir = new V3(-0.45, 0.8, 0.38).normalize(); let distDibujo = 2800; /* (editor v2) dirección del sol (ambiente.js) y distancia de dibujado */
const herrPropias = {}; /* (editor v2) herramientas de otros módulos (zonas…): {n, pista, down, move, up, fin, panel} */
sol.shadow.bias = -0.0006; sol.shadow.normalBias = 0.02;
const clip = new THREE.Plane(new V3(0, -1, 0), 1000);
const tc = new THREE.TransformControls(camP, dom); tc.setSpace('local'); tc.size = 0.9; scene.add(tc);
const ctl3 = new THREE.OrbitControls(camP, dom); ctl3.maxPolarAngle = Math.PI * 0.495; ctl3.minDistance = 1; ctl3.maxDistance = 3000; ctl3.screenSpacePanning = false;
const ctlP = new THREE.OrbitControls(camO, dom); ctlP.enableRotate = false; ctlP.enabled = false; ctlP.minZoom = 0.02; ctlP.maxZoom = 120; ctlP.screenSpacePanning = true;
ctl3.addEventListener('change', () => { sucio = true; });
ctlP.addEventListener('change', () => { sucio = true; });
tc.addEventListener('change', () => { sucio = true; });
tc.addEventListener('dragging-changed', e => { ctl3.enabled = !e.value && vista === '3d'; ctlP.enabled = !e.value && vista === 'planta'; });
const pivote = new THREE.Object3D(); scene.add(pivote);
const grid3 = new THREE.GridHelper(2000, 200, 0x6a7480, 0x9aa3ad); grid3.material.transparent = true; grid3.material.opacity = 0.18; grid3.material.depthWrite = false; grid3.position.y = 0.04; scene.add(grid3);
const grupoTextos = new THREE.Group(); scene.add(grupoTextos);
const grupoFormas = new THREE.Group(); scene.add(grupoFormas);
const grupoCalcos = new THREE.Group(); scene.add(grupoCalcos);
const grupoGuias = new THREE.Group(); scene.add(grupoGuias);
const previa = new THREE.Group(); scene.add(previa);
const marcas = new THREE.Group(); scene.add(marcas);
const matPrevia = new THREE.MeshBasicMaterial({ color: 0xf08a2c, transparent: true, opacity: 0.5, depthWrite: false });
const matPreviaMal = new THREE.MeshBasicMaterial({ color: 0xe53935, transparent: true, opacity: 0.55, depthWrite: false });
/* (2.1 pro) fantasma de colocación: verde válido, rojo choca o no vale, amarillo aviso (sin apoyo, medio fuera, dependencia pendiente) */
matPrevia.color.setHex(0x2fae5a);
const matPreviaAviso = new THREE.MeshBasicMaterial({ color: 0xf2b824, transparent: true, opacity: 0.55, depthWrite: false });
/* cielo */
const cieloMat = new THREE.ShaderMaterial({
  uniforms: { arriba: { value: new THREE.Color() }, horizonte: { value: new THREE.Color() }, abajo: { value: new THREE.Color('#7d786d') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 arriba; uniform vec3 horizonte; uniform vec3 abajo; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizonte, arriba, pow(min(h * 1.7, 1.0), 0.65)) : mix(horizonte, abajo, min(-h * 5.0, 1.0)); gl_FragColor = vec4(c, 1.0); }',
  side: THREE.BackSide, depthWrite: false, depthTest: false
});
const cielo = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), cieloMat); cielo.frustumCulled = false; cielo.renderOrder = -10; scene.add(cielo);

const geoBox = new THREE.BoxGeometry(1, 1, 1), geoSph = new THREE.SphereGeometry(0.5, 14, 10), geoCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const mkO = () => new THREE.MeshLambertMaterial({ color: 0xffffff, clippingPlanes: [clip] });
const mkT = () => new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, clippingPlanes: [clip] });
const DEFM = { boxH: [geoBox, () => new THREE.MeshBasicMaterial({ visible: false })], boxO: [geoBox, mkO], boxT: [geoBox, mkT], sph: [geoSph, mkO], cylO: [geoCyl, mkO], cylT: [geoCyl, mkT], luz: [geoSph, () => new THREE.MeshBasicMaterial({ color: 0xffffff, clippingPlanes: [clip] })] };
let M = {};
const CERO = new M4().makeScale(0, 0, 0);
const RESALTE = new THREE.Color('#ff7a00');
const _m = new M4(), _m2 = new M4(), _m3 = new M4(), _v = new V3(), _v2 = new V3(), _q = new Q4(), _s = new V3(), _c = new THREE.Color(), _e = new THREE.Euler();
const ARRIBA = new V3(0, 1, 0);
const yawDe = q => _e.setFromQuaternion(q, 'YXZ').y;
const qY = g => new Q4().setFromAxisAngle(ARRIBA, g);
/* inclinación (giro sobre X y Z): solo objetos sueltos; muros, recintos, techos de recinto, huecos, luces y notas giran solo en Y */
const SIN_INCL = ['muro', 'habitacion', 'techo', 'puerta', 'ventana', 'hueco', 'luz', 'nota', 'edificio', 'fundacion', 'escalera', 'rampa', 'baranda'];
const inclinable = k => k[0] === 'p' || (nuevos.get(k.slice(1)) && !SIN_INCL.includes(tipoBase(nuevos.get(k.slice(1)).tipo)));
const qDatos = d => new Q4().setFromEuler(new THREE.Euler((+d.incX || 0) * DEG, (+d.giroY || 0) * DEG, (+d.incZ || 0) * DEG, 'YXZ'));
const eulerDe = q => new THREE.Euler().setFromQuaternion(q, 'YXZ');

function crearMalla(nombre, cap) {
  const [g, mf] = DEFM[nombre];
  const mesh = new THREE.InstancedMesh(g, mf(), cap);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.userData.nombre = nombre;
  const transp = nombre === 'boxT' || nombre === 'cylT';
  mesh.castShadow = !transp && nombre !== 'luz'; mesh.receiveShadow = !transp && nombre !== 'luz';
  if (transp) mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}
function recrearMalla(nombre, cap) {
  const m = M[nombre]; scene.remove(m.mesh); m.mesh.material.dispose(); m.mesh.dispose();
  m.mesh = crearMalla(nombre, cap); m.cap = cap; m.owner = new Array(cap);
  const bb = new Float32Array(cap * 6); bb.set(m.bb.subarray(0, Math.min(m.bb.length, bb.length))); m.bb = bb;
}
/* matriz de una instancia + su caja envolvente alineada (para elegir y para solapes) */
function ponerMat(m, slot, mat) {
  m.mesh.setMatrixAt(slot, mat);
  const o = slot * 6, b = m.bb;
  if (mat === CERO) { b[o] = 1; b[o + 3] = -1; return; }
  const e = mat.elements;
  const hx = 0.5 * (Math.abs(e[0]) + Math.abs(e[4]) + Math.abs(e[8])), hy = 0.5 * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])), hz = 0.5 * (Math.abs(e[2]) + Math.abs(e[6]) + Math.abs(e[10]));
  b[o] = e[12] - hx; b[o + 1] = e[13] - hy; b[o + 2] = e[14] - hz; b[o + 3] = e[12] + hx; b[o + 4] = e[13] + hy; b[o + 5] = e[14] + hz;
}

/* ====================== carga del mapa ====================== */
const TINTES = [[/leafy_grass|grass/, '#6f9448'], [/brown_mud/, '#a8927a'], [/asphalt/, '#707070'], [/concrete_floor/, '#c4c1bb'], [/painted_plaster/, '#ecebe6'], [/concrete_block/, '#cfccc5'], [/planks|wood/, '#8f6d4b'], [/box_profile|corrugated|metal_sheet/, '#a3abb2'], [/metal_plate/, '#a9adb1']];
function tintar(hex, tex) { if (!tex) return hex; for (const [re, t] of TINTES) if (re.test(tex)) { const c = new THREE.Color(hex).multiply(new THREE.Color(t)); return '#' + c.getHexString(); } return hex; }
function clasificar(t, fl, nom, matName, grpName) {
  const vis = (fl & 2) !== 0;
  if (t === 5) return ['luz', 'luz'];
  if (t === 6) return [null, 'txt'];
  if (t === 7) return ['boxO', 'puerta'];
  if (t === 3) return ['cylT', 'col'];
  if (t === 4) return ['boxT', 'col'];
  if (!vis) return [(t === 2 || nom === 'cilindro') ? 'cylT' : 'boxT', 'col'];
  if (t === 2) return ['cylO', 'vis'];
  if (t === 1) { if (nom === 'esfera') return ['sph', 'vis']; if (nom === 'cilindro') return ['cylO', 'vis']; }
  if (/vidrio|cristal/i.test(grpName || '') || /vidrio|cristal/i.test(matName || '')) return ['boxT', 'vidrio'];
  return ['boxO', 'vis'];
}
function textoMalla(texto, w, h, bg, fg, pt) {
  if (pt && pt.cartel && window.OOCartel) return OOCartel.malla(pt.cartel, w, h); /* (2.1) carteles del usuario: carteles.js */
  const lineas = String(texto).split('\n');
  const W = 512, H = Math.max(48, Math.min(1024, Math.round(512 * h / Math.max(w, 0.01))));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let fs = Math.floor(H / (lineas.length * 1.3));
  g.font = '600 ' + fs + 'px "IBM Plex Sans", Arial, sans-serif';
  const mx = Math.max(1, ...lineas.map(l => g.measureText(l).width));
  if (mx > W * 0.92) { fs = Math.max(8, Math.floor(fs * W * 0.92 / mx)); g.font = '600 ' + fs + 'px "IBM Plex Sans", Arial, sans-serif'; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lineas.forEach((l, j) => g.fillText(l, W / 2, H / 2 + (j - (lineas.length - 1) / 2) * fs * 1.2));
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, clippingPlanes: [clip] }));
}
function liberar(mesh) { if (!mesh) return; if (mesh.parent) mesh.parent.remove(mesh); mesh.geometry.dispose(); if (mesh.material.map) mesh.material.map.dispose(); mesh.material.dispose(); }
function limpiarEscena() {
  for (const k in M) { scene.remove(M[k].mesh); M[k].mesh.material.dispose(); M[k].mesh.dispose(); }
  M = {}; if (window.OOMallas) OOMallas.limpiar();
  for (const ch of grupoTextos.children.slice()) liberar(ch);
  for (const ch of grupoFormas.children.slice()) liberar(ch);
  nuevos = new Map(); notasMarcas = [];
}
let zonas = [];
const mallasOn = () => (window.OOMallas && AJ.mallasReales !== false) ? window.OOMallas : null; /* (editor v2) Ajustes → mallas reales sí o no */
function construirBase(d) {
  limpiarEscena();
  D = d; N = d.piezas.length; P = new Array(N);
  const cuenta = { boxH: 0, boxO: 0, boxT: 0, sph: 0, cylO: 0, cylT: 0, luz: 0 };
  for (let i = 0; i < N; i++) {
    const a = d.piezas[i];
    const t = a[0], sec = a[1], grp = a[2], mat = a[13], fl = a[14], nomI = a[15];
    const nom = nomI >= 0 ? d.nombres[nomI] : '';
    const matName = mat >= 0 && d.materiales[mat] ? d.materiales[mat][0] : '';
    const grpName = grp >= 0 ? d.grupos[grp] : '';
    let [mesh, cat] = clasificar(t, fl, nom, matName, grpName);
    /* (2.1) malla real del juego: la caja queda invisible (para elegir) y se dibuja la malla (mallas_reales.js) */
    if (mallasOn() && (mesh === 'boxO' || mesh === 'boxT') && cat !== 'col' && OOMallas.tiene(a)) mesh = 'boxH';
    /* la marca de la bisagra de cada puerta (tablón marrón de 0,9 × 2,1 m) sobra cuando se ve la hoja real: sigue para elegirla */
    if (mallasOn() && t === 7 && OOMallas.hayMallas()) mesh = 'boxH';
    const p = new V3(a[3], a[4], -a[5]);
    const q = new Q4(-a[9], -a[10], a[11], a[12]); if (q.lengthSq() < 1e-9) q.set(0, 0, 0, 1); q.normalize();
    let s = new V3(a[6], a[7], a[8]);
    let col;
    if (t === 5) col = /^#[0-9a-f]{6}$/i.test(nom) ? nom : '#ffe8b0';
    else if (cat === 'col') col = t === 3 ? '#ff6a3d' : '#ff3b3b';
    else if (t === 7) col = '#8b6a4a';
    else col = mat >= 0 && d.materiales[mat] ? tintar(d.materiales[mat][1], d.materiales[mat][2]) : '#9a9a9a';
    if (t === 5) s = new V3(0.35, 0.35, 0.35);
    if (t === 7) s = new V3(0.9, 2.1, 0.06);
    if (t === 6) s = new V3(1, 1, 1);
    const c = new THREE.Color(col);
    const pz = { t, sec, grp, mat, fl, nom, mesh, cat, raw: [a[6], a[7], a[8]], b: { p, q, s, c }, p: p.clone(), q: q.clone(), s: s.clone(), c: c.clone(), del: false, doc: null, nota: null, slot: -1, txt: null, cortes: null, material: null };
    if (mesh) pz.slot = cuenta[mesh]++;
    if (t === 6) {
      /* (2.1) tamaño real del Label3D (antes ×5: «AUDITORÍA» y «SISTEMAS» se pisaban) y letras nítidas como en el juego (carteles.js) */
      let tm, w, h;
      if (window.OOCartel) { const L = OOCartel.letrero(nom || '', a[6] || 0.1); tm = L.malla; w = L.w; h = L.h; }
      else { const lin = String(nom || '').split('\n'); const lh = Math.max(0.03, (a[6] || 0.06)); w = Math.max(...lin.map(l => l.length)) * lh * 0.62 + lh * 0.4; h = lin.length * lh * 1.3; tm = textoMalla(nom || '', w, h, '#f4f2ea', '#1b1f24'); }
      tm.userData.key = 'p' + i; pz.txt = tm; pz.tw = w; pz.th = h; grupoTextos.add(tm);
    }
    P[i] = pz;
  }
  for (const k in cuenta) { const cap = cuenta[k] + 4000; M[k] = { mesh: crearMalla(k, cap), base: cuenta[k], cap, used: cuenta[k], owner: new Array(cap), bb: new Float32Array(cap * 6) }; }
  if (mallasOn()) OOMallas.construir(d, P, scene);
  secOn = new Array(d.secciones.length + 1).fill(true); secLock = new Array(d.secciones.length + 1).fill(false);
  renderSecciones(); calcularAuto();
  let maxY = 10; for (let i = 0; i < N; i++) { const z = P[i]; if (z.cat === 'vis') maxY = Math.max(maxY, z.p.y + z.s.y / 2); }
  const cr = $('#corte'); cr.max = String(Math.ceil(maxY)); if (clip.constant >= 999) cr.value = cr.max;
  ponerCorte(clip.constant >= 999 ? null : clip.constant);
  /* etiquetas de zonas: centro de las piezas visibles de cada sección */
  const EXCL = /^(Suelo|Perimetro|Colisiones|Luces|Letreros|Entorno|Exterior|Autos|Puertas|ObjetosSueltos|Referencias|DetallesParqueadero|Portones|InterioresOficinas|FachadaOficinas)$/;
  zonas = [];
  d.secciones.forEach((nombre, j) => {
    if (EXCL.test(nombre)) return; let n = 0, x = 0, z = 0, top = 0;
    for (let i = 0; i < N; i++) { const pz = P[i]; if (pz.sec !== j || pz.cat !== 'vis') continue; if (pz.s.x > 60 || pz.s.z > 60) continue; n++; x += pz.p.x; z += pz.p.z; top = Math.max(top, pz.p.y + pz.s.y / 2); }
    if (n > 3) zonas.push({ nombre: nombre.replace(/([a-z])([A-Z])/g, '$1 $2'), p: new V3(x / n, Math.min(top, 25) + 1.5, z / n) });
  });
}
async function cargarMapa(nombre) {
  ponerCarga('Descargando el mapa ' + (nombre === 'complejo' ? 'Complejo' : nombre === 'parqueadero' ? 'Parqueadero' : nombre) + '…');
  try {
    let d = cacheMapas[nombre];
    /* (2.1) mapa nuevo del usuario: su base (suelo de ejemplo) la genera mapas_nuevos.js a partir de la colección «mapas» */
    if (/^u-/.test(nombre)) {
      if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
      d = window.OOMapasNuevos ? await OOMapasNuevos.base(nombre) : null;
      if (!d) { pista('No se encontró el mapa «' + nombre + '»: se abre el Complejo.'); mapa = nombre = 'complejo'; ls('oo-editor-mapa', nombre); const s = $('#selMapa'); if (s) s.value = nombre; d = cacheMapas[nombre]; }
    }
    if (!d) {
      const r = await fetch('mapas/mapa_' + nombre + '.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); d = await r.json(); cacheMapas[nombre] = d;
      /* (2.1) versión del mapa cargado: va en cada escritura (local.js) para que el servidor no acepte índices de pieza de un mapa viejo */
      const ver = r.headers.get('X-OO-Version-Mapa'); if (ver) (window.OOVersionMapa = window.OOVersionMapa || {})[nombre] = ver;
    }
    ponerCarga('Construyendo ' + fmtInt(d.piezas.length) + ' piezas…');
    await cuadro();
    if (mallasOn()) { ponerCarga('Cargando las mallas reales (puertas, coches, objetos)…'); await OOMallas.cargar(nombre, d); }
    construirBase(d);
    recompute(); renderCalcos(); renderGuias(); renderCapas();
    encuadrarInicio();
    minimapaFondo();
    ponerCarga(null);
    avisar('mapa', nombre);
  } catch (e) {
    console.error(e);
    ponerCarga('No se pudo cargar mapa_' + nombre + '.json (' + (e.message || e) + ').');
    const g = document.querySelector('#carga .giro'); if (g) g.style.display = 'none';
  }
}

/* ====================== capas ====================== */
function capasLista() {
  const m = efectivos('capas'); const l = [...m].map(([id, d]) => Object.assign({ id }, d)).filter(c => c && c.nombre);
  if (!l.some(c => c.nombre === 'General')) l.unshift({ id: 'general', nombre: 'General', color: '#8a929c', visible: true, bloqueada: false, orden: 0 });
  return l.sort((a, b) => (a.orden || 0) - (b.orden || 0) || String(a.nombre).localeCompare(String(b.nombre)));
}
function capaInfo(nombre) { return capasLista().find(c => c.nombre === nombre) || { nombre, visible: true, bloqueada: false }; }
function capaDeNuevo(o) { const d = efectivos('cambios').get(o.docId); return (d && d.capa) || 'General'; }

/* ====================== visibilidad y dibujo ====================== */
function visible(i) {
  const z = P[i]; if (z.del) return false;
  if (!secOn[z.sec + 1]) return false;
  if (ocultos.has('p' + i)) return false;
  if (z.cat === 'col') return verCol;
  if (z.cat === 'luz') return verLuces;
  for (const f of filtrosVis) if (!f('p' + i, z)) return false; /* (editor v2) capas por categoría, zonas aisladas u ocultas */
  return true;
}
const _cp = new V3(), _cq = new Q4(), _cs = new V3(), _cu = new V3();
function cortarMatriz(m) {
  const h = clip.constant; if (h >= 999) return true;
  m.decompose(_cp, _cq, _cs); _cu.set(0, 1, 0).applyQuaternion(_cq);
  if (Math.abs(_cu.y) < 0.999) return true;
  const half = _cs.y / 2, bot = _cp.y - half, top = _cp.y + half;
  if (top <= h + 1e-4) return true;
  if (bot >= h) return false;
  _cs.y = h - bot; _cp.y = bot + _cs.y / 2; m.compose(_cp, _cq, _cs); return true;
}
function matrizPieza(i, out) {
  const z = P[i];
  if (z.t === 7) { _v.set(0, 1.05, 0).applyQuaternion(z.q).add(z.p); return out.compose(_v, z.q, z.s); }
  if (z.t === 6) { _v2.set(z.tw || 1, z.th || 1, 0.02); return out.compose(z.p, z.q, _v2); }
  return out.compose(z.p, z.q, z.s);
}
function escribirInst(k, s, mat, color, key, cortar) {
  const m = M[k]; _m3.copy(mat);
  ponerMat(m, s, (!cortar || k === 'sph' || k === 'luz' || cortarMatriz(_m3)) ? _m3 : CERO);
  if (instOcultas.has(key)) m.mesh.setMatrixAt(s, CERO); /* (editor v2) la dibuja otro módulo (material propio, sombras por objeto); se sigue pudiendo elegir */
  _c.copy(color); if (selSet.has(key)) _c.lerp(solapeSel ? new THREE.Color('#e53935') : RESALTE, 0.55);
  m.mesh.setColorAt(s, _c); m.owner[s] = key;
}
function escribirPieza(i) {
  const z = P[i], key = 'p' + i;
  if (z.cat === 'txt') { if (z.txt) { z.txt.visible = visible(i); z.txt.position.copy(z.p); z.txt.quaternion.copy(z.q); } return; }
  const m = M[z.mesh]; if (!m) return;
  const vis = visible(i);
  if (z.real) OOMallas.escribir(z, vis, selSet.has(key), solapeSel ? new THREE.Color('#e53935') : RESALTE);
  if (!vis || z.cortes) { ponerMat(m, z.slot, CERO); m.owner[z.slot] = key; }
  else { matrizPieza(i, _m); escribirInst(z.mesh, z.slot, _m, z.c, key, true); }
  if (z.cortes) for (const ct of z.cortes) { if (vis) escribirInst(ct.k, ct.s, ct.m, z.c, key, true); else { ponerMat(M[ct.k], ct.s, CERO); } }
}
function mallaDe(pt) { if (pt.oculta) return 'boxH'; /* (2.1) caja invisible que viste modelos_juego.js */ if (pt.f === 's') return 'sph'; if (pt.f === 'l') return 'luz'; if (pt.f === 'c') return pt.t ? 'cylT' : 'cylO'; return pt.t ? 'boxT' : 'boxO'; }
function matrizObjeto(e, out) { _v.set(+e.x || 0, +e.y || 0, +e.z || 0); _q.copy(qDatos(e)); _s.set(1, 1, 1); return out.compose(_v, _q, _s); }
function partesMundo(o) {
  let parts; try { parts = construir(o); } catch (err) { console.warn(err); parts = [OO.B(0, 0.5, 0, 1, 1, 1, '#ff00ff')]; }
  const Mo = matrizObjeto(o.datos, new M4());
  const lq = new Q4(), lp = new V3(), lsz = new V3();
  for (const pt of parts) {
    if (pt.f === 'poly') { pt.m = Mo.clone(); if (Array.isArray(pt.lm) && pt.lm.length === 16) pt.m.multiply(new M4().fromArray(pt.lm)); continue; } /* (2.1 pro f3) pt.lm: matriz local (planos inclinados, perfiles extruidos) */
    if (pt.q) lq.fromArray(pt.q).normalize(); else if (pt.r) lq.setFromEuler(new THREE.Euler(pt.r[0], pt.r[1], pt.r[2])); else lq.set(0, 0, 0, 1);
    lp.fromArray(pt.p);
    if (pt.f === 't') lsz.set(pt.w, pt.h, 0.02); else lsz.set(Math.max(1e-4, Math.abs(pt.s[0])), Math.max(1e-4, Math.abs(pt.s[1])), Math.max(1e-4, Math.abs(pt.s[2])));
    pt.m = new M4().multiplyMatrices(Mo, new M4().compose(lp, lq, lsz));
  }
  return parts;
}
function visibleNuevo(o) {
  if (o.tipo === 'nota' && !verNotas) return false;
  if (ocultos.has('n' + o.id)) return false;
  for (const f of filtrosVis) if (!f('n' + o.id, o)) return false;
  return capaInfo(capaDeNuevo(o)).visible !== false;
}
function quitarTextos(o) { for (const t of o.textos || []) liberar(t); o.textos = []; for (const f of o.formas || []) liberar(f); o.formas = []; }
/* (2.1 pro) forma de un polígono (suelo, techo, fundación) con sus agujeros (pt.agujeros: lista de polígonos [[x, z]…] en el mismo marco) */
function formaPoly(pt) {
  const sh = new THREE.Shape(pt.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (Array.isArray(pt.agujeros)) for (const ag of pt.agujeros) if (Array.isArray(ag) && ag.length >= 3) sh.holes.push(new THREE.Path(ag.map(([x, z]) => new THREE.Vector2(x, -z))));
  return sh;
}
function crearExtras(o) {
  quitarTextos(o);
  for (const pt of o.partes) {
    if (pt.f === 't') { const tm = textoMalla(pt.texto, pt.w, pt.h, pt.bg || '#1f5a3a', pt.fg || '#ffffff', pt); pt.m.decompose(_v, _q, _s); tm.position.copy(_v); tm.quaternion.copy(_q); tm.userData.key = 'n' + o.id; grupoTextos.add(tm); o.textos.push(tm); }
    else if (pt.f === 'poly' && pt.pts && pt.pts.length >= 3) {
      const sh = formaPoly(pt);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: pt.grosor || 0.03, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, pt.y || 0, 0);
      _c.set(pt.c || '#cccccc'); if (selSet.has('n' + o.id)) _c.lerp(RESALTE, 0.45);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: _c.clone(), clippingPlanes: [clip], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, transparent: !!pt.t, opacity: pt.t ? 0.42 : 1, depthWrite: !pt.t, side: pt.lm ? THREE.DoubleSide : THREE.FrontSide })); /* (2.1 pro f3) cubiertas transparentes */
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(pt.m); mesh.receiveShadow = !pt.t; mesh.castShadow = !pt.t && (tipoBase(o.tipo) === 'techo' || !!pt.lm); if (pt.t) mesh.renderOrder = 2;
      mesh.userData.key = 'n' + o.id; grupoFormas.add(mesh); o.formas.push(mesh);
    }
  }
}
function marcarActualizado() { for (const k in M) { const m = M[k].mesh; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } sucio = true; avisar('marcado'); }
/* uniones de esquinas y huecos de puertas/ventanas */
function prepararMuros() {
  const muros = [], huecosOrig = new Map();
  for (const o of nuevos.values()) { o.ext = null; o.huecos = null; if (tipoBase(o.tipo) === 'muro') muros.push(o); }
  const ext = muros.map(o => { const d = o.datos, g = (+d.giroY || 0) * DEG, L = (+d.sx || 0) / 2, ux = Math.cos(g), uz = -Math.sin(g); o.ext = [0, 0]; o.huecos = []; return { o, ends: [[d.x - ux * L, d.z - uz * L], [d.x + ux * L, d.z + uz * L]], u: [ux, uz] }; });
  for (const a of ext) for (const b of ext) {
    if (a === b) continue; if (Math.abs(a.u[0] * b.u[0] + a.u[1] * b.u[1]) > 0.97) continue;
    for (let k = 0; k < 2; k++) for (const eb of b.ends) if (Math.hypot(a.ends[k][0] - eb[0], a.ends[k][1] - eb[1]) < 0.08 && Math.abs((a.o.datos.y || 0) - (b.o.datos.y || 0)) < 0.3) a.o.ext[k] = Math.max(a.o.ext[k], (+b.o.datos.sz || 0.2) / 2);
  }
  for (const o of nuevos.values()) {
    const b = tipoBase(o.tipo); if (b !== 'puerta' && b !== 'ventana' && b !== 'hueco') continue; const d = o.datos; if (d.muro == null) continue;
    const h = b === 'hueco' ? { w: Math.max(0.05, +d.sx || 1), al: +d.alfeizar || 0, h: Math.max(0.05, +d.sy || 1) } : huecoDe(d, b); /* (2.1) hueco propio: vano sin marco */
    if (typeof d.muro === 'string') {
      const w = nuevos.get(d.muro); if (!w || !w.huecos) continue; const wd = w.datos, g = (+wd.giroY || 0) * DEG;
      h.u = (d.x - wd.x) * Math.cos(g) + (d.z - wd.z) * -Math.sin(g); w.huecos.push(h);
    } else if (P[d.muro] && P[d.muro].t <= 1 && P[d.muro].mesh === 'boxO') {
      const z = P[d.muro]; const loc = new V3(d.x, d.y, d.z).sub(z.p).applyQuaternion(z.q.clone().invert());
      const ejeX = z.s.x >= z.s.z; h.u = ejeX ? loc.x : loc.z; h.al += (d.y - (z.p.y - z.s.y / 2));
      if (!huecosOrig.has(d.muro)) huecosOrig.set(d.muro, { ejeX, hs: [] }); huecosOrig.get(d.muro).hs.push(h);
    }
  }
  return huecosOrig;
}
function partesCorteOriginal(i, info) {
  const z = P[i]; const L = info.ejeX ? z.s.x : z.s.z, G = info.ejeX ? z.s.z : z.s.x, H = z.s.y;
  const parts = tramos(-L / 2, L / 2, -H / 2, H, G, info.hs, '#ffffff', false);
  const Mp = new M4().compose(z.p, z.q, new V3(1, 1, 1));
  return parts.map(pt => { const p = info.ejeX ? pt.p : [pt.p[2], pt.p[1], pt.p[0]], s = info.ejeX ? pt.s : [pt.s[2], pt.s[1], pt.s[0]]; return { k: z.mesh, m: new M4().multiplyMatrices(Mp, new M4().compose(new V3(p[0], p[1], p[2]), new Q4(), new V3(s[0], s[1], s[2]))) }; });
}
function renderTodo() {
  if (!D) return;
  const huecosOrig = prepararMuros();
  const need = { boxH: 0, boxO: 0, boxT: 0, sph: 0, cylO: 0, cylT: 0, luz: 0 };
  for (let i = 0; i < N; i++) P[i].cortes = null;
  for (const [i, info] of huecosOrig) { if (P[i].del) continue; P[i].cortes = partesCorteOriginal(i, info); need[P[i].mesh] += P[i].cortes.length; }
  for (const o of nuevos.values()) { o.partes = visibleNuevo(o) ? partesMundo(o) : []; for (const pt of o.partes) if (pt.f !== 't' && pt.f !== 'poly') need[mallaDe(pt)]++; }
  const marcasN = verNotas ? notasMarcas : []; need.sph += marcasN.length;
  for (const k in M) { const m = M[k]; const total = m.base + need[k]; if (total > m.cap) recrearMalla(k, total + 4000); m.used = m.base; }
  for (let i = 0; i < N; i++) if (P[i].cortes) for (const ct of P[i].cortes) ct.s = M[ct.k].used++;
  for (let i = 0; i < N; i++) escribirPieza(i);
  for (const o of nuevos.values()) {
    o.slots = [];
    for (const pt of o.partes) { if (pt.f === 't' || pt.f === 'poly') continue; const k = mallaDe(pt); const s = M[k].used++; o.slots.push([k, s]); escribirInst(k, s, pt.m, new THREE.Color(pt.c || '#cccccc'), 'n' + o.id, true); }
    crearExtras(o);
  }
  for (const mk of marcasN) {
    const s = M.sph.used++; const d = mk.datos || {};
    _m.compose(_v.set(+d.x || 0, (+d.y || 0) + 0.5, +d.z || 0), _q.set(0, 0, 0, 1), _s.set(0.45, 0.45, 0.45));
    escribirInst('sph', s, _m, new THREE.Color(mk.fotos && mk.fotos.length ? '#1f6feb' : '#ffb300'), 't' + mk.docId, false);
  }
  for (const k in M) { const m = M[k]; m.mesh.count = m.used; }
  marcarActualizado(); actualizarContorno(); programarMinimapa(); avisar('render');
}
function renderNuevo(o) {
  const partes = partesMundo(o); const sinT = partes.filter(p => p.f !== 't' && p.f !== 'poly');
  const b = tipoBase(o.tipo);
  if (b === 'muro' || b === 'puerta' || b === 'ventana' || b === 'hueco' || !o.slots || sinT.length !== o.slots.length || sinT.some((p, j) => mallaDe(p) !== o.slots[j][0])) { renderTodo(); return; }
  o.partes = partes; let j = 0;
  for (const pt of partes) { if (pt.f === 't' || pt.f === 'poly') continue; const [k, s] = o.slots[j++]; escribirInst(k, s, pt.m, new THREE.Color(pt.c || '#cccccc'), 'n' + o.id, true); }
  crearExtras(o); marcarActualizado();
}
function pintarEntidad(key) {
  if (key[0] === 'p') { const i = +key.slice(1); if (P[i]) escribirPieza(i); }
  else if (key[0] === 'n') { const o = nuevos.get(key.slice(1)); if (o && o.slots) { let j = 0; for (const pt of o.partes) { if (pt.f === 't' || pt.f === 'poly') continue; const sl = o.slots[j++]; if (sl) escribirInst(sl[0], sl[1], pt.m, new THREE.Color(pt.c || '#cccccc'), key, true); } if (o.formas && o.formas.length) crearExtras(o); } }
}

/* contorno de selección y cotas */
const contornoGeo = new THREE.BufferGeometry();
const contornoMat = new THREE.LineBasicMaterial({ color: 0xff7a00, depthTest: false, transparent: true, opacity: 0.95 });
const contorno = new THREE.LineSegments(contornoGeo, contornoMat); contorno.renderOrder = 30; contorno.frustumCulled = false; scene.add(contorno);
const cotasGeo = new THREE.BufferGeometry();
const cotas = new THREE.LineSegments(cotasGeo, new THREE.LineBasicMaterial({ color: 0x1f6feb, depthTest: false, transparent: true })); cotas.renderOrder = 31; cotas.frustumCulled = false; scene.add(cotas);
const medidasGeo = new THREE.BufferGeometry();
const medidasL = new THREE.LineSegments(medidasGeo, new THREE.LineBasicMaterial({ color: 0x7b1fa2, depthTest: false, transparent: true })); medidasL.renderOrder = 32; medidasL.frustumCulled = false; scene.add(medidasL);
const ARISTAS = []; (function () { const cn = a => [(a & 1 ? 0.5 : -0.5), (a & 2 ? 0.5 : -0.5), (a & 4 ? 0.5 : -0.5)]; for (let a = 0; a < 8; a++) for (const b of [1, 2, 4]) if (!(a & b)) { ARISTAS.push(cn(a), cn(a | b)); } })();
let etqCotas = [];
function matricesEntidad(k) {
  const out = [];
  if (k[0] === 'p') { const i = +k.slice(1); if (P[i] && !P[i].del) { if (P[i].cortes) P[i].cortes.forEach(c => out.push(c.m)); else out.push(matrizPieza(i, new M4())); } }
  else if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); if (o) for (const pt of o.partes || []) { if (pt.f === 'poly') out.push(...polyMatrices(pt)); else if (pt.m) out.push(pt.m); } }
  return out;
}
function polyMatrices(pt) {
  const pts = pt.pts || []; if (pts.length < 2) return [];
  const out = [];
  for (let j = 0; j < pts.length; j++) { const a = pts[j], b = pts[(j + 1) % pts.length]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) continue; const m = new M4().compose(new V3((a[0] + b[0]) / 2, (pt.y || 0) + (pt.grosor || 0.03) / 2, (a[1] + b[1]) / 2), qY(Math.atan2(-dz, dx)), new V3(L, pt.grosor || 0.03, 0.02)); out.push(new M4().multiplyMatrices(pt.m, m)); }
  return out;
}
function actualizarContorno() {
  const mats = [];
  for (const k of sel) { if (mats.length > 900) break; mats.push(...matricesEntidad(k)); }
  const arr = new Float32Array(mats.length * ARISTAS.length * 3); let o = 0;
  for (const m of mats) for (const c of ARISTAS) { _v.set(c[0], c[1], c[2]).applyMatrix4(m); arr[o++] = _v.x; arr[o++] = _v.y; arr[o++] = _v.z; }
  contornoGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); contornoGeo.computeBoundingSphere();
  contornoMat.color.set(solapeSel ? '#e53935' : '#ff7a00');
  actualizarCotas(); sucio = true;
}
function cajaOrientada(k) {
  if (k[0] === 'p') { const z = P[+k.slice(1)]; if (!z) return null; const s = z.t <= 4 ? z.s.clone() : (z.t === 7 ? new V3(0.9, 2.1, 0.06) : new V3(0.4, 0.4, 0.4)); const c = z.t === 7 ? new V3(0, 1.05, 0).applyQuaternion(z.q).add(z.p) : z.p.clone(); return { c, q: z.q.clone(), s }; }
  const o = nuevos.get(k.slice(1)); if (!o) return null; const d = o.datos, b = tipoBase(o.tipo);
  if (b === 'habitacion' || b === 'techo') { const bx = new THREE.Box3(); for (const [x, z] of d.puntos || []) bx.expandByPoint(new V3(x, 0, z)); const sz = bx.getSize(new V3()), cc = bx.getCenter(new V3()); const q = qY((+d.giroY || 0) * DEG); return { c: cc.applyQuaternion(q).add(new V3(d.x, d.y + 0.05, d.z)), q, s: new V3(sz.x, 0.1, sz.z) }; }
  const s = new V3(+d.sx || 1, +d.sy || 1, +d.sz || 1); const q = SIN_INCL.includes(b) ? qY((+d.giroY || 0) * DEG) : qDatos(d);
  let y0 = +d.y || 0; if (b === 'ventana') y0 += +d.alfeizar || 0; if (b === 'luz') { y0 += (+d.altura || 2.6) - 0.2; s.set(0.4, 0.4, 0.4); }
  return { c: new V3(+d.x || 0, y0 + s.y / 2, +d.z || 0), q, s };
}
function actualizarCotas() {
  etqCotas = [];
  const pos = [];
  if (AJ.cotas && sel.length === 1 && vista !== 'caminar') {
    const ob = cajaOrientada(sel[0]);
    if (ob) {
      const { c, q, s } = ob; const P0 = (x, y, z) => new V3(x * s.x / 2, y * s.y / 2, z * s.z / 2).applyQuaternion(q).add(c);
      const off = Math.max(0.25, Math.max(s.x, s.z) * 0.06);
      const ex = new V3(1, 0, 0).applyQuaternion(q), ez = new V3(0, 0, 1).applyQuaternion(q);
      const lineas = [[P0(-1, -1, 1).addScaledVector(ez, off), P0(1, -1, 1).addScaledVector(ez, off), s.x], [P0(1, -1, -1).addScaledVector(ex, off), P0(1, -1, 1).addScaledVector(ex, off), s.z], [P0(1, -1, 1).addScaledVector(ex, off).addScaledVector(ez, off), P0(1, 1, 1).addScaledVector(ex, off).addScaledVector(ez, off), s.y]];
      for (const [a, b, L] of lineas) { if (L < 0.02) continue; pos.push(a.x, a.y, a.z, b.x, b.y, b.z); etqCotas.push({ p: a.clone().add(b).multiplyScalar(0.5), t: fmtLen(L), c: 'cota' }); }
    }
  }
  cotasGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cotasGeo.computeBoundingSphere();
}
function actualizarMedidas() {
  const pos = [];
  for (const md of medidas) { if (md.tipo === 'dist') pos.push(md.a.x, md.a.y, md.a.z, md.b.x, md.b.y, md.b.z); else { pos.push(md.v.x, md.v.y, md.v.z, md.a.x, md.a.y, md.a.z, md.v.x, md.v.y, md.v.z, md.b.x, md.b.y, md.b.z); } }
  if (medirEst && medirEst.puntos.length && medirEst.cursor) { const pts = medirEst.puntos.concat([medirEst.cursor]); for (let k = 0; k + 1 < pts.length; k++) { const a = pts[medirEst.modo === 'angulo' ? 0 : k], b = pts[k + 1]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z); } }
  medidasGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); medidasGeo.computeBoundingSphere(); sucio = true;
}

/* ====================== colecciones y documentos ====================== */
function efectivos(col) { col = col || 'cambios'; const c = cols[col]; const m = new Map(c.snap); for (const [id, d] of c.ov) { if (d === null) m.delete(id); else m.set(id, d); } return m; }
function ponerDatos(i, z, id) {
  const pz = P[i]; if (!pz || !z) return;
  if (isFinite(z.x) && isFinite(z.y) && isFinite(z.z)) pz.p.set(+z.x, +z.y, +z.z);
  if (Array.isArray(z.q) && z.q.length === 4 && z.q.every(isFinite)) pz.q.fromArray(z.q).normalize();
  else if (isFinite(z.giroY)) pz.q.setFromAxisAngle(ARRIBA, z.giroY * DEG);
  if (pz.t <= 4 && isFinite(z.sx) && isFinite(z.sy) && isFinite(z.sz)) pz.s.set(Math.max(1e-3, +z.sx), Math.max(1e-3, +z.sy), Math.max(1e-3, +z.sz));
  if (typeof z.color === 'string' && /^#[0-9a-f]{6}$/i.test(z.color)) pz.c.set(z.color);
  if (z.material) pz.material = z.material;
  pz.doc = id;
}
function aplicarDoc(id, d) {
  if (window.OOEntidades) d = OOEntidades.migrar(d); /* (2.1 pro) esquema versionado: los documentos viejos se leen como v2 sin reescribirlos */
  const refs = d.ref == null ? [] : (Array.isArray(d.ref) ? d.ref : [d.ref]);
  if (d.accion === 'modificar') {
    if (!Array.isArray(d.ref) && d.ref != null) ponerDatos(d.ref, d.datos, id);
    else if (d.datos && Array.isArray(d.datos.piezas)) for (const z of d.datos.piezas) ponerDatos(z.ref, z, id);
  } else if (d.accion === 'borrar') {
    for (const r of refs) if (P[r]) { P[r].del = true; P[r].doc = id; }
    if (d.id_objeto) nuevos.delete(d.id_objeto);
  } else if (d.accion === 'agregar' || (d.accion === 'nota' && d.id_objeto)) {
    nuevos.set(d.id_objeto, { id: d.id_objeto, docId: id, tipo: d.tipo || 'nota', datos: clon(d.datos || {}), texto: d.texto || '', fotos: Array.isArray(d.fotos) ? d.fotos.slice() : [], props: d.props ? clon(d.props) : null, partes: [], slots: [], textos: [], formas: [] });
    const nn = nuevos.get(d.id_objeto); nn._datos = nn.datos; /* (2.1 pro f3) para detectar vistas previas sin guardar (recomputeParcial) */
  } else if (d.accion === 'propiedades') { /* (editor v2) nombre, colisión, sombras, material, comportamientos de piezas del mapa */
    for (const r of refs) if (P[r]) P[r].props = id;
  } else if (d.accion === 'nota' && refs.length) {
    notasMarcas.push({ docId: id, refs: refs.slice(), datos: d.datos || {}, fotos: d.fotos || [] });
    for (const r of refs) if (P[r]) P[r].nota = id;
  }
}
function existe(k) { if (k[0] === 'p') { const i = +k.slice(1); return !!P[i] && !P[i].del; } if (k[0] === 'n') return nuevos.has(k.slice(1)); return false; }
function recompute() {
  if (!D) return;
  for (let i = 0; i < N; i++) { const z = P[i]; z.p.copy(z.b.p); z.q.copy(z.b.q); z.s.copy(z.b.s); z.c.copy(z.b.c); z.del = false; z.doc = null; z.nota = null; z.material = null; z.props = null; }
  for (const o of nuevos.values()) quitarTextos(o);
  nuevos = new Map(); notasMarcas = [];
  const docs = [...efectivos()].filter(([, d]) => d && d.mapa === mapa).sort((a, b) => String(a[1].actualizado || a[1].creado || '').localeCompare(String(b[1].actualizado || b[1].creado || '')));
  for (const [id, d] of docs) { try { aplicarDoc(id, d); } catch (e) { console.warn('Cambio no aplicable', id, e); } }
  docsNoAgr = new Set(docs.filter(([, d]) => d.accion !== 'agregar').map(([id]) => id)); /* (2.1 pro f3) */
  grupoDe = new Map(); sinAuto = new Set(); for (const [gid, g] of efectivos('grupos')) { if (g && g.mapa === mapa && g.sin_auto) sinAuto.add(g.sin_auto); if (g && g.mapa === mapa && Array.isArray(g.miembros)) for (const k of g.miembros) grupoDe.set(k, gid); }
  sel = sel.filter(existe); selSet = new Set(sel);
  renderTodo(); colocarPivote(); renderCambios();
  if (panelEnfocado()) actualizarValoresPanel(); else renderPanel();
  avisar('recompute');
}
function panelEnfocado() { const a = document.activeElement; return !!(a && a.closest && a.closest('#objCuerpo') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); }

function guardar(lista, opt) {
  lista = lista.filter(Boolean); if (!lista.length) return;
  const ef = efectivos();
  /* (2.1 pro) anclajes.js: los objetos apoyados en lo que cambia (fundación, piso, pared, techo) se mueven en el mismo paso de deshacer */
  if (window.OOAnclajes && !(opt && opt.sinAnclajes)) { try { lista = OOAnclajes.propagar(lista, ef) || lista; } catch (e) { console.warn('anclajes', e); } }
  const entrada = lista.map(({ id, data }) => ({ id, antes: ef.has(id) ? clon(ef.get(id)) : null, despues: data ? clon(data) : null }));
  if (opt && opt.unir && deshacer.length) deshacer[deshacer.length - 1].push(...entrada);
  else { entrada.etiqueta = (opt && opt.etiqueta) || (window.OOProductividad ? OOProductividad.etiquetaAuto(entrada) : ''); /* (2.1 pro f5) nombre automático del paso */ entrada.t = Date.now(); deshacer.push(entrada); if (deshacer.length > 500) deshacer.splice(0, deshacer.length - 500); } /* (2.1 pro) historial con nombre y tope */
  rehacer = [];
  escribir(entrada.map(e => ({ id: e.id, data: e.despues })));
}
/* (2.1 pro f3) actualización selectiva: si el paso solo toca objetos nuevos (documentos «agregar»), se rehacen esos objetos y las paredes
   cuyas esquinas o huecos cambian, sin volver a escribir las ~20 000 piezas del mapa ni reconstruir los demás objetos. Lo demás
   (piezas del mapa, notas, borrados de piezas, puertas en paredes originales) sigue con recompute() completo. */
let parcialStats = { parcial: 0, completo: 0, ultimo: null }, docsNoAgr = new Set();
/* (2.1 pro f6) compactar instancias en reposo: recomputeParcial deja huecos (instancias a cero) al rehacer objetos con otro número de
   piezas y toma sitio al final del búfer. Cuando el usuario para (sin escrituras pendientes ni botones pulsados durante 2,5 s) y los
   huecos pasan del 10 % (o de 2000), un renderTodo() los junta: el búfer no crece sin fin y se dibujan menos instancias vacías. */
let tCompactar = null, botonesRaton = 0; parcialStats.compactados = 0;
document.addEventListener('pointerdown', e => { botonesRaton = e.buttons; }, true); document.addEventListener('pointerup', e => { botonesRaton = e.buttons; }, true);
function huecosInstancias() { let h = 0, u = 0; for (const k in M) { const m = M[k]; for (let s = m.base; s < m.used; s++) if (m.owner[s] === undefined) h++; u += m.used - m.base; } return { huecos: h, usadas: u }; }
function compactarSiHace(forzar) { const { huecos, usadas } = huecosInstancias(); if (forzar ? huecos > 0 : (huecos >= 64 && huecos > usadas * 0.1) || huecos >= 2000) { renderTodo(); parcialStats.compactados++; return huecos; } return 0; }
function programarCompactar() { clearTimeout(tCompactar); tCompactar = setTimeout(function intentar() { if (pendientes > 0 || botonesRaton) { tCompactar = setTimeout(intentar, 1500); return; } tCompactar = null; compactarSiHace(false); }, 2500); }
const ES_PARED = b => b === 'muro' || b === 'puerta' || b === 'ventana' || b === 'hueco';
function recomputeParcial(lista) {
  if (!D || !lista.length || lista.length > 400) return false;
  const ef = efectivos(), porDoc = new Map(); for (const o of nuevos.values()) porDoc.set(o.docId, o);
  const cambios = [];
  for (const { id } of lista) {
    const d = ef.get(id), viejo = porDoc.get(id);
    if (d && d.mapa !== mapa && !viejo) continue;
    if (d && (d.accion !== 'agregar' || d.mapa !== mapa)) return false;
    if (!d && !viejo) { if (docsNoAgr.has(id)) return false; continue; }
    const muroNum = o => o && typeof o.datos.muro === 'number';
    if (muroNum(viejo) || (d && d.datos && typeof d.datos.muro === 'number' && ['puerta', 'ventana', 'hueco'].includes(tipoBase(d.tipo)))) return false;
    if (d && d.id_objeto && viejo && viejo.id !== d.id_objeto) return false;
    cambios.push({ id, d, viejo });
  }
  /* objetos tocados por una vista previa (anclajes, asas) que no se guardaron: vuelven a su documento */
  for (const o of nuevos.values()) if (o._datos !== o.datos && !cambios.some(c => c.viejo === o)) { const d = ef.get(o.docId); if (d && d.accion === 'agregar') cambios.push({ id: o.docId, d, viejo: o }); }
  let tocaParedes = false; const rehechos = new Set();
  for (const c of cambios) {
    const v = c.viejo; if (v && ES_PARED(tipoBase(v.tipo))) tocaParedes = true; if (c.d && ES_PARED(tipoBase(c.d.tipo))) tocaParedes = true;
    if (v) { quitarTextos(v); for (const [k, s] of v.slots || []) { ponerMat(M[k], s, CERO); M[k].owner[s] = undefined; } }
    if (!c.d) { if (v) nuevos.delete(v.id); continue; }
    try { aplicarDoc(c.id, c.d); } catch (e) { console.warn('Cambio no aplicable', c.id, e); return recompute(), true; }
    const o = nuevos.get(c.d.id_objeto); if (o) { o.slots = (v && v.slots) || []; rehechos.add(o); }
  }
  if (tocaParedes) {
    const firma = o => JSON.stringify([o.ext, o.huecos]); const antes = new Map();
    for (const o of nuevos.values()) if (tipoBase(o.tipo) === 'muro' && !rehechos.has(o)) antes.set(o, firma(o));
    prepararMuros(); for (const [o, f] of antes) if (firma(o) !== f) rehechos.add(o);
  }
  for (const o of rehechos) {
    o.partes = visibleNuevo(o) ? partesMundo(o) : []; const inst = o.partes.filter(pt => pt.f !== 't' && pt.f !== 'poly');
    const igual = o.slots.length === inst.length && inst.every((pt, j) => mallaDe(pt) === o.slots[j][0]);
    if (!igual) {
      for (const [k, s] of o.slots) { ponerMat(M[k], s, CERO); M[k].owner[s] = undefined; }
      const need = {}; for (const pt of inst) { const k = mallaDe(pt); need[k] = (need[k] || 0) + 1; }
      for (const k in need) if (M[k].used + need[k] > M[k].cap) { renderTodo(); return trasParcial(), true; } /* sin sitio: renderTodo compacta */
      o.slots = inst.map(pt => { const k = mallaDe(pt); return [k, M[k].used++]; });
    }
    inst.forEach((pt, j) => escribirInst(o.slots[j][0], o.slots[j][1], pt.m, new THREE.Color(pt.c || '#cccccc'), 'n' + o.id, true));
    crearExtras(o);
  }
  for (const k in M) M[k].mesh.count = M[k].used;
  marcarActualizado(); actualizarContorno(); programarMinimapa(); avisar('render');
  trasParcial(); programarCompactar(); /* (2.1 pro f6) */ parcialStats.parcial++; parcialStats.ultimo = { docs: cambios.length, objetos: rehechos.size, paredes: tocaParedes };
  return true;
}
function trasParcial() {
  sel = sel.filter(existe); selSet = new Set(sel);
  colocarPivote(); renderCambios();
  if (panelEnfocado()) actualizarValoresPanel(); else renderPanel();
  avisar('recompute');
}
function escribir(lista) {
  for (const { id, data } of lista) cols.cambios.ov.set(id, data);
  if (!recomputeParcial(lista)) { parcialStats.completo++; recompute(); } actualizarBotonesHistorial();
  for (const { id, data } of lista) encolar('cambios', id, data);
}
function guardarCol(col, id, data) { cols[col].ov.set(id, data); encolar(col, id, data); trasCol(col); }
function trasCol(col) { avisar('col', col); if (col === 'calcos') renderCalcos(); else if (col === 'capas') { renderCapas(); renderTodo(); } else if (col === 'grupos') { recompute(); } else if (col === 'componentes') { if (catActual === 'componentes') renderCatalogo(); } else if (col === 'guias') renderGuias(); }
function encolar(col, id, data) {
  pendientes++; actualizarEstado();
  cola = cola.then(() => remoto(col, id, data)).catch(e => console.warn(e)).then(() => { pendientes--; actualizarEstado(); });
}
async function remoto(col, id, data) {
  if (!db || sinPermiso) return;
  const ov = cols[col].ov; const ref = db.collection(col).doc(id);
  for (let n = 0; n < 6; n++) { /* (2.1 pro f4) hasta 6 intentos: un fallo de red (conexión cortada, sin «code») ya no pierde el documento */
    try {
      if (data) await ref.set(data); else await ref.delete();
      if (ov.get(id) === data) { if (data) cols[col].snap.set(id, data); else cols[col].snap.delete(id); ov.delete(id); }
      if (estadoBD === 'err') estadoBD = 'ok';
      return;
    } catch (e) {
      const c = (e && e.code) || (e instanceof TypeError ? 'unavailable' : undefined);
      if ((c === 'unavailable' || c === 'resource_exhausted') && n < 5) { await esperar((c === 'unavailable' ? 300 + Math.random() * 700 : 1500) * (n + 1)); continue; }
      if (c === 'invalid_argument' || c === 'not_granted' || c === 'revoked') { sinPermiso = true; estadoBD = 'perm'; }
      else { estadoBD = 'err'; errMsg = (e && e.message) || String(e); }
      actualizarEstado(); renderCambios(); return;
    }
  }
}
/* (2.1 pro) deshacer/rehacer: si un mismo documento sale varias veces en el paso, al deshacer vale su primer «antes» y al rehacer su último «después» */
function pasoHistorial(e, campo) {
  const m = new Map(); const l = campo === 'antes' ? e.slice().reverse() : e;
  for (const x of l) if (x && typeof x.id === 'string') m.set(x.id, x[campo] === undefined ? null : x[campo]);
  return [...m].map(([id, data]) => ({ id, data }));
}
function hacerDeshacer() { const e = deshacer.pop(); if (!e) return; rehacer.push(e); escribir(pasoHistorial(e, 'antes')); pista('Deshecho' + (e.etiqueta ? ': ' + e.etiqueta : '') + '.'); }
function hacerRehacer() { const e = rehacer.pop(); if (!e) return; deshacer.push(e); escribir(pasoHistorial(e, 'despues')); pista('Rehecho' + (e.etiqueta ? ': ' + e.etiqueta : '') + '.'); }
function actualizarBotonesHistorial() { $('#bDeshacer').disabled = !deshacer.length; $('#bRehacer').disabled = !rehacer.length; $('#bDeshacer').title = 'Deshacer (Ctrl+Z) · ' + deshacer.length + ' pasos'; }

/* datos de piezas originales */
function descPieza(i) { const z = P[i]; return ['caja', z.nom || 'malla', 'cilindro', 'tubo', 'bloque', 'luz', 'letrero', 'puerta'][z.t] || 'pieza'; }
function estadoDatos(i, base) {
  const z = P[i], st = base ? z.b : z; const o = { x: r3(st.p.x), y: r3(st.p.y), z: r3(st.p.z) };
  if (z.t <= 4) { o.sx = r3(st.s.x); o.sy = r3(st.s.y); o.sz = r3(st.s.z); o.escala = [r3(st.s.x / (z.b.s.x || 1)), r3(st.s.y / (z.b.s.y || 1)), r3(st.s.z / (z.b.s.z || 1))]; }
  else { o.sx = z.raw[0]; o.sy = z.raw[1]; o.sz = z.raw[2]; }
  o.giroY = normAng(yawDe(st.q) / DEG); o.q = [st.q.x, st.q.y, st.q.z, st.q.w].map(v => Math.round(v * 1e5) / 1e5); o.color = '#' + st.c.getHexString();
  if (!base && z.material) o.material = z.material;
  return o;
}
function centroDe(refs, base) { const c = new V3(); for (const i of refs) c.add(base ? P[i].b.p : P[i].p); return c.multiplyScalar(1 / Math.max(1, refs.length)); }
function hashRefs(refs) { const s = refs.slice().sort((a, b) => a - b).join(','); let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0; return (h >>> 0).toString(36) + 'x' + refs.length; }
function grupoCoincide(refs) { return selGrupo && refs.length === selGrupo.set.size && refs.every(i => selGrupo.set.has('p' + i)); }
function claveOrig(refs) { if (grupoCoincide(refs)) return 'g' + selGrupo.g; if (refs.length === 1) return 'p' + refs[0]; return 's' + hashRefs(refs); }
function tipoOrig(refs) { if (grupoCoincide(refs)) return 'grupo:' + D.grupos[selGrupo.g]; if (refs.length === 1) return 'pieza:' + descPieza(refs[0]); return 'seleccion:' + refs.length; }
function tamDoc(d) { try { return JSON.stringify(d).length; } catch (e) { return 1e9; } }
function docModOrig(refs, tipoForzado) {
  const clave = claveOrig(refs), id = 'm-' + mapa + '-' + clave, prev = efectivos().get(id);
  let datos, antes;
  if (refs.length === 1) { datos = estadoDatos(refs[0]); antes = estadoDatos(refs[0], true); datos.origen = 'centro'; }
  else {
    const c = centroDe(refs, false), c0 = centroDe(refs, true);
    datos = { x: r3(c.x), y: r3(c.y), z: r3(c.z), dx: r3(c.x - c0.x), dy: r3(c.y - c0.y), dz: r3(c.z - c0.z), origen: 'centro', piezas: refs.map(i => Object.assign({ ref: i }, estadoDatos(i))) };
    antes = { piezas: refs.map(i => Object.assign({ ref: i }, estadoDatos(i, true))) };
  }
  const t = ahora();
  const data = { mapa, accion: 'modificar', ref: refs.length === 1 ? refs[0] : refs.slice(), id_objeto: null, tipo: tipoForzado || tipoOrig(refs), capa: (prev && prev.capa) || capaActiva, datos, antes, texto: '', fotos: [], creado: prev && prev.creado || t, actualizado: t, autor };
  if (tamDoc(data) > 240000) data.antes = { nota: 'omitido por tamaño: ver el mapa base' };
  if (tamDoc(data) > 240000) { const g = selGrupo; selGrupo = null; const r = refs.map(i => docModOrig([i], tipoForzado)).flat(); selGrupo = g; return r; }
  return [{ id, data }];
}
function nuevoId() { return 'n-' + mapa + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function limpiarDatos(d, tipo) {
  const o = {}; for (const k in d) { const v = d[k]; if (v === undefined || k === 'fotoPendiente') continue; o[k] = typeof v === 'number' ? r3(v) : v; }
  if (o.giroY == null) o.giroY = 0;
  o.origen = o.origen || 'base';
  const b = tipoBase(tipo || '');
  if ((b === 'habitacion' || b === 'techo') && Array.isArray(o.puntos)) { const g = (o.giroY || 0) * DEG, cg = Math.cos(g), sg = Math.sin(g); o.puntos = o.puntos.map(([x, z]) => [r3(x), r3(z)]); o.puntos_mundo = o.puntos.map(([x, z]) => [r3(o.x + x * cg + z * sg), r3(o.z - x * sg + z * cg)]); }
  if (b === 'muro') { const g = (o.giroY || 0) * DEG, L = (o.sx || 0) / 2; o.x1 = r3(o.x - Math.cos(g) * L); o.z1 = r3(o.z + Math.sin(g) * L); o.x2 = r3(o.x + Math.cos(g) * L); o.z2 = r3(o.z - Math.sin(g) * L); }
  return clon(o);
}
function docNuevo(id, tipo, datos, extra) {
  const t = ahora();
  return Object.assign({ esquema: window.OOEntidades ? OOEntidades.ESQUEMA : 1, mapa, accion: tipo === 'nota' ? 'nota' : 'agregar', ref: null, id_objeto: id, tipo, capa: capaActiva, datos: limpiarDatos(datos, tipo), antes: null, texto: '', fotos: [], creado: t, actualizado: t, autor }, extra || {});
}
function crearNuevo(tipo, datos, extra, opt) { if (capaInfo(capaActiva).bloqueada) { pista('La capa activa «' + capaActiva + '» está bloqueada.'); return null; } const id = nuevoId(); guardar([{ id, data: docNuevo(id, tipo, datos, extra) }], opt); return id; }
function docActualizado(o, cambiosExtra) { const prev = efectivos().get(o.docId); if (!prev) return null; const x = { datos: limpiarDatos(o.datos, o.tipo), actualizado: ahora() }; if (window.OOEntidades) x.esquema = OOEntidades.ESQUEMA; return { id: o.docId, data: Object.assign(clon(prev), x, cambiosExtra || {}) }; }

/* ====================== selección ====================== */
function seleccionable(k) {
  for (const f of bloqueos) if (f(k)) return false; /* (editor v2) candado de la jerarquía */
  if (k[0] === 'p') { const z = P[+k.slice(1)]; return !!z && !secLock[z.sec + 1] && !ocultos.has(k); }
  if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); return !!o && !capaInfo(capaDeNuevo(o)).bloqueada; }
  return true;
}
function expandirGrupos(keys) { const out = new Set(keys); for (const k of keys) { const gid = grupoDe.get(k); if (gid) { const g = efectivos('grupos').get(gid); if (g) g.miembros.forEach(x => out.add(x)); } else { const a = autoActivo(k); if (a) a.keys.forEach(x => out.add(x)); } } return [...out]; }
/* (2.1) Objetos automáticos: las piezas pequeñas del mapa que se tocan forman un objeto (extintor, contenedor, estantería, árbol, coche…),
   para que un clic lo coja entero. Paredes, suelos, techos y piezas enormes no se juntan (si no, todo el edificio sería un objeto).
   Se calculan con la posición original de las piezas, así no cambian al moverlas. «Desagrupar» guarda en «grupos» un documento sin_auto con la firma. */
let autoDe = new Map(), autos = [], sinAuto = new Set();
function autoActivo(k) { if (k[0] !== 'p') return null; const a = autoDe.get(k); if (a == null) return null; const g = autos[a]; return g && !sinAuto.has(g.firma) ? g : null; }
function calcularAuto() {
  autoDe = new Map(); autos = [];
  const bb = new Float32Array(N * 6), ok = new Uint8Array(N), plano = new Uint8Array(N), m3 = new THREE.Matrix3(), mm = new M4(), largos = [];
  for (let i = 0; i < N; i++) {
    const z = P[i]; mm.makeRotationFromQuaternion(z.b.q); m3.setFromMatrix4(mm); const e = m3.elements, s = z.b.s;
    const cx = z.b.p.x, cz = z.b.p.z; let cy = z.b.p.y; if (z.t === 7) cy += 1.05;
    const hx = 0.5 * (Math.abs(e[0]) * s.x + Math.abs(e[3]) * s.y + Math.abs(e[6]) * s.z), hy = 0.5 * (Math.abs(e[1]) * s.x + Math.abs(e[4]) * s.y + Math.abs(e[7]) * s.z), hz = 0.5 * (Math.abs(e[2]) * s.x + Math.abs(e[5]) * s.y + Math.abs(e[8]) * s.z);
    bb.set([cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz], i * 6);
    // Medidas en planta en los ejes de la propia pieza (una pieza en diagonal no es más ancha de lo que es).
    const ax = e[0] * s.x, az = e[2] * s.x, bx = e[6] * s.z, bz = e[8] * s.z; const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    const wx = 2 * hx, wy = 2 * hy, wz = 2 * hz, maxH = Math.max(la, lb, 1e-4), minH = Math.min(la, lb);
    const suelo = wy < 0.35 && minH > 1.5, pared = wy > 1.8 && maxH > 2.5 && minH < 0.45, enorme = Math.max(wx, wy, wz) > 14, mampara = wy > 1.6 && maxH > 1.4 && minH < 0.08;
    ok[i] = (suelo || pared || enorme || mampara || z.t === 3 || z.t === 4) ? 0 : 1;
    plano[i] = wy < 0.06 && maxH < 1.5 ? 1 : 0; // baldosas, rejillas, tapas: forman su propio piso, no se pegan a los muebles
    // Eje largo en planta (para juntar los tramos de un mismo muro o valla).
    if (Math.max(la, lb) >= 4 && Math.min(la, lb) <= 0.8 && !suelo) largos.push({ i, L: Math.max(la, lb), ux: (la >= lb ? ax / la : bx / lb), uz: (la >= lb ? az / la : bz / lb), cx, cz, y0: cy - hy, y1: cy + hy });
  }
  const padre = new Int32Array(N); for (let i = 0; i < N; i++) padre[i] = i;
  const caja = new Float32Array(bb), cuantos = new Int32Array(N).fill(1);
  const raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const unir = (a, b, forzar, llano) => {
    a = raiz(a); b = raiz(b); if (a === b) return;
    const A = a * 6, B = b * 6; const u = [Math.min(caja[A], caja[B]), Math.min(caja[A + 1], caja[B + 1]), Math.min(caja[A + 2], caja[B + 2]), Math.max(caja[A + 3], caja[B + 3]), Math.max(caja[A + 4], caja[B + 4]), Math.max(caja[A + 5], caja[B + 5])];
    if (!forzar && (llano ? (Math.max(u[3] - u[0], u[5] - u[2]) > 30 || cuantos[a] + cuantos[b] > 3000) : (Math.max(u[3] - u[0], u[5] - u[2]) > 8 || u[4] - u[1] > 6 || cuantos[a] + cuantos[b] > 160))) return;
    padre[b] = a; cuantos[a] += cuantos[b]; caja.set(u, A);
  };
  // 1) Grupos que ya trae el mapa (coches, hojas de puertas…): sus piezas van juntas aunque no se toquen.
  const porTok = new Map();
  for (let i = 0; i < N; i++) { const g = P[i].grp; if (g < 0) continue; const n = D.grupos[g] || ''; const tok = n.slice(n.indexOf(':') + 1); if (!porTok.has(tok)) porTok.set(tok, i); else unir(porTok.get(tok), i, true); ok[i] = 1; }
  // 1b) Muros y vallas: los tramos largos y finos en la misma línea (el muro, sus franjas de color, la albardilla, la malla) son un objeto.
  for (let a = 0; a < largos.length; a++) for (let b = a + 1; b < largos.length; b++) {
    const A = largos[a], B = largos[b];
    if (Math.abs(A.ux * B.ux + A.uz * B.uz) < 0.9986) continue;            // paralelos (±3°)
    const dx = B.cx - A.cx, dz = B.cz - A.cz;
    if (Math.abs(dx * A.uz - dz * A.ux) > 0.9) continue;                      // en la misma línea (±90 cm: barandas y tubos del muro)
    if (B.y0 > A.y1 + 0.35 || A.y0 > B.y1 + 0.35) continue;                    // que se toquen en altura (o casi: barandas sobre el muro)
    const t = dx * A.ux + dz * A.uz, sol = Math.min(A.L / 2, t + B.L / 2) - Math.max(-A.L / 2, t - B.L / 2);
    if (sol >= 0.5 * Math.min(A.L, B.L)) { unir(A.i, B.i, true); ok[A.i] = 1; ok[B.i] = 1; }
  }
  // Cada TRAMO de muro (sus franjas y su albardilla, unidas arriba) se lleva los paneles, pilares y postes que tiene debajo o pegados,
  // también en diagonal. Un tramo no se junta con el de al lado: solo entra lo que cae dentro de su largo.
  const muros = new Map();
  for (const L of largos) { if (!ok[L.i]) continue; const r = raiz(L.i); if (cuantos[r] < 2) continue; const m = muros.get(r); if (!m || L.L > m.L) muros.set(r, L); }
  if (muros.size) {
    const tramos = [...muros.entries()].map(([r, L]) => { const q = r * 6; return { r, L, y0: caja[q + 1], y1: caja[q + 4], sec: P[L.i].sec }; });
    for (let i = 0; i < N; i++) {
      if (cuantos[raiz(i)] > 1 || P[i].grp >= 0 || P[i].t === 7) continue; const o = i * 6;
      const cx = (bb[o] + bb[o + 3]) / 2, cz = (bb[o + 2] + bb[o + 5]) / 2, hx = (bb[o + 3] - bb[o]) / 2, hz = (bb[o + 5] - bb[o + 2]) / 2;
      let mejor = null, dmin = Infinity;
      for (const T of tramos) {
        if (T.sec !== P[i].sec || bb[o + 1] < T.y0 - 0.3 || bb[o + 4] > T.y1 + 0.6) continue;
        const A = T.L, dx = cx - A.cx, dz = cz - A.cz, t = dx * A.ux + dz * A.uz, n = Math.abs(dx * A.uz - dz * A.ux);
        const medioN = Math.abs(hx * A.uz) + Math.abs(hz * A.ux), medioT = Math.abs(hx * A.ux) + Math.abs(hz * A.uz);
        if (medioN > 0.7 || n > 0.6 || Math.abs(t) + medioT > A.L / 2 + 0.25) continue;
        if (n < dmin) { dmin = n; mejor = T; }
      }
      if (mejor) { unir(mejor.r, i, true); ok[i] = 1; }
    }
  }
  // 1c) Puertas: la hoja ya es un grupo del mapa («puerta:…»); el marco, la manilla y la placa que la tocan van con ella.
  for (let i = 0; i < N; i++) {
    const g = P[i].grp; if (g < 0 || !/^puerta:/.test(D.grupos[g] || '')) continue; const r = raiz(i); if (r !== i && P[r].grp === g) continue;
    const q = raiz(i) * 6, x0 = caja[q] - 0.15, x1 = caja[q + 3] + 0.15, z0 = caja[q + 2] - 0.15, z1 = caja[q + 5] + 0.15, y0 = caja[q + 1] - 0.05, y1 = caja[q + 4] + 0.35;
    for (let j = 0; j < N; j++) { if (P[j].grp >= 0 || cuantos[raiz(j)] > 1) continue; const o = j * 6; if (bb[o] >= x0 && bb[o + 3] <= x1 && bb[o + 2] >= z0 && bb[o + 5] <= z1 && bb[o + 1] >= y0 && bb[o + 4] <= y1) { unir(i, j, true); ok[j] = 1; } }
  }
  // Lo ya agrupado (coches, puertas con su marco, muros) queda cerrado: no se junta con lo que toca.
  const cerr = new Uint8Array(N); for (let i = 0; i < N; i++) if (cuantos[raiz(i)] > 1) cerr[raiz(i)] = 1;
  // 2) Piezas que se tocan (con 2 cm de margen), por celdas de 3 m.
  const C = 3, mg = 0.02, celdas = new Map();
  for (let i = 0; i < N; i++) {
    if (!ok[i]) continue; const o = i * 6;
    const x0 = Math.floor((bb[o] - mg) / C), x1 = Math.floor((bb[o + 3] + mg) / C), z0 = Math.floor((bb[o + 2] - mg) / C), z1 = Math.floor((bb[o + 5] + mg) / C);
    const vistos = new Set();
    for (let x = x0; x <= x1; x++) for (let zz = z0; zz <= z1; zz++) {
      const k = x * 100003 + zz; let l = celdas.get(k); if (!l) { l = []; celdas.set(k, l); }
      for (const j of l) {
        if (vistos.has(j)) continue; vistos.add(j); const q = j * 6;
        if (P[i].sec !== P[j].sec || P[i].grp >= 0 || P[j].grp >= 0 || cerr[raiz(i)] || cerr[raiz(j)] || plano[i] !== plano[j]) continue;
        if (bb[o] - mg <= bb[q + 3] && bb[o + 3] + mg >= bb[q] && bb[o + 1] - mg <= bb[q + 4] && bb[o + 4] + mg >= bb[q + 1] && bb[o + 2] - mg <= bb[q + 5] && bb[o + 5] + mg >= bb[q + 2]) unir(j, i, false, plano[i]);
      }
      l.push(i);
    }
  }
  const porRaiz = new Map();
  for (let i = 0; i < N; i++) { if (!ok[i]) continue; const r = raiz(i); if (cuantos[r] < 2) continue; let l = porRaiz.get(r); if (!l) { l = []; porRaiz.set(r, l); } l.push(i); }
  for (const [r, l] of porRaiz) {
    const A = r * 6, cx = (caja[A] + caja[A + 3]) / 2, cz = (caja[A + 2] + caja[A + 5]) / 2;
    const g = { keys: l.map(i => 'p' + i), firma: 'a' + Math.round(cx * 10) + '_' + Math.round(cz * 10) + '_' + l.length, nombre: nombreAuto(l), tam: [caja[A + 3] - caja[A], caja[A + 4] - caja[A + 1], caja[A + 5] - caja[A + 2]] };
    const id = autos.length; autos.push(g); for (const i of l) autoDe.set('p' + i, id);
  }
  /* (2.1) huecos.js: cada puerta o ventana original (marco, hoja, vidrio, rejas) es un objeto propio, separado de la pared que la rodea */
  if (window.OOHuecos) { try { OOHuecos.ajustarAuto(autos, autoDe); } catch (err) { console.warn('huecos: objetos automáticos', err); } }
}
function nombreAuto(l) {
  for (const i of l) { const g = P[i].grp; if (g >= 0 && /^auto:/.test(D.grupos[g] || '')) return 'Coche'; if (g >= 0 && /^puerta:/.test(D.grupos[g] || '')) return 'Puerta ' + D.grupos[g].slice(7).replace(/_/g, ' '); }
  { const L = l.reduce((m, i) => Math.max(m, P[i].b.s.x, P[i].b.s.z), 0); if (L >= 4 && l.length >= 2 && l.every(i => Math.min(P[i].b.s.x, P[i].b.s.z) <= 0.8 || P[i].b.s.y <= 4)) { const y = l.reduce((m, i) => Math.max(m, P[i].b.p.y + P[i].b.s.y / 2), 0); if (L >= 6 && y > 1.2) return y > 2.6 ? 'Muro' : 'Valla o muro bajo'; } }
  const cnt = new Map(); for (const i of l) { const n = P[i].nom; if (n && P[i].t !== 6 && !/^#|^(esfera|malla|cilindro|caja)$/.test(n)) cnt.set(n, (cnt.get(n) || 0) + 1); }
  let mejor = '', mx = 0; for (const [n, c] of cnt) if (c > mx) { mejor = n; mx = c; }
  if (mejor) return mejor.charAt(0).toUpperCase() + mejor.slice(1).replace(/_/g, ' ');
  if (l.some(i => P[i].nom === 'esfera') && l.some(i => P[i].t === 2)) return 'Árbol';
  if (l.length > 8 && l.every(i => Math.min(P[i].b.s.x, P[i].b.s.y, P[i].b.s.z) < 0.06)) return 'Piso de baldosas';
  return 'Objeto';
}
function seleccionar(keys, opts) {
  opts = opts || {};
  const viejos = sel;
  sel = [...new Set(keys)].filter(existe); selSet = new Set(sel);
  if (!opts.grupo) selGrupo = null;
  solapeSel = false;
  if (D) { for (const k of new Set([...viejos, ...sel])) pintarEntidad(k); marcarActualizado(); }
  actualizarContorno(); colocarPivote(); escBase = null; renderPanel();
  if (sel.length && !opts.sinTab) mostrarTab('obj');
  avisar('seleccion', sel);
}
function grupoRelacionados(g) {
  const nombre = D.grupos[g] || ''; const tok = nombre.slice(nombre.indexOf(':') + 1);
  const out = new Set([g]); if (!tok) return out;
  const re = new RegExp('(^|[_:])' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|_)');
  D.grupos.forEach((n, j) => { const t = n.slice(n.indexOf(':') + 1); if (t === tok || re.test(n)) out.add(j); });
  return out;
}
function seleccionarGrupo() {
  const k = sel.find(x => x[0] === 'p'); if (!k) return;
  const i = +k.slice(1), g = P[i].grp; if (g < 0) { pista('Esta pieza no pertenece a ningún grupo del mapa.'); return; }
  const gs = grupoRelacionados(g); const keys = [];
  for (let j = 0; j < N; j++) if (gs.has(P[j].grp) && !P[j].del) keys.push('p' + j);
  seleccionar(keys, { grupo: true }); selGrupo = { g, set: new Set(keys) }; renderPanel();
}
function estadoEnt(k) {
  if (k[0] === 'p') { const z = P[+k.slice(1)]; return { p: z.p.clone(), q: z.q.clone(), s: z.s.clone() }; }
  const o = nuevos.get(k.slice(1)); const d = o.datos;
  return { p: new V3(+d.x || 0, +d.y || 0, +d.z || 0), q: SIN_INCL.includes(tipoBase(o.tipo)) ? qY((+d.giroY || 0) * DEG) : qDatos(d), s: new V3(+d.sx || 1, +d.sy || 1, +d.sz || 1) };
}
function ponerEstado(k, p, q, s, sinRender) {
  if (k[0] === 'p') { const i = +k.slice(1), z = P[i]; z.p.copy(p); z.q.copy(q); if (z.t <= 4) z.s.set(Math.max(0.01, s.x), Math.max(0.01, s.y), Math.max(0.01, s.z)); if (!sinRender) escribirPieza(i); return; }
  const o = nuevos.get(k.slice(1)); if (!o) return; const d = o.datos, b = tipoBase(o.tipo);
  d.x = r3(p.x); d.y = r3(p.y); d.z = r3(p.z);
  if (SIN_INCL.includes(b)) d.giroY = normAng(yawDe(q) / DEG);
  else { const eu = eulerDe(q); d.giroY = normAng(eu.y / DEG); d.incX = r3(eu.x / DEG); d.incZ = r3(normAng(eu.z / DEG)); }
  if (!['nota', 'luz', 'habitacion', 'techo'].includes(b)) { d.sx = r3(Math.max(0.05, s.x)); d.sy = r3(Math.max(0.02, s.y)); d.sz = r3(Math.max(0.02, s.z)); if (b === 'edificio') d.alto = r3(d.sy / (d.pisos || 1)); }
  if (!sinRender) renderNuevo(o);
}
function colocarPivote() {
  const editable = herramienta === 'sel' && vista !== 'caminar' && sel.length > 0 && D && AJ.gizmo !== false;
  if (!editable) { tc.detach(); sucio = true; return; }
  if (sel.length === 1) { const st = estadoEnt(sel[0]); pivote.position.copy(st.p); pivote.quaternion.copy(st.q); }
  else { const c = new V3(); for (const k of sel) c.add(estadoEnt(k).p); c.multiplyScalar(1 / sel.length); pivote.position.copy(c); pivote.quaternion.set(0, 0, 0, 1); }
  pivote.scale.set(1, 1, 1); pivote.updateMatrixWorld();
  const o1 = sel.length === 1 && sel[0][0] === 'n' ? nuevos.get(sel[0].slice(1)) : null; const b1 = o1 ? tipoBase(o1.tipo) : '';
  const modo = (b1 === 'nota' || ((b1 === 'habitacion' || b1 === 'techo') && gizmoModo === 'scale')) ? 'translate' : gizmoModo;
  tc.setMode(modo); tc.setSpace(sel.length === 1 ? 'local' : 'world');
  const libre = modo !== 'rotate' || sel.every(inclinable); tc.showX = libre; tc.showZ = libre; tc.showY = true;
  aplicarAjusteGizmo();
  if (window.OOTransformar) OOTransformar.gizmo(tc, pivote); /* (2.1 pro f5) ejes bloqueados, espacio local/global y pivote (transformar.js) */
  if (tc.object !== pivote) tc.attach(pivote);
  sucio = true;
}
function aplicarAjusteGizmo() { tc.setTranslationSnap(AJ.ajuste ? AJ.paso : null); tc.setRotationSnap(AJ.ajuste ? AJ.angulo * DEG : null); tc.setScaleSnap(AJ.ajuste ? 0.05 : null); }
tc.addEventListener('mouseDown', () => { if (!sel.length) return; arrastre = { pv0: pivote.position.clone(), q0: pivote.quaternion.clone(), ents: sel.map(k => [k, estadoEnt(k)]), unico: sel.length === 1 && !(window.OOTransformar && OOTransformar.pivoteMovido()), lim: tc.mode === 'scale' ? limitesLocales(pivote.position, pivote.quaternion) : null }; });
/* (2.1) Escalar como en SketchUp: al jalar un lado, el lado contrario se queda quieto (con Ctrl, desde el centro, como antes).
   La escala uniforme (cubo del centro) deja la base apoyada. limitesLocales: caja de la selección en los ejes del gizmo. */
let ctrlPulsado = false;
window.addEventListener('keydown', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlPulsado = true; }, true);
window.addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlPulsado = false; }, true);
window.addEventListener('blur', () => { ctrlPulsado = false; });
function limitesLocales(pv, q) {
  const qi = q.clone().invert(), mn = new V3(Infinity, Infinity, Infinity), mx = new V3(-Infinity, -Infinity, -Infinity), v = new V3();
  for (const k of sel) for (const m of matricesEntidad(k)) for (let c = 0; c < 8; c++) {
    v.set(c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5).applyMatrix4(m).sub(pv).applyQuaternion(qi); mn.min(v); mx.max(v);
  }
  return isFinite(mn.x) ? { mn, mx } : null;
}
function anclarEscala(a) {
  if (!a.lim || ctrlPulsado || tc.mode !== 'scale' || !tc.axis) return;
  const sc = pivote.scale, eje = tc.axis, desp = new V3();
  if (eje === 'XYZ') { desp.y = a.lim.mn.y * (1 - sc.y); }
  else {
    const ini = tc.pointStart.clone().applyQuaternion(a.q0.clone().invert());
    for (const c of ['x', 'y', 'z']) {
      if (eje.indexOf(c.toUpperCase()) < 0) continue;
      desp[c] = (ini[c] >= 0 ? a.lim.mn[c] : a.lim.mx[c]) * (1 - sc[c]);
    }
  }
  pivote.position.copy(a.pv0).add(desp.applyQuaternion(a.q0));
}
tc.addEventListener('objectChange', () => {
  if (!arrastre) return;
  const a = arrastre; anclarEscala(a); if (window.OOTransformar) OOTransformar.restringir(pivote, a); /* (2.1 pro f5) */ const dq = pivote.quaternion.clone().multiply(a.q0.clone().invert()), sc = pivote.scale;
  for (const [k, st] of a.ents) {
    let p; const s = st.s.clone().multiply(sc), q = dq.clone().multiply(st.q);
    if (a.unico) p = pivote.position.clone().add(st.p.clone().sub(a.pv0));
    else { const rel = st.p.clone().sub(a.pv0).multiply(sc).applyQuaternion(dq); p = pivote.position.clone().add(rel); }
    ponerEstado(k, p, q, s);
  }
  avisar('arrastre', a.ents.map(x => x[0])); /* (2.1 pro) anclajes.js mueve en vivo lo que está apoyado en lo arrastrado */
  comprobarSolapeSel(); marcarActualizado(); actualizarContorno(); actualizarValoresPanel();
});
tc.addEventListener('mouseUp', () => {
  if (!arrastre) return; const a = arrastre; arrastre = null;
  const movido = pivote.position.distanceToSquared(a.pv0) > 1e-10 || Math.abs(pivote.quaternion.angleTo(a.q0)) > 1e-6 || pivote.scale.distanceToSquared(new V3(1, 1, 1)) > 1e-10;
  if (movido) confirmarEdicion();
  if (pendRecompute) { pendRecompute = false; recompute(); }
});
function confirmarEdicion(tipoForzado) {
  const refs = sel.filter(k => k[0] === 'p').map(k => +k.slice(1));
  const lista = [];
  if (refs.length) lista.push(...docModOrig(refs, tipoForzado));
  for (const k of sel) if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); if (o) lista.push(docActualizado(o)); }
  guardar(lista);
}
/* solapes: caja alineada de una entidad contra las demás (se ignoran suelos debajo) */
function cajaEntidad(k) { const b = new THREE.Box3(); for (const m of matricesEntidad(k)) { const e = m.elements; const hx = 0.5 * (Math.abs(e[0]) + Math.abs(e[4]) + Math.abs(e[8])), hy = 0.5 * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])), hz = 0.5 * (Math.abs(e[2]) + Math.abs(e[6]) + Math.abs(e[10])); b.expandByPoint(_v.set(e[12] - hx, e[13] - hy, e[14] - hz)); b.expandByPoint(_v.set(e[12] + hx, e[13] + hy, e[14] + hz)); } return b; }
function chocaCaja(box, excluir) {
  if (box.isEmpty()) return false;
  const mrg = 0.03;
  for (const k in M) {
    const m = M[k]; if (k === 'luz') continue; const bb = m.bb, own = m.owner, n = m.mesh.count;
    for (let s = 0; s < n; s++) {
      const o = s * 6; if (bb[o] > bb[o + 3]) continue; const key = own[s]; if (!key || (excluir && excluir.has(key))) continue;
      if (bb[o + 4] <= box.min.y + 0.06 || bb[o + 1] >= box.max.y - 0.02) continue;
      if (bb[o + 3] - bb[o] > 120 || bb[o + 5] - bb[o + 2] > 120) continue;
      if (bb[o] < box.max.x - mrg && bb[o + 3] > box.min.x + mrg && bb[o + 2] < box.max.z - mrg && bb[o + 5] > box.min.z + mrg) { if (key[0] === 'p' && P[+key.slice(1)].cat === 'col') continue; return true; }
    }
  }
  return false;
}
function comprobarSolapeSel() {
  const nuevosSel = sel.filter(k => k[0] === 'n' && !['habitacion', 'techo', 'nota', 'calle'].includes(tipoBase((nuevos.get(k.slice(1)) || {}).tipo)));
  let ch = false; const exc = new Set(sel);
  for (const k of nuevosSel) if (chocaCaja(cajaEntidad(k), exc)) { ch = true; break; }
  if (ch !== solapeSel) { solapeSel = ch; for (const k of sel) pintarEntidad(k); }
}

/* ====================== cámara ====================== */
function ajustarTam() {
  const r = vistaEl.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false);
  camP.aspect = w / h; camP.updateProjectionMatrix();
  camO.left = -50 * w / h; camO.right = 50 * w / h; camO.top = 50; camO.bottom = -50; camO.updateProjectionMatrix();
  const cv = $('#rejilla'), dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  sucio = true;
}
new ResizeObserver(ajustarTam).observe(vistaEl);
let anim = null;
function volarA(target, posCam, ms) { anim = { t0: performance.now(), ms: ms || 350, tgt0: ctl3.target.clone(), cam0: camP.position.clone(), tgt1: target.clone(), cam1: posCam.clone() }; }
function animar(t) {
  if (!anim) return false; const k = Math.min(1, (t - anim.t0) / anim.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  ctl3.target.lerpVectors(anim.tgt0, anim.tgt1, e); camP.position.lerpVectors(anim.cam0, anim.cam1, e); ctl3.update(); if (k >= 1) anim = null; return true;
}
function encuadrarCaja(box) {
  if (box.isEmpty()) return;
  const c = box.getCenter(new V3()), sz = box.getSize(new V3()); const tam = Math.max(sz.x, sz.z, sz.y * 1.5, 3);
  if (vista === 'planta') { ctlP.target.set(c.x, 0, c.z); camO.position.set(c.x, 1000, c.z); camO.zoom = Math.min(120, Math.max(0.02, 100 / (tam * 1.4))); camO.updateProjectionMatrix(); ctlP.update(); }
  else {
    if (vista === 'caminar') ponerVista('3d');
    const dir = camP.position.clone().sub(ctl3.target); if (dir.lengthSq() < 1e-6) dir.set(0, 1, 1); dir.normalize(); if (dir.y < 0.25) { dir.y = 0.5; dir.normalize(); }
    volarA(c, c.clone().addScaledVector(dir, tam * 1.3 + 3));
  }
  sucio = true;
}
function cajaEntidades(keys) {
  const box = new THREE.Box3();
  for (const k of keys) { const b = cajaEntidad(k); if (!b.isEmpty()) box.union(b); else if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); if (o) box.expandByPoint(new V3(+o.datos.x, +o.datos.y, +o.datos.z)); } }
  return box;
}
let limitesMapa = new THREE.Box3(new V3(-100, 0, -100), new V3(100, 10, 100));
function encuadrarInicio() {
  if (!D || !N) return;
  const z = P[0]; const box = new THREE.Box3();
  box.expandByPoint(_v.set(z.b.p.x - z.b.s.x / 2, 0, z.b.p.z - z.b.s.z / 2)); box.expandByPoint(_v.set(z.b.p.x + z.b.s.x / 2, 0, z.b.p.z + z.b.s.z / 2));
  limitesMapa = box.clone().expandByScalar(Math.max(box.getSize(new V3()).x, box.getSize(new V3()).z) * 0.08);
  const c = box.getCenter(new V3()), sz = box.getSize(new V3());
  grid3.position.set(Math.round(c.x / 10) * 10, 0.04, Math.round(c.z / 10) * 10);
  ctl3.target.copy(c); camP.position.set(c.x, Math.max(sz.x, sz.z) * 0.55, c.z + Math.max(sz.x, sz.z) * 0.6); ctl3.update();
  ctlP.target.set(c.x, 0, c.z); camO.position.set(c.x, 1000, c.z); camO.zoom = 100 / (Math.max(sz.z, sz.x * camO.bottom / camO.left) * 1.05 || 100); camO.updateProjectionMatrix(); ctlP.update();
  sucio = true;
}
function ponerVista(v) {
  const antes = vista; vista = v; if (v !== 'caminar') ls('oo-editor-vista', v);
  if (antes === 'caminar' && v !== 'caminar') salirCaminar();
  if (v === 'planta') {
    if (antes !== 'planta') { const t = ctl3.target, dist = camP.position.distanceTo(t), vh = 2 * dist * Math.tan(camP.fov * DEG / 2); ctlP.target.set(t.x, 0, t.z); camO.position.set(t.x, 1000, t.z); camO.zoom = Math.min(120, Math.max(0.02, 100 / Math.max(vh, 1))); camO.updateProjectionMatrix(); ctlP.update(); }
    cam = camO; ctlP.enabled = true; ctl3.enabled = false;
  } else {
    if (antes === 'planta') { const t = ctlP.target, vh = 100 / camO.zoom, dist = vh / (2 * Math.tan(camP.fov * DEG / 2)); const dir = camP.position.clone().sub(ctl3.target); if (dir.lengthSq() < 1e-6) dir.set(0, 1, 1); dir.normalize(); ctl3.target.set(t.x, 0, t.z); camP.position.copy(ctl3.target).addScaledVector(dir, dist); ctl3.update(); }
    cam = camP; ctlP.enabled = false; ctl3.enabled = v === '3d';
  }
  tc.camera = cam;
  if (v === 'caminar' && antes !== 'caminar') entrarCaminar();
  $$('[data-vista]').forEach(b => b.classList.toggle('on', b.dataset.vista === v));
  $('#herramientas').querySelectorAll('button').forEach(b => b.disabled = v === 'caminar');
  grid3.visible = verRejilla && v !== 'planta';
  aplicarFondo(); colocarPivote(); actualizarContorno(); actualizarPista(); sucio = true;
  avisar('vista', v);
}
function vistaRapida(n) {
  if (n === 1) { ponerVista('planta'); return; }
  if (n === 5) { ponerVista('caminar'); return; }
  if (vista !== '3d') ponerVista('3d');
  const t = ctl3.target.clone(), d = Math.max(15, camP.position.distanceTo(t));
  const pos = n === 2 ? new V3(0, d * 0.28, d) : n === 3 ? new V3(d, d * 0.28, 0) : new V3(d * 0.62, d * 0.62, d * 0.62);
  volarA(t, t.clone().add(pos));
}
function mirarNorte() {
  if (vista === 'planta') return;
  if (vista === 'caminar') { andar.yaw = 0; andar.cambio = true; return; }
  const t = ctl3.target, off = camP.position.clone().sub(t); const h = Math.hypot(off.x, off.z);
  volarA(t.clone(), new V3(t.x, camP.position.y, t.z + h));
}
/* (2.1) Cámara que no se pierde:
   - el punto de giro nunca sale del mapa (más un margen) ni se va muy arriba o bajo el suelo; la cámara no se aleja más de lo que mide el
     mapa y no baja del suelo;
   - con el botón derecho se orbita alrededor de lo que hay bajo el cursor, no de un punto que puede estar lejísimos o detrás de una pared;
   - «Todo el mapa» (Inicio o el botón de la vista) vuelve a encuadrar el mapa entero. */
function limitarCamara() {
  const L = limitesMapa, tam = Math.max(L.max.x - L.min.x, L.max.z - L.min.z, 50), mg = 60, t = ctl3.target, antes = t.clone();
  t.x = Math.min(L.max.x + mg, Math.max(L.min.x - mg, t.x)); t.z = Math.min(L.max.z + mg, Math.max(L.min.z - mg, t.z)); t.y = Math.min(120, Math.max(-3, t.y));
  const d = antes.sub(t); if (d.lengthSq() > 1e-8) camP.position.sub(d);
  const off = camP.position.clone().sub(t), dmax = tam * 1.6; if (off.length() > dmax) camP.position.copy(t).add(off.setLength(dmax));
  if (camP.position.y < 0.3) camP.position.y = 0.3;
  ctl3.maxDistance = dmax; ctl3.update();
}
function pivoteBajoCursor(e) {
  if (vista !== '3d') return;
  const h = pickEvento(e, { soloVisible: true }); const p = h ? h.point : puntoPlano(e, 0); if (!p) return;
  const dist = camP.position.distanceTo(p); if (!(dist > 0.5 && dist < 2500)) return;
  // El nuevo centro va en la línea de la vista, a la distancia de lo señalado: así la imagen no salta al cambiarlo.
  const dir = new V3(); camP.getWorldDirection(dir);
  ctl3.target.copy(camP.position).addScaledVector(dir, Math.max(1, dist * Math.max(0.2, dir.dot(p.clone().sub(camP.position).normalize()))));
  ctl3.update();
}
function todoElMapa() { if (vista === 'caminar') ponerVista('3d'); seleccionar([]); encuadrarCaja(limitesMapa.clone()); pista('Todo el mapa a la vista.'); }
/* zoom hacia el cursor */
function zoomCursor(e) {
  const k = Math.pow(1.0015, (AJ.invertirZoom ? -1 : 1) * e.deltaY * (e.deltaMode === 1 ? 30 : 1) * AJ.sens);
  if (vista === 'planta') {
    const antesP = puntoPlano(e, 0); camO.zoom = Math.min(120, Math.max(0.02, camO.zoom / k)); camO.updateProjectionMatrix(); camO.updateMatrixWorld();
    const desp = puntoPlano(e, 0); if (antesP && desp) { const dx = antesP.x - desp.x, dz = antesP.z - desp.z; camO.position.x += dx; camO.position.z += dz; ctlP.target.x += dx; ctlP.target.z += dz; }
    ctlP.update(); sucio = true; return;
  }
  if (vista !== '3d') return;
  const h = pickEvento(e, { soloVisible: true }); let p = h ? h.point : puntoPlano(e, 0);
  if (!p || p.distanceTo(camP.position) > 4000) p = ctl3.target.clone();
  let kk = k; const dist = camP.position.distanceTo(p);
  if (dist * kk < 0.8) kk = 0.8 / dist; if (dist * kk > 3000) kk = 3000 / dist;
  camP.position.sub(p).multiplyScalar(kk).add(p); ctl3.target.sub(p).multiplyScalar(kk).add(p);
  if (camP.position.y < 0.3) { const dy = 0.3 - camP.position.y; camP.position.y += dy; ctl3.target.y += dy; }
  ctl3.update(); sucio = true;
}
/* teclas de cámara */
const teclasCam = new Set(), teclasToque = new Set();
const TECLAS_CAM = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyV', 'PageUp', 'PageDown'];
function moverCamTeclas(dt) {
  if ((!teclasCam.size && !teclasToque.size) || vista === 'caminar') return false;
  const T = new Set([...teclasCam, ...teclasToque]); teclasToque.clear(); if (T.size && !teclasCam.size) dt = Math.max(dt, 1 / 30);
  const rap = T.has('Shift') ? 3.5 : 1; dt = Math.min(dt, 0.1);
  let f, r, dist;
  if (vista === 'planta') { f = new V3(0, 0, -1); r = new V3(1, 0, 0); dist = 100 / camO.zoom; }
  else { f = ctl3.target.clone().sub(camP.position); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize(); r = new V3().crossVectors(f, ARRIBA).normalize(); dist = camP.position.distanceTo(ctl3.target); }
  const vel = Math.max(4, dist * 0.6) * AJ.velocidad * rap * dt;
  const d = new V3();
  if (T.has('ArrowUp') || T.has('KeyW')) d.add(f); if (T.has('ArrowDown') || T.has('KeyS')) d.sub(f);
  if (T.has('ArrowRight') || T.has('KeyD')) d.add(r); if (T.has('ArrowLeft') || T.has('KeyA')) d.sub(r);
  let mov = false;
  if (d.lengthSq() > 0) { d.normalize().multiplyScalar(vel); if (vista === 'planta') { camO.position.add(d); ctlP.target.add(d); ctlP.update(); } else { camP.position.add(d); ctl3.target.add(d); ctl3.update(); } mov = true; }
  const up = (T.has('KeyR') || T.has('PageUp') ? 1 : 0) - (T.has('KeyV') || T.has('PageDown') ? 1 : 0);
  if (up) { if (vista === 'planta') { camO.zoom = Math.min(120, Math.max(0.02, camO.zoom * (1 + up * dt * 1.5))); camO.updateProjectionMatrix(); ctlP.update(); } else { const dy = up * Math.max(2, dist * 0.4) * AJ.velocidad * rap * dt; camP.position.y = Math.max(0.3, camP.position.y + dy); ctl3.target.y = Math.max(-5, ctl3.target.y + dy); ctl3.update(); } mov = true; }
  const giro = (T.has('KeyQ') ? 1 : 0) - (T.has('KeyE') ? 1 : 0);
  if (giro && vista === '3d') { const off = camP.position.clone().sub(ctl3.target).applyAxisAngle(ARRIBA, giro * 1.6 * AJ.velocidad * dt); camP.position.copy(ctl3.target).add(off); ctl3.update(); mov = true; }
  return mov;
}
/* caminar */
const andar = { yaw: 0, pitch: 0, teclas: new Set(), lock: false, arr: null, sinLock: false, cambio: false };
function entrarCaminar() {
  if (herramienta !== 'sel') ponerHerramienta('sel');
  const dir = new V3(); camP.getWorldDirection(dir);
  const t = ctl3.target; camP.position.set(t.x, Math.max(0, t.y) + 1.7, t.z);
  andar.yaw = Math.atan2(-dir.x, -dir.z); andar.pitch = 0; andar.cambio = true;
  $('#mira').hidden = false;
}
function salirCaminar() {
  try { if (document.pointerLockElement === dom) document.exitPointerLock(); } catch (e) { }
  const f = new V3(-Math.sin(andar.yaw), 0, -Math.cos(andar.yaw));
  ctl3.target.copy(camP.position).addScaledVector(f, 8); ctl3.target.y = Math.max(0, camP.position.y - 1.7);
  camP.position.y += 2; ctl3.update(); $('#mira').hidden = true; andar.teclas.clear();
}
function moverAndar(dt) {
  if (window.OOCaminar && OOCaminar.mover) return OOCaminar.mover(dt); /* (2.1) caminar_pro.js: colisión, altura de ojos, puertas, linterna… */
  const T = andar.teclas; const sp = (T.has('ShiftLeft') || T.has('ShiftRight') ? 14 : 5) * AJ.velocidad;
  const f = new V3(-Math.sin(andar.yaw), 0, -Math.cos(andar.yaw)), r = new V3(Math.cos(andar.yaw), 0, -Math.sin(andar.yaw)), d = new V3();
  if (T.has('KeyW') || T.has('ArrowUp')) d.add(f); if (T.has('KeyS') || T.has('ArrowDown')) d.sub(f);
  if (T.has('KeyD') || T.has('ArrowRight')) d.add(r); if (T.has('KeyA') || T.has('ArrowLeft')) d.sub(r);
  if (T.has('KeyE') || T.has('Space')) d.y += 1; if (T.has('KeyQ') || T.has('KeyC')) d.y -= 1;
  let mov = false;
  if (d.lengthSq() > 0) { d.normalize().multiplyScalar(sp * Math.min(dt, 0.1)); camP.position.add(d); mov = true; }
  if (mov || andar.cambio) { camP.quaternion.setFromEuler(new THREE.Euler(andar.pitch, andar.yaw, 0, 'YXZ')); andar.cambio = false; return true; }
  return false;
}
document.addEventListener('pointerlockchange', () => { andar.lock = document.pointerLockElement === dom; actualizarPista(); });
document.addEventListener('pointerlockerror', () => { andar.sinLock = true; actualizarPista(); });
function mirar(dx, dy) { const s = 0.0026 * AJ.sens * (AJ.invertirGiro ? -1 : 1); andar.yaw -= dx * s; andar.pitch = Math.max(-1.5, Math.min(1.5, andar.pitch - dy * s)); andar.cambio = true; }

/* ====================== elegir con el ratón (rayos propios, rápidos) ====================== */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function rayDe(e) { cam.updateMatrixWorld(); const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); return ray; }
function slab(ox, oy, oz, ix, iy, iz, bb, o) {
  let t1 = (bb[o] - ox) * ix, t2 = (bb[o + 3] - ox) * ix; let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (bb[o + 1] - oy) * iy; t2 = (bb[o + 4] - oy) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (bb[o + 2] - oz) * iz; t2 = (bb[o + 5] - oz) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  return tmax >= Math.max(tmin, 0) ? Math.max(tmin, 0) : -1;
}
const _ri = new M4(), _ro = new V3(), _rp = new V3(), _rd = new V3();
function rayoCajaUnidad(o, d) {
  let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 0;
  for (let k = 0; k < 3; k++) {
    const oo = o.getComponent(k), dd = d.getComponent(k);
    if (Math.abs(dd) < 1e-12) { if (oo < -0.5 || oo > 0.5) return null; continue; }
    let t1 = (-0.5 - oo) / dd, t2 = (0.5 - oo) / dd, s = -1; if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = k; sg = s; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return null;
  }
  if (tmin < 0 || ax < 0) return null;
  const n = new V3(); n.setComponent(ax, sg); return { t: tmin, n };
}
function rayoEsferaUnidad(o, d) {
  const a = d.dot(d), b = 2 * o.dot(d), c = o.dot(o) - 0.25, disc = b * b - 4 * a * c; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) return null; return { t, n: o.clone().addScaledVector(d, t).normalize() };
}
function pickRayo(r, opts) {
  opts = opts || {};
  const R = r.ray, o = R.origin, d = R.direction; const ix = 1 / (d.x || 1e-12), iy = 1 / (d.y || 1e-12), iz = 1 / (d.z || 1e-12);
  const cands = [];
  for (const k in M) {
    if (opts.soloCajas && !/^box/.test(k)) continue;
    const m = M[k], n = m.mesh.count, bb = m.bb, own = m.owner;
    for (let s = 0; s < n; s++) {
      const of = s * 6; if (bb[of] > bb[of + 3]) continue;
      const t = slab(o.x, o.y, o.z, ix, iy, iz, bb, of); if (t < 0) continue;
      const key = own[s]; if (!key) continue; if (!opts.todo && !seleccionable(key)) continue; if (opts.excluir && opts.excluir.has(key)) continue;
      cands.push([t, k, s]);
    }
  }
  cands.sort((a, b) => a[0] - b[0]);
  let best = null;
  for (const [t0, k, s] of cands) {
    if (best && t0 > best.t) break;
    const m = M[k]; m.mesh.getMatrixAt(s, _m2); _ri.copy(_m2).invert();
    _ro.copy(o).applyMatrix4(_ri); _rp.copy(o).add(d).applyMatrix4(_ri); _rd.subVectors(_rp, _ro);
    const h = (k === 'sph' || k === 'luz') ? rayoEsferaUnidad(_ro, _rd) : rayoCajaUnidad(_ro, _rd);
    if (!h) continue;
    const py = o.y + d.y * h.t; if (py > clip.constant + 0.01) continue;
    if (!best || h.t < best.t) best = { t: h.t, key: m.owner[s], malla: k, slot: s, nLocal: h.n, mat: _m2.clone() };
  }
  const extra = []; grupoFormas.children.forEach(c => { if (c.visible) extra.push(c); }); grupoTextos.children.forEach(c => { if (c.visible) extra.push(c); });
  if (extra.length) {
    const hits = r.intersectObjects(extra, false);
    for (const hh of hits) { const key = hh.object.userData.key; if (!key || hh.point.y > clip.constant + 0.01) continue; if (!opts.todo && !seleccionable(key)) continue; if (opts.excluir && opts.excluir.has(key)) continue; if (!best || hh.distance < best.t) best = { t: hh.distance, key, malla: 'forma', nLocal: hh.face ? hh.face.normal.clone() : new V3(0, 1, 0), mat: hh.object.matrixWorld.clone(), forma: hh.object }; break; }
  }
  if (!best) return null;
  best.point = R.at(best.t, new V3());
  best.normal = best.nLocal.clone().transformDirection(best.mat);
  return best;
}
function pickEvento(e, opts) { return pickRayo(rayDe(e), opts); }
/* (2.1) para elegir con el ratón: en el plano 2D manda lo dibujado (objetos sobre paredes, paredes sobre pisos; los techos no tapan) */
function pickSel(e) { if (window.OOPlano && OOPlano.activo()) { const h = OOPlano.pick(e); if (h !== undefined) return h; } return pickEvento(e); }
let planoTrabajo = 0; /* (2.1 pro f3) altura del suelo del nivel activo (niveles.js) */
function puntoPlano(e, y) { rayDe(e); const p = new V3(); const pl = new THREE.Plane(ARRIBA, -(y || 0)); return ray.ray.intersectPlane(pl, p) ? p : null; }
function ajustarRejilla(p) { if (AJ.ajuste && p) { const s = AJ.paso || 0.25; p.x = Math.round(p.x / s) * s; p.z = Math.round(p.z / s) * s; } return p; }
function puntoSuelo(e) { const h = pickEvento(e); let p = null; if (h && h.normal.y > 0.6) p = h.point.clone(); else p = puntoPlano(e, planoTrabajo); return ajustarRejilla(p); }

/* ====================== inferencias (extremos, puntos medios, ejes, guías) ====================== */
const marcaPunto = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2e7d32, depthTest: false })); marcaPunto.renderOrder = 41; marcaPunto.visible = false; marcas.add(marcaPunto);
const lineaEje = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xe53935, dashSize: 0.5, gapSize: 0.3, depthTest: false })); lineaEje.renderOrder = 41; lineaEje.visible = false; lineaEje.frustumCulled = false; marcas.add(lineaEje);
function metrosPorPixel(p) { const a = p.clone().project(cam), b = p.clone().add(new V3(1, 0, 0)).project(cam); const r = dom.getBoundingClientRect(); const px = Math.hypot((b.x - a.x) * r.width / 2, (b.y - a.y) * r.height / 2); return px > 1e-6 ? 1 / px : 1; }
function puntosClave(raw, R) {
  const out = [];
  for (const o of nuevos.values()) {
    const b = tipoBase(o.tipo), d = o.datos;
    if (b === 'muro') { const g = (+d.giroY || 0) * DEG, L = (+d.sx || 0) / 2, ux = Math.cos(g), uz = -Math.sin(g); out.push([d.x - ux * L, d.z - uz * L, 'extremo'], [d.x + ux * L, d.z + uz * L, 'extremo'], [d.x, d.z, 'medio']); }
    else if (b === 'habitacion') { const g = (+d.giroY || 0) * DEG, cg = Math.cos(g), sg = Math.sin(g); for (const [x, z] of d.puntos || []) out.push([d.x + x * cg + z * sg, d.z - x * sg + z * cg, 'extremo']); }
    else if (b === 'fundacion' && window.OOFundaciones) { const hu = OOFundaciones.huella(d); hu.forEach(([x, z], j) => { const q = hu[(j + 1) % hu.length]; out.push([x, z, 'extremo'], [(x + q[0]) / 2, (z + q[1]) / 2, 'medio']); }); } /* (2.1 pro) esquinas y medios de las fundaciones */
  }
  for (const md of medidas) if (md.tipo === 'dist') out.push([md.a.x, md.a.z, 'extremo'], [md.b.x, md.b.z, 'extremo']);
  const bb = M.boxO && M.boxO.bb; if (bb) {
    const n = M.boxO.mesh.count;
    for (let s = 0; s < n; s++) {
      const o = s * 6; if (bb[o] > bb[o + 3]) continue; if (raw.x < bb[o] - R || raw.x > bb[o + 3] + R || raw.z < bb[o + 2] - R || raw.z > bb[o + 5] + R) continue;
      if (bb[o + 3] - bb[o] > 60 || bb[o + 5] - bb[o + 2] > 60 || bb[o + 4] - bb[o + 1] < 0.3) continue;
      M.boxO.mesh.getMatrixAt(s, _m2);
      const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => _v.set(x, -0.5, z).applyMatrix4(_m2).clone());
      for (let k = 0; k < 4; k++) { out.push([cs[k].x, cs[k].z, 'extremo']); const nx = cs[(k + 1) % 4]; out.push([(cs[k].x + nx.x) / 2, (cs[k].z + nx.z) / 2, 'medio']); }
    }
  }
  return out;
}
/* (2.1 pro) imán configurable (iman.js): AJ.iman = {extremos, medios, ejes, guias, superficies}; lo que falta cuenta como activado */
const imanOn = k => !AJ.iman || AJ.iman[k] !== false;
function inferir(e, base, opts) {
  opts = opts || {};
  let raw = opts.y != null ? puntoPlano(e, opts.y) : null;
  if (!raw) { const h = imanOn('superficies') ? pickEvento(e) : null; raw = (h && h.normal.y > 0.6) ? h.point.clone() : puntoPlano(e, planoTrabajo); }
  if (!raw) return null;
  const y = opts.y != null ? opts.y : raw.y;
  const R = Math.min(3, Math.max(0.05, 12 * metrosPorPixel(raw)));
  let res = { p: raw.clone(), tipo: 'libre' };
  if (AJ.inferencias) {
    let mejor = null, md = R;
    for (const [x, z, t] of puntosClave(raw, R)) { if (!imanOn(t === 'medio' ? 'medios' : 'extremos')) continue; const dd = Math.hypot(x - raw.x, z - raw.z); if (dd < md || (mejor && t === 'extremo' && mejor.tipo === 'medio' && dd < md * 1.2)) { md = dd; mejor = { p: new V3(x, y, z), tipo: t }; } }
    if (mejor) res = mejor;
    else {
      if (base && imanOn('ejes')) {
        const dx = raw.x - base.x, dz = raw.z - base.z, L = Math.hypot(dx, dz);
        if (L > 0.1) { const ang = Math.atan2(Math.abs(dz), Math.abs(dx)) / DEG; if (ang < 4 || Math.abs(ang - 0) < 4) { res = { p: new V3(raw.x, y, base.z), tipo: 'eje-x' }; } else if (ang > 86) { res = { p: new V3(base.x, y, raw.z), tipo: 'eje-z' }; } }
      }
      for (const [, g] of efectivos('guias')) {
        if (!g || g.mapa !== mapa || !imanOn('guias')) continue;
        if (g.dir === 'x' && Math.abs(raw.z - g.z) < R) { res.p.z = g.z; res.tipo = res.tipo === 'libre' ? 'guia' : res.tipo; }
        if (g.dir === 'z' && Math.abs(raw.x - g.x) < R) { res.p.x = g.x; res.tipo = res.tipo === 'libre' ? 'guia' : res.tipo; }
      }
      if (res.tipo === 'libre' || res.tipo === 'guia') { if (AJ.ajuste) { const s = AJ.paso; if (res.tipo === 'libre') { res.p.x = Math.round(res.p.x / s) * s; res.p.z = Math.round(res.p.z / s) * s; } } }
      if (base && res.tipo.startsWith('eje') && AJ.ajuste) { const s = AJ.paso; if (res.tipo === 'eje-x') res.p.x = base.x + Math.round((res.p.x - base.x) / s) * s; else res.p.z = base.z + Math.round((res.p.z - base.z) / s) * s; }
    }
  } else ajustarRejilla(res.p);
  res.p.y = y;
  mostrarInferencia(res, base);
  return res;
}
function mostrarInferencia(res, base) {
  const col = { extremo: 0x2e7d32, medio: 0x00acc1, 'eje-x': 0xe53935, 'eje-z': 0x43a047, guia: 0x7b1fa2, libre: 0x888888 }[res.tipo] || 0x888888;
  marcaPunto.visible = res.tipo !== 'libre'; marcaPunto.material.color.setHex(col); marcaPunto.position.copy(res.p); marcaPunto.scale.setScalar(Math.max(0.06, 6 * metrosPorPixel(res.p)));
  if (base && (res.tipo === 'eje-x' || res.tipo === 'eje-z')) { lineaEje.geometry.setFromPoints([base.clone().setY(res.p.y + 0.02), res.p.clone().setY(res.p.y + 0.02)]); lineaEje.computeLineDistances(); lineaEje.material.color.setHex(col); lineaEje.visible = true; }
  else lineaEje.visible = false;
  sucio = true;
}
function ocultarInferencia() { marcaPunto.visible = false; lineaEje.visible = false; sucio = true; }

/* ====================== herramientas ====================== */
function mostrarPrevia(tipo, datos, mal) {
  limpiarPrevia();
  const o = { tipo, datos, fotos: [] }; if (tipo === 'muro') { o.ext = [0, 0]; o.huecos = []; }
  const parts = partesMundo(o); const mat = mal === 'aviso' ? matPreviaAviso : mal ? matPreviaMal : matPrevia;
  for (const pt of parts) {
    if (pt.f === 't') continue;
    if (pt.f === 'poly') { if (!pt.pts || pt.pts.length < 3) continue; const sh = formaPoly(pt); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, (pt.y || 0) + 0.05, 0); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.matrix.copy(pt.m); m.userData.liberar = true; previa.add(m); continue; }
    const g = pt.f === 'c' ? geoCyl : (pt.f === 'b' ? geoBox : geoSph); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.matrix.copy(pt.m); previa.add(m);
  }
  sucio = true; return parts;
}
function limpiarPrevia() { while (previa.children.length) { const c = previa.children[0]; previa.remove(c); if (c.userData.liberar) c.geometry.dispose(); } sucio = true; }
function punto3D(p, color) { const m = new THREE.Mesh(geoSph, new THREE.MeshBasicMaterial({ color: color || 0x1f6feb, depthTest: false })); m.position.copy(p); m.scale.setScalar(Math.max(0.3, 5 * metrosPorPixel(p))); m.renderOrder = 40; m.userData.liberarMat = true; previa.add(m); sucio = true; }
let etqVivas = [];
/* pared */
let paredEst = null;
function datosMuro(a, b) { const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); const pr = params.pared; return { x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2, giroY: Math.atan2(-dz, dx) / DEG, sx: Math.max(0.05, L), sy: pr.sy, sz: pr.sz, material: pr.material, color: pr.color, preset: pr.preset || undefined }; }
function angTxt(a, b) { let g = Math.atan2(-(b.z - a.z), b.x - a.x) / DEG; if (g < 0) g += 360; return fmt(g, 1) + '°'; }
let medidaTecleada = '';
function aplicarMedidaTecleada() {
  const L = parseFloat(medidaTecleada); medidaTecleada = ''; if (!paredEst || !(L > 0.05)) return;
  const ini = paredEst.ini; let dx = 1, dz = 0;
  const inf = ultimoRaton ? inferir(ultimoRaton, ini, { y: ini.y }) : null;
  if (inf) { const ddx = inf.p.x - ini.x, ddz = inf.p.z - ini.z, l = Math.hypot(ddx, ddz); if (l > 1e-3) { dx = ddx / l; dz = ddz / l; } }
  const fin = new V3(ini.x + dx * L, ini.y, ini.z + dz * L);
  const id = crearNuevo('muro', datosMuro(ini, fin)); paredEst.n++; if (id) detectarHabitaciones(true, { muros: [id] });
  paredEst.ini = fin; limpiarPrevia(); etqVivas = []; pista('Tramo de ' + fmtLen(L) + ' creado. Sigue con otro clic o escribe otra medida.');
}
function terminarPared() { medidaTecleada = ''; paredEst = null; limpiarPrevia(); ocultarInferencia(); etqVivas = []; actualizarPista(); }
/* habitación (rectángulo/polígono) y detección de recintos */
let habEst = null;
/* (2.1) Recintos cerrados por paredes nuevas, robusto:
   - los extremos que quedan a menos de 15 cm (o 3/4 del grosor) se juntan en un nodo, aunque no coincidan al milímetro;
   - una pared que acaba en mitad de otra (T) o que la cruza parte esa otra en el grafo (las paredes no se tocan);
   - se quitan los tramos sueltos (un extremo sin nada) antes de buscar caras;
   - una cara que encierra paredes que no son suyas (un anillo exterior alrededor de otras habitaciones) no es un recinto: así no sale
     una «Habitación» gigante encima de las demás (la «Habitación 29» de 422,9 m² de los datos del usuario salió así).
   Devuelve [{pts, area, y, alto, nodos}] (pts en el mundo). opts.conAnillos: incluye también los anillos (marcados con anillo: true). */
function poligonosCerrados(opts) {
  opts = opts || {};
  const muros = [...nuevos.values()].filter(o => tipoBase(o.tipo) === 'muro' && !(+o.datos.curva));
  const segs = [];
  for (const o of muros) { const d = o.datos, g = (+d.giroY || 0) * DEG, L = (+d.sx || 0) / 2, ux = Math.cos(g), uz = -Math.sin(g); if (L < 0.02) continue; segs.push({ a: [d.x - ux * L, d.z - uz * L], b: [d.x + ux * L, d.z + uz * L], y: +d.y || 0, h: +d.sy || 2.6, g: Math.max(0.05, +d.sz || 0.2), id: o.id }); }
  if (!segs.length) return [];
  /* 1) nodos: extremos juntados por cercanía (unión por celdas) */
  const pts = [], tolDe = s => Math.max(0.15, s.g * 0.75);
  for (const s of segs) { s.ia = pts.length; pts.push({ x: s.a[0], z: s.a[1], tol: tolDe(s), y: s.y }); s.ib = pts.length; pts.push({ x: s.b[0], z: s.b[1], tol: tolDe(s), y: s.y }); }
  const padre = pts.map((_, i) => i), raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const C = 0.5, celdas = new Map();
  pts.forEach((p, i) => {
    const cx = Math.floor(p.x / C), cz = Math.floor(p.z / C);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const l = celdas.get((cx + dx) + ',' + (cz + dz)); if (l) for (const j of l) { const q = pts[j]; if (Math.abs(q.y - p.y) < 0.3 && Math.hypot(q.x - p.x, q.z - p.z) < Math.max(p.tol, q.tol)) padre[raiz(j)] = raiz(i); } }
    const k = cx + ',' + cz; if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(i);
  });
  const nodos = new Map(); /* raíz → {x, z, n} (promedio de los extremos juntados) */
  pts.forEach((p, i) => { const r = raiz(i); let nd = nodos.get(r); if (!nd) nodos.set(r, nd = { x: 0, z: 0, n: 0 }); nd.x += p.x; nd.z += p.z; nd.n++; });
  for (const nd of nodos.values()) { nd.x /= nd.n; nd.z /= nd.n; }
  const pos = k => nodos.get(k);
  /* 2) cortes en T y cruces: puntos de cada segmento (parámetro t) */
  const cortes = segs.map(s => [[0, raiz(s.ia)], [1, raiz(s.ib)]]);
  let extra = 0; const nodoExtra = (x, z) => { const k = 'x' + (extra++); nodos.set(k, { x, z, n: 1 }); return k; };
  const lista0 = [...nodos.entries()];
  segs.forEach((s, i) => {
    const ka = raiz(s.ia), kb = raiz(s.ib), A = pos(ka), B = pos(kb), dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz; if (L2 < 1e-6) return; const L = Math.sqrt(L2), tol = tolDe(s);
    for (const [k, nd] of lista0) { if (k === ka || k === kb) continue; const t = ((nd.x - A.x) * dx + (nd.z - A.z) * dz) / L2; if (t <= 0 || t >= 1) continue; const dist = Math.abs((nd.x - A.x) * dz - (nd.z - A.z) * dx) / L; if (dist < tol && t * L > tol * 0.5 && (1 - t) * L > tol * 0.5) cortes[i].push([t, k]); }
  });
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const si = segs[i], sj = segs[j]; if (Math.abs(si.y - sj.y) > 0.3) continue;
    const A = pos(raiz(si.ia)), B = pos(raiz(si.ib)), Cc = pos(raiz(sj.ia)), Dd = pos(raiz(sj.ib));
    const rx = B.x - A.x, rz = B.z - A.z, qx = Dd.x - Cc.x, qz = Dd.z - Cc.z, den = rx * qz - rz * qx; if (Math.abs(den) < 1e-9) continue;
    const wx = Cc.x - A.x, wz = Cc.z - A.z, t = (wx * qz - wz * qx) / den, u = (wx * rz - wz * rx) / den; const Li = Math.hypot(rx, rz), Lj = Math.hypot(qx, qz);
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1 || Math.min(t, 1 - t) * Li < tolDe(si) || Math.min(u, 1 - u) * Lj < tolDe(sj)) continue;
    const k = nodoExtra(A.x + rx * t, A.z + rz * t); cortes[i].push([t, k]); cortes[j].push([u, k]);
  }
  /* 3) aristas del grafo */
  const ady = new Map(), info = new Map();
  const arista = (a, b, s) => { if (a === b) return; if (!ady.has(a)) ady.set(a, new Set()); if (!ady.has(b)) ady.set(b, new Set()); ady.get(a).add(b); ady.get(b).add(a); info.set(a + '|' + b, s); info.set(b + '|' + a, s); };
  segs.forEach((s, i) => { const l = cortes[i].sort((p, q) => p[0] - q[0]); for (let k = 0; k + 1 < l.length; k++) arista(l[k][1], l[k + 1][1], s); });
  /* 4) quitar los tramos sueltos */
  let cambio = true; while (cambio) { cambio = false; for (const [k, l] of ady) if (l.size < 2) { for (const o of l) ady.get(o).delete(k); ady.delete(k); cambio = true; } }
  if (!ady.size) return [];
  /* 5) caras */
  const ang = (a, b) => { const P1 = pos(a), P2 = pos(b); return Math.atan2(P2.z - P1.z, P2.x - P1.x); };
  const orden = new Map(); for (const [k, l] of ady) orden.set(k, [...l].sort((p, q) => ang(k, p) - ang(k, q)));
  const vistos = new Set(), caras = [];
  for (const [u, l] of orden) for (const v of l) {
    if (vistos.has(u + '>' + v)) continue;
    const cara = [], segsCara = []; let a = u, b = v, pasos = 0;
    while (!vistos.has(a + '>' + b) && pasos < 2000) { vistos.add(a + '>' + b); cara.push(a); segsCara.push(info.get(a + '|' + b)); const lst = orden.get(b); const idx = lst.indexOf(a); const w = lst[(idx - 1 + lst.length) % lst.length]; a = b; b = w; pasos++; }
    if (cara.length < 3) continue;
    const ptsC = cara.map(k => { const n = pos(k); return [n.x, n.z]; }); let area = 0; for (let j = 0; j < ptsC.length; j++) { const p = ptsC[j], q = ptsC[(j + 1) % ptsC.length]; area += p[0] * q[1] - q[0] * p[1]; } area /= 2;
    if (!(area > 0.5) || new Set(cara).size !== cara.length) continue;
    caras.push({ pts: ptsC, area, nodos: cara, y: Math.min(...segsCara.map(x => x ? x.y : 0)), alto: Math.max(...segsCara.map(x => x ? x.h : 2.6)) });
  }
  /* 6) descartar anillos: una cara con nodos de paredes por dentro (que no están en su borde) encierra otras habitaciones */
  const todos = [...ady.keys()].map(k => [k, pos(k)]);
  const enBorde = (n, c) => { for (let j = 0; j < c.pts.length; j++) { const p = c.pts[j], q = c.pts[(j + 1) % c.pts.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((n.x - p[0]) * dx + (n.z - p[1]) * dz) / (L2 || 1))); if (Math.hypot(p[0] + dx * t - n.x, p[1] + dz * t - n.z) < 0.05) return true; } return false; };
  return caras.filter(c => { const propios = new Set(c.nodos); for (const [k, n] of todos) { if (propios.has(k) || !dentroPoligono(n.x, n.z, c.pts) || enBorde(n, c)) continue; c.anillo = true; return !!opts.conAnillos; } return true; });
}
function dentroPoligono(x, z, pts) { let d = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d; } return d; }
function puntosMundoHab(o) { const d = o.datos, g = (+d.giroY || 0) * DEG, cg = Math.cos(g), sg = Math.sin(g); return (d.puntos || []).map(([x, z]) => [d.x + x * cg + z * sg, d.z - x * sg + z * cg]); }
function areaPol(pts) { let a = 0; for (let j = 0; j < pts.length; j++) { const p = pts[j], q = pts[(j + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
function centroide(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
function datosHabitacion(ptsMundo, y, alto, extra) {
  const [cx, cz] = centroide(ptsMundo); const pr = params.habitacion; const bx = new THREE.Box3(); ptsMundo.forEach(([x, z]) => bx.expandByPoint(new V3(x, 0, z))); const sz = bx.getSize(new V3());
  const n = [...nuevos.values()].filter(o => tipoBase(o.tipo) === 'habitacion').length + 1;
  return Object.assign({ x: cx, y: y || 0, z: cz, giroY: 0, puntos: ptsMundo.map(([x, z]) => [x - cx, z - cz]), area: r3(areaPol(ptsMundo)), nombre: 'Habitación ' + n, material: pr.material, color: pr.color, alto: alto || pr.alto, sx: sz.x, sy: 0.03, sz: sz.z }, extra || {});
}
/* (2.1) opts.muros: ids de las paredes recién dibujadas; solo cuentan los recintos con un lado sobre alguna de ellas (dibujar una pared
   lejos ya no vuelve a crear habitaciones en otro sitio). Nunca crea un recinto que engloba a una habitación más pequeña. */
function detectarHabitaciones(unir, opts) {
  opts = opts || {};
  const caras = poligonosCerrados();
  const habs = [...nuevos.values()].filter(o => tipoBase(o.tipo) === 'habitacion').map(o => { const pts = puntosMundoHab(o); return { pts, area: +o.datos.area || areaPol(pts), y: +o.datos.y || 0, cen: centroide(pts) }; });
  const segsNuevos = (opts.muros || []).map(id => nuevos.get(id)).filter(Boolean).map(o => { const d = o.datos, g = (+d.giroY || 0) * DEG, L = (+d.sx || 0) / 2, ux = Math.cos(g), uz = -Math.sin(g); return [[d.x - ux * L, d.z - uz * L], [d.x + ux * L, d.z + uz * L], Math.max(0.15, (+d.sz || 0.2) * 0.75)]; });
  const sobre = (p, s) => { const dx = s[1][0] - s[0][0], dz = s[1][1] - s[0][1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p[0] - s[0][0]) * dx + (p[1] - s[0][1]) * dz) / (L2 || 1))); return Math.hypot(s[0][0] + dx * t - p[0], s[0][1] + dz * t - p[1]) < s[2]; };
  const lista = [];
  for (const c of caras) {
    if (opts.muros && !segsNuevos.some(s => { for (let j = 0; j < c.pts.length; j++) { const p = c.pts[j], q = c.pts[(j + 1) % c.pts.length]; if (sobre(p, s) && sobre(q, s)) return true; } return false; })) continue;
    const [cx, cz] = centroide(c.pts);
    if (habs.some(h => dentroPoligono(cx, cz, h.pts) && Math.abs(h.area - c.area) < Math.max(0.5, c.area * 0.08))) continue;
    if (habs.some(h => Math.abs(h.y - c.y) < 0.3 && h.area < c.area * 0.92 && dentroPoligono(h.cen[0], h.cen[1], c.pts))) continue; /* engloba a otra habitación */
    const id = nuevoId() + lista.length; lista.push({ id, data: docNuevo(id, 'habitacion', datosHabitacion(c.pts, c.y, c.alto, { automatica: true })) });
  }
  if (lista.length) { guardar(lista, { unir }); pista(lista.length === 1 ? 'Habitación detectada: ' + fmt(lista[0].data.datos.area, 1) + ' m².' : lista.length + ' habitaciones detectadas.'); }
  return lista.map(x => x.id);
}
function crearCuartoRect(a, b) {
  const pr = params.habitacion; const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z), y = a.y;
  if (pr.modo === 'edificio') { const id = crearNuevo('edificio', { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, giroY: 0, sx: x1 - x0, sz: z1 - z0, alto: pr.alto, pisos: pr.pisos, sy: pr.alto * pr.pisos, grosor: pr.grosor, material: pr.matmuro, color: pr.colormuro }); if (id) seleccionar(['n' + id]); return; }
  const esq = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; const lista = [];
  for (let k = 0; k < 4; k++) { const p = esq[k], q = esq[(k + 1) % 4]; const dm = datosMuro(new V3(p[0], y, p[1]), new V3(q[0], y, q[1])); dm.sy = pr.alto; dm.sz = pr.grosor; dm.material = pr.matmuro; dm.color = pr.colormuro; const id = nuevoId() + k; lista.push({ id, data: docNuevo(id, 'muro', dm) }); }
  const idh = nuevoId() + 'h'; lista.push({ id: idh, data: docNuevo(idh, 'habitacion', datosHabitacion(esq, y, pr.alto)) });
  guardar(lista); pista('Habitación de ' + fmt((x1 - x0) * (z1 - z0), 1) + ' m² creada.');
}
function cerrarPoligonoHab() {
  if (!habEst || habEst.puntos.length < 3) { pista('Hacen falta al menos 3 esquinas.'); return; }
  const pts = habEst.puntos.map(p => [p.x, p.z]); const y = habEst.puntos[0].y; habEst = null; limpiarPrevia(); ocultarInferencia(); etqVivas = [];
  const id = crearNuevo('habitacion', datosHabitacion(pts, y)); if (id) seleccionar(['n' + id]);
}
/* puertas y ventanas en paredes */
function colocarHueco(e, tipo) {
  const h = pickEvento(e, { soloCajas: true }); if (!h || h.malla === 'forma') return null;
  if (!(h.key[0] === 'p' || h.key[0] === 'n')) return null;
  const pos = new V3(), q = new Q4(), sc = new V3(); h.mat.decompose(pos, q, sc);
  let nl = h.nLocal, n = h.normal.clone();
  if (Math.abs(nl.y) > 0.5) { /* (editor v2) desde arriba (planta, plano 2D): la cara lateral del lado donde se hizo clic */
    const loc = h.point.clone().applyMatrix4(h.mat.clone().invert());
    nl = Math.abs(sc.x) <= Math.abs(sc.z) ? new V3(Math.sign(loc.x) || 1, 0, 0) : new V3(0, 0, Math.sign(loc.z) || 1);
    n = nl.clone().transformDirection(h.mat);
  }
  const grosor = Math.abs(nl.x) > 0.5 ? sc.x : sc.z; if (grosor > 1.5 || sc.y < 0.8) return null;
  n.y = 0; if (n.lengthSq() < 1e-6) return null; n.normalize();
  let c = h.point.clone().addScaledVector(n, -grosor / 2); const pr = params[tipo];
  let muro = h.key[0] === 'p' ? +h.key.slice(1) : h.key.slice(1), base = pos.y - sc.y / 2, alto = sc.y;
  if (typeof muro === 'string') { const ho = nuevos.get(muro); if (ho && tipoBase(ho.tipo) === 'hueco' && ho.datos.muro != null) muro = ho.datos.muro; } /* (2.1) clic dentro de un hueco propio: la puerta o ventana va en su pared */
  if (typeof muro === 'string') { const w = nuevos.get(muro); if (!w || tipoBase(w.tipo) !== 'muro') return null; base = +w.datos.y || 0; alto = +w.datos.sy; const g = (+w.datos.giroY || 0) * DEG, ux = Math.cos(g), uz = -Math.sin(g); let u = (c.x - w.datos.x) * ux + (c.z - w.datos.z) * uz; if (AJ.ajuste) u = Math.round(u / AJ.paso) * AJ.paso; const lim = Math.max(0, w.datos.sx / 2 - pr.sx / 2 - 0.1); u = Math.max(-lim, Math.min(lim, u)); c = new V3(w.datos.x + ux * u, base, w.datos.z + uz * u); }
  else { const z = P[muro]; if (!z || z.t > 1) return null; base = z.p.y - z.s.y / 2; alto = z.s.y; }
  const conAlf = tipo === 'ventana' || tipo === 'hueco'; /* (2.1) el hueco propio también tiene altura desde el suelo */
  return { x: c.x, y: base, z: c.z, giroY: Math.atan2(n.x, n.z) / DEG, sx: pr.sx, sy: Math.min(pr.sy, alto - (conAlf ? (pr.alfeizar || 0) : 0) - (tipo === 'hueco' ? 0 : 0.1)), sz: grosor, alfeizar: conAlf ? pr.alfeizar : 0, color: pr.color, hoja: pr.hoja, muro, muro_alto: r3(alto) };
}
/* techo */
function crearTecho(e) {
  const h = pickEvento(e);
  if (h && h.key[0] === 'n') { const o = nuevos.get(h.key.slice(1)); if (o && tipoBase(o.tipo) === 'habitacion') return techoDeHabitacion(o); }
  const p = puntoPlano(e, planoTrabajo); if (!p) return;
  for (const o of nuevos.values()) if (tipoBase(o.tipo) === 'habitacion' && dentroPoligono(p.x, p.z, puntosMundoHab(o))) return techoDeHabitacion(o);
  const c = poligonosCerrados().find(cc => dentroPoligono(p.x, p.z, cc.pts));
  if (c) { const pr = params.techo; const dh = datosHabitacion(c.pts, c.y + c.alto, c.alto); const id = crearNuevo('techo', Object.assign({ x: dh.x, y: dh.y, z: dh.z, giroY: 0, puntos: dh.puntos, grosor: pr.grosor, material: pr.material, color: pr.color, sx: dh.sx, sy: pr.grosor, sz: dh.sz }, window.OOTechos ? OOTechos.extra(pr) : null)); if (id) pista('Techo creado sobre el recinto.'); return; }
  pista('Haz clic dentro de una habitación o de un recinto de paredes cerrado.');
}
function techoDeHabitacion(o) {
  const d = o.datos, pr = params.techo; const yy = (+d.y || 0) + (+d.alto || pr.alto);
  const id = crearNuevo('techo', Object.assign({ x: d.x, y: yy, z: d.z, giroY: d.giroY || 0, puntos: clon(d.puntos), grosor: pr.grosor, material: pr.material, color: pr.color, sx: d.sx, sy: pr.grosor, sz: d.sz, de_habitacion: o.id }, window.OOTechos ? OOTechos.extra(pr) : null)); /* (2.1 pro f3) forma de cubierta (techos.js) */
  if (id) pista('Techo generado a ' + fmtLen(yy) + ' de altura.');
}
/* pintar */
function pintar(e) {
  const h = pickEvento(e); if (!h) return;
  const pr = params.pintar;
  if (e.altKey) { if (h.key[0] === 'p') { const z = P[+h.key.slice(1)]; pr.color = '#' + z.c.getHexString(); pr.material = z.material || 'pintura'; } else if (h.key[0] === 'n') { const o = nuevos.get(h.key.slice(1)); if (o) { pr.color = o.datos.color || pr.color; pr.material = o.datos.material || 'pintura'; } } renderPanel(); pista('Cuentagotas: ' + (MATERIALES[pr.material] || {}).n + ' ' + pr.color); return; }
  if (h.key[0] === 'p') { const i = +h.key.slice(1); const g = selGrupo; selGrupo = null; P[i].c.set(pr.color); P[i].material = pr.material; escribirPieza(i); marcarActualizado(); guardar(docModOrig([i], 'pintura:' + pr.material)); selGrupo = g; }
  else if (h.key[0] === 'n') { const o = nuevos.get(h.key.slice(1)); if (!o) return; o.datos.color = pr.color; o.datos.material = pr.material; guardar([docActualizado(o)]); }
}
/* empujar / tirar */
let empEst = null;
function empujarInicio(e) {
  const h = pickEvento(e); if (!h || h.malla === 'forma') { pista('Elige la cara de una caja o de un objeto.'); return false; }
  let eje, signo, k = h.key, info;
  if (k[0] === 'p') { const z = P[+k.slice(1)]; if (z.t > 4 || h.malla === 'sph') return false; const a = Math.abs(h.nLocal.x) > 0.5 ? 0 : Math.abs(h.nLocal.y) > 0.5 ? 1 : 2; eje = a; signo = Math.sign(h.nLocal.getComponent(a)); info = { p0: z.p.clone(), s0: z.s.clone(), q: z.q.clone() }; }
  else { const o = nuevos.get(k.slice(1)); if (!o) return false; const b = tipoBase(o.tipo); if (['habitacion', 'techo', 'nota', 'luz', 'puerta', 'ventana', 'hueco'].includes(b)) { pista('Este objeto no se puede extruir; usa sus campos.'); return false; } const loc = h.normal.clone().applyQuaternion(qY(-(+o.datos.giroY || 0) * DEG)); const a = Math.abs(loc.x) > 0.6 ? 0 : Math.abs(loc.y) > 0.6 ? 1 : 2; if (a === 1 && loc.y < 0) return false; eje = a; signo = Math.sign(loc.getComponent(a)); info = { p0: new V3(o.datos.x, o.datos.y, o.datos.z), s0: new V3(+o.datos.sx || 1, +o.datos.sy || 1, +o.datos.sz || 1), q: qY((+o.datos.giroY || 0) * DEG), nuevo: true }; }
  const nW = new V3().setComponent(eje, signo).applyQuaternion(info.q);
  const a2 = h.point.clone().project(cam), b2 = h.point.clone().add(nW).project(cam); const r = dom.getBoundingClientRect();
  const sx = (b2.x - a2.x) * r.width / 2, sy = -(b2.y - a2.y) * r.height / 2; const pxm = Math.hypot(sx, sy);
  if (pxm < 2) { pista('Gira la vista: esa cara se ve de frente y no se puede arrastrar.'); return false; }
  empEst = Object.assign(info, { key: k, eje, signo, nW, x0: e.clientX, y0: e.clientY, dir: [sx / pxm, sy / pxm], pxm, punto: h.point.clone(), delta: 0 });
  if (!selSet.has(k)) seleccionar([k], { sinTab: true });
  return true;
}
function empujarMover(e) {
  const E = empEst; let dlt = ((e.clientX - E.x0) * E.dir[0] + (e.clientY - E.y0) * E.dir[1]) / E.pxm;
  const s0 = E.s0.getComponent(E.eje); if (AJ.ajuste) dlt = Math.round(dlt / AJ.paso) * AJ.paso; else dlt = Math.round(dlt * 100) / 100;
  if (s0 + dlt < 0.05) dlt = 0.05 - s0; E.delta = dlt;
  const s = E.s0.clone(); s.setComponent(E.eje, s0 + dlt);
  let p = E.p0.clone();
  if (E.nuevo) { if (E.eje !== 1) p.addScaledVector(E.nW, dlt / 2); }
  else p.addScaledVector(E.nW, dlt / 2);
  ponerEstado(E.key, p, E.q, s); marcarActualizado(); actualizarContorno(); actualizarValoresPanel();
  etqVivas = [{ p: E.punto.clone().addScaledVector(E.nW, dlt), t: fmtLen(s0 + dlt) + ' (' + (dlt >= 0 ? '+' : '') + fmt(dlt, 2) + ')', c: 'vivo' }];
}
function empujarFin() { const E = empEst; empEst = null; etqVivas = []; if (E && Math.abs(E.delta) > 1e-4) confirmarEdicion(); }
/* medir y guías */
let medirEst = null;
function puntoMedir(e) {
  const h = pickEvento(e); let p = h ? h.point.clone() : puntoPlano(e, 0); if (!p) return null; let tipo = 'libre';
  if (h && h.mat && h.malla !== 'forma' && h.malla !== 'sph') { const R = 12 * metrosPorPixel(p); let md = R; for (let a = 0; a < 8; a++) for (const mid of [false, true]) { let v; if (!mid) v = new V3(a & 1 ? 0.5 : -0.5, a & 2 ? 0.5 : -0.5, a & 4 ? 0.5 : -0.5); else { if (a > 2) continue; v = new V3(0, 0, 0); v.setComponent(a, 0.5); } const w = v.applyMatrix4(h.mat); const dd = w.distanceTo(p); if (dd < md) { md = dd; p = w; tipo = mid ? 'medio' : 'extremo'; } } }
  if (tipo === 'libre') { const inf = inferir(e, medirEst && medirEst.puntos[0], { y: p.y }); if (inf && inf.tipo !== 'libre') return inf.p; }
  mostrarInferencia({ p, tipo }, null); return p;
}
function medirClic(e) {
  const pr = params.medir;
  if (pr.modo === 'guia') { const p = puntoSuelo(e); if (!p) return; const id = 'g-' + mapa + '-' + Date.now().toString(36); guardarCol('guias', id, { mapa, dir: pr.guia, x: r3(p.x), z: r3(p.z), creado: ahora(), autor }); pista('Guía creada (' + (pr.guia === 'x' ? 'este-oeste' : 'norte-sur') + '). Bórralas desde la herramienta Medir.'); return; }
  const p = puntoMedir(e); if (!p) return;
  if (!medirEst) medirEst = { modo: pr.modo, puntos: [] };
  medirEst.puntos.push(p);
  const need = pr.modo === 'angulo' ? 3 : 2;
  if (medirEst.puntos.length >= need) {
    const pts = medirEst.puntos; medirEst = null;
    if (need === 2) { medidas.push({ tipo: 'dist', a: pts[0], b: pts[1] }); pista('Distancia: ' + fmtLen(pts[0].distanceTo(pts[1])) + ' (horizontal ' + fmtLen(Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z)) + ', alto ' + fmtLen(Math.abs(pts[1].y - pts[0].y)) + ').'); }
    else { medidas.push({ tipo: 'ang', v: pts[0], a: pts[1], b: pts[2] }); }
    etqVivas = []; ocultarInferencia();
  }
  actualizarMedidas();
}
function etiquetasMedidas() {
  const out = window.OOProductividad ? OOProductividad.etiquetas() : []; /* (2.1 pro f5) áreas medidas */
  for (const md of medidas) {
    if (md.tipo === 'dist') out.push({ p: md.a.clone().add(md.b).multiplyScalar(0.5), t: fmtLen(md.a.distanceTo(md.b)), c: 'medida' });
    else { const a = md.a.clone().sub(md.v), b = md.b.clone().sub(md.v); const ang = a.angleTo(b) / DEG; out.push({ p: md.v.clone(), t: fmt(ang, 1) + '°', c: 'medida' }); }
  }
  return out;
}
/* colocar objetos del catálogo */
function itemPorId(id) { const it = ITEMS.find(x => x.id === id); if (it) return it; for (const f of fuentesItems) { const x = f(id); if (x) return x; } const c = efectivos('componentes').get(id); if (c) return { id, n: c.nombre, cat: 'componentes', tipo: 'copia', datos: { sx: c.d0[0], sy: c.d0[1], sz: c.d0[2], d0: c.d0, partes: c.partes, componente: c.nombre, prefab: id } }; return null; } /* (editor v2) prefab: copia enlazada (prefabs.js) */
function iniciarColocar(id) { const it = itemPorId(id); if (!it) return; params.colocar.item = id; ponerHerramienta('colocar'); renderCatalogo(); }
function calcColocar(e) {
  const it = itemPorId(params.colocar.item); if (!it) return null;
  const d = clon(it.datos); const h = pickEvento(e); let p, giro = params.colocar.giro, pegado = false;
  const prof = tipoBase(it.tipo) === 'copia' ? (d.d0[1] > 0 ? 0 : 0) : 0;
  if (h && Math.abs(h.normal.y) < 0.3 && h.malla !== 'sph' && h.malla !== 'forma') {
    const n = h.normal.clone(); n.y = 0; n.normalize(); const sz = +d.sz || 0.5;
    const base = new V3().setFromMatrixPosition(h.mat).y - 0.5 * (Math.abs(h.mat.elements[1]) + Math.abs(h.mat.elements[5]) + Math.abs(h.mat.elements[9]));
    p = h.point.clone().addScaledVector(n, sz / 2 + 0.01 + prof); p.y = Math.max(base, 0); giro = Math.atan2(n.x, n.z) / DEG; pegado = true;
    if (tipoBase(it.tipo) === 'coche' || tipoBase(it.tipo) === 'trailer' || tipoBase(it.tipo) === 'contenedor') giro -= 90;
  } else if (h && h.normal.y > 0.6) p = h.point.clone(); else p = puntoPlano(e, 0);
  if (!p) return null; if (!pegado) ajustarRejilla(p);
  if (tipoBase(it.tipo) === 'copia') p.y += (d.d0 ? 0 : 0);
  Object.assign(d, { x: p.x, y: p.y, z: p.z, giroY: giro });
  if (tipoBase(it.tipo) === 'copia') { d.origen = 'centro'; d.y = p.y + d.d0[1] / 2; }
  return { tipo: it.tipo, datos: d, pegado };
}
function moverColocar(e) {
  const c = calcColocar(e); if (!c) { limpiarPrevia(); return; }
  const parts = partesMundo({ tipo: c.tipo, datos: c.datos, fotos: [] }); const box = new THREE.Box3();
  for (const pt of parts) { if (!pt.m) continue; const el = pt.m.elements; if (pt.f === 't' || pt.f === 'poly') continue; const hx = 0.5 * (Math.abs(el[0]) + Math.abs(el[4]) + Math.abs(el[8])), hy = 0.5 * (Math.abs(el[1]) + Math.abs(el[5]) + Math.abs(el[9])), hz = 0.5 * (Math.abs(el[2]) + Math.abs(el[6]) + Math.abs(el[10])); box.expandByPoint(_v.set(el[12] - hx, el[13] - hy, el[14] - hz)); box.expandByPoint(_v.set(el[12] + hx, el[13] + hy, el[14] + hz)); }
  const mal = chocaCaja(box.expandByScalar(-0.02), null);
  const av = !mal && window.OOAnclajes ? OOAnclajes.avisoColocar(c.tipo, c.datos, box) : null; /* (2.1 pro) amarillo: sin apoyo o medio fuera de su soporte */
  mostrarPrevia(c.tipo, c.datos, mal || (av && av.aviso ? 'aviso' : false)); colocarUlt = c; colocarUlt.mal = mal; colocarUlt.aviso = av && av.aviso;
  etqVivas = [{ p: new V3(c.datos.x, box.max.y + 0.4, c.datos.z), t: (itemPorId(params.colocar.item) || {}).n + (mal ? ' · choca' : '') + (c.pegado ? ' · pegado a pared' : '') + (av && av.texto ? ' · ' + av.texto : ''), c: mal ? 'cota' : 'vivo' }];
}
let colocarUlt = null;
function colocarAqui(e) { if (e) moverColocar(e); const c = colocarUlt; if (!c) return; const id = crearNuevo(c.tipo, c.datos); if (id && c.mal) pista('Colocado, pero choca con otro objeto (en rojo).'); }

/* ====================== capas, grupos, componentes, portapapeles ====================== */
function renderCapas() {
  const l = capasLista();
  if (!l.some(c => c.nombre === capaActiva)) capaActiva = 'General';
  $('#capas').innerHTML = l.map(c => `<li class="capa${c.nombre === capaActiva ? ' activa' : ''}"><span class="color" style="background:${esc(c.color || '#8a929c')}"></span><span class="nom"><button data-a="capa-activa" data-v="${esc(c.nombre)}" title="Hacer activa" style="border:0;background:transparent;padding:0;min-height:0;text-align:left">${esc(c.nombre)}${c.nombre === capaActiva ? ' <small>(activa)</small>' : ''}</button></span><label title="Mostrar"><input type="checkbox" data-capa="visible" data-v="${esc(c.nombre)}" ${c.visible !== false ? 'checked' : ''}> ver</label><label title="Bloquear"><input type="checkbox" data-capa="bloqueada" data-v="${esc(c.nombre)}" ${c.bloqueada ? 'checked' : ''}> bloq.</label>${c.nombre !== 'General' ? `<button data-a="capa-borrar" data-v="${esc(c.nombre)}" title="Quitar capa (sus objetos pasan a General)">&times;</button>` : ''}</li>`).join('');
}
function idCapa(nombre) { return 'capa-' + String(nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40); }
function guardarCapa(nombre, cambios) { const c = capaInfo(nombre); const id = c.id && c.id !== 'general' ? c.id : idCapa(nombre); const base = { nombre, color: c.color || '#8a929c', visible: c.visible !== false, bloqueada: !!c.bloqueada, orden: c.orden || (nombre === 'General' ? 0 : Date.now() % 1e7), creado: c.creado || ahora() }; guardarCol('capas', id, Object.assign(base, cambios)); }
function moverACapa(nombre) { const lista = []; for (const k of sel) if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); if (o) lista.push(docActualizado(o, { capa: nombre })); } guardar(lista); pista(lista.length + ' objeto(s) movidos a la capa «' + nombre + '».'); }
function agrupar() {
  if (sel.length < 2) { pista('Selecciona al menos dos cosas para agrupar.'); return; }
  const id = 'grp-' + mapa + '-' + Date.now().toString(36); const n = [...efectivos('grupos').values()].filter(g => g && g.mapa === mapa).length + 1;
  guardarCol('grupos', id, { mapa, nombre: 'Grupo ' + n, miembros: sel.slice(), capa: capaActiva, creado: ahora(), autor }); pista('Grupo creado: un clic selecciona todo; Ctrl+clic, una sola pieza.');
}
function desagrupar() {
  const gids = new Set(sel.map(k => grupoDe.get(k)).filter(Boolean));
  if (gids.size) { for (const g of gids) guardarCol('grupos', g, null); pista('Grupo deshecho.'); return; }
  const fs = new Set(sel.map(autoActivo).filter(Boolean).map(g => g.firma)); if (!fs.size) { pista('La selección no está en ningún grupo.'); return; }
  for (const f of fs) guardarCol('grupos', 'sinauto-' + mapa + '-' + f, { mapa, sin_auto: f, creado: ahora(), autor });
  pista('Objeto desagrupado: ahora cada pieza se selecciona por separado. Para juntarlas otra vez, pulsa «Volver a agrupar».');
}
function reagruparAuto() { const fs = new Set(); for (const k of sel) { const a = autoDe.get(k); if (a != null && sinAuto.has(autos[a].firma)) fs.add(autos[a].firma); } for (const f of fs) guardarCol('grupos', 'sinauto-' + mapa + '-' + f, null); if (fs.size) pista('Objeto reagrupado: un clic lo coge entero.'); }
function partesSeleccion(keys) {
  const mats = []; const cols2 = [];
  for (const k of keys) {
    if (k[0] === 'p') { const z = P[+k.slice(1)]; if (!z || z.cat === 'txt') continue; for (const m of matricesEntidad(k)) { mats.push([m, '#' + z.c.getHexString(), z.mesh]); } }
    else { const o = nuevos.get(k.slice(1)); if (!o) continue; for (const pt of o.partes || []) { if (pt.f === 't' || pt.f === 'poly' || !pt.m) continue; mats.push([pt.m, pt.c || '#cccccc', mallaDe(pt)]); } }
  }
  if (!mats.length) return null;
  const c = new V3(); const box = new THREE.Box3();
  for (const [m] of mats) { _v.setFromMatrixPosition(m); c.add(_v); } c.multiplyScalar(1 / mats.length);
  const partes = mats.map(([m, col, mesh]) => { m.decompose(_v, _q, _s); const r = Math.max(_s.x, _s.y, _s.z) / 2; box.expandByPoint(_v2.copy(_v).sub(c).addScalar(r)); box.expandByPoint(_v2.copy(_v).sub(c).addScalar(-r)); return { f: mesh === 'sph' ? 's' : mesh === 'luz' ? 'l' : /^cyl/.test(mesh) ? 'c' : 'b', p: [r3(_v.x - c.x), r3(_v.y - c.y), r3(_v.z - c.z)], s: [r3(_s.x), r3(_s.y), r3(_s.z)], q: [_q.x, _q.y, _q.z, _q.w].map(v => Math.round(v * 1e5) / 1e5), c: col, t: mesh === 'boxT' || mesh === 'cylT' }; });
  const sz = box.getSize(new V3()); return { c, partes, d0: [r3(Math.max(0.05, sz.x)), r3(Math.max(0.05, sz.y)), r3(Math.max(0.05, sz.z))] };
}
function plantillas(keys) {
  const refs = keys.filter(k => k[0] === 'p'); const out = [];
  if (refs.length) { const ps = partesSeleccion(refs); if (ps) out.push({ tipo: 'copia', datos: { x: ps.c.x, y: ps.c.y, z: ps.c.z, giroY: 0, sx: ps.d0[0], sy: ps.d0[1], sz: ps.d0[2], d0: ps.d0, partes: ps.partes, copia_de: refs.map(k => +k.slice(1)), origen: 'centro' } }); }
  for (const k of keys) if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); if (o && tipoBase(o.tipo) !== 'nota') out.push({ tipo: o.tipo, datos: clon(o.datos) }); }
  return out;
}
function pegarPlantillas(items, destino) {
  if (!items || !items.length) return;
  const c = new V3(); items.forEach(it => c.add(new V3(+it.datos.x, 0, +it.datos.z))); c.multiplyScalar(1 / items.length);
  const off = destino ? new V3(destino.x - c.x, 0, destino.z - c.z) : new V3(2, 0, 0);
  const lista = [], claves = [];
  items.forEach((it, j) => { const d = clon(it.datos); d.x = +d.x + off.x; d.z = +d.z + off.z; if (d.muro != null) delete d.muro; const id = nuevoId() + j; claves.push('n' + id); lista.push({ id, data: docNuevo(id, it.tipo, d) }); });
  guardar(lista); seleccionar(claves);
}
function duplicar() { const it = plantillas(sel); if (!it.length) return; pegarPlantillas(it, null); pista('Copia creada 2 m al este.'); }
function copiar() { const it = plantillas(sel); if (!it.length) { pista('Nada que copiar.'); return; } portapapeles = it; pista('Copiado: ' + sel.length + ' objeto(s). Ctrl+V para pegar donde está el ratón.'); }
function pegar() { if (!portapapeles) { pista('El portapapeles está vacío.'); return; } let dest = null; if (ultimoRaton) dest = puntoSuelo(ultimoRaton); pegarPlantillas(portapapeles, dest); }
function guardarComponente() {
  const ps = partesSeleccion(sel); if (!ps) return;
  abrirModal(`<div class="cab">Guardar como componente</div><div class="cont"><label class="campo"><span>Nombre del componente</span><input type="text" id="nomComp" data-foco value="Componente ${[...efectivos('componentes').keys()].length + 1}"></label><p class="ayuda">Quedará en el catálogo, en «Mis componentes», para colocarlo otra vez.</p></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Guardar</button></div>`).then(ok => {
    if (ok !== true) return;
  });
  setTimeout(() => { const i = $('#nomComp'); if (i) { i.focus(); i.select(); } }, 30);
  compPendiente = ps;
}
let compPendiente = null;
function borrarSeleccionGuia() { for (const [id, g] of efectivos('guias')) if (g && g.mapa === mapa) guardarCol('guias', id, null); }
function renderGuias() {
  while (grupoGuias.children.length) { const c = grupoGuias.children[0]; grupoGuias.remove(c); c.geometry.dispose(); }
  const mat = new THREE.LineDashedMaterial({ color: 0x7b1fa2, dashSize: 1, gapSize: 0.6, transparent: true, opacity: 0.8, depthTest: false });
  for (const [, g] of efectivos('guias')) {
    if (!g || g.mapa !== mapa) continue; const L = 1500;
    const a = g.dir === 'x' ? new V3(g.x - L, 0.08, g.z) : new V3(g.x, 0.08, g.z - L), b = g.dir === 'x' ? new V3(g.x + L, 0.08, g.z) : new V3(g.x, 0.08, g.z + L);
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat); l.computeLineDistances(); l.renderOrder = 20; l.frustumCulled = false; grupoGuias.add(l);
  }
  sucio = true;
}

/* ====================== etiquetas HTML, rejilla, minimapa, brújula ====================== */
const etqEl = $('#etiquetas'); const etqPool = [];
function dibujarEtiquetas() {
  const r = dom.getBoundingClientRect(); const lst = [];
  if (vista !== 'caminar') { lst.push(...etqCotas); lst.push(...etiquetasMedidas()); }
  lst.push(...etqVivas);
  if (AJ.etiquetas && vista !== 'caminar' && !(window.OOPlano && OOPlano.activo())) { /* (2.1) en el plano 2D los nombres van en su lienzo, sin montarse */
    /* (2.1) los nombres de zona (secciones del código del mapa, p. ej. «Sistemas») son una ayuda de vista general: en 3D solo de lejos,
       y no flotan sobre el techo cuando la cámara está a la altura de la fachada */
    for (const z of zonas) { if (vista === '3d' && cam.position.distanceTo(z.p) < 90) continue; lst.push({ p: z.p, t: z.nombre, c: 'zona' }); }
    for (const o of nuevos.values()) { if (tipoBase(o.tipo) !== 'habitacion' || !o.partes || !o.partes.length) continue; const d = o.datos; lst.push({ p: new V3(d.x, (+d.y || 0) + 0.3, d.z), t: (d.nombre ? d.nombre + ' · ' : '') + fmt(+d.area || 0, 1) + ' m²', c: 'hab' }); }
  }
  let n = 0;
  for (const it of lst) {
    _v.copy(it.p).project(cam); if (_v.z > 1 || _v.z < -1) continue;
    const x = (_v.x + 1) / 2 * r.width, y = (1 - _v.y) / 2 * r.height; if (x < -50 || y < -20 || x > r.width + 50 || y > r.height + 20) continue;
    if (it.p.y > clip.constant + 2 && it.c === 'zona') continue;
    let el = etqPool[n]; if (!el) { el = document.createElement('div'); etqEl.appendChild(el); etqPool.push(el); }
    if (el.textContent !== it.t) el.textContent = it.t; const cl = 'etq3d ' + (it.c || ''); if (el.className !== cl) el.className = cl;
    el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-50%)`; el.style.display = ''; n++;
    if (n > 120) break;
  }
  for (let k = n; k < etqPool.length; k++) etqPool[k].style.display = 'none';
}
function dibujarRejilla() {
  const cv = $('#rejilla'), g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
  if (vista !== 'planta' || !verRejilla || (window.OOPlano && OOPlano.activo())) return; /* (2.1) el plano 2D dibuja su propia rejilla */
  const cs = getComputedStyle(document.documentElement);
  const c1 = cs.getPropertyValue('--rej').trim() || 'rgba(0,0,0,.12)', c2 = cs.getPropertyValue('--rej2').trim() || 'rgba(0,0,0,.3)', ct = cs.getPropertyValue('--rejtxt').trim() || '#333';
  const hw = (camO.right - camO.left) / 2 / camO.zoom, hh = (camO.top - camO.bottom) / 2 / camO.zoom, cx = camO.position.x, cz = camO.position.z;
  const ppm = W / (2 * hw), dpr = W / Math.max(1, cv.clientWidth);
  let paso = 1; while (paso * ppm < 7 * dpr) paso *= paso === 1 ? 10 : 5;
  const etq = [1, 5, 10, 50, 100, 250, 500, 1000, 2500].find(s => s >= paso && s * ppm >= 70 * dpr) || 5000;
  const sx = X => (X - cx) / (2 * hw) * W + W / 2, sz = Z => (Z - cz) / (2 * hh) * H + H / 2;
  const fuerte = paso >= 10 ? 50 : 10;
  for (let X = Math.floor((cx - hw) / paso) * paso; X <= cx + hw; X += paso) { const x = Math.round(sx(X)) + 0.5; const f = Math.abs(X % fuerte) < 1e-6; g.strokeStyle = f ? c2 : c1; g.lineWidth = (f ? 1.4 : 1) * dpr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let Z = Math.floor((cz - hh) / paso) * paso; Z <= cz + hh; Z += paso) { const y = Math.round(sz(Z)) + 0.5; const f = Math.abs(Z % fuerte) < 1e-6; g.strokeStyle = f ? c2 : c1; g.lineWidth = (f ? 1.4 : 1) * dpr; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.font = (11 * dpr) + 'px "IBM Plex Mono", monospace'; g.fillStyle = ct; g.textBaseline = 'bottom'; g.textAlign = 'center';
  for (let X = Math.ceil((cx - hw) / etq) * etq; X <= cx + hw; X += etq) g.fillText('X ' + fmt(X, 0), sx(X), H - 6 * dpr);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let Z = Math.ceil((cz - hh) / etq) * etq; Z <= cz + hh; Z += etq) g.fillText('Z ' + fmt(Z, 0), 4 * dpr, sz(Z));
}
let mmFondo = null, mmProg = 0;
function programarMinimapa() { clearTimeout(mmProg); mmProg = setTimeout(minimapaFondo, 400); }
function minimapaFondo() {
  if (!D || !AJ.minimapa) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 340; const g = cv.getContext('2d');
  const L = limitesMapa, w = L.max.x - L.min.x, h = L.max.z - L.min.z, esc2 = 340 / Math.max(w, h), ox = (340 - w * esc2) / 2, oz = (340 - h * esc2) / 2;
  g.fillStyle = '#5c7d45'; g.fillRect(0, 0, 340, 340);
  for (const k of ['boxO', 'boxH', 'cylO', 'sph']) {
    const m = M[k]; if (!m) continue; const bb = m.bb, n = m.mesh.count, col = m.mesh.instanceColor.array;
    for (let s = 0; s < n; s++) { const o = s * 6; if (bb[o] > bb[o + 3]) continue; if (bb[o + 4] - bb[o + 1] < 0.02 && bb[o + 4] < -0.5) continue; g.fillStyle = 'rgb(' + Math.round(col[s * 3] * 255) + ',' + Math.round(col[s * 3 + 1] * 255) + ',' + Math.round(col[s * 3 + 2] * 255) + ')'; g.fillRect(ox + (bb[o] - L.min.x) * esc2, oz + (bb[o + 2] - L.min.z) * esc2, Math.max(1, (bb[o + 3] - bb[o]) * esc2), Math.max(1, (bb[o + 5] - bb[o + 2]) * esc2)); }
  }
  mmFondo = { cv, esc: esc2, ox, oz }; sucio = true;
}
function dibujarMinimapa() {
  const el = $('#minimapa'); el.hidden = !AJ.minimapa; if (!AJ.minimapa || !mmFondo) return;
  const g = el.getContext('2d'); g.clearRect(0, 0, 340, 340); g.drawImage(mmFondo.cv, 0, 0);
  const L = limitesMapa, f = mmFondo; const aMm = (x, z) => [f.ox + (x - L.min.x) * f.esc, f.oz + (z - L.min.z) * f.esc];
  g.strokeStyle = '#ff7a00'; g.fillStyle = 'rgba(255,122,0,.25)'; g.lineWidth = 3;
  if (vista === 'planta') { const hw = (camO.right - camO.left) / 2 / camO.zoom, hh = (camO.top - camO.bottom) / 2 / camO.zoom; const [x0, z0] = aMm(camO.position.x - hw, camO.position.z - hh), [x1, z1] = aMm(camO.position.x + hw, camO.position.z + hh); g.fillRect(x0, z0, x1 - x0, z1 - z0); g.strokeRect(x0, z0, x1 - x0, z1 - z0); }
  else { const t = vista === 'caminar' ? camP.position : ctl3.target; const dir = new V3(); camP.getWorldDirection(dir); const yaw = Math.atan2(dir.x, dir.z); const [x, z] = aMm(t.x, t.z); g.beginPath(); g.moveTo(x, z); g.arc(x, z, 34, Math.PI / 2 - yaw - 0.5, Math.PI / 2 - yaw + 0.5); g.closePath(); g.fill(); g.beginPath(); g.arc(x, z, 6, 0, Math.PI * 2); g.fillStyle = '#ff7a00'; g.fill(); }
}
function minimapaIr(e) {
  if (!mmFondo) return; const r = $('#minimapa').getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * 340, pz = (e.clientY - r.top) / r.height * 340;
  const L = limitesMapa, f = mmFondo; const x = L.min.x + (px - f.ox) / f.esc, z = L.min.z + (pz - f.oz) / f.esc;
  if (vista === 'planta') { const dx = x - camO.position.x, dz = z - camO.position.z; camO.position.x += dx; camO.position.z += dz; ctlP.target.x += dx; ctlP.target.z += dz; ctlP.update(); }
  else if (vista === 'caminar') { camP.position.x = x; camP.position.z = z; andar.cambio = true; }
  else { const dx = x - ctl3.target.x, dz = z - ctl3.target.z; ctl3.target.x += dx; ctl3.target.z += dz; camP.position.x += dx; camP.position.z += dz; ctl3.update(); }
  sucio = true;
}
function actualizarBrujula() { const dir = new V3(); cam.getWorldDirection(dir); let ang = 0; if (vista !== 'planta') ang = Math.atan2(dir.x, -dir.z) / DEG; $('#aguja').setAttribute('transform', 'rotate(' + (-ang).toFixed(1) + ' 30 30)'); }

/* luz del sol, sombras y fondo */
function actualizarSol() {
  const t = vista === 'planta' ? ctlP.target : (vista === 'caminar' ? camP.position : ctl3.target);
  const dist = vista === 'planta' ? 100 / camO.zoom : camP.position.distanceTo(ctl3.target);
  const S = Math.min(260, Math.max(40, dist * 0.9));
  sol.target.position.copy(t); sol.position.copy(t).add(solDir.clone().multiplyScalar(300));
  const sc = sol.shadow.camera; if (Math.abs(sc.right - S) > 1) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 10; sc.far = 800; sc.updateProjectionMatrix(); }
  if (vista !== 'planta') { cielo.position.copy(camP.position); }
}
function aplicarFondo() {
  const arriba = new THREE.Color(AJ.fondo || '#a9c8e6'), hor = arriba.clone().lerp(new THREE.Color('#f2f4f6'), 0.6);
  cieloMat.uniforms.arriba.value.copy(arriba); cieloMat.uniforms.horizonte.value.copy(hor);
  if (vista === 'planta') { cielo.visible = false; scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--view').trim() || '#dde2e7'); scene.fog = null; }
  else { cielo.visible = true; scene.background = hor.clone(); scene.fog = new THREE.Fog(hor.clone(), Math.min(700, distDibujo * 0.25), distDibujo); }
  if (Math.abs(camP.far - Math.max(600, distDibujo * 2)) > 1) { camP.far = Math.max(600, distDibujo * 2); camP.updateProjectionMatrix(); }
  sucio = true; avisar('fondo');
}
function aplicarAjustes() {
  const tema = AJ.tema; if (tema === 'claro') document.documentElement.setAttribute('data-theme', 'light'); else if (tema === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
  const dpr = window.devicePixelRatio || 1; renderer.setPixelRatio((AJ.calidad === 'baja' ? 1 : AJ.calidad === 'alta' ? Math.min(dpr, 2) : Math.min(dpr, 1.5)) * (+AJ.resolucion || 1));
  distDibujo = +AJ.distancia || 2800;
  const somb = AJ.sombras && AJ.calidad !== 'baja'; renderer.shadowMap.enabled = somb; sol.castShadow = somb;
  const tam = AJ.calidad === 'alta' ? 4096 : 2048; if (sol.shadow.mapSize.x !== tam) { sol.shadow.mapSize.set(tam, tam); if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null; } }
  for (const k in M) M[k].mesh.material.needsUpdate = true;
  ctl3.rotateSpeed = AJ.sens * (AJ.invertirGiro ? -1 : 1); ctl3.panSpeed = AJ.sens; ctlP.panSpeed = AJ.sens;
  aplicarAjusteGizmo(); aplicarFondo(); ajustarTam(); actualizarContorno();
  $('#minimapa').hidden = !AJ.minimapa; if (AJ.minimapa && !mmFondo) minimapaFondo();
  if (typeof syncBarraVista === 'function') syncBarraVista(); escalaUlt = '';
  sucio = true;
}

/* bucle */
let tPrev = performance.now();
function bucle(t) {
  requestAnimationFrame(bucle);
  const dt = (t - tPrev) / 1000; tPrev = t;
  if (vista === 'caminar' && moverAndar(dt)) sucio = true;
  if (moverCamTeclas(dt)) sucio = true;
  if (animar(t)) sucio = true;
  if (sucio && vista === '3d' && !anim) limitarCamara();
  if (!sucio) return; sucio = false;
  actualizarSol();
  renderer.render(scene, cam);
  dibujarRejilla(); dibujarEtiquetas(); dibujarMinimapa(); actualizarBrujula(); dibujarEscala();
}
requestAnimationFrame(bucle);

/* ====================== selección con el ratón ====================== */
function clicSeleccion(e, shift) {
  const h = pickSel(e);
  if (!h) { if (!shift) seleccionar([]); return; }
  let keys = [h.key];
  if (h.key[0] === 't') { const mk = notasMarcas.find(m => 't' + m.docId === h.key); keys = mk ? mk.refs.map(r => 'p' + r) : []; }
  if (!(e.ctrlKey || e.metaKey)) keys = expandirGrupos(keys);
  if (shift) { const s = new Set(sel); const todos = keys.every(k => s.has(k)); for (const k of keys) { if (todos) s.delete(k); else s.add(k); } seleccionar([...s]); }
  else seleccionar(keys);
}
const rectEl = $('#rect');
function seleccionRect(x0, y0, x1, y1, aditiva) {
  const r = dom.getBoundingClientRect(); const cruce = x1 < x0;
  const ax = Math.min(x0, x1) - r.left, bx = Math.max(x0, x1) - r.left, ay = Math.min(y0, y1) - r.top, by = Math.max(y0, y1) - r.top;
  const enc = new Set(); cam.updateMatrixWorld(); const pv = new M4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const proy = (bb, o) => { let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity; for (let c = 0; c < 8; c++) { _v.set(c & 1 ? bb[o + 3] : bb[o], c & 2 ? bb[o + 4] : bb[o + 1], c & 4 ? bb[o + 5] : bb[o + 2]).applyMatrix4(pv); if (_v.z > 1) return null; const x = (_v.x + 1) / 2 * r.width, y = (1 - _v.y) / 2 * r.height; mx = Math.min(mx, x); Mx = Math.max(Mx, x); my = Math.min(my, y); My = Math.max(My, y); } return [mx, my, Mx, My]; };
  for (const k in M) {
    const m = M[k], bb = m.bb, n = m.mesh.count;
    for (let s = 0; s < n; s++) {
      const o = s * 6; if (bb[o] > bb[o + 3]) continue; const key = m.owner[s]; if (!key || key[0] === 't' || !seleccionable(key)) continue;
      if (bb[o + 1] > clip.constant) continue;
      if (cruce && (bb[o + 3] - bb[o] > 80 || bb[o + 5] - bb[o + 2] > 80)) continue;
      const q = proy(bb, o); if (!q) continue;
      if (cruce ? (q[2] >= ax && q[0] <= bx && q[3] >= ay && q[1] <= by) : (q[0] >= ax && q[2] <= bx && q[1] >= ay && q[3] <= by)) enc.add(key);
    }
  }
  if (!cruce) { for (const k of [...enc]) if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); /* el objeto entero debe quedar dentro */ if (o && o.slots && o.slots.some(([mk, s]) => { const q = proy(M[mk].bb, s * 6); return !q || !(q[0] >= ax && q[2] <= bx && q[1] >= ay && q[3] <= by); })) enc.delete(k); } }
  let keys = expandirGrupos([...enc]);
  if (aditiva) keys = [...new Set([...sel, ...keys])];
  seleccionar(keys); pista(keys.length + ' seleccionado(s) por ' + (cruce ? 'cruce' : 'ventana') + '.');
}
/* arrastre directo de lo seleccionado (estilo Sims) */
let arrDirecto = null;
function iniciarArrastreDirecto(e, h) {
  if (e.altKey) { const it = plantillas(sel); if (!it.length) return false; pegarPlantillas(it, { x: (it.reduce((a, b) => a + +b.datos.x, 0) / it.length), z: (it.reduce((a, b) => a + +b.datos.z, 0) / it.length) }); }
  const y = h.point.y; const p0 = puntoPlano(e, y); if (!p0) return false;
  arrDirecto = { y, p0, ents: sel.map(k => [k, estadoEnt(k)]), dup: e.altKey }; tc.detach(); return true;
}
function moverArrastreDirecto(e) {
  const A = arrDirecto; const p = puntoPlano(e, A.y); if (!p) return;
  let dx = p.x - A.p0.x, dz = p.z - A.p0.z; if (AJ.ajuste) { dx = Math.round(dx / AJ.paso) * AJ.paso; dz = Math.round(dz / AJ.paso) * AJ.paso; }
  if (window.OOTransformar) [dx, dz] = OOTransformar.restringirDelta(dx, dz); /* (2.1 pro f5) ejes bloqueados */
  const algunMuro = A.ents.some(([k]) => k[0] === 'n' && ['muro', 'puerta', 'ventana'].includes(tipoBase((nuevos.get(k.slice(1)) || {}).tipo)));
  for (const [k, st] of A.ents) ponerEstado(k, st.p.clone().add(new V3(dx, 0, dz)), st.q, st.s, algunMuro);
  if (algunMuro) renderTodo(); avisar('arrastre', A.ents.map(x => x[0])); comprobarSolapeSel(); marcarActualizado(); actualizarContorno(); actualizarValoresPanel();
  etqVivas = [{ p: new V3(A.ents.length ? estadoEnt(A.ents[0][0]).p.x : p.x, A.y + 1, A.ents.length ? estadoEnt(A.ents[0][0]).p.z : p.z), t: 'ΔX ' + fmt(dx) + ' · ΔZ ' + fmt(dz), c: 'vivo' }];
}
function finArrastreDirecto() { const A = arrDirecto; arrDirecto = null; etqVivas = []; colocarPivote(); if (A && A.ents.length) confirmarEdicion(); }

/* ====================== herramientas: eventos ====================== */
function herrDown(e) {
  const h = herramienta;
  if (herrPropias[h]) { if (herrPropias[h].down) herrPropias[h].down(e); return; }
  if (h === 'suelo' || (h === 'habitacion' && params.habitacion.modo !== 'poligono')) { const inf = inferir(e, null); if (inf) estRect = { a: inf.p.clone() }; }
  else if (h === 'empujar') { if (!empujarInicio(e)) empEst = null; }
  else if (h === 'calco-mover') { const c = calcoActual(); if (!c || c.bloqueado) { pista('El calco está bloqueado.'); return; } const p = puntoPlano(e, 0); if (p) calcoArr = { id: calcoSel, datos: Object.assign({}, c), p0: p, x0: +c.x || 0, z0: +c.z || 0 }; }
}
let estRect = null, ultHover = 0;
function herrMove(e) {
  const h = herramienta; const t = performance.now();
  if (herrPropias[h]) { if (herrPropias[h].move) herrPropias[h].move(e); return; }
  if (h === 'pared') { const inf = inferir(e, paredEst && paredEst.ini, paredEst ? { y: paredEst.ini.y } : null); if (paredEst && inf) { const dm = datosMuro(paredEst.ini, inf.p); mostrarPrevia('muro', dm); etqVivas = [{ p: paredEst.ini.clone().add(inf.p).multiplyScalar(0.5).setY(inf.p.y + params.pared.sy + 0.3), t: fmtLen(dm.sx) + ' · ' + angTxt(paredEst.ini, inf.p), c: 'vivo' }]; } }
  else if (h === 'habitacion' && params.habitacion.modo === 'poligono') { const inf = inferir(e, habEst && habEst.puntos[habEst.puntos.length - 1], habEst ? { y: habEst.puntos[0].y } : null); if (habEst && inf) { const pts = habEst.puntos.map(p => [p.x, p.z]).concat([[inf.p.x, inf.p.z]]); if (pts.length >= 3) { const dh = datosHabitacion(pts, habEst.puntos[0].y); mostrarPrevia('habitacion', dh); etqVivas = [{ p: new V3(dh.x, dh.y + 0.5, dh.z), t: fmt(dh.area, 1) + ' m²', c: 'vivo' }]; } else { mostrarPrevia('muro', Object.assign(datosMuro(habEst.puntos[0], inf.p), { sy: 0.05, sz: 0.08 })); etqVivas = [{ p: inf.p.clone().setY(inf.p.y + 0.4), t: fmtLen(habEst.puntos[0].distanceTo(inf.p)), c: 'vivo' }]; } } }
  else if ((h === 'suelo' || h === 'habitacion') && estRect) { const inf = inferir(e, estRect.a, { y: estRect.a.y }); if (!inf) return; const a = estRect.a, b = inf.p; const sx = Math.abs(b.x - a.x), sz = Math.abs(b.z - a.z); if (h === 'suelo') mostrarPrevia('calle', Object.assign({}, params.suelo, { x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2, giroY: 0, sx: Math.max(0.1, sx), sy: 0.05, sz: Math.max(0.1, sz) })); else { const esq = [[Math.min(a.x, b.x), Math.min(a.z, b.z)], [Math.max(a.x, b.x), Math.min(a.z, b.z)], [Math.max(a.x, b.x), Math.max(a.z, b.z)], [Math.min(a.x, b.x), Math.max(a.z, b.z)]]; if (sx > 0.1 && sz > 0.1) mostrarPrevia('habitacion', datosHabitacion(esq, a.y)); } etqVivas = [{ p: new V3((a.x + b.x) / 2, a.y + 0.5, (a.z + b.z) / 2), t: fmtLen(sx) + ' × ' + fmtLen(sz) + ' · ' + fmt(sx * sz, 1) + ' m²', c: 'vivo' }]; }
  else if (h === 'puerta' || h === 'ventana' || h === 'hueco') { if (t - ultHover < 40) return; ultHover = t; const d = colocarHueco(e, h); if (d) mostrarPrevia(h, d); else limpiarPrevia(); }
  else if (h === 'empujar' && empEst) empujarMover(e);
  else if (h === 'medir') { if (t - ultHover < 30) return; ultHover = t; if (params.medir.modo === 'guia') { inferir(e, null); return; } const p = puntoMedir(e); if (medirEst && p) { medirEst.cursor = p; const a = medirEst.puntos[medirEst.modo === 'angulo' ? 0 : medirEst.puntos.length - 1]; etqVivas = [{ p: a.clone().add(p).multiplyScalar(0.5), t: medirEst.modo === 'angulo' && medirEst.puntos.length === 2 ? fmt(medirEst.puntos[1].clone().sub(a).angleTo(p.clone().sub(a)) / DEG, 1) + '°' : fmtLen(a.distanceTo(p)), c: 'vivo' }]; actualizarMedidas(); } }
  else if (h === 'colocar') { if (t - ultHover < 30) return; ultHover = t; moverColocar(e); }
  else if (h === 'calco-mover' && calcoArr) { const p = puntoPlano(e, 0); if (p) { const c = calcoArr.datos; c.x = r3(calcoArr.x0 + p.x - calcoArr.p0.x); c.z = r3(calcoArr.z0 + p.z - calcoArr.p0.z); if (AJ.ajuste) { c.x = Math.round(c.x / AJ.paso) * AJ.paso; c.z = Math.round(c.z / AJ.paso) * AJ.paso; } actualizarMallaCalco(calcoArr.id, c); actualizarValoresCalco(c); } }
  else if (h === 'nota' || h === 'techo' || h === 'pintar') { /* sin vista previa */ }
}
function herrUp(e, mov) {
  const h = herramienta;
  if (herrPropias[h]) { if (herrPropias[h].up) herrPropias[h].up(e, mov); return; }
  if (h === 'pared') {
    if (mov > 6) return; const inf = inferir(e, paredEst && paredEst.ini, paredEst ? { y: paredEst.ini.y } : null); if (!inf) return;
    if (!paredEst) { paredEst = { ini: inf.p.clone(), primero: inf.p.clone(), n: 0 }; pista('Ahora haz clic donde termina el tramo.'); return; }
    if (Math.hypot(inf.p.x - paredEst.ini.x, inf.p.z - paredEst.ini.z) < 0.1) return;
    const id = crearNuevo('muro', datosMuro(paredEst.ini, inf.p), null, { unir: paredEst.n > 0 && false }); paredEst.n++;
    if (id) detectarHabitaciones(true, { muros: [id] });
    const cerrado = Math.hypot(inf.p.x - paredEst.primero.x, inf.p.z - paredEst.primero.z) < 0.05 && paredEst.n > 2;
    paredEst.ini = inf.p.clone(); limpiarPrevia(); etqVivas = [];
    if (cerrado) { terminarPared(); pista('Recinto cerrado.'); }
    return;
  }
  if (h === 'habitacion' && params.habitacion.modo === 'poligono') {
    if (mov > 6) return; const inf = inferir(e, habEst && habEst.puntos[habEst.puntos.length - 1], habEst ? { y: habEst.puntos[0].y } : null); if (!inf) return;
    if (!habEst) { habEst = { puntos: [inf.p.clone()] }; punto3D(inf.p); return; }
    if (habEst.puntos.length >= 3 && inf.p.distanceTo(habEst.puntos[0]) < Math.max(0.3, 10 * metrosPorPixel(inf.p))) { cerrarPoligonoHab(); return; }
    habEst.puntos.push(inf.p.clone()); return;
  }
  if (h === 'suelo' || h === 'habitacion') {
    if (!estRect) return; const a = estRect.a; estRect = null; limpiarPrevia(); etqVivas = []; ocultarInferencia();
    const inf = inferir(e, a, { y: a.y }); ocultarInferencia(); if (!inf) return; const b = inf.p;
    if (Math.abs(b.x - a.x) < 0.3 || Math.abs(b.z - a.z) < 0.3) { pista('Arrastra un rectángulo más grande (mantén pulsado mientras mueves).'); return; }
    if (h === 'suelo') { const id = crearNuevo('calle', Object.assign({}, params.suelo, { x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2, giroY: 0, sx: Math.abs(b.x - a.x), sy: 0.05, sz: Math.abs(b.z - a.z) })); if (id) seleccionar(['n' + id], { sinTab: true }); }
    else crearCuartoRect(a, b);
    return;
  }
  if (h === 'puerta' || h === 'ventana' || h === 'hueco') { if (mov > 6) return; const d = colocarHueco(e, h); if (!d) { pista('Haz clic justo sobre la cara vertical de una pared.'); return; } limpiarPrevia(); if (h === 'hueco') { delete d.color; delete d.hoja; } const id = crearNuevo(h, d); if (id && h === 'hueco') { seleccionar(['n' + id], { sinTab: true }); pista('Hueco abierto. Muévelo a lo largo de la pared o cambia sus medidas en el inspector.'); } return; }
  if (h === 'techo') { if (mov > 6) return; crearTecho(e); return; }
  if (h === 'pintar') { if (mov > 6) return; pintar(e); return; }
  if (h === 'empujar') { if (empEst) empujarFin(); return; }
  if (h === 'medir') { if (mov > 6) return; medirClic(e); return; }
  if (h === 'colocar') { if (mov > 6) return; colocarAqui(e); return; }
  if (h === 'calco-mover') { if (calcoArr) { const c = calcoArr.datos; calcoArr = null; guardarCol('calcos', calcoSel, Object.assign({}, c, { actualizado: ahora() })); } return; }
  if (h === 'calco-medida') {
    if (mov > 6 || !medidaCalco) return; const p = puntoPlano(e, 0); if (!p) return;
    medidaCalco.pts.push([p.x, p.z]); punto3D(p, 0xff8a00);
    if (medidaCalco.pts.length < 2) { pista('Ahora marca el otro extremo.'); return; }
    terminarMedidaCalco(); return;
  }
  if (h === 'calco-alinear') {
    if (mov > 6 || !alinear) return; const p = puntoSuelo(e); if (!p) return;
    alinear.mapa.push([p.x, p.z]); punto3D(p);
    if (alinear.mapa.length < alinear.img.length) { pista('Bien. Ahora marca el punto ' + (alinear.mapa.length + 1) + ' de ' + alinear.img.length + ' en el mapa.'); return; }
    terminarAlineado(); return;
  }
  if (h === 'nota') {
    if (mov > 6) return; const p = puntoSuelo(e); if (!p) return;
    const foto = params.nota.fotoPendiente; params.nota.fotoPendiente = null;
    const id = crearNuevo('nota', { x: p.x, y: p.y, z: p.z, giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 }, { fotos: foto ? [foto] : [] });
    ponerHerramienta('sel'); if (id) { seleccionar(['n' + id]); setTimeout(() => { const t = $('#notaTexto'); if (t) t.focus(); }, 50); }
  }
}
function ponerHerramienta(h, opt) {
  if (h === 'catalogo') { mostrarTab('catalogo', true); if (!params.colocar.item) { pista('Elige un objeto del catálogo de abajo (clic o arrástralo al mapa).'); h = 'sel'; } else h = 'colocar'; }
  if (herramienta === h && h !== 'sel' && h !== 'colocar' && !(opt && opt.forzar)) h = 'sel';
  if (herrPropias[herramienta] && herrPropias[herramienta].fin && herramienta !== h) herrPropias[herramienta].fin();
  herramienta = h; paredEst = null; habEst = null; estRect = null; calcoArr = null; empEst = null; medirEst = null; etqVivas = []; limpiarPrevia(); ocultarInferencia();
  if (h !== 'calco-alinear') alinear = null;
  if (h !== 'calco-medida') medidaCalco = null;
  configurarControles(); colocarPivote(); actualizarPista(); renderPanel(); actualizarMedidas();
  if (h !== 'sel' && h !== 'colocar' && !h.startsWith('calco')) mostrarTab('obj');
  dom.style.cursor = h === 'sel' ? '' : (h === 'pintar' ? 'cell' : 'crosshair');
  actualizarRail(); avisar('herramienta', h);
}
function configurarControles() {
  const herr = herramienta !== 'sel';
  ctl3.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  ctlP.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  ctl3.touches = herr ? { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  ctlP.touches = herr ? { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
}
let pistaTemp = null, pistaTimer = 0;
function pista(t) { pistaTemp = t; clearTimeout(pistaTimer); pistaTimer = setTimeout(() => { pistaTemp = null; actualizarPista(); }, 4500); actualizarPista(); }
function actualizarPista() {
  let t = pistaTemp;
  if (!t && AJ.ayudaHerr) {
    if (vista === 'caminar') t = andar.lock ? 'W A S D andar, Mayús correr, E puerta, clic elige lo que miras, G atraviesa paredes, F linterna. Tab o Esc suelta el ratón.' : (andar.sinLock ? 'Este navegador no dejó capturar el ratón: arrastra para mirar; clic sin arrastrar elige lo que miras. W A S D para andar, E abre puertas.' : PISTAS.caminar);
    else if (herramienta === 'nota' && params.nota.fotoPendiente) t = 'Clic en el mapa donde quieres anclar la foto.';
    else t = PISTAS[herramienta] || '';
  }
  $('#pista span').textContent = t; $('#pista').style.display = t ? '' : 'none';
}

/* ====================== menú contextual ====================== */
const menuEl = $('#menuCtx');
function abrirMenu(e) {
  const h = pickSel(e); const items = [];
  if (h && h.key[0] !== 't' && !selSet.has(h.key)) seleccionar(expandirGrupos([h.key]), { sinTab: true });
  const haySel = sel.length > 0;
  if (haySel) {
    items.push(['Encuadrar', 'F', 'encuadrar']);
    if (sel.some(k => k[0] === 'p' && P[+k.slice(1)].grp >= 0)) items.push(['Seleccionar grupo del mapa', '', 'grupo']);
    items.push(['Copiar', 'Ctrl+C', 'ctx-copiar'], ['Duplicar', 'Ctrl+D', 'duplicar']);
    if (sel.length > 1) items.push(['Agrupar', 'Ctrl+G', 'ctx-agrupar']);
    if (sel.some(k => grupoDe.has(k) || autoActivo(k))) items.push(['Desagrupar', 'Ctrl+Mayús+G', 'ctx-desagrupar']);
    items.push(['Guardar como componente', '', 'ctx-componente']);
    const o1 = sel.length === 1 && sel[0][0] === 'n' ? nuevos.get(sel[0].slice(1)) : null;
    if (o1 && tipoBase(o1.tipo) === 'habitacion') items.push(['Generar techo', '', 'ctx-techo']);
    items.push(['Pintar con ' + (MATERIALES[params.pintar.material] || {}).n, 'B', 'ctx-pintar']);
    if (sel.some(k => k[0] === 'n')) for (const c of capasLista()) items.push(['Mover a capa «' + c.nombre + '»', '', 'ctx-capa:' + c.nombre]);
    items.push(['Ocultar', '', 'ctx-ocultar'], null, ['Borrar', 'Supr', 'borrar']);
  }
  items.push(null);
  if (portapapeles) items.push(['Pegar aquí', 'Ctrl+V', 'ctx-pegar']);
  items.push(['Centrar la vista aquí', 'doble clic', 'ctx-centrar'], ['Nota aquí', 'N', 'ctx-nota'], ['Medir desde aquí', 'T', 'ctx-medir']);
  if (ocultos.size) items.push(['Mostrar lo ocultado (' + ocultos.size + ')', '', 'mostrar-ocultos']);
  menuEl.innerHTML = items.map((it, j) => it ? `<button role="menuitem" data-a="${esc(it[2])}">${esc(it[0])}${it[1] ? `<kbd>${esc(it[1])}</kbd>` : ''}</button>` : (j && items[j - 1] ? '<hr>' : '')).join('');
  menuEl.hidden = false; menuCtxEvento = { clientX: e.clientX, clientY: e.clientY, altKey: false };
  const w = menuEl.offsetWidth, hh = menuEl.offsetHeight; menuEl.style.left = Math.min(e.clientX, innerWidth - w - 6) + 'px'; menuEl.style.top = Math.min(e.clientY, innerHeight - hh - 6) + 'px';
  const f = menuEl.querySelector('button'); if (f) f.focus();
}
let menuCtxEvento = null;
function cerrarMenu() { menuEl.hidden = true; }
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target)) cerrarMenu(); }, true);

/* ====================== eventos de puntero ====================== */
let abajo = null;
dom.addEventListener('pointerdown', e => {
  dom.focus({ preventScroll: true }); cerrarMenu();
  if (vista === 'caminar') {
    if (!andar.lock && !andar.sinLock) { try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => { andar.sinLock = true; actualizarPista(); }); } catch (err) { andar.sinLock = true; actualizarPista(); } }
    andar.arr = { x: e.clientX, y: e.clientY }; return;
  }
  abajo = { x: e.clientX, y: e.clientY, b: e.button, tc: !!(tc.dragging || (tc.object && tc.axis)), shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, tipo: e.pointerType, modo: null, hit: null };
  if (e.button === 2 && AJ.orbitarCursor !== false) pivoteBajoCursor(e);
  if (e.button !== 0 || abajo.tc) return;
  if (herramienta !== 'sel') { herrDown(e); try { dom.setPointerCapture(e.pointerId); } catch (er) { } return; }
  if (e.pointerType === 'mouse') {
    const h = pickSel(e); abajo.hit = h;
    if (h && (selSet.has(h.key) || e.altKey)) { if (!selSet.has(h.key)) seleccionar(expandirGrupos([h.key]), { sinTab: true }); abajo.modo = 'mover?'; }
    else abajo.modo = 'rect?';
    try { dom.setPointerCapture(e.pointerId); } catch (er) { }
  }
});
let coordPend = null;
dom.addEventListener('pointermove', e => {
  ultimoRaton = { clientX: e.clientX, clientY: e.clientY };
  if (vista === 'caminar') { if (andar.lock) mirar(e.movementX || 0, e.movementY || 0); else if (andar.arr) { mirar(e.clientX - andar.arr.x, e.clientY - andar.arr.y); andar.arr = { x: e.clientX, y: e.clientY }; } return; }
  if (!coordPend) { coordPend = e; requestAnimationFrame(() => { const ev = coordPend; coordPend = null; const p = puntoPlano(ev, 0); $('#coords').textContent = p ? ('X: ' + fmt(p.x) + '   Y: ' + fmt(p.y) + '   Z: ' + fmt(p.z)) : ''; }); }
  if (abajo && abajo.b === 0 && herramienta === 'sel' && abajo.modo) {
    const mov = Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y);
    if (abajo.modo === 'rect?' && mov > 5) abajo.modo = 'rect';
    if (abajo.modo === 'mover?' && mov > 5) abajo.modo = iniciarArrastreDirecto(e, abajo.hit) ? 'mover' : null;
    if (abajo.modo === 'rect') { const x0 = Math.min(abajo.x, e.clientX), y0 = Math.min(abajo.y, e.clientY); const r = vistaEl.getBoundingClientRect(); rectEl.hidden = false; rectEl.classList.toggle('cruce', e.clientX < abajo.x); rectEl.style.left = (x0 - r.left) + 'px'; rectEl.style.top = (y0 - r.top) + 'px'; rectEl.style.width = Math.abs(e.clientX - abajo.x) + 'px'; rectEl.style.height = Math.abs(e.clientY - abajo.y) + 'px'; }
    if (abajo.modo === 'mover') moverArrastreDirecto(e);
    return;
  }
  if (herramienta !== 'sel') herrMove(e);
});
dom.addEventListener('pointerup', e => {
  if (vista === 'caminar') { andar.arr = null; return; }
  if (!abajo) return; const d = abajo; abajo = null;
  const mov = Math.hypot(e.clientX - d.x, e.clientY - d.y);
  if (d.b === 2) { if (mov < 5) { if (herramienta === 'pared' && paredEst) terminarPared(); else if (herramienta === 'habitacion' && habEst) cerrarPoligonoHab(); else abrirMenu(e); } return; }
  if (d.tc || d.b !== 0) return;
  if (herramienta === 'sel') {
    if (d.modo === 'rect') { rectEl.hidden = true; seleccionRect(d.x, d.y, e.clientX, e.clientY, d.shift); return; }
    if (d.modo === 'mover') { finArrastreDirecto(); return; }
    if (mov < 6) clicSeleccion(e, d.shift || e.shiftKey);
  } else herrUp(e, mov);
});
dom.addEventListener('pointerleave', () => { $('#coords').textContent = ''; });
dom.addEventListener('dblclick', e => {
  if (herramienta === 'pared') { terminarPared(); return; }
  if (herramienta === 'habitacion' && habEst) { cerrarPoligonoHab(); return; }
  if (herramienta !== 'sel' || vista === 'caminar') return;
  const h = pickEvento(e); const p = h ? h.point : puntoPlano(e, 0); if (!p) return;
  if (vista === 'planta') { const dx = p.x - camO.position.x, dz = p.z - camO.position.z; camO.position.x += dx; camO.position.z += dz; ctlP.target.x += dx; ctlP.target.z += dz; ctlP.update(); sucio = true; }
  else { const off = camP.position.clone().sub(ctl3.target); const L = h ? Math.min(off.length(), Math.max(8, cajaEntidades([h.key]).getSize(new V3()).length() * 1.6)) : off.length(); volarA(p, p.clone().add(off.setLength(L))); }
});
dom.addEventListener('contextmenu', e => e.preventDefault());
vistaEl.addEventListener('wheel', e => {
  if (e.target !== dom) return;
  e.preventDefault(); e.stopPropagation();
  if (herramienta === 'colocar') { params.colocar.giro = normAng(params.colocar.giro + (e.deltaY > 0 ? 15 : -15)); moverColocar(e); return; }
  zoomCursor(e);
}, { capture: true, passive: false });
/* arrastrar desde el catálogo */
dom.addEventListener('dragover', e => { if (!arrastreCat) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; ultimoRaton = e; moverColocar(e); });
dom.addEventListener('drop', e => { if (!arrastreCat) return; e.preventDefault(); colocarAqui(e); arrastreCat = null; });
let arrastreCat = null;
/* minimapa */
let mmArr = false;
$('#minimapa').addEventListener('pointerdown', e => { mmArr = true; minimapaIr(e); try { e.target.setPointerCapture(e.pointerId); } catch (er) { } });
$('#minimapa').addEventListener('pointermove', e => { if (mmArr) minimapaIr(e); });
$('#minimapa').addEventListener('pointerup', () => { mmArr = false; });

/* teclado */
window.addEventListener('keydown', e => {
  if (!$('#modal').hidden) { if (e.key === 'Escape') cerrarModal(null); if (e.key === 'Enter' && e.target && e.target.id === 'nomComp') { e.preventDefault(); cerrarModal(true); } return; }
  if (!menuEl.hidden && e.key === 'Escape') { cerrarMenu(); return; }
  const enCampo = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  if (vista === 'caminar' && !enCampo) { if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { andar.teclas.add(e.code); e.preventDefault(); return; } if (e.key === 'Escape' && !andar.lock) { ponerVista('3d'); return; } }
  if (enCampo) return;
  /* (editor v2) medida escrita con el teclado mientras se dibuja una pared: 4,5 y Enter hace un tramo de 4,5 m hacia el ratón */
  if (herramienta === 'pared' && paredEst && !(e.ctrlKey || e.metaKey)) {
    if (/^[0-9]$/.test(e.key) || ((e.key === ',' || e.key === '.') && !medidaTecleada.includes('.'))) { medidaTecleada += /[.,]/.test(e.key) ? '.' : e.key; pista('Largo del tramo: ' + medidaTecleada.replace('.', ',') + ' m · Enter para aplicar, Retroceso para corregir'); e.preventDefault(); return; }
    if (e.key === 'Backspace' && medidaTecleada) { medidaTecleada = medidaTecleada.slice(0, -1); pista('Largo del tramo: ' + (medidaTecleada.replace('.', ',') || '…') + ' m'); e.preventDefault(); return; }
    if (e.key === 'Enter' && medidaTecleada) { e.preventDefault(); aplicarMedidaTecleada(); return; }
    if (e.key === 'Escape' && medidaTecleada) { medidaTecleada = ''; pista('Medida borrada.'); return; }
  }
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (ctrl) {
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) hacerRehacer(); else hacerDeshacer(); }
    else if (k === 'y') { e.preventDefault(); hacerRehacer(); }
    else if (k === 'c') { if (sel.length) { e.preventDefault(); copiar(); } }
    else if (k === 'v') { e.preventDefault(); pegar(); }
    else if (k === 'd') { e.preventDefault(); if (sel.length) duplicar(); }
    else if (k === 'g') { e.preventDefault(); if (e.shiftKey) desagrupar(); else agrupar(); }
    return;
  }
  if (e.key === 'Shift') teclasCam.add('Shift');
  if (herramienta === 'colocar' && k === 'r') { params.colocar.giro = normAng(params.colocar.giro + (e.shiftKey ? -90 : 90)); if (ultimoRaton) moverColocar(ultimoRaton); return; }
  if (TECLAS_CAM.includes(e.code) && vista !== 'caminar') { teclasCam.add(e.code); teclasToque.add(e.code); if (e.shiftKey) teclasToque.add('Shift'); e.preventDefault(); return; }
  if (e.key === 'Escape') {
    if (herramienta === 'pared' && paredEst) { terminarPared(); return; }
    if (herramienta === 'habitacion' && habEst) { habEst = null; limpiarPrevia(); etqVivas = []; return; }
    if (herramienta === 'medir' && medirEst) { medirEst = null; etqVivas = []; actualizarMedidas(); return; }
    if (herramienta !== 'sel') { ponerHerramienta('sel'); return; }
    if (sel.length) seleccionar([]); return;
  }
  if (e.key === 'Enter') { if (herramienta === 'pared' && paredEst) terminarPared(); else if (herramienta === 'habitacion' && habEst) cerrarPoligonoHab(); return; }
  if ((e.key === 'Delete' || e.key === 'Supr' || e.key === 'Backspace') && sel.length) { e.preventDefault(); borrarSel(); return; }
  if (e.key === '?' || (e.shiftKey && e.code === 'Slash') || e.code === 'F1') { e.preventDefault(); hojaAtajos(); return; }
  if (vista === 'caminar') return;
  if (/^[1-5]$/.test(e.key)) { vistaRapida(+e.key); return; }
  if (k === 'f') { if (sel.length) encuadrarCaja(cajaEntidades(sel)); else encuadrarInicio(); return; }
  if (e.key === 'Home') { todoElMapa(); return; }
  if (k === 'm') { ponerGizmo('translate'); return; } if (k === 'g') { ponerGizmo('rotate'); return; } if (k === 'k') { ponerGizmo('scale'); return; }
  if (TECLA_HERR[e.key === ' ' ? ' ' : k]) { e.preventDefault(); ponerHerramienta(TECLA_HERR[e.key === ' ' ? ' ' : k]); }
});
window.addEventListener('keyup', e => { andar.teclas.delete(e.code); teclasCam.delete(e.code); if (e.key === 'Shift') teclasCam.delete('Shift'); });
window.addEventListener('blur', () => { andar.teclas.clear(); teclasCam.clear(); });
function ponerGizmo(m) { gizmoModo = m; if (herramienta !== 'sel') ponerHerramienta('sel'); colocarPivote(); $$('[data-a="gz"]').forEach(b => b.classList.toggle('on', b.dataset.v === m)); }

/* ====================== acciones de edición ====================== */
async function borrarSel() {
  if (!sel.length) return;
  const n = sel.length;
  const ok = await confirmar(n === 1 ? '¿Borrar este objeto?' : '¿Borrar estos ' + n + ' objetos?', 'Se puede deshacer con Ctrl+Z o revirtiendo el cambio en la lista.', 'Borrar');
  if (!ok) return;
  const refs = sel.filter(k => k[0] === 'p').map(k => +k.slice(1)), ids = sel.filter(k => k[0] === 'n').map(k => k.slice(1));
  const lista = [], ef = efectivos();
  if (refs.length) {
    const id = 'm-' + mapa + '-' + claveOrig(refs), prev = ef.get(id), c = centroDe(refs, true), t = ahora(), tipoB = tipoOrig(refs);
    /* (2.1) huecos.js: una puerta o ventana original se borra con su marco y su vano se rellena con pared (otro cambio del mismo paso) */
    const ext = window.OOHuecos ? OOHuecos.alBorrar(refs) : null; if (ext) { refs.length = 0; refs.push(...ext.refs); lista.push(...ext.docs); }
    const data = { mapa, accion: 'borrar', ref: refs.length === 1 ? refs[0] : refs.slice(), id_objeto: null, tipo: tipoB, capa: capaActiva, datos: { x: r3(c.x), y: r3(c.y), z: r3(c.z), origen: 'centro' }, antes: refs.length === 1 ? estadoDatos(refs[0], true) : { piezas: refs.map(i => Object.assign({ ref: i }, estadoDatos(i, true))) }, texto: '', fotos: [], creado: prev && prev.creado || t, actualizado: t, autor };
    if (tamDoc(data) > 240000) data.antes = { nota: 'omitido por tamaño: ver el mapa base' };
    lista.push({ id, data });
  }
  for (const id of ids) { const o = nuevos.get(id); if (o) lista.push({ id: o.docId, data: null }); }
  seleccionar([]); guardar(lista);
}
function cambiarCampoSel(k, v) {
  if (!sel.length) return;
  /* (editor v2) propiedades, escala por factor y giro de varias cosas a la vez */
  if (k.startsWith('p_')) { const m = { p_nombre: 'nombre', p_etiqueta: 'etiqueta', p_colision: 'colision', p_recibe: 'recibe_sombras', p_proyecta: 'proyecta_sombras' }[k]; if (m) guardarProps({ [m]: typeof v === 'string' ? v.trim() : v }); return; }
  if (k === 'escX' || k === 'escY' || k === 'escZ') {
    const act = escalaActual(); if (!act || !(v > 0.001)) return; const eje = k[3].toLowerCase(), f = v / (act[eje] || 1);
    escalarSel(escUniforme ? new V3(f, f, f) : new V3(eje === 'x' ? f : 1, eje === 'y' ? f : 1, eje === 'z' ? f : 1)); renderPanel(); return;
  }
  if (k === 'giro' && sel.length > 1) { if (v) girarSelY(v); renderPanel(); return; }
  if (sel.length === 1 && sel[0][0] === 'n') {
    const o = nuevos.get(sel[0].slice(1)); if (!o) return; const d = o.datos, b = tipoBase(o.tipo);
    if (k === 'capa') { guardar([docActualizado(o, { capa: v })]); return; }
    if (k === 'giro') d.giroY = normAng(v); else d[k] = v;
    efectosCampo(b, d, k); renderNuevo(o); confirmarEdicion(); return;
  }
  if (sel.length === 1 && sel[0][0] === 'p') {
    const i = +sel[0].slice(1), z = P[i];
    if (k === 'x') z.p.x = v; else if (k === 'y') z.p.y = v; else if (k === 'z') z.p.z = v;
    else if (k === 'sx' || k === 'sy' || k === 'sz') { if (z.t <= 4) { z.s[k === 'sx' ? 'x' : k === 'sy' ? 'y' : 'z'] = Math.max(0.01, v); } }
    else if (k === 'giro') { const dlt = v * DEG - yawDe(z.q); z.q.premultiply(qY(dlt)); }
    else if (k === 'incX' || k === 'incZ') { const eu = eulerDe(z.q); if (k === 'incX') eu.x = Math.max(-89.9, Math.min(89.9, v)) * DEG; else eu.z = v * DEG; z.q.setFromEuler(eu); }
    else if (k === 'color') z.c.set(v);
    escribirPieza(i); marcarActualizado(); confirmarEdicion(k === 'color' ? 'pintura' : undefined); return;
  }
  const c = new V3(); for (const s of sel) c.add(estadoEnt(s).p); c.multiplyScalar(1 / sel.length);
  for (const s of sel) {
    const st = estadoEnt(s);
    if (k === 'x') st.p.x += v - c.x; else if (k === 'y') st.p.y += v - c.y; else if (k === 'z') st.p.z += v - c.z;
    else if (k === 'color') { if (s[0] === 'p') P[+s.slice(1)].c.set(v); else { const o = nuevos.get(s.slice(1)); o.datos.color = v; } }
    ponerEstado(s, st.p, st.q, st.s);
  }
  marcarActualizado(); confirmarEdicion();
}
function efectosCampo(b, d, k) {
  if (k === 'material' && MATERIALES[d.material]) d.color = MATERIALES[d.material].c;
  if (k === 'matmuro' && MATERIALES[d.matmuro]) d.colormuro = MATERIALES[d.matmuro].c;
  if (b === 'edificio' && (k === 'alto' || k === 'pisos' || k === 'sy')) { d.pisos = Math.max(1, Math.round(+d.pisos || 1)); if (k === 'sy') d.alto = r3(d.sy / d.pisos); else d.sy = r3((+d.alto || 3) * d.pisos); }
  if (b === 'coche' && k === 'subtipo') { const c = COCHES[d.subtipo] || COCHES.sedan; d.sx = c[1]; d.sy = c[2]; d.sz = c[3]; }
  if (b === 'contenedor' && k === 'subtipo') { d.sx = (CONTS[d.subtipo] || CONTS['20'])[1]; }
  if (b === 'arbol' && k === 'sx') d.sz = d.sx;
}
function cambiarParamHerr(k, v) { const h = herramienta === 'colocar' ? null : herramienta; const pr = params[h]; if (!pr) return; pr[k] = v; efectosCampo(h, pr, k); renderPanel(); }

/* ====================== notas ====================== */
function objetivoNota() {
  if (sel.length === 1 && sel[0][0] === 'n') return { tipo: 'nuevo', id: sel[0].slice(1) };
  if (sel.length && sel.every(k => k[0] === 'p')) { const refs = sel.map(k => +k.slice(1)); return { tipo: 'orig', refs, docId: 't-' + mapa + '-' + claveOrig(refs) }; }
  return null;
}
function notaActual(obj) {
  if (!obj) return { texto: '', fotos: [] };
  if (obj.tipo === 'nuevo') { const o = nuevos.get(obj.id); return { texto: o ? o.texto : '', fotos: o ? o.fotos.slice() : [] }; }
  const d = efectivos().get(obj.docId); return { texto: d && d.texto || '', fotos: d && Array.isArray(d.fotos) ? d.fotos.slice() : [] };
}
function guardarNota(silencio) {
  const obj = objetivoNota(); if (!obj) return;
  const ta = $('#notaTexto'); const texto = ta ? ta.value.trim() : ''; const fotos = notaTrabajo.fotos.slice(); const ef = efectivos(); const t = ahora();
  if (obj.tipo === 'nuevo') { const o = nuevos.get(obj.id); const prev = o && ef.get(o.docId); if (!prev) return; guardar([{ id: o.docId, data: Object.assign(clon(prev), { texto, fotos, actualizado: t }) }]); }
  else {
    const prev = ef.get(obj.docId);
    if (!texto && !fotos.length) { if (prev) guardar([{ id: obj.docId, data: null }]); return; }
    const box = cajaEntidades(obj.refs.map(r => 'p' + r)); const c = box.getCenter(new V3());
    guardar([{ id: obj.docId, data: { mapa, accion: 'nota', ref: obj.refs.length === 1 ? obj.refs[0] : obj.refs.slice(), id_objeto: null, tipo: tipoOrig(obj.refs), capa: capaActiva, datos: { x: r3(c.x), y: r3(box.max.y), z: r3(c.z) }, antes: null, texto, fotos, creado: prev && prev.creado || t, actualizado: t, autor } }]);
  }
  if (!silencio) pista('Nota guardada.');
}
function pintarFotosNota() {
  const cont = $('#notaFotos'); if (!cont) return;
  cont.innerHTML = notaTrabajo.fotos.map((id, j) => `<div class="f"><button class="ver" data-a="ver-foto" data-id="${esc(id)}" title="Ver grande"><img src="${esc(blobUrl(id))}" alt="Foto adjunta ${j + 1}" loading="lazy"></button><button class="quitar" data-a="nota-quitar-foto" data-i="${j}" title="Quitar foto" aria-label="Quitar foto">&times;</button></div>`).join('') || '<span class="ayuda">Sin fotos.</span>';
}

/* ====================== panel ====================== */
const cacheMuestras = {};
function imgMuestra(mat, color) { const k = mat + color; if (!cacheMuestras[k]) cacheMuestras[k] = OO.muestra(mat, color, 64); return cacheMuestras[k]; }
function htmlMuestras(lista, actual, accion, k) { return '<div class="muestras">' + lista.map(m => `<button class="muestra${m === actual ? ' on' : ''}" data-a="${accion}" data-k="${k || 'material'}" data-v="${m}" title="${esc(MATERIALES[m].n)}"><img src="${imgMuestra(m, MATERIALES[m].c)}" alt="">${esc(MATERIALES[m].n)}</button>`).join('') + '</div>'; }
function campoHTML(k, label, kind, val) {
  const ancho = kind === 'text' || kind === 'opc' || kind === 'matmuro' || kind === 'matsuelo' || kind === 'coche' || kind === 'cont' || kind === 'capa';
  const id = 'c_' + k + '_' + Math.random().toString(36).slice(2, 6);
  let inp;
  const sel2 = (lista, nombre) => `<select id="${id}" data-k="${k}">${lista.map(([v, n]) => `<option value="${esc(v)}"${String(val) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  switch (kind) {
    case 'color': inp = `<input id="${id}" type="color" data-k="${k}" value="${esc(val || '#cccccc')}">`; break;
    case 'matmuro': inp = sel2(MAT_MURO.map(m => [m, MATERIALES[m].n])); break;
    case 'matsuelo': inp = sel2(MAT_SUELO.map(m => [m, MATERIALES[m].n])); break;
    case 'coche': inp = sel2(Object.entries(COCHES).map(([v, m]) => [v, m[0]])); break;
    case 'cont': inp = sel2(Object.entries(CONTS).map(([v, m]) => [v, m[0]])); break;
    case 'capa': inp = sel2(capasLista().map(c => [c.nombre, c.nombre])); break;
    case 'text': inp = `<textarea id="${id}" data-k="${k}" rows="2">${esc(val || '')}</textarea>`; break;
    case 'int': inp = `<input id="${id}" type="number" data-k="${k}" step="1" min="1" value="${esc(val)}">`; break;
    case 'opc': inp = sel2((window.OOCartel && OOCartel.OPCIONES[k]) || []); break;
    default: inp = `<input id="${id}" type="number" data-k="${k}" step="${AJ.ajuste ? AJ.paso : 0.05}" value="${esc(val == null ? '' : r3(val))}">`;
  }
  return `<label class="campo${ancho ? ' ancho' : ''}" for="${id}"><span>${label}</span>${inp}</label>`;
}
function camposDe(lista, obj) { return '<div class="campos">' + lista.map(([k, l, kind]) => campoHTML(k, l, kind, obj[k])).join('') + '</div>'; }
function htmlGizmo() {
  return `<h3>Editar</h3><div class="fila"><div class="seg" role="group" aria-label="Modo del gizmo">${[['translate', 'Mover', 'M'], ['rotate', 'Girar', 'G'], ['scale', 'Escalar', 'K']].map(([v, l, t]) => `<button data-a="gz" data-v="${v}" class="${gizmoModo === v ? 'on' : ''}" title="${l} (tecla ${t})">${l}</button>`).join('')}</div><label class="chk"><input type="checkbox" data-a="ajuste2" ${AJ.ajuste ? 'checked' : ''}> Ajuste a rejilla</label></div>`;
}
function camposCatalogo(nombre) { return nombre === 'letrero' ? [['texto', 'Texto del letrero', 'text'], ['color', 'Color del panel', 'color']] : [['color', 'Color principal', 'color']]; }
function htmlHerramienta() {
  const h = herramienta;
  if (herrPropias[h]) return `<div data-scope="tool"><h2>${svg(herrPropias[h].ic || 'objeto')} ${esc(herrPropias[h].n)}</h2><p class="ayuda">${esc(herrPropias[h].pista || '')}</p>${herrPropias[h].panel ? herrPropias[h].panel() : ''}<div class="fila"><button data-a="herr-fin">Volver a seleccionar (Esc)</button></div></div>`;
  if (h === 'calco-mover' || h === 'calco-alinear' || h === 'calco-medida') return `<div data-scope="tool"><h2>${NOMBRE_HERR[h]}</h2><p class="ayuda">${PISTAS[h]}</p><div class="fila"><button data-a="herr-fin">Terminar</button></div></div>`;
  const pr = params[h] || {}; let s = `<div data-scope="tool"><h2>${svg(h)} ${esc(NOMBRE_HERR[h])}</h2><p class="ayuda">${esc(PISTAS[h])}</p>`;
  switch (h) {
    case 'pared': s += (window.OOPresetsMuro ? OOPresetsMuro.panel(pr) : '') + '<h3>Material</h3>' + htmlMuestras(MAT_MURO, pr.material, 'param-mat') + camposDe([['sy', 'Alto (m)'], ['sz', 'Grosor (m)'], ['color', 'Color', 'color']], pr) + `<div class="fila"><button data-a="pared-fin">Terminar tramo (Enter)</button></div>`; break;
    case 'habitacion': s += `<div class="fila"><div class="seg" role="group">${[['rect', 'Rectángulo'], ['poligono', 'Polígono'], ['edificio', 'Edificio']].map(([v, l]) => `<button data-a="param-set" data-k="modo" data-v="${v}" class="${pr.modo === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
      s += pr.modo === 'poligono' ? '<p class="ayuda">Crea solo el suelo (por ejemplo para trazar un cuarto existente). Las paredes que cierres con la herramienta Pared crean su habitación solas.</p>' : '';
      s += '<h3>Suelo</h3>' + htmlMuestras(MAT_SUELO, pr.material, 'param-mat');
      if (pr.modo !== 'poligono') s += '<h3>Paredes</h3>' + htmlMuestras(MAT_MURO, pr.matmuro, 'param-mat', 'matmuro') + camposDe([['alto', 'Alto (m)'], ['grosor', 'Grosor (m)']].concat(pr.modo === 'edificio' ? [['pisos', 'Pisos', 'int']] : []), pr);
      break;
    case 'puerta': s += camposDe(CAMPOS.puerta, pr); s += '<p class="ayuda">La puerta abre el hueco en la pared (también en paredes originales del mapa).</p>'; break;
    case 'ventana': s += camposDe(CAMPOS.ventana, pr); break;
    case 'hueco': s += camposDe(CAMPOS.hueco, pr) + '<p class="ayuda">Es un vano sin marco: corta paredes nuevas y originales. Dentro se puede poner después una puerta o una ventana (clic dentro del hueco).</p>'; break;
    case 'suelo': s += '<h3>Superficie</h3>' + htmlMuestras(MAT_SUELO.concat(['bloque']), pr.material, 'param-mat') + camposDe([['color', 'Color', 'color']], pr); break;
    case 'techo': s += '<h3>Material</h3>' + htmlMuestras(['chapa', 'concreto', 'madera', 'metal', 'pintura', 'ladrillo'], pr.material, 'param-mat') + camposDe([['grosor', 'Grosor (m)'], ['alto', 'Alto si no hay habitación (m)'], ['color', 'Color', 'color']], pr); break;
    case 'pintar': s += '<h3>Material</h3>' + htmlMuestras(Object.keys(MATERIALES), pr.material, 'param-mat') + camposDe([['color', 'Color (pintura)', 'color']], pr) + '<p class="ayuda"><kbd>Alt</kbd>+clic copia el color de lo que toques.</p>'; break;
    case 'empujar': s += '<p class="ayuda">Funciona con piezas originales (cajas) y con paredes, suelos, edificios y objetos nuevos. Con «Ajuste a rejilla» avanza de ' + fmt(AJ.paso) + ' en ' + fmt(AJ.paso) + ' m.</p>'; break;
    case 'medir': s += `<div class="fila"><div class="seg" role="group">${[['distancia', 'Distancia'], ['angulo', 'Ángulo'], ['guia', 'Guía']].map(([v, l]) => `<button data-a="param-set" data-k="modo" data-v="${v}" class="${pr.modo === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
      if (pr.modo === 'guia') s += `<div class="fila"><div class="seg" role="group"><button data-a="param-set" data-k="guia" data-v="x" class="${pr.guia === 'x' ? 'on' : ''}">Este-oeste</button><button data-a="param-set" data-k="guia" data-v="z" class="${pr.guia === 'z' ? 'on' : ''}">Norte-sur</button></div></div><div class="fila"><button data-a="guias-borrar" class="peligro">Borrar todas las guías</button></div>`;
      s += '<h3>Medidas (' + medidas.length + ')</h3><ul class="lista">' + etiquetasMedidas().map((m, j) => `<li class="cambio"><span style="flex:1;font-family:var(--mono)">${j + 1}. ${esc(m.t)}</span></li>`).join('') + '</ul><div class="fila"><button data-a="medidas-borrar">Borrar medidas</button></div>'; break;
    case 'colocar': { const it = itemPorId(pr.item); s += it ? `<p><b>${esc(it.n)}</b> · giro ${fmt(pr.giro, 0)}°</p><div class="fila"><button data-a="colocar-girar">Girar 90° (R)</button><button data-a="tab-catalogo">Elegir otro</button></div>` : ''; break; }
    case 'nota': if (pr.fotoPendiente) s += `<p class="aviso">Se anclará esta foto en el punto que marques.</p><img class="mini-foto" src="${esc(blobUrl(pr.fotoPendiente))}" alt="Foto a anclar"><div class="fila"><button data-a="nota-sin-foto">No anclar la foto</button></div>`; break;
  }
  s += `<div class="fila"><button data-a="herr-fin">Volver a seleccionar (Esc)</button></div></div>`;
  return s;
}
function htmlAyuda() {
  return `<h2>Nada seleccionado</h2><p class="ayuda">Haz clic en una pieza para ver sus datos y editarla, arrastra en vacío para seleccionar varias, o elige una herramienta de la barra.</p>
  <h3>Lo básico</h3><ul class="atajos" style="columns:1"><li>Rueda <span>zoom hacia el cursor</span></li><li>Botón central <span>desplazar</span></li><li>Botón derecho <span>orbitar / menú (clic corto)</span></li><li>Flechas o W A S D <span>mover la cámara</span></li><li>Q / E · R / V <span>girar · subir / bajar</span></li><li>1 2 3 4 5 <span>planta, frente, lateral, iso, 1.ª persona</span></li><li>? <span>todos los atajos</span></li></ul>`;
}
function filaInfo(t, v) { return `<tr><th>${t}</th><td>${v}</td></tr>`; }
/* (editor v2) Propiedades por objeto (nombre, etiqueta, colisión, sombras y, en otros módulos, material, luz y comportamientos).
   Objetos nuevos: en su documento («props»). Piezas originales u objetos automáticos: un documento «propiedades» en cambios con sus refs. */
function objetivoProps(keys) {
  const esSel = !keys; keys = keys || sel; if (!keys.length) return null;
  if (keys.length === 1 && keys[0][0] === 'n') { const o = nuevos.get(keys[0].slice(1)); return o ? { tipo: 'nuevo', o } : null; }
  if (keys.every(k => k[0] === 'p')) { const refs = keys.map(k => +k.slice(1)); const sg = selGrupo; if (!esSel) selGrupo = null; const clave = claveOrig(refs); selGrupo = sg; return { tipo: 'orig', refs, docId: 'pr-' + mapa + '-' + clave }; }
  return null;
}
function leerProps(obj) { if (!obj) return {}; if (obj.tipo === 'nuevo') return Object.assign({}, obj.o.props || {}); const d = efectivos().get(obj.docId); return Object.assign({}, (d && d.props) || {}); }
function propsDe(k) { if (k[0] === 'n') { const o = nuevos.get(k.slice(1)); return (o && o.props) || null; } const z = P[+k.slice(1)]; if (!z || !z.props) return null; const d = efectivos().get(z.props); return (d && d.props) || null; }
function guardarProps(cambios, obj) {
  obj = obj || objetivoProps(); if (!obj) { pista('Selecciona un objeto nuevo o solo piezas del mapa.'); return; }
  const p = Object.assign(leerProps(obj), cambios); for (const k in p) if (p[k] === undefined || p[k] === null || p[k] === '') delete p[k];
  if (obj.tipo === 'nuevo') { const doc = docActualizado(obj.o, { props: p }); if (doc) guardar([doc]); return; }
  const prev = efectivos().get(obj.docId), t = ahora(); const box = cajaEntidades(obj.refs.map(r => 'p' + r)); const c = box.isEmpty() ? new V3() : box.getCenter(new V3());
  if (!Object.keys(p).length) { if (prev) guardar([{ id: obj.docId, data: null }]); return; }
  guardar([{ id: obj.docId, data: { mapa, accion: 'propiedades', ref: obj.refs.length === 1 ? obj.refs[0] : obj.refs.slice(), id_objeto: null, tipo: tipoOrig(obj.refs), capa: (prev && prev.capa) || capaActiva, datos: { x: r3(c.x), y: r3(c.y), z: r3(c.z) }, props: p, antes: null, texto: '', fotos: [], creado: (prev && prev.creado) || t, actualizado: t, autor } }]);
}
function nombreEntidades(keys) {
  if (!keys.length) return '';
  const pr = leerProps(objetivoProps(keys)); if (pr.nombre) return pr.nombre;
  if (keys.length === 1 && keys[0][0] === 'n') { const o = nuevos.get(keys[0].slice(1)); return o ? (o.datos.nombre || nombreTipo(o.tipo)) : ''; }
  const a = autoActivo(keys[0]); if (a && keys.every(k => autoActivo(k) === a)) return a.nombre;
  if (keys.length === 1) { const z = P[+keys[0].slice(1)]; return z ? TIPO_N[z.t] + (z.t === 1 && z.nom ? ' ' + z.nom : '') : ''; }
  return keys.length + ' objetos';
}
function escalaActual() {
  /* (2.1 pro f6) la base de la escala va con la selección que la midió: al cambiar de selección por cualquier camino (clic en un grupo, recompute, deshacer…) se vuelve a medir. Antes una selección única podía heredar la de una múltiple y mostrar 0,007 */
  const claveEsc = sel.join(','); if (escBase && escBase.clave !== claveEsc) escBase = null;
  if (sel.length === 1 && sel[0][0] === 'p') { const z = P[+sel[0].slice(1)]; if (z.t > 4) return null; return new V3(z.s.x / (z.b.s.x || 1), z.s.y / (z.b.s.y || 1), z.s.z / (z.b.s.z || 1)); }
  if (sel.length === 1 && sel[0][0] === 'n') { const o = nuevos.get(sel[0].slice(1)); if (!o || ['nota', 'luz', 'habitacion', 'techo'].includes(tipoBase(o.tipo))) return null; const s = new V3(+o.datos.sx || 1, +o.datos.sy || 1, +o.datos.sz || 1); if (!escBase) escBase = { s: s.clone(), clave: claveEsc }; return s.divide(escBase.s); }
  const sz = cajaEntidades(sel).getSize(new V3()); if (!escBase) escBase = { s: sz.clone(), clave: claveEsc }; return new V3(sz.x / (escBase.s.x || 1), sz.y / (escBase.s.y || 1), sz.z / (escBase.s.z || 1));
}
function escalarSel(r) {
  if (!sel.length) return;
  if (sel.length === 1 && sel[0][0] === 'p') { const i = +sel[0].slice(1), z = P[i]; if (z.t > 4) return; z.s.set(Math.max(0.01, z.s.x * r.x), Math.max(0.01, z.s.y * r.y), Math.max(0.01, z.s.z * r.z)); escribirPieza(i); }
  else {
    const box = cajaEntidades(sel), c = box.getCenter(new V3()), base = new V3(c.x, box.min.y, c.z);
    for (const k of sel) { const st = estadoEnt(k); const p = sel.length === 1 ? st.p : st.p.clone().sub(base).multiply(r).add(base); ponerEstado(k, p, st.q, st.s.clone().multiply(r)); }
  }
  marcarActualizado(); actualizarContorno(); colocarPivote(); confirmarEdicion();
}
function girarSelY(grados) {
  const c = new V3(); for (const k of sel) c.add(estadoEnt(k).p); c.multiplyScalar(1 / sel.length); const dq = qY(grados * DEG);
  for (const k of sel) { const st = estadoEnt(k); const p = st.p.clone().sub(c).applyQuaternion(dq).add(c); ponerEstado(k, p, dq.clone().multiply(st.q), st.s); }
  marcarActualizado(); actualizarContorno(); colocarPivote(); confirmarEdicion();
}
function htmlTransform(pos, rot, escv, incl, tam) {
  const inp = (k, v, dis, paso) => `<input type="number" data-k="${k}" step="${paso || (AJ.ajuste ? AJ.paso : 0.05)}" value="${v == null ? '' : r3(v)}"${dis ? ' disabled' : ''} aria-label="${k}">`;
  const fila = (t, ks, vs, dis, extra, paso) => `<span>${t}</span>${['X', 'Y', 'Z'].map((a, j) => `<label><b>${a}</b>${inp(ks[j], vs[j], dis && dis[j], paso)}</label>`).join('')}${extra || '<span></span>'}`;
  let h = '<details class="sec" open data-sec="transform"><summary>Transformación</summary><div class="xyz">' + fila('Posición', ['x', 'y', 'z'], [pos.x, pos.y, pos.z]);
  h += fila('Rotación', ['incX', 'giro', 'incZ'], [rot.x, rot.y, rot.z], [!incl, false, !incl], null, AJ.ajuste ? AJ.angulo : 1);
  if (escv) h += fila('Escala', ['escX', 'escY', 'escZ'], [escv.x, escv.y, escv.z], null, `<button class="candado${escUniforme ? ' on' : ''}" data-a="esc-candado" title="Escala uniforme${escUniforme ? ' (activada)' : ''}" aria-pressed="${escUniforme}">${svg(escUniforme ? 'candado' : 'abierto')}</button>`, 0.05);
  if (tam) h += fila('Tamaño', ['sx', 'sy', 'sz'], [tam.x, tam.y, tam.z]);
  return h + '</div></details>';
}
function htmlProps(defCol) {
  const obj = objetivoProps(); if (!obj) return '';
  const pr = leerProps(obj); const v = (k, d) => pr[k] == null ? d : pr[k];
  return `<details class="sec" open data-sec="props"><summary>Propiedades</summary><div class="props">
    <span>Nombre</span><input type="text" data-k="p_nombre" value="${esc(pr.nombre || '')}" placeholder="${esc(nombreEntidades(sel))}">
    <span>Etiqueta</span><input type="text" data-k="p_etiqueta" value="${esc(pr.etiqueta || '')}" placeholder="(Opcional)">
    <span>Colisión</span><label class="chk"><input type="checkbox" data-k="p_colision" ${v('colision', defCol) ? 'checked' : ''}></label>
    <span>Recibe sombras</span><label class="chk"><input type="checkbox" data-k="p_recibe" ${v('recibe_sombras', true) ? 'checked' : ''}></label>
    <span>Proyecta sombras</span><label class="chk"><input type="checkbox" data-k="p_proyecta" ${v('proyecta_sombras', true) ? 'checked' : ''}></label>
  </div></details>`;
}
function htmlCabecera(icono, tipoTxt, capaHtml) {
  const obj = objetivoProps(), pr = leerProps(obj);
  return `<div class="ins-cab"><span class="ic-obj">${svg(icono)}</span><input type="text" data-k="p_nombre" value="${esc(pr.nombre || nombreEntidades(sel))}" aria-label="Nombre"${obj ? '' : ' disabled'}><span class="lapiz">${svg('lapiz')}</span></div>
  <div class="ins-fila"><span>Tipo</span><span class="dato">${tipoTxt}</span><span></span></div>
  <div class="ins-fila"><span>Capa</span>${capaHtml}<button data-a="ctx-ocultar" title="Ocultar la selección">${svg('ojo')}</button></div>`;
}
function htmlSeleccion() {
  const u = sel.length === 1 ? sel[0] : null; let s = '<div data-scope="sel">';
  const auto1 = !sel.some(k => grupoDe.has(k)) && sel.length > 1 ? autoActivo(sel[0]) : null;
  const esAuto = !!auto1 && sel.every(k => autoActivo(k) === auto1);
  const enGrupo = sel.some(k => grupoDe.has(k)) ? '<p class="ayuda">En un grupo: Ctrl+clic selecciona una sola pieza. <button data-a="ctx-desagrupar">Desagrupar</button></p>'
    : esAuto ? `<p class="ayuda">Objeto automático de ${auto1.keys.length} piezas (${fmt(auto1.tam[0], 1)} × ${fmt(auto1.tam[2], 1)} × ${fmt(auto1.tam[1], 1)} m). Se mueve, gira y escala entero; Ctrl+clic coge una sola pieza. <button data-a="ctx-desagrupar">Desagrupar</button></p>`
    : sel.some(k => { const a = autoDe.get(k); return a != null && sinAuto.has(autos[a].firma); }) ? '<p class="ayuda">Estas piezas eran un objeto. <button data-a="reagrupar-auto">Volver a agrupar</button></p>' : '';
  const esc1 = escalaActual();
  if (u && u[0] === 'p') {
    const i = +u.slice(1), z = P[i]; const eu = eulerDe(z.q);
    s += htmlCabecera('objeto', esc(TIPO_N[z.t]) + ' (Estático)', `<span class="dato"><i class="punto" style="background:#8a929c"></i>${esc(D.secciones[z.sec] || 'Mapa')}</span>`);
    s += htmlTransform(z.p, { x: eu.x / DEG, y: yawDe(z.q) / DEG, z: eu.z / DEG }, esc1, true, z.t <= 4 ? z.s : null);
    s += htmlProps(!!(z.fl & 1));
    const mat = z.mat >= 0 && D.materiales[z.mat] ? D.materiales[z.mat] : null;
    s += `<details class="sec" data-sec="info"><summary>Información <small>pieza original #${i}</small></summary><table class="info">` + filaInfo('Sección', esc(D.secciones[z.sec] || '—')) + filaInfo('Grupo', z.grp >= 0 ? esc(D.grupos[z.grp]) : '—') +
      (mat ? filaInfo('Material', esc(mat[0]) + (mat[2] ? ' <small>(' + esc(mat[2]) + ')</small>' : '')) : '') + (z.material ? filaInfo('Pintado con', esc((MATERIALES[z.material] || {}).n || z.material)) : '') +
      (z.t === 6 ? filaInfo('Texto', esc(z.nom)) : '') + (z.t === 7 ? filaInfo('Puerta', esc(z.nom) + ' · sentido ' + fmt(z.raw[0], 0)) : '') + (z.t === 5 ? filaInfo('Luz', esc(z.nom) + ' · alcance ' + fmt(z.raw[0], 1) + ' m') : '') +
      filaInfo('Colisión en el juego', (z.fl & 1) ? 'Sí' : 'No') + filaInfo('Visible en el juego', (z.fl & 2) ? 'Sí' : 'No') +
      filaInfo('Estado', (z.doc ? '<span class="etq mod">modificada</span> ' : '<span class="etq">original</span> ') + (z.nota ? '<span class="etq mod">con nota</span> ' : '') + (z.cortes ? '<span class="etq mod">con huecos</span>' : '')) + '</table></details>' + enGrupo;
    s += `<details class="sec" data-sec="color"><summary>Color</summary><div class="campos">${campoHTML('color', 'Color', 'color', '#' + z.c.getHexString())}</div></details>`;
    s += htmlPendiente();
    s += `<div class="fila">${z.grp >= 0 ? '<button data-a="grupo">Seleccionar grupo entero</button>' : ''}<button data-a="encuadrar" title="F">Encuadrar</button><button data-a="duplicar" title="Ctrl+D">Duplicar</button><button data-a="borrar" class="peligro" title="Supr">Borrar</button></div>`;
  } else if (u && u[0] === 'n') {
    const o = nuevos.get(u.slice(1)); const d = o.datos, b = tipoBase(o.tipo), sub = o.tipo.slice(b.length + 1);
    const capa = capaInfo(capaDeNuevo(o));
    s += htmlCabecera(b === 'muro' ? 'pared' : ICON[b] ? b : 'objeto', esc(nombreTipo(o.tipo)) + ' (Nuevo)' + (solapeSel ? ' <span class="etq rojo">choca</span>' : ''), `<select data-k="capa" aria-label="Capa">${capasLista().map(c => `<option value="${esc(c.nombre)}"${c.nombre === capa.nombre ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`) + enGrupo;
    if (b === 'habitacion') s += `<p class="ayuda">Área: <b>${fmt(+d.area || 0, 2)} m²</b>${d.automatica ? ' · detectada sola' : ''}</p>`;
    s += htmlTransform({ x: d.x, y: d.y, z: d.z }, { x: d.incX || 0, y: d.giroY || 0, z: d.incZ || 0 }, esc1, !SIN_INCL.includes(b), null);
    s += htmlProps(true);
    let lista = b === 'objeto' ? [['sx', 'Largo X (m)'], ['sy', 'Alto (m)'], ['sz', 'Ancho Z (m)']].concat(camposCatalogo(sub)) : (CAMPOS[b] || []);
    if (b === 'puerta' || b === 'ventana') lista = lista.concat([['sz', 'Grosor del muro (m)']]);
    if (lista.length || ['muro', 'calle', 'habitacion', 'techo', 'edificio'].includes(b)) {
      s += `<details class="sec" open data-sec="campos"><summary>${esc(nombreTipo(o.tipo))}</summary>`;
      if (lista.length) s += camposDe(lista, d);
      if (b === 'muro' || b === 'calle' || b === 'habitacion' || b === 'techo' || b === 'edificio') s += '<h3>Material</h3>' + htmlMuestras(b === 'calle' || b === 'habitacion' ? MAT_SUELO : MAT_MURO, d.material, 'sel-mat');
      s += '</details>';
    }
    if ((b === 'puerta' || b === 'ventana' || b === 'hueco') && d.muro != null) s +=`<p class="ayuda">Encajada en la pared ${typeof d.muro === 'number' ? 'original #' + d.muro : 'nueva'}.</p>`;
    s += htmlPendiente();
    s += `<div class="fila">${b === 'habitacion' ? '<button data-a="ctx-techo">Generar techo</button>' : ''}<button data-a="encuadrar" title="F">Encuadrar</button>${b !== 'nota' ? '<button data-a="duplicar" title="Ctrl+D">Duplicar</button>' : ''}<button data-a="borrar" class="peligro" title="Supr">Borrar</button></div>`;
  } else {
    const np = sel.filter(k => k[0] === 'p').length, nn = sel.length - np; const c = new V3(); for (const k of sel) c.add(estadoEnt(k).p); c.multiplyScalar(1 / sel.length);
    const tipoTxt = esAuto ? 'Modelo (Estático)' : selGrupo ? 'Grupo del mapa' : `Selección · ${np} del mapa, ${nn} nuevos`;
    const secs = [...new Set(sel.filter(k => k[0] === 'p').map(k => D.secciones[P[+k.slice(1)].sec]).filter(Boolean))];
    s += htmlCabecera(esAuto ? 'objeto' : 'capas', esc(tipoTxt) + (solapeSel ? ' <span class="etq rojo">choca</span>' : ''), `<span class="dato"><i class="punto" style="background:#8a929c"></i>${esc(secs.length === 1 ? secs[0] : secs.length ? secs.length + ' secciones' : 'Capa ' + capaActiva)}</span>`) + enGrupo;
    if (selGrupo) s += `<p class="ayuda">Grupo entero del mapa: <b>${esc(D.grupos[selGrupo.g])}</b>. Los cambios se guardan como un solo documento.</p>`;
    s += htmlTransform(c, { x: 0, y: 0, z: 0 }, esc1, false, null);
    s += htmlProps(true);
    s += `<details class="sec" data-sec="color"><summary>Color</summary><div class="campos">${campoHTML('color', 'Color de todos', 'color', '#cccccc')}</div></details>`;
    s += '<div class="fila"><button data-a="ctx-agrupar" title="Ctrl+G">Agrupar</button><button data-a="ctx-componente">Crear prefab</button><button data-a="encuadrar">Encuadrar</button><button data-a="duplicar">Duplicar</button><button data-a="borrar" class="peligro">Borrar</button></div>';
  }
  const obj = objetivoNota();
  if (obj) {
    const nt = notaActual(obj); notaTrabajo = { fotos: nt.fotos };
    s += `<details class="sec" data-sec="nota"${nt.texto || nt.fotos.length ? ' open' : ''}><summary>Nota y fotos${nt.fotos.length ? ' <small>' + nt.fotos.length + '</small>' : ''}</summary><label class="sr" for="notaTexto">Texto de la nota</label><textarea id="notaTexto" rows="3" placeholder="Escribe qué hay que corregir o cómo debería ser…">${esc(nt.texto)}</textarea><div id="notaFotos" class="fotos"></div>
    <div class="fila"><button data-a="nota-guardar" class="prim">Guardar nota</button><button data-a="nota-subir" class="req-assets">Subir fotos</button><button data-a="nota-galeria" class="req-assets">De la galería</button></div></details>`;
  }
  return s + '</div>';
}
function renderPanel() {
  const c = $('#objCuerpo'); if (!c) return;
  if (herramienta !== 'sel') c.innerHTML = htmlHerramienta();
  else if (!sel.length || !D) c.innerHTML = htmlAyuda();
  else { c.innerHTML = htmlSeleccion(); pintarFotosNota(); }
  avisar('panel');
}
function actualizarValoresPanel() {
  const c = $('#objCuerpo'); if (!c || herramienta !== 'sel' || !sel.length) return;
  const vals = {};
  if (sel.length === 1) { const k = sel[0]; if (k[0] === 'p') { const z = P[+k.slice(1)]; Object.assign(vals, { x: z.p.x, y: z.p.y, z: z.p.z, sx: z.s.x, sy: z.s.y, sz: z.s.z, giro: yawDe(z.q) / DEG, incX: eulerDe(z.q).x / DEG, incZ: eulerDe(z.q).z / DEG }); } else { const o = nuevos.get(k.slice(1)); if (o) { const d = o.datos; Object.assign(vals, d, { giro: d.giroY }); } } }
  else { const cc = new V3(); for (const k of sel) cc.add(estadoEnt(k).p); cc.multiplyScalar(1 / sel.length); Object.assign(vals, { x: cc.x, y: cc.y, z: cc.z }); }
  const ea = escalaActual(); if (ea) Object.assign(vals, { escX: ea.x, escY: ea.y, escZ: ea.z });
  c.querySelectorAll('input[type=number][data-k]').forEach(el => { const v = vals[el.dataset.k]; if (v != null && document.activeElement !== el) el.value = r3(v); });
}
function renderSecciones() {
  if (!D) return; const cnt = new Array(D.secciones.length + 1).fill(0); for (let i = 0; i < N; i++) cnt[P[i].sec + 1]++;
  const fila = (j, n) => `<div class="chk"><label class="chk" style="flex:1"><input type="checkbox" data-sec="${j}" ${secOn[j] ? 'checked' : ''}> ${esc(n)}</label><label title="Bloquear (no se puede seleccionar)" style="font-size:12px;color:var(--fg2);display:flex;gap:3px;align-items:center"><input type="checkbox" data-seclock="${j}" ${secLock[j] ? 'checked' : ''}> bloq.</label><small>${fmtInt(cnt[j])}</small></div>`;
  let h = D.secciones.map((n, j) => fila(j + 1, n)).join(''); if (cnt[0]) h = fila(0, '(sin sección)') + h;
  $('#secciones').innerHTML = h;
}
/* (editor v2) pestañas dentro de los paneles acoplables: cada panel con data-tabs tiene sus botones [data-tab] y sus cuerpos [data-panel].
   forzar: abre el panel aunque el usuario lo hubiera cerrado (al pulsar un botón que lleva a esa pestaña). */
function mostrarTab(t, forzar) {
  const cuerpo = document.querySelector('.pnl [data-panel="' + t + '"]'); if (!cuerpo) return;
  const pnl = cuerpo.closest('.pnl');
  if (pnl.hasAttribute('data-tabs')) {
    pnl.querySelectorAll('.pestanas [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    pnl.querySelectorAll('[data-panel]').forEach(s => { s.hidden = s.dataset.panel !== t; });
  }
  if (window.OOUI) OOUI.mostrarPanel(pnl, forzar);
  if (t === 'fotos' && !galeriaCargada) cargarGaleria();
  if (t === 'cambios' && cambiosPend) renderCambios();
  if (t === 'calcos') renderListaCalcos();
  if (t === 'catalogo') renderCatalogo();
  avisar('tab', t);
}

/* ====================== catálogo visual ====================== */
let catActual = 'oficina';
const miniaturas = {}; let rendMini = null;
function miniatura(it) {
  if (miniaturas[it.id]) return miniaturas[it.id];
  try {
    if (!rendMini) { rendMini = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rendMini.setSize(128, 128, false); rendMini.setPixelRatio(1); }
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x777777, 0.9)); const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(-3, 5, 4); sc.add(dl);
    const datos = Object.assign({ x: 0, y: 0, z: 0, giroY: 0 }, clon(it.datos)); if (it.tipo === 'copia') datos.y = datos.d0[1] / 2;
    const parts = partesMundo({ tipo: it.tipo, datos, fotos: [] }); const box = new THREE.Box3();
    for (const pt of parts) { if (pt.f === 't' || pt.f === 'poly') continue; const g = pt.f === 'c' ? geoCyl : pt.f === 'b' ? geoBox : geoSph; const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: pt.c || '#cccccc', transparent: !!pt.t, opacity: pt.t ? 0.5 : 1 })); m.matrixAutoUpdate = false; m.matrix.copy(pt.m); m.updateMatrixWorld(true); sc.add(m); box.expandByObject(m); }
    const c = box.getCenter(new V3()), r = Math.max(0.2, box.getSize(new V3()).length() / 2);
    const cm = new THREE.PerspectiveCamera(30, 1, 0.01, 1000); cm.position.copy(c).add(new V3(1, 0.75, 1.15).normalize().multiplyScalar(r / Math.sin(15 * DEG) * 1.02)); cm.lookAt(c);
    rendMini.setClearColor(0x000000, 0); rendMini.render(sc, cm); miniaturas[it.id] = rendMini.domElement.toDataURL('image/png');
    sc.traverse(o => { if (o.isMesh) o.material.dispose(); });
  } catch (e) { miniaturas[it.id] = ''; }
  return miniaturas[it.id];
}
function itemsCategoria(cat) {
  if (cat === 'componentes') return [...efectivos('componentes')].filter(([, c]) => c && Array.isArray(c.partes)).map(([id]) => itemPorId(id)).filter(Boolean);
  /* (2.1) buscador: con texto busca en todas las categorías (sin tildes ni mayúsculas) */
  const sinTilde = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(), q = sinTilde(($('#catBuscar') || {}).value || '').trim();
  if (q) return ITEMS.filter(i => q.split(/\s+/).every(w => sinTilde(i.n + ' ' + ((CATEGORIAS.find(c => c[0] === i.cat) || [])[1] || '') + ' ' + i.id.replace(/_/g, ' ')).includes(w)));
  return ITEMS.filter(i => i.cat === cat);
}
/* (editor v2) el catálogo de abajo (categorías con su cantidad, filtros, favoritos, recientes, prefabs) lo dibuja catalogo_ui.js */
function renderCatalogo() { if (window.OOCatalogoUI) OOCatalogoUI.render(); }
$('#catItems').addEventListener('dragstart', e => { const b = e.target.closest('[data-a="cat-item"]'); if (!b) return; arrastreCat = b.dataset.v; params.colocar.item = b.dataset.v; params.colocar.giro = 0; e.dataTransfer.setData('text/plain', b.dataset.v); e.dataTransfer.effectAllowed = 'copy'; if (herramienta !== 'colocar') ponerHerramienta('colocar'); });
$('#catItems').addEventListener('dragend', () => { arrastreCat = null; });

/* ====================== lista de cambios ====================== */
function detalleDoc(d) {
  const z = d.datos || {}; const partes = [];
  if (isFinite(z.x)) partes.push('X ' + fmt(z.x, 1) + ' · Z ' + fmt(z.z, 1));
  if (Array.isArray(d.ref)) partes.push(d.ref.length + ' piezas'); else if (d.ref != null) partes.push('#' + d.ref);
  if (z.area) partes.push(fmt(z.area, 1) + ' m²');
  if (d.capa && d.capa !== 'General') partes.push('capa ' + d.capa);
  if (d.fotos && d.fotos.length) partes.push(d.fotos.length + ' foto' + (d.fotos.length > 1 ? 's' : ''));
  if (d.actualizado) { const f = new Date(d.actualizado); if (!isNaN(f)) partes.push(f.toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })); }
  return partes.join(' · ');
}
let cambiosPend = false;
function renderCambios() {
  const ef = efectivos(); const docs = [...ef].filter(([, d]) => d && d.mapa === mapa); const otros = [...ef].filter(([, d]) => d && d.mapa && d.mapa !== mapa).length;
  $('#bContador').textContent = docs.length + (docs.length === 1 ? ' cambio' : ' cambios');
  $('#bContador').title = 'Cambios en este mapa' + (otros ? ' (y ' + otros + ' en el otro mapa)' : '') + '. Clic para ver la lista.';
  const pc = document.querySelector('.pnl [data-panel="cambios"]'); cambiosPend = !!(pc && pc.hidden); if (cambiosPend) return; /* (2.1 pro f3) la lista solo se rehace si se ve */
  const ft = $('#filtroTipo'), prevT = ft.value; const tipos = [...new Set(docs.map(([, d]) => tipoBase(d.tipo)))].sort();
  ft.innerHTML = '<option value="">Todos los tipos</option>' + tipos.map(t => `<option value="${esc(t)}"${t === prevT ? ' selected' : ''}>${esc(NOMBRES_TIPO[t] || t)}</option>`).join('');
  const fa = $('#filtroAccion').value, fv = ft.value;
  const filas = docs.filter(([, d]) => (!fa || d.accion === fa) && (!fv || tipoBase(d.tipo) === fv)).sort((a, b) => String(b[1].actualizado || '').localeCompare(String(a[1].actualizado || '')));
  const local = !db || sinPermiso;
  $('#listaCambios').innerHTML = filas.slice(0, 400).map(([id, d]) => `<li class="cambio"><button class="ir" data-a="ir" data-id="${esc(id)}" title="Ir al objeto"><span><span class="acc acc-${esc(d.accion)}">${esc(ACC[d.accion] || d.accion)}</span><b>${esc(nombreTipo(d.tipo))}</b>${local && cols.cambios.ov.has(id) ? ' <span class="etq">sin guardar</span>' : ''}</span><small>${esc(detalleDoc(d))}</small>${d.texto ? `<small class="txt">${esc(String(d.texto).slice(0, 140))}</small>` : ''}</button><button class="mini" data-a="revertir" data-id="${esc(id)}" title="Revertir este cambio">Revertir</button></li>`).join('') || `<li class="vacio">${docs.length ? 'Ningún cambio coincide con el filtro.' : 'Todavía no hay cambios en este mapa.'}</li>`;
}
function irACambio(id) {
  const d = efectivos().get(id); if (!d) return;
  let keys = [];
  if (d.id_objeto && nuevos.has(d.id_objeto)) keys = ['n' + d.id_objeto];
  else if (d.ref != null) { const refs = Array.isArray(d.ref) ? d.ref : [d.ref]; keys = refs.filter(r => P[r] && !P[r].del).map(r => 'p' + r); }
  if (keys.length) { seleccionar(keys, { sinTab: true }); encuadrarCaja(cajaEntidades(keys)); }
  else if (d.datos && isFinite(d.datos.x)) { const b = new THREE.Box3(); b.expandByPoint(new V3(d.datos.x - 3, d.datos.y || 0, d.datos.z - 3)); b.expandByPoint(new V3(d.datos.x + 3, (d.datos.y || 0) + 3, d.datos.z + 3)); encuadrarCaja(b); pista('El objeto está borrado: se muestra dónde estaba.'); }
}
async function revertir(id) {
  const d = efectivos().get(id); if (!d) return;
  const msg = d.accion === 'agregar' ? 'Se quitará este objeto nuevo.' : d.accion === 'borrar' ? 'El objeto borrado volverá a aparecer.' : d.accion === 'nota' ? 'Se borrará la nota.' : 'El objeto vuelve a como estaba en el mapa original.';
  if (!await confirmar('¿Revertir este cambio?', msg + ' Se puede deshacer con Ctrl+Z.', 'Revertir')) return;
  guardar([{ id, data: null }]);
}
function textoCambios() {
  const docs = [...efectivos()].filter(([, d]) => d && d.mapa === mapa).sort((a, b) => String(a[1].creado || '').localeCompare(String(b[1].creado || ''))).map(([id, d]) => Object.assign({ id_doc: id }, d));
  return { n: docs.length, texto: JSON.stringify({ mapa, coordenadas: 'juego original (Godot): X = x de Unity, Z = -z de Unity, Y arriba; q = cuaternión en ese sistema; giroY en grados; en objetos nuevos x,y,z es el punto de apoyo en el suelo (origen "base"), en piezas originales es el centro; puntos de habitación/techo relativos a x,z (y en puntos_mundo, absolutos)', generado: ahora(), total: docs.length, capas: capasLista().map(c => ({ nombre: c.nombre, visible: c.visible !== false, bloqueada: !!c.bloqueada })), cambios: docs }, null, 2) };
}
async function copiarCambios() { const { n, texto } = textoCambios(); try { await navigator.clipboard.writeText(texto); pista('Copiados ' + n + ' cambios al portapapeles.'); } catch (e) { copiarManual(texto); } }
function descargarCambios() { const { texto } = textoCambios(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' })); a.download = 'cambios_' + mapa + '_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ====================== modales ====================== */
let modalResolver = null;
function abrirModal(html, clase) {
  const caja = $('#modalCaja'); caja.className = 'caja' + (clase ? ' ' + clase : ''); caja.innerHTML = html; $('#modal').hidden = false;
  return new Promise(r => { modalResolver = r; setTimeout(() => { const f = caja.querySelector('[data-foco]') || caja.querySelector('button'); if (f) f.focus(); }, 20); });
}
function cerrarModal(v) {
  const m = $('#modal'); if (m.hidden) return;
  if (v === true && compPendiente) { const nom = ($('#nomComp') || {}).value || 'Componente'; const ps = compPendiente; compPendiente = null; const id = 'comp-' + Date.now().toString(36); guardarCol('componentes', id, { nombre: nom.trim() || 'Componente', partes: ps.partes, d0: ps.d0, creado: ahora(), autor }); catActual = 'componentes'; pista('Componente «' + nom + '» guardado en el catálogo.'); }
  else if (compPendiente) compPendiente = null;
  if (v === true && $('#ajForm')) { /* ajustes ya aplicados en vivo */ }
  m.hidden = true; $('#modalCaja').innerHTML = ''; const r = modalResolver; modalResolver = null; if (r) r(v);
}
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrarModal(null); });
function confirmar(titulo, texto, ok) { return abrirModal(`<div class="cab">${esc(titulo)}</div><div class="cont"><p style="margin:0">${esc(texto)}</p></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si" data-foco>${esc(ok || 'Aceptar')}</button></div>`).then(v => v === true); }
function copiarManual(texto) {
  abrirModal(`<div class="cab">Copiar cambios</div><div class="cont"><p class="ayuda" style="margin-top:0">El navegador no dejó copiar automáticamente. El texto ya está seleccionado: pulsa Ctrl+C.</p><textarea class="copiar-txt" readonly id="txtCopiar">${esc(texto)}</textarea></div><div class="pie"><button data-a="m-no" class="prim">Cerrar</button></div>`);
  setTimeout(() => { const t = $('#txtCopiar'); if (t) { t.focus(); t.select(); } }, 40);
}
function hojaAtajos() {
  const g = (t, l) => `<h4>${t}</h4>` + l.map(([a, b]) => `<li><span>${b}</span><kbd>${a}</kbd></li>`).join('');
  abrirModal(`<div class="cab">Atajos de teclado y ratón</div><div class="cont"><ul class="atajos">${g('Cámara', [['Rueda', 'Zoom hacia el cursor'], ['Botón central', 'Desplazar (arrastrar)'], ['Botón derecho', 'Orbitar alrededor del cursor (arrastrar)'], ['Inicio', 'Ver todo el mapa'], ['Flechas / W A S D', 'Mover la cámara'], ['Mayús', 'Más rápido'], ['Q / E', 'Girar alrededor'], ['R / RePág', 'Subir'], ['V / AvPág', 'Bajar'], ['Doble clic', 'Centrar en el objeto'], ['F', 'Encuadrar selección (o todo)'], ['1 2 3 4 5', 'Planta, frente, lateral, iso, 1.ª persona']])}
  ${g('Selección y edición', [['Clic', 'Seleccionar'], ['Mayús+clic', 'Añadir / quitar'], ['Ctrl+clic', 'Una pieza dentro de un grupo'], ['Arrastrar →', 'Selección por ventana (dentro)'], ['Arrastrar ←', 'Selección por cruce'], ['Arrastrar selección', 'Mover sobre el suelo'], ['Alt+arrastrar', 'Copiar y mover'], ['M / G / K', 'Gizmo: mover, girar, escalar'], ['Supr', 'Borrar'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'], ['Ctrl+C / Ctrl+V', 'Copiar / pegar en el ratón'], ['Ctrl+D', 'Duplicar'], ['Ctrl+G / Ctrl+Mayús+G', 'Agrupar / desagrupar'], ['Clic derecho corto', 'Menú contextual'], ['Esc', 'Cancelar'], ['?', 'Esta hoja']])}
  ${g('Herramientas', [['Espacio', 'Seleccionar'], ['L', 'Pared'], ['H', 'Habitación'], ['U', 'Puerta'], ['I', 'Ventana'], ['J', 'Suelo / calle'], ['X', 'Techo'], ['B', 'Pintar (Alt+clic: cuentagotas)'], ['P', 'Empujar / tirar'], ['T', 'Medir / guía'], ['C', 'Catálogo'], ['N', 'Nota'], ['R o rueda', 'Girar al colocar'], ['Enter', 'Terminar pared o polígono']])}</ul></div><div class="pie"><button data-a="m-no" class="prim">Cerrar</button></div>`);
}
function abrirAjustes() {
  const c = (k, l, kind, ops) => { const v = AJ[k]; if (kind === 'chk') return `<label class="chk"><input type="checkbox" data-aj="${k}" ${v ? 'checked' : ''}> ${l}</label>`; if (kind === 'sel') return `<label class="campo"><span>${l}</span><select data-aj="${k}">${ops.map(([a, b]) => `<option value="${a}"${String(v) === String(a) ? ' selected' : ''}>${b}</option>`).join('')}</select></label>`; if (kind === 'color') return `<label class="campo"><span>${l}</span><input type="color" data-aj="${k}" value="${esc(v)}"></label>`; return `<label class="campo"><span>${l}: <output>${fmt(v, 2)}</output></span><input type="range" data-aj="${k}" min="${ops[0]}" max="${ops[1]}" step="${ops[2]}" value="${v}"></label>`; };
  abrirModal(`<div class="cab">Ajustes</div><div class="cont" id="ajForm"><div class="ajustes">
  <h4>Cámara</h4>${c('sens', 'Sensibilidad del ratón', 'rng', [0.2, 3, 0.1])}${c('velocidad', 'Velocidad con teclado', 'rng', [0.2, 4, 0.1])}${c('invertirGiro', 'Invertir el giro de la cámara', 'chk')}${c('orbitarCursor', 'Orbitar alrededor de lo que señala el cursor', 'chk')}${c('ayudaHerr', 'Mostrar la ayuda de la herramienta arriba de la vista', 'chk')}${c('invertirZoom', 'Invertir el zoom de la rueda', 'chk')}
  <h4>Edición</h4>${c('ajuste', 'Ajuste a rejilla', 'chk')}${c('inferencias', 'Inferencias (imantar a extremos, medios y ejes)', 'chk')}${c('paso', 'Paso de la rejilla', 'sel', [[0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm'], [0.5, '50 cm'], [1, '1 m'], [5, '5 m']])}${c('angulo', 'Paso del giro', 'sel', [[5, '5°'], [15, '15°'], [45, '45°'], [90, '90°']])}${c('unidades', 'Unidades de las medidas', 'sel', [['m', 'metros'], ['cm', 'centímetros']])}
  <h4>Gráficos y rendimiento</h4>${c('calidad', 'Calidad de imagen', 'sel', [['baja', 'Baja (más fluido)'], ['media', 'Media'], ['alta', 'Alta']])}${c('resolucion', 'Resolución de la vista', 'sel', [[0.5, '50 % (muy fluido)'], [0.75, '75 %'], [1, '100 %']])}${c('distancia', 'Distancia de dibujado', 'sel', [[600, 'Corta (600 m)'], [1200, 'Media (1,2 km)'], [2800, 'Larga (2,8 km)'], [5000, 'Muy larga (5 km)']])}${c('sombras', 'Sombras del sol', 'chk')}${c('mallasReales', 'Mallas reales del juego (puertas, coches, objetos)', 'chk')}
  <h4>Vista</h4>${c('cotas', 'Cotas de lo seleccionado', 'chk')}${c('etiquetas', 'Etiquetas de zonas y habitaciones', 'chk')}${c('minimapa', 'Minimapa', 'chk')}${c('fondo', 'Color del cielo', 'color')}${c('tema', 'Tema', 'sel', [['auto', 'Según el sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']])}
  </div><p class="ayuda">Se guardan en este navegador.</p></div><div class="pie"><button data-a="disp-restablecer" title="Vuelve a poner los paneles en su sitio de fábrica">Restablecer disposición</button><button data-a="aj-reset">Restablecer ajustes</button><button data-a="m-no" class="prim">Cerrar</button></div>`);
}
function cambiarAjuste(el) {
  const k = el.dataset.aj; let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'range') { v = parseFloat(v); const o = el.parentElement.querySelector('output'); if (o) o.textContent = fmt(v, 2); }
  if (k === 'paso' || k === 'angulo' || k === 'resolucion' || k === 'distancia') v = parseFloat(v);
  AJ[k] = v; guardarAjustes(); aplicarAjustes(); renderPanel();
  if (k === 'mallasReales') { pista(v ? 'Cargando las mallas reales…' : 'Sin mallas reales: se ven las cajas (más fluido).'); cargarMapa(mapa); }
}
function verFoto(id, url, opciones) {
  opciones = opciones || {};
  const src = url || blobUrl(id);
  abrirModal(`<div class="cab">Foto de referencia <small style="font-weight:400;color:var(--fg2)">${esc(id)}</small></div><div class="cont"><img class="foto-grande" src="${esc(src)}" alt="Foto de referencia"></div><div class="pie">${opciones.anclar !== false ? `<button data-a="m-flotante" data-id="${esc(id)}">Ver mientras edito</button><button data-a="m-anclar" data-id="${esc(id)}">Anclar en el mapa</button>` : ''}<button data-a="m-no" class="prim">Cerrar</button></div>`);
}
async function cargarGaleria() {
  if (!assets) { $('#galeria').innerHTML = ''; return []; }
  $('#galeria').innerHTML = '<span class="ayuda">Cargando fotos…</span>';
  try { const r = await assets.list(); galeria = (r && r.assets || []).filter(a => /^image\//.test(a.contentType || '')); galeriaCargada = true; }
  catch (e) { $('#galeria').innerHTML = '<span class="ayuda">No se pudo leer la galería (' + esc(e && e.code || e) + ').</span>'; return []; }
  pintarGaleria(); return galeria;
}
function htmlGaleria(lista, accion) {
  const filtro = ($('#filtroFotos') || {}).value || ''; const f = filtro.toLowerCase();
  const l = lista.filter(a => !f || String(a.nombre || a.id).toLowerCase().includes(f)).slice().sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id)));
  let carpeta = null; let h = '';
  for (const a of l) { const nom = String(a.nombre || a.id); const cp = nom.includes('/') ? nom.slice(0, nom.lastIndexOf('/')) : '(raíz)'; if (cp !== carpeta) { carpeta = cp; h += `<div class="carpeta">${esc(cp)}</div>`; } h += `<button data-a="${accion}" data-id="${esc(a.id)}" title="${esc(nom)}"><img src="${esc(a.url || blobUrl(a.id))}" alt="${esc(nom.slice(nom.lastIndexOf('/') + 1))}" loading="lazy"></button>`; }
  return h || '<span class="ayuda">No hay fotos' + (f ? ' que coincidan' : '') + '.</span>';
}
function pintarGaleria() { $('#galeria').innerHTML = htmlGaleria(galeria, 'foto-grande'); }
async function elegirGaleria(multiple, titulo) {
  if (!assets) return [];
  if (!galeriaCargada) await cargarGaleria();
  const elegidas = new Set();
  const p = abrirModal(`<div class="cab">${esc(titulo || 'Elegir de la galería')}</div><div class="cont"><input type="search" id="filtroElegir" placeholder="Buscar…" style="width:100%" data-foco><div class="galeria" id="galElegir">${htmlGaleria(galeria, 'm-toggle')}</div></div><div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-elegir">${multiple ? 'Adjuntar seleccionadas' : 'Usar esta imagen'}</button></div>`);
  const inp = $('#filtroElegir'); if (inp) inp.addEventListener('input', () => { const f = inp.value.toLowerCase(); $$('#galElegir button').forEach(b => { b.hidden = !!f && !String(b.title).toLowerCase().includes(f); }); });
  galElegirEstado = { elegidas, multiple };
  const v = await p; galElegirEstado = null;
  return v === 'elegir' ? [...elegidas] : [];
}
let galElegirEstado = null;
function alinearImagen(url) {
  const pts = [];
  const p = abrirModal(`<div class="cab">Alinear con puntos · paso 1 de 2</div><div class="cont"><p class="ayuda" style="margin-top:0">Haz clic en <b>3 o más puntos</b> de la imagen que reconozcas también en el mapa (esquinas de edificios, del muro, del portón…), lo más separados posible y que no estén en línea. Con 3 o más el editor detecta solo si la imagen va en espejo; con 2 solo gira, mueve y escala.</p><div class="alinear-img" id="alImg"><img src="${esc(url)}" alt="Imagen del calco"></div></div><div class="pie"><button data-a="m-al-reiniciar">Volver a marcar</button><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-al-ok" id="alOk" disabled>Siguiente: marcar en el mapa</button></div>`);
  const cont = $('#alImg');
  cont.addEventListener('click', e => {
    if (pts.length >= 6) return; const img = cont.querySelector('img'); const r = img.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height; if (u < 0 || u > 1 || v < 0 || v > 1) return;
    pts.push([u, v]); const d = document.createElement('div'); d.className = 'pt'; d.textContent = String(pts.length); d.style.left = (u * 100) + '%'; d.style.top = (v * 100) + '%'; cont.appendChild(d);
    if (pts.length >= 2) $('#alOk').disabled = false; $('#alOk').textContent = 'Siguiente: marcar los ' + pts.length + ' puntos en el mapa';
  });
  alinearPts = pts;
  return p.then(v => v === 'al-ok' && pts.length >= 2 ? pts.slice() : null);
}
let alinearPts = null;

/* ====================== subir fotos ====================== */
let archivoDestino = null;
function pedirArchivos(destino, multiple) { if (!assets) { pista('Subir fotos no está disponible.'); return; } archivoDestino = destino; const inp = $('#archivo'); inp.multiple = !!multiple; inp.value = ''; inp.click(); }
$('#archivo').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []); const destino = archivoDestino; archivoDestino = null; if (!files.length || !destino) return;
  const ids = [];
  for (let j = 0; j < files.length; j++) {
    const f = files[j]; pista('Subiendo foto ' + (j + 1) + ' de ' + files.length + '…');
    try { const tipo = f.type || (/\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : 'image/jpeg'); const r = await assets.upload(f, f.type ? undefined : { type: tipo }); ids.push({ id: r.id, url: r.url, nombre: f.name }); }
    catch (err) { pista('No se pudo subir ' + f.name + ': ' + ((err && err.message) || (err && err.code) || 'error')); }
  }
  if (ids.length) { galeriaCargada = false; if (!$('[data-panel="fotos"]').hidden) cargarGaleria(); pista(ids.length === 1 ? 'Foto subida.' : ids.length + ' fotos subidas.'); }
  destino(ids);
});

/* ====================== calcos ====================== */
const calcoMallas = new Map(); const texLoader = new THREE.TextureLoader();
function calcoActual() { const d = calcoSel && efectivos('calcos').get(calcoSel); return d || null; }
function urlCalco(d) { return d.asset ? blobUrl(d.asset) : d.url; }
function actualizarMallaCalco(id, d) {
  let e = calcoMallas.get(id); const url = urlCalco(d);
  if (e && e.url !== url) { quitarMallaCalco(id); e = null; }
  if (!e) {
    const grp = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0xffffff });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.rotation.x = -Math.PI / 2; grp.add(plane); grupoCalcos.add(grp);
    e = { grp, plane, mat, url, aspecto: 1, error: false }; calcoMallas.set(id, e);
    texLoader.load(url, tex => { e.mat.map = tex; e.mat.needsUpdate = true; if (tex.image && tex.image.width) e.aspecto = tex.image.height / tex.image.width; const dd = efectivos('calcos').get(id); if (dd) actualizarMallaCalco(id, dd); sucio = true; }, undefined, () => { e.error = true; renderListaCalcos(); });
  }
  const espejo = d.espejo ? -1 : 1, ancho = Math.max(0.1, +d.ancho || 100);
  e.grp.position.set(+d.x || 0, d.encima ? 0.08 : 0.05, +d.z || 0); e.grp.rotation.y = (+d.giro || 0) * DEG;
  e.plane.scale.set(ancho * espejo, ancho * e.aspecto, 1);
  e.mat.opacity = Math.max(0, Math.min(1, (d.opacidad == null ? 50 : +d.opacidad) / 100));
  e.mat.depthTest = !d.encima; e.plane.renderOrder = d.encima ? 25 : 1;
  e.grp.visible = d.visible !== false && d.mapa === mapa;
  sucio = true;
}
function quitarMallaCalco(id) { const e = calcoMallas.get(id); if (!e) return; grupoCalcos.remove(e.grp); e.plane.geometry.dispose(); if (e.mat.map) e.mat.map.dispose(); e.mat.dispose(); calcoMallas.delete(id); sucio = true; }
function renderCalcos() {
  const ef = efectivos('calcos');
  for (const id of [...calcoMallas.keys()]) { const d = ef.get(id); if (!d || d.mapa !== mapa) quitarMallaCalco(id); }
  for (const [id, d] of ef) if (d && d.mapa === mapa && (d.asset || d.url)) actualizarMallaCalco(id, d);
  if (calcoSel && !ef.has(calcoSel)) calcoSel = null;
  renderListaCalcos();
}
function renderListaCalcos() {
  const ef = efectivos('calcos'); const lista = [...ef].filter(([, d]) => d && d.mapa === mapa).sort((a, b) => String(a[1].creado || '').localeCompare(String(b[1].creado || '')));
  $('#listaCalcos').innerHTML = lista.map(([id, d], j) => { const e = calcoMallas.get(id); return `<li class="calco${id === calcoSel ? ' sel' : ''}"><label><input type="checkbox" data-ca="visible" data-id="${esc(id)}" ${d.visible !== false ? 'checked' : ''} aria-label="Mostrar calco"><img src="${esc(urlCalco(d))}" alt=""><span>${esc(d.nombre || ('Calco ' + (j + 1)))}${e && e.error ? ' (no carga)' : ''}${d.bloqueado ? ' · bloqueado' : ''}</span></label><button data-a="calco-sel" data-id="${esc(id)}">${id === calcoSel ? 'Editando' : 'Editar'}</button></li>`; }).join('') || '<li class="vacio">No hay calcos en este mapa.</li>';
  renderEditorCalco(); avisar('calcos');
}
function renderEditorCalco() {
  const d = calcoActual(); const c = $('#calcoEditor');
  if (!d) { c.innerHTML = ''; return; }
  const bl = !!d.bloqueado, dis = bl ? ' disabled' : '';
  c.innerHTML = `<h3>Calco seleccionado</h3>
  <div class="campos">
   <label class="campo"><span>X (centro)</span><input type="number" step="0.25" data-ck="x" value="${r3(d.x)}"${dis}></label>
   <label class="campo"><span>Z (centro)</span><input type="number" step="0.25" data-ck="z" value="${r3(d.z)}"${dis}></label>
   <label class="campo"><span>Ancho (m)</span><input type="number" step="1" min="0.1" data-ck="ancho" value="${r3(d.ancho)}"${dis}></label>
   <label class="campo"><span>Giro (°)</span><input type="number" step="0.5" data-ck="giro" value="${r3(d.giro || 0)}"${dis}></label>
   <label class="campo ancho"><span>Opacidad: <output id="calcoOp">${Math.round(d.opacidad == null ? 50 : d.opacidad)} %</output></span><input type="range" min="0" max="100" step="1" data-ck="opacidad" value="${d.opacidad == null ? 50 : d.opacidad}"></label>
  </div>
  <label class="chk"><input type="checkbox" data-ck="espejo" ${d.espejo ? 'checked' : ''}${dis}> Espejo horizontal</label>
  <div class="fila"><button data-a="calco-voltear-h"${dis} title="Izquierda ↔ derecha">Voltear ↔</button><button data-a="calco-voltear-v"${dis} title="Arriba ↕ abajo">Voltear ↕ (espejo vertical)</button><button data-a="calco-girar90"${dis}>Girar 90°</button></div>
  <label class="chk"><input type="checkbox" data-ck="encima" ${d.encima ? 'checked' : ''}> Encima de todo</label>
  <label class="chk"><input type="checkbox" data-ck="visible" ${d.visible !== false ? 'checked' : ''}> Mostrar</label>
  <label class="chk"><input type="checkbox" data-ck="bloqueado" ${bl ? 'checked' : ''}> Bloquear (no se puede mover)</label>
  ${d.lat != null ? `<p class="ayuda">Satélite en ${fmt(d.lat, 6)}, ${fmt(d.lon, 6)} · ${fmt(d.metros_por_pixel || 0, 2)} m por píxel.</p>` : ''}
  <label class="chk"><input type="checkbox" data-ck="escala_real" ${d.escala_real ? 'checked' : ''}${dis}> Escala real fija (al alinear solo gira y se mueve)</label>
  <div class="fila"><button data-a="calco-mover"${dis}>Arrastrar en el mapa</button><button data-a="calco-alinear"${dis}>Alinear con puntos</button><button data-a="calco-medida"${dis}>Escala con una medida</button></div>
  <div class="fila"><button data-a="calco-encuadrar">Encuadrar</button><button data-a="calco-ver">Ver imagen</button><button data-a="calco-quitar" class="peligro">Quitar calco</button></div>`;
}
function actualizarValoresCalco(d) { $$('#calcoEditor input[type=number][data-ck]').forEach(el => { if (document.activeElement !== el && d[el.dataset.ck] != null) el.value = r3(d[el.dataset.ck]); }); }
function nuevoCalco(asset, nombre) {
  const t = cam === camO ? ctlP.target : ctl3.target; let ancho = 100;
  if (vista === 'planta') ancho = Math.round((camO.right - camO.left) / camO.zoom * 0.7); else ancho = Math.round(camP.position.distanceTo(ctl3.target) * 0.9);
  const id = 'k-' + mapa + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); const ts = ahora();
  guardarCol('calcos', id, { mapa, asset, url: blobUrl(asset), nombre: nombre || String(asset).split('/').pop(), x: r3(t.x), z: r3(t.z), ancho: Math.max(10, ancho), giro: 0, espejo: false, opacidad: 55, visible: true, encima: false, bloqueado: false, creado: ts, actualizado: ts, autor });
  calcoSel = id; renderListaCalcos(); mostrarTab('calcos');
}
function cambiarCalco(k, v, guardarYa) {
  const d = calcoActual(); if (!d) return; const n = Object.assign({}, d); n[k] = v;
  if (k === 'giro') n.giro = normAng(v);
  if (guardarYa) { n.actualizado = ahora(); guardarCol('calcos', calcoSel, n); } else actualizarMallaCalco(calcoSel, n);
}
/* (2.1) Escala con una medida: dos clics sobre el calco y la medida real; el calco se escala desde el primer punto. */
let medidaCalco = null;
/* (2.1) Techo o rampa con pendiente exacta: inclina la pieza sobre su eje y alarga ese lado (planta / cos) para no cambiar lo que cubre. */
const fmtN = v => String(Math.round(v * 100) / 100);
function datosPend(k) {
  let q, s;
  if (k[0] === 'p') { const z = P[+k.slice(1)]; if (!z || z.t > 4) return null; q = z.q; s = z.s; }
  else { const o = nuevos.get(k.slice(1)); if (!o || SIN_INCL.includes(tipoBase(o.tipo))) return null; q = qDatos(o.datos); s = new V3(+o.datos.sx || 1, +o.datos.sy || 1, +o.datos.sz || 1); }
  const eu = eulerDe(q), ex = Math.abs(eu.z) >= Math.abs(eu.x) ? 'x' : 'z', ang = (ex === 'x' ? eu.z : eu.x) / DEG, L = ex === 'x' ? s.x : s.z;
  const run = L * Math.cos(ang * DEG); return { eje: ex, ang, run, caida: L * Math.sin(Math.abs(ang) * DEG), eu, s };
}
function aplicarPendiente(ang) {
  if (sel.length !== 1) return; const k = sel[0], dp = datosPend(k); if (!dp) return;
  const eje = ($('#tpEje') || {}).value || dp.eje; if (ang == null) ang = parseFloat(($('#tpAng') || {}).value); if (!isFinite(ang)) return;
  ang = Math.max(-75, Math.min(75, ang));
  // Planta a lo largo del eje elegido (con la inclinación actual sobre ese eje).
  const cur = (eje === 'x' ? dp.eu.z : dp.eu.x), L = eje === 'x' ? dp.s.x : dp.s.z, run = L * Math.cos(cur), nuevoL = run / Math.cos(ang * DEG);
  const eu = dp.eu.clone(); if (eje === 'x') { eu.z = ang * DEG; } else { eu.x = ang * DEG; }
  if (k[0] === 'p') { const z = P[+k.slice(1)]; z.q.setFromEuler(eu); if (eje === 'x') z.s.x = nuevoL; else z.s.z = nuevoL; escribirPieza(+k.slice(1)); marcarActualizado(); }
  else { const o = nuevos.get(k.slice(1)); const d = o.datos; d.incX = r3(eu.x / DEG); d.incZ = r3(eu.z / DEG); if (eje === 'x') d.sx = r3(nuevoL); else d.sz = r3(nuevoL); renderNuevo(o); }
  confirmarEdicion(); colocarPivote(); actualizarContorno(); renderPanel();
  pista(ang ? 'Pendiente de ' + fmt(ang, 1) + '°: el lado mide ahora ' + fmt(nuevoL, 2) + ' m y sigue cubriendo ' + fmt(run, 2) + ' m de planta.' : 'Pieza aplanada: ' + fmt(nuevoL, 2) + ' m.');
}
function htmlPendiente() {
  if (sel.length !== 1) return ''; const pend = datosPend(sel[0]); if (!pend) return '';
  return `<div class="techo-pend"><h3>Techo o rampa inclinada</h3><p class="ayuda">Inclina la pieza con una pendiente exacta y alarga el lado para que siga cubriendo la misma planta (lo que mide vista desde arriba). «Aplanar» la deja horizontal con la misma planta.</p><div class="campos"><label class="campo"><span>Pendiente (°)</span><input id="tpAng" type="number" step="0.5" value="${fmtN(pend.ang)}"></label><label class="campo"><span>Cae a lo largo de</span><select id="tpEje"><option value="x"${pend.eje === 'x' ? ' selected' : ''}>Largo X</option><option value="z"${pend.eje === 'z' ? ' selected' : ''}>Ancho Z</option></select></label></div><p class="ayuda">Planta: ${fmt(pend.run, 2)} m · caída: ${fmt(pend.caida, 2)} m (${fmt(Math.tan(pend.ang * DEG) * 100, 0)} %)</p><div class="fila"><button data-a="techo-pend" class="prim">Aplicar pendiente</button><button data-a="techo-plano">Aplanar</button></div></div>`;
}
function terminarMedidaCalco() {
  const mc = medidaCalco; medidaCalco = null; const d = efectivos('calcos').get(mc.id);
  const [a, b] = mc.pts, medido = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!d || medido < 0.05) { limpiarPrevia(); pista('Los puntos están demasiado juntos.'); ponerHerramienta('sel'); return; }
  let real = null;
  abrirModal(`<div class="cab">Escala con una medida</div><div class="cont"><p class="ayuda" style="margin-top:0">Ahora mide <b>${fmt(medido, 2)} m</b> en el calco. ¿Cuánto mide de verdad?</p>
    <label class="campo"><span>Medida real (m)</span><input id="medidaReal" type="number" step="0.01" min="0.01" data-foco></label></div>
    <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Aplicar</button></div>`).then(v => {
    limpiarPrevia(); ponerHerramienta('sel'); mostrarTab('calcos');
    if (v !== true || !(real > 0)) return;
    const f = real / medido;
    const n = Object.assign({}, d, { ancho: r3(d.ancho * f), x: r3(a[0] + (d.x - a[0]) * f), z: r3(a[1] + (d.z - a[1]) * f), escala_real: true, actualizado: ahora() });
    guardarCol('calcos', mc.id, n); pista('Calco escalado ×' + fmt(f, 3) + ': ahora mide ' + fmt(n.ancho, 1) + ' m de ancho. Escala fijada.');
  });
  setTimeout(() => { const i = $('#medidaReal'); if (i) { i.addEventListener('input', () => { real = parseFloat(i.value); }); i.addEventListener('keydown', e => { if (e.key === 'Enter') cerrarModal(true); }); } }, 30);
}
/* (2.1) Mapa satelital real: el servidor arma la imagen a escala (Esri World Imagery) y se pone como calco con su ancho exacto en metros. */
async function calcoSatelital() {
  const ult = ls('oo-editor-sat') || '';
  const vals = { coords: ult, radio: 250 };
  const v = await (() => { const pr = abrirModal(`<div class="cab">Mapa satelital real</div><div class="cont">
    <p class="ayuda" style="margin-top:0">En Google Maps, haz clic derecho sobre el centro del complejo y pulsa las coordenadas para copiarlas (por ejemplo <code>-2.170998, -79.922359</code>). Pégalas aquí.</p>
    <label class="campo ancho"><span>Coordenadas (latitud, longitud)</span><input id="satCoords" type="text" value="${esc(ult)}" placeholder="-2.170998, -79.922359" data-foco></label>
    <label class="campo"><span>Radio alrededor (m)</span><select id="satRadio"><option value="150">150 m</option><option value="250" selected>250 m</option><option value="400">400 m</option><option value="600">600 m</option></select></label>
    <p class="ayuda">La imagen sale a escala real (el ancho del calco se pone solo, en metros). Después usa «Alinear con dos puntos» para girarla y moverla hasta que coincida: con «Escala real fija» no cambia de tamaño.</p></div>
    <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Traer imagen</button></div>`);
    setTimeout(() => { const c = $('#satCoords'), r = $('#satRadio'); if (c) c.addEventListener('input', () => { vals.coords = c.value; }); if (r) r.addEventListener('change', () => { vals.radio = +r.value; }); }, 30);
    return pr; })();
  if (v !== true) return;
  const m = String(vals.coords).replace(/[()°]/g, ' ').match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) { pista('No entiendo esas coordenadas. Pega algo como «-2.170998, -79.922359».'); return; }
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  ls('oo-editor-sat', vals.coords);
  return calcoSatelitalCon(lat, lon, vals.radio);
}
/* (editor v2) trae la imagen satelital de (lat, lon) con ese radio y la pone como calco a escala real; lo usan el diálogo de coordenadas
   y el mapa interactivo (mapa_satelital.js). Devuelve el id del calco o null. */
async function calcoSatelitalCon(lat, lon, radio, opts) {
  opts = opts || {}; radio = +radio || 250;
  pista('Trayendo el mapa satelital… (la primera vez tarda unos segundos)');
  let r;
  try { const res = await fetch('/api/satelital?lat=' + lat + '&lon=' + lon + '&radio=' + radio + '&z=' + (opts.z || 19)); r = await res.json(); if (!res.ok || r.error) throw new Error(r.error || res.status); }
  catch (e) { pista('No se pudo traer el mapa satelital: ' + (e.message || e) + '. ¿Hay conexión a internet?'); return null; }
  const t = cam === camO ? ctlP.target : ctl3.target;
  const id = 'k-' + mapa + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); const ts = ahora();
  guardarCol('calcos', id, { mapa, asset: r.id, url: r.url, nombre: opts.nombre || ('Satélite ' + fmt(lat, 5) + ', ' + fmt(lon, 5)), x: r3(t.x), z: r3(t.z), ancho: r.ancho_m, giro: 0, espejo: false, opacidad: 60, visible: true, encima: false, bloqueado: false, escala_real: true, lat, lon, metros_por_pixel: r.metros_por_pixel, creado: ts, actualizado: ts, autor });
  calcoSel = id; renderListaCalcos(); mostrarTab('calcos', true);
  pista('Mapa satelital puesto a escala real (' + fmt(r.ancho_m, 0) + ' m de lado, ' + fmt(r.metros_por_pixel, 2) + ' m/píxel). Alinéalo con dos puntos.');
  return id;
}
const nuevoCalcoSatelital = calcoSatelitalCon;
/* (2.1) Alineado con N puntos: semejanza por mínimos cuadrados (giro, escala y traslación) probando la imagen normal y en espejo;
   se queda con la de menor error. Con «Escala real fija» la escala no cambia. Convención del calco: punto de imagen (u, v) →
   local ((u-0,5)·W·espejo, (v-0,5)·W·aspecto), girado `giro` sobre Y (x' = x·cos + z·sin, z' = -x·sin + z·cos). */
function resolverAlineado(img, mapa, asp, Wfija, espejoActual) {
  const n = Math.min(img.length, mapa.length); const opciones = n >= 3 ? [1, -1] : [espejoActual ? -1 : 1]; let mejor = null;
  for (const m of opciones) {
    const A = img.slice(0, n).map(([u, v]) => [(u - 0.5) * m, (v - 0.5) * asp]), B = mapa.slice(0, n);
    const ca = [0, 0], cb = [0, 0]; for (let i = 0; i < n; i++) { ca[0] += A[i][0] / n; ca[1] += A[i][1] / n; cb[0] += B[i][0] / n; cb[1] += B[i][1] / n; }
    let re = 0, im = 0, aa = 0;
    for (let i = 0; i < n; i++) { const ax = A[i][0] - ca[0], az = A[i][1] - ca[1], bx = B[i][0] - cb[0], bz = B[i][1] - cb[1]; re += ax * bx + az * bz; im += ax * bz - az * bx; aa += ax * ax + az * az; }
    if (aa < 1e-9) continue;
    const alfa = Math.atan2(im, re), W = Wfija > 0 ? Wfija : Math.hypot(re, im) / aa, c = Math.cos(alfa) * W, sn = Math.sin(alfa) * W;
    let err = 0; for (let i = 0; i < n; i++) { const ax = A[i][0] - ca[0], az = A[i][1] - ca[1]; const px = cb[0] + ax * c - az * sn, pz = cb[1] + ax * sn + az * c; err += (px - B[i][0]) ** 2 + (pz - B[i][1]) ** 2; }
    err = Math.sqrt(err / n);
    // Centro de la imagen (u = v = 0,5 → A = 0): t = cb - R·ca.
    const x = cb[0] - (ca[0] * c - ca[1] * sn), z = cb[1] - (ca[0] * sn + ca[1] * c);
    if (!mejor || err < mejor.err) mejor = { err, W, giro: normAng(-alfa / DEG), x, z, espejo: m < 0 };
  }
  return mejor;
}
function terminarAlineado() {
  if (alinear) {
    const al = alinear; alinear = null; const d = efectivos('calcos').get(al.id); limpiarPrevia();
    if (!d) { ponerHerramienta('sel'); return; }
    const e = calcoMallas.get(al.id); const asp = e ? e.aspecto : 1;
    const r = resolverAlineado(al.img, al.mapa, asp, d.escala_real ? +d.ancho : 0, !!d.espejo);
    if (!r || !(r.W > 0.1)) { pista('Los puntos están demasiado juntos o en línea. Prueba otra vez.'); ponerHerramienta('sel'); return; }
    const n = Object.assign({}, d, { ancho: r3(r.W), giro: r.giro, x: r3(r.x), z: r3(r.z), espejo: r.espejo, actualizado: ahora() });
    guardarCol('calcos', al.id, n); ponerHerramienta('sel'); mostrarTab('calcos');
    pista('Calco alineado con ' + al.img.length + ' puntos: giro ' + fmt(r.giro, 1) + '°' + (al.img.length >= 3 ? (r.espejo ? ', EN ESPEJO' : ', sin espejo') : '') + (d.escala_real ? ', escala real fija' : ', ancho ' + fmt(r.W, 1) + ' m') + '. Error medio: ' + fmt(r.err, 2) + ' m.');
    return;
  }
  const al = alinear; alinear = null; const d = efectivos('calcos').get(al.id); limpiarPrevia();
  if (!d) { ponerHerramienta('sel'); return; }
  const e = calcoMallas.get(al.id); const asp = e ? e.aspecto : 1; const m = d.espejo ? -1 : 1;
  const a = al.img.map(([u, v]) => [(u - 0.5) * m, (v - 0.5) * asp]), b = al.mapa;
  const dax = a[1][0] - a[0][0], daz = a[1][1] - a[0][1], dbx = b[1][0] - b[0][0], dbz = b[1][1] - b[0][1];
  const la = Math.hypot(dax, daz), lb = Math.hypot(dbx, dbz);
  if (la < 1e-4 || lb < 0.05) { pista('Los puntos están demasiado juntos. Prueba otra vez.'); ponerHerramienta('sel'); return; }
  const fija = d.escala_real && d.ancho > 0, W = fija ? +d.ancho : lb / la, th = Math.atan2(daz, dax) - Math.atan2(dbz, dbx);
  // Con la escala fija se hace coincidir el punto medio de los dos puntos (el error se reparte entre ambos).
  if (fija) { const mx = (a[0][0] + a[1][0]) / 2 * W, mz = (a[0][1] + a[1][1]) / 2 * W; const qx = mx * Math.cos(th) + mz * Math.sin(th), qz = -mx * Math.sin(th) + mz * Math.cos(th);
    const n = Object.assign({}, d, { giro: normAng(th / DEG), x: r3((b[0][0] + b[1][0]) / 2 - qx), z: r3((b[0][1] + b[1][1]) / 2 - qz), actualizado: ahora() });
    guardarCol('calcos', al.id, n); ponerHerramienta('sel'); mostrarTab('calcos'); pista('Calco alineado sin cambiar su escala real (giro ' + fmt(n.giro, 1) + '°; diferencia de escala ' + fmt((lb / la / W - 1) * 100, 1) + ' %).'); return; }
  const ox = a[0][0] * W, oz = a[0][1] * W; const rx = ox * Math.cos(th) + oz * Math.sin(th), rz = -ox * Math.sin(th) + oz * Math.cos(th);
  const n = Object.assign({}, d, { ancho: r3(W), giro: normAng(th / DEG), x: r3(b[0][0] - rx), z: r3(b[0][1] - rz), actualizado: ahora() });
  guardarCol('calcos', al.id, n); ponerHerramienta('sel'); mostrarTab('calcos'); pista('Calco alineado: ancho ' + fmt(W, 1) + ' m, giro ' + fmt(n.giro, 1) + '°.');
}
function encuadrarCalco() { const d = calcoActual(); if (!d) return; const e = calcoMallas.get(calcoSel); const w = +d.ancho || 100, h = w * (e ? e.aspecto : 1); const r = Math.max(w, h) / 2; encuadrarCaja(new THREE.Box3(new V3(d.x - r, 0, d.z - r), new V3(d.x + r, 1, d.z + r))); }
function abrirVisor(id) { const lista = galeria.length ? galeria.map(a => a.id) : [id]; let i = lista.indexOf(id); if (i < 0) { lista.unshift(id); i = 0; } visor = { lista, i }; pintarVisor(); $('#visorFlotante').hidden = false; }
function pintarVisor() { const id = visor.lista[visor.i]; if (!id) return; $('#visorImg').src = blobUrl(id); $('#visorTit').textContent = (visor.i + 1) + '/' + visor.lista.length + ' · ' + id; }

/* ====================== estado de conexión ====================== */
function actualizarEstado() {
  const el = $('#estado'), sp = el.querySelector('span'); let cls = '', txt = '', tit = '';
  switch (estadoBD) {
    case 'cargando': cls = 'carg'; txt = 'Conectando… ' + segCarga + ' s'; tit = 'Conectando con el servidor.'; break;
    case 'ok': cls = 'ok'; txt = pendientes > 0 ? 'Guardando…' : 'Guardado'; tit = 'Cada cambio se guarda al soltar, en datos_usuario/*.json.'; break;
    case 'local': cls = 'aviso'; txt = 'Sin servidor: solo esta sesión'; tit = 'No hay servidor de datos: los cambios no se guardan. Usa «Copiar» o «Descargar».'; break;
    case 'perm': cls = 'aviso'; txt = 'Sin permiso para guardar'; tit = 'No se pudo guardar: los cambios quedan en esta sesión.'; break;
    case 'sinresp': cls = 'err'; txt = 'El servidor no responde'; tit = 'No llegó respuesta en 10 s.'; break;
    default: cls = 'err'; txt = 'Error al guardar'; tit = errMsg || 'Error';
  }
  el.className = 'estado ' + cls; sp.textContent = txt; el.title = tit + (errMsg && estadoBD === 'err' ? ' ' + errMsg : '');
}
async function iniciarClaude() {
  actualizarEstado();
  const timer = setInterval(() => { if (estadoBD !== 'cargando') { clearInterval(timer); return; } segCarga = Math.max(0, segCarga - 1); if (segCarga === 0) { estadoBD = 'sinresp'; clearInterval(timer); } actualizarEstado(); }, 1000);
  const usar = n => { try { return (window.claude && window.claude.use) ? Promise.resolve(window.claude.use(n)).catch(() => null) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };
  const [d, u, a] = await Promise.all([usar('db'), usar('user'), usar('assets')]);
  db = d || null; userCap = u || null; assets = a || null;
  $('#app').classList.toggle('sin-assets', !assets); $('#app').classList.toggle('con-assets', !!assets);
  if (userCap) { try { autor = await userCap.id(); } catch (e) { autor = null; } }
  if (!db) { clearInterval(timer); estadoBD = 'local'; actualizarEstado(); renderCambios(); return; }
  for (const col of Object.keys(cols)) {
    try {
      db.collection(col).onSnapshot(snap => {
        if (col === 'cambios') { clearInterval(timer); if (estadoBD === 'cargando' || estadoBD === 'sinresp') estadoBD = sinPermiso ? 'perm' : 'ok'; }
        cols[col].snap = new Map(snap.docs.map(x => [x.id, x.data()]));
        if (col === 'cambios') { if (arrastre || arrDirecto || empEst) pendRecompute = true; else if (D) recompute(); }
        else if (col === 'calcos') { if (!calcoArr) renderCalcos(); }
        else trasCol(col);
        actualizarEstado();
      }, err => { if (col !== 'cambios') return; clearInterval(timer); const c = err && err.code; if (c === 'invalid_argument' || c === 'not_granted') { sinPermiso = true; estadoBD = 'perm'; } else { estadoBD = 'err'; errMsg = (err && err.message) || String(c || err); } actualizarEstado(); });
    } catch (e) { if (col === 'cambios') { clearInterval(timer); estadoBD = 'err'; errMsg = e.message || String(e); actualizarEstado(); } }
  }
  if (assets && !$('[data-panel="fotos"]').hidden) cargarGaleria();
}

/* ====================== corte y filtros ====================== */
let renderProg = false;
function programarRender() { if (renderProg || !D) return; renderProg = true; requestAnimationFrame(() => { renderProg = false; renderTodo(); }); }
function ponerCorte(h) {
  const cr = $('#corte'); const max = +cr.max;
  if (h == null || h >= max) { clip.constant = 1000; cr.value = String(max); $('#corteVal').textContent = 'Todo'; }
  else { clip.constant = h; cr.value = String(h); $('#corteVal').textContent = fmt(h, 1) + ' m'; }
  sucio = true; programarRender();
}
$('#corte').addEventListener('input', e => ponerCorte(+e.target.value));
$('#verCol').addEventListener('change', e => { verCol = e.target.checked; renderTodo(); });
$('#verLuces').addEventListener('change', e => { verLuces = e.target.checked; renderTodo(); });
$('#verNotas').addEventListener('change', e => { verNotas = e.target.checked; renderTodo(); });
$('#verRejilla').addEventListener('change', e => { verRejilla = e.target.checked; grid3.visible = verRejilla && vista !== 'planta'; sucio = true; });
$('#secciones').addEventListener('change', e => { const el = e.target; if (el.dataset.sec != null) { secOn[+el.dataset.sec] = el.checked; renderTodo(); } else if (el.dataset.seclock != null) { secLock[+el.dataset.seclock] = el.checked; if (el.checked) seleccionar(sel.filter(seleccionable)); } });
$('#capas').addEventListener('change', e => { const el = e.target; if (!el.dataset.capa) return; guardarCapa(el.dataset.v, { [el.dataset.capa]: el.checked }); });
$('#filtroAccion').addEventListener('change', renderCambios);
$('#filtroTipo').addEventListener('change', renderCambios);
$('#filtroFotos').addEventListener('input', () => pintarGaleria());

/* ====================== barra y paneles ====================== */
/* (editor v2) barra de herramientas con menús (MENUS) */
const normItem = it => Array.isArray(it) ? { h: it[0], n: it[1], k: it[2] } : it;
function menuDeHerr(h) { if (h === 'colocar') return 'objetos'; if (h === 'medir' && params.medir.modo === 'guia') return 'guias'; for (const m of MENUS) if (m.items.some(it => normItem(it).h === h)) return m.id; return null; }
function renderRail() {
  $('#herramientas').innerHTML = MENUS.map(m => `<button data-rail="${esc(m.id)}" title="${esc(m.n)}${m.items.length > 1 ? ' (clic: elegir herramienta)' : ''}" aria-haspopup="${m.items.length > 1 ? 'menu' : 'false'}">${svg(m.ic)}<span>${esc(m.n)}</span>${m.items.length > 1 ? '<i class="flecha"></i>' : ''}</button>`).join('');
  actualizarRail();
}
function actualizarRail() { const id = herramienta === 'sel' ? 'seleccionar' : menuDeHerr(herramienta); $$('#herramientas [data-rail]').forEach(b => b.classList.toggle('on', b.dataset.rail === id)); $$('#barraFlot [data-h]').forEach(b => b.classList.toggle('on', b.dataset.h === herramienta)); }
function usarItem(it) {
  it = normItem(it);
  if (it.fn) { it.fn(it); return; }
  if (it.h && herrPropias[it.h] && herrPropias[it.h].opciones) herrPropias[it.h].opciones(it);
  if (it.a) { const f = ACCIONES[it.a]; if (f) f({ dataset: { v: it.v, a: it.a } }); return; }
  if (!it.h) return;
  if (it.h === 'medir') { if (it.modo) params.medir.modo = it.modo; if (it.guia) params.medir.guia = it.guia; medirEst = null; }
  if (it.h === 'habitacion') params.habitacion.modo = it.modo || 'rect';
  if (it.h === 'pared' && window.OOPresetsMuro) { if (paredEst) terminarPared(); OOPresetsMuro.aplicar(params.pared, it.preset || ''); } /* (2.1) presets de muro (presets_muro.js) */
  if (it.h === 'suelo' && it.material && MATERIALES[it.material]) { params.suelo.material = it.material; params.suelo.color = MATERIALES[it.material].c; }
  ponerHerramienta(it.h, { forzar: true });
}
function abrirMenuRail(b) {
  const m = MENUS.find(x => x.id === b.dataset.rail); if (!m) return;
  if (m.items.length === 1) { usarItem(m.items[0]); return; }
  const mh = $('#menuHerr');
  mh.innerHTML = `<div class="menu-tit">${esc(m.n)}</div>` + m.items.map((it, j) => { it = normItem(it); const on = it.h && it.h === herramienta && (!it.modo || params[it.h].modo === it.modo) && (!it.guia || params.medir.guia === it.guia) && (!it.material || params.suelo.material === it.material); return `<button role="menuitem" data-rail-it="${j}" class="${on ? 'on' : ''}" title="${esc(it.nota || '')}">${svg(it.ic || (it.h ? (it.h === 'medir' && it.modo === 'guia' ? 'guias' : it.h) : m.ic))}<span>${esc(it.n)}</span>${it.k ? `<kbd>${esc(it.k === 'Espacio' ? 'Esp' : it.k)}</kbd>` : ''}</button>`; }).join('');
  mh.dataset.railMenu = m.id;
  if (window.OOUI) OOUI.abrirMenu('menuHerr', b, { lado: 'derecha', siempre: true });
}
$('#herramientas').addEventListener('click', e => { const b = e.target.closest('[data-rail]'); if (b && vista !== 'caminar') abrirMenuRail(b); });
$('#menuHerr').addEventListener('click', e => { const b = e.target.closest('[data-rail-it]'); if (!b) return; const m = MENUS.find(x => x.id === $('#menuHerr').dataset.railMenu); if (window.OOUI) OOUI.cerrarMenus(); if (m) usarItem(m.items[+b.dataset.railIt]); });
renderRail();
$$('[data-vista]').forEach(b => b.addEventListener('click', () => ponerVista(b.dataset.vista)));
$$('.pestanas [data-tab]').forEach(b => b.addEventListener('click', () => mostrarTab(b.dataset.tab)));
$('#bDeshacer').addEventListener('click', hacerDeshacer);
$('#bRehacer').addEventListener('click', hacerRehacer);
$('#bContador').addEventListener('click', () => mostrarTab('cambios'));
$('#bAtajos').addEventListener('click', hojaAtajos);
$('#bAjustes').addEventListener('click', abrirAjustes);
$('#bTema').addEventListener('click', () => { const oscuro = AJ.tema === 'oscuro' || (AJ.tema !== 'claro' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); AJ.tema = oscuro ? 'claro' : 'oscuro'; guardarAjustes(); aplicarAjustes(); pista('Tema ' + (oscuro ? 'claro' : 'oscuro') + '. «Según el sistema» está en Ajustes.'); });
$('#selMapa').value = mapa;
$('#selMapa').addEventListener('change', async e => {
  const nm = e.target.value; if (nm === mapa) return;
  mapa = nm; ls('oo-editor-mapa', nm); seleccionar([]); ponerHerramienta('sel'); deshacer = []; rehacer = []; actualizarBotonesHistorial(); calcoSel = null; medidas = []; ocultos.clear();
  for (const id of [...calcoMallas.keys()]) quitarMallaCalco(id);
  await cargarMapa(nm);
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.aj) { cambiarAjuste(el); return; }
  if (el.dataset && el.dataset.a === 'ajuste2') { AJ.ajuste = el.checked; guardarAjustes(); aplicarAjusteGizmo(); return; }
  if (el.dataset && el.dataset.ca === 'visible') { const id = el.dataset.id; const d = efectivos('calcos').get(id); if (d) guardarCol('calcos', id, Object.assign({}, d, { visible: el.checked, actualizado: ahora() })); return; }
  if (el.dataset && el.dataset.ck) { const k = el.dataset.ck; const v = el.type === 'checkbox' ? el.checked : parseFloat(el.value); if (el.type !== 'checkbox' && !isFinite(v)) return; cambiarCalco(k, v, true); return; }
  const k = el.dataset && el.dataset.k; if (!k) return;
  const scope = el.closest('[data-scope]'); if (!scope) return;
  let v = el.type === 'number' ? parseFloat(el.value) : el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number' && !isFinite(v)) return;
  if (k === 'pisos') v = Math.max(1, Math.round(v));
  if (scope.dataset.scope === 'tool') cambiarParamHerr(k, v); else cambiarCampoSel(k, v);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.aj && el.type === 'range') { cambiarAjuste(el); return; }
  if (el.dataset && el.dataset.ck && el.type !== 'checkbox') { const v = parseFloat(el.value); if (!isFinite(v)) return; if (el.dataset.ck === 'opacidad') { const o = $('#calcoOp'); if (o) o.textContent = Math.round(v) + ' %'; } cambiarCalco(el.dataset.ck, v, false); }
});

const ACCIONES = {
  /* (editor v2) barra flotante, barra inferior de la vista y atajos a paneles */
  'herr-sel': () => ponerHerramienta('sel'), 'encuadrar-sel': () => { if (sel.length) encuadrarCaja(cajaEntidades(sel)); else todoElMapa(); },
  'snap': () => ponerAjuste('ajuste', !AJ.ajuste), 'rejilla': () => { const c = $('#verRejilla'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); },
  'panel-capas': () => { if (window.OOUI) { const d = OOUI.disp(); if (d.cerrados.includes('capas') || d.plegados.includes('capas')) OOUI.mostrarPanel('capas', true); else OOUI.cerrar('capas', true); } },
  'panel-catalogo': () => mostrarTab('catalogo', true), 'tab-material': () => mostrarTab('material', true), 'tab-notas': () => mostrarTab('notas', true), 'tab-fotos': () => mostrarTab('fotos', true), 'tab-obj': () => mostrarTab('obj', true),
  'esc-candado': () => { escUniforme = !escUniforme; renderPanel(); },
  'minimapa-grande': () => { const p = document.querySelector('.pnl[data-pnl="minimapa"]'); if (p) p.classList.toggle('grande'); },
  'corte-techos': () => ponerCorte(2.6), 'corte-todo': () => ponerCorte(null),
  'sec-todas': () => { secOn.fill(true); renderSecciones(); renderTodo(); }, 'sec-ninguna': () => { secOn.fill(false); renderSecciones(); renderTodo(); },
  'gz': el => ponerGizmo(el.dataset.v), 'grupo': () => seleccionarGrupo(), 'encuadrar': () => encuadrarCaja(cajaEntidades(sel)),
  'duplicar': () => duplicar(), 'borrar': () => borrarSel(),
  'pared-fin': () => terminarPared(), 'herr-fin': () => ponerHerramienta('sel'),
  'param-mat': el => { const h = herramienta; const k = el.dataset.k || 'material'; params[h][k] = el.dataset.v; if (k === 'material') params[h].color = MATERIALES[el.dataset.v].c; if (k === 'matmuro') params[h].colormuro = MATERIALES[el.dataset.v].c; renderPanel(); },
  'param-set': el => { params[herramienta][el.dataset.k] = el.dataset.v; if (herramienta === 'habitacion') { habEst = null; estRect = null; limpiarPrevia(); } if (herramienta === 'medir') medirEst = null; renderPanel(); },
  'sel-mat': el => { if (sel.length !== 1 || sel[0][0] !== 'n') return; const o = nuevos.get(sel[0].slice(1)); o.datos.material = el.dataset.v; o.datos.color = MATERIALES[el.dataset.v].c; renderNuevo(o); confirmarEdicion(); },
  'colocar-girar': () => { params.colocar.giro = normAng(params.colocar.giro + 90); renderPanel(); }, 'tab-catalogo': () => mostrarTab('catalogo'),
  'cat-cat': el => { catActual = el.dataset.v; renderCatalogo(); }, 'cat-item': el => { params.colocar.giro = 0; iniciarColocar(el.dataset.v); },
  'medidas-borrar': () => { medidas = []; medirEst = null; actualizarMedidas(); renderPanel(); }, 'guias-borrar': () => borrarSeleccionGuia(),
  'nota-sin-foto': () => { params.nota.fotoPendiente = null; renderPanel(); actualizarPista(); },
  'nota-guardar': () => guardarNota(false),
  'nota-subir': () => pedirArchivos(ids => { if (!ids.length) return; notaTrabajo.fotos.push(...ids.map(x => x.id)); pintarFotosNota(); guardarNota(true); }, true),
  'nota-galeria': async () => { const ids = await elegirGaleria(true, 'Adjuntar fotos a la nota'); if (!ids.length) return; for (const id of ids) if (!notaTrabajo.fotos.includes(id)) notaTrabajo.fotos.push(id); pintarFotosNota(); guardarNota(true); },
  'nota-quitar-foto': el => { notaTrabajo.fotos.splice(+el.dataset.i, 1); pintarFotosNota(); guardarNota(true); },
  'ver-foto': el => verFoto(el.dataset.id, null, { anclar: true }),
  'ir': el => irACambio(el.dataset.id), 'revertir': el => revertir(el.dataset.id), 'copiar': () => copiarCambios(), 'descargar': () => descargarCambios(),
  'foto-subir-galeria': () => pedirArchivos(() => { }, true), 'galeria-recargar': () => cargarGaleria(),
  'foto-grande': el => { const a = galeria.find(x => x.id === el.dataset.id); verFoto(el.dataset.id, a && a.url); },
  'calco-nuevo-galeria': async () => { const ids = await elegirGaleria(false, 'Elegir imagen para el calco'); if (ids[0]) nuevoCalco(ids[0]); },
  'calco-subir': () => pedirArchivos(ids => { if (ids[0]) nuevoCalco(ids[0].id, ids[0].nombre); }, false),
  'calco-sel': el => { calcoSel = el.dataset.id === calcoSel ? null : el.dataset.id; renderListaCalcos(); },
  'calco-mover': () => { if (!calcoActual()) return; if (vista === 'caminar') ponerVista('planta'); ponerHerramienta('calco-mover'); },
  'calco-alinear': async () => { const d = calcoActual(); if (!d) return; const pts = await alinearImagen(urlCalco(d)); if (!pts) return; if (vista === 'caminar') ponerVista('planta'); ponerHerramienta('calco-alinear'); alinear = { id: calcoSel, img: pts, mapa: [] }; pista('Marca en el mapa el punto 1 de ' + pts.length + ' (en el mismo orden que en la imagen).'); },
  'calco-satelital': () => (window.OOMapaSat ? OOMapaSat.abrir() : calcoSatelital()), 'calco-coordenadas': () => calcoSatelital(), 'techo-pend': () => aplicarPendiente(), 'techo-plano': () => aplicarPendiente(0),
  'calco-medida': () => { const d = calcoActual(); if (!d) return; if (vista === 'caminar') ponerVista('planta'); ponerHerramienta('calco-medida'); medidaCalco = { id: calcoSel, pts: [] }; },
  /* (2.1) Voltear el calco sin moverlo: el espejo vertical es el horizontal más medio giro (así el alineado con puntos lo entiende igual). */
  'calco-voltear-h': () => { const d = calcoActual(); if (d && !d.bloqueado) guardarCol('calcos', calcoSel, Object.assign({}, d, { espejo: !d.espejo, actualizado: ahora() })); },
  'calco-voltear-v': () => { const d = calcoActual(); if (d && !d.bloqueado) guardarCol('calcos', calcoSel, Object.assign({}, d, { espejo: !d.espejo, giro: normAng((+d.giro || 0) + 180), actualizado: ahora() })); },
  'calco-girar90': () => { const d = calcoActual(); if (d && !d.bloqueado) guardarCol('calcos', calcoSel, Object.assign({}, d, { giro: normAng((+d.giro || 0) + 90), actualizado: ahora() })); },
  'calco-encuadrar': () => encuadrarCalco(), 'calco-ver': () => { const d = calcoActual(); if (d) verFoto(d.asset, urlCalco(d), { anclar: false }); },
  'calco-quitar': async () => { const d = calcoActual(); if (!d) return; if (!await confirmar('¿Quitar este calco?', 'La imagen sigue en la galería; solo se quita del mapa.', 'Quitar')) return; const id = calcoSel; calcoSel = null; guardarCol('calcos', id, null); },
  'visor-ant': () => { if (!visor.lista.length) return; visor.i = (visor.i - 1 + visor.lista.length) % visor.lista.length; pintarVisor(); },
  'visor-sig': () => { if (!visor.lista.length) return; visor.i = (visor.i + 1) % visor.lista.length; pintarVisor(); },
  'visor-cerrar': () => { $('#visorFlotante').hidden = true; },
  'vista-rap': el => vistaRapida(+el.dataset.v), 'todo-mapa': () => todoElMapa(), 'norte': () => mirarNorte(),
  'capa-nueva': () => { const n = 'Capa ' + (capasLista().length + 1); guardarCapa(n, { color: '#' + new THREE.Color().setHSL(Math.random(), 0.55, 0.5).getHexString() }); capaActiva = n; ls('oo-editor-capa', n); pista('Capa «' + n + '» creada y activa.'); },
  'capa-activa': el => { capaActiva = el.dataset.v; ls('oo-editor-capa', capaActiva); renderCapas(); pista('Capa activa: ' + capaActiva); },
  'capa-borrar': async el => { const n = el.dataset.v; if (!await confirmar('¿Quitar la capa «' + n + '»?', 'Sus objetos pasan a la capa General.', 'Quitar')) return; const lista = []; for (const o of nuevos.values()) if (capaDeNuevo(o) === n) lista.push(docActualizado(o, { capa: 'General' })); if (lista.length) guardar(lista); const c = capaInfo(n); guardarCol('capas', c.id || idCapa(n), null); if (capaActiva === n) capaActiva = 'General'; },
  'mostrar-ocultos': () => { ocultos.clear(); $('#bOcultos').hidden = true; renderTodo(); },
  'ctx-copiar': () => copiar(), 'ctx-pegar': () => { if (menuCtxEvento) ultimoRaton = menuCtxEvento; pegar(); }, 'ctx-agrupar': () => agrupar(), 'ctx-desagrupar': () => desagrupar(), 'reagrupar-auto': () => reagruparAuto(),
  'ctx-componente': () => guardarComponente(),
  'ctx-techo': () => { const o = sel.length === 1 && nuevos.get(sel[0].slice(1)); if (o && tipoBase(o.tipo) === 'habitacion') techoDeHabitacion(o); },
  'ctx-pintar': () => { const pr = params.pintar; for (const k of sel) { if (k[0] === 'p') { const z = P[+k.slice(1)]; z.c.set(pr.color); z.material = pr.material; } else { const o = nuevos.get(k.slice(1)); if (o) { o.datos.color = pr.color; o.datos.material = pr.material; } } } confirmarEdicion('pintura:' + pr.material); },
  'ctx-ocultar': () => { for (const k of sel) ocultos.add(k); $('#bOcultos').hidden = false; seleccionar([]); renderTodo(); pista('Ocultado. Para verlo otra vez: clic derecho → «Mostrar lo ocultado».'); },
  'ctx-centrar': () => { const e = menuCtxEvento; if (!e) return; const h = pickEvento(e); const p = h ? h.point : puntoPlano(e, 0); if (!p) return; if (vista === 'planta') { const dx = p.x - camO.position.x, dz = p.z - camO.position.z; camO.position.x += dx; camO.position.z += dz; ctlP.target.x += dx; ctlP.target.z += dz; ctlP.update(); } else volarA(p, p.clone().add(camP.position.clone().sub(ctl3.target))); sucio = true; },
  'ctx-nota': () => { const e = menuCtxEvento; if (!e) return; const p = puntoSuelo(e); if (!p) return; const id = crearNuevo('nota', { x: p.x, y: p.y, z: p.z, giroY: 0, sx: 0.5, sy: 2.3, sz: 0.5 }); if (id) { seleccionar(['n' + id]); setTimeout(() => { const t = $('#notaTexto'); if (t) t.focus(); }, 50); } },
  'ctx-medir': () => { const e = menuCtxEvento; ponerHerramienta('medir'); params.medir.modo = 'distancia'; if (e) { const p = puntoMedir(e); if (p) medirEst = { modo: 'distancia', puntos: [p] }; } renderPanel(); },
  'aj-reset': () => { AJ = Object.assign({}, AJ_DEF); guardarAjustes(); aplicarAjustes(); cerrarModal(null); abrirAjustes(); },
  'm-no': () => cerrarModal(null), 'm-si': () => cerrarModal(true), 'm-elegir': () => cerrarModal('elegir'), 'm-al-ok': () => cerrarModal('al-ok'),
  'm-al-reiniciar': () => { if (alinearPts) alinearPts.length = 0; const c = $('#alImg'); if (c) c.querySelectorAll('.pt').forEach(x => x.remove()); const b = $('#alOk'); if (b) b.disabled = true; },
  'm-toggle': el => { const st = galElegirEstado; if (!st) return; const id = el.dataset.id; if (!st.multiple) { st.elegidas.clear(); $$('#galElegir button').forEach(b => b.classList.remove('elegida')); } if (st.elegidas.has(id)) { st.elegidas.delete(id); el.classList.remove('elegida'); } else { st.elegidas.add(id); el.classList.add('elegida'); } },
  'm-flotante': el => { const id = el.dataset.id; cerrarModal(null); abrirVisor(id); },
  'm-anclar': el => { const id = el.dataset.id; cerrarModal(null); if (vista === 'caminar') ponerVista('3d'); params.nota.fotoPendiente = id; if (herramienta !== 'nota') ponerHerramienta('nota'); else { renderPanel(); actualizarPista(); } }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.tagName === 'INPUT') return;
  let a = el.dataset.a; let f = ACCIONES[a];
  if (!f && a.startsWith('ctx-capa:')) { const n = a.slice(9); f = () => moverACapa(n); }
  if (f) { e.preventDefault(); if (el.closest('#menuCtx')) cerrarMenu(); f(el); }
});

/* ====================== (editor v2) barra inferior de la vista: escala gráfica, grilla, snap, colisiones, ejes ====================== */
const ejes = new THREE.AxesHelper(25); ejes.visible = false; ejes.renderOrder = 35; ejes.material.depthTest = false; scene.add(ejes);
function ponerAjuste(k, v) { AJ[k] = v; guardarAjustes(); aplicarAjustes(); renderPanel(); }
function syncBarraVista() {
  const g = $('#selGrilla'); if (g) { const v = String(AJ.paso); if (![...g.options].some(o => o.value === v)) g.insertAdjacentHTML('beforeend', `<option value="${v}">${fmt(+v, 2)} m</option>`); g.value = v; }
  const c = $('#chkSnap'); if (c) c.checked = !!AJ.ajuste; const b = $('#bSnap'); if (b) b.classList.toggle('on', !!AJ.ajuste);
  const r = $('#bRejilla'); if (r) r.classList.toggle('on', verRejilla);
  const e = $('#chkEjes'); if (e) e.checked = !!AJ.ejes; ejes.visible = !!AJ.ejes; ejes.position.set(grid3.position.x, 0.06, grid3.position.z);
  $$('[data-a="gz"]').forEach(x => x.classList.toggle('on', x.dataset.v === gizmoModo));
}
$('#selGrilla').addEventListener('change', e => ponerAjuste('paso', parseFloat(e.target.value)));
$('#chkSnap').addEventListener('change', e => ponerAjuste('ajuste', e.target.checked));
$('#chkEjes').addEventListener('change', e => { AJ.ejes = e.target.checked; guardarAjustes(); syncBarraVista(); sucio = true; });
$('#verRejilla').addEventListener('change', () => syncBarraVista());
const escalaCv = $('#escalaGraf canvas');
let escalaUlt = '';
function dibujarEscala() {
  if (!escalaCv || vista === 'caminar') return;
  const t = vista === 'planta' ? ctlP.target : ctl3.target; const mpp = metrosPorPixel(t.clone()); if (!isFinite(mpp) || mpp <= 0) return;
  const L = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(x => x / mpp >= 110) || 2000, px = Math.min(200, L / mpp);
  const clave = L + '|' + Math.round(px) + '|' + document.documentElement.getAttribute('data-theme'); if (clave === escalaUlt) return; escalaUlt = clave;
  const g = escalaCv.getContext('2d'), W = escalaCv.width, H = escalaCv.height, col = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#222';
  g.clearRect(0, 0, W, H); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5; g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
  const x0 = 6, y = 24; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + px, y); g.stroke();
  [0, 0.25, 0.5, 1].forEach((f, j) => { const x = x0 + px * f; g.beginPath(); g.moveTo(x, y - (j === 0 || j === 3 ? 7 : 4)); g.lineTo(x, y); g.stroke(); const tx = (L * f >= 1 || L * f === 0 ? fmt(L * f, 0) : fmt(L * f, 1)) + (j === 3 ? ' m' : ''); g.textAlign = j === 0 ? 'left' : j === 3 ? 'right' : 'center'; g.fillText(tx, j === 3 ? Math.min(W - 2, x + 14) : x, 3); });
}

/* tema */
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarFondo); } catch (e) { }

/* ====================== arranque ====================== */
configurarControles(); aplicarAjustes(); actualizarBotonesHistorial(); actualizarPista(); renderPanel(); renderCambios(); renderCapas();
ponerVista(vista);
iniciarClaude();
cargarMapa(mapa);
/* ayudas para pruebas automáticas */
window.__editor = {
  estado: () => ({ piezas: N, nuevos: nuevos.size, sel: sel.slice(), herramienta, vista, cambios: [...efectivos()].length, medidas: medidas.length, tipos: [...nuevos.values()].map(o => o.tipo), solape: solapeSel }),
  camara: () => ({ pos: (vista === 'planta' ? camO.position : camP.position).toArray().map(r3), target: (vista === 'planta' ? ctlP.target : ctl3.target).toArray().map(r3), zoom: r3(camO.zoom) }),
  proyectar: p => { cam.updateMatrixWorld(); const v = new V3(p[0], p[1], p[2]).project(cam); const r = dom.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
  nuevo: id => { const o = nuevos.get(id); return o ? { tipo: o.tipo, datos: o.datos } : null; },
  libre: (x, z, r) => { let n = 0; for (const k of ['boxO', 'cylO', 'sph']) { const m = M[k], bb = m.bb; for (let s = 0; s < m.mesh.count; s++) { const o = s * 6; if (bb[o] > bb[o + 3] || bb[o + 4] - bb[o + 1] < 0.05 || bb[o + 3] - bb[o] > 100 || bb[o + 5] - bb[o + 2] > 100) continue; if (bb[o] < x + r && bb[o + 3] > x - r && bb[o + 2] < z + r && bb[o + 5] > z - r) n++; } } return n; },
  ids: tipo => [...nuevos.values()].filter(o => tipoBase(o.tipo) === tipo).map(o => o.id),
  mirar: (t, pos) => { if (vista !== '3d') ponerVista('3d'); anim = null; ctl3.target.fromArray(t); camP.position.fromArray(pos); ctl3.update(); sucio = true; },
  vistaRapida, seleccionar, ponerHerramienta
};
/* (2.1) enganche para modelos_juego.js (mallas reales del catálogo): escena, objetos nuevos, selección, miniaturas y repintado */
window.OOEditor = { scene, clip, nuevos: () => nuevos, mapa: () => mapa, datos: () => D, selSet: () => selSet, marcar: () => { sucio = true; }, miniaturas, renderTodo: () => { if (D) renderTodo(); }, renderCatalogo };
/* (editor v2) API para los módulos de la interfaz nueva (jerarquia.js, catalogo_ui.js, ambiente.js, zonas.js, exportar.js…).
   Los getters devuelven el estado vivo del cierre; las funciones son las mismas que usa el editor (guardan con deshacer). */
Object.assign(window.OOEditor, {
  on: (ev, f) => { (oyentes[ev] = oyentes[ev] || []).push(f); },
  agregarMenu: m => { const i = MENUS.findIndex(x => x.id === m.id); if (i >= 0) MENUS[i] = m; else if (m.antes) { const j = MENUS.findIndex(x => x.id === m.antes); MENUS.splice(j < 0 ? MENUS.length : j, 0, m); } else MENUS.push(m); renderRail(); },
  agregarHerramienta: (idMenu, it) => { const m = MENUS.find(x => x.id === idMenu); if (m) { m.items.push(it); renderRail(); } },
  agregarHerramientaPropia: (h, def) => { NOMBRE_HERR[h] = def.n; PISTAS[h] = def.pista || ''; herrPropias[h] = def; },
  filtrosVis, bloqueos, fuentesItems, instOcultas,
  api: {
    get P() { return P; }, get N() { return N; }, get D() { return D; }, get autos() { return autos; }, get sel() { return sel; }, get vista() { return vista; }, get herramienta() { return herramienta; },
    get cam() { return cam; }, get AJ() { return AJ; }, get capaActiva() { return capaActiva; }, get secOn() { return secOn; }, get secLock() { return secLock; }, get ocultos() { return ocultos; }, get verCol() { return verCol; }, get verLuces() { return verLuces; },
    get limitesMapa() { return limitesMapa; }, get catActual() { return catActual; }, set catActual(v) { catActual = v; }, get params() { return params; }, get dom() { return dom; }, get zonasEtq() { return zonas; },
    camP, camO, ctl3, ctlP, scene, renderer, sol, hemi, cielo, cieloMat, grid3, clip, THREE, ICON, CATEGORIAS, ITEMS, OBJ, MATERIALES, MAT_MURO, MAT_SUELO, DEG,
    esc, fmt, fmtInt, r3, clon, ahora, svg, tipoBase, nombreTipo, nombreEntidades, autoActivo, autoDe: k => autoDe.get(k), grupoDe: k => grupoDe.get(k), expandirGrupos,
    efectivos, guardar, guardarCol, crearNuevo, docNuevo, docActualizado, nuevoId, limpiarDatos, plantillas, pegarPlantillas, partesSeleccion, itemPorId, itemsCategoria, miniatura, iniciarColocar,
    seleccionar, ponerHerramienta, pista, renderTodo: () => { if (D) renderTodo(); }, recompute, renderPanel, renderSecciones, renderCapas, renderCatalogo, mostrarTab, encuadrarCaja, cajaEntidades, cajaEntidad, matricesEntidad, partesMundo, estadoEnt, ponerEstado, existe, visible, seleccionable,
    confirmarEdicion, abrirModal, cerrarModal, confirmar, puntoPlano, puntoSuelo, pickEvento, inferir, ocultarInferencia, mostrarPrevia, limpiarPrevia, ponerVista, vistaRapida, todoElMapa, aplicarFondo, aplicarAjustes, guardarAjustes, ponerAjuste,
    propsDe, leerProps, guardarProps, objetivoProps, capasLista, capaDeNuevo, capaInfo, marcarActualizado, marcar: () => { sucio = true; }, pintarEntidad, calcoSatelitalCon, nuevoCalcoSatelital, cargarMapa: () => cargarMapa(mapa), get mapa() { return mapa; },
    ponerSecOn: (j, v) => { secOn[j] = v; renderSecciones(); renderTodo(); }, ponerSecLock: (j, v) => { secLock[j] = v; renderSecciones(); if (v) seleccionar(sel.filter(seleccionable)); },
    ocultar: (keys, v) => { for (const k of keys) { if (v) ocultos.add(k); else ocultos.delete(k); } $('#bOcultos').hidden = !ocultos.size; renderTodo(); },
    ponerCapaActiva: n => { capaActiva = n; ls('oo-editor-capa', n); renderCapas(); }, guardarCapa, ponerVerCol: v => { verCol = v; $('#verCol').checked = v; renderTodo(); }, ponerVerLuces: v => { verLuces = v; $('#verLuces').checked = v; renderTodo(); }, ponerVerNotas: v => { verNotas = v; $('#verNotas').checked = v; renderTodo(); },
    ponerVerRejilla: v => { verRejilla = v; $('#verRejilla').checked = v; grid3.visible = verRejilla && vista !== 'planta'; syncBarraVista(); sucio = true; }, get verRejilla() { return verRejilla; }, get verNotas() { return verNotas; },
    ponerSolDir: v => { solDir.copy(v).normalize(); sucio = true; }, get solDir() { return solDir; }, ponerDistancia: d => { distDibujo = d; aplicarFondo(); }, get distDibujo() { return distDibujo; },
    grupoGuias, grupoCalcos, grupoTextos, grupoFormas, seleccionarCalco: id => { calcoSel = id; renderListaCalcos(); mostrarTab('calcos', true); }, get calcoSel() { return calcoSel; }, notasMarcas: () => notasMarcas,
    /* (2.1 pro) para entidades.js, anclajes.js, fundaciones.js, paredes.js, habitaciones.js e iman.js */
    hacerDeshacer, hacerRehacer, historial: () => ({ deshacer: deshacer.map(e => ({ etiqueta: e.etiqueta || '', t: e.t || 0, docs: e.length })), rehacer: rehacer.length }), colocarPivote, renderNuevo, actualizarContorno, rayDe, pickRayo, metrosPorPixel, vistaEl,
    poligonosCerrados, detectarHabitaciones, puntosMundoHab, areaPol, centroide, datosHabitacion, dentroPoligono, datosMuro, matPrevia, matPreviaMal, matPreviaAviso, previa, avisar, get etqVivas() { return etqVivas; }, set etqVivas(v) { etqVivas = v; }, punto3D,
    get planoTrabajo() { return planoTrabajo; }, set planoTrabajo(v) { planoTrabajo = +v || 0; }, ponerCorte, get corte() { return clip.constant >= 999 ? null : clip.constant; }, crearCuartoRect, get parcialStats() { return parcialStats; }, huecosInstancias, compactarSiHace, /* (2.1 pro f6) */ /* (2.1 pro f3) */
    /* (2.1 pro f5) transformar.js, geometria.js, jerarquia_pro.js y productividad.js */
    docModOrig, escalarSel, girarSelY, duplicar, copiar, pegar, agrupar, desagrupar, ponerGizmo, actualizarMedidas, get medidas() { return medidas; }, set medidas(v) { medidas = v; }, get tc() { return tc; }, get pivote() { return pivote; }, get grupoDeMapa() { return grupoDe; },
    get pasosDeshacer() { return deshacer; }, get pasosRehacer() { return rehacer; }, ponerEtiquetaUltima: t => { const e = deshacer[deshacer.length - 1]; if (e) e.etiqueta = t; }, get pendientes() { return pendientes; }, actualizarBotonesHistorial,
    get ultimoRaton() { return ultimoRaton; }, get M() { return M; }, matrizPieza, get selSet() { return selSet; }, get paredEst() { return paredEst; }, abrirMenuCtx: abrirMenu, iniciarArrastreCat: id => { arrastreCat = id; params.colocar.item = id; params.colocar.giro = 0; if (herramienta !== 'colocar') ponerHerramienta('colocar'); }, terminarArrastreCat: () => { arrastreCat = null; },
    /* (2.1) notas_editor.js y caminar_pro.js */
    pedirArchivos, elegirGaleria, andar, get menuCtxEvento() { return menuCtxEvento; }, cerrarMenu
  }
});
window.dispatchEvent(new Event('oo-editor-listo'));
/* pruebas automáticas: con ?prueba en la URL se puede evaluar código dentro del editor */
if (/[?&]prueba(&|$)/.test(location.search)) window.__ooEval = c => eval(c);
})();
