<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProbationReview extends Model
{
    use HasUuids;

    protected $table = 'probation_reviews';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'quantitative_score' => 'float',
            'qualitative_score' => 'float',
            'final_score' => 'float',
            'reviewed_at' => 'datetime',
        ];
    }
}
