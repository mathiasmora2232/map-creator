/* Creador de assets (/creador): un editor sencillo para hacer objetos 3D con piezas (caja, cilindro, cono, esfera, cúpula, tejado),
   pensado para quien no sabe modelar. Plantillas para empezar, formas con un clic, flechas para mover/girar/escalar, colores y
   acabados con botones, deshacer, borrador automático y la IA para crear o cambiar el modelo con palabras.
   Guarda en la biblioteca (POST /api/biblioteca/modelos, PUT /api/biblioteca/modelos/{id}) con las piezas, así se puede volver a abrir
   (?id=<asset>). El .glb y la miniatura los genera el servidor (api/app/modelos.py) con las mismas formas que pinta formas.ts. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { api, aviso, esc, ErrorApi } from '../comun';
import { $, $$, ls } from '../dom';
import type { FormaPieza, Pieza, Proyecto, V3 } from '../tipos';
import { colocar, geometria, ICONOS, malla, NOMBRES, pintarMaterial, PISTAS } from './formas';
import { ACABADOS, acabadoDe, CATEGORIAS, EJEMPLOS_IA, PALETA, PLANTILLAS } from './plantillas';

const FORMAS: FormaPieza[] = ['caja', 'cilindro', 'cono', 'esfera', 'cupula', 'prisma'];
const TAM_INICIAL: Record<FormaPieza, V3> = { caja: [1, 1, 1], cilindro: [0.6, 1, 0.6], cono: [0.8, 1.2, 0.8], esfera: [0.8, 0.8, 0.8], cupula: [1, 0.5, 1], prisma: [1.4, 0.7, 1.2] };
let claveBorrador = 'mc-creador-borrador';   // + id del usuario (arrancar): cada cuenta tiene su borrador en este navegador
const MAX_HISTORIA = 120;
const r2 = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;
const num = (v: number): string => r2(v, 2).toString().replace('.', ',');
const GRAD = THREE.MathUtils.radToDeg;

/* ───────────── estado ───────────── */
let piezas: Pieza[] = [];
let mallas: THREE.Mesh[] = [];
let sel: number[] = [];
let assetId: string | null = null;     // asset que se está editando (si es mío, Guardar lo actualiza)
let assetMio = false;
let meta = { descripcion: '', categoria: 'general', visibilidad: 'privada' };
let historia: string[] = [], hPos = -1;
let iman = true, guardadoEn = '';
let iaActiva = false, iaOcupada = false;
const params = new URLSearchParams(location.search);

/* ───────────── escena ───────────── */
const vista = $('#crVista');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
vista.prepend(renderer.domElement);

const escena = new THREE.Scene();
const oscuro = (): boolean => getComputedStyle(document.documentElement).colorScheme.includes('dark');
const pmrem = new THREE.PMREMGenerator(renderer);
escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camara = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
camara.position.set(4.5, 3.5, 6);

const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.position.set(6, 10, 7);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.bias = -0.0004;
escena.add(sol, sol.target, new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.5));

const suelo = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.18 }));
suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true;
escena.add(suelo);
let rejilla = new THREE.GridHelper(20, 40);
function colores(): void {
  const o = oscuro();
  escena.background = new THREE.Color(o ? 0x16191d : 0xe9ecef);
  escena.remove(rejilla);
  rejilla = new THREE.GridHelper(20, 40, o ? 0x4a525c : 0xa9b0b8, o ? 0x2a3037 : 0xd2d7dc);
  (rejilla.material as THREE.Material).transparent = true; (rejilla.material as THREE.Material).opacity = 0.9;
  escena.add(rejilla);
}
colores();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', colores);

// persona de 1,75 m para comparar tamaños (no se guarda)
const persona = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: 0x8d969e, roughness: 0.8, transparent: true, opacity: 0.4, depthWrite: false });
  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.95, 4, 12), m); cuerpo.position.y = 0.2 + 0.475 + 0.15; cuerpo.scale.set(1, 1, 0.65);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), m); cabeza.position.y = 1.63;
  persona.add(cuerpo, cabeza);
  persona.userData.ignorar = true;
}
escena.add(persona);

const orbita = new OrbitControls(camara, renderer.domElement);
orbita.enableDamping = true; orbita.target.set(0, 0.8, 0);
orbita.maxPolarAngle = Math.PI * 0.495;

const gizmo = new TransformControls(camara, renderer.domElement);
gizmo.setSize(0.9);
escena.add(gizmo.getHelper());
const pivote = new THREE.Object3D();   // para mover varias piezas a la vez
escena.add(pivote);
let pivoteAntes = new THREE.Vector3();
const marcos: THREE.BoxHelper[] = [];
const acento = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#e2690b');

function ajustarIman(): void {
  gizmo.setTranslationSnap(iman ? 0.05 : null);
  gizmo.setRotationSnap(iman ? THREE.MathUtils.degToRad(15) : null);
  gizmo.setScaleSnap(iman ? 0.05 : null);
}
ajustarIman();

// La barra de la IA tapa la parte de abajo: el centro de la imagen se sube a la mitad del hueco libre (entre la barra de herramientas
// y la de la IA), así «Encuadrar» deja el modelo a la vista.
let libre = 1;   // parte de la altura (virtual) de la imagen que queda a la vista entre las dos barras
function redimensionar(): void {
  const w = vista.clientWidth, h = Math.max(1, vista.clientHeight);
  renderer.setSize(w, h, false);
  const abajo = ($('#crIa').offsetHeight || 0) + 12, arriba = ($('.cr-herr').offsetHeight || 0) + 10;
  const off = Math.max(0, Math.min(h * 0.3, abajo - arriba));
  libre = Math.max(0.35, (h - abajo - arriba) / (h + off));
  camara.aspect = w / h;
  if (off > 0) camara.setViewOffset(w, h + off, 0, off, w, h); else camara.clearViewOffset();
  camara.updateProjectionMatrix();
}
new ResizeObserver(redimensionar).observe(vista);
new ResizeObserver(redimensionar).observe($('#crIa'));

