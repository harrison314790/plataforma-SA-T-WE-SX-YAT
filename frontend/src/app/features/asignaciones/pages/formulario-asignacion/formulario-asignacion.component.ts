import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type {
  Asignacion,
  AsignacionParaGuardar,
  AsignaturaResumen,
  OpcionesAsignaciones,
  ProfesorOpcion,
} from '../../../../core/interfaces/asignacion.interface';
import type { SedeResumen } from '../../../../core/interfaces/usuario.interface';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';

/** Lo que emite al guardar. `continuar` = "Guardar y crear otra". */
export interface GuardadoAsignacion {
  datos: AsignacionParaGuardar;
  continuar: boolean;
}

/**
 * Alta y edición de una asignación. Va en `pages/` por la convención de
 * carpetas de este proyecto (los formularios viven en `pages/`), aunque se
 * presente como modal sobre la tabla y no como una ruta propia: abrir una
 * pantalla aparte para cinco campos obligaría a perder de vista la tabla
 * contra la que se está comparando.
 *
 * LAS CUATRO REGLAS DE NEGOCIO, TRADUCIDAS A COMPORTAMIENTO DE PANTALLA
 * (las cuatro las valida el backend igual; acá se anticipan para que
 * nadie pueda ni siquiera componer una combinación inválida):
 *
 * 1. NO SE PIDE LA SEDE. Se deduce del profesor y se muestra como dato,
 *    no como campo. Cada profesor pertenece a una sola sede, así que
 *    preguntarla aparte solo permitiría el dato imposible "asignación en
 *    una sede distinta a la del profesor que la dicta".
 * 2. GRADO Y GRUPO salen de `oferta_grados` de ESA sede, y solo los
 *    activos: no se puede crear una asignación en una combinación que la
 *    sede no tiene dada de alta (la base tiene una llave foránea
 *    compuesta que lo rechazaría de todos modos).
 * 3. LA ASIGNATURA sale de `malla_curricular` del grado elegido. Nunca la
 *    lista completa de materias.
 * 4. NO HAY CAMPO DE PERÍODO. Una asignación vale para el año completo
 *    (`anio`); lo que es por período es la NOTA, no quién dicta.
 *
 * POR QUÉ SIGNALS Y NO UN FormGroup REACTIVO
 * Este formulario es casi todo dependencias entre campos: la sede depende
 * del profesor, los grados de la sede, los grupos del grado, las materias
 * del grado. Con `computed()` cada lista se declara una vez en función de
 * las otras y se recalcula sola. Con `FormGroup` habría que suscribirse a
 * tres `valueChanges` y recalcular a mano, que es más código para el mismo
 * resultado. La validación acá es trivial (todo obligatorio), que es la
 * parte donde los formularios reactivos sí aportan.
 */
@Component({
  selector: 'app-formulario-asignacion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './formulario-asignacion.component.html',
})
export class FormularioAsignacionComponent {
  readonly opciones = input.required<OpcionesAsignaciones>();
  /** `null` = alta. Con valor = edición de esa asignación. */
  readonly asignacion = input<Asignacion | null>(null);
  readonly guardando = input(false);
  /** Errores por campo del 422 de Laravel (`detalles`), tal cual llegan. */
  readonly errores = input<Record<string, string[]>>({});
  readonly errorGeneral = input<string | null>(null);
  /**
   * Sin señal no se intenta guardar, y se dice antes de que la persona
   * llene el formulario.
   *
   * Es lo contrario de lo que hace la tabla de NOTAS, y la diferencia es
   * deliberada: ahí el guardado es optimista (el profesor sigue digitando
   * y la nota se reintenta sola al volver la señal) porque perder una hora
   * de digitación sería inaceptable. Acá no hay nada que perder -- son
   * cinco campos que se vuelven a llenar en veinte segundos -- y sí habría
   * algo que romper: una cola de altas reintentadas a ciegas chocaría de a
   * una contra la restricción de unicidad anual, sin nadie mirando.
   */
  readonly sinConexion = input(false);

