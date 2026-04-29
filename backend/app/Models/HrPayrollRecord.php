<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrPayrollRecord extends Model
{
    use HasUuids;

    protected $table = 'hr_payroll_records';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'payroll_cutoff_start' => 'date',
            'payroll_cutoff_end' => 'date',
            'basic_salary' => 'decimal:2',
            'overtime' => 'decimal:2',
            'commission' => 'decimal:2',
            'bonus' => 'decimal:2',
            'pph21' => 'decimal:2',
            'bpjs_kes' => 'decimal:2',
            'bpjs_tk' => 'decimal:2',
            'other_deduction' => 'decimal:2',
            'bpjs_kes_company' => 'decimal:2',
            'bpjs_tk_company' => 'decimal:2',
        ];
    }
}
