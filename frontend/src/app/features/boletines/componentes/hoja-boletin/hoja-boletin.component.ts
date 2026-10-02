import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Boletin, NudoDeBoletin } from '../../../../core/interfaces/nudo.interface';

/**
 * La hoja del boletín, con el mismo formato del boletín oficial en papel:
 * una fila por materia y, debajo, la fila resaltada del nudo con su nota.
 *
 * Primaria y secundaria se ven distinto a propósito, igual que en el
 * papel: en primaria el nudo es UNA fila con la lista de sus materias
 * (siempre promedio simple); en secundaria cada materia tiene su fila,
 * con el porcentaje que aporta al nudo si el grado lo tiene configurado.
 *
 * No calcula ninguna nota: todas vienen de las vistas del backend. Solo
 * da formato (coma decimal, un decimal) y marca lo que falta.
 */
@Component({
  selector: 'app-hoja-boletin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hoja-boletin.component.html',
})
export class HojaBoletinComponent {
  readonly boletin = input.required<Boletin>();

  /** Así se llaman los períodos en el boletín impreso. */
  protected readonly nombresEpoca = ['Primera Época', 'Segunda Época', 'Tercera Época', 'Cuarta Época'];

  /**
   * El promedio general que se imprime: el del último período con notas
   * (el que se está entregando), como en el papel.
   */
  protected readonly promedioGeneral = computed(() => {
    const promedios = this.boletin().promedioGeneral;
    for (let i = promedios.length - 1; i >= 0; i--) {
      if (promedios[i] !== null) return { valor: promedios[i]!, epoca: i };
    }
    return null;
  });

  /**
   * La época que se está cursando (la columna que se resalta). Sin
   * período activo -- un año ya cerrado -- la última con notas.
   */
  protected readonly indiceActual = computed(() => {
    const b = this.boletin();
    const activo = b.periodos.findIndex((p) => p.activo);
    return activo !== -1 ? activo : (this.promedioGeneral()?.epoca ?? -1);
  });

  protected readonly calculo = computed(() =>
    !this.boletin().esPrimaria && this.hayPonderados() ? 'Por porcentajes' : 'Promedio simple',
  );

  protected readonly hayIncompletos = computed(() =>
    this.boletin().nudos.some((n) => n.periodos.some((p) => p.incompleto)),
  );

  protected readonly hayPonderados = computed(() =>
    this.boletin().nudos.some((n) => n.materias.some((m) => m.peso !== null)),
  );

  protected nota(valor: number | null): string {
    return valor === null ? '' : valor.toFixed(1).replace('.', ',');
  }

  /**
   * Nota de una materia en una época: en una época ya abierta, la que
   * falta se marca con '—' (el profesor no la ha subido); en una futura,
   * la celda queda vacía como en el papel.
   */
  protected notaDeMateria(valor: number | null, epoca: number): string {
    if (valor !== null) return this.nota(valor);
    return epoca <= this.indiceActual() ? '—' : '';
  }

  protected reprobada(valor: number | null): boolean {
    return valor !== null && valor < 3;
  }

  protected listaMaterias(nudo: NudoDeBoletin): string {
    const nombres = nudo.materias.map((m) => m.nombre);
    const ultimo = nombres.pop();
    return nombres.length === 0 ? (ultimo ?? '') : `${nombres.join(', ')} y ${ultimo}`;
  }

  protected porcentaje(peso: number): string {
    return `${String(Math.round(peso * 100) / 100).replace('.', ',')}%`;
  }

  protected epoca(i: number): string {
    return this.nombresEpoca[i] ?? `Período ${i + 1}`;
  }
}
