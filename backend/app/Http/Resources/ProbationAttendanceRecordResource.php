<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProbationAttendanceRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'probation_review_id' => $this->probation_review_id,
            'month_no' => $this->month_no,
            'event_date' => $this->event_date,
            'event_type' => $this->event_type,
            'qty' => $this->qty,
            'deduction_points' => $this->deduction_points,
            'note' => $this->note,
            'entered_by' => $this->entered_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
