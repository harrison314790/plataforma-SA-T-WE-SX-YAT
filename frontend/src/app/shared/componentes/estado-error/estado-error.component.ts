import { Component, input, output } from '@angular/core';

/**
 * Estado "error" de las 5 vistas obligatorias. Mensaje concreto + acción de
 * recuperación -- nunca el error crudo del backend (ver references/node-supabase.md).
 */
@Component({
  selector: 'app-estado-error',
  standalone: true,
  templateUrl: './estado-error.component.html',
})
export class EstadoErrorComponent {
  mensaje = input<string>('No se pudo completar la operación. Intenta de nuevo.');
  reintentar = output<void>();
}
