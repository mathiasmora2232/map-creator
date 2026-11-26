/* Plantillas para empezar, colores y acabados del creador de assets. Las plantillas son piezas como las que guarda la biblioteca. */
import type { Pieza } from '../tipos';

export interface Plantilla { id: string; nombre: string; piezas: Pieza[] }

const MADERA = '#8b5a2b', MADERA_C = '#b4864f', HIERRO = '#2f3438', PIEDRA = '#9c968a';
const metal = { metal: 0.8, rugosidad: 0.35 };

const patas = (dx: number, dz: number, alto: number, grueso: number, color: string, nombre = 'Pata'): Pieza[] =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ forma: 'caja', centro: [sx * dx, alto / 2, sz * dz], tamano: [grueso, alto, grueso], color, nombre }));

export const PLANTILLAS: Plantilla[] = [
  { id: 'banco', nombre: 'Banco de parque', piezas: [
    ...[-0.15, 0, 0.15].map((z): Pieza => ({ forma: 'caja', centro: [0, 0.45, z], tamano: [1.8, 0.05, 0.13], color: MADERA, nombre: 'Tabla del asiento' })),
    ...[0.62, 0.8].map((y): Pieza => ({ forma: 'caja', centro: [0, y, -0.24], tamano: [1.8, 0.12, 0.04], giro: [-12, 0, 0], color: MADERA, nombre: 'Respaldo' })),
    ...[-0.8, 0.8].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.21, 0], tamano: [0.06, 0.42, 0.46], color: HIERRO, ...metal, nombre: 'Lateral' })),
    ...[-0.8, 0.8].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.66, -0.23], tamano: [0.06, 0.5, 0.05], giro: [-12, 0, 0], color: HIERRO, ...metal, nombre: 'Soporte del respaldo' })),
  ] },
  { id: 'arbol', nombre: 'Árbol', piezas: [
    { forma: 'cilindro', centro: [0, 1.1, 0], tamano: [0.38, 2.2, 0.38], arriba: 0.65, color: '#6b4a2f', rugosidad: 0.95, nombre: 'Tronco' },
    { forma: 'esfera', centro: [0, 2.9, 0], tamano: [2.4, 2.1, 2.4], color: '#3f7d3a', rugosidad: 0.9, nombre: 'Copa' },
    { forma: 'esfera', centro: [0.7, 3.4, 0.3], tamano: [1.6, 1.4, 1.6], color: '#4b8f42', rugosidad: 0.9, nombre: 'Copa' },
    { forma: 'esfera', centro: [-0.6, 3.3, -0.35], tamano: [1.5, 1.3, 1.5], color: '#356b31', rugosidad: 0.9, nombre: 'Copa' },
    { forma: 'esfera', centro: [0, 3.9, -0.1], tamano: [1.3, 1.1, 1.3], color: '#468a3e', rugosidad: 0.9, nombre: 'Copa' },
  ] },
  { id: 'pino', nombre: 'Pino', piezas: [
    { forma: 'cilindro', centro: [0, 0.7, 0], tamano: [0.3, 1.4, 0.3], arriba: 0.8, color: '#5e4128', rugosidad: 0.95, nombre: 'Tronco' },
    { forma: 'cono', centro: [0, 2.1, 0], tamano: [2.6, 2.2, 2.6], color: '#2f5d3a', rugosidad: 0.9, nombre: 'Ramas' },
    { forma: 'cono', centro: [0, 3.2, 0], tamano: [2.0, 1.9, 2.0], color: '#356a40', rugosidad: 0.9, nombre: 'Ramas' },
    { forma: 'cono', centro: [0, 4.2, 0], tamano: [1.3, 1.7, 1.3], color: '#3b7546', rugosidad: 0.9, nombre: 'Punta' },
  ] },
  { id: 'farola', nombre: 'Farola', piezas: [
    { forma: 'cilindro', centro: [0, 0.15, 0], tamano: [0.4, 0.3, 0.4], arriba: 0.7, color: HIERRO, ...metal, nombre: 'Base' },
    { forma: 'cilindro', centro: [0, 2.3, 0], tamano: [0.12, 4.1, 0.12], arriba: 0.7, color: HIERRO, ...metal, nombre: 'Poste' },
    { forma: 'caja', centro: [0.35, 4.3, 0], tamano: [0.8, 0.06, 0.06], color: HIERRO, ...metal, nombre: 'Brazo' },
    { forma: 'caja', centro: [0.72, 4.24, 0], tamano: [0.42, 0.12, 0.26], color: '#3a4046', ...metal, nombre: 'Lámpara' },
    { forma: 'caja', centro: [0.72, 4.17, 0], tamano: [0.36, 0.03, 0.2], color: '#fff1c1', brillo: true, nombre: 'Luz' },
  ] },
  { id: 'casa', nombre: 'Casa pequeña', piezas: [
    { forma: 'caja', centro: [0, 1.3, 0], tamano: [4, 2.6, 3.5], color: '#e6dac4', rugosidad: 0.9, nombre: 'Paredes' },
    { forma: 'prisma', centro: [0, 3.3, 0], tamano: [4.5, 1.4, 4.0], color: '#9c3b2e', rugosidad: 0.8, nombre: 'Tejado' },
    { forma: 'caja', centro: [0, 1.0, 1.77], tamano: [0.9, 2.0, 0.06], color: '#6b4226', nombre: 'Puerta' },
    { forma: 'caja', centro: [-1.25, 1.5, 1.77], tamano: [0.85, 0.85, 0.05], color: '#9fc6e0', opacidad: 0.55, rugosidad: 0.1, nombre: 'Ventana' },
    { forma: 'caja', centro: [1.25, 1.5, 1.77], tamano: [0.85, 0.85, 0.05], color: '#9fc6e0', opacidad: 0.55, rugosidad: 0.1, nombre: 'Ventana' },
    { forma: 'caja', centro: [1.1, 3.7, -0.7], tamano: [0.45, 1.1, 0.45], color: '#8a5a44', nombre: 'Chimenea' },
    { forma: 'caja', centro: [0, 0.08, 2.05], tamano: [1.4, 0.16, 0.55], color: PIEDRA, nombre: 'Escalón' },
  ] },
  { id: 'mesa', nombre: 'Mesa', piezas: [
    { forma: 'caja', centro: [0, 0.745, 0], tamano: [1.4, 0.05, 0.8], color: MADERA_C, rugosidad: 0.6, nombre: 'Tablero' },
    ...patas(0.63, 0.33, 0.72, 0.06, MADERA),
  ] },
  { id: 'silla', nombre: 'Silla', piezas: [
    { forma: 'caja', centro: [0, 0.45, 0], tamano: [0.45, 0.05, 0.45], color: MADERA_C, nombre: 'Asiento' },
    ...patas(0.2, 0.2, 0.43, 0.04, MADERA),
    { forma: 'caja', centro: [0, 0.72, -0.205], tamano: [0.45, 0.42, 0.04], color: MADERA_C, nombre: 'Respaldo' },
  ] },
  { id: 'fuente', nombre: 'Fuente', piezas: [
    { forma: 'cilindro', centro: [0, 0.25, 0], tamano: [2.4, 0.5, 2.4], color: PIEDRA, rugosidad: 0.9, nombre: 'Pila' },
    { forma: 'cilindro', centro: [0, 0.47, 0], tamano: [2.1, 0.06, 2.1], color: '#3f7fb5', opacidad: 0.6, rugosidad: 0.1, nombre: 'Agua' },
    { forma: 'cilindro', centro: [0, 0.9, 0], tamano: [0.3, 0.9, 0.3], arriba: 0.7, color: '#8f897d', nombre: 'Columna' },
    { forma: 'cupula', centro: [0, 1.4, 0], tamano: [0.9, 0.3, 0.9], color: '#a39d90', nombre: 'Taza' },
    { forma: 'esfera', centro: [0, 1.7, 0], tamano: [0.25, 0.25, 0.25], color: '#5aa0d8', opacidad: 0.5, nombre: 'Chorro' },
  ] },
  { id: 'valla', nombre: 'Valla de madera', piezas: [
    ...[-0.95, 0.95].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.55, 0], tamano: [0.1, 1.1, 0.1], color: '#a4794a', nombre: 'Poste' })),
    ...[0.3, 0.8].map((y): Pieza => ({ forma: 'caja', centro: [0, y, -0.04], tamano: [2, 0.08, 0.04], color: '#a4794a', nombre: 'Travesaño' })),
    ...[-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.5, 0.0], tamano: [0.14, 0.95, 0.03], color: '#c8a273', nombre: 'Tabla' })),
  ] },
  { id: 'coche', nombre: 'Coche', piezas: [
    { forma: 'caja', centro: [0, 0.55, 0], tamano: [1.8, 0.6, 4.2], color: '#b3262b', rugosidad: 0.3, metal: 0.4, nombre: 'Carrocería' },
    { forma: 'caja', centro: [0, 1.12, -0.25], tamano: [1.6, 0.56, 2.2], color: '#b3262b', rugosidad: 0.3, metal: 0.4, nombre: 'Cabina' },
    { forma: 'caja', centro: [0, 1.15, -0.25], tamano: [1.62, 0.38, 1.95], color: '#1e2a35', opacidad: 0.75, rugosidad: 0.1, nombre: 'Ventanas' },
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]): Pieza => ({ forma: 'cilindro', centro: [sx * 0.82, 0.33, sz * 1.35], tamano: [0.66, 0.26, 0.66], giro: [0, 0, 90], color: '#1c1c1c', rugosidad: 0.9, nombre: 'Rueda' })),
    ...[-0.6, 0.6].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.66, 2.11], tamano: [0.32, 0.12, 0.04], color: '#fff6d0', brillo: true, nombre: 'Faro' })),
    ...[-0.6, 0.6].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.66, -2.11], tamano: [0.32, 0.1, 0.04], color: '#ff3b30', brillo: true, nombre: 'Piloto' })),
  ] },
  { id: 'barril', nombre: 'Barril', piezas: [
    { forma: 'cilindro', centro: [0, 0.45, 0], tamano: [0.6, 0.9, 0.6], color: '#8b5a2b', rugosidad: 0.85, nombre: 'Cuerpo' },
    ...[0.12, 0.45, 0.78].map((y): Pieza => ({ forma: 'cilindro', centro: [0, y, 0], tamano: [0.62, 0.05, 0.62], color: '#3a3a3a', ...metal, nombre: 'Aro' })),
  ] },
  { id: 'cofre', nombre: 'Cofre', piezas: [
    { forma: 'caja', centro: [0, 0.25, 0], tamano: [0.9, 0.5, 0.55], color: '#8b5a2b', nombre: 'Caja' },
    { forma: 'cilindro', centro: [0, 0.5, 0], tamano: [0.3, 0.9, 0.55], giro: [0, 0, 90], color: '#9a6634', nombre: 'Tapa' },
    ...[-0.3, 0.3].map((x): Pieza => ({ forma: 'caja', centro: [x, 0.36, 0], tamano: [0.06, 0.74, 0.57], color: '#c9a227', ...metal, nombre: 'Refuerzo' })),
    { forma: 'caja', centro: [0, 0.45, 0.285], tamano: [0.12, 0.14, 0.03], color: '#c9a227', ...metal, nombre: 'Cerradura' },
  ] },
];

