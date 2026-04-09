import { invokeEdgeFunction } from './core.js';

export async function requestDepartmentKpiExport({ department, period, action = 'department_kpi_excel' }) {
    return invokeEdgeFunction('report-exports', {
        action,
        department,
        period,
    });
}

export async function requestProbationExport({ reviewId, action = 'probation_excel' }) {
    return invokeEdgeFunction('report-exports', {
        action,
        review_id: reviewId,
    });
}

export async function requestEmployeeKpiExport({ employeeId, period, action = 'employee_kpi_pdf' }) {
    return invokeEdgeFunction('report-exports', {
        action,
        employee_id: employeeId,
        period,
    });
}

export async function downloadEdgeExportFile({ signedUrl, filename }) {
    const response = await fetch(signedUrl);
    if (!response.ok) {
        throw new Error(`Failed to download export (${response.status}).`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
