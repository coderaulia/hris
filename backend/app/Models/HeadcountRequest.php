<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HeadcountRequest extends Model
{
    use HasUuids;

    protected $table = 'headcount_requests';
    protected $guarded = [];
}
