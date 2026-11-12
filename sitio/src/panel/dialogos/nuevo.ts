/* Diálogo «Nuevo mapa»: en blanco (con tamaño y terreno) o desde una plantilla. */
import { api } from '../../comun';
import { $, $$, datosForm, type El } from '../../dom';
import type { Proyecto } from '../../tipos';
import { plantillas, pref, urlEditor } from '../estado';
import { tarjetaPlantilla } from '../piezas';

const dlg = $('#dlgNuevo') as El & HTMLDialogElement, form = $('#formNuevo') as El & HTMLFormElement;
let plantillaSel = 'vacio', nombreAuto = '';

export function abrirNuevo(plantilla?: string): void {
  plantillaSel = plantilla || 'vacio';
  form.reset(); $('#errNuevo').textContent = ''; ($('#bCrear') as HTMLButtonElement).disabled = false;
  $('#nuevoPlantillas').innerHTML = plantillas.map(t => tarjetaPlantilla(t, plantillaSel)).join('');
  $('#nuevoTam').hidden = plantillaSel !== 'vacio';
  nombreAuto = ''; sugerirNombre();
  dlg.showModal(); form.nombre.focus(); form.nombre.select();
}
/* Con una plantilla de ejemplo, propone su nombre mientras el usuario no haya escrito otro. */
function sugerirNombre(): void {
  const campo = form.nombre as HTMLInputElement;
  if (campo.value.trim() && campo.value !== nombreAuto) return;
  const t = plantillas.find(x => x.id === plantillaSel);
  nombreAuto = t && plantillaSel !== 'vacio' ? t.nombre : '';
  campo.value = nombreAuto;
}

$('#nuevoPlantillas').addEventListener('click', e => {
  const b = (e.target as Element).closest<HTMLElement>('[data-plantilla]'); if (!b) return;
  plantillaSel = b.dataset.plantilla || 'vacio';
  $$('#nuevoPlantillas .plantilla').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  $('#nuevoTam').hidden = plantillaSel !== 'vacio';
  sugerirNombre();
});
form.addEventListener('submit', async e => {
  e.preventDefault();
  const d = datosForm(form), bCrear = $('#bCrear') as HTMLButtonElement;
  if (!d.nombre.trim()) { $('#errNuevo').textContent = 'Ponle un nombre al mapa.'; form.nombre.focus(); return; }
  bCrear.disabled = true;
  try {
    const p = await api<Proyecto>('/api/proyectos', { method: 'POST', json: { nombre: d.nombre, plantilla: plantillaSel, ancho: +d.ancho, largo: +d.largo, terreno: d.terreno } });
    location.href = urlEditor(p, pref('recorrido_editor') ? '' : '&recorrido=1');
  } catch (ex: any) { $('#errNuevo').textContent = ex.message; bCrear.disabled = false; }
});
