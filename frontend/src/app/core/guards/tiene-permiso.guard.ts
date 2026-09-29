import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../servicios/auth.service';

/**
 * Capa 1 (UX). Uso: `{ path: 'usuarios', canActivate: [tienePermisoGuard('vista_admin_usuarios')] }`
 *
 * El mismo `codigo` tiene que estar verificado en Laravel con
 * `requiere.permiso` y respaldado por RLS -- ver la regla de oro en
 * references/permisos.md. Un guard sin esas dos capas detrás no protege nada:
 * cualquiera con las dev tools lo salta.
 *
 * `super_admin` pasa siempre, sin caso especial acá: su mapa de permisos llega
 * con todos los recursos en `true` desde el backend (PermisoService), igual que
 * el bypass que ya tiene en RLS. Poner un `rol === 'super_admin'` en este
 * archivo sería una cuarta copia de esa regla, y la primera en desincronizarse.
 */
export function tienePermisoGuard(codigo: string): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.tienePermiso(codigo) ? true : router.parseUrl('/sin-permiso');
  };
}
