<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeAssessment extends Model
{
    use HasUuids;

    protected $table = 'employee_assessments';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'percentage' => 'float',
            'assessed_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function scores()
    {
        return $this->hasMany(EmployeeAssessmentScore::class, 'assessment_id');
    }
}
