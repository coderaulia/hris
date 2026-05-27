<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('probation_reviews', function (Blueprint $table) {
            $table->index('employee_id');
        });

        Schema::table('probation_monthly_scores', function (Blueprint $table) {
            $table->index('probation_review_id');
        });

        Schema::table('probation_attendance_records', function (Blueprint $table) {
            $table->index('probation_review_id');
        });

        Schema::table('kpi_definition_versions', function (Blueprint $table) {
            $table->index('kpi_id');
        });

        Schema::table('employee_kpi_target_versions', function (Blueprint $table) {
            $table->index('employee_id');
            $table->index('kpi_id');
        });

        Schema::table('kpi_records', function (Blueprint $table) {
            $table->index(['employee_id', 'period']);
            $table->index('kpi_id');
        });

        Schema::table('kpi_weight_items', function (Blueprint $table) {
            $table->index('profile_id');
            $table->index('kpi_id');
        });
    }

    public function down(): void
    {
        Schema::table('kpi_weight_items', function (Blueprint $table) {
            $table->dropIndex(['kpi_id']);
            $table->dropIndex(['profile_id']);
        });

        Schema::table('kpi_records', function (Blueprint $table) {
            $table->dropIndex(['kpi_id']);
            $table->dropIndex(['employee_id', 'period']);
        });

        Schema::table('employee_kpi_target_versions', function (Blueprint $table) {
            $table->dropIndex(['kpi_id']);
            $table->dropIndex(['employee_id']);
        });

        Schema::table('kpi_definition_versions', function (Blueprint $table) {
            $table->dropIndex(['kpi_id']);
        });

        Schema::table('probation_attendance_records', function (Blueprint $table) {
            $table->dropIndex(['probation_review_id']);
        });

        Schema::table('probation_monthly_scores', function (Blueprint $table) {
            $table->dropIndex(['probation_review_id']);
        });

        Schema::table('probation_reviews', function (Blueprint $table) {
            $table->dropIndex(['employee_id']);
        });
    }
};
