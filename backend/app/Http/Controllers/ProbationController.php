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
        return ProbationMonthlyScoreResource::collection(
            ProbationMonthlyScore::whereIn('probation_review_id', $reviewIds)->get()
        );
    }

    public function attendanceRecords()
    {
        $reviewIds = EmployeeScopeService::scopeQuery(ProbationReview::query())->pluck('id');
        return ProbationAttendanceRecordResource::collection(
            ProbationAttendanceRecord::whereIn('probation_review_id', $reviewIds)->get()
        );
    }

    public function storeReview(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $review = ProbationReview::updateOrCreate(['id' => $request->id], $request->all());
        return new ProbationReviewResource($review);
    }

    public function storeMonthlyScore(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $score = ProbationMonthlyScore::updateOrCreate(
            ['probation_review_id' => $request->probation_review_id, 'month_no' => $request->month_no],
            $request->all()
        );
        return new ProbationMonthlyScoreResource($score);
    }

    public function storeAttendance(Request $request)
    {
        if (!in_array($request->user()->role, ['superadmin', 'manager'])) {
            abort(403, 'Insufficient permissions.');
        }
        $att = ProbationAttendanceRecord::updateOrCreate(['id' => $request->id], $request->all());
        return new ProbationAttendanceRecordResource($att);
    }
}
