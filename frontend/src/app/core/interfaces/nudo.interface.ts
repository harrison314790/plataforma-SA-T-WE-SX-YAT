/**
 * Nudos pedagógicos, porcentajes por grado y boletín por nudo.
 *
 * Espejo de las respuestas de NudoPedagogicoService, PorcentajeGradoService
 * y BoletinService (backend). Claves en camelCase, como el resto de la API.
 */

// ── Catálogo de nudos ──────────────────────────────────────────────

export interface NudoPedagogico {
  id: number;
  nombre: string;
  /** Orden en que sale en el boletín impreso. */
  orden: number;
  totalAsignaturas: number;
  /** Asignaciones activas de sus materias en el año de trabajo. */
  asignaciones: number;
  /** Profesores distintos que dictan alguna de sus materias ese año. */
  profesores: number;
  /** Grados que ya tienen porcentajes cargados para este nudo ese año. */
  gradosConPorcentaje: number[];
}

export interface AsignaturaConNudo {
  id: number;
  nombre: string;
  codigo: string;
  /** null = todavía no está en ningún nudo: no entra en el boletín. */
  nudoId: number | null;
  /** Grados donde la malla curricular la incluye. */
  gradosMalla: number[];
  /** Cursos donde se dicta en el año de trabajo ('6-A', '9-B'...). */
  cursos: string[];
  profesores: string[];
  asignaciones: number;
  /** De cualquier año, activas o no: con una sola ya no se puede eliminar. */
  asignacionesTotales: number;
  /** Grados+años con porcentaje cargado: vuelven a promedio simple si cambia de nudo. */
  porcentajes: { grado: number; anio: number }[];
}

export interface CatalogoNudos {
  /** Año del período activo: el que describen cursos y profesores. */
  anio: number;
  nudos: NudoPedagogico[];
  asignaturas: AsignaturaConNudo[];
}

export interface NudoParaGuardar {
  nombre: string;
  orden: number;
}

/** Alta o edición de materia. `codigo` solo al crear: después no se cambia. */
export interface MateriaParaGuardar {
  nombre: string;
  codigo?: string;
  nudo_pedagogico_id: number | null;
}

export interface ResultadoAsignarNudo {
  asignatura: Pick<AsignaturaConNudo, 'id' | 'nombre' | 'codigo' | 'nudoId'>;
  /** Grados+años cuyos porcentajes dejaron de sumar 100 por este cambio. */
  porcentajesAfectados: { grado: number; anio: number }[];
}

// ── Porcentajes por grado ─────────────────────────────────────────

export interface OpcionesPorcentajes {
  grados: number[];
  anios: number[];
  anioSugerido: number | null;
}

/**
 * Mismo criterio que la vista del boletín:
 * · ponderado       -> todas las materias con porcentaje y suman 100.
 * · promedio-simple -> ninguna tiene porcentaje (el comportamiento por defecto).
 * · incompleto      -> hay porcentajes pero no cierran: el boletín usa
 *                      promedio simple hasta que se corrija.
 */
export type EstadoNudo = 'ponderado' | 'promedio-simple' | 'incompleto';

export interface MateriaDeGrado {
  id: number;
  nombre: string;
  codigo: string;
  nudoId: number | null;
  profesores: string[];
  grupos: string[];
  peso: number | null;
}

export interface NudoDeGrado {
  id: number;
  nombre: string;
  /** false si el nudo tiene una sola materia en ese grado: no lleva porcentajes. */
  configurable: boolean;
  estado: EstadoNudo;
  materias: MateriaDeGrado[];
}

export interface ConfiguracionPorcentajes {
  grado: number;
  anio: number;
  nudos: NudoDeGrado[];
  sinNudo: MateriaDeGrado[];
}

export interface PorcentajesParaGuardar {
  grado: number;
  anio: number;
  nudos: { nudo_id: number; pesos: { asignatura_id: number; peso: number }[] }[];
}

// ── Boletín ───────────────────────────────────────────────────────

export interface OpcionesBoletin {
  anios: number[];
  anioSugerido: number | null;
  sedes: { id: number; nombre: string }[];
  ofertaGrados: { sedeId: number; grado: number; grupo: string }[];
}

export interface EstudianteDeCurso {
  id: string;
  nombreCompleto: string;
  documento: string;
}

export interface MateriaDeBoletin {
  id: number;
  nombre: string;
  peso: number | null;
  /** Una por período, en orden; null = sin nota todavía. */
  notas: (number | null)[];
}

export interface NotaDeNudoEnPeriodo {
  nota: number | null;
  esPonderado: boolean;
  /** Hay nota de nudo, pero a alguna materia le falta la suya. */
  incompleto: boolean;
}

export type Desempeno = 'Bajo' | 'Básico' | 'Alto' | 'Superior';

export interface NudoDeBoletin {
  id: number;
  nombre: string;
  materias: MateriaDeBoletin[];
  periodos: NotaDeNudoEnPeriodo[];
  /** Solo cuando están los 4 períodos; antes, null ("en progreso"). */
  definitiva: number | null;
  esParcial: boolean;
  desempeno: Desempeno | null;
  aprobado: boolean | null;
}

export interface Boletin {
  estudiante: { id: string; nombreCompleto: string; documento: string | null };
  anio: number;
  sede: string | null;
  grado: number;
  gradoNombre: string;
  grupo: string;
  esPrimaria: boolean;
  periodos: { id: number; numero: number; nombre: string; activo: boolean }[];
  nudos: NudoDeBoletin[];
  promedioGeneral: (number | null)[];
  sinNudo: MateriaDeBoletin[];
  escala: { desde: number; hasta: number; desempeno: Desempeno; aprobado: boolean }[];
}

/** Un año con matrícula del estudiante, para su selector de año. */
export interface AnioBoletin {
  anio: number;
  grado: number;
  grupo: string;
  sede: string | null;
  /** Tiene un período activo: sus notas todavía no son definitivas. */
  enCurso: boolean;
}

export interface BoletinPropio {
  anios: AnioBoletin[];
  boletin: Boletin;
}
