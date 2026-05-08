<?php

namespace App\Http\Controllers;

use App\Http\Resources\KpiDefinitionResource;
use App\Http\Resources\KpiDefinitionVersionResource;
use App\Http\Resources\KpiRecordResource;
use App\Http\Resources\EmployeeKpiTargetVersionResource;
use App\Http\Resources\KpiWeightItemResource;
use App\Http\Resources\KpiWeightProfileResource;
use App\Models\Employee;
use App\Models\EmployeeKpiTargetVersion;
use App\Models\KpiDefinition;
use App\Models\KpiDefinitionVersion;
use App\Models\KpiRecord;
use App\Models\KpiWeightItem;
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

    public function storeDefinition(Request $request)
    {
        $validated = $request->validate([
            'id' => 'nullable|uuid',
            'name' => 'required|string',
            'description' => 'nullable|string',
            'category' => 'nullable|string',
            'target' => 'nullable|numeric',
            'unit' => 'nullable|string',
            'effective_period' => 'nullable|string',
            'approval_status' => 'nullable|in:approved,pending,rejected',
            'approval_required' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'latest_version_no' => 'nullable|integer',
            'approved_by' => 'nullable|string',
            'approved_at' => 'nullable|date',
        ]);

        $category = $validated['category'] ?? 'General';
        if (!$this->canManageKpiCategory($category, $request->user())) {
            abort(403, 'Insufficient permissions.');
        }

        $definition = isset($validated['id'])
            ? KpiDefinition::updateOrCreate(['id' => $validated['id']], $validated)
            : KpiDefinition::create($validated);

        return new KpiDefinitionResource($definition);
    }

    public function deleteDefinition(Request $request, $id)
    {
        $definition = KpiDefinition::findOrFail($id);

        if (!$this->canManageKpiCategory($definition->category ?? 'General', $request->user())) {
            abort(403, 'Insufficient permissions.');
        }

        $definition->delete();

        return response()->noContent();
    }

    public function definitionVersions()
    {
        return KpiDefinitionVersionResource::collection(
            KpiDefinitionVersion::orderByDesc('requested_at')->get()
        );
    }

    public function storeDefinitionVersion(Request $request)
    {
        $validated = $request->validate([
            'id' => 'nullable|uuid',
            'kpi_definition_id' => 'required|uuid|exists:kpi_definitions,id',
            'version_no' => 'required|integer',
            'effective_period' => 'required|string',
            'name' => 'required|string',
            'description' => 'nullable|string',
            'category' => 'nullable|string',
            'target' => 'nullable|numeric',
            'unit' => 'nullable|string',
            'status' => 'nullable|in:approved,pending,rejected',
            'request_note' => 'nullable|string',
            'requested_by' => 'nullable|string',
            'requested_at' => 'nullable|date',
            'approved_by' => 'nullable|string',
            'approved_at' => 'nullable|date',
            'rejected_by' => 'nullable|string',
            'rejected_at' => 'nullable|date',
            'rejection_reason' => 'nullable|string',
        ]);

        $category = $validated['category'] ?? 'General';
        if (!$this->canManageKpiCategory($category, $request->user())) {
            abort(403, 'Insufficient permissions.');
        }

        $version = isset($validated['id'])
            ? KpiDefinitionVersion::updateOrCreate(['id' => $validated['id']], $validated)
            : KpiDefinitionVersion::create($validated);

        return new KpiDefinitionVersionResource($version);
    }

    public function updateDefinitionVersion(Request $request, $id)
    {
        $this->abortUnlessKpiApprover($request);

        $version = KpiDefinitionVersion::findOrFail($id);
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'rejection_reason' => 'nullable|string',
            'approved_by' => 'nullable|string',
            'approved_at' => 'nullable|date',
            'rejected_by' => 'nullable|string',
            'rejected_at' => 'nullable|date',
        ]);

        $version->update($validated);

        return new KpiDefinitionVersionResource($version);
    }

    public function targetVersions()
    {
        $query = EmployeeScopeService::scopeQuery(EmployeeKpiTargetVersion::query());

        return EmployeeKpiTargetVersionResource::collection($query->orderByDesc('requested_at')->get());
    }

    public function storeTargetVersion(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|string|exists:employees,employee_id',
            'kpi_id' => 'required|uuid|exists:kpi_definitions,id',
            'effective_period' => 'required|string',
            'target_value' => 'nullable|numeric',
            'unit' => 'nullable|string',
            'version_no' => 'required|integer',
            'status' => 'nullable|in:approved,pending,rejected',
            'request_note' => 'nullable|string',
            'requested_by' => 'nullable|string',
            'requested_at' => 'nullable|date',
            'approved_by' => 'nullable|string',
            'approved_at' => 'nullable|date',
        ]);

        if (!$this->canSubmitTargetVersion($validated['employee_id'], $request->user())) {
            abort(403, 'Insufficient permissions.');
        }

        $version = EmployeeKpiTargetVersion::create($validated);

        return new EmployeeKpiTargetVersionResource($version);
    }

    public function updateTargetVersion(Request $request, $id)
    {
        $this->abortUnlessKpiApprover($request);

        $version = EmployeeKpiTargetVersion::findOrFail($id);
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'rejection_reason' => 'nullable|string',
            'approved_by' => 'nullable|string',
            'approved_at' => 'nullable|date',
            'rejected_by' => 'nullable|string',
            'rejected_at' => 'nullable|date',
        ]);

        $version->update($validated);

        return new EmployeeKpiTargetVersionResource($version);
    }

    public function records(Request $request)
    {
        $query = EmployeeScopeService::scopeQuery(KpiRecord::query());

        return KpiRecordResource::collection($query->get());
    }

    public function storeRecord(Request $request)
    {
        $validated = $request->validate([
            'id' => 'nullable|uuid',
            'employee_id' => 'required|string|exists:employees,employee_id',
            'kpi_id' => 'required|uuid|exists:kpi_definitions,id',
            'period' => 'required|string',
            'value' => 'required|numeric',
            'notes' => 'nullable|string',
            'target_snapshot' => 'nullable|numeric',
            'kpi_name_snapshot' => 'nullable|string',
            'kpi_unit_snapshot' => 'nullable|string',
            'kpi_category_snapshot' => 'nullable|string',
            'definition_version_id' => 'nullable|uuid|exists:kpi_definition_versions,id',
            'target_version_id' => 'nullable|uuid|exists:employee_kpi_target_versions,id',
            'updated_by' => 'nullable|string',
        ]);

        if (!EmployeeScopeService::canAccess($validated['employee_id'])) {
            abort(403, 'Unauthorized.');
        }

        $record = isset($validated['id'])
            ? KpiRecord::updateOrCreate(['id' => $validated['id']], $validated)
            : KpiRecord::updateOrCreate(
                ['employee_id' => $validated['employee_id'], 'kpi_id' => $validated['kpi_id'], 'period' => $validated['period']],
                [
                    ...$validated,
                    'submitted_by' => Auth::user()->employee_id,
                    'submitted_at' => now(),
                    'updated_by' => $validated['updated_by'] ?? Auth::user()->employee_id,
                ]
            );

        return new KpiRecordResource($record);
    }

    public function deleteRecord($id)
    {
        $record = KpiRecord::findOrFail($id);

        if (!EmployeeScopeService::canAccess($record->employee_id)) {
            abort(403, 'Unauthorized.');
        }

        $record->delete();

        return response()->noContent();
    }

    public function weightProfiles()
    {
        return KpiWeightProfileResource::collection(KpiWeightProfile::with('items')->get());
    }

    public function storeWeightProfile(Request $request)
    {
        $this->abortUnlessKpiApprover($request);

        $validated = $request->validate([
            'id' => 'nullable|uuid',
            'profile_name' => 'required|string',
            'department' => 'nullable|string',
            'position' => 'nullable|string',
            'active' => 'nullable|boolean',
        ]);

        $profile = isset($validated['id'])
            ? KpiWeightProfile::updateOrCreate(['id' => $validated['id']], $validated)
            : KpiWeightProfile::updateOrCreate(
                [
                    'profile_name' => $validated['profile_name'],
                    'department' => $validated['department'] ?? '',
                    'position' => $validated['position'] ?? '',
                ],
                $validated
            );

        return new KpiWeightProfileResource($profile->load('items'));
    }

    public function storeWeightItems(Request $request, $profileId)
    {
        $this->abortUnlessKpiApprover($request);

        KpiWeightProfile::findOrFail($profileId);

        $validated = $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'nullable|uuid',
            'items.*.profile_id' => 'required|uuid|exists:kpi_weight_profiles,id',
            'items.*.kpi_id' => 'required|uuid|exists:kpi_definitions,id',
            'items.*.weight_pct' => 'required|numeric',
        ]);

        $items = collect($validated['items'])
            ->filter(fn ($item) => $item['profile_id'] === $profileId)
            ->map(function ($item) {
                return isset($item['id'])
                    ? KpiWeightItem::updateOrCreate(['id' => $item['id']], $item)
                    : KpiWeightItem::updateOrCreate(
                        ['profile_id' => $item['profile_id'], 'kpi_id' => $item['kpi_id']],
                        $item
                    );
            });

        return KpiWeightItemResource::collection($items);
    }

    private function canManageKpiCategory(string $category, $user): bool
    {
        if (($user->role ?? '') === 'superadmin' || EmployeeScopeService::isHrUser($user)) {
            return true;
        }

        $normalizedCategory = trim($category) ?: 'General';
        if (($user->role ?? '') !== 'manager') {
            return false;
        }

        if ($normalizedCategory === 'General') {
            return true;
        }

        return Employee::where('role', 'employee')
            ->where('position', $normalizedCategory)
            ->where(function ($query) use ($user) {
                $query->where('manager_id', $user->employee_id)
                    ->orWhere('department', $user->department);
            })
            ->exists();
    }

    private function canSubmitTargetVersion(string $employeeId, $user): bool
    {
        if (($user->role ?? '') === 'superadmin' || EmployeeScopeService::isHrUser($user)) {
            return true;
        }

        return ($user->role ?? '') === 'manager' && EmployeeScopeService::canAccess($employeeId);
    }

    private function abortUnlessKpiApprover(Request $request): void
    {
        $user = $request->user();
        if (($user->role ?? '') !== 'superadmin' && !EmployeeScopeService::isHrUser($user)) {
            abort(403, 'Insufficient permissions.');
        }
    }
}
