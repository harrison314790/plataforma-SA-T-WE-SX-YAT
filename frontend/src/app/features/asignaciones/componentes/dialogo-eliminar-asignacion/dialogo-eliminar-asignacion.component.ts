import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Asignacion } from '../../../../core/interfaces/asignacion.interface';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';

/**
 * El diálogo de "eliminar", que la mitad de las veces no elimina nada.
 *
 * `notas.asignacion_id` NO tiene `on delete cascade`, a propósito: borrar
 * una asignación con notas rompería el historial y los boletines. La
 * consecuencia práctica es que el borrado falla en la base -- y una
 * pantalla que deja llegar a la persona hasta ese error no hizo su
 * trabajo. Por eso este diálogo decide ANTES qué puede ofrecer:
 *
 * · Sin notas -> "Eliminar", con la advertencia de que no se deshace.
 * · Con notas -> el borrado ni se ofrece. Se explica por qué y se ofrece
 *   DESACTIVAR, que conserva las notas y solo saca la asignación de
 *   circulación para trabajo nuevo.
 * · Ya desactivada -> "Reactivar". Este diálogo es la única puerta de
 *   vuelta: desactivar y reactivar son las dos caras de la misma salida,
 *   y ninguna de las dos es una acción de la tabla.
 *
 * El conteo llega con el listado (`cantidadNotas` en AsignacionResource),
 * así que el diálogo abre ya sabiendo cuál de los dos casos es -- sin una
 * petición extra mientras la persona espera.
 *
 * El backend valida lo mismo por su cuenta y responde 409
 * `ASIGNACION_CON_NOTAS` si alguien intenta el borrado igual: esto es la
 * capa de experiencia, no el control.
 */
@Component({
  selector: 'app-dialogo-eliminar-asignacion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './dialogo-eliminar-asignacion.component.html',
})
export class DialogoEliminarAsignacionComponent {
  readonly asignacion = input.required<Asignacion>();
  /** Bloquea los botones mientras la petición está en vuelo. */
  readonly guardando = input(false);
  readonly error = input<string | null>(null);

  readonly eliminar = output<void>();
  readonly desactivar = output<void>();
  readonly reactivar = output<void>();
  readonly cerrar = output<void>();

  protected readonly tieneNotas = computed(() => this.asignacion().cantidadNotas > 0);

  /**
   * La asignación ya está fuera de circulación.
   *
   * Este diálogo es la ÚNICA puerta para volver a activarla, y eso es
   * a propósito: desactivar y reactivar no son acciones de la tabla --
   * son las dos caras de la misma salida, y la salida se ofrece acá,
   * donde ya se está hablando de qué hacer con esta asignación. Sin
   * esto, desactivar sería una puerta de un solo sentido.
   */
  protected readonly estaInactiva = computed(() => !this.asignacion().activo);

  protected readonly textoNotas = computed(() => {
    const cantidad = this.asignacion().cantidadNotas;

    return cantidad === 1 ? '1 nota registrada' : `${cantidad} notas registradas`;
  });

  /** '9-B', la notación informal que usa todo el mundo en la institución. */
  protected readonly gradoGrupo = computed(
    () => `${this.asignacion().grado}-${this.asignacion().grupo}`,
  );

  /** Solo el primer nombre, para que la frase no se lea como un oficio. */
  protected readonly nombreCorto = computed(
    () => this.asignacion().profesor.nombreCompleto.split(' ')[0] ?? 'El profesor',
  );
}
