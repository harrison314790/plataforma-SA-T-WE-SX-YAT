import type { NombreDeIcono } from '../navegacion/iconos';

/**
 * Los módulos del sistema, tal como los devuelve `NavegacionService` del
 * backend (a partir de las tablas `modulos` / `recursos` / `permisos`).
 *
 * El backend manda TODOS los módulos activos de la institución, no solo los
 * permitidos, cada uno con su bandera `disponible`. Es deliberado: el
 * escritorio muestra los no permitidos atenuados con el motivo en vez de
 * esconderlos, porque un módulo que simplemente no aparece se lee como "el
 * sistema no lo tiene" y termina en una llamada a soporte.
 */

/** Una entrada de menú: un `recursos` de tipo 'vista' habilitado para el rol. */
export interface VistaSesion {
  /** El mismo `codigo` que usan *appHasRole y el middleware de Laravel. */
  codigo: string;
  etiqueta: string;
  /** Ruta de Angular, con barra inicial: '/notas'. */
  ruta: string;
  icono: NombreDeIcono;
  descripcion: string | null;
}

export interface ModuloSesion {
  codigo: string;
  etiqueta: string;
  /** 'Académico' | 'Gestión' | 'Sistema' -- texto libre en la base. */
  grupo: string;
  icono: NombreDeIcono;
  orden: number;
  /** El rol puede entrar al menos a una vista de este módulo. */
  disponible: boolean;
  /** Solo las vistas habilitadas para el rol. Vacío si `disponible` es false. */
  vistas: VistaSesion[];
}

/**
 * En qué estado le queda un módulo a esta persona, cruzando las dos únicas
 * preguntas que importan:
 *
 * - `disponible`   -> el rol tiene permiso Y la pantalla existe en Angular.
 * - `en-construccion` -> tiene permiso pero la pantalla todavía no se
 *   construyó. Se muestra igual, y se dice, en vez de fingir que el módulo
 *   no existe: el usuario sabe que le corresponde y que está en camino.
 * - `sin-permiso`  -> el módulo existe y está habilitado en la institución,
 *   pero no para su rol. Es el estado "sin permiso" del sistema de diseño,
 *   distinto de "vacío" (references/diseno-ui.md).
 *
 * Quién responde cada mitad: el permiso lo sabe la base de datos, y si la
 * pantalla existe lo sabe el frontend (core/navegacion/modulos-construidos.ts).
 * Ninguna de las dos puede contestar por la otra.
 */
export type EstadoModulo = 'disponible' | 'en-construccion' | 'sin-permiso';

/** Un módulo ya resuelto para pintar: el del backend + su estado real. */
export interface ModuloDeMenu extends ModuloSesion {
  estado: EstadoModulo;
  /** La vista a la que lleva el módulo desde el menú: su primera vista. */
  rutaPrincipal: string | null;
}

/** Los módulos agrupados como los pinta la barra lateral. */
export interface GrupoDeMenu {
  etiqueta: string;
  modulos: ModuloDeMenu[];
}
