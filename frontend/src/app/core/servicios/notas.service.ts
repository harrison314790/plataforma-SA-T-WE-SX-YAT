import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  CalendarioGuardado,
  DetalleAsignacion,
  FechasDeEpoca,
  LoteDeNotas,
  NotaDetalle,
  NotaGuardada,
  PeriodoNotas,
  Prorroga,
  RegistroProfesor,
  SeguimientoNotas,
} from '../interfaces/nota.interface';

/**
 * Único punto de contacto con `/api/v1/notas`. Mismo criterio que
 * MatriculasService: `async/await` con `firstValueFrom` (peticiones
 * puntuales, no flujos) y sin estado propio -- los datos viven en el
 * componente de ruta.
 *
 * Las fechas que se ENVÍAN van como ISO con el offset del equipo
 * (`2026-10-20T18:00:00-05:00`): es la hora que eligió la persona, y el
 * backend la pasa a UTC antes de guardarla.
 */
@Injectable({ providedIn: 'root' })
export class NotasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/notas`;

  // ── Profesor ──

  async registro(periodoId: number | null): Promise<RegistroProfesor> {
    return firstValueFrom(this.http.get<RegistroProfesor>(`${this.base}/registro`, { params: this.params(periodoId) }));
  }

  /** Todo o nada: si una falla, el backend no guarda ninguna. */
  async guardarLote(lote: LoteDeNotas): Promise<NotaGuardada[]> {
    return firstValueFrom(this.http.post<NotaGuardada[]>(`${this.base}/lote`, lote));
  }

  // ── Coordinación ──

  async seguimiento(periodoId: number | null): Promise<SeguimientoNotas> {
    return firstValueFrom(
      this.http.get<SeguimientoNotas>(`${this.base}/seguimiento`, { params: this.params(periodoId) }),
    );
  }

  async detalle(asignacionId: string, periodoId: number): Promise<DetalleAsignacion> {
    return firstValueFrom(
      this.http.get<DetalleAsignacion>(`${this.base}/seguimiento/asignaciones/${asignacionId}`, {
        params: { periodo_id: periodoId },
      }),
    );
  }

  /** `valorAnterior`: el que se veía al abrir; si cambió mientras tanto, el backend rechaza. */
  async corregir(notaId: string, valor: number, motivo: string, valorAnterior: number): Promise<NotaDetalle> {
    return firstValueFrom(
      this.http.put<NotaDetalle>(`${this.base}/${notaId}/correccion`, { valor, motivo, valor_anterior: valorAnterior }),
    );
  }

  async cambiarPlazo(
    periodoId: number,
    cambios: { notas_habilitadas?: boolean; fecha_limite_notas?: string },
  ): Promise<PeriodoNotas> {
    return firstValueFrom(this.http.patch<PeriodoNotas>(`${this.base}/periodos/${periodoId}/plazo`, cambios));
  }

  /** Las fechas de inicio y cierre de todas las épocas del año. La época activa sale de ahí. */
  async guardarCalendario(anio: number, epocas: FechasDeEpoca[]): Promise<CalendarioGuardado> {
    return firstValueFrom(this.http.put<CalendarioGuardado>(`${this.base}/calendario`, { anio, epocas }));
  }

  async guardarProrroga(asignacionId: string, fechaLimite: string, motivo: string): Promise<Prorroga> {
    return firstValueFrom(
      this.http.post<Prorroga>(`${this.base}/prorrogas`, {
        asignacion_id: asignacionId,
        fecha_limite: fechaLimite,
        motivo,
      }),
    );
  }

  async quitarProrroga(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/prorrogas/${id}`));
  }

  private params(periodoId: number | null): Record<string, number> {
    return periodoId === null ? {} : { periodo_id: periodoId };
  }
}
