<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProbationAttendanceRecordResource;
use App\Http\Resources\ProbationMonthlyScoreResource;
use App\Http\Resources\ProbationReviewResource;
use App\Models\ProbationAttendanceRecord;
use App\Models\ProbationMonthlyScore;
use App\Models\ProbationReview;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;

class ProbationController extends Controller
{
    public function reviews()
    {
        $query = EmployeeScopeService::scopeQuery(ProbationReview::query());

        return ProbationReviewResource::collection($query->get());
    }

    public function monthlyScores()
    {
        $reviewIds = EmployeeScopeService::scopeQuery(ProbationReview::query())->pluck('id');
        $query = ProbationMonthlyScore::whereIn('probation_review_id', $reviewIds);

        return ProbationMonthlyScoreResource::collection($query->get());
    }

    public function attendanceRecords()
    {
        $reviewIds = EmployeeScopeService::scopeQuery(ProbationReview::query())->pluck('id');
        $query = ProbationAttendanceRecord::whereIn('probation_review_id', $reviewIds);

        return ProbationAttendanceRecordResource::collection($query->get());
    }

    public function storeReview(Request $request)
    {
        $validated = $request->validate([
            'id'                   => ['nullable', 'uuid'],
            'employee_id'          => ['required', 'string', 'exists:employees,employee_id'],
            'review_period_start'  => ['nullable', 'date_format:Y-m-d'],
            'review_period_end'    => ['nullable', 'date_format:Y-m-d'],
            'quantitative_score'   => ['nullable', 'numeric'],
            'qualitative_score'    => ['nullable', 'numeric'],
            'final_score'          => ['nullable', 'numeric'],
            'decision'             => ['nullable', 'in:pending,pass,extend,fail'],
            'manager_notes'        => ['nullable', 'string'],
            'reviewed_by'          => ['nullable', 'string', 'max:128'],
            'reviewed_at'          => ['nullable', 'date'],
        ]);

        $this->abortUnlessCanWriteProbation($request, $validated['employee_id']);

        $review = ProbationReview::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
        return new ProbationReviewResource($review);
    }

    public function storeMonthlyScore(Request $request)
    {
        $validated = $request->validate([
            'probation_review_id'     => ['required', 'uuid', 'exists:probation_reviews,id'],
            'month_no'                => ['required', 'integer', 'min:1', 'max:3'],
            'period_start'            => ['nullable', 'date_format:Y-m-d'],
            'period_end'              => ['nullable', 'date_format:Y-m-d'],
            'work_performance_score'  => ['nullable', 'numeric'],
            'managing_task_score'     => ['nullable', 'numeric'],
            'manager_qualitative_text' => ['nullable', 'string'],
            'manager_note'            => ['nullable', 'string'],
            'attendance_deduction'    => ['nullable', 'numeric'],
            'attitude_score'          => ['nullable', 'numeric'],
            'monthly_total'           => ['nullable', 'numeric'],
        ]);

        $review = ProbationReview::findOrFail($validated['probation_review_id']);
        $this->abortUnlessCanWriteProbation($request, $review->employee_id);

        $score = ProbationMonthlyScore::updateOrCreate(
            ['probation_review_id' => $validated['probation_review_id'], 'month_no' => $validated['month_no']],
            $validated
        );
        return new ProbationMonthlyScoreResource($score);
    }

    public function storeAttendance(Request $request)
    {
        $validated = $request->validate([
            'id'                  => ['nullable', 'uuid'],
            'probation_review_id' => ['required', 'uuid', 'exists:probation_reviews,id'],
            'month_no'            => ['required', 'integer', 'min:1', 'max:3'],
            'event_date'          => ['nullable', 'date_format:Y-m-d'],
            'event_type'          => ['nullable', 'string', 'max:128'],
            'qty'                 => ['nullable', 'numeric'],
            'deduction_points'    => ['nullable', 'numeric'],
            'note'                => ['nullable', 'string'],
            'entered_by'          => ['nullable', 'string', 'max:128'],
        ]);

        $review = ProbationReview::findOrFail($validated['probation_review_id']);
        $this->abortUnlessCanWriteProbation($request, $review->employee_id);

        $att = ProbationAttendanceRecord::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
        return new ProbationAttendanceRecordResource($att);
    }

    private function abortUnlessCanWriteProbation(Request $request, ?string $employeeId): void
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
