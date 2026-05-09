<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\HeadcountRequest;
use App\Models\ManpowerPlan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManpowerControllerTest extends TestCase
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

    public function test_hr_can_create_update_and_read_manpower_plan(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);

        $created = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/manpower-plans', [
            'period' => '2026-05',
            'department' => 'Engineering',
            'position' => 'Developer',
            'seniority' => 'Mid',
            'planned_headcount' => 3,
            'approved_headcount' => 2,
            'status' => 'submitted',
        ]);
        $created->assertSuccessful();

        $updated = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/manpower-plans', [
            'period' => '2026-05',
            'department' => 'Engineering',
            'position' => 'Developer',
            'seniority' => 'Mid',
            'planned_headcount' => 4,
            'approved_headcount' => 3,
            'status' => 'approved',
        ]);
        $updated->assertSuccessful();

        $this->assertDatabaseCount('manpower_plans', 1);
        $this->assertDatabaseHas('manpower_plans', [
            'period' => '2026-05',
            'approved_headcount' => 3,
            'status' => 'approved',
        ]);
    }

    public function test_manager_reads_only_department_manpower_and_employee_reads_none(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $employee = $this->employee(['employee_id' => 'E001', 'role' => 'employee', 'department' => 'Engineering']);
        ManpowerPlan::create([
            'period' => '2026-05',
            'department' => 'Engineering',
            'position' => 'Developer',
            'seniority' => 'Mid',
        ]);
        ManpowerPlan::create([
            'period' => '2026-05',
            'department' => 'Finance',
            'position' => 'Analyst',
            'seniority' => 'Mid',
        ]);

        $managerResponse = $this->actingAs($manager, 'sanctum')->getJson('/api/v1/manpower-plans');
        $employeeResponse = $this->actingAs($employee, 'sanctum')->getJson('/api/v1/manpower-plans');

        $managerResponse->assertOk();
        $this->assertEquals(['Engineering'], collect($managerResponse->json('data'))->pluck('department')->all());
        $employeeResponse->assertOk();
        $this->assertCount(0, $employeeResponse->json('data'));
    }

    public function test_manager_can_submit_own_department_request_only(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);

        $allowed = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/headcount-requests', [
            'department' => 'Engineering',
            'position' => 'Developer',
            'requested_count' => 2,
            'requested_by' => 'M001',
            'approval_status' => 'pending',
        ]);
        $blocked = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/headcount-requests', [
            'department' => 'Finance',
            'position' => 'Analyst',
            'requested_count' => 1,
            'requested_by' => 'M001',
            'approval_status' => 'pending',
        ]);

        $allowed->assertSuccessful();
        $blocked->assertForbidden();
        $this->assertDatabaseHas('headcount_requests', [
            'department' => 'Engineering',
            'requested_by' => 'M001',
        ]);
    }

    public function test_hr_can_manage_pipeline_and_employee_cannot_delete_it(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);
        $employee = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $request = HeadcountRequest::create([
            'department' => 'Engineering',
            'position' => 'Developer',
            'requested_count' => 1,
            'requested_by' => 'HR01',
        ]);

        $created = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/recruitment-pipeline', [
            'request_id' => $request->id,
            'candidate_name' => 'Candidate One',
            'stage' => 'screening',
            'source' => 'Referral',
            'owner_id' => 'HR01',
            'notes' => 'Initial screen booked.',
        ]);
        $created->assertSuccessful();

        $pipelineId = $created->json('data.id');
        $this->actingAs($employee, 'sanctum')
            ->deleteJson("/api/v1/recruitment-pipeline/{$pipelineId}")
            ->assertForbidden();
        $this->actingAs($hr, 'sanctum')
            ->deleteJson("/api/v1/recruitment-pipeline/{$pipelineId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('recruitment_pipeline', ['id' => $pipelineId]);
    }

    public function test_manpower_plan_validation_rejects_bad_period(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);

        $response = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/manpower-plans', [
            'period' => '2026-13',
            'department' => 'Engineering',
            'position' => 'Developer',
            'seniority' => 'Mid',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['period']);
    }
}
