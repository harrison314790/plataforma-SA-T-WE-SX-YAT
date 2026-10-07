import type {
  EstudianteMatriculable,
  GrupoAbierto,
  Matricula,
  OpcionesMatriculas,
  ResultadoAnio,
  SedeDeMatricula,
} from '../../core/interfaces/matricula.interface';

/**
 * Las reglas de la pantalla de Matrículas que no dependen de Angular:
 * qué grupos hay abiertos y qué grado se le sugiere a cada estudiante.
 * Funciones puras a propósito -- se leen y se prueban sin montar nada.
 *
 * LA SUGERENCIA ES SOLO UNA AYUDA. El backend no la conoce: lo que valida
 * es que no se matricule dos veces, ni a un graduado, ni en un grupo
 * cerrado (MatriculaService). Si la secretaria elige otro grado, puede.
 */

/** El grupo único de las escuelas de vereda se guarda como 'UNICO'. */
export const GRUPO_UNICO = 'UNICO';

export function rotuloGrupo(grupo: string): string {
  return grupo === GRUPO_UNICO ? 'Único' : grupo;
}

/** "9-B", o "3° Único" en las escuelas de un solo grupo por grado. */
export function curso(grado: number, grupo: string | null | undefined): string {
  if (!grupo) return `${grado}°`;
  return grupo === GRUPO_UNICO ? `${grado}° Único` : `${grado}-${grupo}`;
}

