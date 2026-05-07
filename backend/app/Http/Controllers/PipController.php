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
        $this->abortUnlessCanWritePip($request, $request->input('employee_id'));

        $plan = PipPlan::updateOrCreate(['id' => $request->id], $request->all());
        return new PipPlanResource($plan);
    }

    public function storeAction(Request $request)
    {
        $plan = PipPlan::findOrFail($request->input('pip_plan_id'));
        $this->abortUnlessCanWritePip($request, $plan->employee_id);

        $action = PipAction::updateOrCreate(['id' => $request->id], $request->all());
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
