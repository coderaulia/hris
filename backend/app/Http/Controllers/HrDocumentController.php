<?php

namespace App\Http\Controllers;

use App\Http\Resources\HrDocumentReferenceOptionResource;
use App\Http\Resources\HrDocumentTemplateResource;
use App\Http\Resources\HrPayrollRecordResource;
use App\Models\HrDocumentReferenceOption;
use App\Models\HrDocumentTemplate;
use App\Models\HrPayrollRecord;
use Illuminate\Http\Request;

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
}
