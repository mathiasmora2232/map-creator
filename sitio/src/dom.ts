/* Atajos del DOM. `El` es un HTMLElement que además acepta los campos de formulario por nombre (form.nombre, input.value…),
   que es como el código del sitio los usa; así se conservan los tipos de HTMLElement sin llenar todo de conversiones. */

export type El = HTMLElement & { [campo: string]: any };

/** Primer elemento que coincide (el código asume que existe; si puede faltar, compruébalo con `if (!el)`). */
export const $ = (selector: string): El => document.querySelector(selector) as El;
export const $$ = (selector: string): El[] => [...document.querySelectorAll(selector)] as El[];
/** Destino de un evento como El (para `.closest`, `.dataset`, `.value`…). */
export const objetivo = (e: Event): El => e.target as El;

/** Los campos de un formulario como texto (los archivos no se usan en estos formularios). */
export function datosForm(f: HTMLFormElement | El): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(f as HTMLFormElement).forEach((v, k) => { out[k] = typeof v === 'string' ? v : v.name; });
  return out;
}

/** localStorage sin romper si está bloqueado (modo privado, permisos). */
export function ls(clave: string): string | null;
export function ls(clave: string, valor: string): void;
export function ls(clave: string, valor?: string): string | null | void {
  try { if (valor === undefined) return localStorage.getItem(clave); localStorage.setItem(clave, valor); } catch { return null; }
}
