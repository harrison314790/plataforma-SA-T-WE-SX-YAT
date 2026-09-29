import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/servicios/auth.service';
import { ConexionService } from '../../core/servicios/conexion.service';
import { NavegacionService } from '../../core/servicios/navegacion.service';
import { IconoComponent } from '../../shared/componentes/icono/icono.component';
import { BarraLateralComponent } from '../barra-lateral/barra-lateral.component';
import { BarraSuperiorComponent } from '../barra-superior/barra-superior.component';

/**
 * El marco de toda la aplicación autenticada: navegación a la izquierda,
 * identidad y período arriba, y el módulo en curso a la derecha. Es un
 * componente de ruta con hijos (`app.routes.ts`), no un wrapper suelto: así
 * las rutas de los módulos son hijas suyas y heredan el guard de sesión en un
 * solo lugar, en vez de repetirlo módulo por módulo.
 *
 * El login queda deliberadamente FUERA de este shell -- no tiene navegación ni
 * usuario que mostrar.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, BarraLateralComponent, BarraSuperiorComponent, IconoComponent],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  protected readonly navegacion = inject(NavegacionService);
  protected readonly conexion = inject(ConexionService);

  constructor() {
    // La sesión ya se restauró de `sessionStorage` de forma sincrónica (si no,
    // el guard no habría dejado llegar hasta acá). Esto confirma contra el
    // backend que el token sigue vivo y trae permisos y módulos frescos, por
    // si super_admin cambió algo mientras la pestaña estaba abierta. No se
    // espera el resultado: la pantalla ya puede pintarse con lo guardado, y un
    // 401 lo resuelve sesionExpiradaInterceptor.
    void this.auth.revalidarSesion();
  }
}
