<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompetencyConfig extends Model
{
    protected $table = 'competency_config';
    protected $primaryKey = 'position_name';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'competencies' => 'array',
        ];
    }
}
