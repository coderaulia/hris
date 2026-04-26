<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        $query = Employee::query();
        
        $query = EmployeeScopeService::scopeQuery($query);

        return EmployeeResource::collection($query->get());
    }

    public function show($id)
    {
        $employee = Employee::findOrFail($id);

        if (!EmployeeScopeService::canAccess($employee->employee_id)) {
            abort(403, 'Access denied.');
        }

        return new EmployeeResource($employee);
    }

    public function store(Request $request)
    {
        if (Auth::user()->role !== 'superadmin') {
            abort(403, 'Access denied: sensitive employee fields are superadmin-only.');
        }

        $validated = $request->validate([
            'employee_id' => 'required|string|unique:employees,employee_id',
            'name' => 'required|string',
            'position' => 'nullable|string',
            'seniority' => 'nullable|string',
            'join_date' => 'nullable|date',
            'department' => 'nullable|string',
            'manager_id' => 'nullable|string|exists:employees,employee_id',
            'auth_email' => 'nullable|email|unique:employees,auth_email',
            'role' => 'required|in:superadmin,manager,employee',
            'kpi_targets' => 'nullable|array',
            'must_change_password' => 'nullable|boolean',
        ]);

        $employee = Employee::create($validated);

        return new EmployeeResource($employee);
    }

    public function update(Request $request, $id)
    {
        $employee = Employee::findOrFail($id);

        if (!EmployeeScopeService::canAccess($employee->employee_id)) {
            abort(403, 'Access denied.');
        }

        $isSuperadmin = Auth::user()->role === 'superadmin';

        $rules = [
            'name' => 'sometimes|required|string',
            'position' => 'nullable|string',
            'seniority' => 'nullable|string',
            'join_date' => 'nullable|date',
            'kpi_targets' => 'nullable|array',
            'must_change_password' => 'nullable|boolean',
        ];

        if ($isSuperadmin) {
            $rules['department'] = 'nullable|string';
            $rules['manager_id'] = 'nullable|string|exists:employees,employee_id';
            $rules['auth_email'] = 'nullable|email|unique:employees,auth_email,' . $employee->employee_id . ',employee_id';
            $rules['role'] = 'sometimes|required|in:superadmin,manager,employee';
        }

        $validated = $request->validate($rules);

        $employee->update($validated);

        return new EmployeeResource($employee);
    }

    public function destroy($id)
    {
        if (Auth::user()->role !== 'superadmin') {
            abort(403, 'Access denied.');
        }

        $employee = Employee::findOrFail($id);
        $employee->delete();

        return response()->noContent();
    }
}
