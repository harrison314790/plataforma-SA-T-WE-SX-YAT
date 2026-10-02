import type { Routes } from '@angular/router';

/**
 * Pantalla propia, NO dentro de Asignaciones: los porcentajes son del
 * grado (no de una asignación) y se configuran una vez al año.
 */
export const PORCENTAJES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/porcentajes-grado/porcentajes-grado.component').then(
        (m) => m.PorcentajesGradoComponent,
      ),
  },
];
