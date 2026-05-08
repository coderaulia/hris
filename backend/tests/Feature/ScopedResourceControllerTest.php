<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeAssessment;
use App\Models\EmployeeTrainingRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScopedResourceControllerTest extends TestCase
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

    private function assessment(string $employeeId): EmployeeAssessment
    {
        return EmployeeAssessment::create([
            'employee_id' => $employeeId,
            'assessment_type' => 'manager',
            'percentage' => 80,
        ]);
    }

    private function training(string $employeeId): EmployeeTrainingRecord
    {
        return EmployeeTrainingRecord::create([
            'employee_id' => $employeeId,
            'course' => 'Leadership Basics',
            'status' => 'completed',
        ]);
    }

    public function test_hr_user_can_read_all_assessments(): void
    {
        $hr = $this->employee(['employee_id' => 'HR01', 'role' => 'hr', 'department' => 'HR']);
        $this->employee(['employee_id' => 'E001']);
        $this->employee(['employee_id' => 'E002', 'department' => 'Finance']);
        $this->assessment('E001');
        $this->assessment('E002');

        $response = $this->actingAs($hr, 'sanctum')->getJson('/api/v1/assessments');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
    }

    public function test_director_assessment_reads_use_shared_scope(): void
    {
        $director = $this->employee(['employee_id' => 'D001', 'role' => 'director']);
        $this->employee(['employee_id' => 'E001', 'manager_id' => 'D001', 'position' => 'Developer']);
        $this->employee(['employee_id' => 'E002', 'manager_id' => null, 'position' => 'Developer']);
        $this->employee(['employee_id' => 'E003', 'department' => 'Finance', 'position' => 'Analyst']);
        $this->assessment('E001');
        $this->assessment('E002');
        $this->assessment('E003');

        $response = $this->actingAs($director, 'sanctum')->getJson('/api/v1/assessments');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('employee_id')->sort()->values()->toArray();
        $this->assertEquals(['E001', 'E002'], $ids);
    }

    public function test_training_index_is_scoped_to_current_employee(): void
    {
        $alice = $this->employee(['employee_id' => 'E001']);
        $this->employee(['employee_id' => 'E002']);
        $this->training('E001');
        $this->training('E002');

        $response = $this->actingAs($alice, 'sanctum')->getJson('/api/v1/training-records');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('E001', $data[0]['employee_id']);
    }

    public function test_manager_training_index_includes_team_scope_only(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $this->employee(['employee_id' => 'E001', 'manager_id' => 'M001', 'department' => 'Engineering']);
        $this->employee(['employee_id' => 'E002', 'department' => 'Finance']);
        $this->training('M001');
        $this->training('E001');
        $this->training('E002');

        $response = $this->actingAs($manager, 'sanctum')->getJson('/api/v1/training-records');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('employee_id')->sort()->values()->toArray();
        $this->assertEquals(['E001', 'M001'], $ids);
    }

    public function test_performance_score_store_uses_authenticated_user(): void
    {
        $manager = $this->employee(['employee_id' => 'M001', 'role' => 'manager', 'department' => 'Engineering']);
        $this->employee(['employee_id' => 'E001', 'manager_id' => 'M001', 'department' => 'Engineering']);

        $response = $this->actingAs($manager, 'sanctum')->postJson('/api/v1/performance-scores', [
            'employee_id' => 'E001',
            'period' => '2026-05',
            'score_type' => 'monthly',
            'total_score' => 88,
            'detail' => ['source' => 'test'],
        ]);

        $response->assertSuccessful();
        $this->assertDatabaseHas('employee_performance_scores', [
            'employee_id' => 'E001',
            'period' => '2026-05',
            'score_type' => 'monthly',
            'calculated_by' => 'M001',
        ]);
    }

    public function test_superadmin_can_create_hr_and_director_users(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);

        $hrResponse = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/employees', [
            'employee_id' => 'HR02',
            'name' => 'HR Partner',
            'role' => 'hr',
            'department' => 'HR',
        ]);
        $directorResponse = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/employees', [
            'employee_id' => 'D002',
            'name' => 'Director Two',
            'role' => 'director',
            'department' => 'Operations',
        ]);

        $hrResponse->assertSuccessful();
        $directorResponse->assertSuccessful();
        $this->assertDatabaseHas('employees', ['employee_id' => 'HR02', 'role' => 'hr']);
        $this->assertDatabaseHas('employees', ['employee_id' => 'D002', 'role' => 'director']);
    }
}
