import type { NextFunction, Request, Response } from 'express';

interface FilaPermiso {
  habilitado: boolean;
  roles: { nombre: string };
  recursos: { codigo: string };
}

/**
 * Capa 2 de seguridad. Verifica el mismo `codigo` que usa *appHasRole en
 * Angular contra la tabla `permisos`, con el JWT del usuario (no hace
 * falta service_role para leer configuración). Va después de
 * `cargarRolUsuario`. Ver .claude/skills/sistema-academico/references/permisos.md
 */
export function requierePermiso(codigo: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { data, error } = await req.supabase
      .from('permisos')
      .select('habilitado, roles!inner(nombre), recursos!inner(codigo)')
      .eq('recursos.codigo', codigo)
      .eq('roles.nombre', req.usuario.rol)
      .maybeSingle<FilaPermiso>();

    if (error || !data?.habilitado) {
      res.status(403).json({ error: 'No tiene permiso para esta acción' });
      return;
    }
    next();
  };
}
