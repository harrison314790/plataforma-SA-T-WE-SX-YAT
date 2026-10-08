import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { NotaDetalle } from '../../../../core/interfaces/nota.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { desempeno, leerNota, limpiarEntrada, normalizarNota, unDecimal } from '../../reglas';

export interface NotaACorregir {
  nota: NotaDetalle;
  estudiante: string;
  estudianteId: string;
  /** "Luis Pérez · Matemáticas 9-B · 2026-3" */
  contexto: string;
}

/**
 * "Corregir nota": valor anterior (solo lectura), valor nuevo y motivo,
 * los dos obligatorios. No acepta un valor igual al anterior.
 *
 * El historial no lo escribe esta pantalla ni Laravel: lo escribe el
 * trigger de Postgres con el motivo que se manda (21-notas-modulo.sql).
 * Acá solo se avisa qué va a quedar registrado.
 */
@Component({
  selector: 'app-dialogo-corregir-nota',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalDirective],
  templateUrl: './dialogo-corregir-nota.component.html',
})
export class DialogoCorregirNotaComponent {
  private readonly servicio = inject(NotasService);
  protected readonly enLinea = inject(ConexionService).enLinea;
  protected readonly quien = inject(AuthService).usuario;

  readonly datos = input.required<NotaACorregir>();
  readonly cerrar = output<void>();
  readonly corregida = output<NotaDetalle>();

  protected readonly valor = signal('');
  protected readonly motivo = signal('');
  protected readonly errores = signal<{ valor?: string; motivo?: string }>({});
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected readonly antes = computed(() => {
    const v = this.datos().nota.valor;
    return { texto: unDecimal(v), desempeno: desempeno(v) };
  });

  /** La ayuda bajo el campo, que cambia mientras se escribe. */
  protected readonly ayudaValor = computed(() => {
    const e = this.errores().valor;
    if (e) return { texto: e, error: true };
    const l = leerNota(this.valor());
    if (l.estado === 'vacia') return { texto: 'De 1,0 a 5,0 con un decimal', error: false };
    if (l.estado === 'error') return { texto: l.mensaje, error: true };
    if (Math.abs(l.valor - this.datos().nota.valor) < 0.01) return { texto: 'Es igual al valor anterior', error: true };
    return { texto: `Desempeño: ${desempeno(l.valor).texto}`, error: false };
  });

  protected escribirValor(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const limpio = limpiarEntrada(campo.value);
    if (limpio !== campo.value) campo.value = limpio;
    this.valor.set(limpio);
    this.errores.update((e) => ({ ...e, valor: undefined }));
  }

  protected normalizar(): void {
    this.valor.update(normalizarNota);
  }

  protected escribirMotivo(texto: string): void {
    this.motivo.set(texto);
    this.errores.update((e) => ({ ...e, motivo: undefined }));
  }

  protected async guardar(): Promise<void> {
    if (this.guardando() || !this.enLinea()) return;
    const l = leerNota(normalizarNota(this.valor()));
    const errores: { valor?: string; motivo?: string } = {};
    if (l.estado === 'vacia') errores.valor = 'Escribe el valor nuevo.';
    else if (l.estado === 'error') errores.valor = l.mensaje;
    else if (Math.abs(l.valor - this.datos().nota.valor) < 0.01) errores.valor = 'Es igual al valor anterior.';
    if (this.motivo().trim().length < 10) errores.motivo = 'Explica el motivo (mínimo 10 caracteres).';
    if (Object.keys(errores).length || l.estado !== 'ok') {
      this.errores.set(errores);
      return;
    }

    this.guardando.set(true);
    this.errorGeneral.set(null);
    try {
      this.corregida.emit(await this.servicio.corregir(this.datos().nota.id, l.valor, this.motivo().trim()));
    } catch (err) {
      const det = detallesDeError(err);
      if (det['valor'] || det['motivo']) this.errores.set({ valor: det['valor']?.[0], motivo: det['motivo']?.[0] });
      else this.errorGeneral.set(mensajeDeError(err, 'No se pudo guardar la corrección.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
