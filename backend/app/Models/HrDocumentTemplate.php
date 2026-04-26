<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrDocumentTemplate extends Model
{
    use HasUuids;

    protected $table = 'hr_document_templates';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'header_json' => 'array',
            'body_json' => 'array',
            'signature_config_json' => 'array',
            'field_schema_json' => 'array',
            'is_default' => 'boolean',
        ];
    }
}
