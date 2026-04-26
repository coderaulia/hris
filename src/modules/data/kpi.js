import {
    state,
    emit,
    debugError,
    asArray,
    toNumber,
    roundScore,
    isPeriodKey,
    isMissingRelationError,
    execSupabase,
    fetchOptionalCollection,
} from './runtime.js';
import { backend } from '../../lib/backend.js';
import {
    getKpiDefinitionForPeriod,
    getEmployeeKpiTarget,
    getEmployeeKpiTargetResolution,
    getKpiRecordTarget,
} from './targets.js';

const KPI_DEFINITION_COLUMNS = 'id,name,description,category,target,unit,effective_period,approval_status,approval_required,is_active,latest_version_no,approved_by,approved_at,created_at,updated_at';
const KPI_DEFINITION_VERSION_COLUMNS = 'id,kpi_definition_id,version_no,effective_period,name,description,category,target,unit,status,request_note,rejection_reason,requested_by,requested_at,approved_by,approved_at,rejected_by,rejected_at,created_at,updated_at';
const EMPLOYEE_KPI_TARGET_VERSION_COLUMNS = 'id,employee_id,kpi_id,effective_period,target_value,unit,version_no,status,request_note,rejection_reason,requested_by,requested_at,approved_by,approved_at,rejected_by,rejected_at,created_at,updated_at';
const KPI_WEIGHT_PROFILE_COLUMNS = 'id,profile_name,department,position,active,created_at,updated_at';
const KPI_WEIGHT_ITEM_COLUMNS = 'id,profile_id,kpi_id,weight_pct,created_at,updated_at';
const EMPLOYEE_PERFORMANCE_SCORE_COLUMNS = 'id,employee_id,period,score_type,total_score,detail,calculated_by,calculated_at,created_at,updated_at';
const KPI_RECORD_COLUMNS = 'id,employee_id,kpi_id,period,value,target_snapshot,kpi_name_snapshot,kpi_unit_snapshot,kpi_category_snapshot,definition_version_id,target_version_id,updated_by,submitted_by,created_at,updated_at';

function nowIso() {
    return new Date().toISOString();
}

