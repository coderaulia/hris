<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Http\Resources\TrainingRecordResource;
use App\Models\EmployeeTrainingRecord;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;

class TrainingRecordController extends Controller
{
    public function index(Request $request)
    {
        $query = EmployeeTrainingRecord::query();
        
        // Simplified scoping
        return TrainingRecordResource::collection($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|string|exists:employees,employee_id',
            'course' => 'required|string',
            'start_date' => 'nullable|string',
            'end_date' => 'nullable|string',
            'provider' => 'nullable|string',
            'status' => 'required|in:planned,ongoing,completed,approved',
            'notes' => 'nullable|string',
        ]);

        if (!EmployeeScopeService::canAccess($validated['employee_id'])) {
             abort(403, 'Unauthorized.');
        }

        $record = EmployeeTrainingRecord::create($validated);
        return new TrainingRecordResource($record);
    }

    public function update(Request $request, $id)
    {
        $record = EmployeeTrainingRecord::findOrFail($id);
        
        if (!EmployeeScopeService::canAccess($record->employee_id)) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'course' => 'sometimes|required|string',
            'start_date' => 'nullable|string',
            'end_date' => 'nullable|string',
            'provider' => 'nullable|string',
            'status' => 'sometimes|required|in:planned,ongoing,completed,approved',
            'notes' => 'nullable|string',
        ]);

        $record->update($validated);
        return new TrainingRecordResource($record);
    }

    public function destroy($id)
    {
        $record = EmployeeTrainingRecord::findOrFail($id);
        
        if (!EmployeeScopeService::canAccess($record->employee_id)) {
            abort(403, 'Unauthorized.');
        }

        $record->delete();
        return response()->noContent();
    }
}
