import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../servicios/auth.service';

/**
 * Adjunta el token de Sanctum a cada petición a la API propia.
 *
 * Reemplaza a `jwt.interceptor.ts`: el nombre viejo era incorrecto de raíz.
 * Sanctum no emite un JWT sino un token OPACO ('19|R5Uem...') que no se puede
 * decodificar en el cliente; llamarlo JWT invitaba a intentar leerle un
 * `exp` que no tiene.
 *
 * El filtro por `environment.apiUrl` no es cosmético: sin él, el encabezado
 * `Authorization` viajaría a CUALQUIER host al que la app le pida algo, y el
 * token de un profesor terminaría en un servidor de terceros.
 */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.tokenActual();

  if (token === null || !req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
        // Sin esto, Laravel decide por el `Accept` del navegador y una ruta
        // protegida responde con un redirect a la página de login web en vez
        // del JSON `{ error: { codigo: 'NO_AUTENTICADO' } }` que el frontend
        // sabe manejar.
        Accept: 'application/json',
      },
    }),
  );
};
