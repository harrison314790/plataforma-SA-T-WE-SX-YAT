<?php

use Illuminate\Support\Facades\Schedule;

/*
 * Tareas programadas. En el servidor necesitan UNA línea en el cron:
 *   * * * * * cd /var/www/sistema/backend && php artisan schedule:run >> /dev/null 2>&1
 * (ver DESPLIEGUE.md).
 *
 * Tokens vencidos (12 h, config/sanctum.php): se borran una vez al día
 * para que `personal_access_tokens` no crezca sin límite. 24 h de margen
 * para no borrar uno que venció hace minutos y que alguien todavía está
 * usando (recibe un 401 limpio y vuelve a entrar).
 */
Schedule::command('sanctum:prune-expired --hours=24')->daily();
