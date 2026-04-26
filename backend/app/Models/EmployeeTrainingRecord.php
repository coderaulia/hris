<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeTrainingRecord extends Model
{
    use HasUuids;

    protected $table = 'employee_training_records';
    protected $guarded = [];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }
}
