import {
    supabase,
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
import {
    getKpiDefinitionForPeriod,
    getEmployeeKpiTarget,
    getEmployeeKpiTargetResolution,
    getKpiRecordTarget,
} from './targets.js';

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

async function fetchKpiDefinitions() {
    try {
        const { data } = await execSupabase(
            'Fetch KPI definitions',
            () => supabase.from('kpi_definitions').select('*').order('category').order('name'),
            { retries: 1 }
        );
        state.kpiConfig = data || [];
        emit('data:kpiConfig', state.kpiConfig);
        return state.kpiConfig;
    } catch (error) {
        debugError('Fetch KPI defs error:', error);
        return [];
    }
}

async function fetchKpiDefinitionVersions() {
    return fetchOptionalCollection({
        label: 'Fetch KPI definition versions',
        table: 'kpi_definition_versions',
        stateKey: 'kpiDefinitionVersions',
        eventName: 'data:kpiDefinitionVersions',
        orderBy: 'requested_at',
        ascending: false,
    });
}

async function fetchEmployeeKpiTargetVersions() {
    return fetchOptionalCollection({
        label: 'Fetch employee KPI target versions',
        table: 'employee_kpi_target_versions',
        stateKey: 'employeeKpiTargetVersions',
        eventName: 'data:employeeKpiTargetVersions',
        orderBy: 'requested_at',
        ascending: false,
    });
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

    const versionNo = nextVersionNo(
        state.kpiDefinitionVersions,
        row => String(row?.kpi_definition_id || '') === definitionId
    );

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

    await execSupabase(
        'Save KPI definition version',
        () => supabase.from('kpi_definition_versions').insert(versionRow),
        { interactiveRetry: true, retries: 1 }
    );

    if (requestStatus === 'approved') {
        await saveKpiDefinition({
            id: definitionId,
            ...payload,
            approval_status: 'approved',
            approval_required: requiresApproval,
            latest_version_no: versionNo,
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
        version_no: versionNo,
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

    const preparedRows = rows.map(item => {
        const version_no = nextVersionNo(
            state.employeeKpiTargetVersions,
            row => String(row?.employee_id || '') === item.employee_id
                && String(row?.kpi_id || '') === item.kpi_id
                && String(row?.effective_period || '') === item.effective_period
        );

        return {
            ...item,
            version_no,
            status,
            requested_by: state.currentUser?.id || null,
            requested_at: now,
            approved_by: status === 'approved' ? (state.currentUser?.id || null) : null,
            approved_at: status === 'approved' ? now : null,
        };
    });

    const { data } = await execSupabase(
        'Save employee KPI target versions',
        () => supabase.from('employee_kpi_target_versions').insert(preparedRows).select('*'),
        { interactiveRetry: true, retries: 1 }
    );

    await fetchEmployeeKpiTargetVersions();

    return {
        status,
        requiresApproval,
        rows: data || preparedRows,
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

    const employeeRecords = asArray(records).filter(r => r.employee_id === employeeId);
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

    const periodRecords = state.kpiRecords.filter(r => r.employee_id === employeeId && r.period === period);
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
        const { data } = await execSupabase(
            `Upsert performance score for ${employeeId}/${period}`,
            () => supabase
                .from('employee_performance_scores')
                .upsert(payload, { onConflict: 'employee_id,period,score_type' })
                .select()
                .single(),
            { retries: 1 }
        );

        const idx = state.employeePerformanceScores.findIndex(
            r => r.employee_id === data.employee_id && r.period === data.period && r.score_type === data.score_type
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
    return fetchOptionalCollection({
        label: 'Fetch KPI weight profiles',
        table: 'kpi_weight_profiles',
        stateKey: 'kpiWeightProfiles',
        eventName: 'data:kpiWeightProfiles',
        orderBy: 'updated_at',
        ascending: false,
    });
}

async function fetchKpiWeightItems() {
    return fetchOptionalCollection({
        label: 'Fetch KPI weight items',
        table: 'kpi_weight_items',
        stateKey: 'kpiWeightItems',
        eventName: 'data:kpiWeightItems',
        orderBy: 'updated_at',
        ascending: false,
    });
}

async function fetchEmployeePerformanceScores() {
    return fetchOptionalCollection({
        label: 'Fetch employee performance scores',
        table: 'employee_performance_scores',
        stateKey: 'employeePerformanceScores',
        eventName: 'data:employeePerformanceScores',
        orderBy: 'calculated_at',
        ascending: false,
    });
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
        let query = supabase.from('kpi_records').select('*');
        if (filters.employee_id) query = query.eq('employee_id', filters.employee_id);
        if (filters.period) query = query.eq('period', filters.period);
        const { data } = await execSupabase(
            'Fetch KPI records',
            () => query.order('period', { ascending: false }),
            { retries: 1 }
        );
        state.kpiRecords = data || [];
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

