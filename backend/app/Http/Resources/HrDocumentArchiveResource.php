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
            'document_type' => $this->document_type,
            'employee_id' => $this->employee_id,
            'subject_name' => $this->subject_name,
            'subject_mode' => $this->subject_mode,
            'template_id' => $this->template_id,
            'filename' => $this->filename,
            'mime_type' => $this->mime_type,
            'file_size_bytes' => $this->file_size_bytes,
            'storage_status' => $this->storage_status,
            'storage_path' => $this->storage_path,
            'generated_by' => $this->generated_by,
            'generated_at' => $this->generated_at,
            'signer_id' => $this->signer_id,
            'signer_title' => $this->signer_title,
            'recipient_signer_id' => $this->recipient_signer_id,
            'requires_recipient_signature' => $this->requires_recipient_signature,
            'signature_status' => $this->signature_status,
            'signature_note' => $this->signature_note,
            'company_signed_at' => $this->company_signed_at,
            'recipient_signed_at' => $this->recipient_signed_at,
            'document_payload_json' => $this->document_payload_json,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
