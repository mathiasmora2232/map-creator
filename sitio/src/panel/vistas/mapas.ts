/* #mapas, #compartidos, #favoritos (lista con búsqueda y orden) y #papelera. */
import { api, esc } from '../../comun';
import { $, objetivo } from '../../dom';
import type { Proyecto } from '../../tipos';
import { filtro, ponerFiltro, ponerOrden, principal, proyectos, yo, type Orden } from '../estado';
import { cabecera, herramientas, ordenar, rejilla, tarjeta } from '../piezas';

export type TipoLista = 'mapas' | 'compartidos' | 'favoritos';
const BASE: Record<TipoLista, (p: Proyecto) => boolean> = { mapas: p => p.rol === 'dueno', compartidos: p => p.rol !== 'dueno', favoritos: p => p.favorito };
const TITULO: Record<TipoLista, string> = { mapas: 'Mis mapas', compartidos: 'Compartidos conmigo', favoritos: 'Favoritos' };
const DESC: Record<TipoLista, string> = { mapas: '', compartidos: 'Mapas de otras personas en los que eres editor o lector.', favoritos: 'Los mapas que marcaste con ★, tuyos o compartidos.' };

export function vistaLista(tipo: TipoLista): void {
  const f = filtro.toLowerCase();
  const lista = ordenar(proyectos.filter(BASE[tipo]).filter(p => !f || (p.nombre + ' ' + p.descripcion + ' ' + p.dueno_nombre).toLowerCase().includes(f)));
  let cuerpo: string;
  if (lista.length) cuerpo = rejilla(lista);
  else if (filtro) cuerpo = `<div class="vacio"><h3>Nada coincide con «${esc(filtro)}»</h3><p>Prueba con otro nombre.</p></div>`;
  else if (tipo === 'mapas') cuerpo = `<div class="vacio"><h3>Todavía no tienes mapas</h3><p>Crea uno en blanco o empieza desde una plantilla de ejemplo para aprender las herramientas.</p><button class="btn prim" data-a="nuevo">Crear mi primer mapa</button></div>`;
  else if (tipo === 'favoritos') cuerpo = `<div class="vacio"><h3>Aún no tienes favoritos</h3><p>Pulsa la estrella de cualquier mapa para tenerlo aquí.</p><a class="btn" href="#mapas">Ver mis mapas</a></div>`;
  else cuerpo = `<div class="vacio"><h3>Nadie ha compartido mapas contigo</h3><p>Cuando alguien te añada con tu correo (${esc(yo.email)}) o abras un enlace de invitación, el mapa aparecerá aquí.</p></div>`;
  principal.innerHTML = cabecera(TITULO[tipo], DESC[tipo], herramientas(tipo === 'mapas')) + cuerpo;
  const b = $('#buscar') as HTMLInputElement;
  b.addEventListener('input', () => {
    ponerFiltro(b.value); const pos = b.selectionStart ?? b.value.length; vistaLista(tipo);
    const n = $('#buscar') as HTMLInputElement; n.focus(); n.setSelectionRange(pos, pos);
  });
  $('#orden').addEventListener('change', e => { ponerOrden(objetivo(e).value as Orden); vistaLista(tipo); });
}

export async function vistaPapelera(): Promise<void> {
  const cab = cabecera('Papelera', 'Los mapas borrados se quedan aquí hasta que los borres para siempre.');
  principal.innerHTML = cab + '<div class="cargando">Cargando…</div>';
  const lista = await api<Proyecto[]>('/api/proyectos?papelera=true');
  principal.innerHTML = cab + (lista.length ? `<div class="tarjetas">${lista.map(p => tarjeta(p, true)).join('')}</div>` : '<div class="vacio"><h3>La papelera está vacía</h3></div>');
}
