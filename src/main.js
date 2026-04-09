// ==================================================
// MAIN ENTRY POINT — App Initialization
// ==================================================

import './styles/main.css';

// ---- Component HTML Imports (inlined at build time via Vite ?raw) ----
import loginHTML from './components/login.html?raw';
import headerHTML from './components/header.html?raw';
import dashboardHTML from './components/tab-dashboard.html?raw';
import employeesHTML from './components/tab-employees.html?raw';
import assessmentHTML from './components/tab-assessment.html?raw';
import recordsHTML from './components/tab-records.html?raw';
import settingsHTML from './components/tab-settings.html?raw';
import overlaysHTML from './components/overlays.html?raw';

// Inject components into shell
document.getElementById('component-login').innerHTML = loginHTML;
document.getElementById('component-header').innerHTML = headerHTML;
document.getElementById('component-dashboard').innerHTML = dashboardHTML;
document.getElementById('component-employees').innerHTML = employeesHTML;
document.getElementById('component-assessment').innerHTML = assessmentHTML;
document.getElementById('component-records').innerHTML = recordsHTML;
document.getElementById('component-settings').innerHTML = settingsHTML;
document.getElementById('component-overlays').innerHTML = overlaysHTML;

import { state, subscribe, emit, isAdmin, isManager, isEmployee, setReportFilters } from './lib/store.js';
import { restoreSession, signIn, signOut, requestPasswordReset, promptChangePassword, enforcePasswordPolicyOnLogin } from './modules/auth.js';
import { syncAll, fetchSettings } from './modules/data.js';
import { renderDashboard, openDeptKpiModal, renderDeptKpiTable, exportDeptKpiExcel, exportDeptKpiPDF, exportEmployeeKpiPDF, searchDeptKpiModal } from './modules/dashboard.js';
import { renderRecordsTable, openReportByVal, openTrainingLog, closeTrainingLog, closeReport, searchRecords, deleteRecordSafe, editRecordSafe, saveTrainingLog, approveTraining, editTrainingItem, deleteTrainingItem, resetTrainingForm, fillTrainingRec, toggleOngoing, initiateSelfAssessment as recordSelfAssess, renderProbationPipView, generateProbationDrafts, reviewProbation, addProbationAttendanceEntry, exportProbationPdf, exportProbationCsv, generatePipPlans, updatePipPlanStatus } from './modules/records.js';
import { renderPendingList, loadPendingEmployee, startAssessment, renderQuestions, reviewAssessment, finalSubmit, goBack, initiateSelfAssessment } from './modules/assessment.js';
import { renderAdminList, savePositionConfig, loadPositionForEdit, deletePositionConfig, clearAdminForm, exportConfigJSON, triggerConfigImport, importConfigJSON, addCompetencyRow, removeCompetencyRow } from './modules/admin.js';
import { renderEmployeeManager, saveEmployeeData, loadEmployeeForEdit, resetEmployeeForm, deleteEmployeeData, exportEmployeeCSV, importEmployeeCSV } from './modules/employees.js';
import { renderKpiManager, submitKpiRecord, saveKpiDef, editKpiDef, copyKpiDef, removeKpiDef, editKpiRecord, removeKpiRecord, clearKpiDefForm, onKpiMetricChange, calcKpiPercentage, onKpiEmployeeChange, onKpiTargetPeriodChange, exportKpiJSON, importKpiJSON, startKpiInput, saveKpiTargets, renderKpiHistory, saveKpiGovernanceConfig, approveKpiDefinitionVersion, rejectKpiDefinitionVersion, approveKpiTargetVersion, rejectKpiTargetVersion } from './modules/kpi.js';
import {
    renderSettings,
    saveAppSettings,
    applyBranding,
    editUserRole,
    setupUserLogin,
    saveOrgConfig,
    addOrgDepartment,
    addOrgPosition,
    exportOrgConfigJSON,
    triggerOrgConfigImport,
    importOrgConfigJSON,
} from './modules/settings.js';

