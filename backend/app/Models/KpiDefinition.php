<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KpiDefinition extends Model
{
    use HasUuids;

    protected $table = 'kpi_definitions';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'target' => 'float',
        ];
    }
}