function currentPeriodKey() {
    const dt = new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function normalizePeriod(period) {
    const key = String(period || '').trim();
    return isPeriodKey(key) ? key : currentPeriodKey();
}

function isTruthyFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function needsHrApprovalForManagerAction() {
    return state.currentUser?.role === 'manager' && isTruthyFlag(state.appSettings?.kpi_hr_approval_required);
}

function nextVersionNo(rows = [], predicate = () => true) {
    const maxVer = asArray(rows)
        .filter(predicate)
        .reduce((max, row) => Math.max(max, Number(row?.version_no || 0)), 0);
    return maxVer + 1;
}

function isUniqueConstraintError(error) {
    return String(error?.code || '') === '23505';
}

async function getNextDefinitionVersionNo(definitionId) {
    const safeId = String(definitionId || '').trim();
    if (!safeId) return 1;

    let dbMax = 0;
    try {
        const { data } = await execSupabase(
            `Fetch latest KPI definition version no (${safeId})`,
            () => supabase
                .from('kpi_definition_versions')
                .select('version_no')
                .eq('kpi_definition_id', safeId)
                .order('version_no', { ascending: false })
                .limit(1),
            { retries: 1 }
        );
        dbMax = Number(data?.[0]?.version_no || 0);
    } catch {
        dbMax = 0;
    }

    const localMax = nextVersionNo(
        state.kpiDefinitionVersions,
        row => String(row?.kpi_definition_id || '') === safeId
    ) - 1;

    return Math.max(dbMax, localMax) + 1;
}

async function getNextTargetVersionNo(employeeId, kpiId, period) {
    const safeEmp = String(employeeId || '').trim();
    const safeKpi = String(kpiId || '').trim();
    const safePeriod = String(period || '').trim();
    if (!safeEmp || !safeKpi || !safePeriod) return 1;

    let dbMax = 0;
    try {
        const { data } = await execSupabase(
            `Fetch latest KPI target version no (${safeEmp}/${safeKpi}/${safePeriod})`,
            () => supabase
                .from('employee_kpi_target_versions')
                .select('version_no')
                .eq('employee_id', safeEmp)
                .eq('kpi_id', safeKpi)
                .eq('effective_period', safePeriod)
                .order('version_no', { ascending: false })
                .limit(1),
            { retries: 1 }
        );
        dbMax = Number(data?.[0]?.version_no || 0);
    } catch {
        dbMax = 0;
    }

    const localMax = nextVersionNo(
        state.employeeKpiTargetVersions,
        row => String(row?.employee_id || '') === safeEmp
            && String(row?.kpi_id || '') === safeKpi
            && String(row?.effective_period || '') === safePeriod
    ) - 1;

    return Math.max(dbMax, localMax) + 1;
}
async function fetchKpiDefinitions() {
    try {
        const { data, error } = await backend.kpis.list();
        if (error) throw error;
        state.kpiConfig = data || [];
        emit('data:kpiConfig', state.kpiConfig);
        return state.kpiConfig;
    } catch (error) {
        debugError('Fetch KPI defs error:', error);
        return [];
    }
}

async function fetchKpiDefinitionVersions() {
    // Phase 4 will handle versions if needed, for now return empty
    return [];
}

async function fetchEmployeeKpiTargetVersions() {
    return [];
}

async function saveKpiDefinition(kpi) {
    const payload = {
        ...kpi,
        effective_period: normalizePeriod(kpi?.effective_period),
        approval_status: String(kpi?.approval_status || 'approved'),
        approval_required: Boolean(kpi?.approval_required),
        is_active: kpi?.is_active === false ? false : true,
    };

    const { data } = await execSupabase(
        'Save KPI definition',
        () => supabase
            .from('kpi_definitions')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.kpiConfig.findIndex(row => row.id === data.id);
    if (idx >= 0) state.kpiConfig[idx] = data;
    else state.kpiConfig.push(data);
    emit('data:kpiConfig', state.kpiConfig);
    return data;
}

async function submitKpiDefinitionVersion(change) {
    const payload = {
        name: String(change?.name || '').trim(),
        description: String(change?.description || '').trim(),
        category: String(change?.category || 'General').trim() || 'General',
        target: toNumber(change?.target, 0),
        unit: String(change?.unit || '').trim(),
        effective_period: normalizePeriod(change?.effective_period),
        request_note: String(change?.request_note || '').trim(),
    };

    if (!payload.name) throw new Error('KPI name is required.');

    const requiresApproval = needsHrApprovalForManagerAction();
    const requestStatus = requiresApproval ? 'pending' : 'approved';

    let definitionId = String(change?.kpi_definition_id || change?.id || '').trim();
    const now = nowIso();

    if (!definitionId) {
        const base = await saveKpiDefinition({
            ...payload,
            approval_status: requestStatus,
            approval_required: requiresApproval,
            latest_version_no: 0,
            approved_by: requiresApproval ? null : (state.currentUser?.id || null),
            approved_at: requiresApproval ? null : now,
        });
        definitionId = String(base?.id || '').trim();
    }

    if (!definitionId) throw new Error('Failed to resolve KPI definition id.');

    let insertedVersionNo = 0;
    let lastInsertError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const versionNo = await getNextDefinitionVersionNo(definitionId);
        const versionRow = {
            kpi_definition_id: definitionId,
            version_no: versionNo,
            effective_period: payload.effective_period,
            name: payload.name,
            description: payload.description,
            category: payload.category,
            target: payload.target,
            unit: payload.unit,
            status: requestStatus,
            request_note: payload.request_note,
            requested_by: state.currentUser?.id || null,
            requested_at: now,
            approved_by: requestStatus === 'approved' ? (state.currentUser?.id || null) : null,
            approved_at: requestStatus === 'approved' ? now : null,
        };

        try {
            await execSupabase(
                'Save KPI definition version',
                () => supabase.from('kpi_definition_versions').insert(versionRow),
                { interactiveRetry: true, retries: 1 }
            );
            insertedVersionNo = versionNo;
            lastInsertError = null;
            break;
        } catch (error) {
            lastInsertError = error;
            if (!isUniqueConstraintError(error) || attempt === 2) {
                throw error;
            }
            await fetchKpiDefinitionVersions();
        }
    }

    if (!insertedVersionNo && lastInsertError) {
        throw lastInsertError;
    }

    if (requestStatus === 'approved') {
        await saveKpiDefinition({
            id: definitionId,
            ...payload,
            approval_status: 'approved',
            approval_required: requiresApproval,
            latest_version_no: insertedVersionNo,
            approved_by: state.currentUser?.id || null,
            approved_at: now,
            is_active: true,
        });
    } else {
        const base = state.kpiConfig.find(row => row.id === definitionId);
        if (base && String(base.approval_status || '').toLowerCase() !== 'pending') {
            await saveKpiDefinition({
                id: definitionId,
                ...base,
                approval_status: 'pending',
                approval_required: true,
            });
        }
    }

    await fetchKpiDefinitionVersions();
    await fetchKpiDefinitions();

    return {
        status: requestStatus,
        requiresApproval,
        definition_id: definitionId,
        version_no: insertedVersionNo,
    };
}
async function decideKpiDefinitionVersion(versionId, decision, reason = '') {
    const id = String(versionId || '').trim();
    const action = String(decision || '').trim().toLowerCase();
    if (!id) throw new Error('Version id is required.');
    if (!['approved', 'rejected'].includes(action)) throw new Error('Invalid decision action.');

    const row = state.kpiDefinitionVersions.find(item => String(item?.id || '') === id);
    if (!row) throw new Error('Version not found in local state. Refresh and try again.');

    const now = nowIso();
    const basePayload = {
        status: action,
        rejection_reason: action === 'rejected' ? String(reason || '').trim() : '',
        approved_by: action === 'approved' ? (state.currentUser?.id || null) : null,
        approved_at: action === 'approved' ? now : null,
        rejected_by: action === 'rejected' ? (state.currentUser?.id || null) : null,
        rejected_at: action === 'rejected' ? now : null,
    };

    await execSupabase(
        `Update KPI definition version ${id}`,
        () => supabase
            .from('kpi_definition_versions')
            .update(basePayload)
            .eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );

    if (action === 'approved') {
        await saveKpiDefinition({
            id: row.kpi_definition_id,
            name: row.name,
            description: row.description,
            category: row.category,
            target: row.target,
            unit: row.unit,
            effective_period: row.effective_period,
            approval_status: 'approved',
            approval_required: true,
            is_active: true,
            latest_version_no: row.version_no,
            approved_by: state.currentUser?.id || null,
            approved_at: now,
        });
    } else {
        const approvedExists = asArray(state.kpiDefinitionVersions).some(item =>
            item.kpi_definition_id === row.kpi_definition_id
            && String(item.status || '').toLowerCase() === 'approved'
            && String(item.id || '') !== id
        );

        if (!approvedExists) {
            const base = state.kpiConfig.find(item => item.id === row.kpi_definition_id);
            if (base) {
                await saveKpiDefinition({
                    ...base,
                    approval_status: 'rejected',
                    approval_required: true,
                    is_active: false,
                });
            }
        }
    }

    await fetchKpiDefinitionVersions();
    await fetchKpiDefinitions();
}

async function deleteKpiDefinition(id) {
    await execSupabase(
        `Delete KPI definition "${id}"`,
        () => supabase.from('kpi_definitions').delete().eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );
    state.kpiConfig = state.kpiConfig.filter(k => k.id !== id);
    emit('data:kpiConfig', state.kpiConfig);
}

async function submitEmployeeKpiTargetVersions({ employee_id, effective_period, items = [], request_note = '' }) {
    const employeeId = String(employee_id || '').trim();
    if (!employeeId) throw new Error('Employee id is required.');

    const period = normalizePeriod(effective_period);
    const requiresApproval = needsHrApprovalForManagerAction();
    const status = requiresApproval ? 'pending' : 'approved';
    const now = nowIso();

    const rows = asArray(items)
        .map(item => ({
            employee_id: employeeId,
            kpi_id: String(item?.kpi_id || '').trim(),
            effective_period: period,
            target_value: item?.target_value === null || item?.target_value === undefined || item?.target_value === ''
                ? null
                : toNumber(item?.target_value, 0),
            unit: String(item?.unit || '').trim(),
            request_note: String(item?.request_note || request_note || '').trim(),
        }))
        .filter(item => item.kpi_id);

    if (rows.length === 0) {
        throw new Error('No KPI target items to save.');
    }

    const preparedRows = [];
    for (const item of rows) {
        let inserted = null;
        let lastInsertError = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const version_no = await getNextTargetVersionNo(
                item.employee_id,
                item.kpi_id,
                item.effective_period
            );

            const payload = {
                ...item,
                version_no,
                status,
                requested_by: state.currentUser?.id || null,
                requested_at: now,
                approved_by: status === 'approved' ? (state.currentUser?.id || null) : null,
                approved_at: status === 'approved' ? now : null,
            };

            try {
                const { data } = await execSupabase(
                    'Save employee KPI target version',
                    () => supabase.from('employee_kpi_target_versions').insert(payload).select(EMPLOYEE_KPI_TARGET_VERSION_COLUMNS).single(),
                    { interactiveRetry: true, retries: 1 }
                );
                inserted = data || payload;
                lastInsertError = null;
                break;
            } catch (error) {
                lastInsertError = error;
                if (!isUniqueConstraintError(error) || attempt === 2) {
                    throw error;
                }
                await fetchEmployeeKpiTargetVersions();
            }
        }

        if (!inserted && lastInsertError) {
            throw lastInsertError;
        }

        if (inserted) {
            preparedRows.push(inserted);
        }
    }
    await fetchEmployeeKpiTargetVersions();

    return {
        status,
        requiresApproval,
        rows: preparedRows,
    };
}

