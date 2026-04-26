<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HrDocumentTemplateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'document_type' => $this->document_type,
            'locale' => $this->locale,
            'contract_type' => $this->contract_type,
            'template_name' => $this->template_name,
            'template_status' => $this->template_status,
            'version_no' => $this->version_no,
            'header_json' => $this->header_json,
            'body_json' => $this->body_json,
            'body_markup' => $this->body_markup,
            'signature_config_json' => $this->signature_config_json,
            'field_schema_json' => $this->field_schema_json,
            'is_default' => $this->is_default,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
