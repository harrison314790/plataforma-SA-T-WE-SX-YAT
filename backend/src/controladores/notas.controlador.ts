import type { Request, Response } from 'express';

// TODO: implementar según el patrón controller -> service -> repository
// (ver .claude/skills/sistema-academico/references/node-supabase.md).
// Los 501 de abajo son solo para que las rutas ya cableadas no truenen mientras se construye.

export async function listar(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: 'No implementado' });
}

export async function registrar(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: 'No implementado' });
}
