// ==================================================
// MAIN ENTRY POINT — App Initialization
// ==================================================

import "./styles/main.css";

// ---- Component HTML Imports (inlined at build time via Vite ?raw) ----
import loginHTML from "./components/login.html?raw";
import headerHTML from "./components/header.html?raw";
import dashboardHTML from "./components/tab-dashboard.html?raw";
import employeesHTML from "./components/tab-employees.html?raw";
import assessmentHTML from "./components/tab-assessment.html?raw";
import recordsHTML from "./components/tab-records.html?raw";
import settingsHTML from "./components/tab-settings.html?raw";
import overlaysHTML from "./components/overlays.html?raw";

// Inject components into shell
document.getElementById("component-login").innerHTML = loginHTML;
document.getElementById("component-header").innerHTML = headerHTML;
document.getElementById("component-dashboard").innerHTML = dashboardHTML;
document.getElementById("component-employees").innerHTML = employeesHTML;
document.getElementById("component-assessment").innerHTML = assessmentHTML;
document.getElementById("component-records").innerHTML = recordsHTML;
document.getElementById("component-settings").innerHTML = settingsHTML;
document.getElementById("component-overlays").innerHTML = overlaysHTML;

import {
	state,
	subscribe,
	emit,
	isAdmin,
	isManager,
	isEmployee,
	setReportFilters,
} from "./lib/store.js";
import {
	restoreSession,
	signIn,
	signOut,
	requestPasswordReset,
	promptChangePassword,
	enforcePasswordPolicyOnLogin,
} from "./modules/auth.js";
import { syncAll } from "./modules/data/sync.js";
import { fetchSettings } from "./modules/data/settings.js";
import { applyBranding } from "./lib/branding.js";
import { debugError, escapeHTML } from "./lib/utils.js";
import { getSupabaseEnvValidation } from "./lib/supabase.js";
import { renderBootErrorScreen } from "./lib/env.js";
import { getRoleScopedEmployeeIds } from "./lib/reportFilters.js";
import {
	ACTIVE_MODULE_CONFIG,
	areAllModulesEnabled,
	isAnyModuleEnabled,
	isModuleEnabled,
} from "./config/app-modules.js";
import {
	getAllowedNavigationGroups,
	getNavigationItem,
} from "./config/module-navigation.js";
import * as notify from "./lib/notify.js";
import { initMonitoring } from "./lib/monitoring.js";

const SESSION_IDLE_MINUTES = Number(
	import.meta.env.VITE_SESSION_TIMEOUT_MINUTES || 30,
);
const SESSION_IDLE_MS = Math.max(5, SESSION_IDLE_MINUTES) * 60 * 1000;
let _idleTimer = null;
let _sessionEventsBound = false;
let _sidebarCollapsed = false;

const FEATURE_LOADERS = {
	dashboard: () => import("./modules/dashboard.js"),
	records: () => import("./modules/records.js"),
	recordsProbation: () => import("./modules/records-probation.js"),
	assessment: () => import("./modules/assessment.js"),
	admin: () => import("./modules/admin.js"),
	employees: () => import("./modules/employees.js"),
	kpi: () => import("./modules/kpi.js"),
	settings: () => import("./modules/settings.js"),
};

const _featureModuleCache = {};

async function loadFeatureModule(feature) {
	if (!_featureModuleCache[feature]) {
		_featureModuleCache[feature] = FEATURE_LOADERS[feature]().catch((err) => {
			delete _featureModuleCache[feature];
			debugError(`Feature module load failed: ${feature}`, err);
			throw err;
		});
	}
	return _featureModuleCache[feature];
}

function createFeatureAction(feature, exportName) {
	return async (...args) => {
		const mod = await loadFeatureModule(feature);
		const action = mod?.[exportName];
		if (typeof action !== "function") {
			throw new Error(
				`Feature action "${exportName}" is not available in "${feature}" module.`,
			);
		}
		return action(...args);
	};
}

function createFeatureActions(feature, exportNames) {
	return Object.fromEntries(
		exportNames.map((name) => [name, createFeatureAction(feature, name)]),
	);
}

const {
	renderDashboard,
	openDeptKpiModal,
	renderDeptKpiTable,
	exportDeptKpiExcel,
	exportDeptKpiPDF,
	exportEmployeeKpiPDF,
	searchDeptKpiModal,
} = createFeatureActions("dashboard", [
	"renderDashboard",
	"openDeptKpiModal",
	"renderDeptKpiTable",
	"exportDeptKpiExcel",
	"exportDeptKpiPDF",
	"exportEmployeeKpiPDF",
	"searchDeptKpiModal",
]);

