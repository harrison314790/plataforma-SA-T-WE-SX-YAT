import { Component } from '@angular/core';

/**
 * Estado "sin permiso" de las 5 vistas obligatorias. Distinto de "vacío":
 * el usuario no tiene una tabla vacía, tiene explícitamente acceso denegado.
 * Destino de tienePermisoGuard y de autenticadoGuard cuando el rol no alcanza.
 */
@Component({
  selector: 'app-sin-permiso',
  standalone: true,
  templateUrl: './sin-permiso.component.html',
})
export class SinPermisoComponent {}
