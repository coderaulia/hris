<?php

namespace Tests\Unit;

use App\Models\Employee;
use App\Services\EmployeeScopeService;
use Tests\TestCase;

class EmployeeScopeServiceTest extends TestCase
{
    private function makeEmployee(array $attrs): Employee
    {
        $e = new Employee();
        foreach ($attrs as $k => $v) {
            $e->$k = $v;
        }
        return $e;
    }

    public function test_isHrUser_true_for_hr_role(): void
    {
        $user = $this->makeEmployee(['role' => 'hr', 'department' => 'Finance']);
        $this->assertTrue(EmployeeScopeService::isHrUser($user));
    }

    public function test_isHrUser_true_for_hr_department(): void
    {
        $user = $this->makeEmployee(['role' => 'employee', 'department' => 'HR']);
        $this->assertTrue(EmployeeScopeService::isHrUser($user));
    }

    public function test_isHrUser_true_for_human_resources_department(): void
    {
        $user = $this->makeEmployee(['role' => 'employee', 'department' => 'Human Resources']);
        $this->assertTrue(EmployeeScopeService::isHrUser($user));
    }

    public function test_isHrUser_false_for_regular_employee(): void
    {
        $user = $this->makeEmployee(['role' => 'employee', 'department' => 'Finance']);
        $this->assertFalse(EmployeeScopeService::isHrUser($user));
    }

    public function test_isHrUser_false_for_manager_in_non_hr_dept(): void
    {
        $user = $this->makeEmployee(['role' => 'manager', 'department' => 'Engineering']);
        $this->assertFalse(EmployeeScopeService::isHrUser($user));
    }

    public function test_isDirector_true_for_director_role(): void
    {
        $user = $this->makeEmployee(['role' => 'director']);
        $this->assertTrue(EmployeeScopeService::isDirector($user));
    }

    public function test_isDirector_false_for_manager(): void
    {
        $user = $this->makeEmployee(['role' => 'manager']);
        $this->assertFalse(EmployeeScopeService::isDirector($user));
    }

    public function test_isDirector_false_for_superadmin(): void
    {
        $user = $this->makeEmployee(['role' => 'superadmin']);
        $this->assertFalse(EmployeeScopeService::isDirector($user));
    }
}
