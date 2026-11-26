/* Mallas de las piezas: las mismas formas unitarias (centradas, tamaño 1) que api/app/modelos.py, para que lo que se ve en el creador
   sea lo que se guarda. La pieza se coloca con position = centro, rotation = giro (grados, XYZ) y scale = tamano. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FormaPieza, Pieza } from '../tipos';

const SEG = 20;
const cache = new Map<string, THREE.BufferGeometry>();

function prisma(): THREE.BufferGeometry {
  // sección triangular en XY (base abajo, vértice arriba), extruida en Z: tejado a dos aguas con la cumbrera a lo largo de Z
  const A = [-0.5, -0.5], B = [0.5, -0.5], C = [0, 0.5];
  const v: number[] = [];
  const tri = (p: number[][]) => p.forEach(q => v.push(q[0], q[1], q[2]));
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { tri([a, b, c]); tri([a, c, d]); };
  const at = (p: number[], z: number) => [p[0], p[1], z];
  quad(at(A, 0.5), at(A, -0.5), at(B, -0.5), at(B, 0.5));
  quad(at(B, 0.5), at(B, -0.5), at(C, -0.5), at(C, 0.5));
  quad(at(C, 0.5), at(C, -0.5), at(A, -0.5), at(A, 0.5));
  tri([at(A, 0.5), at(B, 0.5), at(C, 0.5)]);
  tri([at(A, -0.5), at(C, -0.5), at(B, -0.5)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function cupula(): THREE.BufferGeometry {
  const s = new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  s.scale(1, 2, 1).translate(0, -0.5, 0);
  const base = new THREE.CircleGeometry(0.5, 16).rotateX(Math.PI / 2).translate(0, -0.5, 0);
  return mergeGeometries([s.toNonIndexed(), base.toNonIndexed()]) || s;
}

export function geometria(forma: FormaPieza, arriba = 1): THREE.BufferGeometry {
  const k = forma + (forma === 'cilindro' ? ':' + arriba.toFixed(2) : '');
  let g = cache.get(k);
  if (!g) {
    switch (forma) {
      case 'caja': g = new THREE.BoxGeometry(1, 1, 1); break;
      case 'cilindro': g = new THREE.CylinderGeometry(0.5 * arriba, 0.5, 1, SEG); break;
      case 'cono': g = new THREE.ConeGeometry(0.5, 1, SEG); break;
      case 'esfera': g = new THREE.SphereGeometry(0.5, 24, 16); break;
      case 'cupula': g = cupula(); break;
      default: g = prisma();
    }
    cache.set(k, g);
  }
  return g;
}

export function material(p: Pieza): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  pintarMaterial(m, p);
  return m;
}

export function pintarMaterial(m: THREE.MeshStandardMaterial, p: Pieza): void {
  const opa = p.opacidad ?? 1;
  m.color.set(p.color);
  m.roughness = p.rugosidad ?? 0.75;
  m.metalness = p.metal ?? 0;
  m.opacity = opa;
  m.transparent = opa < 1;
  m.depthWrite = opa >= 1;
  m.side = opa < 1 ? THREE.DoubleSide : THREE.FrontSide;
  m.emissive.set(p.brillo ? p.color : '#000000');
  m.emissiveIntensity = p.brillo ? 1 : 0;
  m.needsUpdate = true;
}

const R = THREE.MathUtils.degToRad;
export function colocar(o: THREE.Object3D, p: Pieza): void {
  o.position.set(p.centro[0], p.centro[1], p.centro[2]);
  const g = p.giro || [0, 0, 0];
  o.rotation.set(R(g[0]), R(g[1]), R(g[2]), 'XYZ');
  o.scale.set(p.tamano[0], p.tamano[1], p.tamano[2]);
}

export function malla(p: Pieza): THREE.Mesh {
  const m = new THREE.Mesh(geometria(p.forma, p.arriba ?? 1), material(p));
  m.castShadow = true; m.receiveShadow = true;
  colocar(m, p);
  return m;
}

export const ICONOS: Record<FormaPieza, string> = {
  caja: '<svg viewBox="0 0 32 32"><path d="M16 4 27 9.5v13L16 28 5 22.5v-13z" fill="currentColor" fill-opacity=".14"/><path d="M5 9.5 16 15l11-5.5M16 15v13M16 4 27 9.5v13L16 28 5 22.5v-13z"/></svg>',
  cilindro: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="8" rx="9" ry="3.5" fill="currentColor" fill-opacity=".14"/><path d="M7 8v16c0 2 4 3.5 9 3.5s9-1.5 9-3.5V8"/><ellipse cx="16" cy="8" rx="9" ry="3.5"/></svg>',
  cono: '<svg viewBox="0 0 32 32"><path d="M16 4 25 24c0 2-4 3.5-9 3.5S7 26 7 24z" fill="currentColor" fill-opacity=".14"/><path d="M16 4 25 24M16 4 7 24"/><path d="M7 24c0 2 4 3.5 9 3.5s9-1.5 9-3.5"/></svg>',
  esfera: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="currentColor" fill-opacity=".14"/><circle cx="16" cy="16" r="11"/><path d="M5 16c0 3 5 5 11 5s11-2 11-5" stroke-dasharray="2 2"/></svg>',
  cupula: '<svg viewBox="0 0 32 32"><path d="M5 22a11 11 0 0 1 22 0z" fill="currentColor" fill-opacity=".14"/><path d="M5 22a11 11 0 0 1 22 0"/><ellipse cx="16" cy="22" rx="11" ry="3.5"/></svg>',
  prisma: '<svg viewBox="0 0 32 32"><path d="M3 25 11 11l8 14z" fill="currentColor" fill-opacity=".14"/><path d="M3 25 11 11l8 14zM11 11l9-4 8 14-9 4"/></svg>',
};

export const NOMBRES: Record<FormaPieza, string> = { caja: 'Caja', cilindro: 'Cilindro', cono: 'Cono', esfera: 'Esfera', cupula: 'Cúpula', prisma: 'Tejado' };
export const PISTAS: Record<FormaPieza, string> = {
  caja: 'Paredes, tablas, patas, mesas', cilindro: 'Postes, troncos, ruedas, columnas', cono: 'Pinos, puntas, conos de tráfico',
  esfera: 'Copas de árbol, bolas, lámparas', cupula: 'Cúpulas, tapas, iglús', prisma: 'Tejados a dos aguas, rampas',
};
