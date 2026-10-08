import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../../core/servicios/auth.service';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { RegistroNotasComponent } from '../registro-notas/registro-notas.component';
import { SeguimientoNotasComponent } from '../seguimiento-notas/seguimiento-notas.component';

/**
 * La puerta del módulo: dos pantallas, una por rol, en la misma ruta.
 *
 * Decide por PERMISO, no por rol (angular.md: Angular no bifurca por el
 * string del rol). `accion_seguimiento_notas` lo tiene coordinación;
 * `btn_registrar_nota` el profesor. Coordinación también tiene
 * `btn_registrar_nota` (podría cargar una nota en nombre de alguien), así
 * que el seguimiento se pregunta primero.
 *
 * Esto es capa 1: el endpoint de cada pantalla vuelve a exigir su código
 * en Laravel (`requiere.permiso`) y RLS recorta las filas.
 */
@Component({
  selector: 'app-notas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RegistroNotasComponent, SeguimientoNotasComponent, SinPermisoComponent],
  template: `
    @switch (pantalla()) {
      @case ('seguimiento') { <app-seguimiento-notas /> }
      @case ('registro') { <app-registro-notas /> }
      @default { <app-sin-permiso /> }
    }
  `,
})
export class NotasComponent {
  private readonly auth = inject(AuthService);

  protected readonly pantalla = computed<'seguimiento' | 'registro' | null>(() => {
    if (this.auth.tienePermiso('accion_seguimiento_notas')) return 'seguimiento';
    if (this.auth.tienePermiso('btn_registrar_nota')) return 'registro';
    return null;
  });
}
