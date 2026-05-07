<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->string('employee_id')->primary();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('role')->nullable();
            $table->string('department')->nullable();
            $table->string('position')->nullable();
            $table->string('manager_id')->nullable();
            $table->string('auth_id')->nullable();
            $table->json('kpi_targets')->nullable();
            $table->date('join_date')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
