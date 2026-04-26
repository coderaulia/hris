<?php

namespace App\Services;

use App\Models\Employee;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;

class EmployeeScopeService
{
    public static function canAccess(string $targetEmployeeId): bool
    {
        $user = Auth::user();

        if ($user->role === 'superadmin') return true;
        if ($user->employee_id === $targetEmployeeId) return true;

        return Employee::where('employee_id', $targetEmployeeId)
            ->where(function ($q) use ($user) {
                $q->where('manager_id', $user->employee_id)
                  ->orWhere(function ($q2) use ($user) {
                      if (in_array($user->role, ['manager', 'superadmin'])) {
                          $q2->where('department', $user->department);
                      }
                  });
            })
            ->exists();
    }

    public static function scopeQuery(Builder $query, string $employeeIdColumn = 'employee_id'): Builder
    {
        $user = Auth::user();

        if ($user->role === 'superadmin') return $query;

        return $query->where(function ($q) use ($user, $employeeIdColumn) {
            $q->where($employeeIdColumn, $user->employee_id)
              ->orWhereIn($employeeIdColumn, function ($sub) use ($user) {
                  $sub->select('employee_id')
                      ->from('employees')
                      ->where('manager_id', $user->employee_id);

                  if (in_array($user->role, ['manager', 'superadmin'])) {
                      $sub->orWhere('department', $user->department);
                  }
              });
        });
    }
}
