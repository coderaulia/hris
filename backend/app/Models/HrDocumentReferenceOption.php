<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrDocumentReferenceOption extends Model
{
    use HasUuids;

    protected $table = 'hr_document_reference_options';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
            'is_active' => 'boolean',
        ];
    }
}
