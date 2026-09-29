import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/servicios/auth.service';
import { IconoComponent } from '../icono/icono.component';

/**
 * Estado "sin permiso" de las cinco vistas obligatorias. Distinto de "vacío":
 * acá no hay una tabla sin filas, hay un acceso denegado explícito -- si se
 * mostrara como vacío, la persona intentaría cargar datos que nunca va a poder
 * ver.
 *
 * Dice con qué rol está entrando, que es el dato que le hace falta para pedir el
 * acceso correcto a la coordinación en vez de "no me deja entrar".
 *
 * Destino de `tienePermisoGuard`. El botón oculto o la ruta bloqueada son solo
 * capa 1: el endpoint detrás sigue protegido por Laravel y la tabla por RLS.
 */
@Component({
  selector: 'app-sin-permiso',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  templateUrl: './sin-permiso.component.html',
})
export class SinPermisoComponent {
  private readonly auth = inject(AuthService);
  protected readonly usuario = this.auth.usuario;
}
