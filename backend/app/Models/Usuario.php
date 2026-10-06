<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * `usuarios.id` ES la identidad completa -- no hay tabla auth externa que
 * traducir (a diferencia del diseño anterior con Supabase Auth). Es el
 * modelo autenticable de Sanctum: `createToken()`/`currentAccessToken()`
 * vienen de HasApiTokens. Ver
 * .claude/skills/sistema-academico/references/laravel-postgres.md
 */
class Usuario extends Authenticatable
{
    use HasApiTokens, HasUuids;

    protected $table = 'usuarios';

    public $incrementing = false;

    protected $keyType = 'string';

    // Solo created_at (default now() en Postgres) -- ver nota en Sede.
    public $timestamps = false;

    protected $fillable = [
        'email', 'password_hash', 'rol_id', 'sede_id',
        'nombres', 'apellidos', 'documento', 'activo',
    ];

    // NUNCA debe viajar en una respuesta JSON -- ver la decisión no
    // negociable sobre autenticación en SKILL.md.
    protected $hidden = ['password_hash'];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    // Sanctum/Auth internamente esperan un atributo "password" -- lo
    // mapeamos al nombre real de la columna sin duplicar el dato.
    public function getAuthPassword(): string
    {
        return $this->password_hash;
    }

    public function rol(): BelongsTo
    {
        return $this->belongsTo(Rol::class, 'rol_id');
    }

    public function sede(): BelongsTo
    {
        return $this->belongsTo(Sede::class, 'sede_id');
    }

    public function estudiante(): HasOne
    {
        return $this->hasOne(Estudiante::class, 'usuario_id');
    }

    public function profesor(): HasOne
    {
        return $this->hasOne(Profesor::class, 'usuario_id');
    }

    public function notasRegistradas(): HasMany
    {
        return $this->hasMany(Nota::class, 'registrado_por');
    }

    public function documentosSubidos(): HasMany
    {
        return $this->hasMany(Documento::class, 'subido_por');
    }

    /**
     * ¿Ya hizo algo como profesor/estudiante? Profesor: tiene
     * asignaciones. Estudiante: tiene matrículas. Es lo que pinta la
     * etiqueta "Sin asignaciones/matrícula todavía" del módulo Usuarios.
     *
     * Lee los conteos que carga UsuarioService::consulta() -- sin ellos,
     * devuelve false para todos.
     */
    public function tieneVinculoAcademico(): bool
    {
        return $this->rol?->nombre === 'profesor'
            ? ($this->profesor?->asignaciones_count ?? 0) > 0
            : ($this->estudiante?->matriculas_count ?? 0) > 0;
    }

    /**
     * ¿Hay alguna fila que apunte a esta cuenta? Si la hay, Postgres no la
     * deja borrar (las FK no tienen `on delete cascade` a propósito) y lo
     * que corresponde es desactivarla. Mismos conteos que el método de
     * arriba.
     */
    public function tieneDatosAsociados(): bool
    {
        return $this->tieneVinculoAcademico()
            || (
                ($this->profesor?->excepciones_plazo_count ?? 0)
                + ($this->estudiante?->notas_count ?? 0)
                + ($this->estudiante?->documentos_count ?? 0)
                + ($this->estudiante?->acudientes_count ?? 0)
                + ($this->notas_registradas_count ?? 0)
                + ($this->documentos_subidos_count ?? 0)
            ) > 0;
    }
}
