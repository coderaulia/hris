<?php

namespace App\Http\Controllers;

use App\Http\Resources\HrDocumentArchiveResource;
use App\Http\Resources\HrDocumentReferenceOptionResource;
use App\Http\Resources\HrDocumentTemplateResource;
use App\Http\Resources\HrPayrollRecordResource;
use App\Models\HrDocumentArchive;
use App\Models\HrDocumentReferenceOption;
use App\Models\HrDocumentTemplate;
use App\Models\HrPayrollRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class HrDocumentController extends Controller
{
    public function templates()
    {
        return HrDocumentTemplateResource::collection(HrDocumentTemplate::all());
    }

    public function options()
    {
        return HrDocumentReferenceOptionResource::collection(HrDocumentReferenceOption::all());
    }

    public function payrollRecords()
    {
        return HrPayrollRecordResource::collection(
            HrPayrollRecord::orderByDesc('payroll_period')->orderBy('employee_id')->get()
        );
    }

    public function importPayrollRecords(Request $request)
    {
        $validated = $request->validate([
            'records' => ['required', 'array', 'min:1'],
            'records.*.employee_id' => ['required', 'string', 'max:64'],
            'records.*.payroll_period' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'records.*.payroll_cutoff_start' => ['nullable', 'date_format:Y-m-d'],
            'records.*.payroll_cutoff_end' => ['nullable', 'date_format:Y-m-d'],
            'records.*.basic_salary' => ['nullable', 'numeric'],
            'records.*.overtime' => ['nullable', 'numeric'],
            'records.*.commission' => ['nullable', 'numeric'],
            'records.*.bonus' => ['nullable', 'numeric'],
            'records.*.pph21' => ['nullable', 'numeric'],
            'records.*.bpjs_kes' => ['nullable', 'numeric'],
            'records.*.bpjs_tk' => ['nullable', 'numeric'],
            'records.*.other_deduction' => ['nullable', 'numeric'],
            'records.*.bpjs_kes_company' => ['nullable', 'numeric'],
            'records.*.bpjs_tk_company' => ['nullable', 'numeric'],
            'records.*.ptkp' => ['nullable', 'string', 'max:64'],
            'records.*.npwp' => ['nullable', 'string', 'max:64'],
            'records.*.nik_number' => ['nullable', 'string', 'max:64'],
            'records.*.grade_level' => ['nullable', 'string', 'max:128'],
            'records.*.job_position' => ['nullable', 'string', 'max:255'],
            'records.*.organization' => ['nullable', 'string', 'max:255'],
            'records.*.notes' => ['nullable', 'string'],
        ]);

        $records = collect($validated['records'])
            ->map(function ($record) {
                $values = $record;
                unset($values['id']);
                return HrPayrollRecord::updateOrCreate(
                    [
                        'employee_id' => $record['employee_id'],
                        'payroll_period' => $record['payroll_period'],
                    ],
                    $values
                );
            });

        return HrPayrollRecordResource::collection($records);
    }

    public function storeTemplate(Request $request)
    {
        $validated = $request->validate([
            'id'                   => ['nullable', 'uuid'],
            'document_type'        => ['required', 'string', 'max:128'],
            'locale'               => ['nullable', 'string', 'max:16'],
            'contract_type'        => ['nullable', 'string', 'max:128'],
            'template_name'        => ['required', 'string', 'max:255'],
            'template_status'      => ['nullable', 'in:active,inactive,draft'],
            'version_no'           => ['nullable', 'integer', 'min:1'],
            'header_json'          => ['nullable', 'array'],
            'body_json'            => ['nullable', 'array'],
            'body_markup'          => ['nullable', 'string'],
            'signature_config_json' => ['nullable', 'array'],
            'field_schema_json'    => ['nullable', 'array'],
            'is_default'           => ['nullable', 'boolean'],
        ]);

        $template = HrDocumentTemplate::updateOrCreate(['id' => $validated['id'] ?? null], $validated);
        return new HrDocumentTemplateResource($template);
    }

    public function deleteTemplate($id)
    {
        HrDocumentTemplate::destroy($id);
        return response()->noContent();
    }

    public function archive(Request $request)
    {
        $query = HrDocumentArchive::orderByDesc('generated_at');
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        return HrDocumentArchiveResource::collection($query->get());
    }

    public function storeArchive(Request $request)
    {
        $archive = HrDocumentArchive::create([
            'id' => $request->input('id', (string) Str::uuid()),
            'employee_id' => $request->input('employee_id', ''),
            'document_type' => $request->input('document_type', ''),
            'filename' => $request->input('filename', ''),
            'storage_path' => null,
            'generated_by' => $request->input('generated_by'),
            'generated_at' => $request->input('generated_at', now()),
            'metadata' => $request->input('metadata', []),
        ]);

        return new HrDocumentArchiveResource($archive);
    }

    public function destroyArchive($id)
    {
        $archive = HrDocumentArchive::findOrFail($id);
        if ($archive->storage_path && file_exists(storage_path('app/' . $archive->storage_path))) {
            unlink(storage_path('app/' . $archive->storage_path));
        }
        $archive->delete();
        return response()->noContent();
    }
}
