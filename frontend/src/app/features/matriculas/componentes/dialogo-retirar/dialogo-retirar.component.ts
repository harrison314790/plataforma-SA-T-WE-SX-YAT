import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { Matricula } from '../../../../core/interfaces/matricula.interface';
import { detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { MatriculasService } from '../../../../core/servicios/matriculas.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { curso, fechaCorta } from '../../reglas';

/**
 * "¿Retirar a X del año?". La matrícula no se borra: queda 'retirada' con
 * su motivo, y las notas ya registradas se conservan (lo dice el texto,
 * porque es lo primero que pregunta quien retira a alguien).
 */
@Component({
  selector: 'app-dialogo-retirar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './dialogo-retirar.component.html',
})
export class DialogoRetirarComponent {
  private readonly servicio = inject(MatriculasService);

  readonly matricula = input.required<Matricula>();
  readonly nombre = input.required<string>();
  readonly sede = input.required<string>();
  readonly motivos = input.required<string[]>();

  readonly guardado = output<Matricula>();
  readonly cerrar = output<void>();

  protected readonly curso = curso;
  protected readonly fechaCorta = fechaCorta;

  protected readonly motivo = signal('');
  protected readonly detalle = signal('');
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected async retirar(): Promise<void> {
    const errores: Record<string, string> = {};
    if (!this.motivo()) errores['motivo'] = 'Elige el motivo del retiro.';
    if (this.motivo() === 'Otro' && !this.detalle().trim()) errores['detalle'] = 'Escribe brevemente el motivo.';
    if (Object.keys(errores).length) {
      this.errores.set(errores);
      return;
    }

    this.guardando.set(true);
    this.errorGeneral.set(null);
    try {
      const m = await this.servicio.retirar(
        this.matricula().id,
        this.motivo(),
        this.motivo() === 'Otro' ? this.detalle().trim() : null,
      );
      this.guardado.emit(m);
    } catch (err) {
      const detalles = detallesDeError(err);
      this.errores.set(Object.fromEntries(Object.entries(detalles).map(([k, v]) => [k, v[0]])));
      this.errorGeneral.set(Object.keys(detalles).length ? null : mensajeDeError(err, 'No se pudo retirar.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
