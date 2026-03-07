// ==================================================
// DATA MODULE — Supabase CRUD operations
// ==================================================

import { supabase } from '../lib/supabase.js';
import { state, emit } from '../lib/store.js';
import { getDepartment, debugError } from '../lib/utils.js';
import * as notify from '../lib/notify.js';

const SETTINGS_CACHE_KEY = 'tna_app_settings_cache_v1';

function writeSettingsCache(settings) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings || {}));
    } catch {
        // Ignore storage quota and private-mode errors.
    }
}

function readSettingsCache() {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toDateLabel(value, fallback = '-') {
    if (!value) return fallback;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return fallback;
    return dt.toLocaleDateString();
}

function isMissingRelationError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('does not exist') || msg.includes('relation') || msg.includes('42p01');
}

function normalizeScoreRows(items = []) {
    return asArray(items)
        .map(item => {
            const competencyName = String(item?.q ?? item?.competency_name ?? '').trim();
            const score = toNumber(item?.s ?? item?.score, 0);
            const note = String(item?.n ?? item?.note ?? '').trim();
            return {
                competency_name: competencyName,
                score,
                note,
            };
        })
        .filter(item => item.competency_name);
}

function mapLegacyEmployeeRow(row) {
    return {
        id: row.employee_id,
        name: row.name,
        position: row.position,
        seniority: row.seniority,
        join_date: row.join_date,
        department: row.department || getDepartment(row.position),
        manager_id: row.manager_id || '',
        auth_email: row.auth_email || '',
        auth_id: row.auth_id || '',
        role: row.role || 'employee',
        percentage: toNumber(row.percentage, 0),
        scores: asArray(row.scores),
        self_scores: asArray(row.self_scores),
        self_percentage: toNumber(row.self_percentage, 0),
        self_date: row.self_date || '',
        history: asArray(row.history),
        training_history: asArray(row.training_history),
        date_created: row.date_created || '-',
        date_updated: row.date_updated || '-',
        date_next: row.date_next || '-',
        tenure_display: row.tenure_display || '',
        kpi_targets: row.kpi_targets || {},
        must_change_password: Boolean(row.must_change_password),
        assessment_updated_by: row.assessment_updated_by || '',
        assessment_updated_at: row.assessment_updated_at || '',
        self_assessment_updated_by: row.self_assessment_updated_by || '',
        self_assessment_updated_at: row.self_assessment_updated_at || '',
    };
}

