<?php

namespace App\Http\Controllers;

use App\Http\Resources\PipActionResource;
use App\Http\Resources\PipPlanResource;
use App\Models\PipAction;
use App\Models\PipPlan;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;

class PipController extends Controller
{
    public function index()
    {
        $query = EmployeeScopeService::scopeQuery(PipPlan::query());

        return PipPlanResource::collection($query->get());
    }

    public function actions()
    {
        $planIds = EmployeeScopeService::scopeQuery(PipPlan::query())->pluck('id');
        $query = PipAction::whereIn('pip_plan_id', $planIds);

        return PipActionResource::collection($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'id'               => ['nullable', 'uuid'],
            'employee_id'      => ['required', 'string', 'exists:employees,employee_id'],
            'trigger_reason'   => ['nullable', 'string'],
            'trigger_period'   => ['nullable', 'string', 'max:128'],
            'start_date'       => ['nullable', 'date_format:Y-m-d'],
            'target_end_date'  => ['nullable', 'date_format:Y-m-d'],
            'status'           => ['nullable', 'in:active,completed,extended,escalated,cancelled'],
            'owner_manager_id' => ['nullable', 'string', 'max:128'],
            'summary'          => ['nullable', 'string'],
            'closed_at'        => ['nullable', 'date'],
        ]);

        $this->abortUnlessCanWritePip($request, $validated['employee_id']);

        $plan = PipPlan::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
        return new PipPlanResource($plan);
    }

    public function storeAction(Request $request)
    {
        $validated = $request->validate([
            'id'               => ['nullable', 'uuid'],
            'pip_plan_id'      => ['required', 'uuid', 'exists:pip_plans,id'],
            'action_title'     => ['required', 'string', 'max:255'],
            'action_detail'    => ['nullable', 'string'],
            'due_date'         => ['nullable', 'date_format:Y-m-d'],
            'progress_pct'     => ['nullable', 'numeric', 'min:0', 'max:100'],
            'status'           => ['nullable', 'in:todo,in_progress,done,blocked'],
            'checkpoint_note'  => ['nullable', 'string'],
        ]);

        $plan = PipPlan::findOrFail($validated['pip_plan_id']);
        $this->abortUnlessCanWritePip($request, $plan->employee_id);

        $action = PipAction::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
        return new PipActionResource($action);
    }

    private function abortUnlessCanWritePip(Request $request, ?string $employeeId): void
    {
        $role = $request->user()->role ?? '';
        if (!in_array($role, ['superadmin', 'manager'], true) && !EmployeeScopeService::isHrUser($request->user())) {
            abort(403, 'Insufficient permissions.');
        }

        if (!$employeeId || !EmployeeScopeService::canAccess($employeeId)) {
            abort(403, 'Unauthorized.');
        }
    }
}
