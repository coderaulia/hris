const REQUIRED_MODULES = Object.freeze([
    'core',
    'dashboard',
    'employees',
    'kpi',
]);

const MODULE_REGISTRY = Object.freeze({
    core: {
        id: 'core',
        label: 'Core',
        dependencies: [],
        description: 'Auth, branding, settings, shared shell, and base app wiring.',
    },
    dashboard: {
        id: 'dashboard',
        label: 'Dashboard',
        dependencies: ['core', 'employees', 'kpi'],
        description: 'Workspace landing experience and summary analytics.',
    },
    employees: {
        id: 'employees',
        label: 'Employees',
        dependencies: ['core'],
        description: 'Employee directory, master data, org map, and employee forms.',
    },
    kpi: {
        id: 'kpi',
        label: 'KPI',
        dependencies: ['core', 'employees'],
        description: 'KPI definitions, targets, approvals, records, and scoring.',
    },
    assessment: {
        id: 'assessment',
        label: 'Assessment',
        dependencies: ['core', 'employees'],
        description: 'Manager and self-assessment workflow.',
    },
    tna: {
        id: 'tna',
        label: 'TNA',
        dependencies: ['core', 'employees', 'assessment'],
        description: 'Training-needs analysis, training logs, and assessment summary support.',
    },
    manpower: {
        id: 'manpower',
        label: 'Manpower',
        dependencies: ['core', 'employees'],
        description: 'Manpower planning and headcount request workflows.',
    },
    recruitment: {
        id: 'recruitment',
        label: 'Recruitment',
        dependencies: ['core', 'employees', 'manpower'],
        description: 'Recruitment board and pipeline progress tracking.',
    },
    probation: {
        id: 'probation',
        label: 'Probation',
        dependencies: ['core', 'employees', 'kpi'],
        description: 'Probation review, attendance deductions, and review scoring.',
    },
    pip: {
        id: 'pip',
        label: 'PIP',
        dependencies: ['core', 'employees', 'kpi', 'probation'],
        description: 'Performance improvement plans and action tracking.',
    },
});

function normalizeModuleId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '');
}

function unique(items = []) {
    return [...new Set(items.filter(Boolean))];
}

function collectDependencies(moduleIds, collected = new Set()) {
    moduleIds.forEach((moduleId) => {
        const normalized = normalizeModuleId(moduleId);
        if (!normalized || collected.has(normalized) || !MODULE_REGISTRY[normalized]) return;
        collected.add(normalized);
        collectDependencies(MODULE_REGISTRY[normalized].dependencies || [], collected);
    });
    return collected;
}

function parseModuleList(rawValue) {
    return unique(
        String(rawValue || '')
            .split(',')
            .map(normalizeModuleId)
            .filter((moduleId) => MODULE_REGISTRY[moduleId]),
    );
}

function resolveEnabledModules({
    enabled = import.meta.env.VITE_ENABLED_MODULES || '',
} = {}) {
    const requested = parseModuleList(enabled);
    const allModules = unique([...REQUIRED_MODULES, ...requested]);
    const expanded = unique([...collectDependencies(allModules)]);

    return {
        source: 'env',
        configuredModules: requested,
        modules: expanded,
    };
}

const ACTIVE_MODULE_CONFIG = resolveEnabledModules();
const ENABLED_MODULE_SET = new Set(ACTIVE_MODULE_CONFIG.modules);

function getEnabledModuleList() {
    return [...ENABLED_MODULE_SET];
}

function getEnabledModuleSet() {
    return new Set(ENABLED_MODULE_SET);
}

function isModuleEnabled(moduleId) {
    return ENABLED_MODULE_SET.has(normalizeModuleId(moduleId));
}

function areAllModulesEnabled(moduleIds = []) {
    return unique(moduleIds.map(normalizeModuleId)).every((moduleId) => ENABLED_MODULE_SET.has(moduleId));
}

function isAnyModuleEnabled(moduleIds = []) {
    return unique(moduleIds.map(normalizeModuleId)).some((moduleId) => ENABLED_MODULE_SET.has(moduleId));
}

export {
    REQUIRED_MODULES,
    MODULE_REGISTRY,
    ACTIVE_MODULE_CONFIG,
    ENABLED_MODULE_SET,
    getEnabledModuleList,
    getEnabledModuleSet,
    isModuleEnabled,
    areAllModulesEnabled,
    isAnyModuleEnabled,
    resolveEnabledModules,
};
