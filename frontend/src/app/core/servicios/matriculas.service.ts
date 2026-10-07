import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  AcudienteAgregado,
  AcudienteParaGuardar,
  DatosMatriculas,
  LoteParaGuardar,
  Matricula,
  MatriculaParaGuardar,
  OpcionesMatriculas,
} from '../interfaces/matricula.interface';

/**
 * Único punto de contacto con `/api/v1/matriculas`. Mismo criterio que
 * UsuariosService: `async/await` con `firstValueFrom` (peticiones
 * puntuales, no flujos) y sin estado propio -- los datos viven en el
 * componente de ruta.
 */
@Injectable({ providedIn: 'root' })
export class MatriculasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/matriculas`;

  async opciones(): Promise<OpcionesMatriculas> {
    return firstValueFrom(this.http.get<OpcionesMatriculas>(`${this.base}/opciones`));
  }

  /** Todo lo de un año (estudiantes, matrículas de ese año y el anterior, resultados). */
  async listar(anio: number): Promise<DatosMatriculas> {
    return firstValueFrom(this.http.get<DatosMatriculas>(this.base, { params: { anio } }));
  }

  async matricular(datos: MatriculaParaGuardar): Promise<Matricula> {
    return firstValueFrom(this.http.post<Matricula>(this.base, datos));
  }

  /** Todo o nada: si uno no se puede, el backend no guarda ninguno. */
  async matricularLote(datos: LoteParaGuardar): Promise<Matricula[]> {
    return firstValueFrom(this.http.post<Matricula[]>(`${this.base}/lote`, datos));
  }

  async cambiarGrupo(id: string, sedeId: number, grupo: string): Promise<Matricula> {
    return firstValueFrom(
      this.http.patch<Matricula>(`${this.base}/${id}/grupo`, { sede_id: sedeId, grupo }),
    );
  }

  async retirar(id: string, motivo: string, detalle: string | null): Promise<Matricula> {
    return firstValueFrom(this.http.patch<Matricula>(`${this.base}/${id}/retiro`, { motivo, detalle }));
  }

  async agregarAcudiente(datos: AcudienteParaGuardar): Promise<AcudienteAgregado> {
    return firstValueFrom(this.http.post<AcudienteAgregado>(`${this.base}/acudientes`, datos));
  }
}