function bucle(): void {
  orbita.update();
  for (const m of marcos) m.update();
  renderer.render(escena, camara);
  requestAnimationFrame(bucle);
}

/* ───────────── piezas ↔ mallas ───────────── */
const grupo = new THREE.Group();
escena.add(grupo);

function pintarTodo(): void {
  for (const m of mallas) { grupo.remove(m); (m.material as THREE.Material).dispose(); }
  mallas = piezas.map((p, i) => { const m = malla(p); m.userData.i = i; grupo.add(m); return m; });
  sel = sel.filter(i => i < piezas.length);
  seleccionar(sel, false);
}

function actualizarMalla(i: number): void {
  const p = piezas[i], m = mallas[i];
  if (!m) return;
  m.geometry = geometria(p.forma, p.arriba ?? 1);
  pintarMaterial(m.material as THREE.MeshStandardMaterial, p);
  colocar(m, p);
}

function desdeMalla(i: number): void {
  const m = mallas[i], p = piezas[i];
  p.centro = [r2(m.position.x), r2(m.position.y), r2(m.position.z)];
  const g: V3 = [r2(GRAD(m.rotation.x), 1), r2(GRAD(m.rotation.y), 1), r2(GRAD(m.rotation.z), 1)];
  if (g.some(v => v !== 0)) p.giro = g; else delete p.giro;
  m.scale.set(Math.max(0.01, Math.abs(m.scale.x)), Math.max(0.01, Math.abs(m.scale.y)), Math.max(0.01, Math.abs(m.scale.z)));
  p.tamano = [r2(m.scale.x), r2(m.scale.y), r2(m.scale.z)];
}

function caja(): THREE.Box3 {
  const b = new THREE.Box3();
  for (const m of mallas) b.expandByObject(m);
  return b;
}

/* ───────────── selección ───────────── */
function seleccionar(indices: number[], repintarPanel = true): void {
  sel = [...new Set(indices)].filter(i => i >= 0 && i < mallas.length);
  for (const b of marcos) { escena.remove(b); b.dispose(); }
  marcos.length = 0;
  for (const i of sel) { const b = new THREE.BoxHelper(mallas[i], acento); escena.add(b); marcos.push(b); }
  if (sel.length === 1) gizmo.attach(mallas[sel[0]]);
  else if (sel.length > 1) {
    const c = new THREE.Vector3();
    for (const i of sel) c.add(mallas[i].position);
    pivote.position.copy(c.divideScalar(sel.length)); pivote.rotation.set(0, 0, 0); pivote.scale.set(1, 1, 1);
    pivoteAntes = pivote.position.clone();
    gizmo.setMode('translate'); marcarModo('translate');
    gizmo.attach(pivote);
  } else gizmo.detach();
  if (repintarPanel) { panelPropiedades(); lista(); }
}

gizmo.addEventListener('dragging-changed', (e: any) => {
  orbita.enabled = !e.value;
  if (!e.value) confirmar();
});
gizmo.addEventListener('objectChange', () => {
  if (gizmo.object === pivote) {
    const d = pivote.position.clone().sub(pivoteAntes);
    pivoteAntes = pivote.position.clone();
    for (const i of sel) { mallas[i].position.add(d); desdeMalla(i); }
  } else if (sel.length === 1) desdeMalla(sel[0]);
  medidas();
  if (sel.length === 1) refrescarCampos();
});

// clic en la vista: elegir (Mayús o Ctrl para añadir a la selección); un arrastre mueve la cámara y no cambia la selección
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let abajo: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', e => { abajo = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!abajo || Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 5 || (gizmo as any).dragging) { abajo = null; return; }
  abajo = null;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camara);
  const hit = ray.intersectObjects(mallas, false)[0];
  const i = hit ? (hit.object.userData.i as number) : -1;
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (i < 0) return;
    seleccionar(sel.includes(i) ? sel.filter(j => j !== i) : [...sel, i]);
  } else seleccionar(i < 0 ? [] : [i]);
});

/* ───────────── historia y borrador ───────────── */
function confirmar(): void {
  const s = JSON.stringify(piezas);
  if (historia[hPos] === s) { medidas(); return; }
  historia = historia.slice(0, hPos + 1); historia.push(s);
  if (historia.length > MAX_HISTORIA) historia.shift();
  hPos = historia.length - 1;
  despuesDeCambio();
}
function despuesDeCambio(): void {
  medidas(); lista(); botonesHistoria(); guardarBorrador();
  $('#crGuia').hidden = piezas.length > 0 || ls('mc-creador-guia') === 'no';
  estado();
}
function irHistoria(paso: number): void {
  const n = hPos + paso;
  if (n < 0 || n >= historia.length) return;
  hPos = n; piezas = JSON.parse(historia[hPos]);
  pintarTodo(); panelPropiedades(); despuesDeCambio();
}
function botonesHistoria(): void {
  $('[data-a=deshacer]').toggleAttribute('disabled', hPos <= 0);
  $('[data-a=rehacer]').toggleAttribute('disabled', hPos >= historia.length - 1);
}
function guardarBorrador(): void {
  try { localStorage.setItem(claveBorrador, JSON.stringify({ id: assetId, mio: assetMio, nombre: nombre(), meta, piezas })); } catch { /* sin almacenamiento */ }
}
function estado(): void {
  const s = JSON.stringify(piezas) + nombre();
  $('#crEstado').textContent = !piezas.length ? '' : guardadoEn === s ? 'Guardado' : assetId && assetMio ? 'Cambios sin guardar' : 'Sin guardar';
}
const nombre = (): string => ($('#crNombre') as HTMLInputElement).value.trim() || 'Mi objeto';

