<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\PipPlan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PipControllerTest extends TestCase
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

    public function test_manager_can_create_pip_plan_and_transition_action_for_subordinate(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $this->employee(['employee_id' => 'E001', 'department' => 'Engineering', 'manager_id' => 'M001']);

        $plan = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/pip-plans', [
            'employee_id' => 'E001',
            'trigger_reason' => 'Missed delivery goals',
            'trigger_period' => '2026-05',
            'status' => 'active',
            'owner_manager_id' => 'M001',
        ]);
        $plan->assertSuccessful();

        $planId = $plan->json('data.id');
        $action = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/pip-actions', [
            'pip_plan_id' => $planId,
            'action_title' => 'Weekly delivery checkpoint',
            'progress_pct' => 25,
            'status' => 'in_progress',
        ]);
        $action->assertSuccessful();

        $actionId = $action->json('data.id');
        $this->actingAs($manager, 'sanctum')->postJson('/api/v1/pip-actions', [
            'id' => $actionId,
            'pip_plan_id' => $planId,
            'action_title' => 'Weekly delivery checkpoint',
            'progress_pct' => 100,
            'status' => 'done',
            'checkpoint_note' => 'Completed.',
        ])->assertSuccessful();

        $this->assertDatabaseHas('pip_actions', [
            'id' => $actionId,
            'status' => 'done',
            'progress_pct' => 100,
        ]);
    }

    public function test_employee_cannot_create_or_update_pip_actions(): void
    {
        $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $employee = $this->employee(['employee_id' => 'E001', 'department' => 'Engineering', 'manager_id' => 'M001']);
        $plan = PipPlan::create([
            'employee_id' => 'E001',
            'status' => 'active',
            'owner_manager_id' => 'M001',
        ]);

        $this->actingAs($employee, 'sanctum')->postJson('/api/v1/pip-actions', [
            'pip_plan_id' => $plan->id,
            'action_title' => 'Unauthorized action',
            'status' => 'todo',
        ])->assertForbidden();
    }

    public function test_manager_cannot_create_pip_for_out_of_scope_employee(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $this->employee(['employee_id' => 'E002', 'department' => 'Finance']);

        $response = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/pip-plans', [
            'employee_id' => 'E002',
            'status' => 'active',
            'owner_manager_id' => 'M001',
        ]);

        $response->assertForbidden();
    }

    public function test_invalid_pip_action_progress_returns_validation_error(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);
        $this->employee(['employee_id' => 'E001']);
        $plan = PipPlan::create([
            'employee_id' => 'E001',
            'status' => 'active',
        ]);

        $response = $this->actingAs($hr, 'sanctum')->postJson('/api/v1/pip-actions', [
            'pip_plan_id' => $plan->id,
            'action_title' => 'Invalid action',
            'progress_pct' => 150,
            'status' => 'in_progress',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['progress_pct']);
    }
}
