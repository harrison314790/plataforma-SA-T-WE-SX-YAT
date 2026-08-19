import type { Request, Response } from 'express';
import { ErrorDeBaseDeDatos, ErrorDeNegocio } from './errores.js';

/**
 * Nunca reenvía err.message crudo de Supabase/Postgres al cliente -- puede
 * incluir nombres de columnas o fragmentos de la query. Ver
 * .claude/skills/sistema-academico/references/node-supabase.md
 */
export function manejarError(err: unknown, req: Request, res: Response): void {
  if (err instanceof ErrorDeNegocio) {
    res.status(422).json({ error: err.message });
    return;
  }
  if (err instanceof ErrorDeBaseDeDatos) {
    console.error('[db]', err.original);
    res.status(500).json({ error: 'No se pudo completar la operación. Intenta de nuevo.' });
    return;
  }
  console.error('[error inesperado]', err);
  res.status(500).json({ error: 'Error interno' });
}