const {
	renderRecordsTable,
	openReportByVal,
	openTrainingLog,
	closeTrainingLog,
	closeReport,
	searchRecords,
	deleteRecordSafe,
	editRecordSafe,
	saveTrainingLog,
	approveTraining,
	editTrainingItem,
	deleteTrainingItem,
	resetTrainingForm,
	fillTrainingRec,
	toggleOngoing,
	initiateSelfAssessment: recordSelfAssess,
} = createFeatureActions("records", [
	"renderRecordsTable",
	"openReportByVal",
	"openTrainingLog",
	"closeTrainingLog",
	"closeReport",
	"searchRecords",
	"deleteRecordSafe",
	"editRecordSafe",
	"saveTrainingLog",
	"approveTraining",
	"editTrainingItem",
	"deleteTrainingItem",
	"resetTrainingForm",
	"fillTrainingRec",
	"toggleOngoing",
	"initiateSelfAssessment",
]);

const {
	renderProbationPipView,
	generateProbationDrafts,
	reviewProbation,
	addProbationAttendanceEntry,
	exportProbationPdf,
	exportProbationCsv,
	generatePipPlans,
	updatePipPlanStatus,
} = createFeatureActions("recordsProbation", [
	"renderProbationPipView",
	"generateProbationDrafts",
	"reviewProbation",
	"addProbationAttendanceEntry",
	"exportProbationPdf",
	"exportProbationCsv",
	"generatePipPlans",
	"updatePipPlanStatus",
]);

const {
	renderPendingList,
	loadPendingEmployee,
	startAssessment,
	renderQuestions,
	reviewAssessment,
	finalSubmit,
	goBack,
	initiateSelfAssessment,
} = createFeatureActions("assessment", [
	"renderPendingList",
	"loadPendingEmployee",
	"startAssessment",
	"renderQuestions",
	"reviewAssessment",
	"finalSubmit",
	"goBack",
	"initiateSelfAssessment",
]);

const {
	renderAdminList,
	savePositionConfig,
	loadPositionForEdit,
	deletePositionConfig,
	clearAdminForm,
	exportConfigJSON,
	triggerConfigImport,
	importConfigJSON,
	addCompetencyRow,
	removeCompetencyRow,
} = createFeatureActions("admin", [
	"renderAdminList",
	"savePositionConfig",
	"loadPositionForEdit",
	"deletePositionConfig",
	"clearAdminForm",
	"exportConfigJSON",
	"triggerConfigImport",
	"importConfigJSON",
	"addCompetencyRow",
	"removeCompetencyRow",
]);

const {
	renderEmployeeManager,
	renderManpowerPlanning,
	renderHeadcountRequests,
	renderRecruitmentBoard,
	saveManpowerPlanData,
	loadManpowerPlanForEdit,
	resetManpowerPlanForm,
	deleteManpowerPlanData,
	syncHeadcountFormFromPlan,
	resetHeadcountRequestForm,
	loadHeadcountRequestForEdit,
	saveHeadcountRequestData,
	approveHeadcountRequest,
	rejectHeadcountRequest,
	cancelHeadcountRequest,
	resetRecruitmentCardForm,
	loadRecruitmentCardForEdit,
	saveRecruitmentCardData,
	moveRecruitmentCard,
	deleteRecruitmentCard,
	saveEmployeeData,
	loadEmployeeForEdit,
	resetEmployeeForm,
	deleteEmployeeData,
	exportEmployeeCSV,
	importEmployeeCSV,
	clearEmployeeDirectoryFilters,
} = createFeatureActions("employees", [
	"renderManpowerPlanning",
	"renderHeadcountRequests",
	"renderRecruitmentBoard",
	"saveManpowerPlanData",
	"loadManpowerPlanForEdit",
	"resetManpowerPlanForm",
	"deleteManpowerPlanData",
	"syncHeadcountFormFromPlan",
	"resetHeadcountRequestForm",
	"loadHeadcountRequestForEdit",
	"saveHeadcountRequestData",
	"approveHeadcountRequest",
	"rejectHeadcountRequest",
	"cancelHeadcountRequest",
	"resetRecruitmentCardForm",
	"loadRecruitmentCardForEdit",
	"saveRecruitmentCardData",
	"moveRecruitmentCard",
	"deleteRecruitmentCard",
	"renderEmployeeManager",
	"saveEmployeeData",
	"loadEmployeeForEdit",
	"resetEmployeeForm",
	"deleteEmployeeData",
	"exportEmployeeCSV",
	"importEmployeeCSV",
	"clearEmployeeDirectoryFilters",
]);

const {
	renderKpiManager,
	submitKpiRecord,
	saveKpiDef,
	editKpiDef,
	copyKpiDef,
	removeKpiDef,
	editKpiRecord,
	removeKpiRecord,
	clearKpiDefForm,
	onKpiMetricChange,
	calcKpiPercentage,
	onKpiEmployeeChange,
	onKpiTargetPeriodChange,
	exportKpiJSON,
	importKpiJSON,
	startKpiInput,
	saveKpiTargets,
	renderKpiHistory,
	saveKpiGovernanceConfig,
	approveKpiDefinitionVersion,
	rejectKpiDefinitionVersion,
	approveKpiTargetVersion,
	rejectKpiTargetVersion,
} = createFeatureActions("kpi", [
	"renderKpiManager",
	"submitKpiRecord",
	"saveKpiDef",
	"editKpiDef",
	"copyKpiDef",
	"removeKpiDef",
	"editKpiRecord",
	"removeKpiRecord",
	"clearKpiDefForm",
	"onKpiMetricChange",
	"calcKpiPercentage",
	"onKpiEmployeeChange",
	"onKpiTargetPeriodChange",
	"exportKpiJSON",
	"importKpiJSON",
	"startKpiInput",
	"saveKpiTargets",
	"renderKpiHistory",
	"saveKpiGovernanceConfig",
	"approveKpiDefinitionVersion",
	"rejectKpiDefinitionVersion",
	"approveKpiTargetVersion",
	"rejectKpiTargetVersion",
]);

