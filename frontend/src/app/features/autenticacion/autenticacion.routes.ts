import type { Routes } from '@angular/router';

export const AUTENTICACION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
];
