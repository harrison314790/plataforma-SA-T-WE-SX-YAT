import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  CuentaParaActualizar,
  CuentaParaCrear,
  CuentaUsuario,
  OpcionesUsuarios,
} from '../interfaces/cuenta-usuario.interface';

/**
 * Único punto de contacto con `/api/v1/usuarios`. Mismo criterio que
 * AsignacionesService: `async/await` con `firstValueFrom` (son peticiones
 * puntuales, no flujos) y sin estado propio -- la lista vive en el
 * componente de ruta.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/usuarios`;

  /**
   * Profesores y estudiantes juntos, en una sola petición. La pantalla
   * muestra el conteo de las dos pestañas y filtra por nombre/estado en
   * el cliente: con unos cientos de cuentas, un round-trip por tecla
   * sería peor que unos kilobytes de más.
   */
  async listar(): Promise<CuentaUsuario[]> {
    return firstValueFrom(this.http.get<CuentaUsuario[]>(this.base));
  }

  async opciones(): Promise<OpcionesUsuarios> {
    return firstValueFrom(this.http.get<OpcionesUsuarios>(`${this.base}/opciones`));
  }

  /**
   * La contraseña viaja en el body y NO vuelve en la respuesta: quien la
   * escribió ya la tiene, y es el componente el que la muestra una sola
   * vez en el diálogo de "Cuenta creada".
   */
  async crear(datos: CuentaParaCrear): Promise<CuentaUsuario> {
    return firstValueFrom(this.http.post<CuentaUsuario>(this.base, datos));
  }

  async actualizar(id: string, datos: CuentaParaActualizar): Promise<CuentaUsuario> {
    return firstValueFrom(this.http.put<CuentaUsuario>(`${this.base}/${id}`, datos));
  }

  /**
   * Si la cuenta tiene datos asociados, el backend responde 409 con
   * `codigo: 'USUARIO_CON_DATOS'`. No se atrapa acá: lo interpreta quien
   * llamó.
   */
  async eliminar(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }
}
