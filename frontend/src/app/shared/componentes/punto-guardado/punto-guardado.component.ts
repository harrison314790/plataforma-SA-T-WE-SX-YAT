import { Component, input } from '@angular/core';

/**
 * Punto de "sin guardar" (ver references/diseno-ui.md). Propio de este
 * proyecto por la conectividad intermitente: el profesor debe ver de un
 * vistazo qué celda quedó guardada y cuál no. Desaparece cuando el backend
 * confirma; si la conexión se cae, se queda visible hasta el reintento.
 */
@Component({
  selector: 'app-punto-guardado',
  standalone: true,
  templateUrl: './punto-guardado.component.html',
})
export class PuntoGuardadoComponent {
  pendiente = input.required<boolean>();
}
