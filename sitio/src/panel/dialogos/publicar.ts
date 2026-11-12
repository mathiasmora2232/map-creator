/* Publicar un mapa como plantilla o editar una tuya (mismo diálogo). */
import { api, aviso } from '../../comun';
import { $, datosForm, type El } from '../../dom';
import type { Plantilla, Proyecto } from '../../tipos';
import { nav, recargarPlantillas, vistaActual } from '../estado';

let editando: string | null = null;
const form = $('#formPublicar') as El & HTMLFormElement;

export function abrirPublicar(p: Proyecto | null, t: Plantilla | null): void {
  editando = t ? t.id : null;
  $('#tPublicar').textContent = t ? 'Editar la plantilla' : 'Publicar «' + (p?.nombre || '') + '» como plantilla';
  form.nombre.value = t ? t.nombre : (p?.nombre || '').slice(0, 60);
  form.descripcion.value = t ? (t.descripcion || '') : (p?.descripcion || '');
  form.visibilidad.value = t ? t.visibilidad : 'publica'; form.dataset.pid = p ? p.id : ''; $('#errPublicar').textContent = '';
  $('#ayudaPublicar').textContent = t ? 'Los mapas ya creados con ella no cambian.' : 'Se guarda una copia del mapa tal como está ahora (objetos, materiales y archivos). Si luego lo cambias, usa «Actualizar desde el mapa» en Plantillas.';
  ($('#dlgPublicar') as El & HTMLDialogElement).showModal(); form.nombre.select();
}

form.addEventListener('submit', async e => {
  e.preventDefault(); const d = datosForm(form); $('#errPublicar').textContent = '';
  if (!d.nombre.trim()) { $('#errPublicar').textContent = 'Ponle un nombre.'; return; }
  const b = form.querySelector<HTMLButtonElement>('button.prim')!; b.disabled = true;
  try {
    if (editando) await api('/api/plantillas/' + editando, { method: 'PATCH', json: d });
    else {
      const r = await api<{ n_documentos: number }>('/api/proyectos/' + form.dataset.pid + '/publicar', { method: 'POST', json: d });
      aviso('Publicada: ' + r.n_documentos + ' objetos.' + (d.visibilidad === 'publica' ? ' Ya la puede usar cualquiera.' : ''));
    }
    ($('#dlgPublicar') as El & HTMLDialogElement).close(); await recargarPlantillas();
    if (vistaActual() === 'plantillas') nav.mostrar(); else location.hash = '#plantillas';
  } catch (ex: any) { $('#errPublicar').textContent = ex.message; }
  b.disabled = false;
});
