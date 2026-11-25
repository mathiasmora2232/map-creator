/* Diálogo «Nuevo mapa»: en blanco (con tamaño, terreno y, si se quiere, relieve generado) o desde una plantilla.
   Con relieve, el servidor guarda los parámetros en el documento del mapa y el editor lo genera al abrirlo por primera vez
   (editor/src/mapa/terreno_procedural.ts). */
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
  mostrarOpciones();
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
/* «En blanco» enseña el tamaño y el relieve; con relieve, también sus opciones */
function mostrarOpciones(): void {
  const blanco = plantillaSel === 'vacio', conRelieve = blanco && !!(form.relieve as HTMLSelectElement).value;
  $('#nuevoTam').hidden = !blanco;
  $('#nuevoRelieve').hidden = !blanco;
  $$('#nuevoRelieve .relieve-opc').forEach(x => { x.hidden = !conRelieve; });
}

const NIEVE: Record<string, number> = { montanas: 25, valle: 14, colinas: 8, isla: 9, llanura: 2, dunas: 4 };
const CLIMA: Record<string, { humedad: number; nieve?: boolean }> = { templado: { humedad: 0 }, humedo: { humedad: 0.7 }, seco: { humedad: -0.6 }, nevado: { humedad: 0.2, nieve: true } };
/** Parámetros de relieve para el servidor (null = mapa plano). */
export function relieveDe(d: Record<string, string>): Record<string, unknown> | null {
  if (!d.relieve) return null;
  const c = CLIMA[d.clima] || CLIMA.templado;
  const g: Record<string, unknown> = { estilo: d.relieve, humedad: c.humedad, nieve: c.nieve ? NIEVE[d.relieve] || 8 : 0, densidad: +d.vegetacion || 0, rio: d.rio === 'on' };
  if (d.plano_ancho) g.plano_ancho = +d.plano_ancho;
  if (d.plano_largo) g.plano_largo = +d.plano_largo;
  if (d.semilla) g.semilla = +d.semilla;
  return g;
}

$('#nuevoPlantillas').addEventListener('click', e => {
  const b = (e.target as Element).closest<HTMLElement>('[data-plantilla]'); if (!b) return;
  plantillaSel = b.dataset.plantilla || 'vacio';
  $$('#nuevoPlantillas .plantilla').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  mostrarOpciones();
  sugerirNombre();
});
(form.relieve as HTMLSelectElement).addEventListener('change', mostrarOpciones);
form.addEventListener('submit', async e => {
  e.preventDefault();
  const d = datosForm(form), bCrear = $('#bCrear') as HTMLButtonElement;
  if (!d.nombre.trim()) { $('#errNuevo').textContent = 'Ponle un nombre al mapa.'; form.nombre.focus(); return; }
  bCrear.disabled = true;
  try {
    const generar = plantillaSel === 'vacio' ? relieveDe(d) : null;
    const p = await api<Proyecto>('/api/proyectos', { method: 'POST', json: { nombre: d.nombre, plantilla: plantillaSel, ancho: +d.ancho, largo: +d.largo, terreno: d.terreno, generar } });
    location.href = urlEditor(p, pref('recorrido_editor') ? '' : '&recorrido=1');
  } catch (ex: any) { $('#errNuevo').textContent = ex.message; bCrear.disabled = false; }
});