import { debugError, escapeHTML } from './lib/utils.js';
import { getRoleScopedEmployeeIds } from './lib/reportFilters.js';
import * as notify from './lib/notify.js';
import { initMonitoring } from './lib/monitoring.js';

const SESSION_IDLE_MINUTES = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES || 30);
const SESSION_IDLE_MS = Math.max(5, SESSION_IDLE_MINUTES) * 60 * 1000;
let _idleTimer = null;
let _sessionEventsBound = false;
let _sidebarCollapsed = false;

const NAVIGATION_GROUPS = [
    {
        id: 'nav-group-dashboard',
        label: 'Dashboard',
        icon: 'bi-speedometer2',
        roles: ['superadmin', 'manager', 'hr', 'director'],
        endpoints: [],
        children: [
            {
                id: 'nav-dashboard-overview',
                label: 'Overview',
                description: 'Company pulse and analytics',
                badge: 'Live',
                tabId: 'tab-dashboard',
                navId: 'nav-dashboard',
                contentTitle: 'Dashboard',
                contentDescription: 'Track company performance, workforce activity, and HR operations in one place.',
                activate: () => {
                    switchTab('tab-dashboard');
                    toggleDashboardView('dashboard-kpi');
                },
            },
            {
                id: 'nav-dashboard-assessment',
                label: 'Assessment Summary',
                description: 'Department progress and skill gaps',
                tabId: 'tab-dashboard',
                navId: 'nav-dashboard',
                contentTitle: 'Assessment Summary',
                contentDescription: 'Review competency coverage, score distribution, and assessment performance by department.',
                activate: () => {
                    switchTab('tab-dashboard');
                    toggleDashboardView('dashboard-assessment');
                },
            },
        ],
    },
    {
        id: 'nav-group-employees',
        label: 'Employees',
        icon: 'bi-people-fill',
        roles: ['superadmin'],
        endpoints: ['employees', 'employee_training_records'],
        children: [
            {
                id: 'nav-employees',
                label: 'Manpower Planning',
                description: 'Headcount and staffing structure',
                badge: 'HR',
                tabId: 'tab-employees',
                navId: 'nav-employees',
                contentTitle: 'Employee Operations',
                contentDescription: 'Manage workforce planning, staffing structure, and employee master data.',
                activate: () => switchTab('tab-employees'),
            },
            {
                id: 'nav-employees-add',
                label: 'Add New Employee',
                description: 'Open the employee entry form',
                tabId: 'tab-employees',
                navId: 'nav-employees',
                contentTitle: 'Add New Employee',
                contentDescription: 'Create or update employee records with role, department, manager, and access data.',
                activate: () => {
                    switchTab('tab-employees');
                    document.getElementById('emp-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
            },
            {
                id: 'nav-employees-directory',
                label: 'Staff Directory',
                description: 'Browse and export employee records',
                tabId: 'tab-employees',
                navId: 'nav-employees',
                contentTitle: 'Staff Directory',
                contentDescription: 'Review the active employee roster, export lists, and manage imported records.',
                activate: () => {
                    switchTab('tab-employees');
                    document.getElementById('employee-list-body')?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
            },
        ],
    },
    {
        id: 'nav-group-assessment',
        label: 'Assessment & KPI',
        icon: 'bi-clipboard-check',
        roles: ['superadmin', 'manager', 'director'],
        endpoints: [
            'employee_assessments',
            'employee_assessment_scores',
            'employee_assessment_history',
            'competency_config',
            'kpi_definitions',
            'kpi_definition_versions',
            'employee_kpi_target_versions',
            'kpi_weight_profiles',
            'kpi_weight_items',
            'kpi_records',
            'employee_performance_scores',
        ],
        children: [
            {
                id: 'nav-assessment-pending',
                label: 'Assessment Queue',
                description: 'Pending reviews and submissions',
                badge: 'Core',
                tabId: 'tab-assessment',
                navId: 'nav-assessment',
                contentTitle: 'Assessment Workflow',
                contentDescription: 'Run employee assessments, review submissions, and capture KPI updates from one workspace.',
                activate: () => switchTab('tab-assessment'),
            },
            {
                id: 'nav-assessment-kpi',
                label: 'KPI Input',
                description: 'Targets, definitions, and governance',
                tabId: 'tab-settings',
                navId: 'nav-settings',
                contentTitle: 'KPI Management',
                contentDescription: 'Maintain KPI definitions, employee targets, weighting, and approval workflows.',
                activate: () => {
                    switchTab('tab-settings');
                    const btn = document.querySelector('#settingsPills [data-target="set-kpi"]');
                    toggleSettingsView('set-kpi', btn);
                },
            },
        ],
    },
    {
        id: 'nav-group-records',
        label: 'Records',
        icon: 'bi-journal-richtext',
        roles: ['superadmin', 'manager', 'hr', 'director', 'employee'],
        endpoints: [
            'probation_reviews',
            'probation_qualitative_items',
            'probation_monthly_scores',
            'probation_attendance_records',
            'pip_plans',
            'pip_actions',
        ],
        children: [
            {
                id: 'nav-records-assessment',
                label: 'Assessment Records',
                description: 'Historical performance snapshots',
                badge: 'View',
                tabId: 'tab-records',
                navId: 'nav-records',
                contentTitle: 'Assessment Records',
                contentDescription: 'Search employee assessment outcomes, reports, training notes, and review history.',
                activate: () => {
                    switchTab('tab-records');
                    const btn = document.querySelector('#recordsPills [data-target="records-assessment"]');
                    toggleRecordsView('records-assessment', btn);
                },
            },
            {
                id: 'nav-records-kpi',
                label: 'KPI Records',
                description: 'Monthly progress and achievement',
                tabId: 'tab-records',
                navId: 'nav-records',
                contentTitle: 'KPI Records',
                contentDescription: 'Inspect KPI history, target attainment, and employee performance trends over time.',
                activate: () => {
                    switchTab('tab-records');
                    const btn = document.querySelector('#recordsPills [data-target="records-kpi"]');
                    toggleRecordsView('records-kpi', btn);
                },
            },
            {
                id: 'nav-records-probation',
                label: 'Probation & PIP',
                description: 'Reviews, attendance, and plans',
                tabId: 'tab-records',
                navId: 'nav-records',
                contentTitle: 'Probation & PIP',
                contentDescription: 'Manage probation reviews, attendance entries, and performance improvement plans.',
                activate: () => {
                    switchTab('tab-records');
                    const btn = document.querySelector('#recordsPills [data-target="records-probation"]');
                    toggleRecordsView('records-probation', btn);
                },
            },
        ],
    },
    {
        id: 'nav-group-settings',
        label: 'Settings',
        icon: 'bi-sliders',
        roles: ['superadmin', 'manager', 'hr'],
        endpoints: ['app_settings', 'admin_activity_log'],
        children: [
            {
                id: 'nav-settings-branding',
                label: 'Branding & Layout',
                description: 'App text, theme, and appearance',
                badge: 'Admin',
                roles: ['superadmin', 'hr'],
                tabId: 'tab-settings',
                navId: 'nav-settings',
                contentTitle: 'Application Settings',
                contentDescription: 'Configure branding, organization structure, user permissions, and system setup.',
                activate: () => {
                    switchTab('tab-settings');
                    const btn = document.querySelector('#settingsPills [data-target="set-general"]');
                    toggleSettingsView('set-general', btn);
                },
            },
            {
                id: 'nav-settings-users',
                label: 'Users & Roles',
                description: 'Access control and activity logs',
                roles: ['superadmin', 'hr'],
                tabId: 'tab-settings',
                navId: 'nav-settings',
                contentTitle: 'Users & Roles',
                contentDescription: 'Manage login access, role assignments, and recent admin activity.',
                activate: () => {
                    switchTab('tab-settings');
                    const btn = document.querySelector('#settingsPills [data-target="set-users"]');
                    toggleSettingsView('set-users', btn);
                },
            },
            {
                id: 'nav-settings-competencies',
                label: 'Competencies',
                description: 'Position skill matrices',
                roles: ['superadmin', 'manager', 'hr'],
                tabId: 'tab-settings',
                navId: 'nav-settings',
                contentTitle: 'Competency Setup',
                contentDescription: 'Maintain competencies, organizational role maps, and benchmark requirements.',
                activate: () => {
                    switchTab('tab-settings');
                    const btn = document.querySelector('#settingsPills [data-target="set-competencies"]');
                    toggleSettingsView('set-competencies', btn);
                },
            },
            {
                id: 'nav-settings-org',
                label: 'Organization Map',
                description: 'Departments and positions',
                roles: ['superadmin', 'hr'],
                tabId: 'tab-settings',
                navId: 'nav-settings',
                contentTitle: 'Organization Map',
                contentDescription: 'Organize departments, positions, and reporting relationships across the company.',
                activate: () => {
                    switchTab('tab-settings');
                    const btn = document.querySelector('#settingsPills [data-target="set-org"]');
                    toggleSettingsView('set-org', btn);
                },
            },
        ],
    },
];

// ---- Expose functions to onclick handlers ----
window.__app = {
    // Auth
    attemptLogin, doLogout, forgotPassword, changeMyPassword,

    // Navigation
    switchTab, toggleTheme, toggleDashboardView, updateReportFilters, clearReportFilters,
    handleSidebarItemClick, toggleSidebarGroup, toggleSidebarMobile,

    // Assessment
    renderPendingList, loadPendingEmployee, startAssessment, renderQuestions,
    reviewAssessment, finalSubmit, goBack,

    // Records
    renderRecordsTable, openReportByVal, openTrainingLog, closeTrainingLog,
    closeReport, searchRecords, deleteRecordSafe, editRecordSafe,
    saveTrainingLog, approveTraining, editTrainingItem, deleteTrainingItem,
    resetTrainingForm, fillTrainingRec, toggleOngoing,
    renderProbationPipView, generateProbationDrafts, reviewProbation, addProbationAttendanceEntry, exportProbationPdf, exportProbationCsv, generatePipPlans, updatePipPlanStatus,
    initiateSelfAssessment: recordSelfAssess,

    // Admin
    renderAdminList, savePositionConfig, loadPositionForEdit, deletePositionConfig,
    clearAdminForm, exportConfigJSON, triggerConfigImport, importConfigJSON,
    addCompetencyRow, removeCompetencyRow,

    // Employees
    renderEmployeeManager, saveEmployeeData, loadEmployeeForEdit, resetEmployeeForm,
    deleteEmployeeData, exportEmployeeCSV, importEmployeeCSV,

    // Dashboard
    renderDashboard, openDeptKpiModal, renderDeptKpiTable, exportDeptKpiExcel, exportDeptKpiPDF, exportEmployeeKpiPDF, searchDeptKpiModal,

    // KPI
    renderKpiManager, submitKpiRecord, saveKpiDef, editKpiDef, copyKpiDef, removeKpiDef, editKpiRecord,
    removeKpiRecord, clearKpiDefForm, onKpiMetricChange, calcKpiPercentage, onKpiEmployeeChange, onKpiTargetPeriodChange, exportKpiJSON, importKpiJSON, startKpiInput, saveKpiTargets, renderKpiHistory, saveKpiGovernanceConfig, approveKpiDefinitionVersion, rejectKpiDefinitionVersion, approveKpiTargetVersion, rejectKpiTargetVersion,

    // Settings
    renderSettings, saveAppSettings, editUserRole, setupUserLogin, saveOrgConfig, addOrgDepartment, addOrgPosition,
    exportOrgConfigJSON, triggerOrgConfigImport, importOrgConfigJSON,
    toggleSettingsView, toggleRecordsView,
};

function doLogout() {
    clearSessionTimer();
    signOut();
}

// ---- Tab Navigation ----
function switchTab(tabId) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab, .sidebar-link').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    const tabMapping = {
        'tab-dashboard': 'nav-dashboard',
        'tab-employees': 'nav-employees',
        'tab-assessment': 'nav-assessment',
        'tab-records': 'nav-records',
        'tab-settings': 'nav-settings',
    };

    const navId = tabMapping[tabId];
    if (navId) {
        const navEl = document.getElementById(navId);
        if (navEl) navEl.classList.add('active');
    }

    syncSidebarActiveState(tabId);

    // Trigger renders
    if (tabId === 'tab-dashboard') renderDashboard();
    if (tabId === 'tab-records') {
        renderRecordsTable();
        renderKpiHistory();
        renderProbationPipView();
    }
    if (tabId === 'tab-assessment') renderPendingList();
    if (tabId === 'tab-employees') renderEmployeeManager();
    if (tabId === 'tab-settings') {
        renderSettings();
        renderAdminList();
        renderKpiManager();
    }
}

function getAllowedNavigationGroups(role = state.currentUser?.role) {
    return NAVIGATION_GROUPS
        .filter(group => (group.roles || []).includes(role))
        .map(group => ({
            ...group,
            children: (group.children || []).filter(child => !child.roles || child.roles.includes(role)),
        }))
        .filter(group => group.children.length > 0);
}

function renderSidebarNavigation() {
    const container = document.getElementById('sidebar-nav-groups');
    if (!container) return;

    const role = state.currentUser?.role || 'employee';
    const groups = getAllowedNavigationGroups(role);

    container.innerHTML = groups.map((group, index) => `
        <section class="sidebar-group">
            <button
                class="sidebar-group-toggle"
                id="${group.id}"
                type="button"
                aria-expanded="${index === 0 ? 'true' : 'false'}"
                onclick="window.__app.toggleSidebarGroup('${group.id}')">
                <span class="sidebar-group-meta">
                    <span class="sidebar-group-icon"><i class="bi ${group.icon}"></i></span>
                    <span>${escapeHTML(group.label)}</span>
                </span>
                <i class="bi bi-chevron-down sidebar-group-chevron"></i>
            </button>
            <div class="sidebar-group-items ${index === 0 ? '' : 'hidden'}" data-group-panel="${group.id}">
                ${group.children.map(child => `
                    <button
                        class="sidebar-link nav-tab"
                        id="${child.id}"
                        type="button"
                        data-tab="${child.tabId}"
                        data-parent-nav="${child.navId}"
                        onclick="window.__app.handleSidebarItemClick('${child.id}')">
                        <span class="sidebar-link-label">
                            <span class="sidebar-link-title">${escapeHTML(child.label)}</span>
                            <span class="sidebar-link-copy">${escapeHTML(child.description || '')}</span>
                        </span>
                        ${child.badge ? `<span class="sidebar-link-badge">${escapeHTML(child.badge)}</span>` : ''}
                    </button>
                `).join('')}
            </div>
        </section>
    `).join('');
}

function handleSidebarItemClick(itemId) {
    const target = NAVIGATION_GROUPS.flatMap(group => group.children).find(child => child.id === itemId);
    if (!target) return;
    target.activate?.();
    setContentHeader(target);
    syncSidebarActiveState(target.tabId, itemId);
    closeSidebarMobile();
}

function setContentHeader(item) {
    const titleEl = document.getElementById('content-title');
    const copyEl = document.getElementById('content-description');
    if (titleEl && item?.contentTitle) titleEl.innerText = item.contentTitle;
    if (copyEl && item?.contentDescription) copyEl.innerText = item.contentDescription;
}

function syncSidebarActiveState(activeTabId, activeItemId = null) {
    const items = Array.from(document.querySelectorAll('.sidebar-link'));
    items.forEach(item => item.classList.remove('active'));

    const target = activeItemId
        ? document.getElementById(activeItemId)
        : items.find(item => item.dataset.tab === activeTabId);

    if (target) {
        target.classList.add('active');
        const panel = target.closest('.sidebar-group-items');
        const buttonId = panel?.dataset.groupPanel;
        if (buttonId) expandSidebarGroup(buttonId);
    }
}

function toggleSidebarGroup(groupId) {
    const toggle = document.getElementById(groupId);
    const panel = document.querySelector(`[data-group-panel="${groupId}"]`);
    if (!toggle || !panel) return;

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isExpanded));
    panel.classList.toggle('hidden', isExpanded);
}

