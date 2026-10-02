import type { Routes } from '@angular/router';

/** Una sola ruta: la lista de nudos con sus materias. El permiso va en `app.routes.ts`. */
export const NUDOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/gestion-nudos/gestion-nudos.component').then((m) => m.GestionNudosComponent),
  },
];
