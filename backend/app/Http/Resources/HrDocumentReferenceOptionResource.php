<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HrDocumentReferenceOptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'group_key' => $this->group_key,
            'option_key' => $this->option_key,
            'option_label' => $this->option_label,
            'option_value' => $this->option_value,
            'sort_order' => $this->sort_order,
            'is_active' => $this->is_active,
            'metadata_json' => $this->metadata_json,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
