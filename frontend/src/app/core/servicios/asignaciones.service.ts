import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  Asignacion,
  AsignacionParaGuardar,
  FiltrosAsignaciones,
  OpcionesAsignaciones,
} from '../interfaces/asignacion.interface';

/**
 * Único punto de contacto con `/api/v1/asignaciones`. Vive en
 * `core/servicios/` y no dentro de `features/asignaciones/` por la
 * convención del proyecto: un service deja de ser exclusivo de su feature
 * apenas un segundo módulo necesita los mismos datos (Reportes va a
 * querer saber quién dicta qué), y centralizarlo desde el principio evita
 * el reordenamiento después.
 *
 * `async/await` con `firstValueFrom` y no un pipe de RxJS: son peticiones
 * HTTP puntuales, no flujos. No hay nada que desuscribir, así que tampoco
 * hay dónde fugar una suscripción. El pipe completo se reserva para lo
 * genuinamente reactivo (un buscador con debounce, por ejemplo).
 *
 * El service NO guarda estado: no tiene un `signal` con la lista adentro.
 * El estado de la pantalla (qué se está viendo, qué filtros hay puestos)
 * es del componente de ruta, que es quien lo pierde y lo recupera al
 * navegar. Un caché acá parecería gratis y sería la primera fuente de
 * datos viejos después de que alguien edite en otra pestaña.
 */
@Injectable({ providedIn: 'root' })
export class AsignacionesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/asignaciones`;

  /**
   * Los filtros en `null` simplemente no viajan. Eso es lo que hace que
   * sean independientes entre sí: mandar solo `grado=3` es una consulta
   * perfectamente válida y devuelve todos los grupos de tercero.
   */
  async listar(filtros: FiltrosAsignaciones): Promise<Asignacion[]> {
    let parametros = new HttpParams();

    const mapa: Record<string, string | number | null> = {
      anio: filtros.anio,
      sede_id: filtros.sedeId,
      grado: filtros.grado,
      grupo: filtros.grupo,
      profesor_id: filtros.profesorId,
      asignatura_id: filtros.asignaturaId,
    };

    for (const [clave, valor] of Object.entries(mapa)) {
      if (valor !== null && valor !== '') parametros = parametros.set(clave, valor);
    }

    return firstValueFrom(this.http.get<Asignacion[]>(this.base, { params: parametros }));
  }

  /** Catálogos del formulario, todos en una respuesta. */
  async opciones(): Promise<OpcionesAsignaciones> {
    return firstValueFrom(this.http.get<OpcionesAsignaciones>(`${this.base}/opciones`));
  }

  async crear(datos: AsignacionParaGuardar): Promise<Asignacion> {
    return firstValueFrom(this.http.post<Asignacion>(this.base, datos));
  }

  async actualizar(id: string, datos: AsignacionParaGuardar): Promise<Asignacion> {
    return firstValueFrom(this.http.put<Asignacion>(`${this.base}/${id}`, datos));
  }

  /** Desactivar o reactivar. Nunca toca las notas ya registradas. */
  async cambiarEstado(id: string, activo: boolean): Promise<Asignacion> {
    return firstValueFrom(this.http.patch<Asignacion>(`${this.base}/${id}/activo`, { activo }));
  }

  /**
   * Borrado definitivo. Si la asignación tiene notas, el backend responde
   * 409 con `codigo: 'ASIGNACION_CON_NOTAS'` y el conteo en `detalles` --
   * el diálogo lo usa para ofrecer "Desactivar" en su lugar. Acá no se
   * atrapa: el error sube tal cual y lo interpreta quien lo llamó.
   */
  async eliminar(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }
}
