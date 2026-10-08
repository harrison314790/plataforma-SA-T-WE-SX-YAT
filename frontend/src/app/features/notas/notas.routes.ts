import type { Routes } from '@angular/router';

/**
 * Una sola ruta para los dos roles: `NotasComponent` decide si muestra el
 * "Registro de notas" (profesor) o el "Seguimiento de notas"
 * (coordinación) según el mapa de permisos -- nunca por el string del rol.
 * Los modales y el panel lateral van sobre la pantalla. El permiso
 * (`vista_notas`) se declara en `app.routes.ts`.
 */
export const NOTAS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/notas/notas.component').then((m) => m.NotasComponent),
  },
];
