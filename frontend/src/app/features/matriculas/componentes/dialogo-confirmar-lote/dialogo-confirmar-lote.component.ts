import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { Matricula } from '../../../../core/interfaces/matricula.interface';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { MatriculasService } from '../../../../core/servicios/matriculas.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { type CatalogoCursos, type Pendiente, chipResultado, curso, fechaCorta, plural } from '../../reglas';

export interface DestinoLote {
  sedeId: number;
  grado: number;
  grupo: string;
}

/**
 * La confirmación antes de matricular varios a la vez. Avisa de lo que
 * merece una segunda mirada: quién no tiene resultado final todavía, y
 * quién tenía otra sugerencia que la del destino elegido. El lote es todo
 * o nada en el backend: si uno falla, no se guarda ninguno y el error
 * dice quién.
 */
@Component({
  selector: 'app-dialogo-confirmar-lote',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './dialogo-confirmar-lote.component.html',
})
export class DialogoConfirmarLoteComponent {
  private readonly servicio = inject(MatriculasService);

  readonly anio = input.required<number>();
  readonly destino = input.required<DestinoLote>();
  readonly pendientes = input.required<Pendiente[]>();
  readonly catalogo = input.required<CatalogoCursos>();
  readonly hoy = input('');

  readonly guardado = output<Matricula[]>();
  readonly cerrar = output<void>();

  protected readonly curso = curso;
  protected readonly fechaCorta = fechaCorta;
  protected readonly plural = plural;

  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected readonly lista = computed(() =>
    [...this.pendientes()]
      .sort((a, b) => a.estudiante.apellidos.localeCompare(b.estudiante.apellidos, 'es'))
      .map((p) => ({
        id: p.estudiante.id,
        nombre: `${p.estudiante.nombres} ${p.estudiante.apellidos}`,
        chip: chipResultado(p.resultado, p.anterior.grado),
      })),
  );

  protected readonly enProgreso = computed(() => {
    const p = this.pendientes().filter((x) => x.resultado === 'P');
    if (!p.length) return null;
    const nombres = p.slice(0, 3).map((x) => `${x.estudiante.nombres} ${x.estudiante.apellidos}`).join(', ');
    const quienes = p.length === 1 ? '1 estudiante todavía no tiene' : `${p.length} estudiantes todavía no tienen`;
    return `${quienes} el resultado final del año: ${nombres}${p.length > 3 ? '…' : ''}.`;
  });

  protected readonly otraSugerencia = computed(() => {
    const d = this.destino();
    const c = this.catalogo();
    const p = this.pendientes().filter((x) => x.sugerencia.sedeId !== d.sedeId || x.sugerencia.grado !== d.grado);
    if (!p.length) return null;

    const detalle = p.slice(0, 3).map((x) => {
      const s = x.sugerencia;
      const otraSede = s.sedeId !== d.sedeId ? `, ${c.nombreSede(s.sedeId)}` : '';
      const sugerido = s.grado !== null ? curso(s.grado, s.grupo || '?') : 'sin sugerencia';
      return `${x.estudiante.nombres} ${x.estudiante.apellidos} (${sugerido}${otraSede})`;
    }).join('; ');

    return `${p.length === 1 ? '1 tenía' : `${p.length} tenían`} otra sugerencia: ${detalle}${p.length > 3 ? '…' : ''}. Revisa antes de confirmar.`;
  });

  protected async confirmar(): Promise<void> {
    const d = this.destino();
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.guardado.emit(await this.servicio.matricularLote({
        anio: this.anio(),
        sede_id: d.sedeId,
        grado: d.grado,
        grupo: d.grupo,
        estudiante_ids: this.pendientes().map((p) => p.estudiante.id),
      }));
    } catch (err) {
      // El backend es todo o nada: decirlo evita que alguien busque cuáles quedaron.
      this.error.set(`${mensajeDeError(err, 'No se pudo matricular el lote.')} No se guardó ninguna matrícula del lote.`);
    } finally {
      this.guardando.set(false);
    }
  }
}
