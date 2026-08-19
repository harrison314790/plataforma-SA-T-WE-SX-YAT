// TODO: lógica de negocio de notas (p. ej. no registrar fuera del periodo
// activo) -- ver .claude/skills/sistema-academico/references/node-supabase.md
// y .claude/skills/sistema-academico/references/base-datos.md
//
// Patrón esperado (ver references/node-supabase.md), ya tipado:
// import type { SupabaseClient } from '@supabase/supabase-js';
// import type { Nota, NotaNueva } from '../tipos/dominio.js';
// export async function registrarNota(supabase: SupabaseClient, profesorId: string, datos: NotaNueva): Promise<Nota> { ... }

export {};