function cargar(ps: Pieza[], opciones: { nombre?: string; encuadrar?: boolean; reiniciar?: boolean } = {}): void {
  piezas = JSON.parse(JSON.stringify(ps));
  if (opciones.nombre) ($('#crNombre') as HTMLInputElement).value = opciones.nombre;
  sel = [];
  pintarTodo(); panelPropiedades();
  if (opciones.reiniciar) { historia = []; hPos = -1; }
  confirmar();
  if (opciones.encuadrar !== false) encuadrar();
}

/* ───────────── acciones sobre piezas ───────────── */
function anadir(forma: FormaPieza): void {
  const t = [...TAM_INICIAL[forma]] as V3;
  let centro: V3 = [0, t[1] / 2, 0];
  if (sel.length) {   // encima de lo elegido
    const b = new THREE.Box3(); for (const i of sel) b.expandByObject(mallas[i]);
    const c = b.getCenter(new THREE.Vector3());
    centro = [r2(c.x), r2(b.max.y + t[1] / 2), r2(c.z)];
  } else if (piezas.length) {   // al lado del modelo, en el suelo
    const b = caja();
    centro = [r2(b.max.x + t[0] / 2 + 0.3), t[1] / 2, r2((b.min.z + b.max.z) / 2)];
  }
  const ultimo = sel.length ? piezas[sel[sel.length - 1]] : null;
  piezas.push({ forma, centro, tamano: t, color: ultimo?.color || '#c8a273', nombre: NOMBRES[forma] });
  pintarTodo(); seleccionar([piezas.length - 1]); confirmar();
}

function duplicar(espejo = false): void {
  if (!sel.length) return;
  const nuevas = sel.map(i => {
    const p: Pieza = JSON.parse(JSON.stringify(piezas[i]));
    if (espejo) {
      p.centro[0] = r2(-p.centro[0]);
      if (p.giro) p.giro = [p.giro[0], r2(-p.giro[1], 1), r2(-p.giro[2], 1)];
    } else { p.centro[0] = r2(p.centro[0] + 0.25); p.centro[2] = r2(p.centro[2] + 0.25); }
    return p;
  });
  const desde = piezas.length;
  piezas.push(...nuevas);
  pintarTodo(); seleccionar(nuevas.map((_, k) => desde + k)); confirmar();
  if (espejo && nuevas.every(p => Math.abs(p.centro[0]) < 0.01)) aviso('La copia en espejo cae en el mismo sitio: la pieza está en el centro (X = 0).');
}

function borrar(): void {
  if (!sel.length) return;
  const fuera = new Set(sel);
  piezas = piezas.filter((_, i) => !fuera.has(i));
  sel = []; pintarTodo(); panelPropiedades(); confirmar();
}

function alSuelo(): void {
  if (!sel.length) return;
  const b = new THREE.Box3(); for (const i of sel) b.expandByObject(mallas[i]);
  for (const i of sel) { mallas[i].position.y -= b.min.y; desdeMalla(i); }
  confirmar(); refrescarCampos();
}

function cambiar(f: (p: Pieza) => void, guardar = true): void {
  for (const i of sel) { f(piezas[i]); actualizarMalla(i); }
  medidas();
  if (guardar) confirmar();
}

/* ───────────── panel izquierdo ───────────── */
function panelIzquierdo(): void {
  $('#crFormas').innerHTML = FORMAS.map(f => `<button class="cr-forma" data-forma="${f}" title="${esc(PISTAS[f])}">${ICONOS[f]}<span>${NOMBRES[f]}</span></button>`).join('');
  $('#crPlantillas').innerHTML = PLANTILLAS.map(p => `<button class="cr-plantilla" data-plantilla="${p.id}"><span class="cr-pl-mini" data-mini="${p.id}"></span><span>${esc(p.nombre)}</span></button>`).join('')
    + '<button class="cr-plantilla vacia" data-plantilla=""><span class="cr-pl-mini">+</span><span>Vacío</span></button>';
  miniPlantillas();
}

// miniaturas de las plantillas: se pintan una vez con un renderizador aparte
function miniPlantillas(): void {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setSize(160, 120); r.toneMapping = THREE.ACESFilmicToneMapping;
  const e = new THREE.Scene(); e.environment = escena.environment;
  e.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.8));
  const l = new THREE.DirectionalLight(0xffffff, 1.6); l.position.set(5, 8, 6); e.add(l);
  const c = new THREE.PerspectiveCamera(35, 4 / 3, 0.05, 500);
  for (const p of PLANTILLAS) {
    const g = new THREE.Group(); p.piezas.forEach(q => g.add(malla(q))); e.add(g);
    const b = new THREE.Box3().setFromObject(g), s = b.getBoundingSphere(new THREE.Sphere());
    c.position.copy(s.center).add(new THREE.Vector3(1, 0.7, 1.25).normalize().multiplyScalar(s.radius * 3)); c.lookAt(s.center);
    r.render(e, c);
    const el = document.querySelector<HTMLElement>(`[data-mini="${p.id}"]`);
    if (el) el.innerHTML = `<img src="${r.domElement.toDataURL()}" alt="">`;
    e.remove(g);
  }
  r.dispose();
}

