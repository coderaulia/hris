<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Employee\EmployeeController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // --- Public ---
    Route::post('/auth/login', [LoginController::class, 'login']);

    // --- Authenticated ---
    Route::middleware('auth:sanctum')->group(function () {
        // Auth
        Route::post('/auth/logout', [LoginController::class, 'logout']);
        Route::get('/auth/me', [LoginController::class, 'me']);

        // Settings
        Route::get('/settings', [\App\Http\Controllers\AppSettingController::class, 'index']);
        Route::get('/settings/{key}', [\App\Http\Controllers\AppSettingController::class, 'show']);
        Route::put('/settings/{key}', [\App\Http\Controllers\AppSettingController::class, 'update']);
        Route::post('/settings/bulk', [\App\Http\Controllers\AppSettingController::class, 'bulkUpdate']);

        // Employees
        Route::apiResource('employees', EmployeeController::class);
        Route::apiResource('training-records', \App\Http\Controllers\Employee\TrainingRecordController::class);

        // Assessments
        Route::get('/assessments', [\App\Http\Controllers\Assessment\AssessmentController::class, 'index']);
        Route::post('/assessments', [\App\Http\Controllers\Assessment\AssessmentController::class, 'store']);
        Route::get('/assessment-scores', [\App\Http\Controllers\Assessment\AssessmentController::class, 'scores']);
        Route::get('/assessment-history', [\App\Http\Controllers\Assessment\AssessmentController::class, 'history']);

        // KPIs
        Route::get('/kpis', [\App\Http\Controllers\KpiController::class, 'index']);
        Route::get('/kpi-records', [\App\Http\Controllers\KpiController::class, 'records']);
        Route::post('/kpi-records', [\App\Http\Controllers\KpiController::class, 'storeRecord']);
        Route::get('/kpi-weight-profiles', [\App\Http\Controllers\KpiController::class, 'weightProfiles']);

        // Performance Scores
        Route::get('/performance-scores', [\App\Http\Controllers\PerformanceScoreController::class, 'index']);
        Route::post('/performance-scores', [\App\Http\Controllers\PerformanceScoreController::class, 'store']);

        // Competencies
        Route::get('/competency-config', [\App\Http\Controllers\CompetencyController::class, 'index']);
        Route::put('/competency-config/{position}', [\App\Http\Controllers\CompetencyController::class, 'update']);

        // Activity Logs
        Route::get('/activity-logs', [\App\Http\Controllers\ActivityLogController::class, 'index']);
        Route::post('/activity-logs', [\App\Http\Controllers\ActivityLogController::class, 'store']);

        // Manpower Planning
        Route::get('/manpower-plans', [\App\Http\Controllers\ManpowerController::class, 'plans']);
        Route::post('/manpower-plans', [\App\Http\Controllers\ManpowerController::class, 'storePlan']);
        Route::get('/headcount-requests', [\App\Http\Controllers\ManpowerController::class, 'requests']);
        Route::post('/headcount-requests', [\App\Http\Controllers\ManpowerController::class, 'storeRequest']);
        Route::get('/recruitment-pipeline', [\App\Http\Controllers\ManpowerController::class, 'pipeline']);
        Route::post('/recruitment-pipeline', [\App\Http\Controllers\ManpowerController::class, 'storePipeline']);

        // Probation
        Route::get('/probation-reviews', [\App\Http\Controllers\ProbationController::class, 'reviews']);
        Route::post('/probation-reviews', [\App\Http\Controllers\ProbationController::class, 'storeReview']);
        Route::get('/probation-monthly-scores', [\App\Http\Controllers\ProbationController::class, 'monthlyScores']);
        Route::post('/probation-monthly-scores', [\App\Http\Controllers\ProbationController::class, 'storeMonthlyScore']);
        Route::get('/probation-attendance-records', [\App\Http\Controllers\ProbationController::class, 'attendanceRecords']);
        Route::post('/probation-attendance-records', [\App\Http\Controllers\ProbationController::class, 'storeAttendance']);
        // PIP
        Route::get('/pip-plans', [\App\Http\Controllers\PipController::class, 'index']);
        Route::post('/pip-plans', [\App\Http\Controllers\PipController::class, 'store']);
        Route::get('/pip-actions', [\App\Http\Controllers\PipController::class, 'actions']);
        Route::post('/pip-actions', [\App\Http\Controllers\PipController::class, 'storeAction']);
        // HR Documents
        Route::get('/hr-document-templates', [\App\Http\Controllers\HrDocumentController::class, 'templates']);
        Route::post('/hr-document-templates', [\App\Http\Controllers\HrDocumentController::class, 'storeTemplate']);
        Route::delete('/hr-document-templates/{id}', [\App\Http\Controllers\HrDocumentController::class, 'deleteTemplate']);
        Route::get('/hr-document-options', [\App\Http\Controllers\HrDocumentController::class, 'options']);
        Route::get('/hr-payroll-records', [\App\Http\Controllers\HrDocumentController::class, 'payrollRecords']);
        Route::post('/hr-payroll-records/import', [\App\Http\Controllers\HrDocumentController::class, 'importPayrollRecords']);
    });
});
