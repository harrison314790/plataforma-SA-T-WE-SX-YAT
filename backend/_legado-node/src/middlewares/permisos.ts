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
    // super_admin pasa cualquier `codigo` sin consultar la tabla --
    // mismo criterio que RLS: TODAS las políticas de super_admin en
    // 04-super-admin.sql son `for all using (fn_es_super_admin())` sin
    // excepción, un bypass total. Sería inconsistente que acá dependiera
    // de que alguien se acuerde de sembrarle una fila en `permisos` por
    // cada `codigo` nuevo -- en la base nunca hace falta.
    if (req.usuario.rol === 'super_admin') {
      next();
      return;
    }

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

/**
 * Capa 2 explícita para operaciones exclusivas de super_admin: gestionar
 * `recursos`/`permisos`/`roles`, o los casos de `usuarios` donde el
 * objetivo ya es o pasaría a ser super_admin. Es "cinturón y tirantes"
 * sobre lo que ya bloquea RLS (`fn_es_super_admin()`) -- sin este check,
 * un intento de un `admin` normal no fallaría por falta de permiso claro,
 * sino con el error crudo que devuelva Postgres al chocar con la
 * política. Hoy no hay ningún endpoint que la use todavía (no existe el
 * módulo de `usuarios`/`recursos`/`permisos` en el backend) -- queda
 * lista para cuando se construya. Ver
 * .claude/skills/sistema-academico/references/permisos.md
 */
export function requiereSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.usuario.rol !== 'super_admin') {
    res.status(403).json({ error: 'Esta acción es exclusiva de super administrador' });
    return;
  }
  next();
}
