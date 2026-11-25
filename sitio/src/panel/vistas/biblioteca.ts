/* #biblioteca: modelos 3D (GLB) publicados por todos y los tuyos. Se suben, se publican, se descargan y se añaden a un proyecto
   (aparecen en el catálogo del editor → Importados → Biblioteca). Los mapas de la biblioteca son las plantillas (#plantillas). */
import { api, aviso, esc, fechaRel } from '../../comun';
import { $ } from '../../dom';
import type { AssetBiblioteca } from '../../tipos';
import { nav, principal, proyectos, tamano } from '../estado';
import { cabecera } from '../piezas';

let filtro = '', soloMios = false, lista: AssetBiblioteca[] = [], enlazado = false;

const tam = (t: number[] | null): string => t && t.length === 3 ? t.map(v => (Math.round(v * 10) / 10).toString().replace('.', ',')).join(' × ') + ' m' : '';
function tarjeta(a: AssetBiblioteca): string {
  const editables = proyectos.filter(p => p.rol !== 'lector');
  return `<article class="tarjeta asset" data-id="${esc(a.id)}">
    <div class="mini asset-mini">${a.mini ? `<img src="${esc(a.mini)}" alt="">` : '<span class="asset-ic" aria-hidden="true">▣</span>'}<span class="etq">${esc(a.categoria)}</span></div>
    <div class="info"><h3>${esc(a.nombre)}${a.visibilidad === 'privada' ? ' <span class="insignia">Privado</span>' : ''}</h3>
      <div class="meta"><span>${esc(a.autor)}</span>${a.tamano_m ? `<span>${tam(a.tamano_m)}</span>` : ''}<span>${tamano(a.bytes)}</span><span>${a.usos} ${a.usos === 1 ? 'uso' : 'usos'}</span><span>${fechaRel(a.creado)}</span></div>
      ${a.descripcion ? `<p class="desc-asset">${esc(a.descripcion)}</p>` : ''}
      <div class="pl-acc">
        ${editables.length ? `<select class="sel-proy" data-asset="${esc(a.id)}" aria-label="Añadir a un proyecto"><option value="">Añadir a un proyecto…</option>${editables.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select>` : ''}
        <a class="btn fantasma peq" href="${esc(a.url)}" download>Descargar .glb</a>
        ${a.mio ? `<button class="btn fantasma peq" data-a="as-visibilidad" data-id="${esc(a.id)}" data-v="${a.visibilidad === 'publica' ? 'privada' : 'publica'}">${a.visibilidad === 'publica' ? 'Hacer privado' : 'Publicar para todos'}</button>
        <button class="btn fantasma peq peligro" data-a="as-borrar" data-id="${esc(a.id)}">Borrar</button>` : ''}
      </div></div></article>`;
}

async function cargar(): Promise<void> {
  const q = new URLSearchParams({ q: filtro, mios: soloMios ? 'true' : 'false' });
  lista = await api<AssetBiblioteca[]>('/api/biblioteca/assets?' + q);
  const c = $('#bibLista'); if (!c) return;
  c.innerHTML = lista.length ? `<div class="tarjetas">${lista.map(tarjeta).join('')}</div>`
    : `<div class="vacio"><h3>${filtro ? 'Nada coincide con «' + esc(filtro) + '»' : soloMios ? 'Todavía no has subido modelos' : 'La biblioteca está vacía'}</h3>
       <p>Sube un modelo .glb (por ejemplo, exportado desde Blender) o publícalo desde un proyecto con el asistente o el MCP.</p></div>`;
}

export async function vistaBiblioteca(): Promise<void> {
  principal.innerHTML = cabecera('Biblioteca', 'Modelos 3D para tus mapas: los que publica cualquiera en este servidor y los tuyos. Los mapas para empezar están en <a href="#plantillas">Plantillas</a>.',
    `<input type="search" id="bibBuscar" placeholder="Buscar modelos…" aria-label="Buscar modelos" value="${esc(filtro)}">
     <label class="chk"><input type="checkbox" id="bibMios"${soloMios ? ' checked' : ''}> Solo los míos</label>
     <label class="btn prim"><input type="file" accept=".glb,model/gltf-binary" id="bibSubir" hidden>Subir modelo (.glb)</label>`)
    + '<div id="bibLista"><div class="cargando">Cargando…</div></div>';
  const b = $('#bibBuscar') as HTMLInputElement; let t = 0;
  b.addEventListener('input', () => { clearTimeout(t); t = window.setTimeout(() => { filtro = b.value.trim(); cargar(); }, 250); });
  ($('#bibMios') as HTMLInputElement).addEventListener('change', e => { soloMios = (e.target as HTMLInputElement).checked; cargar(); });
  ($('#bibSubir') as HTMLInputElement).addEventListener('change', async e => {
    const inp = e.target as HTMLInputElement, f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
    const nombre = prompt('Nombre del modelo', f.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ')); if (nombre === null) return;
    aviso('Subiendo…');
    try {
      const r = await fetch('/api/biblioteca/assets?' + new URLSearchParams({ nombre: nombre || f.name, visibilidad: 'privada' }), { method: 'POST', body: f, credentials: 'same-origin', headers: { 'Content-Type': 'model/gltf-binary' } });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'No se pudo subir.');
      aviso('Subido como privado. Publícalo cuando quieras.'); soloMios = true; nav.mostrar();
    } catch (ex: any) { aviso(ex.message, 'err'); }
  });
  if (!enlazado) { enlazado = true; principal.addEventListener('change', async e => {
    const s = (e.target as HTMLElement).closest<HTMLSelectElement>('.sel-proy'); if (!s || !s.value) return;
    const pid = s.value, aid = s.dataset.asset as string; s.value = '';
    try { const r = await api<{ nombre: string }>('/api/biblioteca/assets/' + aid + '/a-proyecto', { method: 'POST', json: { proyecto: pid } }); aviso('«' + r.nombre + '» añadido: está en el catálogo del editor → Importados.'); cargar(); }
    catch (ex: any) { aviso(ex.message, 'err'); }
  }); }
  try { await cargar(); } catch (ex: any) { const c = $('#bibLista'); if (c) c.innerHTML = `<p class="error-form">${esc(ex.message)}</p>`; }
}

/** Clics de la biblioteca (los reparte index.ts). */
export function clicBiblioteca(a: string, id: string, b: HTMLElement): boolean {
  if (a === 'as-visibilidad') { api('/api/biblioteca/assets/' + id, { method: 'PATCH', json: { visibilidad: b.dataset.v } }).then(() => { aviso(b.dataset.v === 'publica' ? 'Publicado para todos.' : 'Ahora es privado.'); cargar(); }).catch(ex => aviso(ex.message, 'err')); return true; }
  if (a === 'as-borrar') { if (confirm('¿Borrar este modelo de la biblioteca? Los proyectos que ya lo usan lo conservan.')) api('/api/biblioteca/assets/' + id, { method: 'DELETE' }).then(() => { aviso('Borrado.'); cargar(); }).catch(ex => aviso(ex.message, 'err')); return true; }
  return false;
}
