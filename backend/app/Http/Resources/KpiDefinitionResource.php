<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KpiDefinitionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'category' => $this->category,
            'target' => $this->target,
            'unit' => $this->unit,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
