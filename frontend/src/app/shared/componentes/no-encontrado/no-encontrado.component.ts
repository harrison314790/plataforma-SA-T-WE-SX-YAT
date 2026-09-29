import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../icono/icono.component';

/**
 * URL que no corresponde a ninguna ruta. Distinto de "sin permiso": acá la
 * dirección no existe, no es que esté vedada -- y decirlo mal manda a la
 * persona a pedir un permiso que no le va a servir de nada.
 */
@Component({
  selector: 'app-no-encontrado',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    <section class="estado-pagina">
      <app-icono nombre="montanas" [tamano]="32" />
      <h1>Esa dirección no existe</h1>
      <p>Puede ser un enlace viejo o una dirección mal escrita.</p>
      <a class="estado-pagina__accion" routerLink="/inicio">Volver al inicio</a>
    </section>
  `,
})
export class NoEncontradoComponent {}