  readonly guardar = output<GuardadoAsignacion>();
  readonly cerrar = output<void>();

  protected readonly profesorId = signal<string | null>(null);
  protected readonly grado = signal<number | null>(null);
  protected readonly grupo = signal<string | null>(null);
  protected readonly asignaturaId = signal<number | null>(null);
  protected readonly anio = signal<number | null>(null);

  protected readonly esEdicion = computed(() => this.asignacion() !== null);

  /**
   * Con notas, la asignación ya no cambia de curso, materia ni año: sus
   * notas quedarían colgando de algo que no calificaron (las de 9-B en
   * 8-A, las de Español contando como Matemáticas). Solo se puede cambiar
   * el profesor -- el reemplazo de un docente --, y solo por uno de la
   * MISMA sede, porque la sede sale del profesor. El backend y la base lo
   * exigen igual (AsignacionService::actualizar, trigger de
   * 24-correcciones-auditoria.sql); acá se evita que la persona llene un
   * formulario que va a ser rechazado.
   */
  protected readonly bloqueadaPorNotas = computed(() => (this.asignacion()?.cantidadNotas ?? 0) > 0);

  constructor() {
    // Rellena el formulario al abrirlo. `allowSignalWrites` porque el
    // efecto existe justamente para escribir los campos a partir de una
    // entrada -- es el caso legítimo, no un atajo.
    effect(
      () => {
        const actual = this.asignacion();
        const sugerido = this.opciones().anios.anioSugerido;

        this.profesorId.set(actual?.profesor.id ?? null);
        this.grado.set(actual?.grado ?? null);
        this.grupo.set(actual?.grupo ?? null);
        this.asignaturaId.set(actual?.asignatura.id ?? null);
        this.anio.set(actual?.anio ?? sugerido);
      },
      { allowSignalWrites: true },
    );
  }

  protected readonly profesores = computed<ProfesorOpcion[]>(() => {
    const todos = this.opciones().profesores;
    const actual = this.asignacion();
    if (!this.bloqueadaPorNotas() || actual === null) return todos;
    return todos.filter((p) => p.sede?.id === actual.sede.id);
  });

  protected readonly anios = computed(() => this.opciones().anios.disponibles);

  /** La sede del profesor elegido: se muestra, no se edita. */
  protected readonly sede = computed<SedeResumen | null>(() => {
    const id = this.profesorId();

    return this.profesores().find((p) => p.id === id)?.sede ?? null;
  });

  /**
   * Un profesor sin sede en su ficha de usuario no puede recibir
   * asignaciones: no hay contra qué validar grado+grupo. Se dice acá, con
   * la salida concreta, en vez de dejar que el guardado falle después.
   */
  protected readonly profesorSinSede = computed(
    () => this.profesorId() !== null && this.sede() === null,
  );

  /**
   * Grados que ESA sede tiene abiertos hoy.
   *
   * El filtro `o.activo` es obligatorio acá y no un detalle: desde que
   * `opciones` devuelve la oferta COMPLETA (para que la pantalla de
   * gestión pueda reactivar lo desactivado), sin este filtro el
   * formulario ofrecería para trabajo nuevo justo las combinaciones que
   * la sede cerró. El backend las rechazaría igual -- la regla de
   * `activo = true` está en CrearAsignacionRequest -- pero con un error
   * en vez de no ofrecerlas.
   */
  protected readonly grados = computed<number[]>(() => {
    const sedeId = this.sede()?.id;
    if (sedeId === undefined) return [];

    return [
      ...new Set(
        this.opciones()
          .ofertaGrados.filter((o) => o.sedeId === sedeId && o.activo)
          .map((o) => o.grado),
      ),
    ].sort((a, b) => a - b);
  });

