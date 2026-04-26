# HR Performance Suite - Laravel Backend

This is the optional Laravel-based API for the HR Performance Suite. It serves as a secure proxy and business logic layer, alternative to direct Supabase interactions.

## Setup

1. **Prerequisites**: PHP 8.2+, Composer, PostgreSQL.
2. **Install Dependencies**:
   ```bash
   composer install
   ```
3. **Environment**:
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```
4. **Database Configuration**:
   Update `.env` with your PostgreSQL credentials. If using the local Supabase stack, the port is usually `54322`.
5. **Migrations**:
   ```bash
   php artisan migrate
   ```
6. **Serve**:
   ```bash
   php artisan serve
   ```

## Key Architecture

### 1. Adapter Pattern
The frontend communicates with this API via the `laravel-adapter.js`. To enable this, set `VITE_BACKEND_TYPE=laravel` in your frontend `.env`.

### 2. Security Scoping (RLS Replication)
Security is enforced via `App\Services\Employee\EmployeeScopeService`. This service replicates the logic of Supabase RLS policies:
- **Manager Scope**: Filters queries to show only subordinates or department data.
- **HR Scope**: Allows broader access to employee and document records.
- **Self Scope**: Restricts users to their own records.

Controllers use this service to automatically apply these constraints to Eloquent queries.

### 3. Authentication
Uses **Laravel Sanctum**. The API provides:
- `/api/v1/auth/login`: Issues a personal access token.
- `/api/v1/auth/me`: Returns the current employee profile.
- `/api/v1/auth/logout`: Revokes the current token.

### 4. Resource Serialization
All API responses use Laravel `Http\Resources` to ensure key names match the Supabase table columns (e.g., `employee_id`, `created_at`). This allows the frontend to consume data without modification.

## Module Coverage
- **Auth**: Sanctum-based login/logout.
- **Employees**: Full CRUD with profile management and training records.
- **Assessments**: Competency assessments and history.
- **KPIs**: Definitions, records, and weight profiles.
- **Performance**: Calculated scores and competency config.
- **Probation**: Reviews, monthly scores, and attendance.
- **PIP**: Performance improvement plans and actions.
- **HR Documents**: Template management and reference options.
- **Activity Log**: Audit trail for admin actions.
