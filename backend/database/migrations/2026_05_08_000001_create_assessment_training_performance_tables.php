<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_assessments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('assessment_type');
            $table->float('percentage')->nullable();
            $table->string('seniority')->nullable();
            $table->dateTime('assessed_at')->nullable();
            $table->string('assessed_by')->nullable();
            $table->string('source_date')->nullable();
            $table->timestamps();

            $table->index('employee_id');
        });

        Schema::create('employee_assessment_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('assessment_id');
            $table->string('competency_name');
            $table->float('score');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index('assessment_id');
        });

        Schema::create('employee_assessment_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('event_type')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index('employee_id');
        });

        Schema::create('employee_training_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('course');
            $table->string('start_date')->nullable();
            $table->string('end_date')->nullable();
            $table->string('provider')->nullable();
            $table->string('status');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('employee_id');
        });

        Schema::create('employee_performance_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('period');
            $table->string('score_type');
            $table->float('total_score');
            $table->json('detail')->nullable();
            $table->string('calculated_by')->nullable();
            $table->dateTime('calculated_at')->nullable();
            $table->timestamps();

            $table->index('employee_id');
            $table->unique(['employee_id', 'period', 'score_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_performance_scores');
        Schema::dropIfExists('employee_training_records');
        Schema::dropIfExists('employee_assessment_history');
        Schema::dropIfExists('employee_assessment_scores');
        Schema::dropIfExists('employee_assessments');
    }
};
