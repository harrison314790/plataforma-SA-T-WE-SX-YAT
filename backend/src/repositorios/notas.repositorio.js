// TODO: queries a Supabase para `notas` -- ver esquema y políticas RLS en
// .claude/skills/sistema-academico/references/base-datos.md
//
// Patrón esperado (ver references/node-supabase.md):
// export async function crear(supabase, nota) { ... supabase.from('notas').insert(...) ... }
// export async function listarPorEstudiante(supabase, estudianteId) { ... }
