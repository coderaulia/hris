<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeAssessmentHistory extends Model
{
    use HasUuids;

    protected $table = 'employee_assessment_history';
    protected $guarded = [];
    public $timestamps = false; // only has created_at

    protected function casts(): array
    {
        return [
            'percentage' => 'float',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }
}
