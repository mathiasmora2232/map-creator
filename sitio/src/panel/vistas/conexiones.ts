/* Cuenta → «Conexiones (MCP)»: tokens de acceso personales para conectar Claude Code, Claude Desktop, Cursor u otro cliente MCP
   (o scripts con la API REST). El token completo se ve una sola vez, al crearlo. */
import { api, aviso, esc, fechaRel } from '../../comun';
import { $ } from '../../dom';
import type { TokenApi } from '../../tipos';
import { copiar } from '../estado';

const urlMcp = (): string => location.origin + '/mcp';

export function htmlConexiones(): string {
  return `<div class="caja"><h2>Conectar un asistente (MCP)</h2>
      <p class="ayuda">Con un token, Claude Code, Claude Desktop, Cursor o cualquier cliente MCP puede crear y editar tus mapas, colocar objetos,
      pedir terreno, guardar versiones, exportar e importar proyectos y usar la biblioteca, con tus mismos permisos.</p>
      <form id="formToken" class="fila-btn"><label class="campo" style="flex:1"><span>Nombre del token</span><input type="text" name="nombre" maxlength="60" required placeholder="Claude Code en mi PC"></label><button class="btn prim" type="submit">Crear token</button></form>
      <div id="tokenNuevo" hidden>
        <p class="ayuda"><b>Copia el token ahora:</b> no se vuelve a mostrar. Trátalo como una contraseña.</p>
        <div class="fila-btn"><input type="text" id="tokenValor" readonly class="mono" style="flex:1"><button class="btn" type="button" data-a="copiar-token">Copiar</button></div>
        <h3 class="sub-h">Claude Code</h3>
        <pre class="codigo" id="cmdClaude"></pre>
        <h3 class="sub-h">Claude Desktop, Cursor y otros (con mcp-remote)</h3>
        <pre class="codigo" id="cmdJson"></pre>
      </div></div>
    <div class="caja"><h2>Tus tokens</h2><div id="listaTokens"><div class="cargando">Cargando…</div></div>
      <p class="ayuda">Dirección del servidor MCP: <code>${esc(urlMcp())}</code> · cabecera <code>Authorization: Bearer &lt;token&gt;</code>. El mismo token vale para la API REST.</p></div>`;
}

async function pintarTokens(): Promise<void> {
  const l = $('#listaTokens'); if (!l) return;
  try {
    const ts = await api<TokenApi[]>('/api/cuenta/tokens');
    l.innerHTML = ts.length ? ts.map(t => `<div class="sesion"><span class="sesion-ic" aria-hidden="true">🔑</span>
      <span class="datos"><b>${esc(t.nombre)}</b><small class="mono">${esc(t.prefijo)}… · creado ${fechaRel(t.creado)} · ${t.ultimo_uso ? 'usado ' + fechaRel(t.ultimo_uso) : 'sin usar'}</small></span>
      <button class="btn fantasma peq peligro" data-a="revocar-token" data-id="${esc(t.id)}">Revocar</button></div>`).join('') : '<p class="tenue">Todavía no tienes tokens.</p>';
  } catch (ex: any) { l.innerHTML = `<p class="error-form">${esc(ex.message)}</p>`; }
}

export function enlazarConexiones(): void {
  pintarTokens();
  const f = $('#formToken'); if (!f) return;
  f.addEventListener('submit', async (e: Event) => {
    e.preventDefault(); const nombre = String(f.nombre.value || '').trim(); if (!nombre) return;
    try {
      const t = await api<TokenApi>('/api/cuenta/tokens', { method: 'POST', json: { nombre } });
      const tok = t.token || '';
      ($('#tokenValor') as HTMLInputElement).value = tok;
      $('#cmdClaude').textContent = `claude mcp add --transport http map-creator ${urlMcp()} --header "Authorization: Bearer ${tok}"`;
      $('#cmdJson').textContent = JSON.stringify({ mcpServers: { 'map-creator': { command: 'npx', args: ['-y', 'mcp-remote', urlMcp(), '--header', 'Authorization: Bearer ' + tok] } } }, null, 2);
      $('#tokenNuevo').hidden = false; f.reset(); pintarTokens();
    } catch (ex: any) { aviso(ex.message, 'err'); }
  });
}

/** Clics de esta pestaña (los reparte index.ts). Devuelve true si era suyo. */
export function clicConexiones(a: string, id: string): boolean {
  if (a === 'copiar-token') { copiar(($('#tokenValor') as HTMLInputElement).value); return true; }
  if (a === 'revocar-token') {
    if (confirm('¿Revocar este token? Lo que lo use dejará de funcionar al momento.')) api('/api/cuenta/tokens/' + id, { method: 'DELETE' }).then(() => { aviso('Token revocado.'); pintarTokens(); }).catch(ex => aviso(ex.message, 'err'));
    return true;
  }
  return false;
}
