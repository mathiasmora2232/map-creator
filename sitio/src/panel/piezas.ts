/* Piezas de HTML que comparten varias vistas: cabecera, tarjetas y filas de mapas, plantillas y herramientas de las listas. */
import { esc, fechaRel, miniatura } from '../comun';
import type { Plantilla, Proyecto } from '../tipos';
import { modoVista, NOMBRE_PLANTILLA, orden, ORDENES, ROL, filtro, urlEditor, type Orden } from './estado';

export function cabecera(titulo: string, desc = '', herr = ''): string {
  return `<div class="principal-cab"><h1>${esc(titulo)}</h1>${herr ? `<div class="herr">${herr}</div>` : ''}${desc ? `<p class="desc">${desc}</p>` : ''}</div>`;
}
const ICONO_ESTRELLA = '<svg width="17" height="17" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const ICONO_MAS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
const estrella = (p: Proyecto): string => `<button class="estrella${p.favorito ? ' on' : ''}" data-a="favorito" data-id="${esc(p.id)}" aria-pressed="${!!p.favorito}"
    aria-label="${p.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}" title="${p.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${ICONO_ESTRELLA}</button>`;
const quien = (p: Proyecto): string => p.rol !== 'dueno' ? `<span class="rol ${esc(p.rol)}">${esc(ROL[p.rol])}</span><span>de ${esc(p.dueno_nombre)}</span>` : '';
const nombrePlantilla = (id: string): string => esc(NOMBRE_PLANTILLA[id] || id);

export function tarjeta(p: Proyecto, papelera = false): string {
  const meta = papelera
    ? `<span>En la papelera ${fechaRel(p.archivado || '')}</span>`
    : `<span>Editado ${fechaRel(p.actualizado)}</span><span>${p.n_cambios} cambios</span>${p.n_miembros > 1 ? `<span>${p.n_miembros} personas</span>` : ''}`;
  return `<article class="tarjeta" data-id="${esc(p.id)}"${papelera ? ' data-papelera="1"' : ''}>
    <a class="mini" href="${papelera ? '#papelera' : urlEditor(p)}" tabindex="-1" aria-hidden="true">${miniatura(p.id)}<span class="etq">${nombrePlantilla(p.plantilla)}</span></a>
    ${papelera ? '' : estrella(p)}
    <div class="info">
      <h3>${papelera ? esc(p.nombre) : `<a href="${urlEditor(p)}">${esc(p.nombre)}</a>`}</h3>
      <div class="meta">${quien(p)}${meta}</div>
    </div>
    <button class="btn icono fantasma acc" data-a="menu-proyecto" data-id="${esc(p.id)}" aria-label="Opciones de ${esc(p.nombre)}" aria-haspopup="menu">${ICONO_MAS}</button>
  </article>`;
}
function fila(p: Proyecto): string {
  return `<div class="fila-mapa" role="row" data-id="${esc(p.id)}">
    <span class="fm-mini" aria-hidden="true">${miniatura(p.id, { ancho: 320, alto: 200 })}</span>
    <span class="fm-nombre" role="cell"><a href="${urlEditor(p)}">${esc(p.nombre)}</a><small>${nombrePlantilla(p.plantilla)}${p.descripcion ? ' · ' + esc(p.descripcion) : ''}</small></span>
    <span class="fm-quien" role="cell">${p.rol === 'dueno' ? 'Tú' : esc(p.dueno_nombre)}${p.n_miembros > 1 ? ` · ${p.n_miembros} personas` : ''}</span>
    <span class="fm-fecha" role="cell">${fechaRel(p.actualizado)}</span>
    <span class="fm-acc" role="cell">${estrella(p)}<button class="btn icono fantasma" data-a="menu-proyecto" data-id="${esc(p.id)}" aria-label="Opciones de ${esc(p.nombre)}" aria-haspopup="menu">${ICONO_MAS}</button></span>
  </div>`;
}
const t = (x: string | null | undefined): number => x ? new Date(x).getTime() : 0;
const COMPARAR: Record<Orden, (a: Proyecto, b: Proyecto) => number> = {
  editado: (a, b) => t(b.actualizado) - t(a.actualizado),
  abierto: (a, b) => t(b.abierto) - t(a.abierto) || t(b.actualizado) - t(a.actualizado),
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  creado: (a, b) => t(b.creado) - t(a.creado)
};
export const ordenar = (lista: Proyecto[]): Proyecto[] => lista.slice().sort(COMPARAR[orden] || COMPARAR.editado);
export const masReciente = (a: Proyecto, b: Proyecto): number => t(b.abierto || b.actualizado) - t(a.abierto || a.actualizado);
export const porEdicion = COMPARAR.editado;

export function rejilla(lista: Proyecto[]): string {
  if (modoVista === 'lista') return `<div class="lista-mapas" role="table" aria-label="Mapas"><div class="fila-mapa cab" role="row"><span></span><span role="columnheader">Nombre</span><span role="columnheader">Dueño</span><span role="columnheader">Editado</span><span></span></div>${lista.map(fila).join('')}</div>`;
  return `<div class="tarjetas">${lista.map(p => tarjeta(p)).join('')}</div>`;
}
export const herramientas = (conNuevo: boolean): string => `<input type="search" id="buscar" placeholder="Buscar mapas…" aria-label="Buscar mapas" value="${esc(filtro)}">
  <select id="orden" aria-label="Ordenar">${Object.entries(ORDENES).map(([k, v]) => `<option value="${k}"${k === orden ? ' selected' : ''}>${v}</option>`).join('')}</select>
  <div class="seg-vista" role="group" aria-label="Ver como">
    <button data-a="ver-como" data-v="cuadricula" aria-pressed="${modoVista === 'cuadricula'}" title="Cuadrícula"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg></button>
    <button data-a="ver-como" data-v="lista" aria-pressed="${modoVista === 'lista'}" title="Lista"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button>
  </div>${conNuevo ? '<button class="btn prim" data-a="nuevo">Nuevo mapa</button>' : ''}`;

export function tarjetaPlantilla(p: Plantilla, sel?: string): string {
  return `<button type="button" class="plantilla${p.id === sel ? ' on' : ''}" data-plantilla="${esc(p.id)}" aria-pressed="${p.id === sel}">
    <span class="mini">${miniatura('plantilla-' + p.id, { ancho: 320, alto: 160, acento: p.id !== 'vacio' })}</span>
    <span class="info"><b>${esc(p.nombre)}<small>${esc(p.etiqueta)}</small></b><p>${esc(p.descripcion || '')}</p>${p.origen === 'usuario' ? `<p class="meta-pl">${p.usos} ${p.usos === 1 ? 'uso' : 'usos'} · ${p.n_documentos} objetos</p>` : ''}</span></button>`;
}
