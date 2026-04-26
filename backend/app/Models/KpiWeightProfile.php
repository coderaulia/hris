<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KpiWeightProfile extends Model
{
    use HasUuids;

    protected $table = 'kpi_weight_profiles';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    public function items()
    {
        return $this->hasMany(KpiWeightItem::class, 'profile_id');
    }
}
