# API Endpoints

Updated: 2026-05-08

The optional Laravel API is mounted under `/api/v1`. Frontend calls should go through `src/lib/backend.js`; direct route calls belong inside `src/lib/backends/laravel-adapter.js`.

## Public

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Create Sanctum session token |

## Authenticated Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/logout` | Revoke current token |
| `GET` | `/auth/me` | Fetch current employee profile |

## Settings

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/settings` | List settings |
| `GET` | `/settings/{key}` | Fetch one setting |
| `PUT` | `/settings/{key}` | Update one setting |
| `POST` | `/settings/bulk` | Bulk update settings |

## Employees And Training

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/employees` | List employees |
| `POST` | `/employees` | Create employee |
| `GET` | `/employees/{id}` | Fetch employee |
| `PUT/PATCH` | `/employees/{id}` | Update employee |
| `DELETE` | `/employees/{id}` | Delete employee |
| `GET/POST` | `/training-records` | List/create training records |
| `GET/PUT/PATCH/DELETE` | `/training-records/{id}` | Manage one training record |

## Dashboard

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/dashboard/summary` | Fetch dashboard summary view (counts) |
| `GET` | `/dashboard/probation-expiry` | Fetch expiring probation list (`?limit=N`) |
| `GET` | `/dashboard/assessment-coverage` | Fetch assessment coverage by department |

## Assessments And KPI

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/assessments` | List assessments |
| `POST` | `/assessments` | Save assessment |
| `GET` | `/assessment-scores` | List assessment scores |
| `GET` | `/assessment-history` | List assessment history |
| `GET` | `/kpis` | List KPI definitions |
| `POST` | `/kpis` | Create or update KPI definition |
| `DELETE` | `/kpis/{id}` | Delete KPI definition |
| `GET` | `/kpi-definition-versions` | List KPI definition versions |
| `POST` | `/kpi-definition-versions` | Create KPI definition version |
| `PATCH` | `/kpi-definition-versions/{id}` | Approve or reject KPI definition version |
| `GET` | `/employee-kpi-target-versions` | List scoped employee KPI target versions |
| `POST` | `/employee-kpi-target-versions` | Create employee KPI target version |
| `PATCH` | `/employee-kpi-target-versions/{id}` | Approve or reject employee KPI target version |
| `GET` | `/kpi-records` | List KPI records |
| `POST` | `/kpi-records` | Save KPI record |
| `DELETE` | `/kpi-records/{id}` | Delete KPI record |
| `GET` | `/kpi-weight-profiles` | List KPI weight profiles |
| `POST` | `/kpi-weight-profiles` | Create or update KPI weight profile |
| `POST` | `/kpi-weight-profiles/{profileId}/items` | Upsert KPI weight profile items |
| `GET` | `/kpi-weight-items` | List all KPI weight items (flat) |
| `GET` | `/performance-scores` | List performance scores |
| `POST` | `/performance-scores` | Save performance score |
| `GET` | `/competency-config` | List competency config |
| `PUT` | `/competency-config/{position}` | Update competency config |

## Manpower Planning

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/manpower-plans` | List manpower plans |
| `POST` | `/manpower-plans` | Upsert manpower plan |
| `GET` | `/headcount-requests` | List headcount requests |
| `POST` | `/headcount-requests` | Upsert headcount request or approval status |
| `GET` | `/recruitment-pipeline` | List recruitment pipeline cards |
| `POST` | `/recruitment-pipeline` | Upsert recruitment pipeline card |
| `DELETE` | `/recruitment-pipeline/{id}` | Delete recruitment pipeline card |

## Probation And PIP

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/probation-reviews` | List probation reviews |
| `POST` | `/probation-reviews` | Save probation review |
| `GET` | `/probation-monthly-scores` | List probation monthly scores |
| `POST` | `/probation-monthly-scores` | Save probation monthly score |
| `GET` | `/probation-attendance-records` | List probation attendance records |
| `POST` | `/probation-attendance-records` | Save probation attendance record |
| `GET` | `/pip-plans` | List PIP plans |
| `POST` | `/pip-plans` | Save PIP plan |
| `GET` | `/pip-actions` | List PIP actions |
| `POST` | `/pip-actions` | Save PIP action |

## HR Documents

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/hr-document-templates` | List HR document templates |
| `POST` | `/hr-document-templates` | Upsert HR document template |
| `DELETE` | `/hr-document-templates/{id}` | Delete HR document template |
| `GET` | `/hr-document-options` | List HR document reference options |
| `GET` | `/hr-payroll-records` | List reusable payroll rows |
| `POST` | `/hr-payroll-records/import` | Import/upsert payroll rows |
| `GET` | `/hr-document-archive` | List document archive records |
| `POST` | `/hr-document-archive` | Create document archive record |
| `POST` | `/hr-document-archive/{id}/file` | Upload PDF file for archive record |
| `GET` | `/hr-document-archive/{id}/file` | Download PDF file for archive record |
| `DELETE` | `/hr-document-archive/{id}` | Delete document archive record |
| `POST` | `/hr-document-archives/{id}/file` | Alias for archive PDF upload |
| `GET` | `/hr-document-archives/{id}/file` | Alias for archive PDF download |

## Document Signatures (Supabase only)

The e-signature workflow runs through the Supabase adapter, not the Laravel API. The
`backend.documents` surface exposes: `listSignatureRequests(archiveId)`,
`listMySignatureRequests(signerEmployeeId)`, `createSignatureRequests(rows)`,
`updateSignatureRequest(id, patch, blob?, path?)`, `deleteSignatureRequest(id, path?)`, and
`getSignatureSignedUrl(path)`. These map to the `document_signature_requests` table and the private
`document-signatures` storage bucket. Signer dispatch uses the `approval-notifications` Edge Function
with `action: "document_signature_requests"` and `signature_request_id`.

Laravel parity (controller routes such as `/document-signature-requests`) is **not implemented**; the
Laravel adapter returns graceful stubs until that work lands.

## Live Attendance (Supabase only)

Live Attendance runs through the Supabase adapter, not the Laravel API. The `backend.attendance`
surface exposes: `listWorkSites()`, `upsertWorkSite(payload)`, `deleteWorkSite(id)`,
`listMyAttendance(employeeId, { from, to })`, `listAttendance({ from, to, employeeId })`,
`recordEvent(row, photoBlob?, storagePath?)`, `updateRecord(id, patch)`,
`deleteRecord(id, storagePath?)`, and `getPhotoUrl(storagePath)`. These map to the
`attendance_work_sites` / `attendance_records` tables and the private `attendance-photos` storage
bucket.

Laravel parity (controller routes) is **not implemented**; the Laravel adapter returns graceful
stubs until that work lands.

## Notification Edge Actions

`approval-notifications` accepts `action` values: `employee_kpi_target_versions`,
`kpi_definition_versions`, `probation_reviews`, `pip_plans`, and `document_signature_requests`.

## Response Shape Rule

New Laravel endpoints should return JSON shaped as:

- success: `{ "success": true, "data": ... }`, or Laravel resource collections compatible with the adapter
- failure: `{ "success": false, "error": "Safe user-facing message" }`

Current legacy resource endpoints commonly return Laravel resource `data`; preserve adapter compatibility when changing them.
