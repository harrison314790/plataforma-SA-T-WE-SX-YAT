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
    // Sin artículo: "El :attribute seleccionado" fallaba con los femeninos
    // ("El asignación seleccionado no existe").
    'exists' => 'La opción elegida en :attribute no existe.',
    'unique' => 'Ese :attribute ya está registrado.',
    'confirmed' => 'La confirmación de :attribute no coincide.',
    'date' => 'El campo :attribute no es una fecha válida.',
    'in' => 'La opción elegida en :attribute no es válida.',
    'not_in' => 'La opción elegida en :attribute no es válida.',

    // Reglas que los Form Requests ya usan y no tenían mensaje: sin ellas
    // salía el texto en inglés de Laravel ("The nudo pedagogico id field
    // must be present."). Ver AUDITORIA-2026-10-07.md, B1.
    'array' => 'El campo :attribute debe ser una lista.',
    'present' => 'Falta el campo :attribute.',
    'distinct' => 'El campo :attribute está repetido.',
    'decimal' => 'El campo :attribute admite como máximo :decimal decimales.',
    'gt' => [
        'numeric' => 'El campo :attribute debe ser mayor que :value.',
    ],
    'gte' => [
        'numeric' => 'El campo :attribute debe ser mayor o igual que :value.',
    ],
    'after' => 'El campo :attribute debe ser una fecha posterior a :date.',
    'after_or_equal' => 'El campo :attribute debe ser una fecha igual o posterior a :date.',
    'before' => 'El campo :attribute debe ser una fecha anterior a :date.',
    'date_format' => 'El campo :attribute no tiene el formato :format.',
    'accepted' => 'Hay que aceptar :attribute.',
    'prohibited' => 'El campo :attribute no se puede enviar aquí.',
    'required_if' => 'El campo :attribute es obligatorio cuando :other es :value.',
    'required_without' => 'El campo :attribute es obligatorio cuando no se envía :values.',
    'regex' => 'El campo :attribute no tiene un formato válido.',

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

        // Campos dentro de listas: Laravel busca primero el nombre con
        // comodín (notas.*.valor), así el mensaje dice "nota" y no
        // "notas.0.valor".
        'notas' => 'notas',
        'notas.*.valor' => 'nota',
        'notas.*.estudiante_id' => 'estudiante',
        'estudiante_ids' => 'estudiantes',
        'estudiante_ids.*' => 'estudiante',
        'nudo_pedagogico_id' => 'nudo',
        'nudos.*.nudo_id' => 'nudo',
        'nudos.*.pesos' => 'porcentajes',
        'nudos.*.pesos.*.asignatura_id' => 'materia',
        'nudos.*.pesos.*.peso' => 'porcentaje',
        'epocas.*.periodo_id' => 'época',
        'epocas.*.fecha_inicio' => 'fecha de inicio',
        'epocas.*.fecha_fin' => 'fecha de cierre',
        'fecha_limite' => 'fecha límite',
        'fecha_limite_notas' => 'fecha límite',
        'notas_habilitadas' => 'carga de notas',
        'valor_anterior' => 'valor anterior',
        'motivo' => 'motivo',
        'detalle' => 'detalle',
        'codigo' => 'código',
        'orden' => 'orden',
        'nombre' => 'nombre',
        'tipo' => 'tipo de cuenta',
        'parentesco' => 'parentesco',
        'telefono' => 'teléfono',
        'confirmo' => 'la confirmación',
    ],

];
