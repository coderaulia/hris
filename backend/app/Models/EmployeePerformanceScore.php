<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeePerformanceScore extends Model
{
    use HasUuids;

    protected $table = 'employee_performance_scores';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'total_score' => 'float',
            'detail' => 'array',
            'calculated_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }
}
