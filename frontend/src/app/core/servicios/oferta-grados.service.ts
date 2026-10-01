import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  OfertaGrado,
  OfertaGradoParaGuardar,
} from '../interfaces/asignacion.interface';

/**
 * El catálogo de qué grado+grupo existe en cada sede (`oferta_grados`).
 *
 * Service propio y no métodos dentro de `AsignacionesService`: es otro
 * recurso, con otro ciclo de vida (una vereda abre quinto y lo cierra dos
 * años después, sin relación con quién dicta qué) y otro endpoint. Hoy se
 * administra desde la pantalla de Asignaciones porque es la única que
 * existe; Matrículas va a usar exactamente lo mismo.
 *
 * Igual que AsignacionesService, no guarda estado: quien lo llama es
 * dueño de lo que muestra.
 */
@Injectable({ providedIn: 'root' })
export class OfertaGradosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/oferta-grados`;

  /** Todas, activas e inactivas, con cuánto usa cada una. */
  async listar(): Promise<OfertaGrado[]> {
    return firstValueFrom(this.http.get<OfertaGrado[]>(this.base));
  }

  async crear(datos: OfertaGradoParaGuardar): Promise<OfertaGrado> {
    return firstValueFrom(this.http.post<OfertaGrado>(this.base, datos));
  }

  /**
   * Desactivar no invalida el histórico: las asignaciones y matrículas
   * que ya usaron esa combinación siguen siendo válidas. Lo que cambia es
   * que deja de ofrecerse para trabajo nuevo.
   */
  async cambiarEstado(id: number, activo: boolean): Promise<OfertaGrado> {
    return firstValueFrom(this.http.patch<OfertaGrado>(`${this.base}/${id}/activo`, { activo }));
  }

  /**
   * Borrado definitivo. Si la combinación ya se usó, el backend responde
   * 409 con `codigo: 'OFERTA_EN_USO'`. Acá no se atrapa: sube tal cual y
   * lo interpreta la pantalla, que ya sabía por `usos` que iba a pasar.
   */
  async eliminar(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }
}
