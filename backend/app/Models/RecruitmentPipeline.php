<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RecruitmentPipeline extends Model
{
    use HasUuids;

    protected $table = 'recruitment_pipeline';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'stage_updated_at' => 'datetime',
            'expected_start_date' => 'date',
        ];
    }
}
