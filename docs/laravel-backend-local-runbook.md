# Laravel Backend Local Runbook

Last updated: 2026-05-09

## Readiness Snapshot

Current Laravel backend readiness is about **70% for local evaluation** and **not production-ready
yet**.

Ready enough to run locally:

- Laravel API app exists under `backend/`.
- Sanctum login/logout/me routes are implemented.
- The frontend can switch to Laravel through `VITE_BACKEND_TYPE=laravel`.
- Main module routes exist for employees, training, assessments, dashboard, KPI, manpower,
  probation, PIP, HR Documents, payroll import, and archive file upload/download.
- Targeted Laravel feature tests and adapter-level Playwright coverage exist for recent high-risk
  fixes.

Not ready yet:

- PHP and Composer were not available on PATH in the most recent local shell, so Laravel tests have not been run locally.
- `backend/composer.json` requires PHP `^8.3`; older docs that say PHP 8.2+ are stale.
- The Laravel migration set is not fully aligned with the fuller Supabase employee schema. The app expects employee auth columns such as `auth_email`, and local login needs a seeded employee with a password hash.
- The default Laravel `DatabaseSeeder` is still the framework skeleton and does not create demo HRIS employee logins.
- Broader backend feature coverage is still thin for manpower, KPI approval state machines, PIP transitions, validation failures, delete edge cases, and settings bulk-update atomicity.

Use this backend for local smoke testing and parity work. Treat production rollout as blocked until
the migration/seed/test gaps above are closed and `php artisan test` is green in the target
environment.

## Existing Docs To Keep Open

- [backend/README.md](../backend/README.md): baseline Laravel setup notes.
- [docs/env-guide.md](env-guide.md): frontend and Laravel environment variables.
- [docs/api-endpoints.md](api-endpoints.md): current `/api/v1` route map.
- [docs/project-status.md](project-status.md): latest delivery status and open gaps.
- [docs/code-audit.md](code-audit.md): audit findings and suggested fix order.

## Prerequisites

Install these first:

- PHP 8.3 or newer.
- Composer.
- Node.js/npm for the Vite frontend.
- A database:
   - easiest smoke-test path: SQLite, but you must add/seed the missing HRIS auth fields yourself;
   - closer parity path: PostgreSQL using the full Supabase-compatible schema.

Verify tools:

```powershell
php -v
composer --version
node -v
npm -v
```

## Backend Setup

From the repo root:

```powershell
cd backend
composer install
Copy-Item .env.example .env
php artisan key:generate
```

For quick SQLite smoke testing, set these in `backend/.env`:

```env
APP_URL=http://localhost:8000
DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite
SESSION_DRIVER=database
QUEUE_CONNECTION=database
FILESYSTEM_DISK=local
```

Create the SQLite file if it does not exist:

```powershell
New-Item -ItemType File -Force database/database.sqlite
php artisan migrate
```

For PostgreSQL/Supabase-local parity, set `backend/.env` like this instead:

```env
APP_URL=http://localhost:8000
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=54322
DB_DATABASE=postgres
DB_USERNAME=postgres
DB_PASSWORD=postgres
SESSION_DRIVER=database
QUEUE_CONNECTION=database
FILESYSTEM_DISK=local
```

Then run:

```powershell
php artisan migrate
```

## Local Login Bootstrap

The Laravel login endpoint checks `employees.auth_email` and `employees.password_hash`. Before
using the browser app, make sure the database has:

- an `employees.auth_email` column;
- an `employees.password_hash` column;
- at least one employee row with role `superadmin`, `hr`, `director`, `manager`, or `employee`;
- a hashed password for that row.

Until a proper Laravel demo seeder exists, create a temporary local user with Tinker after the
schema has the required columns:

```powershell
php artisan tinker
```

```php
use App\Models\Employee;
use Illuminate\Support\Facades\Hash;

Employee::updateOrCreate(
    ['employee_id' => 'SA01'],
    [
        'name' => 'Local Superadmin',
        'email' => 'superadmin@demo.local',
        'auth_email' => 'superadmin@demo.local',
        'role' => 'superadmin',
        'department' => 'HR',
        'position' => 'Superadmin',
        'password_hash' => Hash::make('ChangeMe123!'),
        'must_change_password' => true,
    ]
);
```

Use a throwaway password locally and replace it immediately in any shared environment.

## Start The API

```powershell
php artisan serve --host=127.0.0.1 --port=8000
```

Expected API base:

```text
http://127.0.0.1:8000/api/v1
```

Smoke test login:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/auth/login `
  -ContentType application/json `
  -Body '{"email":"superadmin@demo.local","password":"ChangeMe123!"}'
```

## Frontend Setup For Laravel Mode

From the repo root, copy the frontend env template if needed:

```powershell
Copy-Item .env.example .env
```

Set:

```env
VITE_BACKEND_TYPE=laravel
VITE_LARAVEL_API_URL=http://127.0.0.1:8000/api/v1
```

Then run:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

Log in with the temporary local employee credentials you created above.

## Verification Commands

Run these once PHP and Composer are available:

```powershell
cd backend
php artisan test
```

From the repo root:

```powershell
npm run build
npm run qa:hardening
npx playwright test tests/backend-adapter.spec.js
```

If `php artisan test` fails on missing employee columns, fix the Laravel migrations or point the
backend at a database initialized with the complete Supabase-compatible schema before continuing.

## Common Problems

`php` or `composer` is not recognized:

- Install PHP 8.3+ and Composer, then reopen the terminal so PATH refreshes.

Login returns a database column error:

- Confirm `employees.auth_email` exists. The current Laravel app expects it, but the Laravel-local
  migration chain may not create it.

Login returns invalid credentials:

- Confirm the employee row has `auth_email` matching the login email and `password_hash` generated
  with Laravel `Hash::make(...)`.

Frontend still calls Supabase:

- Confirm `.env` has `VITE_BACKEND_TYPE=laravel`.
- Restart `npm run dev`; Vite env values are loaded at server startup.

Archive PDF upload/download fails:

- Confirm `FILESYSTEM_DISK=local`.
- Confirm `backend/storage/app/private` exists and is writable.
