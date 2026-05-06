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
        return PipActionResource::collection(
            PipAction::whereIn('pip_plan_id', $planIds)->get()
        );
    }

    public function store(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $plan = PipPlan::updateOrCreate(['id' => $request->id], $request->all());
        return new PipPlanResource($plan);
    }

    public function storeAction(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $action = PipAction::updateOrCreate(['id' => $request->id], $request->all());
        return new PipActionResource($action);
    }
}
