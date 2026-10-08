import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import type {
  AvanceAsignacion,
  DetalleAsignacion,
  NotaDetalle,
  PeriodoNotas,
  Prorroga,
} from '../../../../core/interfaces/nota.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { DialogoCorregirNotaComponent, type NotaACorregir } from '../dialogo-corregir-nota/dialogo-corregir-nota.component';
import {
  CHIP_AVANCE,
  curso,
  desempeno,
  diaHora,
  estadoAvance,
  nombreCompleto,
  unDecimal,
} from '../../reglas';

/**
 * Panel lateral "Ver notas" de coordinación: los estudiantes de una
 * asignación con su nota y desempeño (o "Falta"), quién la registró y
 * cuándo, el historial de correcciones y el botón "Corregir".
 *
 * Pide su propio detalle al abrirse (la tabla de seguimiento solo trae
 * conteos) y es dueño del modal de corrección: al corregir actualiza su
 * fila sin volver a pedir todo, y le avisa a la pantalla para el aviso
 * verde.
 */
@Component({
  selector: 'app-panel-ver-notas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogoCorregirNotaComponent, ModalDirective],
  templateUrl: './panel-ver-notas.component.html',
})
export class PanelVerNotasComponent {
  private readonly servicio = inject(NotasService);
  private readonly auth = inject(AuthService);
  protected readonly enLinea = inject(ConexionService).enLinea;

  readonly asignacion = input.required<AvanceAsignacion>();
  readonly periodo = input.required<PeriodoNotas>();
  /** La prórroga vigente, si hay (ya filtrada por la pantalla). */
  readonly prorroga = input<Prorroga | null>(null);

  readonly cerrar = output<void>();
  readonly darProrroga = output<void>();
  /** El texto del aviso: "Nota de X corregida: 3,8 → 4,0 en …". */
  readonly corregida = output<string>();

  protected readonly detalle = signal<DetalleAsignacion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly corrigiendo = signal<NotaACorregir | null>(null);
  protected readonly resaltada = signal<string | null>(null);

  protected readonly puedeCorregir = computed(() => this.auth.tienePermiso('btn_corregir_nota'));
  protected readonly puedeProrroga = computed(
    () => this.auth.tienePermiso('btn_dar_prorroga') && this.periodo().estado === 'activo',
  );

  constructor() {
    // Cada vez que cambia la asignación (se pulsa "Ver notas" en otra fila
    // con el panel abierto), se pide su detalle. `allowSignalWrites`: en
    // Angular 18 un effect que escribe signals (`cargando`, `detalle`)
    // lanza error sin él -- mismo caso que HasRoleDirective.
    //
    // Depende de `clave` (un string) y no de los objetos: después de cada
    // corrección la pantalla vuelve a pedir el seguimiento y llega una
    // asignación NUEVA con el mismo id; sin esto, el panel recargaría y
    // parpadearía el esqueleto sin motivo.
    effect(
      () => {
        const [asignacionId, periodoId] = this.clave().split('|');
        untracked(() => void this.cargar(asignacionId, Number(periodoId)));
      },
      { allowSignalWrites: true },
    );
  }

  private readonly clave = computed(() => `${this.asignacion().id}|${this.periodo().id}`);

  protected readonly cabecera = computed(() => {
    const a = this.asignacion();
    const estado = estadoAvance(a.conNota, a.total);
    return {
      curso: curso(a.grado, a.grupo),
      sub: `${a.profesor.nombre} · ${a.sede.nombre} · Período ${this.periodo().nombre}`,
      estado,
      chip: CHIP_AVANCE[estado],
      avance: `${a.conNota}/${a.total} con nota`,
      prorroga: this.prorroga() ? `Prórroga hasta ${diaHora(this.prorroga()!.hasta)}` : '',
      botonProrroga: this.prorroga() ? 'Modificar prórroga' : 'Dar prórroga',
    };
  });

  protected readonly filas = computed(() =>
    (this.detalle()?.estudiantes ?? []).map((e) => {
      const n = e.nota;
      const ultima = n?.historial.at(-1) ?? null;
      return {
        e,
        nombre: nombreCompleto(e),
        valor: n ? unDecimal(n.valor) : '—',
        desempeno: n ? desempeno(n.valor) : null,
        registro: n
          ? `Registró ${n.registradaPor} · ${n.registradaEn ? diaHora(n.registradaEn) : ''}`
          : this.periodo().estado === 'futuro'
            ? 'Período sin empezar'
            : e.retirado
              ? 'Retirado del curso'
              : 'Sin nota todavía',
        correccion: ultima
          ? `antes ${unDecimal(ultima.antes)} · ${ultima.por}, ${ultima.en ? diaHora(ultima.en) : ''} · “${ultima.motivo}”`
          : '',
        correcciones: n?.historial.length ?? 0,
        resaltada: this.resaltada() === e.id,
      };
    }),
  );

  private async cargar(asignacionId: string, periodoId: number): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.detalle.set(await this.servicio.detalle(asignacionId, periodoId));
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No pudimos cargar las notas de este curso.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected reintentar(): void {
    void this.cargar(this.asignacion().id, this.periodo().id);
  }

  protected abrirCorreccion(e: { id: string; nombres: string; apellidos: string }, nota: NotaDetalle): void {
    if (!this.enLinea()) return;
    const a = this.asignacion();
    this.corrigiendo.set({
      nota,
      estudiante: nombreCompleto(e),
      estudianteId: e.id,
      contexto: `${nombreCompleto(e)} · ${a.materia} ${curso(a.grado, a.grupo)} · ${this.periodo().nombre}`,
    });
  }

  protected alCorregir(nueva: NotaDetalle): void {
    const c = this.corrigiendo();
    const d = this.detalle();
    if (c === null || d === null) return;

    this.detalle.set({
      ...d,
      estudiantes: d.estudiantes.map((e) => (e.id === c.estudianteId ? { ...e, nota: nueva } : e)),
    });
    this.corrigiendo.set(null);
    this.resaltada.set(c.estudianteId);
    window.setTimeout(() => this.resaltada.set(null), 3500);

    const a = this.asignacion();
    this.corregida.emit(
      `Nota de ${c.estudiante} corregida: ${unDecimal(c.nota.valor)} → ${unDecimal(nueva.valor)} en ${a.materia} ${curso(a.grado, a.grupo)}.`,
    );
  }
}
