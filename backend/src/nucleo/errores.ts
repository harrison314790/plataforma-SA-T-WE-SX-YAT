import type { PostgrestError } from '@supabase/supabase-js';

/** Error de negocio: el mensaje ya está pensado para mostrarse al usuario tal cual. */
export class ErrorDeNegocio extends Error {}

/** Envuelve un error de Supabase/Postgres. El detalle original nunca sale del servidor. */
export class ErrorDeBaseDeDatos extends Error {
  readonly original: PostgrestError;

  constructor(original: PostgrestError) {
    super('Error de base de datos');
    this.original = original;
  }
}
