import { createClient, type Session, type User } from '@supabase/supabase-js';
import { clienteSupabaseConJwt } from '../nucleo/clienteSupabase.js';
import { ErrorDeBaseDeDatos, ErrorDeNegocio } from '../nucleo/errores.js';
import type { RespuestaLogin } from '../tipos/dominio.js';

interface Credenciales {
  email: string;
  password: string;
}

interface FilaPerfil {
  rol_id: string;
  roles: { nombre: RespuestaLogin['rol'] };
}

interface FilaPermiso {
  habilitado: boolean;
  recursos: { codigo: string };
}

/**
 * Antes de autenticar (o de refrescar con un refresh_token) no hay JWT
 * propio que reenviar, así que este es el único lugar del backend donde
 * se usa un cliente "público" (anon key, sin sesión). Ver
 * .claude/skills/sistema-academico/references/node-supabase.md
 */
function clientePublico() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A partir de una sesión ya válida de Supabase Auth (recién iniciada o
 * recién refrescada), arma la respuesta completa: perfil + mapa de
 * permisos. Comparte esta lógica entre `iniciarSesion` y
 * `refrescarSesion` para no duplicar la consulta a `usuarios`/`permisos`.
 */
async function construirRespuesta(session: Session, user: User): Promise<RespuestaLogin> {
  const jwt = session.access_token;
  const supabase = clienteSupabaseConJwt(jwt);

  // usuarios.id (uuid propio) es DISTINTO de usuarios.auth_id (el que
  // enlaza con Supabase Auth) -- ver tipos/dominio.ts y base-datos.md.
  const { data: perfil, error: errorPerfil } = await supabase
    .from('usuarios')
    .select('rol_id, roles(nombre)')
    .eq('auth_id', user.id)
    .single<FilaPerfil>();
  if (errorPerfil || !perfil) {
    throw new ErrorDeNegocio('Usuario sin perfil registrado. Contacta al administrador.');
  }

  const { data: filasPermisos, error: errorPermisos } = await supabase
    .from('permisos')
    .select('habilitado, recursos(codigo)')
    .eq('rol_id', perfil.rol_id)
    .returns<FilaPermiso[]>();
  if (errorPermisos) throw new ErrorDeBaseDeDatos(errorPermisos);

  const permisos = Object.fromEntries((filasPermisos ?? []).map((p) => [p.recursos.codigo, p.habilitado]));

  const expiraEnSegundos = session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in;

  return {
    jwt,
    refreshToken: session.refresh_token,
    expiraEn: new Date(expiraEnSegundos * 1000).toISOString(),
    rol: perfil.roles.nombre,
    permisos,
  };
}

export async function iniciarSesion({ email, password }: Credenciales): Promise<RespuestaLogin> {
  const { data: sesion, error: errorLogin } = await clientePublico().auth.signInWithPassword({ email, password });
  if (errorLogin || !sesion.session || !sesion.user) {
    throw new ErrorDeNegocio('Correo o contraseña incorrectos');
  }
  return construirRespuesta(sesion.session, sesion.user);
}

/**
 * Cambia el refresh_token por un access_token nuevo (y un refresh_token
 * rotado, porque Supabase invalida el anterior al usarlo). Angular llama
 * esto antes de que el JWT expire -- ver AuthService.programarRefresco.
 */
export async function refrescarSesion(refreshToken: string): Promise<RespuestaLogin> {
  const { data: sesion, error } = await clientePublico().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !sesion.session || !sesion.user) {
    throw new ErrorDeNegocio('Sesión expirada. Vuelve a iniciar sesión.');
  }
  return construirRespuesta(sesion.session, sesion.user);
}
