import type { Routes } from '@angular/router';
import { autenticadoGuard } from './core/guards/autenticado.guard';
import { invitadoGuard } from './core/guards/invitado.guard';
import { tienePermisoGuard } from './core/guards/tiene-permiso.guard';

/**
 * Dos zonas, y la separación es intencional:
 *
 * · `/login` vive FUERA del shell -- no tiene navegación ni usuario que mostrar.
 * · Todo lo demás son hijas de `ShellComponent`, así que `autenticadoGuard` se
 *   declara UNA vez en el padre en lugar de repetirse por módulo. Un módulo
 *   nuevo que se cuelgue acá queda protegido sin que haya que acordarse.
 *
 * Cada módulo lleva además su `tienePermisoGuard` con el mismo `codigo` de
 * recurso que verifica Laravel (capa 2) y que respalda RLS (capa 3) -- las tres
 * capas o ninguna, ver references/permisos.md.
 *
 * LOS MÓDULOS SIN CONSTRUIR APUNTAN A `ModuloEnConstruccionComponent`, no a
 * nada: la configuración de la base ya los declara y el menú los conoce, así que
 * su URL tiene que responder algo honesto si alguien la escribe a mano. Al
 * construir uno, se cambia su `loadComponent` acá y se agrega su ruta a
 * `core/navegacion/modulos-construidos.ts` -- esos dos cambios juntos son lo que
 * lo activa en el menú y en el escritorio.
 */

const enConstruccion = () =>
  import('./shared/componentes/modulo-en-construccion/modulo-en-construccion.component').then(
    (m) => m.ModuloEnConstruccionComponent,
  );

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [invitadoGuard],
    title: 'Ingresar · Sistema Académico',
    loadChildren: () =>
      import('./features/autenticacion/autenticacion.routes').then((m) => m.AUTENTICACION_ROUTES),
  },

  {
    path: '',
    canActivate: [autenticadoGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'inicio',
        loadChildren: () => import('./features/inicio/inicio.routes').then((m) => m.INICIO_ROUTES),
      },

      {
        path: 'notas',
        canActivate: [tienePermisoGuard('vista_notas')],
        title: 'Notas · Sistema Académico',
        loadChildren: () => import('./features/notas/notas.routes').then((m) => m.NOTAS_ROUTES),
      },

      {
        path: 'asignaciones',
        canActivate: [tienePermisoGuard('vista_asignaciones')],
        title: 'Asignaciones · Sistema Académico',
        loadChildren: () =>
          import('./features/asignaciones/asignaciones.routes').then((m) => m.ASIGNACIONES_ROUTES),
      },

      {
        path: 'matriculas',
        canActivate: [tienePermisoGuard('vista_matriculas')],
        title: 'Matrículas · Sistema Académico',
        data: { modulo: 'Matrículas' },
        loadComponent: enConstruccion,
      },
      {
        path: 'asistencia',
        canActivate: [tienePermisoGuard('vista_asistencia')],
        title: 'Asistencia · Sistema Académico',
        data: { modulo: 'Asistencia' },
        loadComponent: enConstruccion,
      },
      {
        path: 'usuarios',
        canActivate: [tienePermisoGuard('vista_admin_usuarios')],
        title: 'Usuarios · Sistema Académico',
        data: { modulo: 'Usuarios' },
        loadComponent: enConstruccion,
      },
      {
        path: 'documentos',
        canActivate: [tienePermisoGuard('vista_documentos')],
        title: 'Documentos · Sistema Académico',
        data: { modulo: 'Documentos' },
        loadComponent: enConstruccion,
      },
      {
        path: 'reportes',
        canActivate: [tienePermisoGuard('vista_reportes')],
        title: 'Reportes · Sistema Académico',
        data: { modulo: 'Reportes' },
        loadComponent: enConstruccion,
      },
      {
        path: 'configuracion',
        canActivate: [tienePermisoGuard('vista_configuracion')],
        title: 'Roles y permisos · Sistema Académico',
        data: { modulo: 'Roles y permisos' },
        loadComponent: enConstruccion,
      },

      // Dentro del shell a propósito: quien cae acá tiene que poder irse a otra
      // parte sin usar el botón atrás del navegador.
      {
        path: 'sin-permiso',
        title: 'Sin permiso · Sistema Académico',
        loadComponent: () =>
          import('./shared/componentes/sin-permiso/sin-permiso.component').then((m) => m.SinPermisoComponent),
      },

      { path: '', pathMatch: 'full', redirectTo: 'inicio' },

      // El comodín también va adentro, por lo mismo: una URL mal escrita no
      // debería dejar a nadie en una pantalla sin navegación.
      {
        path: '**',
        title: 'Página no encontrada · Sistema Académico',
        loadComponent: () =>
          import('./shared/componentes/no-encontrado/no-encontrado.component').then(
            (m) => m.NoEncontradoComponent,
          ),
      },
    ],
  },
];
