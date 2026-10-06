import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CuentaUsuario } from '../../../../core/interfaces/cuenta-usuario.interface';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';

/**
 * Confirmación del borrado definitivo. Solo se abre para una cuenta
 * `eliminable` (el menú de la fila no ofrece la opción en otro caso), así
 * que no tiene la rama "no se puede" del diálogo de Asignaciones: si el
 * servidor igual responde 409 (alguien matriculó al estudiante
 * entremedio), el error llega por `error` y el padre refresca la fila.
 */
@Component({
  selector: 'app-dialogo-eliminar-usuario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './dialogo-eliminar-usuario.component.html',
})
export class DialogoEliminarUsuarioComponent {
  readonly cuenta = input.required<CuentaUsuario>();
  readonly guardando = input(false);
  readonly error = input<string | null>(null);

  readonly eliminar = output<void>();
  readonly cerrar = output<void>();
}
