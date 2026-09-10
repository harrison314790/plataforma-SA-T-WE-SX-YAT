import { Router } from 'express';
import autenticacionRoutes from './autenticacion.routes.js';
import notasRoutes from './notas.routes.js';

const router = Router();

router.use('/autenticacion', autenticacionRoutes);
router.use('/notas', notasRoutes);

export default router;
