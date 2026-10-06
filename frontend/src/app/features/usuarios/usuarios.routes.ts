import type { Routes } from '@angular/router';

/**
 * Una sola ruta, como Asignaciones: el formulario, la confirmación de
 * cuenta creada y el borrado son modales sobre el listado. El permiso
 * (`vista_admin_usuarios`) se declara en `app.routes.ts`.
 */
export const USUARIOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/gestion-usuarios/gestion-usuarios.component').then(
        (m) => m.GestionUsuariosComponent,
      ),
  },
];
