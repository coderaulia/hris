<?php

namespace Tests\Feature;

use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class HrDocumentArchiveTest extends TestCase
{
    use RefreshDatabase;

    private function employee(array $attrs): Employee
    {
        return Employee::create(array_merge([
            'name' => 'Test Employee',
            'email' => uniqid() . '@test.com',
            'role' => 'employee',
            'department' => 'Engineering',
            'position' => 'Developer',
            'manager_id' => null,
        ], $attrs));
    }

    public function test_hr_can_create_upload_download_and_delete_archive_file(): void
    {
        Storage::fake('local');
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);

        $created = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/hr-document-archive', [
            'id' => '11111111-1111-4111-8111-111111111111',
            'employee_id' => 'E001',
            'document_type' => 'offer_letter',
            'filename' => 'offer-letter.pdf',
            'generated_by' => 'HR01',
            'metadata' => ['employee_name' => 'Candidate One'],
        ]);

        $created->assertSuccessful();

        $uploaded = $this->actingAs($hr, 'sanctum')->post('/api/v1/hr-document-archive/11111111-1111-4111-8111-111111111111/file', [
            'file' => UploadedFile::fake()->create('offer-letter.pdf', 12, 'application/pdf'),
        ]);

        $uploaded->assertOk();
        $storagePath = $uploaded->json('data.storage_path');
        $this->assertNotEmpty($storagePath);
        Storage::disk('local')->assertExists($storagePath);

        $download = $this->actingAs($hr, 'sanctum')->get('/api/v1/hr-document-archive/11111111-1111-4111-8111-111111111111/file');
        $download->assertOk();
        $this->assertStringContainsString('application/pdf', $download->headers->get('content-type'));

        $deleted = $this->actingAs($hr, 'sanctum')->deleteJson('/api/v1/hr-document-archive/11111111-1111-4111-8111-111111111111');
        $deleted->assertNoContent();
        Storage::disk('local')->assertMissing($storagePath);
        $this->assertDatabaseMissing('hr_document_archive', ['id' => '11111111-1111-4111-8111-111111111111']);
    }

    public function test_employee_cannot_access_archive_routes(): void
    {
        $employee = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);

        $response = $this->actingAs($employee, 'sanctum')->getJson('/api/v1/hr-document-archive');

        $response->assertForbidden();
    }
}
