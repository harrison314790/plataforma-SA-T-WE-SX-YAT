import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ModuloSesion } from '../interfaces/modulo.interface';
import type { PeriodoActivo, RespuestaLogin, Rol, Sesion, UsuarioSesion } from '../interfaces/usuario.interface';

export type { Rol } from '../interfaces/usuario.interface';

const CLAVE_SESION = 'sa_sesion';

/** Lo que se guarda entre recargas: el token y la sesión que vino con él. */
interface SesionPersistida extends Sesion {
  token: string;
}

/**
 * Dueño único de la sesión: el token de Sanctum, quién está conectado, el
 * período activo, el mapa de permisos y los módulos. Todo llega en UNA
 * respuesta al iniciar sesión (ver SesionResource en el backend) porque cada
 * round-trip extra es un punto más donde la pantalla se queda a medias con
 * conectividad intermitente.
 *
 * DÓNDE SE GUARDA, Y POR QUÉ NO EN `localStorage`
 * `sessionStorage`. La razón es de contexto, no técnica: muchos profesores
 * usan los computadores compartidos de la escuela, y con `localStorage` la
 * sesión quedaría abierta para el siguiente que se siente en el equipo.
 * `sessionStorage` muere al cerrar el navegador, que es el comportamiento
 * correcto acá.
 *
 * POR QUÉ YA NO HAY REFRESH TOKEN NI TEMPORIZADOR DE REFRESCO
 * Los tenía la versión anterior de este service, heredados del diseño con
 * Supabase Auth (JWT de ~1h + refresh rotativo). Laravel Sanctum no funciona
 * así: emite un token OPACO ('19|R5Uem...'), no un JWT, sin fecha de
 * expiración adentro y hoy sin expiración configurada. No hay nada que
 * decodificar ni cuándo refrescar, así que programar un refresco era código
 * muerto que además rompía el login: el service leía `respuesta.jwt` y
 * `respuesta.expiraEn`, campos que este backend nunca mandó, y terminaba con
 * `_jwt` en `undefined` -- que no es `null`, así que `estaAutenticado()`
 * devolvía true con una sesión sin token y todo request moría en 401.
 *
 * Lo que reemplaza al refresco: si el token deja de servir, el backend
 * responde 401 y `sesionExpiradaInterceptor` cierra la sesión y manda al
 * login. Es reactivo en vez de preventivo, y es lo que corresponde con un
 * token sin vencimiento conocido.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _token = signal<string | null>(null);
  private readonly _sesion = signal<Sesion | null>(null);

  /**
   * Exige las dos cosas, no solo el token: una sesión a medias (token sin
   * usuario) pintaría la barra superior vacía en vez de mandar al login. Es
   * justo el estado en el que quedaba la versión anterior.
   */
  readonly estaAutenticado = computed(() => this._token() !== null && this._sesion() !== null);

  readonly usuario = computed<UsuarioSesion | null>(() => this._sesion()?.usuario ?? null);
  readonly rol = computed<Rol | null>(() => this._sesion()?.usuario.rol.codigo ?? null);
  readonly periodoActivo = computed<PeriodoActivo | null>(() => this._sesion()?.periodoActivo ?? null);
  readonly modulos = computed<ModuloSesion[]>(() => this._sesion()?.modulos ?? []);

  constructor() {
    this.restaurarSesion();
  }

  async iniciarSesion(email: string, password: string): Promise<void> {
    const respuesta = await firstValueFrom(
      this.http.post<RespuestaLogin>(`${environment.apiUrl}/autenticacion/login`, { email, password }),
    );

    const { token, ...sesion } = respuesta;
    this.aplicar(token, sesion);
  }

  /**
   * Cierra sesión también en el servidor: revoca el token en
   * `personal_access_tokens` para que no quede válido si alguien lo copió
   * antes. Si la petición falla (sin señal, justo el caso frecuente acá) la
   * sesión local se limpia igual -- dejar al profesor "dentro" porque no hubo
   * red sería lo peor de los dos mundos en un equipo compartido.
   */
  async cerrarSesion(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/autenticacion/cerrar-sesion`, {}),
      );
    } catch {
      // Sin conexión o token ya inválido: no hay nada que rescatar.
    } finally {
      this.descartarSesionLocal();
    }
  }

  /**
   * Limpia la sesión del navegador SIN llamar al backend. Lo usa el
   * interceptor de 401: volver a pegarle al servidor con un token que él
   * mismo acaba de rechazar solo agrega una petición condenada.
   */
  descartarSesionLocal(): void {
    this._token.set(null);
    this._sesion.set(null);
    sessionStorage.removeItem(CLAVE_SESION);
  }

  tienePermiso(codigo: string): boolean {
    return this._sesion()?.permisos[codigo] === true;
  }

  tokenActual(): string | null {
    return this._token();
  }

  /**
   * Vuelve a pedir la sesión al backend con el token que ya se tiene.
   *
   * Se llama al arrancar con una sesión restaurada, y sirve para dos cosas a
   * la vez: confirmar que el token sigue vivo, y traer permisos y módulos
   * frescos por si `super_admin` habilitó o apagó algo mientras la pestaña
   * estaba abierta. Sin esto, la copia de `sessionStorage` podría quedar
   * desactualizada por horas.
   *
   * No propaga el error: un 401 ya lo maneja el interceptor cerrando sesión,
   * y un fallo de red no debe tumbar una sesión que probablemente siga
   * siendo válida -- se sigue con los datos guardados.
   */
  async revalidarSesion(): Promise<void> {
    const token = this._token();
    if (token === null) return;

    try {
      const sesion = await firstValueFrom(
        this.http.get<Sesion>(`${environment.apiUrl}/autenticacion/yo`),
      );
      this.aplicar(token, sesion);
    } catch {
      // 401 -> lo resuelve sesionExpiradaInterceptor. Sin red -> se
      // conserva la sesión guardada, que es lo útil offline.
    }
  }

  private aplicar(token: string, sesion: Sesion): void {
    this._token.set(token);
    this._sesion.set(sesion);
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ token, ...sesion } satisfies SesionPersistida));
  }

  /**
   * Retoma la sesión al recargar la página, de forma SINCRÓNICA: los guards
   * de ruta corren antes de que cualquier petición pueda responder, así que
   * si esto fuera asíncrono el primer `canActivate` vería "no autenticado" y
   * rebotaría al login en cada F5. La revalidación contra el backend va
   * aparte (`revalidarSesion`, disparada por el shell) y no bloquea el
   * arranque.
   */
  private restaurarSesion(): void {
    const crudo = sessionStorage.getItem(CLAVE_SESION);
    if (crudo === null) return;

    try {
      const guardada = JSON.parse(crudo) as Partial<SesionPersistida>;

      // Se valida la forma, no solo que el JSON parsee: una sesión de una
      // versión anterior del frontend (la que guardaba `jwt`/`refreshToken`)
      // parsea perfecto y dejaría el token en `undefined`.
      if (typeof guardada.token !== 'string' || guardada.token === '' || guardada.usuario == null) {
        sessionStorage.removeItem(CLAVE_SESION);
        return;
      }

      const { token, ...sesion } = guardada as SesionPersistida;
      this._token.set(token);
      this._sesion.set(sesion);
    } catch {
      sessionStorage.removeItem(CLAVE_SESION);
    }
  }
}
