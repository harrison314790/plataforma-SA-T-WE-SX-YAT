import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsuarioAutenticado } from './dominio.js';

/**
 * Le agrega a `Request` de Express las dos propiedades que arma el
 * middleware `autenticacion`: el cliente de Supabase ya autenticado con el
 * JWT del usuario, y el usuario mismo. Ver
 * .claude/skills/sistema-academico/references/node-supabase.md
 */
declare global {
  namespace Express {
    interface Request {
      supabase: SupabaseClient;
      usuario: UsuarioAutenticado;
    }
  }
}
