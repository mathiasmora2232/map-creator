/* #inicio: saludo, primeros pasos, continuar y plantillas. */
import { esc } from '../../comun';
import { abrirNuevo } from '../dialogos/nuevo';
import { plantillas, pref, principal, proyectos, yo } from '../estado';
import { masReciente, tarjeta, tarjetaPlantilla } from '../piezas';

export function vistaInicio(): void {
  const primer = String(yo.nombre).trim().split(/\s+/)[0];
  const recientes = proyectos.slice().sort(masReciente).slice(0, 4);
  const hora = new Date().getHours(), saludo = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  let html = `<div class="hola"><div><h1>${saludo}, ${esc(primer)}</h1><p>${proyectos.length ? 'Sigue donde lo dejaste o empieza algo nuevo.' : 'Bienvenido. Tu primer mapa está a un clic.'}</p></div>
    <div class="hola-acc"><button class="btn" data-a="recorrido">Ver el recorrido</button><button class="btn prim" data-a="nuevo">Nuevo mapa</button></div></div>`;
  html += pasosHtml();
  if (recientes.length) html += `<section class="bloque"><div class="bloque-cab"><h2>Continuar</h2><a href="#mapas">Ver todos</a></div><div class="tarjetas">${recientes.map(p => tarjeta(p)).join('')}</div></section>`;
  html += `<section class="bloque"><div class="bloque-cab"><h2>Empezar desde una plantilla</h2><a href="#plantillas">Ver plantillas</a></div><div class="plantillas">${plantillas.filter(t => t.origen !== 'usuario').slice(0, 6).map(t => tarjetaPlantilla(t)).join('')}</div></section>`;
  principal.innerHTML = html;
  principal.querySelectorAll<HTMLElement>('.plantillas [data-plantilla]').forEach(b => b.addEventListener('click', () => abrirNuevo(b.dataset.plantilla)));
}

interface Paso { ok: boolean; t: string; d: string; a: string; b: string }
/* Primeros pasos: se deducen de los datos (nada que marcar a mano) y se pueden ocultar. */
function pasosHtml(): string {
  if (pref('pasos_ocultos')) return '';
  const mios = proyectos.filter(p => p.rol === 'dueno');
  const pasos: Paso[] = [
    { ok: mios.length > 0, t: 'Crea tu primer mapa', d: 'En blanco o desde una plantilla de ejemplo.', a: 'nuevo', b: 'Crear' },
    { ok: proyectos.some(p => p.abierto), t: 'Abre el editor', d: 'Dibuja en 2D o 3D y todo se guarda solo.', a: 'paso-abrir', b: 'Abrir' },
    { ok: !!pref('recorrido_editor'), t: 'Haz el recorrido del editor', d: 'Dos minutos para conocer herramientas, catálogo y vistas.', a: 'paso-recorrido', b: 'Empezar' },
    { ok: !!pref('enlace_creado') || mios.some(p => p.n_miembros > 1), t: 'Comparte un mapa', d: 'Crea un enlace de invitación para que otra persona edite contigo.', a: 'paso-compartir', b: 'Compartir' },
    { ok: proyectos.some(p => p.favorito), t: 'Marca un favorito', d: 'Pulsa ★ en un mapa para tenerlo siempre a mano.', a: 'paso-favorito', b: 'Ver mapas' }
  ];
  const hechos = pasos.filter(p => p.ok).length;
  if (hechos === pasos.length) return `<section class="primeros listo"><div><b>Ya dominas lo básico.</b> Completaste los primeros pasos.</div><button class="btn fantasma" data-a="ocultar-pasos">Ocultar</button></section>`;
  return `<section class="primeros" aria-label="Primeros pasos"><div class="primeros-cab"><h2>Primeros pasos</h2><span class="mono">${hechos}/${pasos.length}</span>
      <div class="barra-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${pasos.length}" aria-valuenow="${hechos}"><i style="width:${hechos / pasos.length * 100}%"></i></div>
      <button class="btn fantasma" data-a="ocultar-pasos">Ocultar</button></div>
    <ol>${pasos.map(p => `<li class="${p.ok ? 'ok' : ''}"><span class="chk" aria-hidden="true">${p.ok ? '✓' : ''}</span><span class="txt"><b>${p.t}</b><small>${p.d}</small></span>
      ${p.ok ? '<span class="hecho">Hecho</span>' : `<button class="btn" data-a="${p.a}">${p.b}</button>`}</li>`).join('')}</ol></section>`;
}