  protected readonly grupos = computed<string[]>(() => {
    const sedeId = this.sede()?.id;
    const grado = this.grado();
    if (sedeId === undefined || grado === null) return [];

    return [
      ...new Set(
        this.opciones()
          .ofertaGrados.filter((o) => o.sedeId === sedeId && o.grado === grado && o.activo)
          .map((o) => o.grupo),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es'));
  });

  /** Solo las materias que la malla curricular le da a ese grado. */
  protected readonly asignaturas = computed<AsignaturaResumen[]>(() => {
    const grado = this.grado();
    if (grado === null) return [];

    const permitidas = new Set(
      this.opciones()
        .malla.filter((m) => m.grado === grado)
        .map((m) => m.asignaturaId),
    );

    return this.opciones().asignaturas.filter((a) => permitidas.has(a.id));
  });

  /**
   * El caso que rompe la pantalla si no se dice: `malla_curricular` puede
   * no tener ninguna fila para ese grado (hoy la tabla arranca casi
   * vacía -- ver 11-asignaciones-modulo.sql). Un `<select>` sin opciones y
   * sin explicación parece un error del sistema; esto lo nombra y dice a
   * dónde ir.
   */
  protected readonly gradoSinMalla = computed(
    () => this.grado() !== null && this.asignaturas().length === 0,
  );

  protected readonly sedeSinOferta = computed(
    () => this.sede() !== null && this.grados().length === 0,
  );

  protected readonly puedeGuardar = computed(
    () =>
      !this.guardando() &&
      !this.sinConexion() &&
      this.profesorId() !== null &&
      this.sede() !== null &&
      this.grado() !== null &&
      this.grupo() !== null &&
      this.asignaturaId() !== null &&
      this.anio() !== null,
  );

  /** El primer error del backend para ese campo, o null. */
  protected errorDe(campo: string): string | null {
    return this.errores()[campo]?.[0] ?? null;
  }

  /**
   * Cambiar de profesor puede cambiar de sede, y esa sede puede no tener
   * el grado/grupo que estaba elegido. Se limpian en vez de dejar un
   * valor que el backend rechazaría con un mensaje que no explica nada.
   */
  protected elegirProfesor(id: string): void {
    this.profesorId.set(id === '' ? null : id);

    if (!this.grados().includes(this.grado() ?? -1)) {
      this.grado.set(null);
      this.grupo.set(null);
      this.asignaturaId.set(null);
    }
  }

  /** Mismo criterio: otro grado significa otra malla y otros grupos. */
  protected elegirGrado(valor: string): void {
    this.grado.set(valor === '' ? null : Number(valor));
    this.grupo.set(null);

    const sigueSiendoValida = this.asignaturas().some((a) => a.id === this.asignaturaId());
    if (!sigueSiendoValida) this.asignaturaId.set(null);
  }

  protected elegirGrupo(valor: string): void {
    this.grupo.set(valor === '' ? null : valor);
  }

  protected elegirAsignatura(valor: string): void {
    this.asignaturaId.set(valor === '' ? null : Number(valor));
  }

  protected elegirAnio(valor: string): void {
    this.anio.set(valor === '' ? null : Number(valor));
  }

  /**
   * Deja el formulario listo para la siguiente alta, después de un
   * "Guardar y crear otra" que salió bien. Lo llama la página, que es
   * quien sabe si el guardado funcionó.
   *
   * Limpia SOLO la asignatura y conserva profesor, grado, grupo y año. Es
   * el gesto real de armar un año escolar: a Marta se le cargan
   * Matemáticas, Sociales y Ética en 9-B, una tras otra. Reiniciar todo
   * obligaría a volver a elegir cuatro campos idénticos cada vez; no
   * limpiar nada dejaría el formulario mostrando algo que ya se guardó, y
   * el siguiente clic chocaría contra la restricción de unicidad.
   */
  reiniciarParaOtra(): void {
    this.asignaturaId.set(null);
  }

  protected enviar(continuar: boolean): void {
    if (!this.puedeGuardar()) return;

    this.guardar.emit({
      datos: {
        profesor_id: this.profesorId()!,
        asignatura_id: this.asignaturaId()!,
        grado: this.grado()!,
        grupo: this.grupo()!,
        anio: this.anio()!,
      },
      continuar,
    });
  }
}
