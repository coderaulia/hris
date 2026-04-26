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

        // Employees
        Route::apiResource('employees', EmployeeController::class);

        // ... we'll add more module routes in Phase 2
    });
});
