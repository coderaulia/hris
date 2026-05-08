<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HrDocumentArchiveResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'document_type' => $this->document_type,
            'filename' => $this->filename,
            'storage_path' => $this->storage_path,
            'generated_by' => $this->generated_by,
            'generated_at' => $this->generated_at?->toISOString(),
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
