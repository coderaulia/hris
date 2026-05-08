<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_document_archive', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('employee_id');
            $table->string('document_type');
            $table->string('filename');
            $table->string('storage_path')->nullable();
            $table->string('generated_by')->nullable();
            $table->timestamp('generated_at')->useCurrent();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('employee_id');
            $table->index('generated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_document_archive');
    }
};
