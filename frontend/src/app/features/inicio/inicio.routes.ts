import type { Routes } from '@angular/router';

export const INICIO_ROUTES: Routes = [
  {
    path: '',
    title: 'Inicio · Sistema Académico',
    loadComponent: () => import('./pages/escritorio/escritorio.component').then((m) => m.EscritorioComponent),
  },
];
