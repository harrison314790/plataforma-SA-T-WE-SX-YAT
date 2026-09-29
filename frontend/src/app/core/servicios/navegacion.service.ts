import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { GrupoDeMenu, ModuloDeMenu, ModuloSesion } from '../interfaces/modulo.interface';
import { estaConstruida } from '../navegacion/modulos-construidos';
import { AuthService } from './auth.service';

const CLAVE_BARRA_COLAPSADA = 'sa_barra_colapsada';

/**
 * Traduce los módulos que manda el backend a lo que la barra lateral y el
 * escritorio necesitan pintar, y guarda el estado de la propia barra.
 *
 * El backend ya resolvió "¿tiene permiso?"; acá se cruza con "¿la pantalla
 * existe?" (`modulos-construidos.ts`) para sacar el estado real de cada
 * módulo. Son dos fuentes distintas porque son dos preguntas distintas, y
 * ninguna de las dos puede contestar por la otra.
 */
@Injectable({ providedIn: 'root' })
export class NavegacionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * Preferencia de interfaz, no dato de sesión: va en `localStorage` para que
   * sobreviva al cierre del navegador. Es lo contrario del token, que va en
   * `sessionStorage` justamente para NO sobrevivirlo (equipos compartidos).
   * Mismo criterio que la altura de fila de la tabla de notas.
   */
  private readonly _colapsada = signal(this.leerPreferenciaColapsada());
  readonly colapsada = this._colapsada.asReadonly();

  /** En móvil la barra es un panel que tapa; acá se abre y se cierra. */
  private readonly _abiertaEnMovil = signal(false);
  readonly abiertaEnMovil = this._abiertaEnMovil.asReadonly();

  /** Todos los módulos activos de la institución, con su estado resuelto. */
  readonly modulos = computed<ModuloDeMenu[]>(() =>
    this.auth.modulos().map((modulo) => this.resolver(modulo)),
  );

  /**
   * Lo que lista la barra lateral: solo los módulos a los que el rol puede
   * entrar, agrupados. Los que no tiene permitidos NO aparecen -- en un menú,
   * un ítem que no se puede abrir estorba en vez de informar. En el
   * escritorio sí se muestran, atenuados y con el motivo.
   */
  readonly grupos = computed<GrupoDeMenu[]>(() => {
    const grupos = new Map<string, ModuloDeMenu[]>();

    for (const modulo of this.modulos()) {
      if (modulo.estado === 'sin-permiso') continue;
      // El backend ya devuelve los módulos ordenados por `orden`, así que el
      // orden de inserción del Map es el orden correcto de los grupos: cada
      // grupo aparece donde cae su primer módulo. Eso evita una columna
      // `orden_grupo` en la base que se pueda desincronizar del orden de los
      // módulos que contiene.
      const existente = grupos.get(modulo.grupo);
      if (existente) {
        existente.push(modulo);
      } else {
        grupos.set(modulo.grupo, [modulo]);
      }
    }

    return [...grupos].map(([etiqueta, modulos]) => ({ etiqueta, modulos }));
  });

  readonly totalDisponibles = computed(
    () => this.modulos().filter((modulo) => modulo.estado !== 'sin-permiso').length,
  );

  readonly total = computed(() => this.modulos().length);

  alternarColapsada(): void {
    this._colapsada.update((valor) => !valor);
    localStorage.setItem(CLAVE_BARRA_COLAPSADA, String(this._colapsada()));
  }

  abrirEnMovil(): void {
    this._abiertaEnMovil.set(true);
  }

  cerrarEnMovil(): void {
    this._abiertaEnMovil.set(false);
  }

  /**
   * Vuelve a pedir el menú sin cerrar sesión. Útil cuando `super_admin`
   * habilita o apaga un módulo: el resto del sistema no tiene por qué
   * reiniciar la sesión para verlo.
   *
   * Nota: los módulos son parte de la sesión (`AuthService`), así que esto
   * delega en `revalidarSesion()` en vez de mantener una segunda copia acá
   * que se pueda desincronizar con la del login.
   */
  async recargar(): Promise<void> {
    await this.auth.revalidarSesion();
  }

  /**
   * Consulta directa a GET /navegacion/modulos. Hoy no la usa nadie: el login
   * ya trae los módulos y `recargar()` cubre el refresco. Queda porque el
   * endpoint existe y es el punto de entrada para la futura pantalla de
   * configuración de super_admin, que necesitará ver el menú de OTRO rol sin
   * tocar su propia sesión.
   */
  async consultarModulos(): Promise<ModuloSesion[]> {
    const respuesta = await firstValueFrom(
      this.http.get<{ modulos: ModuloSesion[] }>(`${environment.apiUrl}/navegacion/modulos`),
    );
    return respuesta.modulos;
  }

  private resolver(modulo: ModuloSesion): ModuloDeMenu {
    const rutaPrincipal = modulo.vistas[0]?.ruta ?? null;

    return {
      ...modulo,
      rutaPrincipal,
      estado: !modulo.disponible
        ? 'sin-permiso'
        : estaConstruida(rutaPrincipal)
          ? 'disponible'
          : 'en-construccion',
    };
  }

  private leerPreferenciaColapsada(): boolean {
    return localStorage.getItem(CLAVE_BARRA_COLAPSADA) === 'true';
  }
}
