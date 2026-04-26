<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProbationQualitativeItem extends Model
{
    use HasUuids;

    protected $table = 'probation_qualitative_items';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'score' => 'float',
        ];
    }
}
