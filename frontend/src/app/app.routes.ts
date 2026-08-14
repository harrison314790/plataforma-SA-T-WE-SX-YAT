import type { Routes } from '@angular/router';
import { autenticadoGuard } from './core/guards/autenticado.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./features/autenticacion/autenticacion.routes').then((m) => m.AUTENTICACION_ROUTES),
  },
  {
    path: 'notas',
    canActivate: [autenticadoGuard],
    loadChildren: () => import('./features/notas/notas.routes').then((m) => m.NOTAS_ROUTES),
  },
  {
    path: 'sin-permiso',
    loadComponent: () => import('./shared/componentes/sin-permiso/sin-permiso.component').then((m) => m.SinPermisoComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'notas' },
];
