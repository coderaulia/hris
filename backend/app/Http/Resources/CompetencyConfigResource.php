<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompetencyConfigResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'position_name' => $this->position_name,
            'competencies' => $this->competencies,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
