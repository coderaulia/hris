<?php

namespace App\Http\Controllers;

use App\Http\Resources\HrDocumentReferenceOptionResource;
use App\Http\Resources\HrDocumentArchiveResource;
use App\Http\Resources\HrDocumentTemplateResource;
use App\Http\Resources\HrPayrollRecordResource;
use App\Models\HrDocumentArchive;
use App\Models\HrDocumentReferenceOption;
use App\Models\HrDocumentTemplate;
use App\Models\HrPayrollRecord;
use App\Services\EmployeeScopeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class HrDocumentController extends Controller
{
    public function templates(Request $request)
    {
        $this->abortUnlessCanManageDocuments($request);

        return HrDocumentTemplateResource::collection(HrDocumentTemplate::all());
    }

    public function options(Request $request)
    {
        $this->abortUnlessCanManageDocuments($request);

        return HrDocumentReferenceOptionResource::collection(HrDocumentReferenceOption::all());
    }

    public function payrollRecords(Request $request)
    {
        $this->abortUnlessCanManageDocuments($request);

        return HrPayrollRecordResource::collection(
            HrPayrollRecord::orderByDesc('payroll_period')->orderBy('employee_id')->get()
        );
    }

    public function archives(Request $request)
    {
        $query = HrDocumentArchive::query();
        if (!$this->canManageDocuments($request)) {
            $query->where('employee_id', $request->user()?->employee_id);
        }

        return HrDocumentArchiveResource::collection(
            $query->orderByDesc('generated_at')->orderByDesc('created_at')->limit(100)->get()
        );
    }

    public function storeArchive(Request $request)
    {
        $this->abortUnlessCanManageDocuments($request);

        $validated = $request->validate([
            'id' => 'nullable|string',
            'document_type' => 'required|string',
            'employee_id' => 'nullable|string',
            'subject_name' => 'required|string',
            'subject_mode' => 'nullable|string',
            'template_id' => 'nullable|string',
            'filename' => 'required|string',
            'mime_type' => 'nullable|string',
            'file_size_bytes' => 'nullable|integer',
            'storage_status' => 'nullable|string',
            'storage_path' => 'nullable|string',
            'generated_by' => 'nullable|string',
            'generated_at' => 'nullable|date',
            'signer_id' => 'nullable|string',
            'signer_title' => 'nullable|string',
            'recipient_signer_id' => 'nullable|string',
            'requires_recipient_signature' => 'nullable|boolean',
            'signature_status' => 'nullable|in:generated,pending_signature,signed,rejected',
            'signature_note' => 'nullable|string',
            'document_payload_json' => 'nullable|array',
        ]);

        $user = $request->user();
        $validated['generated_by'] = $validated['generated_by'] ?? $user?->employee_id;
        $validated['generated_at'] = $validated['generated_at'] ?? now();
        $validated['mime_type'] = $validated['mime_type'] ?? 'application/pdf';
        $validated['storage_status'] = $validated['storage_status'] ?? 'metadata_only';
        $validated['signature_status'] = $validated['signature_status'] ?? 'pending_signature';
        $validated['requires_recipient_signature'] = (bool) ($validated['requires_recipient_signature'] ?? false);

        $archiveId = $validated['id'] ?? null;
        unset($validated['id']);

        $archive = $archiveId
            ? HrDocumentArchive::updateOrCreate(['id' => $archiveId], $validated)
            : HrDocumentArchive::create($validated);

        return new HrDocumentArchiveResource($archive);
    }

    public function signArchive(Request $request, string $id)
    {
        $validated = $request->validate([
            'signer_type' => 'required|in:company,recipient',
            'decision' => 'required|in:signed,rejected',
            'note' => 'nullable|string',
        ]);

        $archive = HrDocumentArchive::findOrFail($id);
        $user = $request->user();
        $isHr = $this->canManageDocuments($request);

        if ($validated['signer_type'] === 'company') {
            if (!$isHr && $archive->signer_id !== $user?->employee_id) {
                abort(403, 'Unauthorized signature action.');
            }
        } elseif (!$isHr && $archive->employee_id !== $user?->employee_id) {
            abort(403, 'Unauthorized signature action.');
        }

        if ($validated['decision'] === 'rejected') {
            $archive->signature_status = 'rejected';
        } elseif ($validated['signer_type'] === 'company') {
            $archive->company_signed_at = now();
        } else {
            $archive->recipient_signed_at = now();
        }

        if ($validated['decision'] === 'signed') {
            $companySigned = $archive->company_signed_at !== null;
            $recipientSigned = !$archive->requires_recipient_signature || $archive->recipient_signed_at !== null;
            $archive->signature_status = ($companySigned && $recipientSigned) ? 'signed' : 'pending_signature';
        }

        $archive->signature_note = $validated['note'] ?? $archive->signature_note;
        $archive->save();

        return new HrDocumentArchiveResource($archive);
    }

    public function uploadArchiveFile(Request $request, string $id)
    {
        $this->abortUnlessCanManageDocuments($request);

        $validated = $request->validate([
            'file' => 'required|file|mimetypes:application/pdf|max:20480',
            'storage_path' => 'nullable|string',
        ]);

        $file = $validated['file'];
        $filename = preg_replace('/[^A-Za-z0-9._-]+/', '-', $file->getClientOriginalName() ?: 'document.pdf');
        $filename = trim($filename, '-') ?: 'document.pdf';
        $path = trim((string) ($validated['storage_path'] ?? ''), '/');
        if ($path === '') {
            $path = "hr-documents/{$id}/{$filename}";
        }
        $path = str_replace(['..', '\\'], '-', $path);
        $path = preg_replace('/[^A-Za-z0-9\/._-]+/', '-', $path);
        $path = trim($path, '/') ?: "hr-documents/{$id}/{$filename}";

        $disk = config('filesystems.hr_document_archive_disk', env('HR_DOCUMENT_ARCHIVE_DISK', 'local'));
        Storage::disk($disk)->put($path, file_get_contents($file->getRealPath()));

        $archive = HrDocumentArchive::find($id);
        if ($archive) {
            $archive->update([
                'storage_status' => 'stored',
                'storage_path' => $path,
                'file_size_bytes' => $file->getSize() ?: $archive->file_size_bytes,
                'mime_type' => $file->getMimeType() ?: 'application/pdf',
            ]);

            return new HrDocumentArchiveResource($archive);
        }

        return response()->json([
            'data' => [
                'id' => $id,
                'storage_status' => 'stored',
                'storage_path' => $path,
                'file_size_bytes' => $file->getSize() ?: 0,
                'mime_type' => $file->getMimeType() ?: 'application/pdf',
            ],
        ]);
    }

    public function importPayrollRecords(Request $request)
    {
        $this->abortUnlessCanManageDocuments($request);

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
        $this->abortUnlessCanManageDocuments($request);

        $template = HrDocumentTemplate::updateOrCreate(['id' => $request->id], $request->all());
        return new HrDocumentTemplateResource($template);
    }

    public function deleteTemplate(Request $request, $id)
    {
        $this->abortUnlessCanManageDocuments($request);

        HrDocumentTemplate::destroy($id);
        return response()->noContent();
    }

    private function canManageDocuments(Request $request): bool
    {
        $user = $request->user();
        return ($user?->role ?? '') === 'superadmin' || EmployeeScopeService::isHrUser($user);
    }

    private function abortUnlessCanManageDocuments(Request $request): void
    {
        if (!$this->canManageDocuments($request)) {
            abort(403, 'HR document access is restricted to HR and Superadmin users.');
        }
    }
}
