import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { AsignacionDelProfesor, NotaGuardada, PeriodoNotas } from '../../../../core/interfaces/nota.interface';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { curso, desempeno, plural, unDecimal } from '../../reglas';

export interface NotaARevisar {
  estudianteId: string;
  nombre: string;
  valor: number;
}

/**
 * "Revisa antes de guardar": la última parada antes de que las notas
 * queden fijas. Lista cada nota con su desempeño, dice cuántos quedan sin
 * nota y cuántos en Bajo, y advierte que no se podrán modificar.
 *
 * Guarda él mismo (como los diálogos de Matrículas): es quien sabe
 * mostrar el error al lado del botón. El lote es todo o nada en el
 * backend, así que si falla, no quedó ninguna a medias y los borradores
 * siguen en el equipo.
 */
@Component({
  selector: 'app-dialogo-revisar-notas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalDirective],
  templateUrl: './dialogo-revisar-notas.component.html',
})
export class DialogoRevisarNotasComponent {
  private readonly servicio = inject(NotasService);
  protected readonly enLinea = inject(ConexionService).enLinea;

  readonly asignacion = input.required<AsignacionDelProfesor>();
  readonly periodo = input.required<PeriodoNotas>();
  readonly notas = input.required<NotaARevisar[]>();
  /** Estudiantes que siguen sin nota después de este guardado. */
  readonly sinNota = input.required<number>();

  readonly cerrar = output<void>();
  readonly guardadas = output<NotaGuardada[]>();
  readonly sinPermiso = output<void>();

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitulo = computed(() => {
    const a = this.asignacion();
    return `${a.materia} ${curso(a.grado, a.grupo)} · ${a.sede.nombre} · Período ${this.periodo().nombre}`;
  });

  protected readonly filas = computed(() =>
    this.notas().map((n) => ({ ...n, texto: unDecimal(n.valor), desempeno: desempeno(n.valor) })),
  );

  protected readonly observacion = computed(() => {
    const falta = this.sinNota();
    const bajo = this.notas().filter((n) => n.valor < 3).length;
    return (
      (falta > 0
        ? `${plural(falta, 'estudiante queda', 'estudiantes quedan')} sin nota; puedes subirla${falta > 1 ? 's' : ''} después, antes del cierre. `
        : '') + (bajo > 0 ? `${plural(bajo, 'nota queda', 'notas quedan')} en desempeño Bajo.` : '')
    );
  });

  protected readonly textoBoton = computed(() =>
    this.guardando() ? 'Guardando…' : `Guardar ${plural(this.notas().length, 'nota', 'notas')}`,
  );

  protected async guardar(): Promise<void> {
    if (!this.enLinea() || this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const guardadas = await this.servicio.guardarLote({
        asignacion_id: this.asignacion().id,
        periodo_id: this.periodo().id,
        notas: this.notas().map((n) => ({ estudiante_id: n.estudianteId, valor: n.valor })),
      });
      this.guardadas.emit(guardadas);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.sinPermiso.emit();
        return;
      }
      this.error.set(mensajeDeError(err, 'No se pudieron guardar las notas. Siguen en este equipo como borrador.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
