<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PerformanceScoreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'period' => $this->period,
            'score_type' => $this->score_type,
            'total_score' => $this->total_score,
            'detail' => $this->detail,
            'calculated_by' => $this->calculated_by,
            'calculated_at' => $this->calculated_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
