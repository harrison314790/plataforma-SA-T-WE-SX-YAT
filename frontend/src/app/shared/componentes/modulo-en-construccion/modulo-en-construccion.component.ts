import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../icono/icono.component';

/**
 * Destino de las rutas de los módulos que ya existen en la configuración pero
 * todavía no tienen pantalla.
 *
 * Existe para que ninguna ruta del menú lleve a una pantalla en blanco. Dice
 * qué falta y qué se puede hacer mientras tanto, en vez de un "Coming soon"
 * que no informa nada. Cuando el módulo se construya, se cambia el
 * `loadComponent` de su ruta en `app.routes.ts` y se agrega la ruta a
 * `core/navegacion/modulos-construidos.ts` -- el menú y el escritorio se
 * actualizan solos.
 *
 * Normalmente no se llega acá desde el menú (la barra lateral no hace clicable
 * un módulo sin construir), pero sí escribiendo la URL a mano o desde un enlace
 * viejo, y esos casos también merecen una respuesta.
 */
@Component({
  selector: 'app-modulo-en-construccion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    <section class="en-construccion">
      <app-icono nombre="libro" [tamano]="32" />
      <h1>{{ modulo() }} todavía no está disponible</h1>
      <p>
        El módulo ya está habilitado para tu rol, pero su pantalla está en
        construcción. Vas a verlo acá en cuanto esté listo.
      </p>
      <a class="en-construccion__volver" routerLink="/inicio">
        Volver al inicio
      </a>
    </section>
  `,
})
export class ModuloEnConstruccionComponent {
  /** Se pasa por `data` de la ruta, así una sola clase sirve a todos los módulos. */
  readonly modulo = input<string>('Este módulo');
}
