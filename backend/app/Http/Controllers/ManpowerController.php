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

        $validated = $request->validate([
            'period'             => ['required', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'department'         => ['required', 'string', 'max:255'],
            'position'           => ['required', 'string', 'max:255'],
            'seniority'          => ['required', 'string', 'max:128'],
            'planned_headcount'  => ['nullable', 'integer', 'min:0'],
            'approved_headcount' => ['nullable', 'integer', 'min:0'],
            'status'             => ['nullable', 'in:draft,submitted,approved,active,closed'],
            'notes'              => ['nullable', 'string'],
            'created_by'         => ['nullable', 'string', 'max:128'],
            'updated_by'         => ['nullable', 'string', 'max:128'],
        ]);

        $plan = ManpowerPlan::updateOrCreate(
            ['period' => $validated['period'], 'department' => $validated['department'], 'position' => $validated['position'], 'seniority' => $validated['seniority']],
            $validated
        );
        return new ManpowerPlanResource($plan);
    }

    public function storeRequest(Request $request)
    {
        $this->abortUnlessCanSubmitRequest($request);

        $validated = $request->validate([
            'id'              => ['nullable', 'uuid'],
            'plan_id'         => ['nullable', 'uuid', 'exists:manpower_plans,id'],
            'request_code'    => ['nullable', 'string', 'max:128'],
            'department'      => ['required', 'string', 'max:255'],
            'position'        => ['required', 'string', 'max:255'],
            'seniority'       => ['nullable', 'string', 'max:128'],
            'requested_count' => ['nullable', 'integer', 'min:1'],
            'business_reason' => ['nullable', 'string'],
            'priority'        => ['nullable', 'in:low,normal,high,urgent'],
            'requested_by'    => ['nullable', 'string', 'max:128'],
            'approved_by'     => ['nullable', 'string', 'max:128'],
            'approval_status' => ['nullable', 'in:pending,approved,rejected,cancelled'],
            'approval_note'   => ['nullable', 'string'],
            'target_hire_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $req = HeadcountRequest::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
        return new HeadcountRequestResource($req);
    }

    public function storePipeline(Request $request)
    {
        $this->abortUnlessHrOperator($request);

        $validated = $request->validate([
            'id'                  => ['nullable', 'uuid'],
            'request_id'          => ['required', 'uuid', 'exists:headcount_requests,id'],
            'candidate_name'      => ['nullable', 'string', 'max:255'],
            'stage'               => ['nullable', 'in:requested,sourcing,screening,interview,offer,hired,closed'],
            'source'              => ['nullable', 'string', 'max:255'],
            'owner_id'            => ['nullable', 'string', 'max:128'],
            'offer_status'        => ['nullable', 'string', 'max:128'],
            'expected_start_date' => ['nullable', 'date_format:Y-m-d'],
            'notes'               => ['nullable', 'string'],
        ]);

        $pipe = RecruitmentPipeline::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
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
