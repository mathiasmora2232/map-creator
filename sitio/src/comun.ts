/* Map Creator: utilidades del sitio (API, avisos, escape, miniaturas de plano) y lo que toda página hace al cargar
   (tema, logo, cabecera, registro cerrado, ver contraseña). Cada página importa este módulo una vez. */
import { $$ } from './dom';

/* tema elegido en Cuenta → Preferencias (se aplica antes de pintar: sin destello del otro tema) */
try { const t = localStorage.getItem('mc-tema'); if (t === 'claro') document.documentElement.dataset.theme = 'light'; else if (t === 'oscuro') document.documentElement.dataset.theme = 'dark'; } catch { /* sin almacenamiento */ }

export class ErrorApi extends Error {
  constructor(mensaje: string, public status: number, public code?: string) { super(mensaje); }
}

export interface OpcionesApi { method?: string; json?: unknown; sinRedirigir?: boolean }

/** Llamada a la API: JSON de ida y vuelta; los errores llegan como {error, code} y se lanzan como ErrorApi. */
export async function api<T = any>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const cab: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (opciones.json !== undefined) { cab['Content-Type'] = 'application/json'; body = JSON.stringify(opciones.json); }
  const r = await fetch(ruta, { method: opciones.method || 'GET', headers: cab, body, credentials: 'same-origin', cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const aqui = encodeURIComponent(location.pathname + location.search + location.hash);
    if (r.status === 401 && !opciones.sinRedirigir) location.href = '/entrar?siguiente=' + aqui;
    if (r.status === 403 && j.code === 'email_no_verificado' && !opciones.sinRedirigir) location.href = '/verificar?siguiente=' + aqui;
    throw new ErrorApi(j.error || 'Algo salió mal (' + r.status + ').', r.status, j.code);
  }
  return j as T;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (t: unknown): string => String(t == null ? '' : t).replace(/[&<>"']/g, c => ESCAPES[c]);

let tAviso: ReturnType<typeof setTimeout> | undefined;
export function aviso(texto: string, tipo?: 'err' | ''): void {
  let el = document.querySelector<HTMLElement>('.aviso');
  if (!el) { el = document.createElement('div'); el.className = 'aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  const caja = el; caja.textContent = texto; caja.classList.toggle('err', tipo === 'err');
  requestAnimationFrame(() => caja.classList.add('ver'));
  clearTimeout(tAviso); tAviso = setTimeout(() => caja.classList.remove('ver'), 3200);
}

export function fechaRel(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
  if (s < 86400 * 7) { const d = Math.round(s / 86400); return 'hace ' + d + (d === 1 ? ' día' : ' días'); }
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Miniatura de plano: subdivide un rectángulo en cuartos con una semilla (el id del proyecto), así cada mapa tiene la suya y
    siempre la misma. Paredes claras sobre azul plano, una puerta con barrido y la cota de abajo, como el Plano 2D del editor. */
export function miniatura(semilla: string, opciones: { ancho?: number; alto?: number; acento?: boolean } = {}): string {
  const o = { ancho: 320, alto: 180, acento: false, ...opciones };
  let h = 2166136261; for (const c of String(semilla)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const W = o.ancho, H = o.alto, m = 22, cuartos: [number, number, number, number][] = [];
  const partir = (x: number, y: number, w: number, hh: number, n: number): void => {
    if (n === 0 || (w < 70 && hh < 50)) { cuartos.push([x, y, w, hh]); return; }
    const vert = w / hh > 1.2 ? true : w / hh < .8 ? false : rnd() > .5, f = .35 + rnd() * .3;
    if (vert) { const a = Math.round(w * f); partir(x, y, a, hh, n - 1); partir(x + a, y, w - a, hh, n - 1); }
    else { const a = Math.round(hh * f); partir(x, y, w, a, n - 1); partir(x, y + a, w, hh - a, n - 1); }
  };
  partir(m, m, W - 2 * m, H - 2 * m - 8, 3);
  const lin = 'rgba(214,226,238,.9)', fino = 'rgba(159,179,200,.35)';
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><pattern id="g${h}" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="${fino}" stroke-width=".5"/></pattern></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#g${h})"/>`;
  const relleno = ['rgba(240,122,26,.16)', 'rgba(90,160,255,.12)', 'rgba(70,194,90,.10)', 'rgba(255,255,255,.04)'];
  cuartos.forEach(([x, y, w, hh], i) => {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${o.acento && i === 0 ? relleno[0] : relleno[1 + Math.floor(rnd() * 3)]}" stroke="${lin}" stroke-width="2.4"/>`;
    if (w > 40 && hh > 30 && rnd() > .35) { // puerta: hueco en la pared de abajo y barrido de 90°
      const px = x + 8 + rnd() * (w - 30), py = y + hh, r = 13;
      s += `<line x1="${px}" y1="${py}" x2="${px + r}" y2="${py}" stroke="#1d2733" stroke-width="3.2"/>`;
      s += `<path d="M${px} ${py} L${px} ${py - r} A${r} ${r} 0 0 1 ${px + r} ${py}" fill="none" stroke="${lin}" stroke-width=".8" stroke-dasharray="2 2"/>`;
    }
  });
  const yb = H - m + 2;
  s += `<g stroke="${lin}" stroke-width=".8"><line x1="${m}" y1="${yb}" x2="${W - m}" y2="${yb}"/><line x1="${m}" y1="${yb - 4}" x2="${m}" y2="${yb + 4}"/><line x1="${W - m}" y1="${yb - 4}" x2="${W - m}" y2="${yb + 4}"/></g>`;
  s += `<text x="${W / 2}" y="${yb - 4}" fill="${lin}" font-family="IBM Plex Mono,monospace" font-size="8" text-anchor="middle">${(8 + rnd() * 40).toFixed(1).replace('.', ',')} m</text></svg>`;
  return s;
}

export const LOGO = '<svg class="logo-ic" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--acc)"/><path d="M8 9h9v6h7v8H8z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M17 15v8" stroke="#fff" stroke-width="1.4"/><path d="M12 23a4 4 0 0 1 4-4" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="1.6 1.6"/></svg>';

/** ?siguiente= solo si es una ruta de esta web. */
export const siguiente = (defecto = '/app'): string => {
  const s = new URLSearchParams(location.search).get('siguiente') || '';
  return /^\/(?!\/)/.test(s) && !s.includes('\\') ? s : defecto;
};

/** Campo de código de 6 dígitos: solo cifras, y al completar los 6 llama a alCompletar. Devuelve una función que lee el código. */
export function campoCodigo(input: HTMLInputElement, alCompletar?: (codigo: string) => void): () => string {
  input.setAttribute('inputmode', 'numeric'); input.setAttribute('autocomplete', 'one-time-code'); input.setAttribute('maxlength', '7');
  input.setAttribute('pattern', '[0-9 ]*'); input.classList.add('codigo-input');
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
    if (d.length === 6 && alCompletar) alCompletar(d);
  });
  return () => input.value.replace(/\D/g, '');
}

/** Botón «Reenviar código» con cuenta atrás. */
export function cuentaAtras(boton: HTMLButtonElement, segundos: number): void {
  const texto = boton.dataset.texto || (boton.dataset.texto = boton.textContent || '');
  let s = segundos; boton.disabled = true;
  const paso = (): void => { if (s <= 0) { boton.disabled = false; boton.textContent = texto; return; } boton.textContent = texto + ' (' + s + ' s)'; s--; setTimeout(paso, 1000); };
  paso();
}

/* ───────── Lo que hace toda página al cargar ───────── */

/* La cabecera de la landing gana borde al bajar. */
const cab = document.querySelector('.cab');
if (cab) { const f = () => cab.classList.toggle('con-borde', scrollY > 8); addEventListener('scroll', f, { passive: true }); f(); }
$$('[data-logo]').forEach(el => el.insertAdjacentHTML('afterbegin', LOGO));

/* Registro cerrado (solo por invitación): los botones «Crear cuenta» de la landing pasan a «Entrar» y la página de registro lo
   explica en vez de mostrar un formulario que fallaría al final. */
if (document.querySelector('[data-registro],[data-registro-alt],[data-si-correo],#formCuenta[data-modo=registro]')) {
  fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).then((c: { registro_abierto: boolean; correo: boolean }) => {
    if (c.correo) $$('[data-si-correo]').forEach(el => { el.hidden = false; });
    if (c.registro_abierto) return;
    $$('[data-registro]').forEach(a => { (a as unknown as HTMLAnchorElement).href = '/entrar'; a.textContent = a.dataset.registro || 'Entrar'; });
    $$('[data-registro-alt]').forEach(p => { p.textContent = '¿No tienes cuenta? El registro es solo por invitación: pide un enlace a quien te quiera dar acceso.'; });
    const f = document.querySelector('#formCuenta[data-modo=registro]'), caja = f && f.closest('.form-caja');
    if (caja) caja.innerHTML = '<h1>Registro por invitación</h1><p class="sub">En este servidor solo se puede crear una cuenta con un enlace de invitación. '
      + 'Pídeselo a quien te quiera compartir un mapa o al administrador, y ábrelo: allí mismo podrás crear tu cuenta.</p>'
      + '<a class="btn prim grande" href="/entrar">Ya tengo cuenta: entrar</a>';
  }).catch(() => { /* sin config: se deja como está */ });
}

/* Botón «ver contraseña» en todos los campos de contraseña (también en los que se pintan después). */
function ojos(): void {
  document.querySelectorAll<HTMLInputElement>('input[type=password]:not([data-ojo])').forEach(inp => {
    inp.dataset.ojo = '1'; const caja = document.createElement('span'); caja.className = 'clave-caja';
    inp.parentNode?.insertBefore(caja, inp); caja.appendChild(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ver-clave'; b.setAttribute('aria-label', 'Mostrar la contraseña'); b.title = 'Mostrar la contraseña';
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    b.addEventListener('click', () => { const ver = inp.type === 'password'; inp.type = ver ? 'text' : 'password'; b.classList.toggle('on', ver); b.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña'); inp.focus(); });
    caja.appendChild(b);
  });
}
ojos(); new MutationObserver(ojos).observe(document.body, { childList: true, subtree: true });
