<?php

namespace App\Http\Controllers;

use App\Http\Resources\PerformanceScoreResource;
use App\Models\EmployeePerformanceScore;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;

class PerformanceScoreController extends Controller
{
    public function index(Request $request)
    {
        $query = EmployeeScopeService::scopeQuery(EmployeePerformanceScore::query());

        return PerformanceScoreResource::collection($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|string|exists:employees,employee_id',
            'period' => 'required|string',
            'score_type' => 'required|string',
            'total_score' => 'required|numeric',
            'detail' => 'nullable|array',
        ]);

        if (!EmployeeScopeService::canAccess($validated['employee_id'])) {
            abort(403, 'Unauthorized.');
        }

        $score = EmployeePerformanceScore::updateOrCreate(
            ['employee_id' => $validated['employee_id'], 'period' => $validated['period'], 'score_type' => $validated['score_type']],
            [
                'total_score' => $validated['total_score'],
                'detail' => $validated['detail'] ?? [],
                'calculated_by' => Auth::user()->employee_id,
                'calculated_at' => now(),
            ]
        );

        return new PerformanceScoreResource($score);
    }
}
