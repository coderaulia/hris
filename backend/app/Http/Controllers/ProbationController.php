<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProbationAttendanceRecordResource;
use App\Http\Resources\ProbationMonthlyScoreResource;
use App\Http\Resources\ProbationReviewResource;
use App\Models\ProbationAttendanceRecord;
use App\Models\ProbationMonthlyScore;
use App\Models\ProbationReview;
use Illuminate\Http\Request;

class ProbationController extends Controller
{
    public function reviews()
    {
        return ProbationReviewResource::collection(ProbationReview::all());
    }

    public function monthlyScores()
    {
        return ProbationMonthlyScoreResource::collection(ProbationMonthlyScore::all());
    }

    public function attendanceRecords()
    {
        return ProbationAttendanceRecordResource::collection(ProbationAttendanceRecord::all());
    }

    public function storeReview(Request $request)
    {
        $review = ProbationReview::updateOrCreate(['id' => $request->id], $request->all());
        return new ProbationReviewResource($review);
    }

    public function storeMonthlyScore(Request $request)
    {
        $score = ProbationMonthlyScore::updateOrCreate(
            ['probation_review_id' => $request->probation_review_id, 'month_no' => $request->month_no],
            $request->all()
        );
        return new ProbationMonthlyScoreResource($score);
    }

    public function storeAttendance(Request $request)
    {
        $att = ProbationAttendanceRecord::updateOrCreate(['id' => $request->id], $request->all());
        return new ProbationAttendanceRecordResource($att);
    }
}