function lista(): void {
  $('#crNPiezas').textContent = piezas.length ? `(${piezas.length})` : '';
  $('#crLista').innerHTML = piezas.length ? piezas.map((p, i) => `<li><button data-pieza="${i}" class="${sel.includes(i) ? 'activa' : ''}">
      <i style="background:${esc(p.color)}"></i><span>${esc(p.nombre || NOMBRES[p.forma])}</span><small>${NOMBRES[p.forma]}</small></button></li>`).join('')
    : '<li class="cr-vacia">Todavía no hay piezas.</li>';
}

/* ───────────── panel de propiedades ───────────── */
const deslizador = (campo: string, etiqueta: string, v: number, min: number, max: number, paso: number, unidad = 'm'): string =>
  `<label class="cr-desl"><span>${etiqueta}</span><input type="range" data-campo="${campo}" min="${min}" max="${max}" step="${paso}" value="${v}">
   <input type="number" data-campo="${campo}" step="${paso}" value="${v}" aria-label="${etiqueta}"><em>${unidad}</em></label>`;

function panelPropiedades(): void {
  const el = $('#crProps');
  if (!sel.length) {
    const b = caja(), t = b.isEmpty() ? null : b.getSize(new THREE.Vector3());
    el.innerHTML = `<h2>El modelo</h2>
      ${t ? `<dl class="cr-datos"><dt>Ancho</dt><dd>${num(t.x)} m</dd><dt>Alto</dt><dd>${num(t.y)} m</dd><dt>Fondo</dt><dd>${num(t.z)} m</dd><dt>Piezas</dt><dd>${piezas.length}</dd></dl>
        <button class="btn peq ancho" data-a="todo">Elegir todas las piezas</button>` : '<p class="cr-ayuda">Añade una forma o elige una plantilla para empezar.</p>'}
      <h3 class="cr-sub">Cómo se usa</h3>
      <ul class="cr-trucos">
        <li><b>Clic</b> en una pieza para elegirla; <b>Mayús + clic</b> para elegir varias.</li>
        <li>Arrastra con el <b>botón izquierdo</b> para girar la cámara, con el <b>derecho</b> para desplazarla y la <b>rueda</b> para acercarte.</li>
        <li>Las flechas de colores mueven la pieza; cambia a <b>Girar</b> o <b>Tamaño</b> arriba.</li>
        <li>La base del objeto queda en el suelo al guardarlo, y el frente mira hacia ti (eje Z).</li>
      </ul>
      <h3 class="cr-sub">Atajos</h3>
      <dl class="cr-atajos mono"><dt>W E R</dt><dd>Mover · Girar · Tamaño</dd><dt>Ctrl+D</dt><dd>Duplicar</dd><dt>M</dt><dd>Copia en espejo</dd><dt>Supr</dt><dd>Borrar</dd>
        <dt>Ctrl+Z / Y</dt><dd>Deshacer / Rehacer</dd><dt>F</dt><dd>Encuadrar</dd><dt>Flechas</dt><dd>Mover 5 cm (Mayús: 50 cm)</dd><dt>Esc</dt><dd>Soltar selección</dd></dl>`;
    return;
  }
  const p = piezas[sel[0]], varias = sel.length > 1, ac = acabadoDe(p), g = p.giro || [0, 0, 0];
  const tmax = (v: number) => Math.max(4, Math.ceil(v * 2));
  el.innerHTML = `<h2>${varias ? sel.length + ' piezas' : `<input type="text" class="cr-nombre-pieza" data-campo="nombre" value="${esc(p.nombre || '')}" placeholder="${NOMBRES[p.forma]}" maxlength="40" aria-label="Nombre de la pieza">`}</h2>
    <div class="cr-botones">
      <button class="btn peq" data-a="duplicar" title="Ctrl+D">Duplicar</button>
      <button class="btn peq" data-a="espejo" title="Copia al otro lado (M)">Espejo</button>
      <button class="btn peq" data-a="suelo" title="Bajar hasta el suelo">Al suelo</button>
      <button class="btn peq peligro" data-a="borrar" title="Supr">Borrar</button>
    </div>
    ${varias ? '' : `<h3 class="cr-sub">Forma</h3><div class="cr-formas mini">${FORMAS.map(f => `<button class="cr-forma${f === p.forma ? ' activa' : ''}" data-cambiar-forma="${f}" title="${NOMBRES[f]}">${ICONOS[f]}</button>`).join('')}</div>`}
    <h3 class="cr-sub">Color</h3>
    <div class="cr-paleta">${PALETA.map(c => `<button data-color="${c}" style="background:${c}" class="${c === p.color.toLowerCase() ? 'activa' : ''}" title="${c}" aria-label="Color ${c}"></button>`).join('')}
      <label class="cr-color-libre" title="Otro color"><input type="color" data-campo="color" value="${esc(p.color)}"><span>+</span></label></div>
    <h3 class="cr-sub">Acabado</h3>
    <div class="cr-acabados">${ACABADOS.map(a => `<button data-acabado="${a.id}" class="${a.id === ac ? 'activa' : ''}"><i class="ac-${a.id}" style="--c:${esc(p.color)}"></i>${a.nombre}</button>`).join('')}</div>
    ${varias ? '<p class="cr-ayuda">Con varias piezas elegidas puedes moverlas juntas y cambiarles el color y el acabado. Para el tamaño y el giro, elige una sola.</p>' : `
    <h3 class="cr-sub">Tamaño</h3>
    ${deslizador('tx', 'Ancho', p.tamano[0], 0.02, tmax(p.tamano[0]), 0.01)}
    ${deslizador('ty', 'Alto', p.tamano[1], 0.02, tmax(p.tamano[1]), 0.01)}
    ${deslizador('tz', 'Fondo', p.tamano[2], 0.02, tmax(p.tamano[2]), 0.01)}
    ${p.forma === 'cilindro' ? deslizador('arriba', 'Punta', p.arriba ?? 1, 0, 2, 0.05, '×') : ''}
    <h3 class="cr-sub">Posición</h3>
    <div class="cr-xyz">${['x', 'y', 'z'].map((k, j) => `<label><span>${k.toUpperCase()}</span><input type="number" step="0.05" data-campo="c${k}" value="${p.centro[j]}"></label>`).join('')}</div>
    <h3 class="cr-sub">Giro</h3>
    ${deslizador('gy', 'Girar', g[1], -180, 180, 1, '°')}
    ${deslizador('gx', 'Inclinar ↕', g[0], -180, 180, 1, '°')}
    ${deslizador('gz', 'Inclinar ↔', g[2], -180, 180, 1, '°')}
    <details class="cr-fino"><summary>Ajuste fino del material</summary>
      ${deslizador('rugosidad', 'Rugosidad', p.rugosidad ?? 0.75, 0, 1, 0.05, '')}
      ${deslizador('metal', 'Metal', p.metal ?? 0, 0, 1, 0.05, '')}
      ${deslizador('opacidad', 'Opacidad', p.opacidad ?? 1, 0.05, 1, 0.05, '')}
    </details>`}`;
}

