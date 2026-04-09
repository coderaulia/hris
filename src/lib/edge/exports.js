import { invokeEdgeFunction } from './core.js';

export async function requestDepartmentKpiExport({ department, period, action = 'department_kpi_excel' }) {
    return invokeEdgeFunction('report-exports', {
        action,
        department,
        period,
        output: 'json_payload',
    });
}

export async function requestProbationExport({ reviewId, action = 'probation_excel' }) {
    return invokeEdgeFunction('report-exports', {
        action,
        review_id: reviewId,
        output: 'json_payload',
    });
}
