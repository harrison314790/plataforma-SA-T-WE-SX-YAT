import type { AccionDeModulo } from './asignacion.interface';

/**
 * Espejo de las respuestas de `/api/v1/matriculas` (MatriculaService del
 * backend). camelCase de los dos lados.
 *
 * Una matrícula es por AÑO, no por período (20-matriculas-por-anio.sql):
 * en enero se matricula para un año cuyos períodos todavía no existen.
 */

export type EstadoMatricula = 'activa' | 'retirada';

/** 'A' aprobó · 'N' no aprobó · 'P' sin resultado final todavía. */
export type ResultadoAnio = 'A' | 'N' | 'P';

export interface AcudienteDeEstudiante {
  id: string;
  nombre: string;
  /** 'madre' | 'padre' | lo que haya sembrado la base antes ('abuela'...). */
  parentesco: string;
  documento: string | null;
}

/** Una cuenta de estudiante activa: el universo del buscador del formulario. */
export interface EstudianteMatriculable {
  id: string;
  nombres: string;
  apellidos: string;
  documento: string;
  acudientes: AcudienteDeEstudiante[];
}

export interface Matricula {
  id: string;
  estudianteId: string;
  anio: number;
  sedeId: number;
  grado: number;
  grupo: string;
  estado: EstadoMatricula;
  /** ISO `YYYY-MM-DD`. */
  fecha: string;
  acudienteId: string | null;
  motivoRetiro: string | null;
  detalleRetiro: string | null;
  fechaRetiro: string | null;
}

/** `GET /matriculas?anio=` -- todo lo de un año (y el anterior) en una petición. */
export interface DatosMatriculas {
  anio: number;
  estudiantes: EstudianteMatriculable[];
  /** Las del año pedido Y las del anterior: con las dos se arma "Por matricular". */
  matriculas: Matricula[];
  /** Cómo terminó cada estudiante el año ANTERIOR. Sin entrada = sin notas = 'P'. */
  resultados: Record<string, ResultadoAnio>;
}

export interface SedeDeMatricula {
  id: number;
  nombre: string;
  esPrincipal: boolean;
}

/** Un grupo abierto: lo único donde se puede matricular. */
export interface GrupoAbierto {
  sedeId: number;
  grado: number;
  grupo: string;
}

export interface OpcionesMatriculas {
  anios: number[];
  anioSugerido: number;
  /** La fecha del servidor (ISO), para "La fecha de matrícula será hoy, ...". */
  hoy: string;
  sedes: SedeDeMatricula[];
  ofertaGrados: GrupoAbierto[];
  motivosRetiro: string[];
  acciones: Record<string, AccionDeModulo>;
}

export interface MatriculaParaGuardar {
  estudiante_id: string;
  anio: number;
  sede_id: number;
  grado: number;
  grupo: string;
  acudiente_id: string | null;
}

export interface LoteParaGuardar {
  anio: number;
  sede_id: number;
  grado: number;
  grupo: string;
  estudiante_ids: string[];
}

export interface AcudienteParaGuardar {
  estudiante_id: string;
  parentesco: 'madre' | 'padre';
  nombres: string;
  apellidos: string;
  documento: string;
  telefono: string;
}

export interface AcudienteAgregado {
  acudiente: AcudienteDeEstudiante;
  /** `true` = la cédula ya estaba (p. ej. el papá de un hermano) y solo se vinculó. */
  yaExistia: boolean;
}
