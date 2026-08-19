import type { NextFunction, Request, Response } from 'express';
import type { Rol } from '../tipos/dominio.js';

interface FilaUsuario {
  rol_id: number;
  roles: { nombre: Rol };
  sede_id: number | null;
}

/**
 * Resuelve req.usuario.rol y req.usuario.sedeId consultando la tabla
 * `usuarios` por auth.uid() -- nunca se acepta el rol si viene en el body
 * o en un header que manda el cliente. Va después de `autenticacion` y
 * antes de `requierePermiso`.
 */
export async function cargarRolUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { data, error } = await req.supabase
    .from('usuarios')
    .select('rol_id, roles(nombre), sede_id')
    .eq('id', req.usuario.id)
    .single<FilaUsuario>();

  if (error || !data) {
    res.status(403).json({ error: 'Usuario sin perfil registrado' });
    return;
  }

  req.usuario.rol = data.roles.nombre;
  req.usuario.sedeId = data.sede_id;
  next();
}
