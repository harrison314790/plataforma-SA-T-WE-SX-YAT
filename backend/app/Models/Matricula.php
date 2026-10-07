<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una matrícula = un estudiante en una sede+grado+grupo durante un AÑO
 * (20-matriculas-por-anio.sql; antes era una fila por período).
 *
 * `matriculado_por` no está en `$fillable` a propósito: lo llena la base
 * con `fn_usuario_id_actual()`, la identidad que Laravel fija por sesión.
 * La auditoría no depende de que el código se acuerde de mandarla.
 */
class Matricula extends Model
{
    use HasUuids;

    public const MOTIVOS_RETIRO = ['Traslado a otra institución', 'Deserción', 'Otro'];

    protected $table = 'matriculas';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'estudiante_id', 'sede_id', 'grado', 'grupo', 'anio', 'estado', 'fecha_matricula',
        'acudiente_id', 'motivo_retiro', 'detalle_retiro', 'fecha_retiro', 'retirado_por',
    ];

    protected function casts(): array
    {
        return [
            'grado' => 'integer',
            'anio' => 'integer',
            'sede_id' => 'integer',
            'fecha_matricula' => 'date:Y-m-d',
            'fecha_retiro' => 'date:Y-m-d',
        ];
    }

    public function estudiante(): BelongsTo
    {
        return $this->belongsTo(Estudiante::class, 'estudiante_id');
    }

    public function sede(): BelongsTo
    {
        return $this->belongsTo(Sede::class, 'sede_id');
    }

    public function acudiente(): BelongsTo
    {
        return $this->belongsTo(Acudiente::class, 'acudiente_id');
    }
}
