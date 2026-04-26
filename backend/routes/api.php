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

        // ... we'll add more module routes in Phase 4
    });
});
