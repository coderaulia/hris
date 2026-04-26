<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KpiWeightProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'profile_name' => $this->profile_name,
            'department' => $this->department,
            'position' => $this->position,
            'active' => $this->active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'items' => KpiWeightItemResource::collection($this->whenLoaded('items')),
        ];
    }
}
