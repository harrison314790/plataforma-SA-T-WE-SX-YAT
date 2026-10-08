/**
 * Espejo de lo que devuelven NotaService y NotaPeriodoService en el
 * backend. Claves camelCase de los dos lados: Angular no traduce
 * snake_case en ningún punto. Si cambia un campo allá, cambia acá en la
 * misma sesión -- es un solo contrato escrito dos veces.
 *
 * Las fechas llegan en ISO 8601 con zona (UTC). Se muestran en la hora
 * local del equipo, pero los PLAZOS se comparan contra `ahora` del
 * servidor, nunca contra `Date.now()` (ver features/notas/reglas.ts).
 */

/**
 * 'cerrado' = ya terminó, solo consulta · 'activo' = hoy cae dentro ·
 * 'futuro' = aún no empieza. Sale de las fechas del calendario, nunca de
 * una marca a mano (22-epocas-por-fecha.sql).
 */
export type EstadoPeriodo = 'cerrado' | 'activo' | 'futuro';

export interface PeriodoNotas {
  id: number;
  nombre: string;
  anio: number;
  numero: number;
  /** 'Primera'…'Cuarta', como lo dice el boletín. */
  epoca: string;
  /** 'Teeçx', "Je'z", 'Tekh', 'Pahz': el nombre en nasa yuwe. */
  epocaNasa: string | null;
  /** El calendario de la época (YYYY-MM-DD, fecha del colegio). De aquí sale cuál está activa. */
  fechaInicio: string;
  fechaFin: string;
  /** Calculado por el backend con la fecha de hoy contra el calendario. */
  estado: EstadoPeriodo;
  notasHabilitadas: boolean;
  fechaLimiteNotas: string | null;
  /** Lo que respondería la política RLS para un profesor SIN prórroga, en el momento de la respuesta. */
  cargaAbierta: boolean;
}

export interface Prorroga {
  id: string;
  hasta: string;
  motivo: string | null;
  autorizadoPor: string;
  autorizadaEn: string;
}

export interface SedeCorta {
  id: number;
  nombre: string;
}

// ─────────────────────────────────────────────────────────────
// Profesor: "Registro de notas"
// ─────────────────────────────────────────────────────────────

export interface NotaRegistrada {
  id: string;
  valor: number;
  registradaEn: string | null;
  /** La última corrección de coordinación, si hubo. */
  corregidaEn: string | null;
}

export interface EstudianteDelCurso {
  id: string;
  nombres: string;
  apellidos: string;
  documento: string;
  /** Retirado del año: su nota se ve, pero ya no se le pide una nueva. */
  retirado: boolean;
  nota: NotaRegistrada | null;
}

export interface AsignacionDelProfesor {
  id: string;
  materia: string;
  grado: number;
  grupo: string;
  sede: SedeCorta;
  /** La prórroga viva (puede estar vencida: se compara contra `ahora`). */
  prorroga: Prorroga | null;
  estudiantes: EstudianteDelCurso[];
}

export interface RegistroProfesor {
  ahora: string;
  periodos: PeriodoNotas[];
  periodo: PeriodoNotas;
  asignaciones: AsignacionDelProfesor[];
}

export interface NotaGuardada {
  estudianteId: string;
  nota: NotaRegistrada;
}

export interface LoteDeNotas {
  asignacion_id: string;
  periodo_id: number;
  notas: { estudiante_id: string; valor: number }[];
}

// ─────────────────────────────────────────────────────────────
// Coordinación: "Seguimiento de notas"
// ─────────────────────────────────────────────────────────────

export interface AvanceAsignacion {
  id: string;
  profesor: { id: string; nombre: string };
  materia: string;
  grado: number;
  grupo: string;
  sede: SedeCorta;
  /** Estudiantes activos del curso (más los retirados que alcanzaron a tener nota). */
  total: number;
  conNota: number;
  ultimaCarga: string | null;
  prorroga: Prorroga | null;
}

export interface SeguimientoNotas {
  ahora: string;
  /** Fecha de hoy en el colegio (YYYY-MM-DD): la que decide la época activa. */
  hoy: string;
  /** Las épocas del año: el calendario. */
  periodos: PeriodoNotas[];
  periodo: PeriodoNotas;
  /** `false` en receso: hoy no cae en ninguna época y nadie sube notas. */
  hayEpocaActiva: boolean;
  asignaciones: AvanceAsignacion[];
}

export interface CorreccionNota {
  antes: number;
  despues: number;
  motivo: string;
  por: string;
  en: string | null;
}

export interface NotaDetalle {
  id: string;
  valor: number;
  registradaEn: string | null;
  registradaPor: string;
  historial: CorreccionNota[];
}

export interface DetalleAsignacion {
  periodoId: number;
  estudiantes: (Omit<EstudianteDelCurso, 'nota'> & { nota: NotaDetalle | null })[];
}

export interface FechasDeEpoca {
  periodo_id: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface CalendarioGuardado {
  periodos: PeriodoNotas[];
  /** La época activa con las fechas nuevas; `null` si hoy queda en receso. */
  activa: PeriodoNotas | null;
}
