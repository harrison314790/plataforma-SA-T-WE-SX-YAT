<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Documento extends Model
{
    use HasUuids;

    protected $table = 'documentos';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['estudiante_id', 'tipo_documento', 'storage_path', 'subido_por'];

    public function estudiante(): BelongsTo
    {
        return $this->belongsTo(Estudiante::class, 'estudiante_id');
    }

    public function subidoPor(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'subido_por');
    }
}
