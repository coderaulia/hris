<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ManpowerPlan extends Model
{
    use HasUuids;

    protected $table = 'manpower_plans';
    protected $guarded = [];
}
