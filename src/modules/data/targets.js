import { state, asArray, toNumber, isPeriodKey, sanitizeTargetMap } from './runtime.js';

function normalizeKpiTargetStore(rawTargets = {}) {
    const src = rawTargets && typeof rawTargets === 'object' && !Array.isArray(rawTargets)
        ? rawTargets
        : {};

    const hasNested = src.default || src.monthly;
    if (!hasNested) {
        return {
            defaultTargets: sanitizeTargetMap(src),
            monthlyTargets: {},
        };
    }

    const defaultTargets = sanitizeTargetMap(src.default || {});
    const monthlyTargets = {};
    Object.entries(src.monthly || {}).forEach(([period, targetObj]) => {
        if (!isPeriodKey(period)) return;
        const clean = sanitizeTargetMap(targetObj || {});
        if (Object.keys(clean).length > 0) {
            monthlyTargets[period] = clean;
        }
    });

    return { defaultTargets, monthlyTargets };
}

function buildKpiTargetStore(defaultTargets = {}, monthlyTargets = {}) {
    const cleanDefault = sanitizeTargetMap(defaultTargets);
    const cleanMonthly = {};
    Object.entries(monthlyTargets || {}).forEach(([period, targetObj]) => {
        if (!isPeriodKey(period)) return;
        const clean = sanitizeTargetMap(targetObj || {});
        if (Object.keys(clean).length > 0) {
            cleanMonthly[period] = clean;
        }
    });

    const hasMonthly = Object.keys(cleanMonthly).length > 0;
    if (!hasMonthly) return cleanDefault;

    return {
        default: cleanDefault,
        monthly: cleanMonthly,
    };
}

function isApprovedVersion(row) {
    const status = String(row?.status || 'approved').toLowerCase();
    return status === 'approved';
}

function compareVersionRows(a, b) {
    const periodA = isPeriodKey(a?.effective_period) ? String(a.effective_period) : '0000-00';
    const periodB = isPeriodKey(b?.effective_period) ? String(b.effective_period) : '0000-00';
    if (periodA !== periodB) return periodB.localeCompare(periodA);

    const verA = Number(a?.version_no || 0);
    const verB = Number(b?.version_no || 0);
    if (verA !== verB) return verB - verA;

    return String(b?.requested_at || b?.created_at || '').localeCompare(String(a?.requested_at || a?.created_at || ''));
}

function getKpiDefinitionForPeriod(kpiId, period = '', options = {}) {
    const key = String(kpiId || '').trim();
    if (!key) return null;

    const includePending = Boolean(options.includePending);
    const versions = asArray(state.kpiDefinitionVersions)
        .filter(row => String(row?.kpi_definition_id || '') === key)
        .filter(row => includePending || isApprovedVersion(row))
        .filter(row => {
            const effective = String(row?.effective_period || '').trim();
            if (!isPeriodKey(period)) return true;
            if (!isPeriodKey(effective)) return true;
            return effective <= period;
        })
        .sort(compareVersionRows);

    const picked = versions[0] || null;
    if (picked) {
        return {
            id: key,
            name: String(picked.name || '').trim(),
            description: String(picked.description || '').trim(),
            category: String(picked.category || 'General').trim() || 'General',
            target: toNumber(picked.target, 0),
            unit: String(picked.unit || '').trim(),
            effective_period: String(picked.effective_period || '').trim(),
            version_id: picked.id || null,
            version_no: Number(picked.version_no || 0),
            version_status: String(picked.status || 'approved'),
        };
    }

    const base = state.kpiConfig.find(k => String(k?.id || '') === key);
    if (!base) return null;

    const baseStatus = String(base?.approval_status || 'approved').toLowerCase();
    if (!includePending && baseStatus !== 'approved') return null;

    return {
        ...base,
        target: toNumber(base?.target, 0),
        unit: String(base?.unit || '').trim(),
        effective_period: String(base?.effective_period || '').trim(),
        version_id: null,
        version_no: Number(base?.latest_version_no || 0),
        version_status: baseStatus,
    };
}

function getEmployeeKpiTargetResolution(employee, kpiId, period = '', options = {}) {
    const key = String(kpiId || '').trim();
    if (!employee || !key) {
        return {
            target: 0,
            source: 'none',
            target_version_id: null,
            definition_version_id: null,
        };
    }

    const includePending = Boolean(options.includePending);
    const employeeId = String(employee.id || employee.employee_id || '').trim();

    const targetVersion = asArray(state.employeeKpiTargetVersions)
        .filter(row => String(row?.employee_id || '') === employeeId)
        .filter(row => String(row?.kpi_id || '') === key)
        .filter(row => includePending || isApprovedVersion(row))
        .filter(row => {
            const effective = String(row?.effective_period || '').trim();
            if (!isPeriodKey(period)) return true;
            if (!isPeriodKey(effective)) return true;
            return effective <= period;
        })
        .sort(compareVersionRows)[0] || null;

    const explicitClear = Boolean(targetVersion && (targetVersion.target_value === null || targetVersion.target_value === undefined));
    if (targetVersion) {
        const raw = targetVersion.target_value;
        const targetNum = toNumber(raw, NaN);
        if (!explicitClear && Number.isFinite(targetNum)) {
            return {
                target: targetNum,
                source: 'target_version',
                target_version_id: targetVersion.id || null,
                definition_version_id: null,
            };
        }
    }

    const { defaultTargets, monthlyTargets } = normalizeKpiTargetStore(employee.kpi_targets || {});

    if (!explicitClear && isPeriodKey(period) && monthlyTargets[period] && monthlyTargets[period][key] !== undefined) {
        return {
            target: toNumber(monthlyTargets[period][key], 0),
            source: 'employee_monthly_legacy',
            target_version_id: targetVersion?.id || null,
            definition_version_id: null,
        };
    }
    if (!explicitClear && defaultTargets[key] !== undefined) {
        return {
            target: toNumber(defaultTargets[key], 0),
            source: 'employee_default_legacy',
            target_version_id: targetVersion?.id || null,
            definition_version_id: null,
        };
    }

    const kpiDef = getKpiDefinitionForPeriod(key, period, options);
    return {
        target: toNumber(kpiDef?.target, 0),
        source: 'definition',
        target_version_id: targetVersion?.id || null,
        definition_version_id: kpiDef?.version_id || null,
    };
}

function getEmployeeKpiTarget(employee, kpiId, period = '', options = {}) {
    return getEmployeeKpiTargetResolution(employee, kpiId, period, options).target;
}

function getKpiRecordTarget(record, employee = null) {
    const snap = toNumber(record?.target_snapshot, NaN);
    if (Number.isFinite(snap)) return snap;

    const emp = employee || state.db[record?.employee_id];
    return getEmployeeKpiTarget(emp, record?.kpi_id, record?.period || '');
}

export {
    normalizeKpiTargetStore,
    buildKpiTargetStore,
    getKpiDefinitionForPeriod,
    getEmployeeKpiTargetResolution,
    getEmployeeKpiTarget,
    getKpiRecordTarget,
};

