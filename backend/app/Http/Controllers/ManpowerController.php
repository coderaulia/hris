<?php

namespace App\Http\Controllers;

use App\Http\Resources\HeadcountRequestResource;
use App\Http\Resources\ManpowerPlanResource;
use App\Http\Resources\RecruitmentPipelineResource;
use App\Models\HeadcountRequest;
use App\Models\ManpowerPlan;
use App\Models\RecruitmentPipeline;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;

class ManpowerController extends Controller
{
    public function plans(Request $request)
    {
        $query = $this->scopeDepartmentRows(ManpowerPlan::query(), $request->user());

        return ManpowerPlanResource::collection($query->get());
    }

    public function requests(Request $request)
    {
        $query = $this->scopeHeadcountRequests(HeadcountRequest::query(), $request->user());

        return HeadcountRequestResource::collection($query->get());
    }

    public function pipeline(Request $request)
    {
        $requestIds = $this->scopeHeadcountRequests(HeadcountRequest::query(), $request->user())->pluck('id');
        $query = RecruitmentPipeline::whereIn('request_id', $requestIds);

        return RecruitmentPipelineResource::collection($query->get());
    }

    public function storePlan(Request $request)
    {
        $this->abortUnlessHrOperator($request);

        $plan = ManpowerPlan::updateOrCreate(
            ['period' => $request->period, 'department' => $request->department, 'position' => $request->position, 'seniority' => $request->seniority],
            $request->all()
        );
        return new ManpowerPlanResource($plan);
    }

    public function storeRequest(Request $request)
    {
        $this->abortUnlessCanSubmitRequest($request);

        $req = HeadcountRequest::updateOrCreate(['id' => $request->id], $request->all());
        return new HeadcountRequestResource($req);
    }

    public function storePipeline(Request $request)
    {
        $this->abortUnlessHrOperator($request);

        $pipe = RecruitmentPipeline::updateOrCreate(['id' => $request->id], $request->all());
        return new RecruitmentPipelineResource($pipe);
    }

    public function deletePipeline(Request $request, $id)
    {
        $this->abortUnlessHrOperator($request);

        RecruitmentPipeline::destroy($id);
        return response()->noContent();
    }

    private function canReadAllManpower($user): bool
    {
        return in_array($user->role ?? '', ['superadmin', 'director'], true)
            || EmployeeScopeService::isHrUser($user);
    }

    private function scopeDepartmentRows($query, $user)
    {
        if ($this->canReadAllManpower($user)) {
            return $query;
        }

        if (($user->role ?? '') === 'manager') {
            return $query->where('department', $user->department);
        }

        return $query->whereRaw('1 = 0');
    }

    private function scopeHeadcountRequests($query, $user)
    {
        if ($this->canReadAllManpower($user)) {
            return $query;
        }

        if (($user->role ?? '') === 'manager') {
            return $query->where(function ($q) use ($user) {
                $q->where('department', $user->department)
                    ->orWhere('requested_by', $user->employee_id);
            });
        }

        return $query->where('requested_by', $user->employee_id ?? '');
    }

    private function abortUnlessHrOperator(Request $request): void
    {
        $user = $request->user();
        if (($user->role ?? '') !== 'superadmin' && !EmployeeScopeService::isHrUser($user)) {
            abort(403, 'Insufficient permissions.');
        }
    }

    private function abortUnlessCanSubmitRequest(Request $request): void
    {
        $user = $request->user();

        if (($user->role ?? '') === 'superadmin' || EmployeeScopeService::isHrUser($user)) {
            return;
        }

        $department = (string) $request->input('department', '');
        $requestedBy = (string) $request->input('requested_by', '');
        if (($user->role ?? '') === 'manager'
            && $department === (string) $user->department
            && ($requestedBy === '' || $requestedBy === (string) $user->employee_id)) {
            return;
        }

        abort(403, 'Insufficient permissions.');
    }
}
