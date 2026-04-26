<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeAssessmentScore extends Model
{
    use HasUuids;

    protected $table = 'employee_assessment_scores';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'score' => 'float',
        ];
    }

    public function assessment()
    {
        return $this->belongsTo(EmployeeAssessment::class, 'assessment_id');
    }
}
