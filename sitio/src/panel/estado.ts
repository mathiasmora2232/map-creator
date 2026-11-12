/* Estado compartido del panel y utilidades. Las variables se exportan con `export let` (los otros módulos ven siempre el valor
   actual) y se cambian solo con los setters de aquí. `nav` lo rellena index.ts para que las vistas y diálogos puedan volver a
   pintar sin importar index (y no hacer ciclos). */
import { api, aviso, esc } from '../comun';
import { $, $$, ls } from '../dom';
import type { Plantilla, Preferencias, Proyecto, Usuario } from '../tipos';

export const principal = $('#principal'), app = $('#app');
export const ROL: Record<string, string> = { dueno: 'Dueño', editor: 'Editor', lector: 'Solo ver' };
export const NOMBRE_PLANTILLA: Record<string, string> = { vacio: 'En blanco', complejo: 'Complejo', parqueadero: 'Parqueadero', copia: 'Copia', importado: 'Importado', casa: 'Casa', casa_dos_plantas: 'Casa 2 plantas', oficina: 'Oficina', bodega: 'Bodega', local: 'Local', plaza: 'Plaza', plantilla: 'Plantilla' };
export type Orden = 'editado' | 'abierto' | 'nombre' | 'creado';
export const ORDENES: Record<Orden, string> = { editado: 'Editados hace poco', abierto: 'Abiertos hace poco', nombre: 'Nombre (A-Z)', creado: 'Más nuevos' };
export type ModoVista = 'cuadricula' | 'lista';

/** El usuario se carga antes de pintar nada (init en index.ts), así que las vistas lo dan por hecho. */
export let yo: Usuario = null as unknown as Usuario;
export let proyectos: Proyecto[] = [];
export let plantillas: Plantilla[] = [];
export let filtro = '';
export let orden: Orden = (ls('mc-orden') as Orden) || 'editado';
export let modoVista: ModoVista = ls('mc-vista') === 'lista' ? 'lista' : 'cuadricula';

export const ponerFiltro = (v: string): void => { filtro = v; };
export const ponerOrden = (v: Orden): void => { orden = v; ls('mc-orden', v); };
export const ponerModoVista = (v: ModoVista): void => { modoVista = v; ls('mc-vista', v); };
export const ponerPlantillas = (v: Plantilla[]): void => { plantillas = v; };

export const nav = {
  mostrar: async (): Promise<void> => {},
  repintar: (): void => {},
  refrescar: async (): Promise<void> => {}
};

export const urlEditor = (p: Pick<Proyecto, 'id' | 'mapa_inicial'>, extra = ''): string =>
  '/editor/?p=' + encodeURIComponent(p.id) + '&m=' + encodeURIComponent(p.mapa_inicial) + extra;
export const iniciales = (n: string | null | undefined): string => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
export const pref = <K extends keyof Preferencias>(k: K): Preferencias[K] | undefined => (yo && yo.preferencias || {})[k];
export async function guardarPref(cambios: Partial<Preferencias>): Promise<void> {
  Object.assign(yo.preferencias, cambios);
  try { const r = await api<Usuario>('/api/cuenta/yo', { method: 'PATCH', json: { preferencias: cambios } }); yo.preferencias = r.preferencias; } catch { /* no es grave */ }
}
export const fechaFut = (iso: string | null): string => {
  if (!iso) return 'no caduca';
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s <= 0) return 'caducado';
  if (s < 3600) return 'caduca en ' + Math.max(1, Math.round(s / 60)) + ' min';
  if (s < 86400) return 'caduca en ' + Math.round(s / 3600) + ' h';
  const d = Math.round(s / 86400); return 'caduca en ' + d + (d === 1 ? ' día' : ' días');
};
export const fechaCorta = (iso: string): string => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: new Date(iso).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
export const tamano = (b: number): string => b < 1048576 ? Math.round(b / 1024) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
export const numONulo = (v: string | undefined): number | null => v === '' || v === undefined ? null : +v;
export const usos = (i: { usos: number; usos_max: number | null }): string => i.usos_max ? `${i.usos}/${i.usos_max} usos` : `${i.usos} ${i.usos === 1 ? 'uso' : 'usos'}`;
export const vistaActual = (): string => (location.hash || '').slice(1);

export async function copiar(texto: string): Promise<void> {
  try { await navigator.clipboard.writeText(texto); }
  catch { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  aviso('Enlace copiado.');
}

export async function cargarYo(): Promise<void> {
  yo = await api<Usuario>('/api/cuenta/yo');
  yo.preferencias = yo.preferencias || {};
  $('#yoNombre').textContent = yo.nombre; $('#yoEmail').textContent = yo.email; $('#yoAvatar').textContent = iniciales(yo.nombre);
  pintarAvatarMenu();
  aplicarTema(yo.preferencias.tema);
  $$('[data-solo-admin]').forEach(el => { el.hidden = !yo.es_admin; });
}
export async function cargarProyectos(): Promise<void> {
  proyectos = await api<Proyecto[]>('/api/proyectos');
  contar();
}
export async function recargarPlantillas(): Promise<void> { plantillas = await api<Plantilla[]>('/api/plantillas'); }
export function contar(): void {
  const mios = proyectos.filter(p => p.rol === 'dueno').length;
  $('[data-n="mapas"]').textContent = String(mios || '');
  $('[data-n="compartidos"]').textContent = String((proyectos.length - mios) || '');
  $('[data-n="favoritos"]').textContent = String(proyectos.filter(p => p.favorito).length || '');
}

export function avatarHtml(u: { id: string; nombre: string; avatar_v?: number }, clase = ''): string {
  const col = u.id === yo.id ? (yo.preferencias.color_avatar || '') : '';
  if (u.avatar_v) return `<span class="avatar foto ${clase}" style="background-image:url('/api/avatar/${esc(u.id)}?v=${+u.avatar_v}')" role="img" aria-label="${esc(u.nombre)}"></span>`;
  return `<span class="avatar ${clase}" style="${col ? 'background:' + esc(col) : ''}">${esc(iniciales(u.nombre))}</span>`;
}
export function pintarAvatarMenu(): void {
  const el = document.getElementById('yoAvatar'); if (!el) return;
  el.outerHTML = avatarHtml(yo).replace('<span class="avatar', '<span id="yoAvatar" class="avatar');
}
export function aplicarTema(t: string | null | undefined): void {
  const r = document.documentElement;
  if (t === 'claro') r.dataset.theme = 'light'; else if (t === 'oscuro') r.dataset.theme = 'dark'; else delete r.dataset.theme;
  ls('mc-tema', t || 'sistema');
}