const {
	renderSettings,
	saveAppSettings,
	resetProbationAttendanceRulesTemplate,
	addProbationAttendanceRuleEvent,
	removeProbationAttendanceRuleEvent,
	changeProbationAttendanceRuleMode,
	addProbationAttendanceRuleTier,
	removeProbationAttendanceRuleTier,
	editUserRole,
	setupUserLogin,
	saveOrgConfig,
	addOrgDepartment,
	addOrgPosition,
	exportOrgConfigJSON,
	triggerOrgConfigImport,
	importOrgConfigJSON,
} = createFeatureActions("settings", [
	"renderSettings",
	"saveAppSettings",
	"resetProbationAttendanceRulesTemplate",
	"addProbationAttendanceRuleEvent",
	"removeProbationAttendanceRuleEvent",
	"changeProbationAttendanceRuleMode",
	"addProbationAttendanceRuleTier",
	"removeProbationAttendanceRuleTier",
	"editUserRole",
	"setupUserLogin",
	"saveOrgConfig",
	"addOrgDepartment",
	"addOrgPosition",
	"exportOrgConfigJSON",
	"triggerOrgConfigImport",
	"importOrgConfigJSON",
]);

function parseModuleListAttr(value = "") {
	return String(value || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function isModuleSurfaceEnabled(element) {
	if (!element) return false;
	const requiredModules = parseModuleListAttr(element.dataset.moduleAll);
	const anyModules = parseModuleListAttr(element.dataset.moduleAnyof);
	const requiredOk =
		requiredModules.length === 0 || areAllModulesEnabled(requiredModules);
	const anyOk = anyModules.length === 0 || isAnyModuleEnabled(anyModules);
	return requiredOk && anyOk;
}

function applyModuleSurfaceVisibility() {
	document
		.querySelectorAll("[data-module-all], [data-module-anyof]")
		.forEach((element) => {
			element.classList.toggle("d-none", !isModuleSurfaceEnabled(element));
		});

	const recordsPills = document.getElementById("recordsPills");
	if (recordsPills) {
		const visibleButtons = Array.from(
			recordsPills.querySelectorAll("[data-target]"),
		).filter((button) => !button.classList.contains("d-none"));
		recordsPills.classList.toggle("d-none", visibleButtons.length <= 1);
	}
}

function isViewAvailable(viewId) {
	const el = document.getElementById(viewId);
	return Boolean(el) && !el.classList.contains("d-none");
}

function resolveAccessibleView(viewIds, preferredViewId, fallbackViewId = "") {
	const candidates = [
		preferredViewId,
		fallbackViewId,
		...viewIds,
	].filter(Boolean);
	return (
		candidates.find((viewId) => isViewAvailable(viewId)) ||
		viewIds.find((viewId) => isViewAvailable(viewId)) ||
		""
	);
}

// ---- Expose functions to onclick handlers ----
window.__app = {
	// Auth
	attemptLogin,
	doLogout,
	forgotPassword,
	changeMyPassword,

	// Navigation
	switchTab,
	toggleTheme,
	toggleDashboardView,
	toggleEmployeesView,
	updateReportFilters,
	clearReportFilters,
	handleSidebarItemClick,
	toggleSidebarGroup,
	toggleSidebarMobile,

	// Assessment
	renderPendingList,
	loadPendingEmployee,
	startAssessment,
	renderQuestions,
	reviewAssessment,
	finalSubmit,
	goBack,

	// Records
	renderRecordsTable,
	openReportByVal,
	openTrainingLog,
	closeTrainingLog,
	closeReport,
	searchRecords,
	deleteRecordSafe,
	editRecordSafe,
	saveTrainingLog,
	approveTraining,
	editTrainingItem,
	deleteTrainingItem,
	resetTrainingForm,
	fillTrainingRec,
	toggleOngoing,
	renderProbationPipView,
	generateProbationDrafts,
	reviewProbation,
	addProbationAttendanceEntry,
	exportProbationPdf,
	exportProbationCsv,
	generatePipPlans,
	updatePipPlanStatus,
	initiateSelfAssessment: recordSelfAssess,

	// Admin
	renderAdminList,
	savePositionConfig,
	loadPositionForEdit,
	deletePositionConfig,
	clearAdminForm,
	exportConfigJSON,
	triggerConfigImport,
	importConfigJSON,
	addCompetencyRow,
	removeCompetencyRow,

	// Employees
	renderManpowerPlanning,
	renderHeadcountRequests,
	renderRecruitmentBoard,
	saveManpowerPlanData,
	loadManpowerPlanForEdit,
	resetManpowerPlanForm,
	deleteManpowerPlanData,
	syncHeadcountFormFromPlan,
	resetHeadcountRequestForm,
	loadHeadcountRequestForEdit,
	saveHeadcountRequestData,
	approveHeadcountRequest,
	rejectHeadcountRequest,
	cancelHeadcountRequest,
	resetRecruitmentCardForm,
	loadRecruitmentCardForEdit,
	saveRecruitmentCardData,
	moveRecruitmentCard,
	deleteRecruitmentCard,
	renderEmployeeManager,
	saveEmployeeData,
	loadEmployeeForEdit,
	resetEmployeeForm,
	deleteEmployeeData,
	exportEmployeeCSV,
	importEmployeeCSV,
	clearEmployeeDirectoryFilters,

	// Dashboard
	renderDashboard,
	openDeptKpiModal,
	renderDeptKpiTable,
	exportDeptKpiExcel,
	exportDeptKpiPDF,
	exportEmployeeKpiPDF,
	searchDeptKpiModal,

	// KPI
	renderKpiManager,
	submitKpiRecord,
	saveKpiDef,
	editKpiDef,
	copyKpiDef,
	removeKpiDef,
	editKpiRecord,
	removeKpiRecord,
	clearKpiDefForm,
	onKpiMetricChange,
	calcKpiPercentage,
	onKpiEmployeeChange,
	onKpiTargetPeriodChange,
	exportKpiJSON,
	importKpiJSON,
	startKpiInput,
	saveKpiTargets,
	renderKpiHistory,
	saveKpiGovernanceConfig,
	approveKpiDefinitionVersion,
	rejectKpiDefinitionVersion,
	approveKpiTargetVersion,
	rejectKpiTargetVersion,

	// Settings
	renderSettings,
	saveAppSettings,
	resetProbationAttendanceRulesTemplate,
	addProbationAttendanceRuleEvent,
	removeProbationAttendanceRuleEvent,
	changeProbationAttendanceRuleMode,
	addProbationAttendanceRuleTier,
	removeProbationAttendanceRuleTier,
	editUserRole,
	setupUserLogin,
	saveOrgConfig,
	addOrgDepartment,
	addOrgPosition,
	exportOrgConfigJSON,
	triggerOrgConfigImport,
	importOrgConfigJSON,
	toggleSettingsView,
	toggleRecordsView,
};

function doLogout() {
	clearSessionTimer();
	signOut();
}

function getActiveDashboardViewId() {
	const viewIds = ["dashboard-assessment", "dashboard-kpi"];
	const currentView = viewIds.find((id) => {
		const el = document.getElementById(id);
		return el && !el.classList.contains("hidden") && !el.classList.contains("d-none");
	});
	return resolveAccessibleView(viewIds, currentView, "dashboard-kpi");
}

function getActiveRecordsViewId() {
	const viewIds = ["records-assessment", "records-kpi", "records-probation"];
	const currentView = viewIds.find((id) => {
		const el = document.getElementById(id);
		return el && !el.classList.contains("hidden") && !el.classList.contains("d-none");
	});
	const fallbackView = isAnyModuleEnabled(["assessment", "tna"])
		? "records-assessment"
		: "records-kpi";
	return resolveAccessibleView(viewIds, currentView, fallbackView);
}

function getActiveEmployeesViewId() {
	const viewIds = [
		"employees-planning",
		"employees-recruitment",
		"employees-directory",
		"employees-add",
	];
	const fallbackView = areAllModulesEnabled(["manpower"])
		? "employees-planning"
		: areAllModulesEnabled(["recruitment"])
			? "employees-recruitment"
			: "employees-directory";
	const currentView = viewIds.find((id) => {
		const el = document.getElementById(id);
		return el && !el.classList.contains("hidden") && !el.classList.contains("d-none");
	});
	return resolveAccessibleView(viewIds, currentView, fallbackView);
}

function getActiveSettingsViewId() {
	const panels = [
		"set-general",
		"set-users",
		"set-competencies",
		"set-kpi",
		"set-org",
	];
	const currentView = panels.find((id) => {
		const el = document.getElementById(id);
		return el && !el.classList.contains("hidden") && !el.classList.contains("d-none");
	});
	const fallbackView =
		state.currentUser?.role === "manager" && areAllModulesEnabled(["kpi"])
			? "set-kpi"
			: "set-general";
	return resolveAccessibleView(panels, currentView, fallbackView);
}

// ---- Tab Navigation ----
async function switchTab(tabId, options = {}) {
	document
		.querySelectorAll(".content-section")
		.forEach((el) => el.classList.remove("active"));
	document
		.querySelectorAll(".nav-tab, .sidebar-link")
		.forEach((el) => el.classList.remove("active"));

	const target = document.getElementById(tabId);
	if (target) target.classList.add("active");
	applyModuleSurfaceVisibility();
	renderReportFilterOptions();

	const tabMapping = {
		"tab-dashboard": "nav-dashboard",
		"tab-employees": "nav-employees",
		"tab-assessment": "nav-assessment",
		"tab-records": "nav-records",
		"tab-settings": "nav-settings",
	};

	const navId = tabMapping[tabId];
	if (navId) {
		const navEl = document.getElementById(navId);
		if (navEl) navEl.classList.add("active");
	}

	syncSidebarActiveState(tabId);

	// Trigger renders
	if (tabId === "tab-dashboard") {
		await renderDashboard();
		toggleDashboardView(options.dashboardView || getActiveDashboardViewId());
	}
	if (tabId === "tab-records") {
		const recordsView = options.recordsView || getActiveRecordsViewId();
		const btn =
			options.recordsButton ||
			document.querySelector(`#recordsPills [data-target="${recordsView}"]`);
		await toggleRecordsView(recordsView, btn);
	}
	if (tabId === "tab-assessment") await renderPendingList();
	if (tabId === "tab-employees") {
		await renderEmployeeManager();
		if (isModuleEnabled("manpower")) await renderManpowerPlanning();
		toggleEmployeesView(options.employeesView || getActiveEmployeesViewId());
	}
	if (tabId === "tab-settings") {
		const settingsView = options.settingsView || getActiveSettingsViewId();
		await renderSettings();
		await toggleSettingsView(settingsView);
	}
}

function renderSidebarNavigation() {
	const container = document.getElementById("sidebar-nav-groups");
	if (!container) return;

	const role = state.currentUser?.role || "employee";
	const groups = getAllowedNavigationGroups(role);

	container.innerHTML = groups
		.map(
			(group, index) => `
        <section class="sidebar-group">
            <button
                class="sidebar-group-toggle"
                id="${group.id}"
                type="button"
                aria-expanded="${index === 0 ? "true" : "false"}"
                onclick="window.__app.toggleSidebarGroup('${group.id}')">
                <span class="sidebar-group-meta">
                    <span class="sidebar-group-icon"><i class="bi ${group.icon}"></i></span>
                    <span>${escapeHTML(group.label)}</span>
                </span>
                <i class="bi bi-chevron-down sidebar-group-chevron"></i>
            </button>
            <div class="sidebar-group-items ${index === 0 ? "" : "hidden"}" data-group-panel="${group.id}">
                ${group.children
							.map(
								(child) => `
                    <button
                        class="sidebar-link nav-tab"
                        id="${child.id}"
                        type="button"
                        data-tab="${child.tabId}"
                        data-parent-nav="${child.navId}"
                        onclick="window.__app.handleSidebarItemClick('${child.id}')">
                        <span class="sidebar-link-label">
                            <span class="sidebar-link-title">${escapeHTML(child.label)}</span>
                            <span class="sidebar-link-copy">${escapeHTML(child.description || "")}</span>
                        </span>
                        ${child.badge ? `<span class="sidebar-link-badge">${escapeHTML(child.badge)}</span>` : ""}
                    </button>
                `,
							)
							.join("")}
            </div>
        </section>
    `,
		)
		.join("");
}

async function handleSidebarItemClick(itemId) {
	const target = getNavigationItem(itemId);
	if (!target) return;
	await switchTab(target.tabId, { ...(target.tabOptions || {}) });
	setContentHeader(target);
	syncSidebarActiveState(target.tabId, itemId);
	closeSidebarMobile();
}

function setContentHeader(item) {
	const titleEl = document.getElementById("content-title");
	const copyEl = document.getElementById("content-description");
	if (titleEl && item?.contentTitle) titleEl.innerText = item.contentTitle;
	if (copyEl && item?.contentDescription)
		copyEl.innerText = item.contentDescription;
}

function syncSidebarActiveState(activeTabId, activeItemId = null) {
	const items = Array.from(document.querySelectorAll(".sidebar-link"));
	items.forEach((item) => item.classList.remove("active"));

	const target = activeItemId
		? document.getElementById(activeItemId)
		: items.find((item) => item.dataset.tab === activeTabId);

	if (target) {
		target.classList.add("active");
		const panel = target.closest(".sidebar-group-items");
		const buttonId = panel?.dataset.groupPanel;
		if (buttonId) expandSidebarGroup(buttonId);
	}
}

function toggleSidebarGroup(groupId) {
	const toggle = document.getElementById(groupId);
	const panel = document.querySelector(`[data-group-panel="${groupId}"]`);
	if (!toggle || !panel) return;

	const isExpanded = toggle.getAttribute("aria-expanded") === "true";
	toggle.setAttribute("aria-expanded", String(!isExpanded));
	panel.classList.toggle("hidden", isExpanded);
}

function expandSidebarGroup(groupId) {
	const toggle = document.getElementById(groupId);
	const panel = document.querySelector(`[data-group-panel="${groupId}"]`);
	if (!toggle || !panel) return;

	toggle.setAttribute("aria-expanded", "true");
	panel.classList.remove("hidden");
}

function toggleSidebarMobile() {
	document
		.querySelector(".app-shell")
		?.classList.toggle("sidebar-mobile-open");
}

function closeSidebarMobile() {
	document
		.querySelector(".app-shell")
		?.classList.remove("sidebar-mobile-open");
}

function clearSessionTimer() {
	if (_idleTimer) {
		clearTimeout(_idleTimer);
		_idleTimer = null;
	}
}

function bindSessionActivity() {
	if (_sessionEventsBound) return;
	["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(
		(evt) => {
			window.addEventListener(evt, resetSessionTimer, { passive: true });
		},
	);
	_sessionEventsBound = true;
}

function resetSessionTimer() {
	if (!state.currentUser) return;
	clearSessionTimer();
	_idleTimer = setTimeout(async () => {
		await notify.warn(
			"Session timed out due to inactivity. Please login again.",
			"Session Timeout",
		);
		doLogout();
	}, SESSION_IDLE_MS);
}

async function refreshActiveReports() {
	const activeTab = document.querySelector(".content-section.active")?.id;
	if (activeTab === "tab-dashboard") await renderDashboard();
	if (activeTab === "tab-records") {
		const assessmentView = document.getElementById("records-assessment");
		const kpiView = document.getElementById("records-kpi");
		const probationView = document.getElementById("records-probation");

		const isAssessmentVisible =
			assessmentView && !assessmentView.classList.contains("hidden");
		const isKpiVisible = kpiView && !kpiView.classList.contains("hidden");
		const isProbationVisible =
			probationView && !probationView.classList.contains("hidden");

		if (isAssessmentVisible) {
			await renderRecordsTable();
			return;
		}
		if (isKpiVisible) {
			await renderKpiHistory();
			return;
		}
		if (isProbationVisible) {
			await renderProbationPipView();
			return;
		}

		// Fallback when view state is not initialized yet.
		await renderRecordsTable();
	}
}

function renderReportFilterOptions() {
	const card = document.getElementById("report-filters-card");
	const deptSel = document.getElementById("report-filter-department");
	const mgrSel = document.getElementById("report-filter-manager");
	const periodInput = document.getElementById("report-filter-period");
	if (!card || !deptSel || !mgrSel || !periodInput) return;

	const { currentUser, db, reportFilters } = state;
	const activeTab = document.querySelector(".content-section.active")?.id;
	if (!currentUser || currentUser.role === "employee" || activeTab !== "tab-dashboard") {
		card.classList.add("hidden");
		return;
	}
	card.classList.remove("hidden");

	const scopedIds = getRoleScopedEmployeeIds();
	const currentDept = reportFilters.department || "";
	const currentMgr = reportFilters.manager_id || "";

	const departments = [
		...new Set(scopedIds.map((id) => db[id]?.department).filter(Boolean)),
	].sort((a, b) => a.localeCompare(b));
	deptSel.innerHTML = '<option value="">All Departments</option>';
	departments.forEach((dept) => {
		deptSel.innerHTML += `<option value="${escapeHTML(dept)}">${escapeHTML(dept)}</option>`;
	});

	const managerIds = new Set();
	scopedIds.forEach((id) => {
		const rec = db[id];
		if (rec?.manager_id) managerIds.add(rec.manager_id);
	});
	Object.keys(db).forEach((id) => {
		if (
			db[id]?.role === "manager" ||
			db[id]?.role === "superadmin" ||
			db[id]?.role === "director"
		)
			managerIds.add(id);
	});
	const managers = [...managerIds]
		.map((id) => ({ id, name: db[id]?.name || id }))
		.sort((a, b) => a.name.localeCompare(b.name));

	mgrSel.innerHTML = '<option value="">All Managers</option>';
	managers.forEach((mgr) => {
		mgrSel.innerHTML += `<option value="${escapeHTML(mgr.id)}">${escapeHTML(mgr.name)}</option>`;
	});

	if (currentUser.role === "manager") {
		const ownDept = db[currentUser.id]?.department || "";
		deptSel.value = ownDept;
		deptSel.disabled = true;
		if (currentMgr && managers.some((m) => m.id === currentMgr)) {
			mgrSel.value = currentMgr;
		}
	} else {
		deptSel.disabled = false;
		if (currentDept) deptSel.value = currentDept;
		if (currentMgr) mgrSel.value = currentMgr;
	}

	periodInput.value = reportFilters.period || "";
}

function updateReportFilters() {
	const deptSel = document.getElementById("report-filter-department");
	const mgrSel = document.getElementById("report-filter-manager");
	const periodInput = document.getElementById("report-filter-period");
	if (!deptSel || !mgrSel || !periodInput) return;

	const deptVal = deptSel.value || "";
	const mgrVal = mgrSel.value || "";
	const periodVal = periodInput.value || "";
	setReportFilters({
		department: deptVal,
		manager_id: mgrVal,
		period: periodVal,
	});
	void refreshActiveReports();
}

function clearReportFilters() {
	const deptSel = document.getElementById("report-filter-department");
	const mgrSel = document.getElementById("report-filter-manager");
	const periodInput = document.getElementById("report-filter-period");
	const isMgr = state.currentUser?.role === "manager";
	const ownDept = state.db[state.currentUser?.id]?.department || "";

	if (deptSel) deptSel.value = isMgr ? ownDept : "";
	if (mgrSel) mgrSel.value = "";
	if (periodInput) periodInput.value = "";

	setReportFilters({
		department: isMgr ? ownDept : "",
		manager_id: "",
		period: "",
	});
	void refreshActiveReports();
}

// ---- Sub-View Toggle (Settings) ----
async function toggleSettingsView(viewId, btn) {
	if (
		state.currentUser?.role === "manager" &&
		!["set-competencies", "set-kpi"].includes(viewId)
	)
		return;
	const viewIds = [
		"set-general",
		"set-users",
		"set-competencies",
		"set-kpi",
		"set-org",
	];
	const nextViewId = resolveAccessibleView(
		viewIds,
		viewId,
		getActiveSettingsViewId(),
	);
	viewIds.forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.classList.add("hidden");
	});
	const target = document.getElementById(nextViewId);
	if (target) target.classList.remove("hidden");
	if (btn) btn.classList.add("active");
	// Trigger KPI render when switching to KPI panel
	if (nextViewId === "set-kpi") await renderKpiManager();
	if (nextViewId === "set-competencies") await renderAdminList();
}

