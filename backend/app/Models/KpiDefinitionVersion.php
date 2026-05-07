<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KpiDefinitionVersion extends Model
{
    use HasUuids;

    protected $table = 'kpi_definition_versions';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'target' => 'float',
            'requested_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }
}
