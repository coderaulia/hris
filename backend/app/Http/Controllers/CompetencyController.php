<?php

namespace App\Http\Controllers;

use App\Http\Resources\CompetencyConfigResource;
use App\Models\CompetencyConfig;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CompetencyController extends Controller
{
    public function index()
    {
        return CompetencyConfigResource::collection(CompetencyConfig::all());
    }

    public function update(Request $request, $positionName)
    {
        if (Auth::user()->role !== 'superadmin') {
            abort(403, 'Unauthorized.');
        }

        $config = CompetencyConfig::updateOrCreate(
            ['position_name' => $positionName],
            ['competencies' => $request->competencies]
        );

        return new CompetencyConfigResource($config);
    }
}
