<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KpiWeightItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'profile_id' => $this->profile_id,
            'kpi_id' => $this->kpi_id,
            'weight_pct' => $this->weight_pct,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
