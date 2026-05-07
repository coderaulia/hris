<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\ProbationReview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProbationControllerTest extends TestCase
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

    private function review(string $employeeId): ProbationReview
    {
        return ProbationReview::create(['employee_id' => $employeeId]);
    }

    // --- Scope: reads ---

    public function test_employee_sees_only_own_reviews(): void
    {
        $alice = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $bob   = $this->employee(['employee_id' => 'E002', 'role' => 'employee']);

        $this->review('E001');
        $this->review('E002');

        $response = $this->actingAs($alice, 'sanctum')->getJson('/api/v1/probation-reviews');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('E001', $data[0]['employee_id']);
    }

    public function test_manager_sees_own_and_team_reviews(): void
    {
        $mgr  = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Eng']);
        $sub  = $this->employee(['employee_id' => 'E001', 'role' => 'employee', 'manager_id' => 'M001']);
        $other = $this->employee(['employee_id' => 'E002', 'role' => 'employee', 'manager_id' => null, 'department' => 'Finance']);

        $this->review('M001');
        $this->review('E001');
        $this->review('E002');

        $response = $this->actingAs($mgr, 'sanctum')->getJson('/api/v1/probation-reviews');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('employee_id')->sort()->values()->toArray();
        $this->assertEquals(['E001', 'M001'], $ids);
    }

    public function test_superadmin_sees_all_reviews(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        $e1    = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $e2    = $this->employee(['employee_id' => 'E002', 'role' => 'employee']);

        $this->review('SA01');
        $this->review('E001');
        $this->review('E002');

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/probation-reviews');

        $response->assertOk();
        $this->assertCount(3, $response->json('data'));
    }

    public function test_hr_user_sees_all_reviews(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr']);
        $this->employee(['employee_id' => 'E001', 'role' => 'employee']);
        $this->employee(['employee_id' => 'E002', 'role' => 'employee']);

        $this->review('E001');
        $this->review('E002');

        $response = $this->actingAs($hr, 'sanctum')->getJson('/api/v1/probation-reviews');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
    }

    // --- Authorization: writes ---

    public function test_employee_cannot_write_probation_review(): void
    {
        $e = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);

        $response = $this->actingAs($e, 'sanctum')->postJson('/api/v1/probation-reviews', [
            'employee_id' => 'E001',
        ]);

        $response->assertForbidden();
    }

    public function test_manager_can_write_review_for_own_subordinate(): void
    {
        $mgr = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Eng']);
        $this->employee(['employee_id' => 'E001', 'role' => 'employee', 'manager_id' => 'M001', 'department' => 'Eng']);

        $response = $this->actingAs($mgr, 'sanctum')->postJson('/api/v1/probation-reviews', [
            'employee_id' => 'E001',
        ]);

        $response->assertSuccessful();
    }

    public function test_manager_cannot_write_review_for_out_of_scope_employee(): void
    {
        $mgr   = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Eng']);
        $other = $this->employee(['employee_id' => 'E002', 'role' => 'employee', 'manager_id' => null, 'department' => 'Finance']);

        $response = $this->actingAs($mgr, 'sanctum')->postJson('/api/v1/probation-reviews', [
            'employee_id' => 'E002',
        ]);

        $response->assertForbidden();
    }

    public function test_superadmin_can_write_any_review(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        $this->employee(['employee_id' => 'E001', 'role' => 'employee']);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/probation-reviews', [
            'employee_id' => 'E001',
        ]);

        $response->assertSuccessful();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/v1/probation-reviews');
        $response->assertUnauthorized();
    }
}
