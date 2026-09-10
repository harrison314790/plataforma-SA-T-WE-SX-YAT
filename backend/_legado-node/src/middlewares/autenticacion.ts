import type { NextFunction, Request, Response } from 'express';
import { clienteSupabaseConJwt } from '../nucleo/clienteSupabase.js';
import type { UsuarioAutenticado } from '../tipos/dominio.js';

/** Extrae y valida el JWT. Arma req.supabase (cliente ya autenticado) y req.usuario. */
export async function autenticacion(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const jwt = header.slice('Bearer '.length);
  const supabase = clienteSupabaseConJwt(jwt);

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }

  req.supabase = supabase;
  // rol/sedeId los completa `cargarRolUsuario`, el middleware siguiente en la cadena.
  req.usuario = { id: data.user.id, email: data.user.email } as UsuarioAutenticado;
  next();
}
