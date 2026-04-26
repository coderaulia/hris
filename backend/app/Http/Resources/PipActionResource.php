<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PipActionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'pip_plan_id' => $this->pip_plan_id,
            'action_title' => $this->action_title,
            'action_detail' => $this->action_detail,
            'due_date' => $this->due_date,
            'progress_pct' => $this->progress_pct,
            'status' => $this->status,
            'checkpoint_note' => $this->checkpoint_note,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
