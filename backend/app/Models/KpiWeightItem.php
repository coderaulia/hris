<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KpiWeightItem extends Model
{
    use HasUuids;

    protected $table = 'kpi_weight_items';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'weight_pct' => 'float',
        ];
    }

    public function profile()
    {
        return $this->belongsTo(KpiWeightProfile::class, 'profile_id');
    }

    public function definition()
    {
        return $this->belongsTo(KpiDefinition::class, 'kpi_id');
    }
}
