import { ChangeDetectionStrategy, Component, type OnInit, computed, inject, input, output, signal } from '@angular/core';
import type { AvanceAsignacion, PeriodoNotas, Prorroga } from '../../../../core/interfaces/nota.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import {
  aInputFecha,
  aInputHora,
  cargaGeneralAbierta,
  curso,
  desdeInputs,
  diaHora,
  diaHoraAnio,
  falta,
  isoLocal,
} from '../../reglas';

/**
 * "Dar prórroga" / "Modificar prórroga": profesor y asignación
 * precargados, nueva fecha y hora (futura y posterior al cierre general)
 * y motivo obligatorio. Solo vale para esta asignación y este período.
 *
 * La fecha propuesta es dos días después del cierre (o de hoy, si ya
 * cerró), a las 6:00 p. m.: el caso típico es "le faltó la semana", y
 * así casi nunca hay que tocar la hora.
 */
@Component({
  selector: 'app-dialogo-prorroga',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalDirective],
  templateUrl: './dialogo-prorroga.component.html',
})
export class DialogoProrrogaComponent implements OnInit {
  private readonly servicio = inject(NotasService);
  protected readonly enLinea = inject(ConexionService).enLinea;
  protected readonly quien = inject(AuthService).usuario;

  readonly asignacion = input.required<AvanceAsignacion>();
  readonly periodo = input.required<PeriodoNotas>();
  /** La hora del servidor (no la del equipo). */
  readonly ahora = input.required<Date>();
  /** La vigente, si se está modificando. */
  readonly prorroga = input<Prorroga | null>(null);

  readonly cerrar = output<void>();
  readonly guardada = output<Prorroga>();

  protected readonly fecha = signal('');
  protected readonly hora = signal('');
  protected readonly motivo = signal('');
  protected readonly tocada = signal(false);
  protected readonly errores = signal<{ fecha?: string; motivo?: string }>({});
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected readonly modificando = computed(() => this.prorroga() !== null);

  protected readonly ficha = computed(() => {
    const a = this.asignacion();
    const p = this.periodo();
    return {
      asignacion: `${a.materia} · ${curso(a.grado, a.grupo)} · ${a.sede.nombre}`,
      general: `${p.fechaLimiteNotas ? diaHora(p.fechaLimiteNotas) : '—'}${p.notasHabilitadas ? '' : ' · carga cerrada'}`,
    };
  });

  /** La validación de la fecha, dicha mientras se elige. */
  protected readonly ayudaFecha = computed(() => {
    const d = desdeInputs(this.fecha(), this.hora());
    const p = this.periodo();
    const ahora = this.ahora();
    if (d === null) return { texto: 'Escribe fecha y hora completas.', error: true };
    if (d <= ahora) return { texto: 'Debe ser una fecha futura.', error: true };
    if (cargaGeneralAbierta(p, ahora) && p.fechaLimiteNotas && d.getTime() <= Date.parse(p.fechaLimiteNotas)) {
      return { texto: `Debe ser después del cierre general (${diaHora(p.fechaLimiteNotas)}).`, error: true };
    }
    return { texto: `Podrá subir notas hasta el ${diaHoraAnio(d)} (${falta(d, ahora)}).`, error: false };
  });

  /** Los valores iniciales dependen de los inputs, que no existen todavía en el constructor. */
  ngOnInit(): void {
    const existente = this.prorroga();
    let d: Date;
    if (existente) {
      d = new Date(existente.hasta);
      this.motivo.set(existente.motivo ?? '');
    } else {
      const lim = this.periodo().fechaLimiteNotas;
      d = new Date(Math.max(lim ? Date.parse(lim) : 0, this.ahora().getTime()) + 2 * 864e5);
      d.setHours(18, 0, 0, 0);
    }
    this.fecha.set(aInputFecha(d));
    this.hora.set(aInputHora(d));
  }

  protected cambiar(campo: 'fecha' | 'hora', valor: string): void {
    (campo === 'fecha' ? this.fecha : this.hora).set(valor);
    this.tocada.set(true);
    this.errores.update((e) => ({ ...e, fecha: undefined }));
  }

  protected escribirMotivo(texto: string): void {
    this.motivo.set(texto);
    this.errores.update((e) => ({ ...e, motivo: undefined }));
  }

  protected async guardar(): Promise<void> {
    if (this.guardando() || !this.enLinea()) return;
    const ayuda = this.ayudaFecha();
    const errores: { fecha?: string; motivo?: string } = {};
    if (ayuda.error) errores.fecha = ayuda.texto;
    if (this.motivo().trim().length < 8) errores.motivo = 'Escribe el motivo (mínimo 8 caracteres).';
    if (Object.keys(errores).length) {
      this.tocada.set(true);
      this.errores.set(errores);
      return;
    }

    this.guardando.set(true);
    this.errorGeneral.set(null);
    try {
      const d = desdeInputs(this.fecha(), this.hora())!;
      this.guardada.emit(await this.servicio.guardarProrroga(this.asignacion().id, isoLocal(d), this.motivo().trim()));
    } catch (err) {
      const det = detallesDeError(err);
      if (det['fecha_limite'] || det['motivo']) {
        this.errores.set({ fecha: det['fecha_limite']?.[0], motivo: det['motivo']?.[0] });
      } else {
        this.errorGeneral.set(mensajeDeError(err, 'No se pudo guardar la prórroga.'));
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
