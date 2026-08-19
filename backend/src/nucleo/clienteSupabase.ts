import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!; // NUNCA service_role aquí

/**
 * Un cliente por request, con el JWT del usuario reenviado -- así Postgres
 * conoce auth.uid() y aplica RLS como si el usuario le hubiera pegado
 * directo a la base. Ver .claude/skills/sistema-academico/references/node-supabase.md
 */
export function clienteSupabaseConJwt(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
