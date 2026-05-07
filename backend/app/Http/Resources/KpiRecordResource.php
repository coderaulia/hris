<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KpiRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'kpi_id' => $this->kpi_id,
            'period' => $this->period,
            'value' => $this->value,
            'notes' => $this->notes,
            'target_snapshot' => $this->target_snapshot,
            'kpi_name_snapshot' => $this->kpi_name_snapshot,
            'kpi_unit_snapshot' => $this->kpi_unit_snapshot,
            'kpi_category_snapshot' => $this->kpi_category_snapshot,
            'definition_version_id' => $this->definition_version_id,
            'target_version_id' => $this->target_version_id,
            'submitted_by' => $this->submitted_by,
            'submitted_at' => $this->submitted_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'updated_by' => $this->updated_by,
        ];
    }
}