// ---- Sub-View Toggle (Dashboard) ----
function toggleDashboardView(viewId, btn) {
	const viewIds = ["dashboard-assessment", "dashboard-kpi"];
	const nextViewId = resolveAccessibleView(viewIds, viewId, "dashboard-kpi");
	viewIds.forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.classList.add("hidden");
	});
	document
		.querySelectorAll("#dashboardPills .nav-link")
		.forEach((el) => el.classList.remove("active"));
	const target = document.getElementById(nextViewId);
	if (target) target.classList.remove("hidden");
	if (btn && btn.dataset.target === nextViewId) btn.classList.add("active");
}

function toggleEmployeesView(viewId) {
	const viewIds = [
		"employees-planning",
		"employees-recruitment",
		"employees-directory",
		"employees-add",
	];
	const nextViewId = resolveAccessibleView(
		viewIds,
		viewId,
		getActiveEmployeesViewId(),
	);
	viewIds.forEach(
		(id) => {
			const el = document.getElementById(id);
			if (el) el.classList.add("hidden");
		},
	);
	const target = document.getElementById(nextViewId);
	if (target) target.classList.remove("hidden");
}

// ---- Sub-View Toggle (Records) ----
async function toggleRecordsView(viewId, btn) {
	const viewIds = ["records-assessment", "records-kpi", "records-probation"];
	const nextViewId = resolveAccessibleView(
		viewIds,
		viewId,
		getActiveRecordsViewId(),
	);
	viewIds.forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.classList.add("hidden");
	});
	document
		.querySelectorAll("#recordsPills .nav-link")
		.forEach((el) => el.classList.remove("active"));
	const target = document.getElementById(nextViewId);
	if (target) target.classList.remove("hidden");
	if (btn && btn.dataset.target === nextViewId) btn.classList.add("active");
	if (nextViewId === "records-assessment") await renderRecordsTable();
	if (nextViewId === "records-kpi") await renderKpiHistory();
	if (nextViewId === "records-probation") await renderProbationPipView();
}

