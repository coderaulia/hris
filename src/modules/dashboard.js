import { renderAssessmentSummary } from './dashboard/assessmentSummary.js';
import { renderKpiSummary } from './dashboard/kpiSummary.js';

async function renderDashboard() {
    await Promise.all([
        renderAssessmentSummary(),
        renderKpiSummary(),
    ]);
}

export { renderDashboard };

export * from './dashboard/assessmentSummary.js';
export * from './dashboard/kpiSummary.js';
export * from './dashboard/deptModal.js';
export * from './dashboard/deptExport.js';
export * from './dashboard/charts.js';
