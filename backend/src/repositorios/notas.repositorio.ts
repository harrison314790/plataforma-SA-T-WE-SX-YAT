// TODO: queries a Supabase para `notas` -- ver esquema y políticas RLS en
// .claude/skills/sistema-academico/references/base-datos.md
//
// Patrón esperado (ver references/node-supabase.md), ya tipado:
// import type { SupabaseClient } from '@supabase/supabase-js';
// import type { Nota, NotaNueva } from '../tipos/dominio.js';
// export async function crear(supabase: SupabaseClient, nota: NotaNueva): Promise<Nota> { ... supabase.from('notas').insert(...) ... }
// export async function listarPorEstudiante(supabase: SupabaseClient, estudianteId: string): Promise<Nota[]> { ... }

export {};
