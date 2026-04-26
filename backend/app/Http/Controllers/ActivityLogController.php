<?php

namespace App\Http\Controllers;

use App\Http\Resources\AdminActivityLogResource;
use App\Models\AdminActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index()
    {
        return AdminActivityLogResource::collection(AdminActivityLog::latest('created_at')->limit(100)->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'action' => 'required|string',
            'entity_type' => 'nullable|string',
            'entity_id' => 'nullable|string',
            'details' => 'nullable|array',
        ]);

        $log = AdminActivityLog::create([
            'actor_employee_id' => $request->user()->employee_id,
            'actor_role' => $request->user()->role,
            'action' => $validated['action'],
            'entity_type' => $validated['entity_type'],
            'entity_id' => $validated['entity_id'],
            'details' => $validated['details'] ?? [],
            'created_at' => now(),
        ]);

        return new AdminActivityLogResource($log);
    }
}
