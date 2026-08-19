import type { Request, Response } from 'express';
import { manejarError } from '../nucleo/manejarError.js';
import * as autenticacionServicio from '../servicios/autenticacion.servicio.js';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    return;
  }
  try {
    const resultado = await autenticacionServicio.iniciarSesion({ email, password });
    res.json(resultado);
  } catch (err) {
    manejarError(err, req, res);
  }
}
