import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../servicios/auth.service';

/**
 * Capa 1 (UX). Uso: { path: 'admin/usuarios', canActivate: [tienePermisoGuard('vista_admin_usuarios')] }
 * El mismo `codigo` debe estar verificado en Node (requierePermiso) -- ver references/permisos.md.
 */
export function tienePermisoGuard(codigo: string): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.tienePermiso(codigo) ? true : router.parseUrl('/sin-permiso');
  };
}