/** Para buscar "Chocue" y encontrar "Chocué": sin tildes y en minúsculas. */
export const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const plural = (n: number, singular: string, varios: string): string =>
  n === 1 ? `1 ${singular}` : `${n} ${varios}`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2027-01-13` -> `13 ene 2027`. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}

export function iniciales(nombres: string, apellidos: string): string {
  return `${nombres.trim()[0] ?? ''}${apellidos.trim()[0] ?? ''}`.toUpperCase();
}

/**
 * Los grupos ABIERTOS por sede y grado, sacados de `oferta_grados`. Es lo
 * único donde se puede matricular: la pantalla nunca ofrece un grupo que
 * el backend vaya a rechazar.
 */
export class CatalogoCursos {
  private readonly porSede = new Map<number, Map<number, string[]>>();
  readonly sedes: SedeDeMatricula[];
  readonly sedePrincipalId: number | null;

  constructor(opciones: Pick<OpcionesMatriculas, 'sedes' | 'ofertaGrados'>) {
    this.sedes = opciones.sedes;
    this.sedePrincipalId = opciones.sedes.find((s) => s.esPrincipal)?.id ?? null;

    for (const o of opciones.ofertaGrados) this.agregar(o);
    for (const grados of this.porSede.values()) {
      for (const grupos of grados.values()) grupos.sort((a, b) => a.localeCompare(b, 'es'));
    }
  }

  private agregar(o: GrupoAbierto): void {
    const grados = this.porSede.get(o.sedeId) ?? new Map<number, string[]>();
    grados.set(o.grado, [...(grados.get(o.grado) ?? []), o.grupo]);
    this.porSede.set(o.sedeId, grados);
  }

  nombreSede(sedeId: number | null | undefined): string {
    return this.sedes.find((s) => s.id === sedeId)?.nombre ?? '';
  }

  /** Los grados con al menos un grupo abierto en esa sede, de menor a mayor. */
  grados(sedeId: number): number[] {
    return [...(this.porSede.get(sedeId)?.keys() ?? [])].sort((a, b) => a - b);
  }

  grupos(sedeId: number, grado: number): string[] {
    return this.porSede.get(sedeId)?.get(grado) ?? [];
  }

  ofrece(sedeId: number, grado: number): boolean {
    return this.grupos(sedeId, grado).length > 0;
  }

  /** Las sedes que tienen ese grado abierto (para "Cambiar de grupo"). */
  sedesCon(grado: number): SedeDeMatricula[] {
    return this.sedes.filter((s) => this.ofrece(s.id, grado));
  }

  /**
   * El grupo que se elige solo: el preferido si existe (quien estaba en
   * 8-B sigue en 9-B), si no el único que haya; con varios y sin
   * preferencia, el primero -- la secretaria lo cambia si no es.
   */
  grupoAutomatico(sedeId: number, grado: number, preferido?: string | null): string {
    const grupos = this.grupos(sedeId, grado);
    if (preferido && grupos.includes(preferido)) return preferido;
    return grupos[0] ?? '';
  }
}

export type TipoSugerencia =
  | 'nuevo' // sin matrícula el año anterior
  | 'retirado' // se retiró el año anterior: vuelve al mismo grado
  | 'graduado' // aprobó 11°: no se matricula
  | 'repite' // no aprobó: mismo grado
  | 'provisional' // su año sigue en progreso: se supone que aprueba
  | 'promovido'; // aprobó: grado siguiente

export interface Sugerencia {
  tipo: TipoSugerencia;
  anterior: Matricula | null;
  resultado: ResultadoAnio | null;
  sedeId: number | null;
  grado: number | null;
  grupo: string;
  /** Pasa a un grado que su sede no tiene (p. ej. de 5° de vereda a 6°). */
  cambiaDeSede: boolean;
}

/**
 * Qué se le sugiere a un estudiante para `anio`, según su matrícula y su
 * resultado de `anio - 1`.
 *
 * Un estudiante sin resultado (nadie le subió notas, o el año no
 * terminó) cuenta como "en progreso", nunca como aprobado: la regla del
 * sistema es no inventar resultados.
 */
export function sugerir(
  estudianteId: string,
  matriculas: readonly Matricula[],
  anio: number,
  resultados: Readonly<Record<string, ResultadoAnio>>,
  catalogo: CatalogoCursos,
): Sugerencia {
  const delAnterior = matriculas.filter((m) => m.estudianteId === estudianteId && m.anio === anio - 1);
  const anterior = delAnterior.find((m) => m.estado === 'activa') ?? delAnterior[0] ?? null;
  const vacia = { anterior, resultado: null, sedeId: null, grado: null, grupo: '', cambiaDeSede: false };

  if (anterior === null) return { tipo: 'nuevo', ...vacia };

  if (anterior.estado === 'retirada') {
    return {
      ...ubicar(catalogo, anterior, anterior.grado),
      tipo: 'retirado',
      anterior,
      resultado: null,
    };
  }

  const resultado = resultados[estudianteId] ?? 'P';

  if (anterior.grado === 11 && resultado === 'A') return { ...vacia, tipo: 'graduado', resultado };

  // En 11° con el año en curso no hay "siguiente": si aprueba, se gradúa.
  // Se sugiere 11° (el caso que obliga a matricular: que no apruebe), y
  // el aviso de "provisional" lo explica.
  const grado = resultado === 'N' || anterior.grado === 11 ? anterior.grado : anterior.grado + 1;

  return {
    ...ubicar(catalogo, anterior, grado),
    tipo: resultado === 'N' ? 'repite' : resultado === 'P' ? 'provisional' : 'promovido',
    anterior,
    resultado,
  };
}

/**
 * Dónde cursar `grado`: en su misma sede si lo tiene; si no, en la sede
 * principal (el caso real: las escuelas de vereda llegan hasta 5°); si
 * tampoco, en cualquier sede que lo tenga abierto.
 */
function ubicar(catalogo: CatalogoCursos, anterior: Matricula, grado: number) {
  const candidatas = [
    anterior.sedeId,
    catalogo.sedePrincipalId,
    ...catalogo.sedes.map((s) => s.id),
  ].filter((id): id is number => id !== null);

  const sedeId = candidatas.find((id) => catalogo.ofrece(id, grado)) ?? anterior.sedeId;

  return {
    sedeId,
    grado,
    grupo: catalogo.grupoAutomatico(sedeId, grado, anterior.grupo),
    cambiaDeSede: sedeId !== anterior.sedeId,
  };
}

/** El chip de "Resultado del año": ícono + texto, nunca color solo. */
export interface ChipResultado {
  texto: string;
  icono: string;
  clase: 'aprobo' | 'reprobo' | 'progreso' | 'retirado';
}

export function chipResultado(resultado: ResultadoAnio | null, grado: number | null): ChipResultado {
  switch (resultado) {
    case 'A':
      return { texto: `Aprobó ${grado}°`, icono: '✓', clase: 'aprobo' };
    case 'N':
      return { texto: `No aprobó ${grado}°`, icono: '✕', clase: 'reprobo' };
    default:
      return { texto: 'En progreso', icono: '●', clase: 'progreso' };
  }
}

/** Cómo se lee el motivo de un retiro: "Otro" muestra el detalle. */
export function motivoLegible(m: Pick<Matricula, 'motivoRetiro' | 'detalleRetiro'>): string {
  return m.motivoRetiro === 'Otro' ? (m.detalleRetiro ?? 'Otro') : (m.motivoRetiro ?? '');
}

/** Un estudiante del año anterior que todavía no tiene matrícula este año. */
export interface Pendiente {
  estudiante: EstudianteMatriculable;
  anterior: Matricula;
  resultado: ResultadoAnio;
  sugerencia: Sugerencia;
}
