/* Recorrido guiado del panel (la primera vez, con «?» o desde Ayuda). */
import { iniciar } from '../recorrido';
import { app, guardarPref, pref } from './estado';

export function recorridoPanel(): void {
  const movil = innerWidth <= 860;
  if (movil) app.classList.add('menu-abierto');
  iniciar([
    { titulo: 'Bienvenido a Map Creator', texto: 'Te enseño el panel en un minuto. Puedes saltarlo y repetirlo cuando quieras desde <b>Ayuda → Recorrido guiado</b>.' },
    { el: '.lateral [data-a=nuevo]', titulo: 'Crea un mapa', texto: 'En blanco, con el tamaño que elijas, o desde una plantilla de ejemplo para aprender. Atajo: tecla <kbd>N</kbd>.' },
    { el: '.menu a[data-vista=inicio]', titulo: 'Inicio', texto: 'Aquí retomas lo último que abriste y ves los primeros pasos que te faltan.' },
    { el: '.menu a[data-vista=compartidos]', titulo: 'Compartidos contigo', texto: 'Los mapas de otras personas aparecen aquí cuando te añaden o abres su enlace de invitación.' },
    { el: '.menu a[data-vista=favoritos]', titulo: 'Favoritos', texto: 'Pulsa la ★ de cualquier mapa para tenerlo siempre a mano.' },
    { el: () => (movil ? null : document.querySelector('.tarjeta [data-a=menu-proyecto]')), titulo: 'Opciones de cada mapa', texto: 'Con <b>⋮</b> lo renombras, haces una copia, lo mandas a la papelera o lo <b>compartes con un enlace de invitación</b>.' },
    { el: '.menu a[data-a=recorrido]', titulo: 'Ayuda', texto: 'Repite este recorrido cuando quieras. La primera vez que abras el editor tendrás otro recorrido.' }
  ], { textoFin: 'Listo', alTerminar: () => { app.classList.remove('menu-abierto'); if (!pref('recorrido_panel')) guardarPref({ recorrido_panel: true }); } });
}
