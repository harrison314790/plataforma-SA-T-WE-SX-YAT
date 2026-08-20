import { Router } from 'express';
import * as controladorAutenticacion from '../controladores/autenticacion.controlador.js';

const router = Router();

router.post('/login', controladorAutenticacion.login);
router.post('/refrescar', controladorAutenticacion.refrescar);

export default router;
