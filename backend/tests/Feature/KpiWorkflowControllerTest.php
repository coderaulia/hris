<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\KpiDefinition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KpiWorkflowControllerTest extends TestCase
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

    private function definition(array $attrs = []): KpiDefinition
    {
        return KpiDefinition::create(array_merge([
            'name' => 'Delivery KPI',
            'category' => 'General',
            'target' => 90,
            'unit' => '%',
        ], $attrs));
    }

    public function test_definition_version_submission_and_approval_paths_are_enforced(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);
        $definition = $this->definition();

        $submitted = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/kpi-definition-versions', [
            'kpi_definition_id' => $definition->id,
            'version_no' => 2,
            'effective_period' => '2026-05',
            'name' => 'Delivery KPI v2',
            'category' => 'General',
            'target' => 95,
            'status' => 'pending',
            'requested_by' => 'M001',
        ]);
        $submitted->assertSuccessful();

        $versionId = $submitted->json('data.id');
        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/kpi-definition-versions/{$versionId}", ['status' => 'approved'])
            ->assertForbidden();

        $this->actingAs($hr, 'sanctum')
            ->patchJson("/api/v1/kpi-definition-versions/{$versionId}", [
                'status' => 'approved',
                'approved_by' => 'HR01',
            ])
            ->assertSuccessful();

        $this->assertDatabaseHas('kpi_definition_versions', [
            'id' => $versionId,
            'status' => 'approved',
            'approved_by' => 'HR01',
        ]);
    }

    public function test_target_version_submission_and_rejection_paths_are_enforced(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $this->employee(['employee_id' => 'E001', 'department' => 'Engineering', 'manager_id' => 'M001']);
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);
        $definition = $this->definition();

        $submitted = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/employee-kpi-target-versions', [
            'employee_id' => 'E001',
            'kpi_id' => $definition->id,
            'effective_period' => '2026-05',
            'target_value' => 10,
            'unit' => 'tickets',
            'version_no' => 1,
            'status' => 'pending',
            'requested_by' => 'M001',
        ]);
        $submitted->assertSuccessful();

        $targetId = $submitted->json('data.id');
        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/employee-kpi-target-versions/{$targetId}", ['status' => 'rejected'])
            ->assertForbidden();

        $this->actingAs($hr, 'sanctum')
            ->patchJson("/api/v1/employee-kpi-target-versions/{$targetId}", [
                'status' => 'rejected',
                'rejected_by' => 'HR01',
                'rejection_reason' => 'Target needs calibration.',
            ])
            ->assertSuccessful();

        $this->assertDatabaseHas('employee_kpi_target_versions', [
            'id' => $targetId,
            'status' => 'rejected',
            'rejected_by' => 'HR01',
        ]);
    }

    public function test_kpi_weight_profile_and_items_can_be_saved_by_approver_only(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        $employee = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $definition = $this->definition();

        $profile = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/kpi-weight-profiles', [
            'profile_name' => 'Engineering Default',
            'department' => 'Engineering',
            'position' => 'Developer',
            'active' => true,
        ]);
        $profile->assertSuccessful();

        $profileId = $profile->json('data.id');
        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/v1/kpi-weight-profiles/{$profileId}/items", [
                'items' => [[
                    'profile_id' => $profileId,
                    'kpi_id' => $definition->id,
                    'weight_pct' => 100,
                ]],
            ])
            ->assertForbidden();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/kpi-weight-profiles/{$profileId}/items", [
                'items' => [[
                    'profile_id' => $profileId,
                    'kpi_id' => $definition->id,
                    'weight_pct' => 100,
                ]],
            ])
            ->assertSuccessful();

        $this->assertDatabaseHas('kpi_weight_items', [
            'profile_id' => $profileId,
            'kpi_id' => $definition->id,
            'weight_pct' => 100,
        ]);
    }

    public function test_invalid_kpi_version_status_returns_validation_error(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);
        $definition = $this->definition();

        $response = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/kpi-definition-versions', [
            'kpi_definition_id' => $definition->id,
            'version_no' => 2,
            'effective_period' => '2026-05',
            'name' => 'Delivery KPI v2',
            'status' => 'draft',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['status']);
    }
}
