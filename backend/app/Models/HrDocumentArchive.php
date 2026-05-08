<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrDocumentArchive extends Model
{
    use HasUuids;

    protected $table = 'hr_document_archives';
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'document_payload_json' => 'array',
            'requires_recipient_signature' => 'boolean',
            'generated_at' => 'datetime',
            'company_signed_at' => 'datetime',
            'recipient_signed_at' => 'datetime',
            'file_size_bytes' => 'integer',
        ];
    }
}
