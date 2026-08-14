import { createClient } from '@supabase/supabase-js';

/**
 * SOLO para operaciones administrativas puntuales (crear usuario en Auth,
 * asignar rol inicial), y solo dentro de rutas ya protegidas por
 * requierePermiso('accion_...admin...'). Nunca para leer/escribir notas.
 * Ver .claude/skills/sistema-academico/references/node-supabase.md
 */
export const clienteSupabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
