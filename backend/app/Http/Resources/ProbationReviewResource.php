<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProbationReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'review_period_start' => $this->review_period_start,
            'review_period_end' => $this->review_period_end,
            'quantitative_score' => $this->quantitative_score,
            'qualitative_score' => $this->qualitative_score,
            'final_score' => $this->final_score,
            'decision' => $this->decision,
            'manager_notes' => $this->manager_notes,
            'reviewed_by' => $this->reviewed_by,
            'reviewed_at' => $this->reviewed_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
