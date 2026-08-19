import type { Routes } from '@angular/router';

export const NOTAS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/tabla-notas/tabla-notas.component').then((m) => m.TablaNotasComponent),
  },
];
