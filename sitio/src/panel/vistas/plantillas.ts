/* #plantillas: del sistema, las tuyas (con gestión) y las publicadas por otras personas. */
import { esc } from '../../comun';
import type { Plantilla } from '../../tipos';
import { abrirNuevo } from '../dialogos/nuevo';
import { plantillas, principal, yo } from '../estado';
import { cabecera, tarjetaPlantilla } from '../piezas';

const gestion = (t: Plantilla): string => `<div class="pl-acc">${t.mia ? `<button class="btn fantasma peq" data-a="pl-editar" data-id="${esc(t.id)}">Editar</button><button class="btn fantasma peq" data-a="pl-actualizar" data-id="${esc(t.id)}" title="Volver a copiar el mapa del que salió, tal como está ahora">Actualizar desde el mapa</button><button class="btn fantasma peq" data-a="pl-visibilidad" data-id="${esc(t.id)}" data-v="${t.visibilidad === 'publica' ? 'privada' : 'publica'}">${t.visibilidad === 'publica' ? 'Hacer privada' : 'Publicar para todos'}</button>` : ''}${t.mia || yo.es_admin ? `<button class="btn fantasma peq peligro" data-a="pl-borrar" data-id="${esc(t.id)}">Borrar</button>` : ''}</div>`;
const bloque = (titulo: string, desc: string, lista: Plantilla[], conGestion: boolean): string => lista.length
  ? `<section class="bloque"><div class="bloque-cab"><h2>${titulo}</h2></div>${desc ? `<p class="desc-bloque">${desc}</p>` : ''}<div class="plantillas">${lista.map(t => conGestion ? `<div class="pl-caja">${tarjetaPlantilla(t)}${gestion(t)}</div>` : tarjetaPlantilla(t)).join('')}</div></section>`
  : '';

export function vistaPlantillas(): void {
  const sis = plantillas.filter(t => t.origen !== 'usuario'), mias = plantillas.filter(t => t.mia), otras = plantillas.filter(t => t.origen === 'usuario' && !t.mia);
  principal.innerHTML = cabecera('Plantillas', 'Empieza un mapa nuevo desde una de estas bases. Cualquier mapa tuyo se puede publicar como plantilla: menú <b>⋮</b> del mapa → «Publicar como plantilla…».')
    + bloque('Del sistema', '', sis, false)
    + bloque('Tus plantillas', 'Solo tú ves las privadas; las públicas las puede usar cualquiera en este servidor.', mias, true)
    + bloque('Publicadas por otras personas', '', otras, yo.es_admin)
    + (mias.length || otras.length ? '' : `<div class="vacio peq"><p>Todavía nadie ha publicado plantillas. Abre el menú <b>⋮</b> de uno de tus mapas y elige «Publicar como plantilla…».</p></div>`);
  principal.querySelectorAll<HTMLElement>('[data-plantilla]').forEach(b => b.addEventListener('click', () => abrirNuevo(b.dataset.plantilla)));
}
