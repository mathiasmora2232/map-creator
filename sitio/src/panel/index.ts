/* Map Creator: panel del usuario (/app). Vistas por hash: #inicio, #mapas, #compartidos, #favoritos, #plantillas, #papelera,
   #atajos, #cuenta y #admin (solo administradores). Este módulo elige la vista, reparte los clics y arranca el panel. */
import { api, aviso, esc } from '../comun';
import { $, $$ } from '../dom';
import type { Plantilla, Sesion } from '../tipos';
import { abrirCompartir, abrirRegistro, operarEnlace, plazoMiembro, revocarEnlace } from './dialogos/compartir';
import { abrirMenuProyecto, accion, alternarFavorito, cerrarMenu, menuAbierto } from './dialogos/menu';
import { abrirNuevo } from './dialogos/nuevo';
import { abrirPublicar } from './dialogos/publicar';
import {
  aplicarTema, app, cargarProyectos, cargarYo, copiar, guardarPref, nav, pintarAvatarMenu, plantillas, ponerModoVista, ponerPlantillas,
  pref, principal, proyectos, recargarPlantillas, urlEditor, yo, type ModoVista
} from './estado';
import { recorridoPanel } from './recorrido-panel';
import { vistaAdmin } from './vistas/admin';
import { vistaAtajos } from './vistas/atajos';
import { pintarSesiones, ponerPestanaCuenta, vistaCuenta } from './vistas/cuenta';
import { vistaInicio } from './vistas/inicio';
import { vistaLista, vistaPapelera } from './vistas/mapas';
import { vistaPlantillas } from './vistas/plantillas';

const TITULOS: Record<string, string> = { inicio: 'Inicio', mapas: 'Mis mapas', compartidos: 'Compartidos conmigo', favoritos: 'Favoritos', plantillas: 'Plantillas', papelera: 'Papelera', atajos: 'Atajos', cuenta: 'Cuenta', admin: 'Administración' };

async function mostrar(): Promise<void> {
  let vista = (location.hash || '#inicio').slice(1);
  if (!TITULOS[vista]) vista = 'inicio';
  $$('.menu a[data-vista]').forEach(a => a.classList.toggle('on', a.dataset.vista === vista));
  app.classList.remove('menu-abierto');
  document.title = TITULOS[vista] + ' · Map Creator';
  try {
    if (vista === 'mapas' || vista === 'compartidos' || vista === 'favoritos') vistaLista(vista);
    else if (vista === 'plantillas') vistaPlantillas();
    else if (vista === 'papelera') await vistaPapelera();
    else if (vista === 'atajos') vistaAtajos();
    else if (vista === 'cuenta') vistaCuenta();
    else if (vista === 'admin') await vistaAdmin();
    else vistaInicio();
  } catch (ex: any) { principal.innerHTML = `<div class="vacio"><h3>No se pudo cargar</h3><p>${esc(ex.message)}</p></div>`; }
}
/* Repinta la vista actual sin volver a pedir los datos (p. ej. tras marcar un favorito). */
const repintar = (): void => { const y = scrollY; mostrar().then(() => scrollTo(0, y)); };
async function refrescar(): Promise<void> { await cargarProyectos(); await mostrar(); }
nav.mostrar = mostrar; nav.repintar = repintar; nav.refrescar = refrescar;

const fallo = (ex: any): void => aviso(ex.message, 'err');
const recargarYMostrar = (msg: string) => (): Promise<void> => recargarPlantillas().then(() => { aviso(msg); return mostrar(); });
const recargarSesiones = (): Promise<void> => api<Sesion[]>('/api/cuenta/sesiones').then(pintarSesiones);