async function decideEmployeeKpiTargetVersion(versionId, decision, reason = '') {
    const id = String(versionId || '').trim();
    const action = String(decision || '').trim().toLowerCase();
    if (!id) throw new Error('Version id is required.');
    if (!['approved', 'rejected'].includes(action)) throw new Error('Invalid decision action.');

    const now = nowIso();
    await execSupabase(
        `Update employee KPI target version ${id}`,
        () => supabase
            .from('employee_kpi_target_versions')
            .update({
                status: action,
                rejection_reason: action === 'rejected' ? String(reason || '').trim() : '',
                approved_by: action === 'approved' ? (state.currentUser?.id || null) : null,
                approved_at: action === 'approved' ? now : null,
                rejected_by: action === 'rejected' ? (state.currentUser?.id || null) : null,
                rejected_at: action === 'rejected' ? now : null,
            })
            .eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );

    await fetchEmployeeKpiTargetVersions();
}

function resolveEmployeeKpiTarget(employee, kpiId, period = '') {
    return getEmployeeKpiTarget(employee, kpiId, period);
}

function matchWeightProfile(employee, profile) {
    const empDept = String(employee?.department || '').trim();
    const empPos = String(employee?.position || '').trim();
    const profDept = String(profile?.department || '').trim();
    const profPos = String(profile?.position || '').trim();

    const hasDept = profDept.length > 0;
    const hasPos = profPos.length > 0;

    if (hasDept && profDept !== empDept) return -1;
    if (hasPos && profPos !== empPos) return -1;

    if (hasDept && hasPos) return 4;
    if (hasPos) return 3;
    if (hasDept) return 2;
    return 1;
}

