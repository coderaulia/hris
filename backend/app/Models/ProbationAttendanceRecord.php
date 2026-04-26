<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProbationAttendanceRecord extends Model
{
    use HasUuids;

    protected $table = 'probation_attendance_records';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'qty' => 'float',
            'deduction_points' => 'float',
        ];
    }
}
