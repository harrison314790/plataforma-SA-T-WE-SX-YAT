import { ChangeDetectionStrategy, Component, type OnInit, computed, inject, input, output, signal } from '@angular/core';
import type { CalendarioGuardado, PeriodoNotas } from '../../../../core/interfaces/nota.interface';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { diaMes, diasEntre, fechaSola } from '../../reglas';

interface Fila {
  id: number;
  inicio: string;
  fin: string;
}

/**
 * "Calendario de épocas": las fechas de inicio y cierre de las 4 épocas
 * del año. Se escribe una vez, a inicio de año, con lo que aprobó
 * rectoría; después la época activa cambia sola según la fecha de hoy.
 *
 * Valida lo mismo que el backend (NotaPeriodoService::guardarCalendario),
 * fila por fila y mientras se escribe: las dos fechas, cierre después del
 * inicio, dentro del año escolar, y cada época después del cierre de la
 * anterior. Antes de guardar avisa si con estas fechas cambia la época
 * activa o si hoy quedaría en receso -- lo que pasa si se guarda, dicho
 * antes de guardar.
 */
@Component({
  selector: 'app-dialogo-calendario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalDirective],
  templateUrl: './dialogo-calendario.component.html',
})
export class DialogoCalendarioComponent implements OnInit {
  private readonly servicio = inject(NotasService);
  protected readonly enLinea = inject(ConexionService).enLinea;

  readonly periodos = input.required<PeriodoNotas[]>();
  /** Hoy en el colegio (YYYY-MM-DD), del servidor. */
  readonly hoy = input.required<string>();

  readonly cerrar = output<void>();
  readonly guardado = output<CalendarioGuardado>();

  protected readonly filas = signal<Fila[]>([]);
  protected readonly erroresServidor = signal<Record<number, string>>({});
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly guardando = signal(false);

  ngOnInit(): void {
    this.filas.set(this.periodos().map((p) => ({ id: p.id, inicio: p.fechaInicio, fin: p.fechaFin })));
  }

  protected readonly anio = computed(() => this.periodos()[0]?.anio ?? new Date().getFullYear());

  /** Cada fila con su época, su duración y su error (el primero que aplique, en orden). */
  protected readonly vista = computed(() => {
    const anio = String(this.anio());
    const servidor = this.erroresServidor();
    let cierreAnterior: string | null = null;
    let nombreAnterior = '';

    return this.filas().map((f, i) => {
      const p = this.periodos()[i];
      let error = '';
      if (!fechaSola(f.inicio) || !fechaSola(f.fin)) error = 'Escribe la fecha de inicio y la de cierre.';
      else if (f.fin < f.inicio) error = 'El cierre debe ser después del inicio.';
      else if (!f.inicio.startsWith(anio) || !f.fin.startsWith(anio)) error = `Las fechas deben estar dentro del año escolar ${anio}.`;
      else if (cierreAnterior && f.inicio <= cierreAnterior) error = `Debe empezar después del cierre de la ${nombreAnterior} Época (${diaMes(cierreAnterior)}).`;

      if (fechaSola(f.fin)) {
        cierreAnterior = f.fin;
        nombreAnterior = p.epoca;
      }

      const dias = error ? 0 : diasEntre(f.inicio, f.fin) + 1;
      return {
        ...f,
        p,
        error: error || servidor[i] || '',
        duracion: dias ? `${Math.round(dias / 7)} semanas · ${dias} días` : '—',
      };
    });
  });

  protected readonly hayErrores = computed(() => this.vista().some((f) => f.error));

  /** Lo que pasa con la época activa si se guarda así. */
  protected readonly consecuencia = computed<{ tono: 'info' | 'aviso'; icono: string; texto: string } | null>(() => {
    if (this.hayErrores()) return null;
    const hoy = this.hoy();
    const nueva = this.vista().find((f) => f.inicio <= hoy && hoy <= f.fin)?.p ?? null;
    const actual = this.periodos().find((p) => p.estado === 'activo') ?? null;

    if (nueva === null) {
      return {
        tono: 'aviso', icono: '!',
        texto: 'Con estas fechas, hoy no quedaría ninguna época activa: nadie podría subir notas hasta que empiece la siguiente.',
      };
    }
    if (nueva.id !== actual?.id) {
      return { tono: 'aviso', icono: '!', texto: `Con estas fechas, la época activa pasa a ser ${nueva.epoca} Época (${nueva.nombre}).` };
    }
    return { tono: 'info', icono: 'i', texto: `Época activa hoy: ${nueva.epoca} Época (${nueva.nombre}).` };
  });

  protected cambiar(i: number, campo: 'inicio' | 'fin', valor: string): void {
    this.filas.update((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
    this.erroresServidor.update((e) => {
      const { [i]: _, ...resto } = e;
      return resto;
    });
  }

  protected async guardar(): Promise<void> {
    if (this.hayErrores() || this.guardando() || !this.enLinea()) return;
    this.guardando.set(true);
    this.errorGeneral.set(null);
    try {
      this.guardado.emit(
        await this.servicio.guardarCalendario(
          this.anio(),
          this.filas().map((f) => ({ periodo_id: f.id, fecha_inicio: f.inicio, fecha_fin: f.fin })),
        ),
      );
    } catch (err) {
      // Los errores vienen por posición: `epocas.2` o `epocas.2.fecha_fin`.
      const porFila: Record<number, string> = {};
      for (const [clave, mensajes] of Object.entries(detallesDeError(err))) {
        const m = /^epocas\.(\d+)/.exec(clave);
        if (m) porFila[Number(m[1])] ??= mensajes[0];
      }
      if (Object.keys(porFila).length) this.erroresServidor.set(porFila);
      else this.errorGeneral.set(mensajeDeError(err, 'No se pudo guardar el calendario.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