function expandSidebarGroup(groupId) {
    const toggle = document.getElementById(groupId);
    const panel = document.querySelector(`[data-group-panel="${groupId}"]`);
    if (!toggle || !panel) return;

    toggle.setAttribute('aria-expanded', 'true');
    panel.classList.remove('hidden');
}

function toggleSidebarMobile() {
    document.querySelector('.app-shell')?.classList.toggle('sidebar-mobile-open');
}

function closeSidebarMobile() {
    document.querySelector('.app-shell')?.classList.remove('sidebar-mobile-open');
}

function clearSessionTimer() {
    if (_idleTimer) {
        clearTimeout(_idleTimer);
        _idleTimer = null;
    }
}

function bindSessionActivity() {
    if (_sessionEventsBound) return;
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
        window.addEventListener(evt, resetSessionTimer, { passive: true });
    });
    _sessionEventsBound = true;
}

function resetSessionTimer() {
    if (!state.currentUser) return;
    clearSessionTimer();
    _idleTimer = setTimeout(async () => {
        await notify.warn('Session timed out due to inactivity. Please login again.', 'Session Timeout');
        doLogout();
    }, SESSION_IDLE_MS);
}

function refreshActiveReports() {
    const activeTab = document.querySelector('.content-section.active')?.id;
    if (activeTab === 'tab-dashboard') renderDashboard();
    if (activeTab === 'tab-records') {
        const assessmentView = document.getElementById('records-assessment');
        const kpiView = document.getElementById('records-kpi');
        const probationView = document.getElementById('records-probation');

        const isAssessmentVisible = assessmentView && !assessmentView.classList.contains('hidden');
        const isKpiVisible = kpiView && !kpiView.classList.contains('hidden');
        const isProbationVisible = probationView && !probationView.classList.contains('hidden');

        if (isAssessmentVisible) {
            renderRecordsTable();
            return;
        }
        if (isKpiVisible) {
            renderKpiHistory();
            return;
        }
        if (isProbationVisible) {
            renderProbationPipView();
            return;
        }

        // Fallback when view state is not initialized yet.
        renderRecordsTable();
        renderKpiHistory();
        renderProbationPipView();
    }
}

