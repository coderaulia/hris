import { renderAssessmentSummary } from './dashboard/assessmentSummary.js';
import { renderKpiSummary } from './dashboard/kpiSummary.js';
import { isAnyModuleEnabled } from '../config/app-modules.js';

async function renderDashboard() {
    const tasks = [renderKpiSummary()];
    if (isAnyModuleEnabled(['assessment', 'tna'])) {
        tasks.unshift(renderAssessmentSummary());
    }
    await Promise.all(tasks);
}

export { renderDashboard };

export * from './dashboard/assessmentSummary.js';
export * from './dashboard/kpiSummary.js';
export * from './dashboard/deptModal.js';
export * from './dashboard/deptExport.js';
export * from './dashboard/charts.js';
