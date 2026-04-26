<?php

namespace App\Http\Controllers;

use App\Http\Resources\KpiDefinitionResource;
use App\Http\Resources\KpiRecordResource;
use App\Http\Resources\KpiWeightProfileResource;
use App\Models\KpiDefinition;
use App\Models\KpiRecord;
use App\Models\KpiWeightProfile;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class KpiController extends Controller
{
    public function index()
    {
        return KpiDefinitionResource::collection(KpiDefinition::all());
    }

    public function records(Request $request)
    {
        $query = KpiRecord::query();
        
        $user = $request->user();
        if ($user->role !== 'superadmin') {
            $query->whereIn('employee_id', function($sub) use ($user) {
                $sub->select('employee_id')->from('employees')
                    ->where('manager_id', $user->employee_id)
                    ->orWhere('employee_id', $user->employee_id);
            });
        }

        return KpiRecordResource::collection($query->get());
    }

    public function storeRecord(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|string|exists:employees,employee_id',
            'kpi_id' => 'required|uuid|exists:kpi_definitions,id',
            'period' => 'required|string',
            'value' => 'required|numeric',
            'notes' => 'nullable|string',
        ]);

        if (!EmployeeScopeService::canAccess($validated['employee_id'])) {
            abort(403, 'Unauthorized.');
        }

        $record = KpiRecord::updateOrCreate(
            ['employee_id' => $validated['employee_id'], 'kpi_id' => $validated['kpi_id'], 'period' => $validated['period']],
            [
                'value' => $validated['value'],
                'notes' => $validated['notes'],
                'submitted_by' => Auth::user()->employee_id,
                'submitted_at' => now(),
                'updated_by' => Auth::user()->employee_id,
            ]
        );

        return new KpiRecordResource($record);
    }

    public function weightProfiles()
    {
        return KpiWeightProfileResource::collection(KpiWeightProfile::with('items')->get());
    }
}
