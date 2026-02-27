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

import { state, subscribe, emit, isAdmin, isManager, isEmployee } from './lib/store.js';
import { restoreSession, signIn, signOut } from './modules/auth.js';
import { syncAll } from './modules/data.js';
import { renderDashboard, openDeptKpiModal, exportDeptKpiExcel, exportDeptKpiPDF } from './modules/dashboard.js';
import { renderRecordsTable, openReportByVal, openTrainingLog, closeTrainingLog, closeReport, searchRecords, deleteRecordSafe, editRecordSafe, saveTrainingLog, approveTraining, editTrainingItem, deleteTrainingItem, resetTrainingForm, fillTrainingRec, toggleOngoing, initiateSelfAssessment as recordSelfAssess } from './modules/records.js';
import { renderPendingList, loadPendingEmployee, startAssessment, renderQuestions, reviewAssessment, finalSubmit, goBack, initiateSelfAssessment } from './modules/assessment.js';
import { renderAdminList, savePositionConfig, loadPositionForEdit, deletePositionConfig, clearAdminForm, exportConfigJSON, triggerConfigImport, importConfigJSON, addCompetencyRow, removeCompetencyRow } from './modules/admin.js';
import { renderEmployeeManager, saveEmployeeData, loadEmployeeForEdit, resetEmployeeForm, deleteEmployeeData, exportEmployeeCSV, importEmployeeCSV } from './modules/employees.js';
import { renderKpiManager, submitKpiRecord, saveKpiDef, editKpiDef, copyKpiDef, removeKpiDef, removeKpiRecord, clearKpiDefForm, onKpiMetricChange, calcKpiPercentage, onKpiEmployeeChange, exportKpiJSON, importKpiJSON, startKpiInput, saveKpiTargets, renderKpiHistory } from './modules/kpi.js';
import { renderSettings, saveAppSettings, applyBranding, editUserRole, setupUserLogin, saveOrgConfig, addOrgDepartment, addOrgPosition } from './modules/settings.js';

// ---- Expose functions to onclick handlers ----
window.__app = {
    // Auth
    attemptLogin, doLogout: signOut,

    // Navigation
    switchTab, toggleTheme, toggleDashboardView,

    // Assessment
    renderPendingList, loadPendingEmployee, startAssessment, renderQuestions,
    reviewAssessment, finalSubmit, goBack, initiateSelfAssessment,

    // Records
    renderRecordsTable, openReportByVal, openTrainingLog, closeTrainingLog,
    closeReport, searchRecords, deleteRecordSafe, editRecordSafe,
    saveTrainingLog, approveTraining, editTrainingItem, deleteTrainingItem,
    resetTrainingForm, fillTrainingRec, toggleOngoing,
    initiateSelfAssessment: recordSelfAssess,

    // Admin
    renderAdminList, savePositionConfig, loadPositionForEdit, deletePositionConfig,
    clearAdminForm, exportConfigJSON, triggerConfigImport, importConfigJSON,
    addCompetencyRow, removeCompetencyRow,

    // Employees
    renderEmployeeManager, saveEmployeeData, loadEmployeeForEdit, resetEmployeeForm,
    deleteEmployeeData, exportEmployeeCSV, importEmployeeCSV,

    // Dashboard
    renderDashboard, openDeptKpiModal, exportDeptKpiExcel, exportDeptKpiPDF,

    // KPI
    renderKpiManager, submitKpiRecord, saveKpiDef, editKpiDef, copyKpiDef, removeKpiDef,
    removeKpiRecord, clearKpiDefForm, onKpiMetricChange, calcKpiPercentage, onKpiEmployeeChange, exportKpiJSON, importKpiJSON, startKpiInput, saveKpiTargets, renderKpiHistory,

    // Settings
    renderSettings, saveAppSettings, editUserRole, setupUserLogin, saveOrgConfig, addOrgDepartment, addOrgPosition, toggleSettingsView, toggleDashboardView, toggleRecordsView,
};

// ---- Tab Navigation ----
function switchTab(tabId) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

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

    // Trigger renders
    if (tabId === 'tab-dashboard') renderDashboard();
    if (tabId === 'tab-records') {
        renderRecordsTable();
        renderKpiHistory();
    }
    if (tabId === 'tab-assessment') renderPendingList();
    if (tabId === 'tab-employees') renderEmployeeManager();
    if (tabId === 'tab-settings') {
        renderSettings();
        renderAdminList();
        renderKpiManager();
    }
}

// ---- Sub-View Toggle (Settings) ----
function toggleSettingsView(viewId, btn) {
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
    ['records-assessment', 'records-kpi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('#recordsPills .nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    if (btn) btn.classList.add('active');
    if (viewId === 'records-kpi') renderKpiHistory();
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
        showApp();
    } catch (err) {
        if (errorEl) { errorEl.innerText = err.message || 'Invalid credentials.'; errorEl.classList.remove('hidden'); }
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign In';
    }
}

// ---- Show App ----  
function showApp() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    const { currentUser } = state;
    if (!currentUser) { signOut(); return; }

    applyBranding();

    const role = currentUser.role;

    // Hide all nav items first
    document.querySelectorAll('.nav-item[data-role]').forEach(el => el.classList.add('hidden'));

    // Role-based navigation
    const navConfig = {
        superadmin: ['nav-dashboard', 'nav-employees', 'nav-assessment', 'nav-records', 'nav-settings'],
        manager: ['nav-dashboard', 'nav-assessment', 'nav-records'],
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
        const roleLabels = { superadmin: 'Super Admin', manager: 'Manager', employee: 'Employee' };
        roleEl.innerText = roleLabels[role] || role;
        roleEl.className = 'badge ms-2 ' + (role === 'superadmin' ? 'bg-danger' : role === 'manager' ? 'bg-warning text-dark' : 'bg-secondary');
    }

    // Default tab
    if (role === 'superadmin' || role === 'manager') {
        switchTab('tab-dashboard');
    } else {
        switchTab('tab-records');
    }
}

// ---- Subscribe to events ----
subscribe('nav:switchTab', switchTab);

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', async function () {
    // Restore Theme
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.innerHTML = savedTheme === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';

    // Try restore session
    try {
        const user = await restoreSession();
        if (user) {
            await syncAll();
            showApp();
        }
    } catch (err) {
        console.error('Session restore failed:', err);
    }
});