// valores de los campos tras mover con el gizmo (sin repintar el panel: no se pierde el foco)
function refrescarCampos(): void {
  if (sel.length !== 1) return;
  const p = piezas[sel[0]], g = p.giro || [0, 0, 0];
  const v: Record<string, number> = { tx: p.tamano[0], ty: p.tamano[1], tz: p.tamano[2], cx: p.centro[0], cy: p.centro[1], cz: p.centro[2], gx: g[0], gy: g[1], gz: g[2] };
  for (const el of $$('#crProps [data-campo]')) {
    const k = el.dataset.campo as string;
    if (k in v && el !== document.activeElement) {
      if (el.type === 'range' && +el.max < v[k]) el.max = String(Math.ceil(v[k] * 2));
      el.value = String(v[k]);
    }
  }
}

function aplicarCampo(k: string, valor: string): void {
  const n = parseFloat(valor);
  cambiar(p => {
    if (k === 'nombre') { if (valor.trim()) p.nombre = valor.trim().slice(0, 40); else delete p.nombre; return; }
    if (k === 'color') { p.color = valor; return; }
    if (!Number.isFinite(n)) return;
    if (k[0] === 't' && k.length === 2) p.tamano['xyz'.indexOf(k[1])] = Math.max(0.01, n);
    else if (k[0] === 'c' && k.length === 2) p.centro['xyz'.indexOf(k[1])] = n;
    else if (k[0] === 'g' && k.length === 2) { const g = p.giro || [0, 0, 0]; g['xyz'.indexOf(k[1])] = n; p.giro = g; }
    else if (k === 'arriba') p.arriba = n;
    else if (k === 'rugosidad' || k === 'metal' || k === 'opacidad') p[k] = n;
  }, false);
  for (const b of marcos) b.update();
}

const props = $('#crProps');
props.addEventListener('input', e => {
  const el = e.target as HTMLInputElement, k = el.dataset.campo;
  if (!k) return;
  aplicarCampo(k, el.value);
  // el deslizador y la casilla del mismo campo van juntos
  for (const o of $$(`#crProps [data-campo="${k}"]`)) if (o !== el) o.value = el.value;
  if (k === 'nombre') lista();
});
props.addEventListener('change', e => { if ((e.target as HTMLElement).dataset.campo) confirmar(); });
props.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  if (b.dataset.color) { cambiar(p => { p.color = b.dataset.color as string; }); panelPropiedades(); }
  else if (b.dataset.acabado) {
    const a = ACABADOS.find(x => x.id === b.dataset.acabado);
    if (a) { cambiar(p => { Object.assign(p, a.valores); if (!p.brillo) delete p.brillo; }); panelPropiedades(); }
  } else if (b.dataset.cambiarForma) {
    cambiar(p => { p.forma = b.dataset.cambiarForma as FormaPieza; if (p.forma !== 'cilindro') delete p.arriba; if (!p.nombre || Object.values(NOMBRES).includes(p.nombre)) p.nombre = NOMBRES[p.forma]; });
    panelPropiedades(); lista();
  }
});

/* ───────────── medidas y cámara ───────────── */
function medidas(): void {
  const b = caja();
  if (b.isEmpty()) { $('#crMedidas').textContent = ''; persona.position.set(-1, 0, 0); return; }
  const t = b.getSize(new THREE.Vector3());
  $('#crMedidas').textContent = `${num(t.x)} × ${num(t.y)} × ${num(t.z)} m · ${piezas.length} ${piezas.length === 1 ? 'pieza' : 'piezas'}` + (b.min.y > 0.005 || b.min.y < -0.005 ? ' · se apoyará en el suelo al guardar' : '');
  persona.position.set(b.min.x - 0.6, 0, (b.min.z + b.max.z) / 2);
}

