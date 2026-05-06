<?php

namespace App\Http\Controllers;

use App\Http\Resources\HeadcountRequestResource;
use App\Http\Resources\ManpowerPlanResource;
use App\Http\Resources\RecruitmentPipelineResource;
use App\Models\HeadcountRequest;
use App\Models\ManpowerPlan;
use App\Models\RecruitmentPipeline;
use Illuminate\Http\Request;

class ManpowerController extends Controller
{
    public function plans()
    {
        return ManpowerPlanResource::collection(ManpowerPlan::all());
    }

    public function requests()
    {
        return HeadcountRequestResource::collection(HeadcountRequest::all());
    }

    public function pipeline()
    {
        return RecruitmentPipelineResource::collection(RecruitmentPipeline::all());
    }

    public function storePlan(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $plan = ManpowerPlan::updateOrCreate(
            ['period' => $request->period, 'department' => $request->department, 'position' => $request->position, 'seniority' => $request->seniority],
            $request->all()
        );
        return new ManpowerPlanResource($plan);
    }

    public function storeRequest(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $req = HeadcountRequest::updateOrCreate(['id' => $request->id], $request->all());
        return new HeadcountRequestResource($req);
    }

    public function storePipeline(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $pipe = RecruitmentPipeline::updateOrCreate(['id' => $request->id], $request->all());
        return new RecruitmentPipelineResource($pipe);
    }

    public function deletePipeline($id)
    {
        if (!in_array(request()->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        RecruitmentPipeline::destroy($id);
        return response()->noContent();
    }
}
