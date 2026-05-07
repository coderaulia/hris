<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('probation_reviews', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->float('quantitative_score')->nullable();
            $table->float('qualitative_score')->nullable();
            $table->float('final_score')->nullable();
            $table->dateTime('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('probation_monthly_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('probation_review_id');
            $table->integer('month_no');
            $table->float('score')->nullable();
            $table->timestamps();
        });

        Schema::create('probation_attendance_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('probation_review_id');
            $table->date('date')->nullable();
            $table->string('status')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_definitions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category')->nullable();
            $table->float('target')->nullable();
            $table->string('unit')->nullable();
            $table->string('effective_period')->nullable();
            $table->string('approval_status')->nullable();
            $table->boolean('approval_required')->nullable();
            $table->boolean('is_active')->nullable();
            $table->integer('latest_version_no')->nullable();
            $table->string('approved_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_definition_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('kpi_id')->nullable();
            $table->integer('version_no')->nullable();
            $table->string('status')->nullable();
            $table->dateTime('requested_at')->nullable();
            $table->timestamps();
        });

        Schema::create('employee_kpi_target_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id')->nullable();
            $table->uuid('kpi_id')->nullable();
            $table->string('status')->nullable();
            $table->dateTime('requested_at')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->uuid('kpi_id');
            $table->string('period');
            $table->float('value')->nullable();
            $table->text('notes')->nullable();
            $table->float('target_snapshot')->nullable();
            $table->string('kpi_name_snapshot')->nullable();
            $table->string('kpi_unit_snapshot')->nullable();
            $table->string('kpi_category_snapshot')->nullable();
            $table->uuid('definition_version_id')->nullable();
            $table->uuid('target_version_id')->nullable();
            $table->string('submitted_by')->nullable();
            $table->dateTime('submitted_at')->nullable();
            $table->string('updated_by')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_weight_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('profile_name');
            $table->string('department')->nullable();
            $table->string('position')->nullable();
            $table->boolean('active')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_weight_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('profile_id');
            $table->uuid('kpi_id');
            $table->float('weight')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_weight_items');
        Schema::dropIfExists('kpi_weight_profiles');
        Schema::dropIfExists('kpi_records');
        Schema::dropIfExists('employee_kpi_target_versions');
        Schema::dropIfExists('kpi_definition_versions');
        Schema::dropIfExists('kpi_definitions');
        Schema::dropIfExists('probation_attendance_records');
        Schema::dropIfExists('probation_monthly_scores');
        Schema::dropIfExists('probation_reviews');
    }
};
