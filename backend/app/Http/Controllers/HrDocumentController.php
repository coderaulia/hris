<?php

namespace App\Http\Controllers;

use App\Http\Resources\HrDocumentReferenceOptionResource;
use App\Http\Resources\HrDocumentTemplateResource;
use App\Models\HrDocumentReferenceOption;
use App\Models\HrDocumentTemplate;
use Illuminate\Http\Request;

class HrDocumentController extends Controller
{
    public function templates()
    {
        return HrDocumentTemplateResource::collection(HrDocumentTemplate::all());
    }

    public function options()
    {
        return HrDocumentReferenceOptionResource::collection(HrDocumentReferenceOption::all());
    }

    public function storeTemplate(Request $request)
    {
        $template = HrDocumentTemplate::updateOrCreate(['id' => $request->id], $request->all());
        return new HrDocumentTemplateResource($template);
    }

    public function deleteTemplate($id)
    {
        HrDocumentTemplate::destroy($id);
        return response()->noContent();
    }
}
