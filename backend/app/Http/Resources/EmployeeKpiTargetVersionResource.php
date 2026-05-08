<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeKpiTargetVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'kpi_id' => $this->kpi_id,
            'effective_period' => $this->effective_period,
            'target_value' => $this->target_value,
            'unit' => $this->unit,
            'version_no' => $this->version_no,
            'status' => $this->status,
            'request_note' => $this->request_note,
            'rejection_reason' => $this->rejection_reason,
            'requested_by' => $this->requested_by,
            'requested_at' => $this->requested_at,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at,
            'rejected_by' => $this->rejected_by,
            'rejected_at' => $this->rejected_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