// ---- Theme Toggle ----
function toggleTheme() {
	const current = document.documentElement.getAttribute("data-bs-theme");
	const next = current === "dark" ? "light" : "dark";
	document.documentElement.setAttribute("data-bs-theme", next);
	localStorage.setItem("appTheme", next);
	const btn = document.getElementById("theme-toggle");
	if (btn)
		btn.innerHTML =
			next === "dark"
				? '<i class="bi bi-sun"></i>'
				: '<i class="bi bi-moon-stars"></i>';
}

// ---- Login ----
async function attemptLogin() {
	const email = document.getElementById("login-user").value.trim();
	const pass = document.getElementById("login-pass").value.trim();
	const btn = document.getElementById("login-btn");
	const errorEl = document.getElementById("login-error");

	if (!email || !pass) {
		if (errorEl) {
			errorEl.innerText = "Please enter email and password.";
			errorEl.classList.remove("hidden");
		}
		return;
	}

	btn.disabled = true;
	btn.innerText = "Signing in...";
	if (errorEl) errorEl.classList.add("hidden");

	try {
		await signIn(email, pass);
		await syncAll({ enabledModules: new Set(ACTIVE_MODULE_CONFIG.modules) });
		await showApp();
	} catch (err) {
		if (errorEl) {
			errorEl.innerText = err.message || "Invalid credentials.";
			errorEl.classList.remove("hidden");
		}
		btn.disabled = false;
		btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign In';
	}
}

