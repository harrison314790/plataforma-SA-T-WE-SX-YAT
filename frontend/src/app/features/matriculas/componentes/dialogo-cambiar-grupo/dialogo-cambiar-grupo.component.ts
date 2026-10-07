import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { Matricula } from '../../../../core/interfaces/matricula.interface';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { MatriculasService } from '../../../../core/servicios/matriculas.service';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { type CatalogoCursos, curso, rotuloGrupo } from '../../reglas';

/**
 * Mover una matrícula activa a otro grupo -- o a otra sede -- del MISMO
 * grado. Solo ofrece sedes que tienen ese grado abierto, y no ofrece el
 * grupo donde ya está.
 */
@Component({
  selector: 'app-dialogo-cambiar-grupo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalDirective],
  templateUrl: './dialogo-cambiar-grupo.component.html',
})
export class DialogoCambiarGrupoComponent {
  private readonly servicio = inject(MatriculasService);

  readonly matricula = input.required<Matricula>();
  readonly nombre = input.required<string>();
  readonly catalogo = input.required<CatalogoCursos>();

  readonly guardado = output<Matricula>();
  readonly cerrar = output<void>();

  protected readonly curso = curso;
  protected readonly rotuloGrupo = rotuloGrupo;

  /** `null` = la sede de la matrícula (el input no existe todavía en el constructor). */
  private readonly sedeElegida = signal<number | null>(null);
  private readonly grupoElegido = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected readonly sedeId = computed(() => this.sedeElegida() ?? this.matricula().sedeId);

  protected readonly sedes = computed(() => this.catalogo().sedesCon(this.matricula().grado));

  /** Los grupos de ese grado en la sede elegida, menos el actual. */
  protected readonly grupos = computed(() => {
    const m = this.matricula();
    const sede = this.sedeId();
    return this.catalogo().grupos(sede, m.grado).filter((g) => !(sede === m.sedeId && g === m.grupo));
  });

  /** Con un solo grupo posible, ya queda elegido. */
  protected readonly grupo = computed(() => {
    const elegido = this.grupoElegido();
    if (elegido !== null && this.grupos().includes(elegido)) return elegido;
    return this.grupos().length === 1 ? this.grupos()[0] : '';
  });

  /** Por qué no hay a dónde moverlo, si es el caso. */
  protected readonly sinOpciones = computed(() => {
    if (this.grupos().length > 0) return null;
    const m = this.matricula();
    return this.sedeId() === m.sedeId
      ? `${this.catalogo().nombreSede(m.sedeId)} solo tiene un grupo de ${m.grado}° abierto. Para moverlo, elige otra sede.`
      : `${this.catalogo().nombreSede(this.sedeId())} no tiene grupos abiertos de ${m.grado}°.`;
  });

  protected elegirSede(valor: string): void {
    this.sedeElegida.set(Number(valor));
    this.grupoElegido.set(null);
    this.error.set(null);
  }

  protected elegirGrupo(valor: string): void {
    this.grupoElegido.set(valor);
    this.error.set(null);
  }

  protected async guardar(): Promise<void> {
    if (!this.grupo()) {
      this.error.set(this.grupos().length ? 'Elige el grupo nuevo.' : 'No hay otro grupo disponible.');
      return;
    }

    this.guardando.set(true);
    try {
      this.guardado.emit(await this.servicio.cambiarGrupo(this.matricula().id, this.sedeId(), this.grupo()));
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudo cambiar de grupo.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
