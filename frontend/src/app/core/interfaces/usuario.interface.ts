import type { ModuloSesion } from './modulo.interface';

/**
 * Espejo exacto de lo que devuelven `UsuarioResource`, `PeriodoActivoResource`
 * y `SesionResource` en el backend. Las claves son camelCase de los dos
 * lados a propósito: Angular no traduce snake_case en ningún punto.
 *
 * Si cambia un campo en alguno de esos Resources, cambia acá en la misma
 * sesión de trabajo -- son un solo contrato escrito dos veces, no dos
 * modelos independientes.
 */

/**
 * El CÓDIGO del rol, no su rótulo. Es el mismo string que leen las
 * políticas RLS (`fn_rol_actual()`) y el middleware de Laravel.
 *
 * Esta unión es hoy la ÚNICA restricción de los cuatro valores posibles en
 * todo el proyecto: `roles.nombre` no tiene un `check` en Postgres y
 * tampoco hay un enum en Laravel (ver references/permisos.md). Si algún
 * día se agrega un rol, hay que tocar este tipo a mano.
 *
 * Angular no bifurca lógica por este string -- ni un `switch`, ni un guard
 * que compare `rol === 'admin'`: todo pasa por el mapa `permisos`. El tipo
 * existe para lo que sí necesita el rol tal cual, como la etiqueta de la
 * barra superior.
 */
export type Rol = 'super_admin' | 'admin' | 'profesor' | 'estudiante';

export interface RolInfo {
  codigo: Rol;
  /** Lo único que se le muestra a una persona: 'Docente', 'Administración'. */
  etiqueta: string;
}

export interface SedeResumen {
  id: number;
  nombre: string;
  tipo: 'principal' | 'vereda';
  vereda: string | null;
  /**
   * Decide la forma de la estrella en la barra lateral: llena = sede
   * principal, contorno = escuela satélite. Es una regla del sistema de
   * diseño con función, no decoración -- permite ubicar la sede de un
   * vistazo sin leer el nombre (references/diseno-ui.md).
   */
  esPrincipal: boolean;
}

export interface UsuarioSesion {
  id: string;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  /** Las calcula el backend para que el avatar sea idéntico en toda la app. */
  iniciales: string;
  email: string;
  documento: string;
  rol: RolInfo;
  /** `null` es legítimo: `usuarios.sede_id` es nullable en el esquema. */
  sede: SedeResumen | null;
}

export interface PeriodoActivo {
  id: number;
  nombre: string; // '2026-3'
  anio: number;
  numero: number; // 1..4
  fechaInicio: string; // ISO (solo fecha)
  fechaFin: string;
  fechaLimiteNotas: string; // ISO 8601 completo
  notasHabilitadas: boolean;
  /**
   * Lo calcula el SERVIDOR, no el navegador, y hay que dejarlo así: los
   * equipos de la escuela son compartidos y varios tienen la fecha mal
   * puesta. Restar `fechaLimiteNotas - Date.now()` en el cliente le podría
   * decir a un profesor que le quedan 12 días cuando el servidor ya cerró
   * el plazo -- y es el `now()` del servidor el que evalúa la política RLS.
   *
   * Negativo = el plazo ya venció.
   */
  diasRestantes: number;
  dentroDePlazo: boolean;
}

/**
 * Todo lo que la aplicación necesita saber de la sesión. Llega completo en
 * la respuesta del login (una sola petición, importa con conectividad
 * intermitente) y GET /autenticacion/yo devuelve exactamente esta misma
 * forma al recargar la página.
 */
export interface Sesion {
  usuario: UsuarioSesion;
  /** `null` entre el cierre de un año escolar y la apertura del siguiente. */
  periodoActivo: PeriodoActivo | null;
  /** `codigo` de recurso -> habilitado. Lo lee *appHasRole y los guards. */
  permisos: Record<string, boolean>;
  modulos: ModuloSesion[];
}

export interface RespuestaLogin extends Sesion {
  /**
   * Token opaco de Laravel Sanctum ('19|R5Uem...'), NO un JWT: no se puede
   * decodificar en el cliente ni trae fecha de expiración adentro. Por eso
   * el frontend no programa ningún refresco -- ver AuthService.
   */
  token: string;
}
