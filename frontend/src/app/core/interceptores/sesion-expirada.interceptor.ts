import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../servicios/auth.service';

/**
 * Cierra la sesión y manda al login cuando el backend responde 401.
 *
 * Es lo que reemplaza al refresco automático de token que tenía el diseño
 * anterior: Sanctum emite un token opaco sin vencimiento conocido, así que no
 * hay cuándo refrescar preventivamente. Cuando el token deja de servir
 * (revocado desde otro equipo, o expirado si algún día se configura
 * expiración) el 401 es la primera y única señal, y lo correcto es reaccionar
 * a ella en un solo lugar en vez de en cada componente que hace una petición.
 *
 * `?regresarA=` conserva a dónde iba la persona: un profesor al que se le
 * venció la sesión a mitad de una digitación vuelve a la tabla de notas
 * después de entrar, no al escritorio.
 */
export const sesionExpiradaInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      const esSesionInvalida = error instanceof HttpErrorResponse && error.status === 401;

      // El propio login responde 422 ante credenciales malas, nunca 401, así
      // que no hay que excluirlo. Sí se excluye el cierre de sesión: si su
      // token ya no servía, cerrar sesión otra vez no aporta nada y el
      // `navigate` competiría con el que ya hizo el componente.
      const esCierreDeSesion = req.url.endsWith('/autenticacion/cerrar-sesion');

      if (esSesionInvalida && !esCierreDeSesion) {
        auth.descartarSesionLocal();
        void router.navigate(['/login'], {
          queryParams: { regresarA: router.url === '/login' ? null : router.url },
        });
      }

      return throwError(() => error);
    }),
  );
};