function renderReportFilterOptions() {
    const card = document.getElementById('report-filters-card');
    const deptSel = document.getElementById('report-filter-department');
    const mgrSel = document.getElementById('report-filter-manager');
    const periodInput = document.getElementById('report-filter-period');
    if (!card || !deptSel || !mgrSel || !periodInput) return;

    const { currentUser, db, reportFilters } = state;
    if (!currentUser || currentUser.role === 'employee') {
        card.classList.add('hidden');
        return;
    }
    card.classList.remove('hidden');

    const scopedIds = getRoleScopedEmployeeIds();
    const currentDept = reportFilters.department || '';
    const currentMgr = reportFilters.manager_id || '';

    const departments = [...new Set(scopedIds.map(id => db[id]?.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    deptSel.innerHTML = '<option value="">All Departments</option>';
    departments.forEach(dept => {
        deptSel.innerHTML += `<option value="${escapeHTML(dept)}">${escapeHTML(dept)}</option>`;
    });

    const managerIds = new Set();
    scopedIds.forEach(id => {
        const rec = db[id];
        if (rec?.manager_id) managerIds.add(rec.manager_id);
    });
    Object.keys(db).forEach(id => {
        if (db[id]?.role === 'manager' || db[id]?.role === 'superadmin' || db[id]?.role === 'director') managerIds.add(id);
    });
    const managers = [...managerIds]
        .map(id => ({ id, name: db[id]?.name || id }))
        .sort((a, b) => a.name.localeCompare(b.name));

    mgrSel.innerHTML = '<option value="">All Managers</option>';
    managers.forEach(mgr => {
        mgrSel.innerHTML += `<option value="${escapeHTML(mgr.id)}">${escapeHTML(mgr.name)}</option>`;
    });

    if (currentUser.role === 'manager') {
        const ownDept = db[currentUser.id]?.department || '';
        deptSel.value = ownDept;
        deptSel.disabled = true;
        if (currentMgr && managers.some(m => m.id === currentMgr)) {
            mgrSel.value = currentMgr;
        }
    } else {
        deptSel.disabled = false;
        if (currentDept) deptSel.value = currentDept;
        if (currentMgr) mgrSel.value = currentMgr;
    }

    periodInput.value = reportFilters.period || '';
}

function updateReportFilters() {
    const deptSel = document.getElementById('report-filter-department');
    const mgrSel = document.getElementById('report-filter-manager');
    const periodInput = document.getElementById('report-filter-period');
    if (!deptSel || !mgrSel || !periodInput) return;

    const deptVal = deptSel.value || '';
    const mgrVal = mgrSel.value || '';
    const periodVal = periodInput.value || '';
    setReportFilters({
        department: deptVal,
        manager_id: mgrVal,
        period: periodVal,
    });
    refreshActiveReports();
}

function clearReportFilters() {
    const deptSel = document.getElementById('report-filter-department');
    const mgrSel = document.getElementById('report-filter-manager');
    const periodInput = document.getElementById('report-filter-period');
    const isMgr = state.currentUser?.role === 'manager';
    const ownDept = state.db[state.currentUser?.id]?.department || '';

    if (deptSel) deptSel.value = isMgr ? ownDept : '';
    if (mgrSel) mgrSel.value = '';
    if (periodInput) periodInput.value = '';

    setReportFilters({
        department: isMgr ? ownDept : '',
        manager_id: '',
        period: '',
    });
    refreshActiveReports();
}

// ---- Sub-View Toggle (Settings) ----
function toggleSettingsView(viewId, btn) {
    if (state.currentUser?.role === 'manager' && !['set-competencies', 'set-kpi'].includes(viewId)) return;
    ['set-general', 'set-users', 'set-competencies', 'set-kpi', 'set-org'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('#settingsPills .nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    if (btn) btn.classList.add('active');
    // Trigger KPI render when switching to KPI panel
    if (viewId === 'set-kpi') renderKpiManager();
    if (viewId === 'set-competencies') renderAdminList();
}

// ---- Sub-View Toggle (Dashboard) ----
function toggleDashboardView(viewId, btn) {
    ['dashboard-assessment', 'dashboard-kpi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('#dashboardPills .nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    if (btn) btn.classList.add('active');
}

// ---- Sub-View Toggle (Records) ----
function toggleRecordsView(viewId, btn) {
    ['records-assessment', 'records-kpi', 'records-probation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('#recordsPills .nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    if (btn) btn.classList.add('active');
    if (viewId === 'records-kpi') renderKpiHistory();
    if (viewId === 'records-probation') renderProbationPipView();
}

// ---- Theme Toggle ----
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-bs-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', next);
    localStorage.setItem('appTheme', next);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = next === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
}

// ---- Login ----
async function attemptLogin() {
    const email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    if (!email || !pass) {
        if (errorEl) { errorEl.innerText = 'Please enter email and password.'; errorEl.classList.remove('hidden'); }
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Signing in...';
    if (errorEl) errorEl.classList.add('hidden');

    try {
        await signIn(email, pass);
        await syncAll();
        await showApp();
    } catch (err) {
        if (errorEl) { errorEl.innerText = err.message || 'Invalid credentials.'; errorEl.classList.remove('hidden'); }
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign In';
    }
}

async function forgotPassword() {
    const rawEmail = document.getElementById('login-user')?.value?.trim() || '';
    const email = await notify.input({
        title: 'Reset Password',
        input: 'email',
        inputLabel: 'Enter your account email',
        inputValue: rawEmail,
        confirmButtonText: 'Send Reset Link',
        validate: value => {
            const v = String(value || '').trim();
            if (!v) return 'Email is required.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
            return null;
        },
    });
    if (email === null) return;

    try {
        await notify.withLoading(async () => {
            await requestPasswordReset(String(email).trim());
        }, 'Sending Reset Link', 'Please wait...');
        await notify.success('Password reset link sent. Check your email.');
    } catch (err) {
        await notify.error('Failed to send reset email: ' + (err.message || err));
    }
}

async function changeMyPassword() {
    if (!state.currentUser) return;
    const ok = await promptChangePassword({ enforced: false, clearMustChange: true });
    if (!ok) return;
}

// ---- Show App ----  
async function showApp() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    const { currentUser } = state;
    if (!currentUser) { signOut(); return; }

    applyBranding();

    const role = currentUser.role;

    renderSidebarNavigation();

    // Hide all nav items first
    document.querySelectorAll('.nav-item[data-role]').forEach(el => el.classList.add('hidden'));

    // Role-based navigation
    const navConfig = {
        superadmin: ['nav-dashboard', 'nav-employees', 'nav-assessment', 'nav-records', 'nav-settings'],
        manager: ['nav-dashboard', 'nav-assessment', 'nav-records', 'nav-settings'],
        hr: ['nav-dashboard', 'nav-records', 'nav-settings'],
        director: ['nav-dashboard', 'nav-assessment', 'nav-records'],
        employee: ['nav-records'],
    };

    const allowedNavs = navConfig[role] || navConfig.employee;

    allowedNavs.forEach(navId => {
        const navItem = document.getElementById(navId);
        if (navItem && navItem.closest('.nav-item')) {
            navItem.closest('.nav-item').classList.remove('hidden');
        }
    });

    // Update user display
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.innerText = currentUser.name;

    const roleEl = document.getElementById('user-role-badge');
    if (roleEl) {
        const roleLabels = { superadmin: 'Super Admin', manager: 'Manager', hr: 'HR', director: 'Director', employee: 'Employee' };
        roleEl.innerText = roleLabels[role] || role;
        roleEl.className = 'badge ms-2 ' + (role === 'superadmin'
            ? 'bg-danger'
            : role === 'hr'
                ? 'bg-success'
            : role === 'manager'
                ? 'bg-warning text-dark'
                : role === 'director'
                    ? 'bg-info text-dark'
                    : 'bg-secondary');
    }

    const defaultNavItem = getAllowedNavigationGroups(role).flatMap(group => group.children).find(Boolean);
    if (defaultNavItem) {
        setContentHeader(defaultNavItem);
    }

    renderReportFilterOptions();
    clearReportFilters();
    bindSessionActivity();
    resetSessionTimer();

    const passOk = await enforcePasswordPolicyOnLogin();
    if (!passOk) return;

    // Default tab
    if (role === 'superadmin' || role === 'manager' || role === 'hr' || role === 'director') {
        switchTab('tab-dashboard');
    } else {
        switchTab('tab-records');
    }
}

// ---- Subscribe to events ----
subscribe('nav:switchTab', switchTab);
subscribe('data:settings', applyBranding);
subscribe('data:employees', () => {
    renderReportFilterOptions();
});

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', async function () {
    initMonitoring();

    // Restore Theme
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.innerHTML = savedTheme === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';

    // Load branding before login screen is used.
    await fetchSettings();
    applyBranding();

    // Try restore session
    try {
        const user = await restoreSession();
        if (user) {
            await syncAll();
            await showApp();
        }
    } catch (err) {
        debugError('Session restore failed:', err);
    }
});
