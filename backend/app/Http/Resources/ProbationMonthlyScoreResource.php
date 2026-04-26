<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProbationMonthlyScoreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'probation_review_id' => $this->probation_review_id,
            'month_no' => $this->month_no,
            'period_start' => $this->period_start,
            'period_end' => $this->period_end,
            'work_performance_score' => $this->work_performance_score,
            'managing_task_score' => $this->managing_task_score,
            'manager_qualitative_text' => $this->manager_qualitative_text,
            'manager_note' => $this->manager_note,
            'attitude_score' => $this->attitude_score,
            'attendance_deduction' => $this->attendance_deduction,
            'monthly_total' => $this->monthly_total,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
