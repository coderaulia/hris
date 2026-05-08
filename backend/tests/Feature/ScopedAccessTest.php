<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeAssessment;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsHrisTestSchema;
use Tests\TestCase;

class ScopedAccessTest extends TestCase
{
    use BuildsHrisTestSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rebuildHrisSchema();
    }

    public function test_manager_employee_index_is_scoped_to_self_department_and_reports(): void
    {
        $manager = $this->employee('MGR-ENG', 'manager', 'Engineering');
        $direct = $this->employee('ENG-DIRECT', 'employee', 'Engineering', 'MGR-ENG');
        $sameDepartment = $this->employee('ENG-PEER', 'employee', 'Engineering', 'OTHER-MGR');
        $outside = $this->employee('SALES-1', 'employee', 'Sales', 'MGR-SALES');

        Sanctum::actingAs($manager);

        $ids = collect($this->getJson('/api/v1/employees')->assertOk()->json('data'))
            ->pluck('employee_id');

        $this->assertTrue($ids->contains($manager->employee_id));
        $this->assertTrue($ids->contains($direct->employee_id));
        $this->assertTrue($ids->contains($sameDepartment->employee_id));
        $this->assertFalse($ids->contains($outside->employee_id));
    }

    public function test_hr_employee_index_can_read_all_employees(): void
    {
        $hr = $this->employee('HR-1', 'hr', 'Human Resources');
        $this->employee('ENG-1', 'employee', 'Engineering');
        $this->employee('SALES-1', 'employee', 'Sales');

        Sanctum::actingAs($hr);

        $ids = collect($this->getJson('/api/v1/employees')->assertOk()->json('data'))
            ->pluck('employee_id');

        $this->assertTrue($ids->contains('HR-1'));
        $this->assertTrue($ids->contains('ENG-1'));
        $this->assertTrue($ids->contains('SALES-1'));
    }

    public function test_assessment_index_uses_shared_employee_scope(): void
    {
        $manager = $this->employee('MGR-ENG', 'manager', 'Engineering');
        $this->employee('ENG-DIRECT', 'employee', 'Engineering', 'MGR-ENG');
        $this->employee('ENG-PEER', 'employee', 'Engineering', 'OTHER-MGR');
        $this->employee('SALES-1', 'employee', 'Sales', 'MGR-SALES');

        foreach (['ENG-DIRECT', 'ENG-PEER', 'SALES-1'] as $employeeId) {
            EmployeeAssessment::create([
                'employee_id' => $employeeId,
                'assessment_type' => 'manager',
                'percentage' => 80,
            ]);
        }

        Sanctum::actingAs($manager);

        $ids = collect($this->getJson('/api/v1/assessments')->assertOk()->json('data'))
            ->pluck('employee_id');

        $this->assertTrue($ids->contains('ENG-DIRECT'));
        $this->assertTrue($ids->contains('ENG-PEER'));
        $this->assertFalse($ids->contains('SALES-1'));
    }

    public function test_manager_cannot_write_probation_review_outside_scope(): void
    {
        $manager = $this->employee('MGR-ENG', 'manager', 'Engineering');
        $this->employee('SALES-1', 'employee', 'Sales', 'MGR-SALES');

        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/probation-reviews', [
            'employee_id' => 'SALES-1',
            'final_score' => 92,
        ])->assertForbidden();
    }

    private function employee(
        string $id,
        string $role,
        string $department,
        ?string $managerId = null
    ): Employee {
        return Employee::create([
            'employee_id' => $id,
            'name' => $id,
            'role' => $role,
            'department' => $department,
            'manager_id' => $managerId,
            'auth_email' => strtolower($id) . '@example.test',
            'password_hash' => 'secret',
        ]);
    }
}