function selectWeightProfileForEmployee(employee, profiles = state.kpiWeightProfiles) {
    const activeProfiles = asArray(profiles).filter(p => p && p.active !== false);
    let best = null;
    let bestScore = -1;
    let bestUpdatedAt = 0;

    activeProfiles.forEach(profile => {
        const score = matchWeightProfile(employee, profile);
        if (score < 0) return;

        const updatedAt = new Date(profile.updated_at || profile.created_at || 0).getTime();
        if (score > bestScore || (score === bestScore && updatedAt > bestUpdatedAt)) {
            best = profile;
            bestScore = score;
            bestUpdatedAt = updatedAt;
        }
    });

    return best;
}

function buildWeightLookup(profileId, items = state.kpiWeightItems) {
    const lookup = {};
    asArray(items).forEach(item => {
        if (item?.profile_id !== profileId) return;
        lookup[item.kpi_id] = toNumber(item.weight_pct, 0);
    });
    return lookup;
}

function calculateEmployeeWeightedKpiScore(employeeId, records = state.kpiRecords) {
    const employee = state.db[employeeId];
    if (!employee) {
        return {
            employee_id: employeeId,
            score: 0,
            weighted: false,
            metric_count: 0,
            profile_id: null,
            profile_name: '',
            detail: [],
        };
    }

    const employeeRecords = asArray(records).filter(r => String(r.employee_id || '') === String(employeeId || ''));
    const metrics = employeeRecords
        .map(record => {
            const target = getKpiRecordTarget(record, employee);
            if (target <= 0) return null;
            const value = toNumber(record.value, 0);
            const achievement_pct = (value / target) * 100;
            return {
                kpi_id: record.kpi_id,
                period: record.period,
                value,
                target,
                achievement_pct,
            };
        })
        .filter(Boolean);

    if (metrics.length === 0) {
        return {
            employee_id: employeeId,
            score: 0,
            weighted: false,
            metric_count: 0,
            profile_id: null,
            profile_name: '',
            detail: [],
        };
    }

    const profile = selectWeightProfileForEmployee(employee);
    const weightLookup = profile ? buildWeightLookup(profile.id) : {};

    const totalUsedWeight = metrics.reduce((sum, metric) => sum + Math.max(0, toNumber(weightLookup[metric.kpi_id], 0)), 0);
    const useWeighted = totalUsedWeight > 0;

    let totalScore = 0;
    const detail = [];

    if (useWeighted) {
        metrics.forEach(metric => {
            const rawWeight = Math.max(0, toNumber(weightLookup[metric.kpi_id], 0));
            if (rawWeight <= 0) {
                detail.push({
                    ...metric,
                    weight_pct: 0,
                    normalized_weight_pct: 0,
                    contribution: 0,
                });
                return;
            }

            const normalizedWeight = rawWeight / totalUsedWeight;
            const contribution = metric.achievement_pct * normalizedWeight;
            totalScore += contribution;
            detail.push({
                ...metric,
                weight_pct: roundScore(rawWeight),
                normalized_weight_pct: roundScore(normalizedWeight * 100),
                contribution: roundScore(contribution),
            });
        });
    } else {
        const equalWeight = 1 / metrics.length;
        metrics.forEach(metric => {
            const contribution = metric.achievement_pct * equalWeight;
            totalScore += contribution;
            detail.push({
                ...metric,
                weight_pct: roundScore(equalWeight * 100),
                normalized_weight_pct: roundScore(equalWeight * 100),
                contribution: roundScore(contribution),
            });
        });
    }

    return {
        employee_id: employeeId,
        score: roundScore(totalScore),
        weighted: useWeighted,
        metric_count: metrics.length,
        profile_id: profile?.id || null,
        profile_name: profile?.profile_name || '',
        detail,
    };
}

