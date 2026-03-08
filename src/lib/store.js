// ==================================================
// REACTIVE STATE STORE
// ==================================================

export const state = {
    db: {},           // Employee database { id: { ...record } }
    appConfig: {},    // Competency config { positionName: { competencies: [...] } }
    kpiConfig: [],    // KPI definitions
    kpiDefinitionVersions: [],
    employeeKpiTargetVersions: [],
    kpiRecords: [],   // KPI records
    kpiWeightProfiles: [],
    kpiWeightItems: [],
    employeePerformanceScores: [],
    probationReviews: [],
    probationQualitativeItems: [],
    probationMonthlyScores: [],
    probationAttendanceRecords: [],
    pipPlans: [],
    pipActions: [],
    activityLogs: [], // Admin/activity logs
    appSettings: {},  // App settings { app_name, company_name, ... }
    reportFilters: {
        department: '',
        manager_id: '',
        period: '',
    },
    currentUser: null,
    currentSession: {},
};

const listeners = {};

export function subscribe(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
}

export function emit(event, data) {
    if (listeners[event]) {
        listeners[event].forEach(fn => fn(data));
    }
}

export function setReportFilters(partial = {}) {
    state.reportFilters = {
        ...state.reportFilters,
        ...partial,
    };
    emit('filters:report', state.reportFilters);
    return state.reportFilters;
}

// Helper to check permissions
export function isAdmin() {
    return state.currentUser?.role === 'superadmin';
}

export function isManager() {
    return state.currentUser?.role === 'manager' || state.currentUser?.role === 'superadmin';
}

export function isDirector() {
    return state.currentUser?.role === 'director';
}

export function isEmployee() {
    return state.currentUser?.role === 'employee';
}

