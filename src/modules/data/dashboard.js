import { backend } from '../../lib/backend.js';
import {
    state,
    emit,
    debugError,
} from './runtime.js';

const DEFAULT_DASHBOARD_SUMMARY = Object.freeze({
    active_employees: 0,
    on_probation: 0,
    active_pips: 0,
    kpi_pending_approval: 0,
    failed_notifications: 0,
    open_hires: 0,
});

async function fetchDashboardSummary() {
    try {
        const { data, error } = await backend.dashboard.fetchSummary();
        if (error) throw error;
        state.dashboardSummary = {
            ...DEFAULT_DASHBOARD_SUMMARY,
            ...(data || {}),
        };
        emit('data:dashboardSummary', state.dashboardSummary);
        return state.dashboardSummary;
    } catch (error) {
        debugError('Fetch dashboard summary error:', error);
        state.dashboardSummary = null;
        emit('data:dashboardSummary', state.dashboardSummary);
        return state.dashboardSummary;
    }
}

async function fetchDashboardProbationExpiry(limit = 8) {
    try {
        const { data, error } = await backend.dashboard.fetchProbationExpiry(limit);
        if (error) throw error;
        state.dashboardProbationExpiry = data || [];
        emit('data:dashboardProbationExpiry', state.dashboardProbationExpiry);
        return state.dashboardProbationExpiry;
    } catch (error) {
        debugError('Fetch dashboard probation expiry error:', error);
        state.dashboardProbationExpiry = [];
        emit('data:dashboardProbationExpiry', state.dashboardProbationExpiry);
        return state.dashboardProbationExpiry;
    }
}

async function fetchDashboardAssessmentCoverage() {
    try {
        const { data, error } = await backend.dashboard.fetchAssessmentCoverage();
        if (error) throw error;
        state.dashboardAssessmentCoverage = data || [];
        emit('data:dashboardAssessmentCoverage', state.dashboardAssessmentCoverage);
        return state.dashboardAssessmentCoverage;
    } catch (error) {
        debugError('Fetch dashboard assessment coverage error:', error);
        state.dashboardAssessmentCoverage = [];
        emit('data:dashboardAssessmentCoverage', state.dashboardAssessmentCoverage);
        return state.dashboardAssessmentCoverage;
    }
}

export {
    DEFAULT_DASHBOARD_SUMMARY,
    fetchDashboardSummary,
    fetchDashboardProbationExpiry,
    fetchDashboardAssessmentCoverage,
};
