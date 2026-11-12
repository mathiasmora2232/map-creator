/* #admin (solo administradores): resumen del servidor, enlaces de registro y usuarios. */
import { api, esc, fechaRel } from '../../comun';
import type { Invitacion, ResumenAdmin, UsuarioAdmin } from '../../tipos';
import { tarjetaEnlace } from '../dialogos/compartir';
import { principal, tamano, yo } from '../estado';
import { cabecera } from '../piezas';

const dato = (n: string | number, t: string): string => `<div class="cifra"><b>${n}</b><span>${t}</span></div>`;

export async function vistaAdmin(): Promise<void> {
  if (!yo.es_admin) { location.hash = '#inicio'; return; }
  const cab = cabecera('Administración', 'Resumen del servidor, enlaces para crear cuentas y usuarios.', '<button class="btn prim" data-a="nuevo-registro">Crear enlace de registro</button>');
  principal.innerHTML = cab + '<div class="cargando">Cargando…</div>';
  const [r, enlaces, usuarios] = await Promise.all([api<ResumenAdmin>('/api/admin/resumen'), api<Invitacion[]>('/api/invitaciones'), api<UsuarioAdmin[]>('/api/admin/usuarios')]);
  principal.innerHTML = cab + `
    <div class="cifras">${dato(r.usuarios, 'usuarios')}${dato(r.activos_7d, 'activos esta semana')}${dato(r.proyectos, 'mapas')}${dato(r.documentos.toLocaleString('es'), 'documentos')}${dato(tamano(r.bytes_archivos), 'en archivos')}${dato(tamano(r.bytes_base), 'base de datos')}</div>
    <div class="nota-reg ${r.registro_abierto ? 'abierto' : ''}">${r.registro_abierto
      ? '<b>El registro está abierto:</b> cualquiera puede crearse una cuenta. Para que sea solo por invitación, pon <code>OO_REGISTRO_ABIERTO=false</code> en el <code>.env</code> del servidor y reinicia.'
      : '<b>El registro es solo por invitación.</b> Crea un enlace de registro, o pide a los dueños de los mapas que compartan con un enlace de invitación.'}</div>
    <div class="nota-reg ${r.correo ? '' : 'abierto'}">${r.correo
      ? '<b>Correo activo:</b> las cuentas nuevas verifican su correo con un código, se puede recuperar la contraseña y activar los dos pasos.'
      : '<b>Correo desactivado:</b> falta configurar <code>SMTP_HOST</code> (y el resto de <code>SMTP_*</code>) en el servidor. Sin correo no se verifican las cuentas ni se puede recuperar la contraseña.'}</div>
    <section class="bloque"><div class="bloque-cab"><h2>Enlaces de registro</h2></div>
      ${enlaces.length ? `<div class="enlaces enlaces-admin">${enlaces.map(i => tarjetaEnlace(i, true)).join('')}</div>` : '<div class="vacio peq"><p>Todavía no hay enlaces de registro.</p></div>'}
    </section>
    <section class="bloque"><div class="bloque-cab"><h2>Usuarios <span class="mono tenue">${usuarios.length}</span></h2></div>
      <div class="tabla"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Mapas</th><th>Alta</th><th>Último acceso</th></tr></thead><tbody>
        ${usuarios.map(u => `<tr><td>${esc(u.nombre)}${u.es_admin ? ' <span class="rol">Admin</span>' : ''}${u.id === yo.id ? ' <span class="tenue">(tú)</span>' : ''}</td><td>${esc(u.email)}</td><td>${u.proyectos}</td>
          <td>${fechaRel(u.creado)}</td><td>${u.ultimo_acceso ? fechaRel(u.ultimo_acceso) : '<span class="tenue">nunca</span>'}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
}
