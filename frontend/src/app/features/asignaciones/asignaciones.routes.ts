import type { Routes } from '@angular/router';

/**
 * El módulo tiene una sola ruta: el listado. El formulario y el diálogo
 * de borrado son modales sobre esa misma pantalla, no rutas propias --
 * para cinco campos, abrir una pantalla aparte obliga a perder de vista
 * la tabla contra la que se está comparando.
 *
 * El permiso (`vista_asignaciones`) se declara en `app.routes.ts`, donde
 * están los de todos los módulos, para poder leer de un vistazo qué
 * protege cada uno.
 */
export const ASIGNACIONES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/tabla-asignaciones/tabla-asignaciones.component').then(
        (m) => m.TablaAsignacionesComponent,
      ),
  },
];