export const PALETA = [
  '#f4f1ea', '#d9d4c7', '#9c968a', '#5f5b55', '#2f3438', '#141618',
  '#e6dac4', '#c8a273', '#a4794a', '#8b5a2b', '#5e4128', '#3d2a1a',
  '#d64541', '#b3262b', '#e2690b', '#e8b330', '#c9a227', '#f2d16b',
  '#7fb069', '#4b8f42', '#2f5d3a', '#5aa0d8', '#1f6feb', '#24456b',
];

export interface Acabado { id: string; nombre: string; valores: Pick<Pieza, 'rugosidad' | 'metal' | 'opacidad' | 'brillo'> }
export const ACABADOS: Acabado[] = [
  { id: 'mate', nombre: 'Mate', valores: { rugosidad: 0.9, metal: 0, opacidad: 1, brillo: false } },
  { id: 'satinado', nombre: 'Satinado', valores: { rugosidad: 0.55, metal: 0, opacidad: 1, brillo: false } },
  { id: 'brillante', nombre: 'Brillante', valores: { rugosidad: 0.15, metal: 0, opacidad: 1, brillo: false } },
  { id: 'metal', nombre: 'Metal', valores: { rugosidad: 0.35, metal: 1, opacidad: 1, brillo: false } },
  { id: 'vidrio', nombre: 'Vidrio', valores: { rugosidad: 0.08, metal: 0, opacidad: 0.35, brillo: false } },
  { id: 'luz', nombre: 'Luz', valores: { rugosidad: 0.5, metal: 0, opacidad: 1, brillo: true } },
];

export function acabadoDe(p: Pieza): string {
  if (p.brillo) return 'luz';
  if ((p.opacidad ?? 1) < 0.8) return 'vidrio';
  if ((p.metal ?? 0) > 0.5) return 'metal';
  const r = p.rugosidad ?? 0.75;
  return r < 0.3 ? 'brillante' : r < 0.7 ? 'satinado' : 'mate';
}

export const CATEGORIAS = ['general', 'mobiliario', 'vegetación', 'edificios', 'vehículos', 'iluminación', 'decoración', 'parque', 'props'];

export const EJEMPLOS_IA = ['Una farola antigua de hierro', 'Un puesto de mercado con toldo', 'Hazlo más alto', 'Cámbialo a madera oscura', 'Añade ventanas a los lados'];
