import type { Routes } from '@angular/router';

/**
 * Una sola ruta, como Usuarios: el formulario, la confirmación del lote,
 * el retiro y el cambio de grupo son modales sobre la pantalla. El
 * permiso (`vista_matriculas`) se declara en `app.routes.ts`.
 */
export const MATRICULAS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/gestion-matriculas/gestion-matriculas.component').then(
        (m) => m.GestionMatriculasComponent,
      ),
  },
];
