import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../servicios/auth.service';

/**
 * Capa 1 (UX): evita navegar a una vista sin sesión. Laravel (capa 2) y RLS
 * (capa 3) protegen el dato igual -- nunca es "ya lo validé en el guard, me
 * salto el check del backend".
 *
 * Conserva a dónde iba la persona en `regresarA`, para devolverla ahí después
 * de entrar en vez de dejarla siempre en el escritorio. Le importa a un profesor
 * al que se le venció la sesión a mitad de una digitación de notas.
 */
export const autenticadoGuard: CanActivateFn = (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estaAutenticado()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { regresarA: estado.url === '/' ? null : estado.url },
  });
};