async function upsertEmployeePerformanceScore(employeeId, period) {
    if (!employeeId || !period) return null;

    const periodRecords = state.kpiRecords.filter(r => String(r.employee_id || '') === String(employeeId || '') && String(r.period || '') === String(period || ''));
    const summary = calculateEmployeeWeightedKpiScore(employeeId, periodRecords);

    const payload = {
        employee_id: employeeId,
        period,
        score_type: 'kpi_weighted',
        total_score: summary.score,
        detail: {
            weighted: summary.weighted,
            metric_count: summary.metric_count,
            profile_id: summary.profile_id,
            profile_name: summary.profile_name,
            items: summary.detail,
        },
        calculated_by: state.currentUser?.id || null,
        calculated_at: nowIso(),
    };

    try {
        const { data, error } = await backend.scores.save(payload);
        if (error) throw error;

        const idx = state.employeePerformanceScores.findIndex(
            r => String(r.employee_id || '') === String(data.employee_id || '') && String(r.period || '') === String(data.period || '') && String(r.score_type || '') === String(data.score_type || '')
        );
        if (idx >= 0) state.employeePerformanceScores[idx] = data;
        else state.employeePerformanceScores.push(data);
        emit('data:employeePerformanceScores', state.employeePerformanceScores);

        return data;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Upsert employee performance score error:', error);
        }
        return null;
    }
}

