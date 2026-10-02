import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  AsignaturaConNudo,
  CatalogoNudos,
  ConfiguracionPorcentajes,
  MateriaParaGuardar,
  NudoParaGuardar,
  NudoPedagogico,
  OpcionesPorcentajes,
  PorcentajesParaGuardar,
  ResultadoAsignarNudo,
} from '../interfaces/nudo.interface';

/**
 * Nudos pedagógicos y porcentajes por grado.
 *
 * Un solo service para las dos pantallas porque hablan del mismo concepto
 * (cómo se agrupan las materias en el boletín), pero son DOS recursos de
 * la API con permisos distintos -- `/nudos` y `/porcentajes`.
 *
 * Igual que AsignacionesService, no guarda estado: quien lo llama es
 * dueño de lo que muestra.
 */
@Injectable({ providedIn: 'root' })
export class NudosService {
  private readonly http = inject(HttpClient);
  private readonly nudos = `${environment.apiUrl}/nudos`;
  private readonly porcentajes = `${environment.apiUrl}/porcentajes`;

  async catalogo(): Promise<CatalogoNudos> {
    return firstValueFrom(this.http.get<CatalogoNudos>(this.nudos));
  }

  async crear(datos: NudoParaGuardar): Promise<NudoPedagogico> {
    return firstValueFrom(this.http.post<NudoPedagogico>(this.nudos, datos));
  }

  async actualizar(id: number, datos: NudoParaGuardar): Promise<NudoPedagogico> {
    return firstValueFrom(this.http.put<NudoPedagogico>(`${this.nudos}/${id}`, datos));
  }

  /** Solo funciona con un nudo vacío; si tiene materias, el backend responde 422. */
  async eliminar(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.nudos}/${id}`));
  }

  async asignarNudo(asignaturaId: number, nudoId: number | null): Promise<ResultadoAsignarNudo> {
    return firstValueFrom(
      this.http.patch<ResultadoAsignarNudo>(`${this.nudos}/asignaturas/${asignaturaId}`, {
        nudo_pedagogico_id: nudoId,
      }),
    );
  }

  async crearMateria(datos: MateriaParaGuardar): Promise<Pick<AsignaturaConNudo, 'id' | 'nombre' | 'codigo' | 'nudoId'>> {
    return firstValueFrom(
      this.http.post<Pick<AsignaturaConNudo, 'id' | 'nombre' | 'codigo' | 'nudoId'>>(`${this.nudos}/asignaturas`, datos),
    );
  }

  /** Nombre y nudo; el código no se cambia. Devuelve los porcentajes que dejan de cerrar si cambió de nudo. */
  async actualizarMateria(id: number, datos: MateriaParaGuardar): Promise<ResultadoAsignarNudo> {
    return firstValueFrom(this.http.put<ResultadoAsignarNudo>(`${this.nudos}/asignaturas/${id}`, datos));
  }

  /** Solo con una materia sin asignaciones; si tiene, el backend responde 422. */
  async eliminarMateria(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.nudos}/asignaturas/${id}`));
  }

  async opcionesPorcentajes(): Promise<OpcionesPorcentajes> {
    return firstValueFrom(this.http.get<OpcionesPorcentajes>(`${this.porcentajes}/opciones`));
  }

  async configuracion(grado: number, anio: number): Promise<ConfiguracionPorcentajes> {
    return firstValueFrom(
      this.http.get<ConfiguracionPorcentajes>(this.porcentajes, { params: { grado, anio } }),
    );
  }

  /**
   * Si algún nudo no suma 100, el backend responde 422 con un mensaje por
   * nudo en `detalles['nudos.{id}']`. Acá no se atrapa: lo pinta la
   * pantalla al lado de cada nudo.
   */
  async guardarPorcentajes(datos: PorcentajesParaGuardar): Promise<ConfiguracionPorcentajes> {
    return firstValueFrom(this.http.put<ConfiguracionPorcentajes>(this.porcentajes, datos));
  }
}
