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
        $records = collect($request->input('records', []))
            ->filter(fn ($record) => !empty($record['employee_id']) && !empty($record['payroll_period']))
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
        $template = HrDocumentTemplate::updateOrCreate(['id' => $request->id], $request->all());
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
