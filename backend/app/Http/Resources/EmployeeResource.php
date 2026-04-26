<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'employee_id' => $this->employee_id,
            'name' => $this->name,
            'position' => $this->position,
            'seniority' => $this->seniority,
            'join_date' => $this->join_date ? $this->join_date->format('Y-m-d') : null,
            'department' => $this->department,
            'manager_id' => $this->manager_id,
            'auth_email' => $this->auth_email,
            'role' => $this->role,
            'kpi_targets' => $this->kpi_targets,
            'must_change_password' => $this->must_change_password,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
