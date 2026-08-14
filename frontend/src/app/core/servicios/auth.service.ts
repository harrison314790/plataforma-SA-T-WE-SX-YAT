import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Rol = 'admin' | 'profesor' | 'estudiante';

interface RespuestaLogin {
  jwt: string;
  rol: Rol;
  permisos: Record<string, boolean>; // codigo -> habilitado, ver references/permisos.md
}

/**
 * Cachea el JWT y el mapa de permisos en memoria tras el login (una sola
 * consulta, ver references/permisos.md). *appHasRole y los guards leen
 * este signal; nunca vuelven a pedirle nada al backend por cada chequeo.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _jwt = signal<string | null>(null);
  private readonly _rol = signal<Rol | null>(null);
  private readonly _permisos = signal<Record<string, boolean>>({});

  readonly estaAutenticado = computed(() => this._jwt() !== null);
  readonly rol = this._rol.asReadonly();

  async iniciarSesion(email: string, password: string): Promise<void> {
    const respuesta = await firstValueFrom(
      this.http.post<RespuestaLogin>('/api/autenticacion/login', { email, password }),
    );
    this._jwt.set(respuesta.jwt);
    this._rol.set(respuesta.rol);
    this._permisos.set(respuesta.permisos);
  }

  tienePermiso(codigo: string): boolean {
    return this._permisos()[codigo] === true;
  }

  jwtActual(): string | null {
    return this._jwt();
  }

  cerrarSesion(): void {
    this._jwt.set(null);
    this._rol.set(null);
    this._permisos.set({});
  }
}