async function fetchKpiWeightProfiles() {
    try {
        const { data, error } = await backend.kpis.listWeightProfiles();
        if (error) throw error;
        state.kpiWeightProfiles = data || [];
        emit('data:kpiWeightProfiles', state.kpiWeightProfiles);
        return state.kpiWeightProfiles;
    } catch (error) {
        debugError('Fetch weight profiles error:', error);
        return [];
    }
}

async function fetchKpiWeightItems() {
    try {
        const { data, error } = await backend.kpis.listWeightItems();
        if (error) throw error;
        state.kpiWeightItems = data || [];
        emit('data:kpiWeightItems', state.kpiWeightItems);
        return state.kpiWeightItems;
    } catch (error) {
        debugError('Fetch weight items error:', error);
        return [];
    }
}

async function fetchEmployeePerformanceScores() {
    try {
        const { data, error } = await backend.scores.list();
        if (error) throw error;
        state.employeePerformanceScores = data || [];
        emit('data:employeePerformanceScores', state.employeePerformanceScores);
        return state.employeePerformanceScores;
    } catch (error) {
        debugError('Fetch performance scores error:', error);
        return [];
    }
}

async function saveKpiWeightProfile(profile) {
    const { data } = await execSupabase(
        'Save KPI weight profile',
        () => supabase
            .from('kpi_weight_profiles')
            .upsert(profile, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.kpiWeightProfiles.findIndex(p => p.id === data.id);
    if (idx >= 0) state.kpiWeightProfiles[idx] = data;
    else state.kpiWeightProfiles.push(data);
    emit('data:kpiWeightProfiles', state.kpiWeightProfiles);
    return data;
}

async function saveKpiWeightItems(profileId, items = []) {
    const rows = asArray(items)
        .map(item => ({
            id: item?.id,
            profile_id: profileId,
            kpi_id: item?.kpi_id,
            weight_pct: toNumber(item?.weight_pct, 0),
        }))
        .filter(item => item.profile_id && item.kpi_id);

    if (rows.length === 0) return [];

    const { data } = await execSupabase(
        'Save KPI weight items',
        () => supabase
            .from('kpi_weight_items')
            .upsert(rows, { onConflict: 'profile_id,kpi_id' })
            .select(),
        { interactiveRetry: true, retries: 1 }
    );

    const current = state.kpiWeightItems.filter(item => item.profile_id !== profileId);
    state.kpiWeightItems = [...current, ...(data || [])];
    emit('data:kpiWeightItems', state.kpiWeightItems);
    return data || [];
}

async function fetchKpiRecords(filters = {}) {
    try {
        const { data, error } = await backend.kpis.listRecords();
        if (error) throw error;
        
        let filtered = data || [];
        if (filters.employee_id) filtered = filtered.filter(r => String(r.employee_id) === String(filters.employee_id));
        if (filters.period) filtered = filtered.filter(r => String(r.period) === String(filters.period));

        state.kpiRecords = filtered;
        emit('data:kpiRecords', state.kpiRecords);
        return state.kpiRecords;
    } catch (error) {
        debugError('Fetch KPI records error:', error);
        return [];
    }
}

function buildKpiRecordSnapshot(record) {
    const existing = record?.id
        ? state.kpiRecords.find(row => String(row?.id || '') === String(record.id))
        : null;

    const sameContext = Boolean(
        existing
        && String(existing.employee_id || '') === String(record.employee_id || '')
        && String(existing.kpi_id || '') === String(record.kpi_id || '')
        && String(existing.period || '') === String(record.period || '')
    );

    if (sameContext && existing) {
        return {
            target_snapshot: existing.target_snapshot,
            kpi_name_snapshot: existing.kpi_name_snapshot,
            kpi_unit_snapshot: existing.kpi_unit_snapshot,
            kpi_category_snapshot: existing.kpi_category_snapshot,
            definition_version_id: existing.definition_version_id || null,
            target_version_id: existing.target_version_id || null,
        };
    }

    const employee = state.db[record.employee_id];
    const targetResolution = getEmployeeKpiTargetResolution(employee, record.kpi_id, record.period || '');
    const definition = getKpiDefinitionForPeriod(record.kpi_id, record.period || '');

    return {
        target_snapshot: toNumber(targetResolution.target, 0),
        kpi_name_snapshot: String(definition?.name || '').trim(),
        kpi_unit_snapshot: String(definition?.unit || '').trim(),
        kpi_category_snapshot: String(definition?.category || '').trim(),
        definition_version_id: definition?.version_id || null,
        target_version_id: targetResolution?.target_version_id || null,
    };
}

async function saveKpiRecord(record) {
    const snapshot = buildKpiRecordSnapshot(record);
    const payload = {
        ...record,
        ...snapshot,
        updated_by: record.updated_by || state.currentUser?.id || null,
    };

    const { data } = await execSupabase(
        'Save KPI record',
        () => supabase
            .from('kpi_records')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.kpiRecords.findIndex(r => r.id === data.id);
    if (idx >= 0) state.kpiRecords[idx] = data;
    else state.kpiRecords.push(data);
    emit('data:kpiRecords', state.kpiRecords);

    await upsertEmployeePerformanceScore(data.employee_id, data.period);

    return data;
}

async function deleteKpiRecord(id) {
    const existing = state.kpiRecords.find(r => r.id === id) || null;

    await execSupabase(
        `Delete KPI record "${id}"`,
        () => supabase.from('kpi_records').delete().eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );
    state.kpiRecords = state.kpiRecords.filter(r => r.id !== id);
    emit('data:kpiRecords', state.kpiRecords);

    if (existing) {
        await upsertEmployeePerformanceScore(existing.employee_id, existing.period);
    }
}

export {
    fetchKpiDefinitions,
    fetchKpiDefinitionVersions,
    fetchEmployeeKpiTargetVersions,
    saveKpiDefinition,
    submitKpiDefinitionVersion,
    decideKpiDefinitionVersion,
    deleteKpiDefinition,
    submitEmployeeKpiTargetVersions,
    decideEmployeeKpiTargetVersion,
    calculateEmployeeWeightedKpiScore,
    fetchKpiWeightProfiles,
    fetchKpiWeightItems,
    fetchEmployeePerformanceScores,
    saveKpiWeightProfile,
    saveKpiWeightItems,
    fetchKpiRecords,
    saveKpiRecord,
    deleteKpiRecord,
    resolveEmployeeKpiTarget,
};

