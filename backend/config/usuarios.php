<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Dominio del email sugerido para estudiantes
    |--------------------------------------------------------------------------
    |
    | Al crear la cuenta de un estudiante, el formulario sugiere
    | `<documento>@<este dominio>` (editable). Vive en configuración y no en
    | el código de Angular porque cambia por instalación: el día que esto se
    | instale en otro colegio, su dominio es otro y no debería hacer falta
    | recompilar el frontend para cambiarlo.
    |
    | Es solo una SUGERENCIA de texto: el backend no exige que el email del
    | estudiante tenga este dominio.
    |
    */

    'dominio_correo_estudiantes' => env('DOMINIO_CORREO_ESTUDIANTES', 'estudiantes.colegio.edu.co'),

];