function encuadrar(dir?: THREE.Vector3): void {
  const b = caja();
  const s = b.isEmpty() ? new THREE.Sphere(new THREE.Vector3(-0.5, 0.9, 0), 2.6) : b.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(0.6, s.radius);
  const d = (dir || camara.position.clone().sub(orbita.target)).normalize();
  // ángulo útil: el vertical que dejan libre las barras o el horizontal si la vista es estrecha (móvil)
  const tV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)), tU = Math.min(tV * libre, tV * camara.aspect);
  orbita.target.copy(s.center);
  camara.position.copy(s.center).add(d.multiplyScalar(r / Math.sin(Math.atan(tU)) * 1.08));
  camara.near = Math.max(0.01, r / 100); camara.far = r * 200; camara.updateProjectionMatrix();
}

function marcarModo(m: string): void { for (const b of $$('[data-modo]')) b.classList.toggle('activa', b.dataset.modo === m); }
function modo(m: 'translate' | 'rotate' | 'scale'): void {
  if (sel.length > 1 && m !== 'translate') { aviso('Para girar o cambiar el tamaño, elige una sola pieza.'); return; }
  gizmo.setMode(m); marcarModo(m);
}

/* ───────────── IA ───────────── */
async function pedirIa(texto: string): Promise<void> {
  if (iaOcupada || !texto.trim()) return;
  const cambiarActual = piezas.length > 0 && ($('#crIaCambiar') as HTMLInputElement).checked;
  iaOcupada = true;
  const btn = $('#crIaBtn'), msj = $('#crIaMsj'), campo = $('#crIaTexto') as HTMLInputElement;
  btn.setAttribute('disabled', ''); campo.disabled = true; btn.innerHTML = '<span class="cr-giro"></span>Pensando…';
  msj.hidden = false; msj.className = 'cr-ia-msj'; msj.textContent = cambiarActual ? 'La IA está cambiando tu modelo… puede tardar un minuto.' : 'La IA está diseñando el objeto… puede tardar un minuto.';
  try {
    const r = await fetch('/api/asistente/piezas', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pedido: texto, piezas: cambiarActual ? piezas : null, nombre: nombre(), seleccion: cambiarActual ? sel : [] }),
    });
    const j = await r.json().catch(() => ({ error: 'Respuesta no válida del servidor.' }));
    if (!r.ok || j.error) throw new ErrorApi(j.error || 'Algo salió mal (' + r.status + ').', j.status || r.status);
    if (!j.piezas) { msj.textContent = j.mensaje; return; }
    cargar(j.piezas, { nombre: cambiarActual && nombre() !== 'Mi objeto' ? undefined : j.nombre, encuadrar: !cambiarActual });
    msj.textContent = (j.mensaje || 'Listo.') + ' Si no te gusta, pulsa Deshacer.';
    campo.value = '';
    ($('#crIaCambiar') as HTMLInputElement).checked = true;
  } catch (e) {
    msj.className = 'cr-ia-msj err'; msj.textContent = e.message || 'No se pudo generar.';
  } finally {
    iaOcupada = false; btn.removeAttribute('disabled'); campo.disabled = false; btn.textContent = 'Generar';
    iaOpciones();
  }
}
function iaOpciones(): void {
  $('#crIaCambiarL').hidden = !piezas.length;
  $('#crIaEj').innerHTML = (piezas.length ? EJEMPLOS_IA.slice(2) : EJEMPLOS_IA.slice(0, 2)).map(t => `<button type="button" data-ejemplo="${esc(t)}">${esc(t)}</button>`).join('');
}

