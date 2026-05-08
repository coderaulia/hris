<?php

namespace App\Services;

use App\Models\Employee;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;

class EmployeeScopeService
{
    public static function isHrUser($user = null): bool
    {
        $user = $user ?? Auth::user();
        $department = strtolower((string) ($user->department ?? ''));

        return ($user->role ?? null) === 'hr'
            || $department === 'hr'
            || str_contains($department, 'human resource')
            || str_contains($department, 'human resources');
    }

    public static function isDirector($user = null): bool
    {
        $user = $user ?? Auth::user();

        return ($user->role ?? null) === 'director';
    }

    public static function canAccess(string $targetEmployeeId): bool
    {
        $user = Auth::user();

        if (!$user) return false;
        if ($user->role === 'superadmin' || self::isHrUser($user)) return true;
        if ($user->employee_id === $targetEmployeeId) return true;

        if (self::isDirector($user)) {
            return Employee::where('employee_id', $targetEmployeeId)
                ->where('employee_id', '<>', $user->employee_id)
                ->where(function ($q) use ($user) {
                    $q->where('manager_id', $user->employee_id)
                        ->orWhereIn('position', function ($sub) use ($user) {
                            $sub->select('position')
                                ->from('employees')
                                ->where('manager_id', $user->employee_id)
                                ->whereNotNull('position')
                                ->where('position', '<>', '');
                        });
                })
                ->exists();
        }

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

        if (!$user) return $query->whereRaw('1 = 0');
        if ($user->role === 'superadmin' || self::isHrUser($user)) return $query;

        if (self::isDirector($user)) {
            return $query->where($employeeIdColumn, '<>', $user->employee_id)
                ->where(function ($q) use ($user, $employeeIdColumn) {
                    $q->whereIn($employeeIdColumn, function ($sub) use ($user) {
                        $sub->select('employee_id')
                            ->from('employees')
                            ->where('manager_id', $user->employee_id);
                    })
                    ->orWhereIn($employeeIdColumn, function ($sub) use ($user) {
                        $sub->select('employee_id')
                            ->from('employees')
                            ->whereIn('position', function ($positionSub) use ($user) {
                                $positionSub->select('position')
                                    ->from('employees')
                                    ->where('manager_id', $user->employee_id)
                                    ->whereNotNull('position')
                                    ->where('position', '<>', '');
                            });
                    });
                });
        }

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
