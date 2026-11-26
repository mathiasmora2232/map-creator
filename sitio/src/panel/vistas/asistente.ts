/* #asistente: chat con Claude en el panel. Usa las mismas herramientas que el servidor MCP (api/app/rutas/asistente.py → /api/asistente),
   que se ejecutan en el servidor con tu sesión: crear mapas con relieve, colocar objetos y paredes, versiones, biblioteca y diseñar
   modelos 3D nuevos con piezas. El bucle va aquí: cada llamada es una vuelta (Claude + herramientas) y se repite mientras pida más.
   La conversación se guarda en sessionStorage (se pierde al cerrar la pestaña). */
import { api, aviso, esc } from '../../comun';
import { $ } from '../../dom';
import { cargarProyectos, principal } from '../estado';
import { cabecera } from '../piezas';

interface Vuelta { content: any[]; stop_reason: string; resultados: any[]; acciones: { herramienta: string; ok: boolean; detalle: string }[] }

const CLAVE = 'mc-asistente-panel', MAX_VUELTAS = 25;
let historial: any[] = [];
try { historial = JSON.parse(sessionStorage.getItem(CLAVE) || '[]'); if (!Array.isArray(historial)) historial = []; } catch { historial = []; }
const guardar = (): void => { try { sessionStorage.setItem(CLAVE, JSON.stringify(historial)); } catch { /* lleno o bloqueado */ } };
let ocupado = false, activo: boolean | null = null, enlazado = false;

const USOS: [string, string, string[]][] = [
  ['Crear mapas', 'Mapas en blanco con relieve, desde una plantilla o desde la biblioteca, ya amueblados.', [
    'Crea un mapa de 200 × 150 m con colinas y un río, y pon una plaza con bancas y farolas en el centro',
    'Hazme un parqueadero de 40 plazas con árboles alrededor',
    'Crea una isla tropical de 120 × 120 m con una cabaña en el centro']],
  ['Crear assets', 'Objetos 3D nuevos hechos con piezas; quedan en tu biblioteca y puedes publicarlos.', [
    'Diseña una fuente de piedra con agua y guárdala en mi biblioteca',
    'Crea una caseta de vigilancia con tejado a dos aguas',
    'Haz una parada de bus con techo de vidrio y una banca']],
  ['Editar mis mapas', 'Coloca, mueve o borra objetos, levanta paredes y guarda versiones antes de tocar nada.', [
    '¿Qué mapas tengo y qué hay en el último que edité?',
    'En mi último mapa, pon una fila de árboles cada 8 m en el borde norte',
    'Levanta una casa de 10 × 8 m con dos habitaciones en mi último mapa']],
  ['Biblioteca y publicar', 'Busca modelos y mapas publicados, añádelos a un proyecto o publica los tuyos.', [
    '¿Qué modelos hay en la biblioteca?',
    'Publica mi último mapa en la biblioteca como plantilla',
    'Guarda una versión de todos mis mapas con el nombre «copia de hoy»']],
];

const ETIQUETAS: Record<string, string> = {
  quien_soy: 'Mirando tu cuenta', listar_proyectos: 'Mirando tus proyectos', crear_proyecto: 'Creando el proyecto', ver_proyecto: 'Mirando el proyecto',
  renombrar_proyecto: 'Renombrando', duplicar_proyecto: 'Duplicando el proyecto', mover_a_papelera: 'Mandando a la papelera',
  buscar_catalogo: 'Buscando en el catálogo', listar_objetos: 'Mirando los objetos', colocar_objetos: 'Colocando objetos', crear_paredes: 'Levantando paredes',
  editar_objetos: 'Moviendo objetos', borrar_objetos: 'Borrando objetos', generar_terreno: 'Pidiendo el terreno', guardar_version: 'Guardando una versión',
  listar_versiones: 'Mirando las versiones', restaurar_version: 'Restaurando una versión', buscar_biblioteca: 'Buscando en la biblioteca',
  crear_modelo: 'Diseñando el modelo', anadir_asset_a_proyecto: 'Añadiendo el modelo al proyecto', editar_asset: 'Cambiando el asset',
  publicar_asset_de_proyecto: 'Publicando el modelo', publicar_mapa: 'Publicando el mapa',
};
function etiqueta(b: any): string {
  const e = b.input || {}, n = Array.isArray(e.objetos) ? e.objetos.length : Array.isArray(e.paredes) ? e.paredes.length : Array.isArray(e.ids) ? e.ids.length : 0;
  let t = ETIQUETAS[b.name] || b.name;
  if (b.name === 'crear_modelo') t += ' «' + (e.nombre || '') + '» (' + ((e.piezas || []).length) + ' piezas)';
  else if (b.name === 'crear_proyecto' && e.nombre) t += ' «' + e.nombre + '»';
  else if (b.name === 'buscar_catalogo' && e.texto) t += ': «' + e.texto + '»';
  else if (n) t += ' (' + n + ')';
  return t;
}

