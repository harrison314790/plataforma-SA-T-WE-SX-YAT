import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * `super_admin` es superconjunto de `admin` (el operador del producto,
 * pensado para cuando esto se venda a otros colegios); `admin` es para
 * secretarias/rectores/coordinadores de una sede -- ver
 * .claude/skills/sistema-academico/references/permisos.md. Angular nunca
 * bifurca lógica por este string (ni un switch, ni un guard que compare
 * `rol === 'admin'`): todo pasa por el mapa `permisos` dinámico que ya
 * cachea este service. Este tipo solo existe para lo que sí necesita
 * mostrar el rol tal cual (encabezados, "conectado como...").
 */
export type Rol = 'super_admin' | 'admin' | 'profesor' | 'estudiante';

interface RespuestaLogin {
  jwt: string;
  refreshToken: string;
  expiraEn: string; // ISO 8601
  rol: Rol;
  permisos: Record<string, boolean>; // codigo -> habilitado, ver references/permisos.md
}

const CLAVE_SESION = 'sa_sesion';
// Refrescar un minuto antes de la expiración real, no justo al filo.
const MARGEN_REFRESCO_MS = 60_000;

/**
 * Cachea el JWT y el mapa de permisos en memoria tras el login (una sola
 * consulta, ver references/permisos.md), y los persiste en
 * `sessionStorage` -- NUNCA `localStorage`. La razón es de contexto, no
 * técnica: muchos profesores usan computadores compartidos de la
 * escuela; con `localStorage` la sesión quedaría abierta indefinidamente
 * para el siguiente que use el equipo. `sessionStorage` se borra solo al
 * cerrar el navegador (no la pestaña), que es el comportamiento correcto
 * acá. Ver la decisión completa en
 * .claude/skills/sistema-academico/references/node-supabase.md.
 *
 * El JWT de Supabase expira en ~1h. Este service programa un refresco
 * automático con el refresh_token antes de esa expiración
 * (`programarRefresco`), para que la sesión no muera a mitad de una
 * clase mientras un profesor está digitando notas.
 *
 * *appHasRole y los guards leen el signal de permisos -- nunca vuelven a
 * pedirle nada al backend por cada chequeo.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _jwt = signal<string | null>(null);
  private readonly _refreshToken = signal<string | null>(null);
  private readonly _rol = signal<Rol | null>(null);
  private readonly _permisos = signal<Record<string, boolean>>({});
  private temporizadorRefresco: ReturnType<typeof setTimeout> | null = null;

  readonly estaAutenticado = computed(() => this._jwt() !== null);
  readonly rol = this._rol.asReadonly();

  constructor() {
    this.restaurarSesion();
  }

  async iniciarSesion(email: string, password: string): Promise<void> {
    const respuesta = await firstValueFrom(
      this.http.post<RespuestaLogin>(`${environment.apiUrl}/autenticacion/login`, { email, password }),
    );
    this.aplicarSesion(respuesta);
  }

  tienePermiso(codigo: string): boolean {
    return this._permisos()[codigo] === true;
  }

  jwtActual(): string | null {
    return this._jwt();
  }

  cerrarSesion(): void {
    this.cancelarRefresco();
    this._jwt.set(null);
    this._refreshToken.set(null);
    this._rol.set(null);
    this._permisos.set({});
    sessionStorage.removeItem(CLAVE_SESION);
  }

  private aplicarSesion(respuesta: RespuestaLogin): void {
    this._jwt.set(respuesta.jwt);
    this._refreshToken.set(respuesta.refreshToken);
    this._rol.set(respuesta.rol);
    this._permisos.set(respuesta.permisos);
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(respuesta));
    this.programarRefresco(respuesta.expiraEn);
  }

  /** Al recargar la página dentro de la misma pestaña/navegador, retoma la sesión sin pedir login de nuevo. */
  private restaurarSesion(): void {
    const crudo = sessionStorage.getItem(CLAVE_SESION);
    if (!crudo) return;
    try {
      const sesion = JSON.parse(crudo) as RespuestaLogin;
      if (new Date(sesion.expiraEn).getTime() <= Date.now()) {
        sessionStorage.removeItem(CLAVE_SESION);
        return;
      }
      this._jwt.set(sesion.jwt);
      this._refreshToken.set(sesion.refreshToken);
      this._rol.set(sesion.rol);
      this._permisos.set(sesion.permisos);
      this.programarRefresco(sesion.expiraEn);
    } catch {
      sessionStorage.removeItem(CLAVE_SESION);
    }
  }

  private programarRefresco(expiraEn: string): void {
    this.cancelarRefresco();
    const msHastaRefresco = new Date(expiraEn).getTime() - Date.now() - MARGEN_REFRESCO_MS;
    this.temporizadorRefresco = setTimeout(() => void this.refrescar(), Math.max(msHastaRefresco, 0));
  }

  private cancelarRefresco(): void {
    if (this.temporizadorRefresco !== null) {
      clearTimeout(this.temporizadorRefresco);
      this.temporizadorRefresco = null;
    }
  }

  private async refrescar(): Promise<void> {
    const refreshToken = this._refreshToken();
    if (!refreshToken) return;
    try {
      const respuesta = await firstValueFrom(
        this.http.post<RespuestaLogin>(`${environment.apiUrl}/autenticacion/refrescar`, { refreshToken }),
      );
      this.aplicarSesion(respuesta);
    } catch {
      // El refresh_token también expiró o ya se usó (Supabase lo rota en
      // cada refresco) -- no hay forma de recuperar la sesión en
      // silencio. Mejor cerrarla explícitamente que dejar al profesor
      // con una sesión que parece viva pero ya no sirve para nada.
      this.cerrarSesion();
    }
  }
}
