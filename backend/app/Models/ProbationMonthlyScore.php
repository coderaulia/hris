<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProbationMonthlyScore extends Model
{
    use HasUuids;

    protected $table = 'probation_monthly_scores';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'work_performance_score' => 'float',
            'managing_task_score' => 'float',
            'attitude_score' => 'float',
            'attendance_deduction' => 'float',
            'monthly_total' => 'float',
        ];
    }
}
