import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import type { CuentaUsuario } from '../../../../core/interfaces/cuenta-usuario.interface';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';

/**
 * Aparece justo después de crear una cuenta: la ÚNICA vez que la
 * contraseña inicial se puede ver. El backend la guarda con bcrypt y no
 * la devuelve nunca, así que si este diálogo se cierra sin copiarla, la
 * salida es borrar la cuenta (no tiene datos todavía) y crearla de nuevo.
 *
 * NO CIERRA CON EL VELO NI CON ESCAPE, a diferencia de los otros modales:
 * un clic fuera por accidente perdería la contraseña. Solo el botón
 * "Entendido, cerrar", que obliga a pasar por la advertencia.
 */
@Component({
  selector: 'app-dialogo-cuenta-creada',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './dialogo-cuenta-creada.component.html',
})
export class DialogoCuentaCreadaComponent {
  readonly cuenta = input.required<CuentaUsuario>();
  readonly contrasena = input.required<string>();

  readonly cerrar = output<void>();

  protected readonly copiada = signal(false);

  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizador));
  }

  /**
   * `navigator.clipboard` solo existe en contexto seguro (https o
   * localhost). En el VPS va con https, pero si alguien entra por IP en
   * http desde la red de la escuela, se cae al `execCommand` de antes en
   * vez de dejar el botón sin hacer nada.
   */
  protected async copiar(campo: HTMLInputElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.contrasena());
    } catch {
      campo.select();
      document.execCommand('copy');
    }

    this.copiada.set(true);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.copiada.set(false), 2500);
  }

  protected seleccionar(campo: HTMLInputElement): void {
    campo.select();
  }
}
