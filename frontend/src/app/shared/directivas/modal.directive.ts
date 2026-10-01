import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/**
 * El comportamiento que un modal necesita para no ser una trampa con el
 * teclado. Nace con el módulo de Asignaciones (que tiene dos: el
 * formulario y el diálogo de borrado) pero no sabe nada de él: cualquier
 * módulo futuro con un modal la usa igual.
 *
 * Uso, sobre el elemento del PANEL (no el velo):
 *   <div class="modal__panel" appModal (cerrarModal)="cerrar.emit()">
 *
 * LAS CUATRO COSAS QUE HACE, Y POR QUÉ CADA UNA
 *
 * 1. ESCAPE CIERRA. Es la salida que todo el mundo intenta primero. Sin
 *    esto, quien navega con teclado tiene que tabular hasta encontrar el
 *    botón de cerrar.
 *
 * 2. EL FOCO ENTRA AL ABRIR. Si no, el foco se queda en el botón que
 *    abrió el modal -- que está DETRÁS del velo. Un lector de pantalla
 *    seguiría leyendo la página de atrás como si el modal no existiera.
 *
 * 3. EL FOCO NO SE ESCAPA (trampa de Tab). Con `aria-modal="true"` el
 *    lector de pantalla ya acota lo que anuncia, pero el foco físico
 *    igual se va a la barra lateral y a la tabla de atrás: se puede
 *    tabular hasta un botón que no se ve y pulsarlo a ciegas. Tab en el
 *    último elemento vuelve al primero, y Shift+Tab al revés.
 *
 * 4. EL FOCO VUELVE AL CERRAR. Quien abrió el formulario desde "Editar"
 *    de la fila 3 vuelve a ese mismo botón, no al principio de la
 *    página. Con una tabla de 40 filas, la diferencia es entre seguir
 *    trabajando y tener que buscar dónde estaba.
 *
 * Lo que NO hace: bloquear el scroll del fondo. Eso es una decisión de
 * estilos (`overflow` en `body`) y meterla acá obligaría a esta
 * directiva a conocer el layout de la app.
 */
@Directive({
  selector: '[appModal]',
  standalone: true,
  host: {
    '(keydown.escape)': 'cerrarModal.emit()',
    '(keydown.tab)': 'atraparTab($event)',
    // tabindex en el panel: hace falta para poder enfocarlo cuando
    // adentro no hay ningún control (un diálogo de solo lectura). -1 =
    // enfocable por código, nunca por Tab.
    tabindex: '-1',
  },
})
export class ModalDirective {
  // `inject<ElementRef<HTMLElement>>(ElementRef)` y no
  // `inject(ElementRef<HTMLElement>)`: lo segundo compila como una
  // llamada sin tipar (el genérico va en el TIPO, no en el valor que se
  // pasa a inject) y TypeScript lo rechaza con TS2347.
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly cerrarModal = output<void>();

  /**
   * Quién tenía el foco antes de abrir. Se guarda en el constructor
   * porque para cuando corre `ngAfterViewInit` el foco ya puede haberse
   * movido.
   */
  private readonly origen = document.activeElement as HTMLElement | null;

  constructor() {
    // `setTimeout` de 0 y no `afterNextRender`: el contenido del modal
    // lo pintan los `@if` del template del componente, que todavía no
    // corrieron cuando la directiva se construye. Un tick alcanza y no
    // ata esto al ciclo de render de Angular.
    setTimeout(() => this.enfocarPrimero(), 0);

    this.destroyRef.onDestroy(() => {
      // `isConnected`: si el elemento que abrió el modal ya no está en
      // el DOM (la fila se borró, que es justo lo que hace el diálogo de
      // eliminar), devolverle el foco no haría nada y el foco quedaría
      // en `<body>`. Mejor no intentarlo y dejar que el navegador siga
      // su orden natural.
      if (this.origen?.isConnected) this.origen.focus();
    });
  }

  /**
   * El ciclo de Tab, cerrado sobre el modal. Solo intercepta en los dos
   * extremos: en el medio, Tab hace lo suyo sin que nadie se meta.
   */
  protected atraparTab(evento: KeyboardEvent): void {
    const enfocables = this.enfocables();
    if (enfocables.length === 0) return;

    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    const activo = document.activeElement;

    if (evento.shiftKey && (activo === primero || activo === this.elemento.nativeElement)) {
      evento.preventDefault();
      ultimo.focus();
      return;
    }

    if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  /**
   * Prioriza el primer CAMPO sobre el primer enfocable.
   *
   * En el orden del DOM, el primer enfocable de estos modales es la "X"
   * de cerrar, que está en el encabezado. Dejar el foco ahí le presenta a
   * quien usa teclado la salida antes que la tarea: el primer Enter
   * cerraría el formulario que acaba de abrir. Con un campo, el foco cae
   * donde hay que escribir; sin campos (el diálogo de borrado es solo
   * lectura), la "X" es exactamente lo correcto.
   */
  private enfocarPrimero(): void {
    const enfocables = this.enfocables();
    const primerCampo = enfocables.find((el) =>
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName),
    );

    // Si el modal no tiene ningún enfocable (puede pasar mientras carga),
    // el foco va al panel mismo -- de ahí el `tabindex="-1"` del host.
    (primerCampo ?? enfocables[0] ?? this.elemento.nativeElement).focus();
  }

  /**
   * Los controles enfocables que hay ahora mismo adentro. Se recalcula
   * en cada Tab a propósito y no se cachea: este formulario habilita y
   * deshabilita selects según lo que se vaya eligiendo (grupo no se
   * habilita hasta elegir grado), así que una lista guardada al abrir
   * estaría desactualizada a los dos clics.
   */
  private enfocables(): HTMLElement[] {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // `Array.from` y no el spread: el `tsconfig` de este proyecto no
    // incluye la librería `DOM.Iterable`, así que `NodeListOf` no cuenta
    // como iterable para TypeScript (TS2488).
    return Array.from(
      this.elemento.nativeElement.querySelectorAll<HTMLElement>(selector),
      // `offsetParent === null` descarta lo que está oculto: los selects
      // deshabilitados ya los filtra el selector, pero un bloque dentro
      // de un `@if` apagado seguiría estando en la lista.
    ).filter((el) => el.offsetParent !== null);
  }
}