async function forgotPassword() {
	const rawEmail = document.getElementById("login-user")?.value?.trim() || "";
	const email = await notify.input({
		title: "Reset Password",
		input: "email",
		inputLabel: "Enter your account email",
		inputValue: rawEmail,
		confirmButtonText: "Send Reset Link",
		validate: (value) => {
			const v = String(value || "").trim();
			if (!v) return "Email is required.";
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
				return "Enter a valid email address.";
			return null;
		},
	});
	if (email === null) return;

	try {
		await notify.withLoading(
			async () => {
				await requestPasswordReset(String(email).trim());
			},
			"Sending Reset Link",
			"Please wait...",
		);
		await notify.success("Password reset link sent. Check your email.");
	} catch (err) {
		await notify.error("Failed to send reset email: " + (err.message || err));
	}
}

async function changeMyPassword() {
	if (!state.currentUser) return;
	const ok = await promptChangePassword({
		enforced: false,
		clearMustChange: true,
	});
	if (!ok) return;
}

// ---- Show App ----
async function showApp() {
	document.getElementById("login-view").classList.add("hidden");
	document.getElementById("main-app").classList.remove("hidden");
	document.body.dataset.appModules = ACTIVE_MODULE_CONFIG.modules.join(",");
	document.body.dataset.appModuleSource = ACTIVE_MODULE_CONFIG.source || "env";

	const { currentUser } = state;
	if (!currentUser) {
		signOut();
		return;
	}

	applyBranding();

	const role = currentUser.role;

	renderSidebarNavigation();
	applyModuleSurfaceVisibility();

	// Hide all nav items first
	document
		.querySelectorAll(".nav-item[data-role]")
		.forEach((el) => el.classList.add("hidden"));

	// Role-based navigation
	const navConfig = {
		superadmin: [
			"nav-dashboard",
			"nav-employees",
			"nav-assessment",
			"nav-records",
			"nav-settings",
		],
		manager: [
			"nav-dashboard",
			"nav-assessment",
			"nav-records",
			"nav-settings",
		],
		hr: ["nav-dashboard", "nav-records", "nav-settings"],
		director: ["nav-dashboard", "nav-assessment", "nav-records"],
		employee: ["nav-records"],
	};

	const allowedNavs = navConfig[role] || navConfig.employee;

	allowedNavs.forEach((navId) => {
		const navItem = document.getElementById(navId);
		if (navItem && navItem.closest(".nav-item")) {
			navItem.closest(".nav-item").classList.remove("hidden");
		}
	});

	// Update user display
	const nameEl = document.getElementById("user-display-name");
	if (nameEl) nameEl.innerText = currentUser.name;

	const roleEl = document.getElementById("user-role-badge");
	if (roleEl) {
		const roleLabels = {
			superadmin: "Super Admin",
			manager: "Manager",
			hr: "HR",
			director: "Director",
			employee: "Employee",
		};
		roleEl.innerText = roleLabels[role] || role;
		roleEl.className =
			"badge ms-2 " +
			(role === "superadmin"
				? "bg-danger"
				: role === "hr"
					? "bg-success"
					: role === "manager"
						? "bg-warning text-dark"
						: role === "director"
							? "bg-info text-dark"
							: "bg-secondary");
	}

	const defaultNavItem = getAllowedNavigationGroups(role)
		.flatMap((group) => group.children)
		.find(Boolean);
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
	if (
		role === "superadmin" ||
		role === "manager" ||
		role === "hr" ||
		role === "director"
	) {
		await switchTab("tab-dashboard");
	} else {
		await switchTab("tab-records");
	}
}

