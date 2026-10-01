<?php

/*
|--------------------------------------------------------------------------
| Mensajes de validación en español
|--------------------------------------------------------------------------
|
| Cierra un pendiente que contradecía la convención de "todo en español"
| del proyecto: con APP_LOCALE=es pero sin este archivo, Laravel caía al
| inglés y un profesor veía "The email field is required." en la pantalla
| de ingreso.
|
| NO es el archivo completo de Laravel (`php artisan lang:publish` trae
| ~90 reglas). Están solo las reglas que este backend usa de verdad, más
| las que va a usar el próximo módulo, por la misma disciplina de peso que
| rige el resto del proyecto: no servir lo que nadie lee. Al agregar una
| regla nueva en un Form Request, agregar su mensaje acá -- si falta,
| Laravel muestra la clave cruda de la regla, que es peor que el inglés.
|
| `:attribute` se reemplaza por el nombre del campo, tomado de la lista
| `attributes` del final. Sin esa lista diría "El campo email...", con
| ella dice "El campo correo...".
|
*/

return [

    'required' => 'El campo :attribute es obligatorio.',
    'email' => 'El campo :attribute debe ser un correo electrónico válido.',
    'string' => 'El campo :attribute debe ser texto.',
    'numeric' => 'El campo :attribute debe ser un número.',
    'integer' => 'El campo :attribute debe ser un número entero.',
    'boolean' => 'El campo :attribute debe ser verdadero o falso.',
    'uuid' => 'El campo :attribute no es un identificador válido.',
    'exists' => 'El :attribute seleccionado no existe.',
    'unique' => 'Ese :attribute ya está registrado.',
    'confirmed' => 'La confirmación de :attribute no coincide.',
    'date' => 'El campo :attribute no es una fecha válida.',
    'in' => 'El :attribute seleccionado no es válido.',

    'between' => [
        'numeric' => 'El campo :attribute debe estar entre :min y :max.',
        'string' => 'El campo :attribute debe tener entre :min y :max caracteres.',
        'array' => 'El campo :attribute debe tener entre :min y :max elementos.',
    ],

    'min' => [
        'numeric' => 'El campo :attribute no puede ser menor que :min.',
        'string' => 'El campo :attribute debe tener al menos :min caracteres.',
        'array' => 'El campo :attribute debe tener al menos :min elementos.',
    ],

    'max' => [
        'numeric' => 'El campo :attribute no puede ser mayor que :max.',
        'string' => 'El campo :attribute no puede tener más de :max caracteres.',
        'array' => 'El campo :attribute no puede tener más de :max elementos.',
    ],

    /*
    |--------------------------------------------------------------------------
    | Nombres de campo
    |--------------------------------------------------------------------------
    |
    | Los nombres que ve una persona, no los de la base. `valor` es "nota"
    | porque así la llama un profesor: "la nota debe estar entre 1 y 5" se
    | entiende, "el campo valor debe estar entre 1 y 5" no.
    |
    */

    'attributes' => [
        'email' => 'correo',
        'password' => 'contraseña',
        'valor' => 'nota',
        'estudiante_id' => 'estudiante',
        'asignacion_id' => 'asignación',
        'periodo_id' => 'período',
        'documento' => 'documento',
        'nombres' => 'nombres',
        'apellidos' => 'apellidos',
        'rol_id' => 'rol',
        'sede_id' => 'sede',

        // Módulo de Asignaciones. 'anio' se muestra como "año" (la
        // columna no lleva tilde para no depender del encoding de la
        // base, pero la persona lee español, no nombres de columna).
        'profesor_id' => 'profesor',
        'asignatura_id' => 'asignatura',
        'grado' => 'grado',
        'grupo' => 'grupo',
        'anio' => 'año',
        'activo' => 'estado',
    ],

];
