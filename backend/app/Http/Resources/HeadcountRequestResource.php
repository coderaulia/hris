<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HeadcountRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'plan_id' => $this->plan_id,
            'request_code' => $this->request_code,
            'department' => $this->department,
            'position' => $this->position,
            'seniority' => $this->seniority,
            'requested_count' => $this->requested_count,
            'priority' => $this->priority,
            'business_reason' => $this->business_reason,
            'approval_status' => $this->approval_status,
            'requested_by' => $this->requested_by,
            'target_hire_date' => $this->target_hire_date,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
