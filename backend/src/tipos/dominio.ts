export type Rol = 'admin' | 'profesor' | 'estudiante';

/**
 * Se completa en dos pasos: el middleware `autenticacion` arma id/email
 * desde el JWT validado contra Supabase Auth; `cargarRolUsuario` completa
 * rol/sedeId consultando la tabla `usuarios`. Los controladores solo se
 * ejecutan después de que ambos corrieron, así que pueden asumir que las
 * cuatro propiedades ya están pobladas.
 */
export interface UsuarioAutenticado {
  id: string;
  email: string;
  rol: Rol;
  sedeId: number | null;
}

/** Ver esquema completo en .claude/skills/sistema-academico/references/base-datos.md */
export interface Nota {
  id: number;
  estudianteId: string;
  profesorMateriaId: number;
  valor: number;
  creadoPor: string;
  creadoEn: string;
  modificadoPor: string | null;
  modificadoEn: string | null;
}

/** Datos que el service recibe para crear una nota; el resto (id, auditoría) lo asigna la base. */
export interface NotaNueva {
  estudianteId: string;
  profesorMateriaId: number;
  valor: number;
  profesorId: string;
}

/** Forma exacta que espera AuthService en Angular tras el login (ver frontend/.../auth.service.ts). */
export interface RespuestaLogin {
  jwt: string;
  rol: Rol;
  permisos: Record<string, boolean>;
}
