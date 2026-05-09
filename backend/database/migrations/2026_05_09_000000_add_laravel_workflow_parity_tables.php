<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('app_settings')) {
            Schema::create('app_settings', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->text('value')->default('');
                $table->timestamp('updated_at')->nullable();
            });
        }

        $this->ensureKpiGovernanceColumns();
        $this->ensureManpowerTables();
        $this->ensurePipTables();
    }

    public function down(): void
    {
        Schema::dropIfExists('pip_actions');
        Schema::dropIfExists('pip_plans');
        Schema::dropIfExists('recruitment_pipeline');
        Schema::dropIfExists('headcount_requests');
        Schema::dropIfExists('manpower_plans');
        Schema::dropIfExists('app_settings');
    }

    private function ensureKpiGovernanceColumns(): void
    {
        Schema::table('kpi_definition_versions', function (Blueprint $table) {
            if (!Schema::hasColumn('kpi_definition_versions', 'kpi_definition_id')) {
                $table->uuid('kpi_definition_id')->nullable()->after('id');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'effective_period')) {
                $table->string('effective_period')->nullable()->after('version_no');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'name')) {
                $table->string('name')->nullable()->after('effective_period');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'description')) {
                $table->text('description')->nullable()->after('name');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'category')) {
                $table->string('category')->nullable()->after('description');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'target')) {
                $table->float('target')->nullable()->after('category');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'unit')) {
                $table->string('unit')->nullable()->after('target');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'request_note')) {
                $table->text('request_note')->nullable()->after('status');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'requested_by')) {
                $table->string('requested_by')->nullable()->after('request_note');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'approved_by')) {
                $table->string('approved_by')->nullable()->after('requested_at');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'approved_at')) {
                $table->dateTime('approved_at')->nullable()->after('approved_by');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'rejected_by')) {
                $table->string('rejected_by')->nullable()->after('approved_at');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'rejected_at')) {
                $table->dateTime('rejected_at')->nullable()->after('rejected_by');
            }
            if (!Schema::hasColumn('kpi_definition_versions', 'rejection_reason')) {
                $table->text('rejection_reason')->nullable()->after('rejected_at');
            }
        });

        Schema::table('employee_kpi_target_versions', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_kpi_target_versions', 'effective_period')) {
                $table->string('effective_period')->nullable()->after('kpi_id');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'target_value')) {
                $table->float('target_value')->nullable()->after('effective_period');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'unit')) {
                $table->string('unit')->nullable()->after('target_value');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'version_no')) {
                $table->integer('version_no')->nullable()->after('unit');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'request_note')) {
                $table->text('request_note')->nullable()->after('status');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'requested_by')) {
                $table->string('requested_by')->nullable()->after('request_note');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'approved_by')) {
                $table->string('approved_by')->nullable()->after('requested_at');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'approved_at')) {
                $table->dateTime('approved_at')->nullable()->after('approved_by');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'rejected_by')) {
                $table->string('rejected_by')->nullable()->after('approved_at');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'rejected_at')) {
                $table->dateTime('rejected_at')->nullable()->after('rejected_by');
            }
            if (!Schema::hasColumn('employee_kpi_target_versions', 'rejection_reason')) {
                $table->text('rejection_reason')->nullable()->after('rejected_at');
            }
        });

        Schema::table('kpi_weight_items', function (Blueprint $table) {
            if (!Schema::hasColumn('kpi_weight_items', 'weight_pct')) {
                $table->float('weight_pct')->nullable()->after('kpi_id');
            }
        });
    }

    private function ensureManpowerTables(): void
    {
        if (!Schema::hasTable('manpower_plans')) {
            Schema::create('manpower_plans', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('period');
                $table->string('department')->default('');
                $table->string('position')->default('');
                $table->string('seniority')->default('');
                $table->integer('planned_headcount')->default(0);
                $table->integer('approved_headcount')->default(0);
                $table->string('status')->default('draft');
                $table->text('notes')->nullable();
                $table->string('created_by')->nullable();
                $table->string('updated_by')->nullable();
                $table->timestamps();

                $table->unique(['period', 'department', 'position', 'seniority']);
            });
        }

        if (!Schema::hasTable('headcount_requests')) {
            Schema::create('headcount_requests', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('plan_id')->nullable();
                $table->string('request_code')->nullable();
                $table->string('department')->default('');
                $table->string('position')->default('');
                $table->string('seniority')->nullable();
                $table->integer('requested_count')->default(1);
                $table->text('business_reason')->nullable();
                $table->string('priority')->default('normal');
                $table->string('requested_by')->nullable();
                $table->string('approved_by')->nullable();
                $table->string('approval_status')->default('pending');
                $table->text('approval_note')->nullable();
                $table->date('target_hire_date')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('recruitment_pipeline')) {
            Schema::create('recruitment_pipeline', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('request_id');
                $table->string('candidate_name')->nullable();
                $table->string('stage')->default('requested');
                $table->string('source')->nullable();
                $table->string('owner_id')->nullable();
                $table->timestamp('stage_updated_at')->nullable();
                $table->string('offer_status')->nullable();
                $table->date('expected_start_date')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }
    }

    private function ensurePipTables(): void
    {
        if (!Schema::hasTable('pip_plans')) {
            Schema::create('pip_plans', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('employee_id');
                $table->text('trigger_reason')->nullable();
                $table->string('trigger_period')->nullable();
                $table->date('start_date')->nullable();
                $table->date('target_end_date')->nullable();
                $table->string('status')->default('active');
                $table->string('owner_manager_id')->nullable();
                $table->text('summary')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('pip_actions')) {
            Schema::create('pip_actions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('pip_plan_id');
                $table->string('action_title');
                $table->text('action_detail')->nullable();
                $table->date('due_date')->nullable();
                $table->float('progress_pct')->default(0);
                $table->string('status')->default('todo');
                $table->text('checkpoint_note')->nullable();
                $table->timestamps();
            });
        }
    }
};