/* ───────────── guardar ───────────── */
async function abrirGuardar(): Promise<void> {
  if (!piezas.length) { aviso('Añade alguna pieza antes de guardar.', 'err'); return; }
  const d = $('#crGuardar') as unknown as HTMLDialogElement, f = $('#crGuardarForm') as unknown as HTMLFormElement;
  (f.elements.namedItem('nombre') as HTMLInputElement).value = nombre();
  ($('#crCategoria') as HTMLSelectElement).innerHTML = CATEGORIAS.map(c => `<option${c === meta.categoria ? ' selected' : ''}>${esc(c)}</option>`).join('');
  (f.elements.namedItem('descripcion') as HTMLTextAreaElement).value = meta.descripcion;
  (f.elements.namedItem('visibilidad') as HTMLSelectElement).value = meta.visibilidad;
  (f.elements.namedItem('visibilidad') as HTMLSelectElement).disabled = !!(assetId && assetMio);
  $('#crGuardarErr').textContent = '';
  $('#crGuardarOk').textContent = assetId && assetMio ? 'Guardar cambios' : 'Guardar';
  $('#crGuardarCopia').hidden = !(assetId && assetMio);
  d.showModal();
  try {
    const ps = (await api<Proyecto[]>('/api/proyectos')).filter(p => p.rol !== 'lector' && !p.archivado);
    const elegido = params.get('proyecto') || '';
    ($('#crProyecto') as HTMLSelectElement).innerHTML = '<option value="">— Ninguno —</option>'
      + ps.map(p => `<option value="${esc(p.id)}"${p.id === elegido ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('');
  } catch { /* sin proyectos: se guarda solo en la biblioteca */ }
}

async function guardar(comoNuevo: boolean): Promise<void> {
  const f = $('#crGuardarForm') as unknown as HTMLFormElement, fd = new FormData(f);
  const nom = String(fd.get('nombre') || '').trim() || nombre(), proyecto = String(fd.get('proyecto') || '') || null;
  meta = { descripcion: String(fd.get('descripcion') || ''), categoria: String(fd.get('categoria') || 'general'), visibilidad: String(fd.get('visibilidad') || meta.visibilidad) };
  ($('#crNombre') as HTMLInputElement).value = nom;
  const btns = $$('#crGuardar .cr-dialogo-pie .btn'); btns.forEach(b => b.setAttribute('disabled', ''));
  try {
    const actualizar = assetId && assetMio && !comoNuevo;
    const r = actualizar
      ? await api(`/api/biblioteca/modelos/${encodeURIComponent(assetId as string)}`, { method: 'PUT', json: { piezas, nombre: nom, descripcion: meta.descripcion, categoria: meta.categoria, proyecto } })
      : await api('/api/biblioteca/modelos', { method: 'POST', json: { piezas, nombre: nom, descripcion: meta.descripcion, categoria: meta.categoria, visibilidad: meta.visibilidad, proyecto } });
    assetId = r.asset.id; assetMio = true;
    // el servidor apoya el modelo en el suelo y lo centra: el creador enseña lo que quedó guardado
    if (Array.isArray(r.piezas) && JSON.stringify(r.piezas) !== JSON.stringify(piezas)) { const s = sel; cargar(r.piezas, { encuadrar: false }); seleccionar(s); }
    history.replaceState(null, '', '/creador?id=' + encodeURIComponent(assetId as string) + (params.get('proyecto') ? '&proyecto=' + encodeURIComponent(params.get('proyecto') as string) : ''));
    guardadoEn = JSON.stringify(piezas) + nombre();
    guardarBorrador(); estado();
    ($('#crGuardar') as unknown as HTMLDialogElement).close();
    aviso(proyecto ? `Guardado y añadido al mapa. En el editor: catálogo → Importados.` : actualizar ? 'Cambios guardados en tu biblioteca.' : 'Guardado en tu biblioteca.');
  } catch (e) {
    $('#crGuardarErr').textContent = e.message || 'No se pudo guardar.';
  } finally { btns.forEach(b => b.removeAttribute('disabled')); }
}

async function descargar(): Promise<void> {
  if (!piezas.length) { aviso('Todavía no hay nada que descargar.', 'err'); return; }
  try {
    const r = await fetch('/api/biblioteca/modelos/glb', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piezas, nombre: nombre() }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'No se pudo generar el .glb.'); }
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = nombre().replace(/[^\w.\- ]+/g, '_') + '.glb'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { aviso(e.message, 'err'); }
}

/* ───────────── eventos ───────────── */
document.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const b = t.closest<HTMLElement>('[data-a],[data-forma],[data-plantilla],[data-pieza],[data-modo],[data-vista],[data-pestana],[data-ejemplo]');
  if (!b || b.closest('#crProps') && !b.dataset.a) return;
  if (b.dataset.forma) anadir(b.dataset.forma as FormaPieza);
  else if (b.dataset.plantilla !== undefined) {
    const p = PLANTILLAS.find(x => x.id === b.dataset.plantilla);
    if (piezas.length && !confirm('¿Cambiar el modelo actual por esta plantilla? (Puedes deshacerlo con Ctrl+Z.)')) return;
    cargar(p ? p.piezas : [], { nombre: p ? p.nombre : 'Mi objeto' });
    if (!assetMio) assetId = null;
    $('#crIaMsj').hidden = true;
  } else if (b.dataset.pieza !== undefined) {
    const i = +b.dataset.pieza;
    seleccionar((e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey ? (sel.includes(i) ? sel.filter(j => j !== i) : [...sel, i]) : [i]);
  } else if (b.dataset.modo) modo(b.dataset.modo as 'translate');
  else if (b.dataset.vista) {
    const v = b.dataset.vista;
    encuadrar(v === 'frente' ? new THREE.Vector3(0, 0.15, 1) : v === 'lado' ? new THREE.Vector3(1, 0.15, 0) : v === 'arriba' ? new THREE.Vector3(0, 1, 0.001) : undefined);
  } else if (b.dataset.pestana) {
    for (const x of $$('[data-pestana]')) { x.classList.toggle('activa', x === b); x.setAttribute('aria-selected', String(x === b)); }
    for (const x of $$('[data-panel]')) x.hidden = x.dataset.panel !== b.dataset.pestana;
  } else if (b.dataset.ejemplo) { ($('#crIaTexto') as HTMLInputElement).value = b.dataset.ejemplo; ($('#crIaTexto') as HTMLInputElement).focus(); }
  else switch (b.dataset.a) {
    case 'deshacer': irHistoria(-1); break;
    case 'rehacer': irHistoria(1); break;
    case 'duplicar': duplicar(); break;
    case 'espejo': duplicar(true); break;
    case 'borrar': borrar(); break;
    case 'suelo': alSuelo(); break;
    case 'todo': seleccionar(piezas.map((_, i) => i)); break;
    case 'guardar': abrirGuardar(); break;
    case 'descargar': descargar(); break;
    case 'iman': iman = !iman; b.classList.toggle('activa', iman); ajustarIman(); break;
    case 'persona': persona.visible = !persona.visible; b.classList.toggle('activa', persona.visible); break;
    case 'cerrar-guia': ls('mc-creador-guia', 'no'); $('#crGuia').hidden = true; break;
    case 'ver-plantillas': e.preventDefault(); (document.querySelector('[data-pestana=plantillas]') as HTMLElement).click(); break;
    case 'nuevo':
      if (piezas.length && guardadoEn !== JSON.stringify(piezas) + nombre() && !confirm('¿Empezar un objeto nuevo? Lo que no hayas guardado se pierde.')) return;
      assetId = null; assetMio = false; meta = { descripcion: '', categoria: 'general', visibilidad: 'privada' }; guardadoEn = '';
      history.replaceState(null, '', '/creador' + (params.get('proyecto') ? '?proyecto=' + encodeURIComponent(params.get('proyecto') as string) : ''));
      cargar([], { nombre: 'Mi objeto', reiniciar: true });
      $('#crIaMsj').hidden = true;
      break;
  }
});

$('#crNombre').addEventListener('input', () => { guardarBorrador(); estado(); });
$('#crIa').addEventListener('submit', e => { e.preventDefault(); pedirIa(($('#crIaTexto') as HTMLInputElement).value); });
$('#crGuardarForm').addEventListener('submit', e => {
  const v = (e as SubmitEvent).submitter?.getAttribute('value');
  if (v === 'cancelar') return;
  e.preventDefault();
  guardar(v === 'copia');
});

document.addEventListener('keydown', e => {
  const t = e.target as HTMLElement;
  if ((t instanceof HTMLElement && t.matches('input, textarea, select')) || ($('#crGuardar') as unknown as HTMLDialogElement).open) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (ctrl && k === 'z') { e.preventDefault(); irHistoria(e.shiftKey ? 1 : -1); }
  else if (ctrl && k === 'y') { e.preventDefault(); irHistoria(1); }
  else if (ctrl && k === 'd') { e.preventDefault(); duplicar(); }
  else if (ctrl && k === 'a') { e.preventDefault(); seleccionar(piezas.map((_, i) => i)); }
  else if (ctrl && k === 's') { e.preventDefault(); abrirGuardar(); }
  else if (ctrl) return;
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); borrar(); }
  else if (k === 'escape') seleccionar([]);
  else if (k === 'w') modo('translate');
  else if (k === 'e') modo('rotate');
  else if (k === 'r') modo('scale');
  else if (k === 'm') duplicar(true);
  else if (k === 'f') encuadrar();
  else if (k.startsWith('arrow') || k === 'pageup' || k === 'pagedown') {
    if (!sel.length) return;
    e.preventDefault();
    const d = e.shiftKey ? 0.5 : 0.05;
    const v = { arrowleft: [-d, 0, 0], arrowright: [d, 0, 0], arrowup: [0, 0, -d], arrowdown: [0, 0, d], pageup: [0, d, 0], pagedown: [0, -d, 0] }[k] as number[];
    for (const i of sel) { mallas[i].position.add(new THREE.Vector3(v[0], v[1], v[2])); desdeMalla(i); }
    if (sel.length > 1) pivote.position.add(new THREE.Vector3(v[0], v[1], v[2])), pivoteAntes.copy(pivote.position);
    refrescarCampos(); confirmar();
  }
});

window.addEventListener('beforeunload', e => {
  if (piezas.length && assetId && guardadoEn && guardadoEn !== JSON.stringify(piezas) + nombre()) e.preventDefault();
});

/* ───────────── arranque ───────────── */
async function arrancar(): Promise<void> {
  panelIzquierdo(); redimensionar(); bucle();
  api<{ asistente?: boolean }>('/api/config').then(c => {
    iaActiva = !!c.asistente;
    $('#crIa').classList.toggle('apagada', !iaActiva);
    if (!iaActiva) $('#crIa').innerHTML = '<p class="cr-ia-off">La IA no está activada en este servidor: el administrador tiene que añadir la clave de Claude. Todo lo demás funciona.</p>';
  }).catch(() => { /* sin config: se queda la barra; si falla, lo dirá al pedir */ });
  iaOpciones();

  try { const yo = await api<{ id: string }>('/api/cuenta/yo'); claveBorrador += ':' + yo.id; } catch { /* sin sesión: api() ya redirige */ }
  const id = params.get('id');
  if (id) {
    try {
      const a = await api<{ id: string; nombre: string; descripcion: string; categoria: string; visibilidad: string; mio: boolean; piezas: Pieza[] }>(`/api/biblioteca/assets/${encodeURIComponent(id)}/piezas`);
      const copia = params.get('copia') === '1' || !a.mio;
      assetId = copia ? null : a.id; assetMio = !copia;
      meta = { descripcion: a.descripcion, categoria: a.categoria, visibilidad: copia ? 'privada' : a.visibilidad };
      cargar(a.piezas, { nombre: copia ? a.nombre + ' (copia)' : a.nombre, reiniciar: true });
      if (!copia) guardadoEn = JSON.stringify(piezas) + nombre();
      estado();
      if (copia) { history.replaceState(null, '', '/creador'); aviso('Es una copia: al guardarla se crea un modelo nuevo tuyo.'); }
      return;
    } catch (e) { aviso(e.message || 'No se pudo abrir ese modelo.', 'err'); }
  }
  let b: any = null;
  try { b = JSON.parse(localStorage.getItem(claveBorrador) || 'null'); } catch { /* nada */ }
  if (b && Array.isArray(b.piezas) && b.piezas.length) {
    assetId = b.id || null; assetMio = !!b.mio; if (b.meta) meta = b.meta;
    if (assetId) {   // ¿sigue existiendo y es mío? si no, el borrador se guardará como un modelo nuevo
      const a = await api<{ mio: boolean }>(`/api/biblioteca/assets/${encodeURIComponent(assetId)}`, { sinRedirigir: true }).catch(() => null);
      if (!a || !a.mio) { assetId = null; assetMio = false; }
    }
    cargar(b.piezas, { nombre: b.nombre, reiniciar: true });
    if (assetId) history.replaceState(null, '', '/creador?id=' + encodeURIComponent(assetId) + (params.get('proyecto') ? '&proyecto=' + encodeURIComponent(params.get('proyecto') as string) : ''));
    aviso('Recuperado tu último borrador.');
  } else cargar([], { reiniciar: true, encuadrar: true });
}

arrancar();
