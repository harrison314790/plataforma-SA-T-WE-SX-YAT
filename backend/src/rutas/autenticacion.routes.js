import { Router } from 'express';
import * as controladorAutenticacion from '../controladores/autenticacion.controlador.js';

const router = Router();

router.post('/login', controladorAutenticacion.login);

export default router;
