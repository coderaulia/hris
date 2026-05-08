<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeKpiTargetVersion extends Model
{
    use HasUuids;

    protected $table = 'employee_kpi_target_versions';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'target_value' => 'float',
            'requested_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }
}
