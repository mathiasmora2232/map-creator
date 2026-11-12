/* Menú ⋮ de cada mapa y sus acciones (abrir, renombrar, compartir, copiar, publicar, papelera…). */
import { api, aviso, esc } from '../../comun';
import { $, type El } from '../../dom';
import type { Proyecto } from '../../tipos';
import { contar, nav, proyectos, urlEditor, yo } from '../estado';
import { abrirCompartir } from './compartir';
import { abrirPublicar } from './publicar';

export let menuAbierto: HTMLElement | null = null;
export function cerrarMenu(): void { if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; } }

export function abrirMenuProyecto(boton: HTMLElement): void {
  cerrarMenu();
  const papelera = !!boton.closest('[data-papelera]');
  const id = boton.dataset.id || '', p: Partial<Proyecto> = proyectos.find(x => x.id === id) || { id, rol: 'dueno' };
  const op = (a: string, t: string, cls = ''): string => `<button role="menuitem" data-a="${a}" data-id="${esc(id)}"${cls ? ` class="${cls}"` : ''}>${t}</button>`;
  let html: string;
  if (papelera) html = op('restaurar', 'Restaurar') + '<hr>' + op('borrar-definitivo', 'Borrar para siempre', 'peligro');
  else {
    html = op('abrir', 'Abrir en el editor') + op('abrir-nueva', 'Abrir en otra pestaña');
    html += op('favorito-menu', p.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos');
    if (p.rol !== 'lector') html += op('renombrar', 'Renombrar…');
    html += op('compartir', p.rol === 'dueno' ? 'Compartir o invitar…' : 'Ver quién tiene acceso') + op('duplicar', 'Hacer una copia');
    if (p.rol === 'dueno') html += op('publicar', 'Publicar como plantilla…');
    html += '<hr>' + (p.rol === 'dueno' ? op('borrar', 'Mover a la papelera', 'peligro') : op('salir-proyecto', 'Salir de este mapa', 'peligro'));
  }
  const m = document.createElement('div'); m.className = 'menu-ctx'; m.setAttribute('role', 'menu'); m.innerHTML = html;
  document.body.appendChild(m); menuAbierto = m;
  const r = boton.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
  m.querySelector<HTMLElement>('button')?.focus();
}

export async function alternarFavorito(id: string): Promise<void> {
  const p = proyectos.find(x => x.id === id); if (!p) return;
  p.favorito = !p.favorito; contar(); nav.repintar();
  try { await api('/api/proyectos/' + id + '/favorito', { method: 'PUT', json: { favorito: p.favorito } }); }
  catch (ex: any) { p.favorito = !p.favorito; contar(); nav.repintar(); aviso(ex.message, 'err'); }
}

export async function accion(a: string, id: string): Promise<void> {
  const p = proyectos.find(x => x.id === id);
  const { refrescar } = nav;
  if (a === 'restaurar') { await api('/api/proyectos/' + id + '/restaurar', { method: 'POST' }); await refrescar(); aviso('Mapa restaurado.'); return; }
  if (a === 'borrar-definitivo') {
    if (!confirm('¿Borrar para siempre? Se pierden todos sus cambios y archivos. No se puede deshacer.')) return;
    await api('/api/proyectos/' + id + '?definitivo=true', { method: 'DELETE' }); await refrescar(); aviso('Borrado para siempre.'); return;
  }
  if (!p) return;
  if (a === 'abrir') location.href = urlEditor(p);
  else if (a === 'abrir-nueva') window.open(urlEditor(p), '_blank', 'noopener');
  else if (a === 'favorito-menu') alternarFavorito(id);
  else if (a === 'renombrar') {
    const f = $('#formRenombrar') as El & HTMLFormElement, dlg = $('#dlgRenombrar') as El & HTMLDialogElement;
    f.nombre.value = p.nombre; f.descripcion.value = p.descripcion || '';
    dlg.showModal(); f.nombre.select();
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.nombre.value.trim()) { aviso('El nombre no puede quedar vacío.', 'err'); f.nombre.focus(); return; }
      try { await api('/api/proyectos/' + id, { method: 'PATCH', json: { nombre: f.nombre.value, descripcion: f.descripcion.value } }); dlg.close(); await refrescar(); aviso('Mapa renombrado.'); }
      catch (ex: any) { aviso(ex.message, 'err'); }
    };
  }
  else if (a === 'compartir') abrirCompartir(p);
  else if (a === 'publicar') abrirPublicar(p, null);
  else if (a === 'duplicar') {
    aviso('Haciendo la copia…');
    try { const n = await api<Proyecto>('/api/proyectos/' + id + '/duplicar', { method: 'POST' }); await refrescar(); aviso('Copia creada: «' + n.nombre + '».'); location.hash = '#mapas'; }
    catch (ex: any) { aviso(ex.message, 'err'); }
  }
  else if (a === 'borrar') {
    if (!confirm('¿Mover «' + p.nombre + '» a la papelera? Puedes restaurarlo después.')) return;
    await api('/api/proyectos/' + id, { method: 'DELETE' }); await refrescar(); aviso('Movido a la papelera.');
  }
  else if (a === 'salir-proyecto') {
    if (!confirm('¿Salir de «' + p.nombre + '»? Ya no lo verás hasta que te vuelvan a invitar.')) return;
    await api('/api/proyectos/' + id + '/miembros/' + yo.id, { method: 'DELETE' }); await refrescar(); aviso('Saliste del mapa.');
  }
}
