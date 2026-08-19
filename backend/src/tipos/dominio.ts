/**
 * Tipos que reflejan el esquema real de Supabase -- ver
 * backend/01-esquema-inicial_1.sql (tablas), backend/02-politicas-rls.sql
 * (RLS) y backend/03-datos-prueba.sql (datos de ejemplo: Marta Ríos
 * profesora de Matemáticas 9-B en Escuela La Laguna, Luis Pérez uno de
 * sus estudiantes). Todas las llaves primarias son `uuid`, no `bigint`.
 */

export type Rol = 'admin' | 'profesor' | 'estudiante';

export type TipoSede = 'principal' | 'vereda';

export interface Sede {
  id: string;
  nombre: string;
  tipo: TipoSede;
  vereda: string | null;
  sedePadreId: string | null;
  createdAt: string;
}

/**
 * Perfil de la app -- una fila por cada auth.users, pero con su propio
 * `id`. `authId` es la columna que enlaza con Supabase Auth (`auth_id`);
 * `id` es el uuid propio que usa el resto del esquema como referencia
 * (`estudiantes.usuario_id`, `notas.registrado_por`, etc.). Son dos
 * columnas distintas a propósito -- nunca asumir que `id === authId`.
 */
export interface Usuario {
  id: string;
  authId: string;
  rolId: string;
  sedeId: string | null;
  nombres: string;
  apellidos: string;
  documento: string;
  activo: boolean;
  createdAt: string;
}

/** Extensión de `usuarios` para quienes tienen rol `estudiante`. */
export interface Estudiante {
  id: string;
  usuarioId: string;
  activo: boolean;
}

/** Extensión de `usuarios` para quienes tienen rol `profesor`. */
export interface Profesor {
  id: string;
  usuarioId: string;
  activo: boolean;
}

export interface Acudiente {
  id: string;
  nombres: string;
  apellidos: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  usuarioId: string | null; // nullable: hoy es solo un contacto, no necesariamente tiene cuenta
}

export interface EstudianteAcudiente {
  estudianteId: string;
  acudienteId: string;
  parentesco: string; // 'madre' | 'padre' | 'tutor legal' | ...
  esPrincipal: boolean;
}

export interface Asignatura {
  id: string;
  nombre: string;
  codigo: string;
}

export interface PeriodoAcademico {
  id: string;
  nombre: string; // '2026-3'
  anio: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteNotas: string;
  notasHabilitadas: boolean;
  activo: boolean;
}

/** Qué profesor dicta qué asignatura, en qué sede y grado, en qué período. Reemplaza al `profesor_materia` de la skill. */
export interface Asignacion {
  id: string;
  profesorId: string;
  asignaturaId: string;
  sedeId: string;
  grado: string; // '9-B'
  periodoId: string;
}

/** A qué sede y grado pertenece un estudiante en un período dado. */
export interface Matricula {
  id: string;
  estudianteId: string;
  sedeId: string;
  grado: string;
  periodoId: string;
  estado: string; // 'activa' por defecto
}

/**
 * Plazo extendido para un profesor puntual, cuando el período ya cerró
 * (p. ej. por conectividad intermitente en una vereda). La política RLS de
 * `notas` (insert/update) revisa esta tabla como alternativa al plazo
 * normal del período -- ver 02-politicas-rls.sql.
 */
export interface ExcepcionPlazo {
  id: string;
  profesorId: string;
  asignacionId: string;
  periodoId: string;
  fechaLimiteExtendida: string;
  autorizadoPor: string;
  motivo: string | null;
  createdAt: string;
}

/**
 * Una nota definitiva por período (no desglosada). `estudianteId` apunta a
 * `estudiantes.id` (no a `usuarios.id`), `asignacionId` reemplaza al
 * `profesorMateriaId` de la skill. No hay `modificadoPor`/`modificadoEn`
 * separados todavía -- solo `registradoPor` + `updatedAt` (con trigger).
 * `historial_notas` para trazabilidad de correcciones está pendiente.
 */
export interface Nota {
  id: string;
  estudianteId: string;
  asignacionId: string;
  valor: number; // 1.0..5.0 (el esquema real usa este rango, no 0..5)
  enRevision: boolean;
  registradoPor: string; // -> usuarios.id
  createdAt: string;
  updatedAt: string;
}

/** Datos que necesita el repository para insertar; el resto lo asigna la base o el service. */
export interface NotaNueva {
  estudianteId: string;
  asignacionId: string;
  valor: number;
}

export interface Recurso {
  id: string;
  codigo: string;
  tipo: 'boton' | 'vista' | 'accion';
  descripcion: string | null;
  modulo: string;
}

export interface Permiso {
  rolId: string;
  recursoId: string;
  habilitado: boolean;
}

export interface Documento {
  id: string;
  estudianteId: string | null; // nullable: puede ser institucional
  tipoDocumento: string;
  storagePath: string;
  subidoPor: string;
  createdAt: string;
}

/**
 * Identidad resuelta durante el request, en dos pasos:
 * `autenticacion` arma `id`/`email` a partir del JWT (id = auth.uid());
 * `cargarRolUsuario` resuelve el resto consultando `usuarios` por
 * `auth_id = id`, y completa `usuarioId` (el `usuarios.id` propio, el que
 * hay que usar como FK en otras tablas -- p. ej. `notas.registrado_por`),
 * `rol` y `sedeId`.
 */
export interface UsuarioAutenticado {
  id: string;
  email: string;
  usuarioId: string;
  rol: Rol;
  sedeId: string | null;
}

/** Forma exacta que espera AuthService en Angular tras el login (ver frontend/.../auth.service.ts). */
export interface RespuestaLogin {
  jwt: string;
  rol: Rol;
  permisos: Record<string, boolean>;
}
