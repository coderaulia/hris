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
        $this->abortUnlessCanWriteProbation($request, $request->input('employee_id'));

        $review = ProbationReview::updateOrCreate(['id' => $request->id], $request->all());
        return new ProbationReviewResource($review);
    }

    public function storeMonthlyScore(Request $request)
    {
        $review = ProbationReview::findOrFail($request->input('probation_review_id'));
        $this->abortUnlessCanWriteProbation($request, $review->employee_id);

        $score = ProbationMonthlyScore::updateOrCreate(
            ['probation_review_id' => $request->probation_review_id, 'month_no' => $request->month_no],
            $request->all()
        );
        return new ProbationMonthlyScoreResource($score);
    }

    public function storeAttendance(Request $request)
    {
        $review = ProbationReview::findOrFail($request->input('probation_review_id'));
        $this->abortUnlessCanWriteProbation($request, $review->employee_id);

        $att = ProbationAttendanceRecord::updateOrCreate(['id' => $request->id], $request->all());
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
