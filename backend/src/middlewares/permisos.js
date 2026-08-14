/**
 * Capa 2 de seguridad. Verifica el mismo `codigo` que usa *appHasRole en
 * Angular contra la tabla `permisos`, con el JWT del usuario (no hace
 * falta service_role para leer configuración). Va después de
 * `cargarRolUsuario`. Ver .claude/skills/sistema-academico/references/permisos.md
 */
export function requierePermiso(codigo) {
  return async (req, res, next) => {
    const { data, error } = await req.supabase
      .from('permisos')
      .select('habilitado, roles!inner(nombre), recursos!inner(codigo)')
      .eq('recursos.codigo', codigo)
      .eq('roles.nombre', req.usuario.rol)
      .maybeSingle();

    if (error || !data?.habilitado) {
      return res.status(403).json({ error: 'No tiene permiso para esta acción' });
    }
    next();
  };
}
