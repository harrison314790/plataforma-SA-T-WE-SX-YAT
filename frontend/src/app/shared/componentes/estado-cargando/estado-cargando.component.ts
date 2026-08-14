import { Component, input } from '@angular/core';

/**
 * Estado "cargando" de las 5 vistas obligatorias. Skeleton de filas, no un
 * spinner centrado que tape la tabla -- el profesor debe ver que la
 * estructura de columnas ya está ahí mientras cargan los datos.
 */
@Component({
  selector: 'app-estado-cargando',
  standalone: true,
  templateUrl: './estado-cargando.component.html',
})
export class EstadoCargandoComponent {
  filas = input(5);

  filasArray(): number[] {
    return Array.from({ length: this.filas() });
  }
}
