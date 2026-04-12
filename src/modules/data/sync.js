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

function getRoleSyncFlags(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    return {
        includeActivity: normalizedRole === 'superadmin' || normalizedRole === 'manager',
        includeKpiGovernance: ['superadmin', 'hr', 'manager', 'director'].includes(normalizedRole),
        includeProbation: ['superadmin', 'hr', 'manager', 'director'].includes(normalizedRole),
        includeManpower: ['superadmin', 'hr', 'manager', 'director'].includes(normalizedRole),
        includeDashboardReads: normalizedRole !== 'employee',
    };
}

async function syncAll() {
    const role = state.currentUser?.role || 'employee';
    const flags = getRoleSyncFlags(role);
    const tasks = [
        fetchSettings(),
        fetchEmployees(),
        fetchConfig(),
        fetchKpiRecords(),
        fetchPipPlans(),
        fetchPipActions(),
    ];

    if (flags.includeKpiGovernance) {
        tasks.push(
            fetchKpiDefinitions(),
            fetchKpiDefinitionVersions(),
            fetchEmployeeKpiTargetVersions(),
            fetchKpiWeightProfiles(),
            fetchKpiWeightItems(),
            fetchEmployeePerformanceScores(),
        );
    } else {
        tasks.push(fetchKpiDefinitions());
    }

    if (flags.includeProbation) {
        tasks.push(
            fetchProbationReviews(),
            fetchProbationQualitativeItems(),
            fetchProbationMonthlyScores(),
            fetchProbationAttendanceRecords(),
        );
    }

    if (flags.includeManpower) {
        tasks.push(
            fetchManpowerPlans(),
            fetchHeadcountRequests(),
            fetchRecruitmentPipeline(),
        );
    }

    if (flags.includeDashboardReads) {
        tasks.push(
            fetchDashboardSummary(),
            fetchDashboardProbationExpiry(),
            fetchDashboardAssessmentCoverage(),
        );
    }

    if (flags.includeActivity) {
        tasks.push(fetchActivityLogs());
    }

    await Promise.all(tasks);
    emit('data:synced');
}

export { syncAll };
