/**
 * Resuelve req.usuario.rol y req.usuario.sedeId consultando la tabla
 * `usuarios` por auth.uid() -- nunca se acepta el rol si viene en el body
 * o en un header que manda el cliente. Va después de `autenticacion` y
 * antes de `requierePermiso`.
 */
export async function cargarRolUsuario(req, res, next) {
  const { data, error } = await req.supabase
    .from('usuarios')
    .select('rol_id, roles(nombre), sede_id')
    .eq('id', req.usuario.id)
    .single();

  if (error || !data) {
    return res.status(403).json({ error: 'Usuario sin perfil registrado' });
  }

  req.usuario.rol = data.roles.nombre;
  req.usuario.sedeId = data.sede_id;
  next();
}
