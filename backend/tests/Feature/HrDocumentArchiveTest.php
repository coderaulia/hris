<?php

namespace Tests\Feature;

use App\Models\Employee;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsHrisTestSchema;
use Tests\TestCase;

class HrDocumentArchiveTest extends TestCase
{
    use BuildsHrisTestSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rebuildHrisSchema();
    }

    public function test_hr_can_archive_generated_document_and_complete_signature_sequence(): void
    {
        $hr = $this->employee('HR-1', 'hr', 'Human Resources');
        $employee = $this->employee('EMP-1', 'employee', 'Engineering');

        Sanctum::actingAs($hr);

        $archive = $this->postJson('/api/v1/hr-document-archives', [
            'document_type' => 'employment_contract',
            'employee_id' => $employee->employee_id,
            'subject_name' => $employee->name,
            'subject_mode' => 'employee',
            'filename' => 'employment-contract-emp-1.pdf',
            'file_size_bytes' => 12345,
            'signer_id' => $hr->employee_id,
            'requires_recipient_signature' => true,
            'document_payload_json' => [
                'values' => ['contract_type' => 'PKWT'],
            ],
        ])->assertOk()->json('data');

        $this->assertSame('pending_signature', $archive['signature_status']);

        $companySigned = $this->postJson("/api/v1/hr-document-archives/{$archive['id']}/signature", [
            'signer_type' => 'company',
            'decision' => 'signed',
        ])->assertOk()->json('data');

        $this->assertSame('pending_signature', $companySigned['signature_status']);
        $this->assertNotEmpty($companySigned['company_signed_at']);

        $recipientSigned = $this->postJson("/api/v1/hr-document-archives/{$archive['id']}/signature", [
            'signer_type' => 'recipient',
            'decision' => 'signed',
        ])->assertOk()->json('data');

        $this->assertSame('signed', $recipientSigned['signature_status']);
        $this->assertNotEmpty($recipientSigned['recipient_signed_at']);
    }

    public function test_non_hr_user_cannot_create_archive_records(): void
    {
        $employee = $this->employee('EMP-1', 'employee', 'Engineering');

        Sanctum::actingAs($employee);

        $this->postJson('/api/v1/hr-document-archives', [
            'document_type' => 'payslip',
            'employee_id' => $employee->employee_id,
            'subject_name' => $employee->name,
            'filename' => 'payslip.pdf',
        ])->assertForbidden();
    }

    private function employee(
        string $id,
        string $role,
        string $department
    ): Employee {
        return Employee::create([
            'employee_id' => $id,
            'name' => $id,
            'role' => $role,
            'department' => $department,
            'auth_email' => strtolower($id) . '@example.test',
            'password_hash' => 'secret',
        ]);
    }
}
