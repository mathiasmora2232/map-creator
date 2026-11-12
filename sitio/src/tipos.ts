/* Tipos de lo que devuelve la API (api/app/rutas/*.py). Si cambia un endpoint, se cambia aquí y tsc avisa dónde se usa. */

export type Rol = 'dueno' | 'editor' | 'lector';

export interface Preferencias {
  tema?: 'claro' | 'oscuro' | null;
  color_avatar?: string | null;
  vista_inicial?: '' | 'planta' | 'iso' | null;
  sin_recorridos?: boolean | null;
  recorrido_panel?: boolean | null;
  recorrido_editor?: boolean | null;
  pasos_ocultos?: boolean | null;
  enlace_creado?: boolean | null;
  [k: string]: unknown;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  es_admin: boolean;
  preferencias: Preferencias;
  email_verificado: boolean;
  dos_pasos: boolean;
  bio: string;
  empresa: string;
  avatar_v: number;
  correo_activo: boolean;
  registro_abierto: boolean;
}

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string;
  plantilla: string;
  mapa_inicial: string;
  creado: string;
  actualizado: string;
  archivado: string | null;
  rol: Rol;
  favorito: boolean;
  abierto: string | null;
  dueno_nombre: string;
  dueno_id: string;
  n_miembros: number;
  n_cambios: number;
  acceso_expira?: string | null;
}

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  etiqueta: string;
  origen: 'sistema' | 'usuario';
  mia?: boolean;
  autor?: string;
  visibilidad?: 'privada' | 'publica';
  usos?: number;
  n_documentos?: number;
}

export interface Miembro {
  id: string;
  nombre: string;
  email: string;
  avatar_v: number;
  rol: Rol;
  creado: string;
  expira: string | null;
  vencido: boolean;
  invitacion_id: string | null;
}

export type EstadoInvitacion = 'activa' | 'caducada' | 'agotada' | 'revocada';

export interface Invitacion {
  id: string;
  proyecto_id: string | null;
  rol: 'editor' | 'lector' | null;
  nota: string;
  creado: string;
  expira: string | null;
  usos_max: number | null;
  usos: number;
  revocada: string | null;
  acceso_dias: number | null;
  creado_por_nombre: string;
  estado: EstadoInvitacion;
  usado_por: { id: string; nombre: string; email: string; fecha: string }[];
  token?: string;
  ruta?: string;
  enviado?: boolean;
}

export interface Sesion {
  id: string;
  dispositivo: string;
  ip: string | null;
  creado: string;
  expira: string;
  actual: boolean;
}

export interface Perfil {
  creado: string;
  mapas: number;
  compartidos: number;
  cambios: number;
  invitaciones: number;
}

export interface ResumenAdmin {
  usuarios: number;
  activos_7d: number;
  proyectos: number;
  documentos: number;
  bytes_archivos: number;
  bytes_base: number;
  registro_abierto: boolean;
  correo: boolean;
}

export interface UsuarioAdmin {
  id: string;
  nombre: string;
  email: string;
  es_admin: boolean;
  creado: string;
  ultimo_acceso: string | null;
  proyectos: number;
}

export interface InfoInvitacion {
  tipo: 'proyecto' | 'registro';
  invita: string;
  proyecto: string | null;
  descripcion: string;
  plantilla: string | null;
  rol: 'editor' | 'lector' | null;
  acceso_dias: number | null;
  registro_abierto: boolean;
}

/* Respuestas de entrar/registro */
export interface RespuestaEntrada {
  id?: string;
  nombre?: string;
  email?: string;
  dos_pasos?: boolean;
  desafio?: string;
  verificar?: boolean;
  proyecto?: { id: string; mapa_inicial: string } | null;
}
