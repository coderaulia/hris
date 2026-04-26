<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RecruitmentPipelineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'request_id' => $this->request_id,
            'candidate_name' => $this->candidate_name,
            'stage' => $this->stage,
            'source' => $this->source,
            'owner_id' => $this->owner_id,
            'stage_updated_at' => $this->stage_updated_at,
            'offer_status' => $this->offer_status,
            'expected_start_date' => $this->expected_start_date,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
