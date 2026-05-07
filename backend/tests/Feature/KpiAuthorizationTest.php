<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\KpiDefinition;
use App\Models\KpiRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KpiAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function employee(array $attrs): Employee
    {
        return Employee::create(array_merge([
            'name' => 'Test',
            'email' => uniqid() . '@test.com',
            'role' => 'employee',
            'department' => 'Engineering',
            'manager_id' => null,
        ], $attrs));
    }

    private function definition(array $attrs = []): KpiDefinition
    {
        return KpiDefinition::create(array_merge([
            'name' => 'Test KPI',
            'category' => 'General',
        ], $attrs));
    }

    // --- KPI definition CRUD ---

    public function test_any_authenticated_user_can_read_kpi_definitions(): void
    {
        $e = $this->employee(['employee_id' => 'E001']);
        $this->definition();

        $response = $this->actingAs($e, 'sanctum')->getJson('/api/v1/kpis');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_superadmin_can_create_kpi_definition(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/kpis', [
            'name' => 'Revenue KPI',
            'category' => 'General',
        ]);

        $response->assertSuccessful();
    }

    public function test_hr_user_can_create_kpi_definition(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr']);

        $response = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/kpis', [
            'name' => 'Attendance KPI',
            'category' => 'General',
        ]);

        $response->assertSuccessful();
    }

    public function test_plain_employee_cannot_create_kpi_definition(): void
    {
        $e = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);

        $response = $this->actingAs($e, 'sanctum')->postJson('/api/v1/kpis', [
            'name' => 'Rogue KPI',
            'category' => 'General',
        ]);

        $response->assertForbidden();
    }

    public function test_superadmin_can_delete_kpi_definition(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        $def   = $this->definition();

        $response = $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/kpis/{$def->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('kpi_definitions', ['id' => $def->id]);
    }

    public function test_employee_cannot_delete_kpi_definition(): void
    {
        $e   = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $def = $this->definition();

        $response = $this->actingAs($e, 'sanctum')->deleteJson("/api/v1/kpis/{$def->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('kpi_definitions', ['id' => $def->id]);
    }

    public function test_delete_nonexistent_definition_returns_404(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        $fakeId = \Illuminate\Support\Str::uuid();

        $response = $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/kpis/{$fakeId}");

        $response->assertNotFound();
    }

    // --- KPI record delete (scope enforcement) ---

    public function test_superadmin_can_delete_any_kpi_record(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        $e     = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $def   = $this->definition();

        $record = KpiRecord::create([
            'employee_id' => 'E001',
            'kpi_id'      => $def->id,
            'period'      => '2026-01',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/kpi-records/{$record->id}");

        $response->assertNoContent();
    }

    public function test_employee_cannot_delete_another_employees_kpi_record(): void
    {
        $alice = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $bob   = $this->employee(['employee_id' => 'E002', 'role' => 'employee']);
        $def   = $this->definition();

        $record = KpiRecord::create([
            'employee_id' => 'E002',
            'kpi_id'      => $def->id,
            'period'      => '2026-01',
        ]);

        $response = $this->actingAs($alice, 'sanctum')->deleteJson("/api/v1/kpi-records/{$record->id}");

        $response->assertForbidden();
    }

    // --- Validation ---

    public function test_create_definition_requires_name(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/kpis', [
            'category' => 'General',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['name']);
    }

    public function test_unauthenticated_cannot_read_kpis(): void
    {
        $response = $this->getJson('/api/v1/kpis');
        $response->assertUnauthorized();
    }
}
