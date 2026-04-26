<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KpiRecord extends Model
{
    use HasUuids;

    protected $table = 'kpi_records';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'value' => 'float',
            'submitted_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function definition()
    {
        return $this->belongsTo(KpiDefinition::class, 'kpi_id');
    }
}
