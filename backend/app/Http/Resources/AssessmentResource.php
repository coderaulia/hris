<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AssessmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'assessment_type' => $this->assessment_type,
            'percentage' => $this->percentage,
            'seniority' => $this->seniority,
            'assessed_at' => $this->assessed_at,
            'assessed_by' => $this->assessed_by,
            'source_date' => $this->source_date,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
