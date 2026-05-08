<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrDocumentArchive extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id',
        'employee_id',
        'document_type',
        'filename',
        'storage_path',
        'generated_by',
        'generated_at',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'generated_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
