<?php

namespace App\Http\Controllers;

use App\Http\Resources\PipActionResource;
use App\Http\Resources\PipPlanResource;
use App\Models\PipAction;
use App\Models\PipPlan;
use Illuminate\Http\Request;

class PipController extends Controller
{
    public function index()
    {
        return PipPlanResource::collection(PipPlan::all());
    }

    public function actions()
    {
        return PipActionResource::collection(PipAction::all());
    }

    public function store(Request $request)
    {
        $plan = PipPlan::updateOrCreate(['id' => $request->id], $request->all());
        return new PipPlanResource($plan);
    }

    public function storeAction(Request $request)
    {
        $action = PipAction::updateOrCreate(['id' => $request->id], $request->all());
        return new PipActionResource($action);
    }
}
