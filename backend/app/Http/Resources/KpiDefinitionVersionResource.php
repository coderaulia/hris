<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KpiDefinitionVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kpi_definition_id' => $this->kpi_definition_id,
            'version_no' => $this->version_no,
            'effective_period' => $this->effective_period,
            'name' => $this->name,
            'description' => $this->description,
            'category' => $this->category,
            'target' => $this->target,
            'unit' => $this->unit,
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
