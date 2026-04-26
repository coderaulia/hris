<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PipPlan extends Model
{
    use HasUuids;

    protected $table = 'pip_plans';
    protected $guarded = [];
}