function isPeriodKey(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function sanitizeTargetMap(obj = {}) {
    const map = {};
    Object.entries(obj || {}).forEach(([kpiId, raw]) => {
        const num = toNumber(raw, NaN);
        if (Number.isFinite(num)) map[String(kpiId)] = num;
    });
    return map;
}

export function normalizeKpiTargetStore(rawTargets = {}) {
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

export function buildKpiTargetStore(defaultTargets = {}, monthlyTargets = {}) {
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

export function getEmployeeKpiTarget(employee, kpiId, period = '') {
    const key = String(kpiId || '').trim();
    if (!employee || !key) return 0;

    const { defaultTargets, monthlyTargets } = normalizeKpiTargetStore(employee.kpi_targets || {});

    if (isPeriodKey(period) && monthlyTargets[period] && monthlyTargets[period][key] !== undefined) {
        return toNumber(monthlyTargets[period][key], 0);
    }
    if (defaultTargets[key] !== undefined) {
        return toNumber(defaultTargets[key], 0);
    }

    const kpiDef = state.kpiConfig.find(k => k.id === key);
    return toNumber(kpiDef?.target, 0);
}
function getErrMsg(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.message || error.error_description || error.details || 'Unknown error';
}

function isRetryableError(error) {
    const msg = getErrMsg(error).toLowerCase();
    return (
        msg.includes('network') ||
        msg.includes('fetch') ||
        msg.includes('timeout') ||
        msg.includes('connection') ||
        msg.includes('failed to')
    );
}

async function execSupabase(label, queryFn, options = {}) {
    const retries = Number.isInteger(options.retries) ? options.retries : 1;
    const interactiveRetry = Boolean(options.interactiveRetry);
    let attempt = 0;

    while (attempt <= retries) {
        try {
            const result = await queryFn();
            if (result?.error) throw result.error;
            return result;
        } catch (error) {
            if (attempt >= retries) throw error;
            if (!isRetryableError(error)) throw error;

            if (interactiveRetry) {
                const retry = await notify.confirm(
                    `${label} failed due to a network issue.\n${getErrMsg(error)}`,
                    {
                        title: 'Network Error',
                        confirmButtonText: 'Retry',
                        cancelButtonText: 'Cancel',
                        icon: 'warning',
                    }
                );
                if (!retry) throw error;
            }
        }
        attempt += 1;
    }

    throw new Error(`${label} failed after retry.`);
}

// ---- ACTIVITY LOG ----
export async function fetchActivityLogs(limit = 100) {
    try {
        const { data } = await execSupabase(
            'Load activity log',
            () => supabase
                .from('admin_activity_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit),
            { retries: 1 }
        );
        state.activityLogs = data || [];
        emit('data:activityLogs', state.activityLogs);
        return state.activityLogs;
    } catch (error) {
        debugError('Fetch activity logs error:', error);
        state.activityLogs = [];
        emit('data:activityLogs', state.activityLogs);
        return [];
    }
}

export async function logActivity({
    action,
    entityType = 'general',
    entityId = null,
    details = {},
} = {}) {
    const actorId = state.currentUser?.id;
    if (!actorId || !action) return;

    try {
        await execSupabase(
            'Write activity log',
            () => supabase.from('admin_activity_log').insert({
                actor_employee_id: actorId,
                actor_role: state.currentUser?.role || null,
                action,
                entity_type: entityType,
                entity_id: entityId ? String(entityId) : null,
                details: details || {},
            }),
            { retries: 0 }
        );
    } catch (error) {
        debugError('Log activity error:', error);
    }
}

// ---- APP SETTINGS ----
export async function fetchSettings() {
    try {
        const { data } = await execSupabase(
            'Fetch settings',
            () => supabase.from('app_settings').select('*'),
            { retries: 1 }
        );

        const settings = {};
        (data || []).forEach(row => { settings[row.key] = row.value; });
        state.appSettings = settings;
        writeSettingsCache(settings);
        emit('data:settings', settings);
        return settings;
    } catch (error) {
        debugError('Fetch settings error:', error);
        const cachedSettings = readSettingsCache();
        state.appSettings = cachedSettings;
        emit('data:settings', cachedSettings);
        return cachedSettings;
    }
}

export async function saveSetting(key, value) {
    await execSupabase(
        `Save setting "${key}"`,
        () => supabase
            .from('app_settings')
            .upsert({ key, value }, { onConflict: 'key' }),
        { interactiveRetry: true, retries: 1 }
    );
    state.appSettings[key] = value;
    writeSettingsCache(state.appSettings);
    emit('data:settings', state.appSettings);
}

// ---- EMPLOYEES / DB ----
export async function fetchEmployees() {
    try {
        const { data: employeeRows } = await execSupabase(
            'Fetch employees',
            () => supabase.from('employees').select('*'),
            { retries: 1 }
        );

        let normalizedTables = null;
        try {
            const [assessmentsRes, assessmentScoresRes, assessmentHistoryRes, trainingRes] = await Promise.all([
                execSupabase('Fetch assessments', () => supabase.from('employee_assessments').select('*'), { retries: 1 }),
                execSupabase('Fetch assessment scores', () => supabase.from('employee_assessment_scores').select('*'), { retries: 1 }),
                execSupabase('Fetch assessment history', () => supabase.from('employee_assessment_history').select('*'), { retries: 1 }),
                execSupabase('Fetch training records', () => supabase.from('employee_training_records').select('*'), { retries: 1 }),
            ]);

            normalizedTables = {
                assessments: assessmentsRes.data || [],
                assessmentScores: assessmentScoresRes.data || [],
                assessmentHistory: assessmentHistoryRes.data || [],
                trainingRecords: trainingRes.data || [],
            };
        } catch (normalizedErr) {
            if (!isMissingRelationError(normalizedErr)) {
                debugError('Fetch normalized employee tables error:', normalizedErr);
            }
        }

        const assessmentsByEmployee = {};
        const assessmentScoresByAssessment = {};
        const historyByEmployee = {};
        const trainingByEmployee = {};

        if (normalizedTables) {
            normalizedTables.assessments.forEach(row => {
                if (!assessmentsByEmployee[row.employee_id]) assessmentsByEmployee[row.employee_id] = {};
                assessmentsByEmployee[row.employee_id][row.assessment_type] = row;
            });

            normalizedTables.assessmentScores.forEach(row => {
                if (!assessmentScoresByAssessment[row.assessment_id]) assessmentScoresByAssessment[row.assessment_id] = [];
                assessmentScoresByAssessment[row.assessment_id].push(row);
            });

            normalizedTables.assessmentHistory.forEach(row => {
                if (!historyByEmployee[row.employee_id]) historyByEmployee[row.employee_id] = [];
                historyByEmployee[row.employee_id].push(row);
            });

            normalizedTables.trainingRecords.forEach(row => {
                if (!trainingByEmployee[row.employee_id]) trainingByEmployee[row.employee_id] = [];
                trainingByEmployee[row.employee_id].push(row);
            });
        }

        const db = {};
        (employeeRows || []).forEach(row => {
            const rec = mapLegacyEmployeeRow(row);

            if (normalizedTables) {
                const snapshots = assessmentsByEmployee[row.employee_id] || {};
                const managerSnapshot = snapshots.manager;
                const selfSnapshot = snapshots.self;

                if (managerSnapshot) {
                    rec.percentage = toNumber(managerSnapshot.percentage, 0);
                    rec.assessment_updated_by = managerSnapshot.assessed_by || '';
                    rec.assessment_updated_at = managerSnapshot.assessed_at || '';
                    rec.date_updated = managerSnapshot.source_date || toDateLabel(managerSnapshot.assessed_at, rec.date_updated);
                    if (!rec.date_created || rec.date_created === '-') {
                        rec.date_created = rec.date_updated || '-';
                    }
                    rec.scores = asArray(assessmentScoresByAssessment[managerSnapshot.id]).map(score => ({
                        q: score.competency_name,
                        s: toNumber(score.score, 0),
                        n: score.note || '',
                    }));
                }

                if (selfSnapshot) {
                    rec.self_percentage = toNumber(selfSnapshot.percentage, 0);
                    rec.self_assessment_updated_by = selfSnapshot.assessed_by || '';
                    rec.self_assessment_updated_at = selfSnapshot.assessed_at || '';
                    rec.self_date = selfSnapshot.source_date || toDateLabel(selfSnapshot.assessed_at, rec.self_date || '');
                    rec.self_scores = asArray(assessmentScoresByAssessment[selfSnapshot.id]).map(score => ({
                        q: score.competency_name,
                        s: toNumber(score.score, 0),
                        n: score.note || '',
                    }));
                }

                if (historyByEmployee[row.employee_id]) {
                    rec.history = historyByEmployee[row.employee_id]
                        .slice()
                        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
                        .map(item => ({
                            date: item.assessed_on || '-',
                            score: toNumber(item.percentage, 0),
                            seniority: item.seniority || rec.seniority || '-',
                            position: item.position || rec.position || '',
                        }));
                }

                if (trainingByEmployee[row.employee_id]) {
                    rec.training_history = trainingByEmployee[row.employee_id]
                        .slice()
                        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
                        .map(item => ({
                            course: item.course || '',
                            start: item.start_date || '',
                            end: item.end_date || '',
                            provider: item.provider || '',
                            status: item.status || 'ongoing',
                        }));
                }
            }

            db[row.employee_id] = rec;
        });

        state.db = db;
        emit('data:employees', db);
        return db;
    } catch (error) {
        debugError('Fetch employees error:', error);
        return;
    }
}

async function upsertAssessmentSnapshot(rec, assessmentType) {
    const isSelf = assessmentType === 'self';
    const percentage = toNumber(isSelf ? rec.self_percentage : rec.percentage, 0);
    const assessedAt = isSelf ? (rec.self_assessment_updated_at || null) : (rec.assessment_updated_at || null);
    const assessedBy = isSelf ? (rec.self_assessment_updated_by || null) : (rec.assessment_updated_by || null);
    const sourceDate = isSelf
        ? (rec.self_date || '-')
        : (rec.date_updated || rec.date_created || '-');
    const scoreRows = normalizeScoreRows(isSelf ? rec.self_scores : rec.scores);

    const hasData = percentage > 0 || scoreRows.length > 0 || Boolean(assessedAt);

    if (!hasData) {
        const { data: existingRows } = await execSupabase(
            `Find ${assessmentType} assessment snapshot for ${rec.id}`,
            () => supabase
                .from('employee_assessments')
                .select('id')
                .eq('employee_id', rec.id)
                .eq('assessment_type', assessmentType),
            { retries: 0 }
        );

        const assessmentIds = (existingRows || []).map(row => row.id).filter(Boolean);
        if (assessmentIds.length > 0) {
            await execSupabase(
                `Delete ${assessmentType} assessment score rows for ${rec.id}`,
                () => supabase
                    .from('employee_assessment_scores')
                    .delete()
                    .in('assessment_id', assessmentIds),
                { retries: 0 }
            );
        }

        await execSupabase(
            `Delete ${assessmentType} assessment snapshot for ${rec.id}`,
            () => supabase
                .from('employee_assessments')
                .delete()
                .eq('employee_id', rec.id)
                .eq('assessment_type', assessmentType),
            { retries: 0 }
        );
        return;
    }

    const { data: snapshot } = await execSupabase(
        `Save ${assessmentType} assessment snapshot for ${rec.id}`,
        () => supabase
            .from('employee_assessments')
            .upsert({
                employee_id: rec.id,
                assessment_type: assessmentType,
                percentage,
                seniority: rec.seniority || '',
                assessed_at: assessedAt,
                assessed_by: assessedBy,
                source_date: sourceDate,
            }, { onConflict: 'employee_id,assessment_type' })
            .select('id')
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    await execSupabase(
        `Replace ${assessmentType} assessment score rows for ${rec.id}`,
        () => supabase
            .from('employee_assessment_scores')
            .delete()
            .eq('assessment_id', snapshot.id),
        { retries: 0 }
    );

    if (scoreRows.length > 0) {
        await execSupabase(
            `Insert ${assessmentType} assessment score rows for ${rec.id}`,
            () => supabase
                .from('employee_assessment_scores')
                .insert(scoreRows.map(row => ({
                    assessment_id: snapshot.id,
                    competency_name: row.competency_name,
                    score: row.score,
                    note: row.note,
                }))),
            { interactiveRetry: true, retries: 1 }
        );
    }
}

async function replaceAssessmentHistoryRows(rec) {
    await execSupabase(
        `Replace assessment history rows for ${rec.id}`,
        () => supabase
            .from('employee_assessment_history')
            .delete()
            .eq('employee_id', rec.id),
        { retries: 0 }
    );

    const rows = asArray(rec.history)
        .map(item => ({
            employee_id: rec.id,
            assessment_type: 'manager',
            assessed_on: String(item?.date || '-'),
            percentage: toNumber(item?.score, 0),
            seniority: String(item?.seniority || rec.seniority || ''),
            position: String(item?.position || rec.position || ''),
        }))
        .filter(item => item.assessed_on !== '' && Number.isFinite(item.percentage));

    if (rows.length > 0) {
        await execSupabase(
            `Insert assessment history rows for ${rec.id}`,
            () => supabase.from('employee_assessment_history').insert(rows),
            { interactiveRetry: true, retries: 1 }
        );
    }
}

async function replaceTrainingRows(rec) {
    await execSupabase(
        `Replace training rows for ${rec.id}`,
        () => supabase
            .from('employee_training_records')
            .delete()
            .eq('employee_id', rec.id),
        { retries: 0 }
    );

    const rows = asArray(rec.training_history)
        .map(item => ({
            employee_id: rec.id,
            course: String(item?.course || '').trim(),
            start_date: String(item?.start || ''),
            end_date: String(item?.end || ''),
            provider: String(item?.provider || ''),
            status: String(item?.status || 'ongoing').toLowerCase(),
            notes: String(item?.notes || ''),
        }))
        .filter(item => item.course)
        .map(item => ({
            ...item,
            status: ['planned', 'ongoing', 'completed', 'approved'].includes(item.status) ? item.status : 'ongoing',
        }));

    if (rows.length > 0) {
        await execSupabase(
            `Insert training rows for ${rec.id}`,
            () => supabase.from('employee_training_records').insert(rows),
            { interactiveRetry: true, retries: 1 }
        );
    }
}

async function syncEmployeeNormalizedRecords(rec) {
    try {
        await upsertAssessmentSnapshot(rec, 'manager');
        await upsertAssessmentSnapshot(rec, 'self');
        await replaceAssessmentHistoryRows(rec);
        await replaceTrainingRows(rec);
    } catch (error) {
        if (isMissingRelationError(error)) return;
        throw error;
    }
}

export async function saveEmployee(rec) {
    const payload = {
        employee_id: rec.id,
        name: rec.name,
        position: rec.position,
        seniority: rec.seniority,
        join_date: rec.join_date,
        department: rec.department || getDepartment(rec.position),
        manager_id: rec.manager_id || null,
        auth_email: rec.auth_email || null,
        auth_id: rec.auth_id || null,
        role: rec.role || 'employee',
        percentage: rec.percentage || 0,
        scores: rec.scores || [],
        self_scores: rec.self_scores || [],
        self_percentage: rec.self_percentage || 0,
        self_date: rec.self_date || null,
        history: rec.history || [],
        training_history: rec.training_history || [],
        date_created: rec.date_created || '-',
        date_updated: rec.date_updated || '-',
        date_next: rec.date_next || '-',
        tenure_display: rec.tenure_display || '',
        kpi_targets: rec.kpi_targets || {},
        must_change_password: Boolean(rec.must_change_password),
        assessment_updated_by: rec.assessment_updated_by || null,
        assessment_updated_at: rec.assessment_updated_at || null,
        self_assessment_updated_by: rec.self_assessment_updated_by || null,
        self_assessment_updated_at: rec.self_assessment_updated_at || null,
    };

    await execSupabase(
        `Save employee "${rec.id}"`,
        () => supabase
            .from('employees')
            .upsert(payload, { onConflict: 'employee_id' }),
        { interactiveRetry: true, retries: 1 }
    );

    await syncEmployeeNormalizedRecords(rec);

    state.db[rec.id] = rec;
    emit('data:employees', state.db);
}

export async function deleteEmployee(id) {
    await execSupabase(
        `Delete employee "${id}"`,
        () => supabase
            .from('employees')
            .delete()
            .eq('employee_id', id),
        { interactiveRetry: true, retries: 1 }
    );

    delete state.db[id];
    emit('data:employees', state.db);
}

// ---- CONFIG ----
export async function fetchConfig() {
    try {
        const { data } = await execSupabase(
            'Fetch competency config',
            () => supabase.from('competency_config').select('*'),
            { retries: 1 }
        );

        const config = {};
        (data || []).forEach(row => {
            config[row.position_name] = { competencies: row.competencies || [] };
        });

        state.appConfig = config;
        emit('data:config', config);
        return config;
    } catch (error) {
        debugError('Fetch config error:', error);
        return;
    }
}

export async function saveConfig(posName, competencies) {
    await execSupabase(
        `Save competency config "${posName}"`,
        () => supabase
            .from('competency_config')
            .upsert({ position_name: posName, competencies }, { onConflict: 'position_name' }),
        { interactiveRetry: true, retries: 1 }
    );
    state.appConfig[posName] = { competencies };
    emit('data:config', state.appConfig);
}

export async function deleteConfig(posName) {
    await execSupabase(
        `Delete competency config "${posName}"`,
        () => supabase
            .from('competency_config')
            .delete()
            .eq('position_name', posName),
        { interactiveRetry: true, retries: 1 }
    );
    delete state.appConfig[posName];
    emit('data:config', state.appConfig);
}

// ---- KPI ----
export async function fetchKpiDefinitions() {
    try {
        const { data } = await execSupabase(
            'Fetch KPI definitions',
            () => supabase.from('kpi_definitions').select('*').order('category'),
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

export async function saveKpiDefinition(kpi) {
    const { data } = await execSupabase(
        'Save KPI definition',
        () => supabase
            .from('kpi_definitions')
            .upsert(kpi, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.kpiConfig.findIndex(k => k.id === data.id);
    if (idx >= 0) state.kpiConfig[idx] = data;
    else state.kpiConfig.push(data);
    emit('data:kpiConfig', state.kpiConfig);
    return data;
}

export async function deleteKpiDefinition(id) {
    await execSupabase(
        `Delete KPI definition "${id}"`,
        () => supabase.from('kpi_definitions').delete().eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );
    state.kpiConfig = state.kpiConfig.filter(k => k.id !== id);
    emit('data:kpiConfig', state.kpiConfig);
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

function roundScore(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

export function calculateEmployeeWeightedKpiScore(employeeId, records = state.kpiRecords) {
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
            const target = resolveEmployeeKpiTarget(employee, record.kpi_id, record.period);
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
        calculated_at: new Date().toISOString(),
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

async function fetchOptionalCollection({
    label,
    table,
    stateKey,
    eventName,
    orderBy = 'created_at',
    ascending = false,
}) {
    try {
        const query = supabase.from(table).select('*').order(orderBy, { ascending });
        const { data } = await execSupabase(label, () => query, { retries: 1 });
        state[stateKey] = data || [];
        emit(eventName, state[stateKey]);
        return state[stateKey];
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError(`${label} error:`, error);
        }
        state[stateKey] = [];
        emit(eventName, state[stateKey]);
        return [];
    }
}

export async function fetchKpiWeightProfiles() {
    return fetchOptionalCollection({
        label: 'Fetch KPI weight profiles',
        table: 'kpi_weight_profiles',
        stateKey: 'kpiWeightProfiles',
        eventName: 'data:kpiWeightProfiles',
        orderBy: 'updated_at',
        ascending: false,
    });
}

export async function fetchKpiWeightItems() {
    return fetchOptionalCollection({
        label: 'Fetch KPI weight items',
        table: 'kpi_weight_items',
        stateKey: 'kpiWeightItems',
        eventName: 'data:kpiWeightItems',
        orderBy: 'updated_at',
        ascending: false,
    });
}

export async function fetchEmployeePerformanceScores() {
    return fetchOptionalCollection({
        label: 'Fetch employee performance scores',
        table: 'employee_performance_scores',
        stateKey: 'employeePerformanceScores',
        eventName: 'data:employeePerformanceScores',
        orderBy: 'calculated_at',
        ascending: false,
    });
}

export async function fetchProbationReviews() {
    return fetchOptionalCollection({
        label: 'Fetch probation reviews',
        table: 'probation_reviews',
        stateKey: 'probationReviews',
        eventName: 'data:probationReviews',
        orderBy: 'created_at',
        ascending: false,
    });
}

export async function fetchProbationQualitativeItems() {
    return fetchOptionalCollection({
        label: 'Fetch probation qualitative items',
        table: 'probation_qualitative_items',
        stateKey: 'probationQualitativeItems',
        eventName: 'data:probationQualitativeItems',
        orderBy: 'created_at',
        ascending: false,
    });
}

export async function fetchPipPlans() {
    return fetchOptionalCollection({
        label: 'Fetch PIP plans',
        table: 'pip_plans',
        stateKey: 'pipPlans',
        eventName: 'data:pipPlans',
        orderBy: 'created_at',
        ascending: false,
    });
}

export async function fetchPipActions() {
    return fetchOptionalCollection({
        label: 'Fetch PIP actions',
        table: 'pip_actions',
        stateKey: 'pipActions',
        eventName: 'data:pipActions',
        orderBy: 'created_at',
        ascending: false,
    });
}

export async function saveKpiWeightProfile(profile) {
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

export async function saveKpiWeightItems(profileId, items = []) {
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

function toPeriod(date) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function getProbationPeriods(joinDate, monthCount = 3) {
    const base = new Date(joinDate);
    if (Number.isNaN(base.getTime())) return [];

    const periods = [];
    const start = new Date(Date.UTC(base.getFullYear(), base.getMonth(), 1));
    for (let i = 0; i < monthCount; i++) {
        const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
        periods.push(toPeriod(next));
    }
    return periods;
}

export function buildProbationDraft(employeeId, qualitativeItems = []) {
    const employee = state.db[employeeId];
    if (!employee?.join_date) {
        return {
            employee_id: employeeId,
            review_period_start: null,
            review_period_end: null,
            quantitative_score: 0,
            qualitative_score: 0,
            final_score: 0,
            periods: [],
            metric_count: 0,
        };
    }

    const periods = getProbationPeriods(employee.join_date, 3);
    const probationRecords = state.kpiRecords.filter(r => r.employee_id === employeeId && periods.includes(r.period));
    const quantSummary = calculateEmployeeWeightedKpiScore(employeeId, probationRecords);

    const qualitativeList = asArray(qualitativeItems)
        .map(item => toNumber(item?.score, 0))
        .filter(score => score > 0);
    const qualitativeScore = qualitativeList.length > 0
        ? qualitativeList.reduce((sum, score) => sum + score, 0) / qualitativeList.length
        : 0;

    const finalScore = (quantSummary.score * 0.7) + (qualitativeScore * 0.3);

    const startDate = new Date(employee.join_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 3);
    endDate.setDate(endDate.getDate() - 1);

    return {
        employee_id: employeeId,
        review_period_start: employee.join_date,
        review_period_end: endDate.toISOString().slice(0, 10),
        quantitative_score: roundScore(quantSummary.score),
        qualitative_score: roundScore(qualitativeScore),
        final_score: roundScore(finalScore),
        periods,
        metric_count: quantSummary.metric_count,
    };
}

export async function saveProbationReview(review, qualitativeItems = []) {
    const draft = buildProbationDraft(review.employee_id, qualitativeItems);
    const quantitativeScore = review.quantitative_score !== undefined
        ? toNumber(review.quantitative_score, 0)
        : draft.quantitative_score;
    const qualitativeScore = review.qualitative_score !== undefined
        ? toNumber(review.qualitative_score, 0)
        : draft.qualitative_score;
    const finalScore = review.final_score !== undefined
        ? toNumber(review.final_score, 0)
        : roundScore((quantitativeScore * 0.7) + (qualitativeScore * 0.3));

    const payload = {
        ...review,
        review_period_start: review.review_period_start || draft.review_period_start,
        review_period_end: review.review_period_end || draft.review_period_end,
        quantitative_score: quantitativeScore,
        qualitative_score: qualitativeScore,
        final_score: finalScore,
        reviewed_by: review.reviewed_by || state.currentUser?.id || null,
        reviewed_at: review.reviewed_at || new Date().toISOString(),
    };

    const { data } = await execSupabase(
        'Save probation review',
        () => supabase
            .from('probation_reviews')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.probationReviews.findIndex(r => r.id === data.id);
    if (idx >= 0) state.probationReviews[idx] = data;
    else state.probationReviews.push(data);
    emit('data:probationReviews', state.probationReviews);

    const qualRows = asArray(qualitativeItems)
        .map(item => ({
            id: item?.id,
            probation_review_id: data.id,
            item_name: String(item?.item_name || '').trim(),
            score: toNumber(item?.score, 0),
            note: String(item?.note || '').trim(),
        }))
        .filter(item => item.item_name);

    if (qualRows.length > 0) {
        const { data: qualSaved } = await execSupabase(
            'Save probation qualitative items',
            () => supabase
                .from('probation_qualitative_items')
                .upsert(qualRows, { onConflict: 'probation_review_id,item_name' })
                .select(),
            { interactiveRetry: true, retries: 1 }
        );

        const untouched = state.probationQualitativeItems.filter(item => item.probation_review_id !== data.id);
        state.probationQualitativeItems = [...untouched, ...(qualSaved || [])];
        emit('data:probationQualitativeItems', state.probationQualitativeItems);
    }

    return data;
}

export async function savePipPlan(plan) {
    const payload = {
        ...plan,
        owner_manager_id: plan.owner_manager_id || state.currentUser?.id || null,
    };

    const { data } = await execSupabase(
        'Save PIP plan',
        () => supabase
            .from('pip_plans')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.pipPlans.findIndex(r => r.id === data.id);
    if (idx >= 0) state.pipPlans[idx] = data;
    else state.pipPlans.push(data);
    emit('data:pipPlans', state.pipPlans);
    return data;
}

export async function savePipActions(pipPlanId, actions = []) {
    const rows = asArray(actions)
        .map(item => ({
            id: item?.id,
            pip_plan_id: pipPlanId,
            action_title: String(item?.action_title || '').trim(),
            action_detail: String(item?.action_detail || '').trim(),
            due_date: item?.due_date || null,
            progress_pct: toNumber(item?.progress_pct, 0),
            status: String(item?.status || 'todo'),
            checkpoint_note: String(item?.checkpoint_note || '').trim(),
        }))
        .filter(item => item.action_title);

    if (rows.length === 0) return [];

    const { data } = await execSupabase(
        'Save PIP actions',
        () => supabase
            .from('pip_actions')
            .upsert(rows, { onConflict: 'id' })
            .select(),
        { interactiveRetry: true, retries: 1 }
    );

    const untouched = state.pipActions.filter(item => item.pip_plan_id !== pipPlanId);
    state.pipActions = [...untouched, ...(data || [])];
    emit('data:pipActions', state.pipActions);
    return data || [];
}

export async function fetchKpiRecords(filters = {}) {
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

export async function saveKpiRecord(record) {
    const payload = {
        ...record,
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

export async function deleteKpiRecord(id) {
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

// ---- BULK SYNC ----
export async function syncAll() {
    const tasks = [
        fetchSettings(),
        fetchEmployees(),
        fetchConfig(),
        fetchKpiDefinitions(),
        fetchKpiRecords(),
        fetchKpiWeightProfiles(),
        fetchKpiWeightItems(),
        fetchEmployeePerformanceScores(),
        fetchProbationReviews(),
        fetchProbationQualitativeItems(),
        fetchPipPlans(),
        fetchPipActions(),
    ];

    if (state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'manager') {
        tasks.push(fetchActivityLogs());
    }

    await Promise.all(tasks);
    emit('data:synced');
}