/* Markdown mínimo: párrafos, **negrita**, `código`, [enlaces](https://…) y listas */
const enLinea = (t: string): string => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_m, txt, url) => `<a href="${url}"${url.startsWith(location.origin) || url.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}>${txt}</a>`);
const ITEM = /^\s*(?:[-*•]|\d+\.)\s+/;
const formato = (t: string): string => String(t).split(/\n{2,}/).map(p => {
  const ls = p.split('\n'), i = ls.findIndex(l => ITEM.test(l));
  if (i >= 0 && ls.slice(i).every(l => ITEM.test(l))) return (i > 0 ? '<p>' + ls.slice(0, i).map(enLinea).join('<br>') + '</p>' : '') + '<ul>' + ls.slice(i).map(l => '<li>' + enLinea(l.replace(ITEM, '')) + '</li>').join('') + '</ul>';
  if (/^#{1,4}\s/.test(ls[0])) return '<h4>' + enLinea(ls[0].replace(/^#+\s*/, '')) + '</h4>' + (ls.length > 1 ? '<p>' + ls.slice(1).map(enLinea).join('<br>') + '</p>' : '');
  return '<p>' + ls.map(enLinea).join('<br>') + '</p>';
}).join('');

const caja = (): HTMLElement | null => $('#chatMsjs');
function añadir(clase: string, html: string): HTMLElement | null {
  const c = caja(); if (!c) return null;
  const d = document.createElement('div'); d.className = clase; d.innerHTML = html; c.appendChild(d); c.scrollTop = c.scrollHeight; return d;
}
/* Tarjeta con la miniatura de un modelo recién creado (sale del resultado de crear_modelo). */
function tarjetaModelo(resultado: string): void {
  let j: any; try { j = JSON.parse(resultado); } catch { return; }
  const id = j && j.asset && j.asset.id; if (!id) return;
  const d = añadir('m-modelo', '<span class="cargando">…</span>'); if (!d) return;
  api<any>('/api/biblioteca/assets/' + encodeURIComponent(id)).then(a => {
    d.innerHTML = `${a.mini ? `<img src="${esc(a.mini)}" alt="">` : ''}<div><b>${esc(a.nombre)}</b><small>${(a.tamano_m || []).map((v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',')).join(' × ')} m · ${a.visibilidad === 'publica' ? 'público' : 'privado'}</small>
      <span class="fila-btn"><a class="btn fantasma peq" href="${esc(a.url)}" download>Descargar .glb</a><a class="btn fantasma peq" href="#biblioteca">Ver en la biblioteca</a></span></div>`;
  }).catch(() => d.remove());
}

function pintar(): void {
  const c = caja(); if (!c) return;
  c.innerHTML = '';
  if (!historial.length) {
    c.innerHTML = `<div class="chat-usos">${USOS.map(([t, d, ej]) => `<section><h3>${esc(t)}</h3><p>${esc(d)}</p>${ej.map(s => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</section>`).join('')}</div>`;
    return;
  }
  const resultados = new Map<string, any>();
  for (const m of historial) if (m.role === 'user' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_result') resultados.set(b.tool_use_id, b);
  for (const m of historial) {
    if (typeof m.content === 'string') { añadir(m.role === 'user' ? 'm-yo' : 'm-ia', m.role === 'user' ? esc(m.content) : formato(m.content)); continue; }
    for (const b of m.content || []) {
      if (b.type === 'text' && b.text) añadir(m.role === 'user' ? 'm-yo' : 'm-ia', m.role === 'user' ? esc(b.text) : formato(b.text));
      else if (b.type === 'tool_use') {
        const r = resultados.get(b.id), el = añadir('m-her ' + (r && r.is_error ? 'err' : 'ok'), esc(etiqueta(b)));
        if (el && r && r.is_error) el.title = String(r.content || '');
        if (b.name === 'crear_modelo' && r && !r.is_error) tarjetaModelo(String(r.content || ''));
      }
    }
  }
}

async function vuelta(): Promise<Vuelta> {
  const r = await fetch('/api/asistente', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensajes: historial }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
  return j as Vuelta;
}

async function enviar(texto: string): Promise<void> {
  texto = String(texto || '').trim(); if (!texto || ocupado) return;
  ocupado = true; estadoForm();
  if (!historial.length) { const c = caja(); if (c) c.innerHTML = ''; }
  historial.push({ role: 'user', content: texto }); guardar(); añadir('m-yo', esc(texto));
  let pensando = añadir('m-her va', 'Pensando'), cambios = false;
  try {
    for (let v = 0; v < MAX_VUELTAS; v++) {
      let r: Vuelta;
      try { r = await vuelta(); }
      catch (e) { if (v === 0) { historial.pop(); guardar(); } throw e; }
      pensando?.remove(); pensando = null;
      historial.push({ role: 'assistant', content: r.content }); guardar();
      for (const b of r.content || []) {
        if (b.type === 'text' && b.text) añadir('m-ia', formato(b.text));
        else if (b.type === 'tool_use') {
          const res = (r.resultados || []).find(x => x.tool_use_id === b.id), el = añadir('m-her ' + (res && res.is_error ? 'err' : 'ok'), esc(etiqueta(b)));
          if (el && res && res.is_error) el.title = String(res.content || '');
          if (res && !res.is_error && !/^(listar|ver|buscar|quien)/.test(b.name)) cambios = true;
          if (b.name === 'crear_modelo' && res && !res.is_error) tarjetaModelo(String(res.content || ''));
        }
      }
      if (r.stop_reason === 'refusal') { añadir('m-err', 'Claude no puede ayudar con esa petición.'); break; }
      if (r.stop_reason === 'max_tokens') { añadir('m-err', 'La respuesta se cortó por larga. Pídele que siga.'); break; }
      if (r.stop_reason !== 'tool_use' || !(r.resultados || []).length) break;
      historial.push({ role: 'user', content: r.resultados }); guardar();
      pensando = añadir('m-her va', 'Pensando');
      if (v === MAX_VUELTAS - 1) { pensando?.remove(); añadir('m-err', 'El asistente llevaba demasiados pasos seguidos y se detuvo. Escríbele «sigue» para que continúe.'); }
    }
  } catch (e: any) { pensando?.remove(); añadir('m-err', esc(e.message || String(e))); }
  finally {
    ocupado = false; estadoForm();
    if (cambios) cargarProyectos().catch(() => { /* la lista del menú se actualiza en la próxima carga */ });
    ($('#chatTexto') as HTMLTextAreaElement | null)?.focus();
  }
}

function estadoForm(): void {
  const b = $('#chatEnviar') as HTMLButtonElement | null; if (b) { b.disabled = ocupado; b.textContent = ocupado ? 'Trabajando…' : 'Enviar'; }
}

const AVISO_APAGADO = `<div class="vacio"><h3>El asistente no está activado en este servidor</h3>
  <p>Necesita una API key de Claude. El administrador la añade como <code>CLAUDE_API</code> (o <code>ANTHROPIC_API_KEY</code>) en las variables del
  servidor —en producción, en la bóveda del panel, grupo <code>map-creator-app</code>— y redespliega. Mientras tanto puedes usar el
  <a href="#cuenta" data-ir-conexiones>MCP con Claude Code</a>, que hace lo mismo desde tu equipo.</p></div>`;

export async function vistaAsistente(): Promise<void> {
  principal.innerHTML = cabecera('Asistente', 'Pídele en lenguaje normal que cree mapas, diseñe objetos 3D, coloque cosas o publique en la biblioteca. Trabaja con tus permisos y guarda versiones antes de cambios grandes.',
    '<button class="btn fantasma" type="button" data-chat="nueva">Conversación nueva</button>')
    + '<div id="chatZona"><div class="cargando">Cargando…</div></div>';
  if (activo === null) {
    try { const c = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()); activo = !!(c && c.asistente); } catch { activo = false; }
  }
  const z = $('#chatZona'); if (!z) return;
  if (!activo) { z.innerHTML = AVISO_APAGADO; return; }
  z.innerHTML = `<div class="chat">
    <div class="chat-msjs" id="chatMsjs" aria-live="polite"></div>
    <form id="chatForm" class="chat-form"><textarea id="chatTexto" rows="2" placeholder="Por ejemplo: «crea un parque con un lago y diseña una banca de madera para ponerla alrededor»" aria-label="Mensaje para el asistente"></textarea>
      <button class="btn prim" id="chatEnviar" type="submit">Enviar</button></form>
    <p class="ayuda chat-pie">Usa Claude (Anthropic). Cada mensaje puede hacer varias llamadas; hay un límite por hora. La conversación se borra al cerrar la pestaña.</p></div>`;
  pintar(); estadoForm();
  const f = $('#chatForm') as HTMLFormElement, ta = $('#chatTexto') as HTMLTextAreaElement;
  f.addEventListener('submit', e => { e.preventDefault(); const t = ta.value; ta.value = ''; enviar(t); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  ta.focus();
  if (!enlazado) {
    enlazado = true;
    principal.addEventListener('click', e => {
      const t = e.target as HTMLElement, s = t.closest<HTMLElement>('[data-sug]'), n = t.closest<HTMLElement>('[data-chat="nueva"]');
      if (s && caja()) { const ta2 = $('#chatTexto') as HTMLTextAreaElement | null; if (ta2) { ta2.value = s.dataset.sug || ''; ta2.focus(); } }
      else if (n && caja()) { if (ocupado) { aviso('Espera a que termine.'); return; } historial = []; guardar(); pintar(); }
    });
  }
}
