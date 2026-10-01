import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type {
  FiltrosAsignaciones,
  OpcionesAsignaciones,
} from '../../../../core/interfaces/asignacion.interface';

/**
 * La fila de filtros de la pantalla de Asignaciones.
 *
 * Vive en `componentes/` y no en `pages/` porque no es una ruta: es una
 * pieza de apoyo que la tabla usa. No guarda estado propio -- recibe los
 * filtros y emite el conjunto completo cada vez que cambia uno. El dueño
 * del estado es la página, que es quien también lo sincroniza con la URL.
 *
 * LOS SEIS FILTROS SON INDEPENDIENTES, Y GRADO ES EL CASO QUE IMPORTA
 * Elegir "grado 3" y nada más devuelve TODAS las asignaciones de tercero,
 * del grupo que sea y de la sede que sea. No hay un control combinado
 * "3-A": son dos filtros distintos porque son dos preguntas distintas.
 * "¿Quién dicta en tercero?" es la que hace coordinación cuando arma el
 * año; "¿quién dicta en 3-A?" es la que se hace después, ya adentro.
 *
 * Lo que SÍ depende de otro filtro es la LISTA DE OPCIONES, no el
 * resultado: al elegir una sede, el selector de grado ofrece solo los
 * grados que esa sede tiene abiertos (`oferta_grados`), porque ofrecer
 * grado 11 en una escuela que llega hasta quinto es ofrecer una búsqueda
 * que siempre devuelve vacío. Acotar las opciones no acopla los filtros:
 * grado sigue funcionando solo.
 *
 * POR QUÉ `<select>` NATIVO Y NO EL COMBOBOX CON BUSCADOR DEL DISEÑO
 * El diseño traía un desplegable propio con búsqueda para el profesor.
 * Con la escala real de esta institución (una decena de profesores) un
 * `<select>` nativo se recorre igual de rápido, ya trae teclado,
 * accesibilidad y el selector nativo del Android de gama baja -- y son
 * ~120 líneas menos de JavaScript que mantener. Si algún día la lista
 * pasa de unas 30 opciones, ahí sí vale un combobox con filtro.
 */
@Component({
  selector: 'app-filtros-asignaciones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filtros-asignaciones.component.html',
})
export class FiltrosAsignacionesComponent {
  /** `null` mientras los catálogos todavía no llegaron. */
  readonly opciones = input<OpcionesAsignaciones | null>(null);
  readonly filtros = input.required<FiltrosAsignaciones>();
  /** Cuántas filas está mostrando la tabla con estos filtros puestos. */
  readonly resultados = input<number | null>(null);

  readonly cambio = output<FiltrosAsignaciones>();
  readonly limpiar = output<void>();

  /**
   * Cuántos filtros hay puestos. Se muestra en el botón de limpiar ("(3)")
   * para que se vea que hay algo activo aunque el filtro que lo causa esté
   * fuera de la vista en un móvil angosto -- el caso clásico de "la tabla
   * está vacía y no entiendo por qué".
   */
  protected readonly activos = computed(
    () => Object.values(this.filtros()).filter((valor) => valor !== null).length,
  );

  protected readonly hayFiltros = computed(() => this.activos() > 0);

  /** Los años que ofrece el selector, del más reciente al más viejo. */
  protected readonly anios = computed(() => this.opciones()?.anios.disponibles ?? []);

  protected readonly sedes = computed(() => this.opciones()?.sedes ?? []);
  protected readonly profesores = computed(() => this.opciones()?.profesores ?? []);
  protected readonly asignaturas = computed(() => this.opciones()?.asignaturas ?? []);

  /**
   * Grados que ofrece el selector: los que existen en la oferta, acotados
   * a la sede elegida si hay una.
   */
  protected readonly grados = computed<number[]>(() => {
    const sedeId = this.filtros().sedeId;
    const oferta = this.opciones()?.ofertaGrados ?? [];

    return [
      ...new Set(
        oferta.filter((o) => sedeId === null || o.sedeId === sedeId).map((o) => o.grado),
      ),
    ].sort((a, b) => a - b);
  });

  /**
   * Grupos que ofrece el selector: acotados por sede y por grado si están
   * puestos. Sin ninguno de los dos, la lista completa -- filtrar por
   * "grupo B" en toda la institución es una consulta legítima.
   */
  protected readonly grupos = computed<string[]>(() => {
    const { sedeId, grado } = this.filtros();
    const oferta = this.opciones()?.ofertaGrados ?? [];

    return [
      ...new Set(
        oferta
          .filter((o) => sedeId === null || o.sedeId === sedeId)
          .filter((o) => grado === null || o.grado === grado)
          .map((o) => o.grupo),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es'));
  });

  /**
   * Cambiar un filtro emite el conjunto completo, no el campo suelto: la
   * página guarda un solo objeto y lo sincroniza con la URL de una vez.
   *
   * Los dos `null` extra no son un capricho: si alguien filtra por 9-B en
   * La Laguna y después cambia de sede, ese grado y ese grupo pueden no
   * existir en la sede nueva y la tabla quedaría vacía sin explicación
   * visible. Se limpian los filtros que dejaron de tener sentido, que es
   * lo que la persona haría a mano un segundo después.
   */
  protected cambiar<C extends keyof FiltrosAsignaciones>(
    campo: C,
    valor: FiltrosAsignaciones[C],
  ): void {
    const siguiente: FiltrosAsignaciones = { ...this.filtros(), [campo]: valor };

    if (campo === 'sedeId') {
      siguiente.grado = null;
      siguiente.grupo = null;
    }

    if (campo === 'grado') {
      siguiente.grupo = null;
    }

    this.cambio.emit(siguiente);
  }

  /** `<select>` devuelve siempre string; '' es "sin filtro". */
  protected comoTexto(valor: string): string | null {
    return valor === '' ? null : valor;
  }

  protected comoNumero(valor: string): number | null {
    return valor === '' ? null : Number(valor);
  }
}
