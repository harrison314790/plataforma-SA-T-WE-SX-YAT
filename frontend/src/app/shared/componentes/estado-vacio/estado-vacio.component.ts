import { Component, input, output } from '@angular/core';

/**
 * Estado "vacío" de las 5 vistas obligatorias (ver references/diseno-ui.md).
 * Es una invitación a actuar, no un texto gris -- por eso lleva textoAccion
 * opcional en vez de ser un simple mensaje.
 *
 * Ejemplo de uso (grupo de Matemáticas sin estudiantes matriculados):
 * <app-estado-vacio
 *   mensaje="Aún no hay estudiantes matriculados en este grupo"
 *   textoAccion="Matricular estudiante"
 *   (accion)="irAMatricular()"
 * />
 */
@Component({
  selector: 'app-estado-vacio',
  standalone: true,
  templateUrl: './estado-vacio.component.html',
})
export class EstadoVacioComponent {
  mensaje = input.required<string>();
  textoAccion = input<string>();
  accion = output<void>();
}
