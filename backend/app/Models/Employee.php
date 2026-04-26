<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class Employee extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $table = 'employees';
    protected $primaryKey = 'employee_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $guarded = [];

    protected $hidden = [
        'password_hash',
        'auth_id',
    ];

    public function getAuthPasswordName()
    {
        return 'password_hash';
    }

    protected function casts(): array
    {
        return [
            'kpi_targets' => 'array',
            'join_date' => 'date',
            'must_change_password' => 'boolean',
            'password_hash' => 'hashed',
        ];
    }
}
