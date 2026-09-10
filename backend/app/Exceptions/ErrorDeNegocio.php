<?php

namespace App\Exceptions;

use Exception;

/**
 * Error de negocio: el mensaje ya está pensado para mostrarse al usuario
 * tal cual (p. ej. "No hay un período académico activo"). Nunca envolver
 * acá un error de Postgres/Eloquent -- para eso está el manejo genérico
 * en bootstrap/app.php, que jamás expone el mensaje crudo de la base.
 * Ver .claude/skills/sistema-academico/references/laravel-postgres.md
 */
class ErrorDeNegocio extends Exception
{
}
