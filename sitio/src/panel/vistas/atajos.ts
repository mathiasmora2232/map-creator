/* #atajos: hoja de atajos del editor y del panel. */
import { principal } from '../estado';
import { cabecera } from '../piezas';

const grupo = (t: string, l: [string, string][]): string => `<div class="caja"><h2>${t}</h2><div class="atajos">${l.map(([k, d]) => `<div><span>${d}</span><kbd>${k}</kbd></div>`).join('')}</div></div>`;

export function vistaAtajos(): void {
  principal.innerHTML = cabecera('Atajos del editor', 'Dentro del editor pulsa <kbd>?</kbd> para ver la hoja completa.') + `<div class="ajustes ancho">
    ${grupo('Cámara', [['Rueda', 'Zoom hacia el cursor'], ['Botón central', 'Desplazar'], ['Botón derecho', 'Orbitar'], ['Inicio', 'Ver todo el mapa'], ['W A S D', 'Mover la cámara'], ['1 / 4 / 5', 'Planta / isométrica / caminar']])}
    ${grupo('Edición', [['Clic', 'Seleccionar'], ['Mayús+clic', 'Añadir o quitar'], ['Alt+arrastrar', 'Copiar y mover'], ['M / G / K', 'Mover, girar, escalar'], ['Supr', 'Borrar'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'], ['Ctrl+G', 'Agrupar'], ['F', 'Encuadrar la selección']])}
    ${grupo('Herramientas', [['L', 'Pared'], ['H', 'Habitación'], ['U', 'Puerta'], ['I', 'Ventana'], ['X', 'Techo'], ['B', 'Pintar'], ['T', 'Medir'], ['C', 'Catálogo'], ['N', 'Nota'], ['Enter', 'Terminar pared o polígono']])}
    ${grupo('Panel', [['N', 'Nuevo mapa'], ['/', 'Buscar mapas'], ['?', 'Recorrido guiado']])}
  </div>`;
}
