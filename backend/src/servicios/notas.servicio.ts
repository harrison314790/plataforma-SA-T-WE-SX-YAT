// TODO: lógica de negocio de notas -- ver esquema en
// backend/01-esquema-inicial_1.sql y políticas RLS en
// backend/02-politicas-rls.sql.
//
// La regla "no se registra fuera de plazo" ya la aplica RLS por sí sola
// (período con notas_habilitadas + fecha_limite_notas, o una excepción
// vigente en excepciones_plazo) -- no hace falta duplicarla acá. Lo que sí
// va en el service: reglas que necesiten leer datos para decidirse y que
// no sean solo "¿a quién le pertenece esta fila?" (eso es RLS), por
// ejemplo resolver el período activo para mostrarlo en la UI antes de
// intentar guardar.
//
// Patrón esperado (ver .claude/skills/sistema-academico/references/node-supabase.md), ya tipado:
// import type { SupabaseClient } from '@supabase/supabase-js';
// import type { Nota, NotaNueva, UsuarioAutenticado } from '../tipos/dominio.js';
// export async function registrarNota(supabase: SupabaseClient, usuario: UsuarioAutenticado, datos: NotaNueva): Promise<Nota> { ... }
// export async function listarNotas(supabase: SupabaseClient, usuario: UsuarioAutenticado): Promise<Nota[]> { ... }

export {};
