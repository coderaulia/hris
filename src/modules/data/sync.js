import { state, emit } from './runtime.js';
import { fetchActivityLogs } from './activity.js';
import { fetchSettings } from './settings.js';
import { fetchEmployees } from './employees.js';
import { fetchConfig } from './config.js';
import {
    fetchKpiDefinitions,
    fetchKpiDefinitionVersions,
    fetchEmployeeKpiTargetVersions,
    fetchKpiRecords,
    fetchKpiWeightProfiles,
    fetchKpiWeightItems,
    fetchEmployeePerformanceScores,
} from './kpi.js';
import {
    fetchProbationReviews,
    fetchProbationQualitativeItems,
    fetchProbationMonthlyScores,
    fetchProbationAttendanceRecords,
} from './probation.js';
import { fetchPipPlans, fetchPipActions } from './pip.js';
import {
    fetchDashboardSummary,
    fetchDashboardProbationExpiry,
    fetchDashboardAssessmentCoverage,
} from './dashboard.js';
import {
    fetchManpowerPlans,
    fetchHeadcountRequests,
    fetchRecruitmentPipeline,
} from './manpower.js';

async function syncAll() {
    const tasks = [
        fetchSettings(),
        fetchEmployees(),
        fetchConfig(),
        fetchKpiDefinitions(),
        fetchKpiDefinitionVersions(),
        fetchEmployeeKpiTargetVersions(),
        fetchKpiRecords(),
        fetchKpiWeightProfiles(),
        fetchKpiWeightItems(),
        fetchEmployeePerformanceScores(),
        fetchProbationReviews(),
        fetchProbationQualitativeItems(),
        fetchProbationMonthlyScores(),
        fetchProbationAttendanceRecords(),
        fetchPipPlans(),
        fetchPipActions(),
        fetchManpowerPlans(),
        fetchHeadcountRequests(),
        fetchRecruitmentPipeline(),
        fetchDashboardSummary(),
        fetchDashboardProbationExpiry(),
        fetchDashboardAssessmentCoverage(),
    ];

    if (state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'manager') {
        tasks.push(fetchActivityLogs());
    }

    await Promise.all(tasks);
    emit('data:synced');
}

export { syncAll };

