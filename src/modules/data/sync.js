import { state, emit } from './runtime.js';
import { getEnabledModuleSet } from '../../config/app-modules.js';
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
import {
    fetchHrDocumentTemplates,
    fetchHrDocumentReferenceOptions,
} from './hr-documents.js';

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

async function syncAll(options = {}) {
    const role = state.currentUser?.role || 'employee';
    const flags = getRoleSyncFlags(role);
    const enabledModules = options.enabledModules || getEnabledModuleSet();
    const hasModule = (moduleId) => enabledModules.has(moduleId);
    const hasAnyModule = (...moduleIds) => moduleIds.some((moduleId) => enabledModules.has(moduleId));
    const includeHrDocuments = ['superadmin', 'hr'].includes(String(role || '').trim().toLowerCase());

    const tasks = [
        fetchSettings(),
        fetchEmployees(),
        fetchKpiRecords(),
    ];

    if (hasAnyModule('assessment', 'tna')) {
        tasks.push(fetchConfig());
    }

    if (hasModule('kpi')) {
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
    }

    if (hasModule('probation') && flags.includeProbation) {
        tasks.push(
            fetchProbationReviews(),
            fetchProbationQualitativeItems(),
            fetchProbationMonthlyScores(),
            fetchProbationAttendanceRecords(),
        );
    }

    if (hasModule('pip')) {
        tasks.push(
            fetchPipPlans(),
            fetchPipActions(),
        );
    }

    if (hasModule('manpower') && flags.includeManpower) {
        tasks.push(
            fetchManpowerPlans(),
            fetchHeadcountRequests(),
        );
    }

    if (hasModule('recruitment') && flags.includeManpower) {
        tasks.push(fetchRecruitmentPipeline());
    }

    if (includeHrDocuments) {
        tasks.push(
            fetchHrDocumentTemplates(),
            fetchHrDocumentReferenceOptions(),
        );
    }

    if (hasModule('dashboard') && flags.includeDashboardReads) {
        tasks.push(fetchDashboardSummary());
        if (hasModule('probation') && flags.includeProbation) {
            tasks.push(fetchDashboardProbationExpiry());
        }
        if (hasAnyModule('assessment', 'tna')) {
            tasks.push(fetchDashboardAssessmentCoverage());
        }
    }

    if (flags.includeActivity) {
        tasks.push(fetchActivityLogs());
    }

    await Promise.all(tasks);
    emit('data:synced');
}

export { syncAll };
