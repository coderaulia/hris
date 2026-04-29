# API Endpoints

Updated: 2026-04-29

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

## Assessments And KPI

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/assessments` | List assessments |
| `POST` | `/assessments` | Save assessment |
| `GET` | `/assessment-scores` | List assessment scores |
| `GET` | `/assessment-history` | List assessment history |
| `GET` | `/kpis` | List KPI definitions |
| `GET` | `/kpi-records` | List KPI records |
| `POST` | `/kpi-records` | Save KPI record |
| `GET` | `/kpi-weight-profiles` | List KPI weight profiles |
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

## Response Shape Rule

New Laravel endpoints should return JSON shaped as:

- success: `{ "success": true, "data": ... }`, or Laravel resource collections compatible with the adapter
- failure: `{ "success": false, "error": "Safe user-facing message" }`

Current legacy resource endpoints commonly return Laravel resource `data`; preserve adapter compatibility when changing them.
