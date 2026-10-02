import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  Boletin,
  BoletinPropio,
  EstudianteDeCurso,
  OpcionesBoletin,
} from '../interfaces/nudo.interface';

/**
 * Boletín por nudo pedagógico.
 *
 * Dos puertas: admin consulta el de cualquier estudiante (`/estudiantes/{id}`),
 * el estudiante solo el suyo (`/mio`, sin id que se pueda cambiar). Quién
 * puede usar cuál lo decide el backend; este service no lo repite.
 */
@Injectable({ providedIn: 'root' })
export class BoletinesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/boletines`;

  async opciones(): Promise<OpcionesBoletin> {
    return firstValueFrom(this.http.get<OpcionesBoletin>(`${this.base}/opciones`));
  }

  async estudiantes(anio: number, sedeId: number, grado: number, grupo: string): Promise<EstudianteDeCurso[]> {
    return firstValueFrom(
      this.http.get<EstudianteDeCurso[]>(`${this.base}/estudiantes`, {
        params: { anio, sede_id: sedeId, grado, grupo },
      }),
    );
  }

  async deEstudiante(estudianteId: string, anio: number): Promise<Boletin> {
    return firstValueFrom(
      this.http.get<Boletin>(`${this.base}/estudiantes/${estudianteId}`, { params: { anio } }),
    );
  }

  async mio(anio: number | null): Promise<BoletinPropio> {
    return firstValueFrom(
      this.http.get<BoletinPropio>(`${this.base}/mio`, { params: anio === null ? {} : { anio } }),
    );
  }
}
