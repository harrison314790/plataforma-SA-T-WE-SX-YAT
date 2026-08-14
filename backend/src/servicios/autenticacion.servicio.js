import { createClient } from '@supabase/supabase-js';
import { clienteSupabaseConJwt } from '../nucleo/clienteSupabase.js';
import { ErrorDeBaseDeDatos, ErrorDeNegocio } from '../nucleo/errores.js';

/**
 * Antes de autenticar no hay JWT que reenviar, así que este es el único
 * lugar del backend donde se usa un cliente "público" (anon key, sin
 * sesión). Ver .claude/skills/sistema-academico/references/node-supabase.md
 */
export async function iniciarSesion({ email, password }) {
  const clientePublico = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sesion, error: errorLogin } = await clientePublico.auth.signInWithPassword({ email, password });
  if (errorLogin || !sesion.session) {
    throw new ErrorDeNegocio('Correo o contraseña incorrectos');
  }

  const jwt = sesion.session.access_token;
  const supabase = clienteSupabaseConJwt(jwt);

  const { data: perfil, error: errorPerfil } = await supabase
    .from('usuarios')
    .select('rol_id, roles(nombre)')
    .eq('id', sesion.user.id)
    .single();
  if (errorPerfil || !perfil) {
    throw new ErrorDeNegocio('Usuario sin perfil registrado. Contacta al administrador.');
  }

  const { data: filasPermisos, error: errorPermisos } = await supabase
    .from('permisos')
    .select('habilitado, recursos(codigo)')
    .eq('rol_id', perfil.rol_id);
  if (errorPermisos) throw new ErrorDeBaseDeDatos(errorPermisos);

  const permisos = Object.fromEntries(filasPermisos.map((p) => [p.recursos.codigo, p.habilitado]));

  return { jwt, rol: perfil.roles.nombre, permisos };
}
