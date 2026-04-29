<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HrPayrollRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'payroll_period' => $this->payroll_period,
            'payroll_cutoff_start' => optional($this->payroll_cutoff_start)->toDateString(),
            'payroll_cutoff_end' => optional($this->payroll_cutoff_end)->toDateString(),
            'grade_level' => $this->grade_level,
            'ptkp' => $this->ptkp,
            'npwp' => $this->npwp,
            'nik_number' => $this->nik_number,
            'job_position' => $this->job_position,
            'organization' => $this->organization,
            'basic_salary' => $this->basic_salary,
            'overtime' => $this->overtime,
            'commission' => $this->commission,
            'bonus' => $this->bonus,
            'pph21' => $this->pph21,
            'bpjs_kes' => $this->bpjs_kes,
            'bpjs_tk' => $this->bpjs_tk,
            'other_deduction' => $this->other_deduction,
            'bpjs_kes_company' => $this->bpjs_kes_company,
            'bpjs_tk_company' => $this->bpjs_tk_company,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
