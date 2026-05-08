<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

trait BuildsHrisTestSchema
{
    protected function rebuildHrisSchema(): void
    {
        foreach ([
            'hr_document_archives',
            'probation_reviews',
            'employee_assessment_scores',
            'employee_assessment_history',
            'employee_assessments',
            'employees',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        Schema::create('employees', function (Blueprint $table) {
            $table->string('employee_id')->primary();
            $table->string('name')->nullable();
            $table->string('position')->nullable();
            $table->string('seniority')->nullable();
            $table->date('join_date')->nullable();
            $table->string('department')->nullable();
            $table->string('manager_id')->nullable();
            $table->string('auth_email')->nullable()->unique();
            $table->string('role')->default('employee');
            $table->json('kpi_targets')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->string('password_hash')->nullable();
            $table->timestamps();
        });

        Schema::create('employee_assessments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('assessment_type');
            $table->float('percentage')->default(0);
            $table->string('seniority')->nullable();
            $table->timestamp('assessed_at')->nullable();
            $table->string('assessed_by')->nullable();
            $table->string('source_date')->nullable();
            $table->timestamps();
        });

        Schema::create('employee_assessment_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('assessment_id');
            $table->string('competency_name');
            $table->float('score')->default(0);
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('employee_assessment_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('assessment_type');
            $table->float('percentage')->default(0);
            $table->string('assessed_by')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('probation_reviews', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->date('review_period_start')->nullable();
            $table->date('review_period_end')->nullable();
            $table->float('quantitative_score')->default(0);
            $table->float('qualitative_score')->default(0);
            $table->float('final_score')->default(0);
            $table->string('decision')->nullable();
            $table->text('manager_notes')->nullable();
            $table->string('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('hr_document_archives', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('document_type');
            $table->string('employee_id')->nullable();
            $table->string('subject_name');
            $table->string('subject_mode')->default('employee');
            $table->string('template_id')->nullable();
            $table->string('filename');
            $table->string('mime_type')->default('application/pdf');
            $table->integer('file_size_bytes')->default(0);
            $table->string('storage_status')->default('metadata_only');
            $table->string('storage_path')->nullable();
            $table->string('generated_by')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->string('signer_id')->nullable();
            $table->string('signer_title')->nullable();
            $table->string('recipient_signer_id')->nullable();
            $table->boolean('requires_recipient_signature')->default(false);
            $table->string('signature_status')->default('pending_signature');
            $table->text('signature_note')->nullable();
            $table->timestamp('company_signed_at')->nullable();
            $table->timestamp('recipient_signed_at')->nullable();
            $table->json('document_payload_json')->nullable();
            $table->timestamps();
        });
    }
}
