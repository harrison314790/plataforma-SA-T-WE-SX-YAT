import type { AccionDeModulo } from './asignacion.interface';
import type { SedeResumen } from './usuario.interface';

/**
 * Espejo exacto de `CuentaUsuarioResource` y de `GET /usuarios/opciones`
 * del backend. camelCase de los dos lados.
 *
 * Se llama `CuentaUsuario` y no `Usuario` a propósito: `UsuarioSesion`
 * (usuario.interface.ts) es la persona CONECTADA; esto es una cuenta que
 * un admin ADMINISTRA. Son contratos distintos que salen de Resources
 * distintos, y llamarlos igual invitaría a usar uno donde va el otro.
 */

/** Los únicos tipos de cuenta que administra el módulo. */
export type TipoCuenta = 'profesor' | 'estudiante';

export interface CuentaUsuario {
  id: string;
  tipo: TipoCuenta;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  iniciales: string;
  documento: string;
  email: string;
  /** `false` = no puede iniciar sesión; sus datos históricos se conservan. */
  activo: boolean;
  /**
   * Solo profesores. La sede de un estudiante es la de su matrícula
   * (módulo Matrículas), así que acá siempre llega `null`.
   */
  sede: SedeResumen | null;
  /**
   * Profesor con asignaciones / estudiante con matrícula. Si es `false`,
   * la fila muestra "Sin asignaciones todavía" / "Sin matrícula todavía".
   */
  vinculado: boolean;
  /**
   * Nada en el sistema apunta a esta cuenta. Decide si "Eliminar cuenta"
   * se ofrece o aparece deshabilitado con su explicación -- llega con la
   * fila para no ofrecer algo que el servidor va a rechazar.
   */
  eliminable: boolean;
  createdAt: string | null;
}

export interface OpcionesUsuarios {
  /** Para el select de sede del profesor. La principal viene primero. */
  sedes: SedeResumen[];
  /**
   * Dominio del email sugerido para estudiantes (`<documento>@<dominio>`).
   * Viene del backend porque cambia por instalación, no por versión.
   */
  dominioEstudiantes: string;
  /** `codigo` de recurso -> rótulo e ícono, definidos en `recursos`. */
  acciones: Record<string, AccionDeModulo>;
}

/** Lo que manda el formulario de alta. */
export interface CuentaParaCrear {
  tipo: TipoCuenta;
  nombres: string;
  apellidos: string;
  documento: string;
  email: string;
  /** Solo profesor. Para estudiante NO se manda (el backend lo prohíbe). */
  sede_id?: number;
  password: string;
}

/** Lo que manda el formulario de edición. Sin tipo ni contraseña. */
export interface CuentaParaActualizar {
  nombres: string;
  apellidos: string;
  documento: string;
  email: string;
  sede_id?: number;
  activo: boolean;
  /** Solo si coordinación restablece la contraseña. */
  password?: string;
}
