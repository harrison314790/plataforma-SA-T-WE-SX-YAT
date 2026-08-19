import type { NextFunction, Request, Response } from 'express';
import type { Rol } from '../tipos/dominio.js';

interface FilaUsuario {
  id: string;
  rol_id: string;
  roles: { nombre: Rol };
  sede_id: string | null;
}

/**
 * Resuelve el perfil de la app a partir del auth.uid() del JWT. En el
 * esquema real (ver backend/01-esquema-inicial_1.sql) `usuarios.id` es un
 * uuid propio, DISTINTO de `usuarios.auth_id` (la columna que enlaza con
 * Supabase Auth) -- por eso se filtra por `auth_id`, no por `id`, y el
 * resultado completa `req.usuario.usuarioId` además de `rol`/`sedeId`.
 * Nunca se acepta el rol si viene en el body o en un header que manda el
 * cliente. Va después de `autenticacion` y antes de `requierePermiso`.
 */
export async function cargarRolUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { data, error } = await req.supabase
    .from('usuarios')
    .select('id, rol_id, roles(nombre), sede_id')
    .eq('auth_id', req.usuario.id)
    .single<FilaUsuario>();

  if (error || !data) {
    res.status(403).json({ error: 'Usuario sin perfil registrado' });
    return;
  }

  req.usuario.usuarioId = data.id;
  req.usuario.rol = data.roles.nombre;
  req.usuario.sedeId = data.sede_id;
  next();
}
