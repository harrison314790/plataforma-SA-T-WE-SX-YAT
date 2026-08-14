import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../servicios/auth.service';

/** Adjunta el JWT del usuario a cada request hacia /api. Node lo reenvía a Supabase (ver references/node-supabase.md). */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const jwt = auth.jwtActual();
  if (!jwt || !req.url.startsWith('/api')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${jwt}` } }));
};
