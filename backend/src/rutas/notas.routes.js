import { Router } from 'express';
import * as controladorNotas from '../controladores/notas.controlador.js';
import { autenticacion } from '../middlewares/autenticacion.js';
import { cargarRolUsuario } from '../middlewares/cargarRolUsuario.js';
import { requierePermiso } from '../middlewares/permisos.js';

// TODO: antes de habilitar esto de verdad, registrar los recursos
// 'vista_notas_estudiante' y 'btn_registrar_nota' en la tabla `recursos`
// (ver references/permisos.md) y completar controlador/servicio/repositorio.

const router = Router();

router.get('/', autenticacion, cargarRolUsuario, controladorNotas.listar);
router.post('/', autenticacion, cargarRolUsuario, requierePermiso('btn_registrar_nota'), controladorNotas.registrar);

export default router;
