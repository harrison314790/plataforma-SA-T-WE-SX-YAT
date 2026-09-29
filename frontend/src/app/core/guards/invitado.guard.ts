import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../servicios/auth.service';

/**
 * El inverso de `autenticadoGuard`: protege el login de quien YA entró.
 *
 * Sin esto, alguien con sesión abierta que escribe `/login` (o vuelve con el
 * botón atrás del navegador) ve el formulario de nuevo y queda con la impresión
 * de que se le cerró la sesión, cuando sigue perfectamente dentro.
 */
export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.estaAutenticado() ? router.parseUrl('/inicio') : true;
};
