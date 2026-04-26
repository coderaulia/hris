<?php

namespace App\Http\Controllers;

use App\Http\Resources\AppSettingResource;
use App\Models\AppSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AppSettingController extends Controller
{
    public function index()
    {
        return AppSettingResource::collection(AppSetting::all());
    }

    public function show($key)
    {
        $setting = AppSetting::where('key', $key)->firstOrFail();
        return new AppSettingResource($setting);
    }

    public function update(Request $request, $key)
    {
        if (Auth::user()->role !== 'superadmin') {
            abort(403, 'Unauthorized.');
        }

        $setting = AppSetting::where('key', $key)->firstOrFail();
        $setting->update($request->only('value'));

        return new AppSettingResource($setting);
    }
    
    public function bulkUpdate(Request $request)
    {
        if (Auth::user()->role !== 'superadmin') {
            abort(403, 'Unauthorized.');
        }

        $request->validate([
            'settings' => 'required|array',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'required|string',
        ]);

        foreach ($request->settings as $item) {
            AppSetting::updateOrCreate(['key' => $item['key']], ['value' => $item['value']]);
        }

        return response()->json(['message' => 'Settings updated successfully.']);
    }
}
