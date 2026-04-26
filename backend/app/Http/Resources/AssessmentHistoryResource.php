<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AssessmentHistoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'assessment_type' => $this->assessment_type,
            'assessed_on' => $this->assessed_on,
            'percentage' => $this->percentage,
            'seniority' => $this->seniority,
            'position' => $this->position,
            'created_at' => $this->created_at,
        ];
    }
}
