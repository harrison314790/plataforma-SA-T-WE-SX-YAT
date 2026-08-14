import { manejarError } from '../nucleo/manejarError.js';
import * as autenticacionServicio from '../servicios/autenticacion.servicio.js';

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
  }
  try {
    const resultado = await autenticacionServicio.iniciarSesion({ email, password });
    res.json(resultado);
  } catch (err) {
    manejarError(err, req, res);
  }
}
