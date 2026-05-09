<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppSettingControllerTest extends TestCase
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

    public function test_superadmin_bulk_updates_settings_transactionally(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        AppSetting::create(['key' => 'company_name', 'value' => 'Old Name']);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/settings/bulk', [
            'settings' => [
                ['key' => 'company_name', 'value' => 'New Name'],
                ['key' => 'company_short', 'value' => 'NEW'],
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('app_settings', ['key' => 'company_name', 'value' => 'New Name']);
        $this->assertDatabaseHas('app_settings', ['key' => 'company_short', 'value' => 'NEW']);
    }

    public function test_non_superadmin_cannot_bulk_update_settings(): void
    {
        $employee = $this->employee(['employee_id' => 'E001', 'role' => 'employee']);

        $response = $this->actingAs($employee, 'sanctum')->postJson('/api/v1/settings/bulk', [
            'settings' => [
                ['key' => 'company_name', 'value' => 'New Name'],
            ],
        ]);

        $response->assertForbidden();
    }

    public function test_invalid_bulk_settings_payload_writes_nothing(): void
    {
        $admin = $this->employee(['employee_id' => 'SA01', 'role' => 'superadmin']);
        AppSetting::create(['key' => 'company_name', 'value' => 'Old Name']);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/settings/bulk', [
            'settings' => [
                ['key' => 'company_name', 'value' => 'New Name'],
                ['key' => 'company_short'],
            ],
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['settings.1.value']);
        $this->assertDatabaseHas('app_settings', ['key' => 'company_name', 'value' => 'Old Name']);
        $this->assertDatabaseMissing('app_settings', ['key' => 'company_short']);
    }
}