document.addEventListener('click', e => {
  const t = e.target as Element, b = t.closest<HTMLElement>('[data-a]');
  if (menuAbierto && !t.closest('.menu-ctx')) cerrarMenu();
  if (!b) return;
  const a = b.dataset.a || '', id = b.dataset.id || '';
  if (b.closest('.menu-ctx')) { cerrarMenu(); accion(a, id).catch(fallo); return; }
  switch (a) {
    case 'nuevo': abrirNuevo(b.dataset.plantilla); break;
    case 'salir': api('/api/cuenta/salir', { method: 'POST' }).finally(() => { location.href = '/'; }); break;
    case 'abrir-menu': app.classList.add('menu-abierto'); break;
    case 'cerrar-menu': app.classList.remove('menu-abierto'); break;
    case 'cerrar-dlg': b.closest('dialog')?.close(); break;
    case 'menu-proyecto': e.preventDefault(); abrirMenuProyecto(b); break;
    case 'favorito': e.preventDefault(); alternarFavorito(id); break;
    case 'ver-como': ponerModoVista(b.dataset.v as ModoVista); repintar(); break;
    case 'recorrido': e.preventDefault(); recorridoPanel(); break;
    case 'ocultar-pasos': guardarPref({ pasos_ocultos: true }).then(repintar); break;
    case 'reiniciar-ayuda': guardarPref({ recorrido_panel: null, recorrido_editor: null, pasos_ocultos: null }).then(() => aviso('Listo: la ayuda volverá a aparecer.')); break;
    case 'paso-abrir': { const p = proyectos[0]; if (p) location.href = urlEditor(p); else abrirNuevo(); break; }
    case 'paso-recorrido': { const p = proyectos.find(x => x.rol !== 'lector') || proyectos[0]; if (p) location.href = urlEditor(p, '&recorrido=1'); else abrirNuevo(); break; }
    case 'paso-compartir': { const p = proyectos.find(x => x.rol === 'dueno'); if (p) abrirCompartir(p); else abrirNuevo(); break; }
    case 'paso-favorito': location.hash = '#mapas'; break;
    case 'pl-editar': { const pl = plantillas.find(x => x.id === id); if (pl) abrirPublicar(null, pl); break; }
    case 'pl-actualizar': aviso('Actualizando…'); api('/api/plantillas/' + id, { method: 'PATCH', json: { actualizar: true } }).then(recargarYMostrar('Plantilla actualizada con el mapa tal como está ahora.')).catch(fallo); break;
    case 'pl-visibilidad': api('/api/plantillas/' + id, { method: 'PATCH', json: { visibilidad: b.dataset.v } }).then(recargarYMostrar(b.dataset.v === 'publica' ? 'Ahora la puede usar cualquiera.' : 'Ahora solo la ves tú.')).catch(fallo); break;
    case 'pl-borrar': if (confirm('¿Borrar esta plantilla? Los mapas ya creados con ella no cambian.')) api('/api/plantillas/' + id, { method: 'DELETE' }).then(recargarYMostrar('Plantilla borrada.')).catch(fallo); break;
    case 'plazo-miembro': plazoMiembro(b, id); break;
    case 'inv-op': operarEnlace(b, id); break;
    case 'revocar': revocarEnlace(b, id); break;
    case 'pestana-cuenta': ponerPestanaCuenta(b.dataset.t || 'perfil'); vistaCuenta(); break;
    case 'tema': aplicarTema(b.dataset.t); guardarPref({ tema: b.dataset.t === 'sistema' ? null : b.dataset.t as 'claro' | 'oscuro' }).then(vistaCuenta); break;
    case 'quitar-foto': if (confirm('¿Quitar tu foto de perfil?')) api('/api/cuenta/avatar', { method: 'DELETE' }).then(() => { yo.avatar_v = 0; pintarAvatarMenu(); vistaCuenta(); aviso('Foto quitada.'); }).catch(fallo); break;
    case 'color-avatar': guardarPref({ color_avatar: b.dataset.color }).then(() => { pintarAvatarMenu(); vistaCuenta(); }); break;
    case 'cerrar-sesion': api('/api/cuenta/sesiones/' + id, { method: 'DELETE' }).then(() => { aviso('Sesión cerrada.'); return recargarSesiones(); }).catch(fallo); break;
    case 'cerrar-otras': api<{ cerradas: number }>('/api/cuenta/sesiones/otras', { method: 'DELETE' }).then(r => { aviso(r.cerradas ? 'Cerradas ' + r.cerradas + ' sesiones.' : 'No había otras sesiones.'); return recargarSesiones(); }).catch(fallo); break;
    case 'cambiar-correo': $('#formCorreo').hidden = false; $('#formCorreo2').hidden = true; $('#formCorreo').email_nuevo.focus(); break;
    case 'cancelar-correo': $('#formCorreo').hidden = true; $('#formCorreo2').hidden = true; break;
    case 'dos-pasos': $('#formDosPasos').hidden = false; $('#formDosPasos').clave_actual.focus(); break;
    case 'cancelar-dos-pasos': $('#formDosPasos').hidden = true; break;
    case 'copiar-enlace': copiar(($('#enlaceUrl') as HTMLInputElement).value); break;
    case 'copiar-registro': copiar(($('#registroUrl') as HTMLInputElement).value); break;
    case 'nuevo-registro': abrirRegistro(); break;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarMenu();
  if (menuAbierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault(); const bs = [...menuAbierto.querySelectorAll<HTMLElement>('button')], i = bs.indexOf(document.activeElement as HTMLElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
  }
  const activo = document.activeElement;
  const escribiendo = (activo && /input|textarea|select/i.test(activo.tagName)) || document.querySelector('dialog[open]') || document.querySelector('.mcr-pop');
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); abrirNuevo(); }
  else if (e.key === '/') { const b = document.getElementById('buscar'); if (b) { e.preventDefault(); b.focus(); } }
  else if (e.key === '?') { e.preventDefault(); recorridoPanel(); }
});
addEventListener('hashchange', mostrar);

(async () => {
  try { const [, , pl] = await Promise.all([cargarYo(), cargarProyectos(), api<Plantilla[]>('/api/plantillas')]); ponerPlantillas(pl); }
  catch (ex: any) { principal.innerHTML = `<div class="vacio"><h3>No se pudo conectar</h3><p>${esc(ex.message)}</p></div>`; return; }
  await mostrar();
  if (!pref('recorrido_panel') && !pref('sin_recorridos')) setTimeout(recorridoPanel, 400);
})();
