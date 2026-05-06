<?php

namespace App\Http\Controllers\Assessment;

use App\Http\Controllers\Controller;
use App\Http\Resources\AssessmentHistoryResource;
use App\Http\Resources\AssessmentResource;
use App\Http\Resources\AssessmentScoreResource;
use App\Models\EmployeeAssessment;
use App\Models\EmployeeAssessmentHistory;
use App\Models\EmployeeAssessmentScore;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AssessmentController extends Controller
{
    public function index(Request $request)
    {
        $query = EmployeeAssessment::query();
        
        // Scope by employee accessibility
        $user = $request->user();
        if ($user->role !== 'superadmin') {
            $query->whereIn('employee_id', function ($sub) use ($user) {
                $sub->select('employee_id')
                    ->from('employees')
                    ->where('manager_id', $user->employee_id)
                    ->orWhere('employee_id', $user->employee_id);
                
                if ($user->role === 'manager') {
                    $sub->orWhere('department', $user->department);
                }
            });
        }

        return AssessmentResource::collection($query->get());
    }

    public function scores()
    {
        $accessibleIds = EmployeeScopeService::scopeQuery(EmployeeAssessment::query())->pluck('id');
        $scores = EmployeeAssessmentScore::whereIn('assessment_id', $accessibleIds)->get();
        return AssessmentScoreResource::collection($scores);
    }

    public function history()
    {
        $query = EmployeeScopeService::scopeQuery(EmployeeAssessmentHistory::query());
        return AssessmentHistoryResource::collection($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|string|exists:employees,employee_id',
            'assessment_type' => 'required|in:manager,self',
            'percentage' => 'required|numeric',
            'seniority' => 'nullable|string',
            'assessed_at' => 'nullable|date',
            'assessed_by' => 'nullable|string',
            'source_date' => 'nullable|string',
            'scores' => 'nullable|array',
            'scores.*.competency_name' => 'required|string',
            'scores.*.score' => 'required|numeric',
            'scores.*.note' => 'nullable|string',
        ]);

        if (!EmployeeScopeService::canAccess($validated['employee_id'])) {
            abort(403, 'Unauthorized to assess this employee.');
        }

        return DB::transaction(function () use ($validated) {
            $assessment = EmployeeAssessment::updateOrCreate(
                ['employee_id' => $validated['employee_id'], 'assessment_type' => $validated['assessment_type']],
                array_intersect_key($validated, array_flip(['percentage', 'seniority', 'assessed_at', 'assessed_by', 'source_date']))
            );

            if (isset($validated['scores'])) {
                $assessment->scores()->delete();
                foreach ($validated['scores'] as $scoreData) {
                    $assessment->scores()->create($scoreData);
                }
            }

            return new AssessmentResource($assessment);
        });
    }
}
