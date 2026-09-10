// TODO: queries a Supabase para `notas` -- ver esquema en
// backend/01-esquema-inicial_1.sql y políticas RLS en
// backend/02-politicas-rls.sql (notas_profesor_inserta_dentro_de_plazo,
// notas_profesor_actualiza_dentro_de_plazo, etc.)
//
// Patrón esperado (ver .claude/skills/sistema-academico/references/node-supabase.md), ya tipado:
// import type { SupabaseClient } from '@supabase/supabase-js';
// import type { Nota, NotaNueva } from '../tipos/dominio.js';
//
// export async function crear(supabase: SupabaseClient, nota: NotaNueva, registradoPor: string): Promise<Nota> {
//   ... supabase.from('notas').insert({ estudiante_id, asignacion_id, valor, registrado_por: registradoPor }) ...
//   -- `registrado_por` es NOT NULL sin default: hay que mandarlo explícito.
//   -- Es `usuario.usuarioId` (el `usuarios.id` propio), NUNCA `usuario.id`
//   -- (que es el auth.uid() -- ver tipos/dominio.ts). La política RLS
//   -- valida aparte que la asignación sea del profesor autenticado.
// }
// export async function listarPorEstudiante(supabase: SupabaseClient, estudianteId: string): Promise<Nota[]> { ... }
// export async function listarPorAsignacion(supabase: SupabaseClient, asignacionId: string): Promise<Nota[]> { ... }

export {};
