import type { Routes } from '@angular/router';

/** Admin y estudiante usan la misma ruta; el modo lo decide el rol (ver BoletinesComponent). */
export const BOLETINES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/boletines/boletines.component').then((m) => m.BoletinesComponent),
  },
];
