<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PipPlanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'owner_manager_id' => $this->owner_manager_id,
            'trigger_reason' => $this->trigger_reason,
            'trigger_period' => $this->trigger_period,
            'start_date' => $this->start_date,
            'target_end_date' => $this->target_end_date,
            'status' => $this->status,
            'summary' => $this->summary,
            'closed_at' => $this->closed_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
