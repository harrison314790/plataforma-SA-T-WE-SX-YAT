import { ErrorDeBaseDeDatos, ErrorDeNegocio } from './errores.js';

/**
 * Nunca reenvía err.message crudo de Supabase/Postgres al cliente -- puede
 * incluir nombres de columnas o fragmentos de la query. Ver
 * .claude/skills/sistema-academico/references/node-supabase.md
 */
export function manejarError(err, req, res) {
  if (err instanceof ErrorDeNegocio) {
    return res.status(422).json({ error: err.message });
  }
  if (err instanceof ErrorDeBaseDeDatos) {
    console.error('[db]', err.original);
    return res.status(500).json({ error: 'No se pudo completar la operación. Intenta de nuevo.' });
  }
  console.error('[error inesperado]', err);
  return res.status(500).json({ error: 'Error interno' });
}
