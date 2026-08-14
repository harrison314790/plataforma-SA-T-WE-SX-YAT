import { clienteSupabaseConJwt } from '../nucleo/clienteSupabase.js';

/** Extrae y valida el JWT. Arma req.supabase (cliente ya autenticado) y req.usuario. */
export async function autenticacion(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const jwt = header.slice('Bearer '.length);
  const supabase = clienteSupabaseConJwt(jwt);

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  req.supabase = supabase;
  req.usuario = { id: data.user.id, email: data.user.email };
  next();
}
