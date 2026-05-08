<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function summary()
    {
        $row = DB::selectOne('SELECT * FROM dashboard_summary LIMIT 1');

        return response()->json([
            'success' => true,
            'data' => $row ? (array) $row : null,
        ]);
    }

    public function probationExpiry(Request $request)
    {
        $limit = (int) $request->query('limit', 8);
        $limit = max(1, min($limit, 100));

        $rows = DB::select(
            'SELECT employee_id, name, department, position, probation_end_date, days_remaining
             FROM dashboard_probation_expiry
             LIMIT ?',
            [$limit]
        );

        return response()->json([
            'success' => true,
            'data' => array_map(fn($r) => (array) $r, $rows),
        ]);
    }

    public function assessmentCoverage()
    {
        $rows = DB::select(
            'SELECT department, active_employee_count, covered_employee_count, missing_employee_count, coverage_pct
             FROM dashboard_assessment_coverage
             ORDER BY coverage_pct ASC, department ASC'
        );

        return response()->json([
            'success' => true,
            'data' => array_map(fn($r) => (array) $r, $rows),
        ]);
    }
}