// ---- Subscribe to events ----
subscribe("nav:switchTab", switchTab);
subscribe("data:settings", applyBranding);
subscribe("data:employees", () => {
	renderReportFilterOptions();
});

// ---- Initialize ----
document.addEventListener("DOMContentLoaded", async function () {
	const envValidation = getSupabaseEnvValidation();
	if (!envValidation.ok) {
		renderBootErrorScreen(
			"Supabase environment variables are not configured correctly.",
			envValidation.issues,
		);
		throw new Error(envValidation.issues.join(" "));
	}

	initMonitoring();

	// Restore Theme
	const savedTheme = localStorage.getItem("appTheme") || "light";
	document.documentElement.setAttribute("data-bs-theme", savedTheme);
	const themeBtn = document.getElementById("theme-toggle");
	if (themeBtn)
		themeBtn.innerHTML =
			savedTheme === "dark"
				? '<i class="bi bi-sun"></i>'
				: '<i class="bi bi-moon-stars"></i>';

	// Load branding before login screen is used.
	await fetchSettings();
	applyBranding();

	// Try restore session
	try {
		const user = await restoreSession();
		if (user) {
			await syncAll({ enabledModules: new Set(ACTIVE_MODULE_CONFIG.modules) });
			await showApp();
		}
	} catch (err) {
		debugError("Session restore failed:", err);
	}
});
