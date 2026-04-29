# Tech Stack

Updated: 2026-04-29

## Application

- Frontend: Vite single-page app with vanilla JavaScript modules
- Styling: Tailwind-enhanced custom CSS plus Bootstrap utilities and Bootstrap Icons
- Charts: Chart.js, loaded lazily through `src/lib/chartLoader.js`
- PDF/export: `jspdf`, `jspdf-autotable`, and `exceljs`
- Notifications: SweetAlert2 through local wrappers

## Backend Options

- Supabase mode is the default runtime:
  - Supabase Auth
  - Postgres
  - Row Level Security policies
  - Data API grants
  - Edge Functions for privileged or server-side export flows
- Laravel mode is optional:
  - PHP/Lumen/Laravel API under `backend/`
  - Laravel Sanctum auth
  - Eloquent resources shaped to match Supabase table fields
  - `EmployeeScopeService` mirrors row-scope access rules

## Runtime Boundary

Frontend modules call `src/lib/backend.js`.

- `VITE_BACKEND_TYPE=supabase` uses `src/lib/backends/supabase-adapter.js`
- `VITE_BACKEND_TYPE=laravel` uses `src/lib/backends/laravel-adapter.js`
- Do not call Supabase directly from feature data modules when an adapter method exists.

## Validation

- Frontend build: `npm run build`
- Security/schema hardening: `npm run qa:hardening`
- Playwright regression: `npm run qa:e2e`
- PHP syntax for touched Laravel files: `php -l <file>`
- JavaScript syntax for touched standalone modules: `node --check <file>`
