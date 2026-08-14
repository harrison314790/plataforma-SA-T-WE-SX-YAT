import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../servicios/auth.service';

/** Capa 1 (UX): evita navegar a una vista si no hay sesión. Node (capa 2) y RLS (capa 3) protegen el dato igual. */
export const autenticadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.estaAutenticado() ? true : router.parseUrl('/login');
};
