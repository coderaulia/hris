import { areAllModulesEnabled, isAnyModuleEnabled } from "./app-modules.js";

const NAVIGATION_GROUPS = Object.freeze([
	{
		id: "nav-group-dashboard",
		label: "Dashboard",
		icon: "bi-speedometer2",
		roles: ["superadmin", "manager", "hr", "director"],
		endpoints: [],
		children: [
			{
				id: "nav-dashboard-overview",
				modules: ["dashboard", "kpi"],
				label: "KPI Dashboard",
				description: "KPI overview and performance analytics",
				badge: "Live",
				endpoints: [
					"kpi_records",
					"employee_performance_scores",
					"employee_kpi_target_versions",
				],
				tabId: "tab-dashboard",
				navId: "nav-dashboard",
				tabOptions: { dashboardView: "dashboard-kpi" },
				contentTitle: "Dashboard",
				contentDescription:
					"Track company performance, workforce activity, and HR operations in one place.",
			},
			{
				id: "nav-dashboard-assessment",
				modules: ["dashboard"],
				moduleAnyOf: ["assessment", "tna"],
				label: "Assessment Summary",
				description: "Assessment and TNA summary only",
				endpoints: [
					"employee_assessments",
					"employee_assessment_scores",
					"employee_assessment_history",
					"employee_training_records",
					"competency_config",
				],
				tabId: "tab-dashboard",
				navId: "nav-dashboard",
				tabOptions: { dashboardView: "dashboard-assessment" },
				contentTitle: "Assessment & TNA Summary",
				contentDescription:
					"Review competency coverage, training needs, score distribution, and assessment performance by department.",
			},
		],
	},
	{
		id: "nav-group-employees",
		label: "Employees",
		icon: "bi-people-fill",
		roles: ["superadmin", "hr", "manager"],
		endpoints: ["employees", "employee_training_records"],
		children: [
			{
				id: "nav-employees",
				modules: ["manpower"],
				label: "Manpower Planning",
				description: "Headcount planning and approval workflow",
				badge: "HR",
				roles: ["superadmin", "hr", "manager"],
				tabId: "tab-employees",
				navId: "nav-employees",
				tabOptions: { employeesView: "employees-planning" },
				contentTitle: "Manpower Planning",
				contentDescription:
					"Plan staffing needs, submit headcount requests, and review workforce gaps by department.",
			},
			{
				id: "nav-employees-recruitment",
				modules: ["recruitment"],
				label: "Recruitment Board",
				description: "Candidate pipeline and hiring execution",
				badge: "Phase 3",
				roles: ["superadmin", "hr", "manager"],
				tabId: "tab-employees",
				navId: "nav-employees",
				tabOptions: { employeesView: "employees-recruitment" },
				contentTitle: "Recruitment Board",
				contentDescription:
					"Manage approved demand as active recruitment cards and track candidate progress by hiring stage.",
			},
			{
				id: "nav-employees-directory",
				modules: ["employees"],
				label: "Staff Directory",
				description: "Browse and export employee records",
				roles: ["superadmin"],
				tabId: "tab-employees",
				navId: "nav-employees",
				tabOptions: { employeesView: "employees-directory" },
				contentTitle: "Staff Directory",
				contentDescription:
					"Review the active employee roster, export lists, and manage imported records.",
			},
			{
				id: "nav-employees-add",
				modules: ["employees"],
				label: "Add New Employee",
				description: "New employee insertion form",
				roles: ["superadmin"],
				tabId: "tab-employees",
				navId: "nav-employees",
				tabOptions: { employeesView: "employees-add" },
				contentTitle: "Add New Employee",
				contentDescription:
					"Create or update employee records with role, department, manager, and access data.",
			},
		],
	},
	{
		id: "nav-group-assessment",
		label: "Assessment & KPI",
		icon: "bi-clipboard-check",
		roles: ["superadmin", "manager", "director"],
		endpoints: [
			"employee_assessments",
			"employee_assessment_scores",
			"employee_assessment_history",
			"competency_config",
			"kpi_definitions",
			"kpi_definition_versions",
			"employee_kpi_target_versions",
			"kpi_weight_profiles",
			"kpi_weight_items",
			"kpi_records",
			"employee_performance_scores",
		],
		children: [
			{
				id: "nav-assessment-pending",
				modules: ["assessment"],
				label: "Assessment Queue",
				description: "Pending reviews and submissions",
				badge: "Core",
				tabId: "tab-assessment",
				navId: "nav-assessment",
				tabOptions: {},
				contentTitle: "Assessment Workflow",
				contentDescription:
					"Run employee assessments, review submissions, and capture KPI updates from one workspace.",
			},
			{
				id: "nav-assessment-kpi",
				modules: ["kpi"],
				label: "KPI Input",
				description: "Targets, definitions, and governance",
				tabId: "tab-settings",
				navId: "nav-settings",
				tabOptions: { settingsView: "set-kpi" },
				contentTitle: "KPI Management",
				contentDescription:
					"Maintain KPI definitions, employee targets, weighting, and approval workflows.",
			},
		],
	},
	{
		id: "nav-group-records",
		label: "Records",
		icon: "bi-journal-richtext",
		roles: ["superadmin", "manager", "hr", "director", "employee"],
		endpoints: [
			"probation_reviews",
			"probation_qualitative_items",
			"probation_monthly_scores",
			"probation_attendance_records",
			"pip_plans",
			"pip_actions",
		],
		children: [
			{
				id: "nav-records-assessment",
				moduleAnyOf: ["assessment", "tna"],
				label: "Assessment Records",
				description: "Historical performance snapshots",
				badge: "View",
				tabId: "tab-records",
				navId: "nav-records",
				tabOptions: { recordsView: "records-assessment" },
				contentTitle: "Assessment Records",
				contentDescription:
					"Search employee assessment outcomes, reports, training notes, and review history.",
			},
			{
				id: "nav-records-kpi",
				modules: ["kpi"],
				label: "KPI Records",
				description: "Monthly progress and achievement",
				tabId: "tab-records",
				navId: "nav-records",
				tabOptions: { recordsView: "records-kpi" },
				contentTitle: "KPI Records",
				contentDescription:
					"Inspect KPI history, target attainment, and employee performance trends over time.",
			},
			{
				id: "nav-records-probation",
				moduleAnyOf: ["probation", "pip"],
				label: "Probation & PIP",
				description: "Reviews, attendance, and plans",
				tabId: "tab-records",
				navId: "nav-records",
				tabOptions: { recordsView: "records-probation" },
				contentTitle: "Probation & PIP",
				contentDescription:
					"Manage probation reviews, attendance entries, and performance improvement plans.",
			},
		],
	},
	{
		id: "nav-group-settings",
		label: "Settings",
		icon: "bi-sliders",
		roles: ["superadmin", "manager", "hr"],
		endpoints: ["app_settings", "admin_activity_log"],
		children: [
			{
				id: "nav-settings-branding",
				modules: ["core"],
				label: "Branding & Layout",
				description: "App text, theme, and appearance",
				badge: "Admin",
				roles: ["superadmin", "hr"],
				tabId: "tab-settings",
				navId: "nav-settings",
				tabOptions: { settingsView: "set-general" },
				contentTitle: "Application Settings",
				contentDescription:
					"Configure branding, organization structure, user permissions, and system setup.",
			},
			{
				id: "nav-settings-users",
				modules: ["core"],
				label: "Users & Roles",
				description: "Access control and activity logs",
				roles: ["superadmin", "hr"],
				tabId: "tab-settings",
				navId: "nav-settings",
				tabOptions: { settingsView: "set-users" },
				contentTitle: "Users & Roles",
				contentDescription:
					"Manage login access, role assignments, and recent admin activity.",
			},
			{
				id: "nav-settings-competencies",
				moduleAnyOf: ["assessment", "tna"],
				label: "Competencies",
				description: "Position skill matrices",
				roles: ["superadmin", "manager", "hr"],
				tabId: "tab-settings",
				navId: "nav-settings",
				tabOptions: { settingsView: "set-competencies" },
				contentTitle: "Competency Setup",
				contentDescription:
					"Maintain competencies, organizational role maps, and benchmark requirements.",
			},
			{
				id: "nav-settings-org",
				modules: ["employees"],
				label: "Organization Map",
				description: "Departments and positions",
				roles: ["superadmin", "hr"],
				tabId: "tab-settings",
				navId: "nav-settings",
				tabOptions: { settingsView: "set-org" },
				contentTitle: "Organization Map",
				contentDescription:
					"Organize departments, positions, and reporting relationships across the company.",
			},
		],
	},
]);

function isNavigationItemEnabled(item) {
	const requiredModules = item?.modules || [];
	const anyModules = item?.moduleAnyOf || [];
	const requiredOk =
		requiredModules.length === 0 || areAllModulesEnabled(requiredModules);
	const anyOk = anyModules.length === 0 || isAnyModuleEnabled(anyModules);
	return requiredOk && anyOk;
}

function getAllowedNavigationGroups(role) {
	return NAVIGATION_GROUPS.filter((group) => (group.roles || []).includes(role))
		.map((group) => ({
			...group,
			children: (group.children || []).filter(
				(child) =>
					(!child.roles || child.roles.includes(role)) &&
					isNavigationItemEnabled(child),
			),
		}))
		.filter((group) => group.children.length > 0);
}

function getNavigationItem(itemId) {
	return NAVIGATION_GROUPS.flatMap((group) => group.children || []).find(
		(item) => item.id === itemId,
	);
}

export { NAVIGATION_GROUPS, getAllowedNavigationGroups, getNavigationItem };
