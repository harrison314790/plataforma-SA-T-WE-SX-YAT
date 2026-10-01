import type { SedeResumen } from './usuario.interface';

/**
 * Espejo exacto de `AsignacionResource` y del endpoint
 * `GET /asignaciones/opciones` del backend. camelCase de los dos lados:
 * Angular no traduce snake_case en ningún punto.
 *
 * Si cambia un campo en ese Resource, cambia acá en la misma sesión de
 * trabajo -- es un solo contrato escrito dos veces, no dos modelos.
 *
 * `SedeResumen` se reutiliza de `usuario.interface.ts` en vez de
 * declararse de nuevo: es literalmente la misma forma (la que ya usa la
 * estrella llena/contorno de la barra lateral), y duplicarla garantizaría
 * que un día se desincronicen.
 */

/**
 * Una asignación es ANUAL, no por período (`09-asignaciones-por-anio.sql`).
 * Por eso hay `anio` y no `periodoId`: quién dicta qué se decide una vez
 * al año, mientras que la calificación sigue siendo una por período.
 */
export interface Asignacion {
  id: string;
  /** Nivel real, 1..11. Separado de `grupo` desde 07-grado-grupo-malla.sql. */
  grado: number;
  /** Paralelo: 'A', 'B'... Nunca viene vacío (es `not null` desde 08). */
  grupo: string;
  anio: number;
  /**
   * `false` = el profesor ya no dicta esto. Las notas ya registradas se
   * conservan; la asignación deja de ofrecerse para trabajo nuevo.
   */
  activo: boolean;
  profesor: ProfesorResumen;
  asignatura: AsignaturaResumen;
  /** Se infiere del profesor al guardar; acá viaja solo para mostrarse. */
  sede: SedeResumen;
  /**
   * Cuántas notas cuelgan de esta asignación. Llega con el listado y no en
   * una segunda petición: es lo que decide si el diálogo de borrado puede
   * ofrecer "Eliminar" o solo "Desactivar", y pedirlo aparte agregaría un
   * round-trip justo cuando la persona está esperando.
   */
  cantidadNotas: number;
  createdAt: string | null;
}

export interface ProfesorResumen {
  id: string;
  nombreCompleto: string;
  activo: boolean;
}

export interface AsignaturaResumen {
  id: number;
  nombre: string;
  codigo: string;
}

/** Un profesor tal como lo ofrece el selector del formulario, con su sede. */
export interface ProfesorOpcion {
  id: string;
  nombreCompleto: string;
  /** `null` es legítimo: `usuarios.sede_id` es nullable en el esquema. */
  sede: SedeResumen | null;
}

/**
 * Una combinación sede+grado+grupo del catálogo `oferta_grados`.
 *
 * Llega COMPLETA (activas e inactivas) en `opciones`, con su `activo` al
 * lado, porque las dos pantallas que la consumen necesitan cosas
 * distintas de la misma respuesta: el formulario de asignaciones solo
 * ofrece las abiertas, y la pantalla de gestión las muestra todas -- si
 * no, una combinación desactivada no se podría reactivar nunca.
 */
export interface OfertaGradoOpcion {
  id: number;
  sedeId: number;
  grado: number;
  grupo: string;
  activo: boolean;
}

/**
 * Lo mismo, pero como lo devuelve `GET /oferta-grados`: con el conteo de
 * cuánto depende de esa fila.
 *
 * `usos` no es una columna. Decide si el botón dice "Eliminar" o
 * "Desactivar": la llave foránea compuesta de la base bloquea el borrado
 * de cualquier combinación con historial, y averiguarlo recién al pulsar
 * significaría mostrar un error donde podía mostrarse la opción correcta.
 */
export interface OfertaGrado extends OfertaGradoOpcion {
  usos: {
    asignaciones: number;
    matriculas: number;
    /**
     * Notas que cuelgan de las asignaciones de esta combinación. Es el
     * conteo que cambia el tono del mensaje: un grado con asignaciones
     * vacías es configuración que se rehace en un minuto; uno con notas
     * tiene el trabajo de un profesor y el boletín de alguien adentro.
     */
    notas: number;
  };
}

/** Lo que manda el formulario de alta de un grado+grupo. */
export interface OfertaGradoParaGuardar {
  sede_id: number;
  grado: number;
  grupo: string;
}

/** Qué asignatura ve cada grado. Propiedad del grado, nunca del grupo. */
export interface MallaOpcion {
  grado: number;
  asignaturaId: number;
}

/**
 * Todo lo que el formulario necesita, en una sola respuesta
 * (`GET /asignaciones/opciones`). La malla y la oferta llegan completas
 * para que los selectores se recalculen sin pedirle nada al servidor cada
 * vez que cambia el grado -- importa con conectividad intermitente.
 */
/**
 * Una acción de la pantalla, tal como la define `recursos` en la base
 * (14-acciones-de-tabla.sql).
 *
 * Lo que viene de la base es el RÓTULO y el ÍCONO; quién la ve sale del
 * mapa de permisos del login, y qué hace vive en el componente. Una
 * entrada cuyo `codigo` el código no conozca simplemente no se pinta: la
 * base no puede inventar acciones.
 */
export interface AccionDeModulo {
  etiqueta: string;
  /** NOMBRE de ícono del set (`core/navegacion/iconos.ts`), nunca SVG. */
  icono: string | null;
}

export interface OpcionesAsignaciones {
  profesores: ProfesorOpcion[];
  asignaturas: AsignaturaResumen[];
  sedes: SedeResumen[];
  ofertaGrados: OfertaGradoOpcion[];
  malla: MallaOpcion[];
  /** `codigo` de recurso -> su rótulo e ícono. Ver `AccionDeModulo`. */
  acciones: Record<string, AccionDeModulo>;
  anios: {
    disponibles: number[];
    /**
     * El año del período activo, no el del reloj del equipo: en enero el
     * período activo todavía puede ser del año escolar anterior, y varios
     * computadores de la escuela tienen la fecha mal puesta.
     */
    anioSugerido: number | null;
  };
}

/**
 * Los filtros de la pantalla principal. TODOS son independientes entre sí:
 * `grado: 3` sin `grupo` devuelve todo tercero, del grupo que sea. No hay
 * una combinación grado+grupo que haya que elegir junta.
 *
 * `null` = ese filtro está apagado (no viaja en la URL).
 */
export interface FiltrosAsignaciones {
  anio: number | null;
  sedeId: number | null;
  grado: number | null;
  grupo: string | null;
  profesorId: string | null;
  asignaturaId: number | null;
}

/** Lo que el formulario manda al guardar. La sede NO va: la deduce el backend. */
export interface AsignacionParaGuardar {
  profesor_id: string;
  asignatura_id: number;
  grado: number;
  grupo: string;
  anio: number;
}
