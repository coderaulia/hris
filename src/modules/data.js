// ==================================================
// DATA MODULE — Supabase CRUD operations
// ==================================================

import { supabase } from '../lib/supabase.js';
import { state, emit } from '../lib/store.js';
import { getDepartment, debugError } from '../lib/utils.js';
import * as notify from '../lib/notify.js';

const SETTINGS_CACHE_KEY = 'tna_app_settings_cache_v1';

const DEFAULT_PROBATION_WEIGHTS = Object.freeze({
    work: 50,
    managing: 30,
    attitude: 20,
});

const DEFAULT_PROBATION_ATTENDANCE_RULES = Object.freeze({
    monthly_cap: 20,
    events: {
        late_in: {
            label: 'Late Clock In',
            mode: 'tiered',
            tiers: [
                { min_qty: 15, points: 5 },
                { min_qty: 9, points: 3 },
                { min_qty: 3, points: 1 },
            ],
        },
        missed_clock_out: {
            label: 'Missed Clock Out',
            mode: 'tiered',
            tiers: [
                { min_qty: 15, points: 5 },
                { min_qty: 9, points: 3 },
                { min_qty: 3, points: 1 },
            ],
        },
        absent: {
            label: 'Absence',
            mode: 'tiered',
            tiers: [
                { min_qty: 5, points: 5 },
                { min_qty: 3, points: 3 },
                { min_qty: 1, points: 1 },
            ],
        },
        event_absent: {
            label: 'Event/Meeting Absence',
            mode: 'per_qty',
            per_qty: 1,
            max_points: 10,
        },
        discipline: {
            label: 'Discipline Violation',
            mode: 'per_qty',
            per_qty: 2,
            max_points: 10,
        },
        other: {
            label: 'Other',
            mode: 'per_qty',
            per_qty: 0,
            max_points: 20,
        },
    },
});

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

function randomHex(len) {
    let out = '';
    while (out.length < len) out += Math.floor(Math.random() * 16).toString(16);
    return out.slice(0, len);
}

function generateUuid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    // RFC 4122 v4-like fallback when crypto.randomUUID is unavailable.
    return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex(3)}-${randomHex(12)}`;
}

function isMissingRelationError(error) {
    const code = String(error?.code || '').toUpperCase();
    if (code === '42P01' || code === 'PGRST205') return true;

    const msg = [
        error?.message,
        error?.details,
        error?.hint,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (!msg) return false;
    if (/relation\s+\"?[\w.]+\"?\s+does not exist/.test(msg)) return true;
    if (/table\s+\"?[\w.]+\"?\s+does not exist/.test(msg)) return true;
    if (/could not find the table\s+'?[\w.]+'?\s+in the schema cache/.test(msg)) return true;
    return false;
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

function parseJsonObject(rawValue) {
    if (!rawValue) return {};
    if (typeof rawValue === 'object' && !Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue !== 'string') return {};

    const trimmed = rawValue.trim();
    if (!trimmed) return {};

    try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function sanitizeTier(rawTier) {
    const minQty = Math.max(0, Math.round(toNumber(rawTier?.min_qty, NaN)));
    const points = roundScore(Math.max(0, toNumber(rawTier?.points, NaN)));
    if (!Number.isFinite(minQty) || !Number.isFinite(points)) return null;
    return { min_qty: minQty, points };
}

function normalizeAttendanceEventRule(eventKey, rawRule, fallbackRule = {}) {
    const fallbackLabel = String(fallbackRule?.label || eventKey || 'Other').trim() || 'Other';
    const candidate = rawRule && typeof rawRule === 'object' && !Array.isArray(rawRule) ? rawRule : {};
    const modeRaw = String(candidate.mode || '').trim().toLowerCase();
    const hasTiers = Array.isArray(candidate.tiers);
    const mode = (modeRaw === 'tiered' || hasTiers) ? 'tiered' : 'per_qty';
    const label = String(candidate.label || fallbackLabel).trim() || fallbackLabel;

    if (mode === 'tiered') {
        const fallbackTiers = asArray(fallbackRule.tiers).map(sanitizeTier).filter(Boolean);
        const tiers = asArray(candidate.tiers).map(sanitizeTier).filter(Boolean);
        const source = tiers.length > 0 ? tiers : fallbackTiers;
        const dedup = {};
        source.forEach(item => {
            dedup[item.min_qty] = item.points;
        });
        const normalizedTiers = Object.entries(dedup)
            .map(([min_qty, points]) => ({ min_qty: Number(min_qty), points: roundScore(points) }))
            .sort((a, b) => b.min_qty - a.min_qty);

        if (normalizedTiers.length > 0) {
            return { label, mode: 'tiered', tiers: normalizedTiers };
        }
    }

    const fallbackPerQty = Math.max(0, toNumber(fallbackRule.per_qty, 0));
    const fallbackMax = Math.max(0, toNumber(fallbackRule.max_points, 20));
    return {
        label,
        mode: 'per_qty',
        per_qty: roundScore(Math.max(0, toNumber(candidate.per_qty, fallbackPerQty))),
        max_points: roundScore(Math.max(0, toNumber(candidate.max_points, fallbackMax))),
    };
}

function cloneDefaultAttendanceRules() {
    return JSON.parse(JSON.stringify(DEFAULT_PROBATION_ATTENDANCE_RULES));
}

function getRawProbationAttendanceRules() {
    const raw = state.appSettings?.probation_attendance_rules_json;
    if (!raw) return {};

    const parsed = parseJsonObject(raw);
    if (Object.keys(parsed).length > 0) return parsed;

    if (typeof raw === 'string' && raw.trim()) {
        debugError('Invalid probation_attendance_rules_json. Falling back to defaults.');
    }

    return {};
}

function normalizeProbationWeights(rawWork, rawManaging, rawAttitude) {
    let work = roundScore(clamp(toNumber(rawWork, DEFAULT_PROBATION_WEIGHTS.work), 0, 100));
    let managing = roundScore(clamp(toNumber(rawManaging, DEFAULT_PROBATION_WEIGHTS.managing), 0, 100));
    let attitude = roundScore(clamp(toNumber(rawAttitude, DEFAULT_PROBATION_WEIGHTS.attitude), 0, 100));

    const rawSum = work + managing + attitude;
    if (rawSum <= 0) {
        work = DEFAULT_PROBATION_WEIGHTS.work;
        managing = DEFAULT_PROBATION_WEIGHTS.managing;
        attitude = DEFAULT_PROBATION_WEIGHTS.attitude;
    } else if (Math.abs(rawSum - 100) > 0.01) {
        const scale = 100 / rawSum;
        work = roundScore(work * scale);
        managing = roundScore(managing * scale);
        attitude = roundScore(Math.max(0, 100 - work - managing));
    }

    return {
        work,
        managing,
        attitude,
        total: roundScore(work + managing + attitude),
    };
}

function computeProbationRuleConfig() {
    const weights = normalizeProbationWeights(
        state.appSettings?.probation_weight_work,
        state.appSettings?.probation_weight_managing,
        state.appSettings?.probation_weight_attitude
    );

    const defaultAttendance = cloneDefaultAttendanceRules();
    defaultAttendance.monthly_cap = roundScore(clamp(toNumber(defaultAttendance.monthly_cap, weights.attitude), 0, weights.attitude));

    const rawAttendance = getRawProbationAttendanceRules();
    const rawEvents = rawAttendance.events && typeof rawAttendance.events === 'object' && !Array.isArray(rawAttendance.events)
        ? rawAttendance.events
        : {};

    const eventKeys = [...new Set([
        ...Object.keys(defaultAttendance.events || {}),
        ...Object.keys(rawEvents),
    ])];

    const normalizedEvents = {};
    eventKeys.forEach(key => {
        normalizedEvents[key] = normalizeAttendanceEventRule(
            key,
            rawEvents[key],
            defaultAttendance.events?.[key] || {}
        );
    });

    const monthlyCap = roundScore(clamp(
        toNumber(rawAttendance.monthly_cap, defaultAttendance.monthly_cap),
        0,
        weights.attitude
    ));

    const passThreshold = roundScore(clamp(
        toNumber(state.appSettings?.probation_pass_threshold, 75),
        0,
        weights.total
    ));

    const managingResponsibility = roundScore(weights.managing * 0.4);
    const managingInnovation = roundScore(weights.managing * 0.4);
    const managingCommunication = roundScore(Math.max(0, weights.managing - managingResponsibility - managingInnovation));

    return {
        work_weight: weights.work,
        managing_weight: weights.managing,
        attitude_weight: weights.attitude,
        total_weight: weights.total,
        pass_threshold: passThreshold,
        attendance: {
            monthly_cap: monthlyCap,
            events: normalizedEvents,
        },
        managing_rubric: {
            responsibility_max: managingResponsibility,
            innovation_max: managingInnovation,
            communication_max: managingCommunication,
        },
    };
}

export function getProbationRuleConfig() {
    return computeProbationRuleConfig();
}

export function getDefaultProbationAttendanceRulesJson() {
    return JSON.stringify(DEFAULT_PROBATION_ATTENDANCE_RULES, null, 2);
}

export function getProbationAttendanceEventOptions(config = getProbationRuleConfig()) {
    const opts = {};
    Object.entries(config.attendance?.events || {}).forEach(([key, eventRule]) => {
        opts[key] = eventRule?.label || key;
    });
    return opts;
}

export function suggestProbationAttendanceDeduction(eventType, qty, config = getProbationRuleConfig()) {
    const key = String(eventType || '').trim() || 'other';
    const amount = Math.max(0, Math.round(toNumber(qty, 0)));
    const events = config.attendance?.events || {};
    const eventRule = events[key] || events.other;
    if (!eventRule) return 0;

    let points = 0;
    if (eventRule.mode === 'tiered' && Array.isArray(eventRule.tiers)) {
        const tier = eventRule.tiers.find(item => amount >= Number(item.min_qty || 0));
        points = toNumber(tier?.points, 0);
    } else {
        const perQty = Math.max(0, toNumber(eventRule.per_qty, 0));
        const maxPoints = Math.max(0, toNumber(eventRule.max_points, config.attendance?.monthly_cap || config.attitude_weight || 0));
        points = Math.min(maxPoints, amount * perQty);
    }

    return roundScore(clamp(points, 0, toNumber(config.attendance?.monthly_cap, config.attitude_weight)));
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

export async function fetchProbationMonthlyScores() {
    return fetchOptionalCollection({
        label: 'Fetch probation monthly scores',
        table: 'probation_monthly_scores',
        stateKey: 'probationMonthlyScores',
        eventName: 'data:probationMonthlyScores',
        orderBy: 'created_at',
        ascending: false,
    });
}

export async function fetchProbationAttendanceRecords() {
    return fetchOptionalCollection({
        label: 'Fetch probation attendance records',
        table: 'probation_attendance_records',
        stateKey: 'probationAttendanceRecords',
        eventName: 'data:probationAttendanceRecords',
        orderBy: 'event_date',
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

function parseIsoDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
}

function formatIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function addDaysUtc(date, days) {
    const dt = new Date(date.getTime());
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt;
}

function addMonthsClampedUtc(date, monthDelta) {
    const baseYear = date.getUTCFullYear();
    const baseMonth = date.getUTCMonth();
    const baseDay = date.getUTCDate();

    const monthIndex = baseMonth + monthDelta;
    const targetYear = baseYear + Math.floor(monthIndex / 12);
    const targetMonth = ((monthIndex % 12) + 12) % 12;
    const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

    return new Date(Date.UTC(targetYear, targetMonth, Math.min(baseDay, maxDay)));
}

function getPeriodBounds(period) {
    const [yyyy, mm] = String(period || '').split('-').map(Number);
    if (!yyyy || !mm) return null;
    const start = new Date(Date.UTC(yyyy, mm - 1, 1));
    const end = new Date(Date.UTC(yyyy, mm, 0));
    return { start, end };
}

function getPeriodsInRange(startDate, endDate) {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return [];
    if (startDate > endDate) return [];

    const periods = [];
    let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

    while (cursor <= last) {
        periods.push(toPeriod(cursor));
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    return periods;
}

function overlapDaysInclusive(startA, endA, startB, endB) {
    const start = startA > startB ? startA : startB;
    const end = endA < endB ? endA : endB;
    if (end < start) return 0;
    const millis = end.getTime() - start.getTime();
    return Math.floor(millis / 86400000) + 1;
}

function average(values = []) {
    const nums = values.filter(v => Number.isFinite(Number(v))).map(v => Number(v));
    if (nums.length === 0) return 0;
    return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function attendanceDeduction(entries = [], config = getProbationRuleConfig()) {
    const sum = roundScore(asArray(entries).reduce((total, row) => total + Math.max(0, toNumber(row?.deduction_points, 0)), 0));
    const cap = Math.max(0, toNumber(config.attendance?.monthly_cap, config.attitude_weight));
    return roundScore(clamp(sum, 0, cap));
}

function normalizeMonthlyScoreRow(row = {}, config = getProbationRuleConfig()) {
    const monthNoRaw = toNumber(row.month_no, 0);
    const monthNo = Number.isFinite(monthNoRaw) ? Math.max(1, Math.min(3, Math.round(monthNoRaw))) : 0;
    const workMax = Math.max(0, toNumber(config.work_weight, DEFAULT_PROBATION_WEIGHTS.work));
    const managingMax = Math.max(0, toNumber(config.managing_weight, DEFAULT_PROBATION_WEIGHTS.managing));
    const attitudeMax = Math.max(0, toNumber(config.attitude_weight, DEFAULT_PROBATION_WEIGHTS.attitude));
    const totalMax = Math.max(0, toNumber(config.total_weight, workMax + managingMax + attitudeMax));

    return {
        id: row.id || null,
        month_no: monthNo,
        period_start: row.period_start || '',
        period_end: row.period_end || '',
        work_performance_score: roundScore(clamp(toNumber(row.work_performance_score, 0), 0, workMax)),
        managing_task_score: roundScore(clamp(toNumber(row.managing_task_score, 0), 0, managingMax)),
        manager_qualitative_text: String(row.manager_qualitative_text || '').trim(),
        manager_note: String(row.manager_note || '').trim(),
        attitude_score: roundScore(clamp(toNumber(row.attitude_score, attitudeMax), 0, attitudeMax)),
        attendance_deduction: roundScore(clamp(toNumber(row.attendance_deduction, 0), 0, attitudeMax)),
        monthly_total: roundScore(clamp(toNumber(row.monthly_total, 0), 0, totalMax)),
    };
}

export function buildProbationWindows(joinDate, monthCount = 3) {
    const start = parseIsoDate(joinDate);
    if (!start) return [];

    const windows = [];
    for (let i = 0; i < monthCount; i++) {
        const periodStart = addMonthsClampedUtc(start, i);
        const periodEnd = addDaysUtc(addMonthsClampedUtc(start, i + 1), -1);
        windows.push({
            month_no: i + 1,
            start_date: formatIsoDate(periodStart),
            end_date: formatIsoDate(periodEnd),
            period_key: toPeriod(periodStart),
        });
    }

    return windows;
}

export function calculateProbationWorkPerformance(employeeId, startDate, endDate) {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    if (!start || !end || start > end) {
        return {
            score: 0,
            metric_count: 0,
            total_days: 0,
            contributions: [],
        };
    }

    const periods = getPeriodsInRange(start, end);
    const contributions = [];
    let weightedSum = 0;
    let totalWeightDays = 0;
    let metricCount = 0;

    periods.forEach(period => {
        const bounds = getPeriodBounds(period);
        if (!bounds) return;

        const overlapDays = overlapDaysInclusive(start, end, bounds.start, bounds.end);
        if (overlapDays <= 0) return;

        const periodRecords = asArray(state.kpiRecords).filter(r => r.employee_id === employeeId && r.period === period);
        const summary = calculateEmployeeWeightedKpiScore(employeeId, periodRecords);
        const score = toNumber(summary.score, 0);

        const hasRecords = periodRecords.length > 0;
        const summaryMetricCount = toNumber(summary.metric_count, 0);

        // Do not penalize pre-tracking days (e.g., join late in month with KPI tracking starting next month).
        if (hasRecords) {
            weightedSum += score * overlapDays;
            totalWeightDays += overlapDays;
            metricCount += summaryMetricCount;
        }

        contributions.push({
            period,
            overlap_days: overlapDays,
            score: roundScore(score),
            metric_count: summaryMetricCount,
            has_records: hasRecords,
            used_in_weight: hasRecords,
        });
    });

    const avgScore = totalWeightDays > 0 ? weightedSum / totalWeightDays : 0;
    return {
        score: roundScore(avgScore),
        metric_count: metricCount,
        total_days: totalWeightDays,
        contributions,
    };
}

export function buildProbationDraft(employeeId, monthlyScores = [], attendanceRecords = []) {
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
            monthly_rows: [],
        };
    }

    const windows = buildProbationWindows(employee.join_date, 3);
    const rules = getProbationRuleConfig();
    const scoreMap = {};
    asArray(monthlyScores).forEach(raw => {
        const row = normalizeMonthlyScoreRow(raw, rules);
        if (!row.month_no) return;
        scoreMap[row.month_no] = row;
    });

    const attendanceByMonth = {};
    asArray(attendanceRecords).forEach(entry => {
        const monthNo = Math.max(1, Math.min(3, Math.round(toNumber(entry?.month_no, 0))));
        if (!attendanceByMonth[monthNo]) attendanceByMonth[monthNo] = [];
        attendanceByMonth[monthNo].push(entry);
    });

    const monthlyRows = windows.map(win => {
        const existing = scoreMap[win.month_no] || {};
        const workInfo = calculateProbationWorkPerformance(employeeId, win.start_date, win.end_date);
        const workScore = roundScore(clamp((workInfo.score * rules.work_weight) / 100, 0, rules.work_weight));

        const managingScore = roundScore(clamp(toNumber(existing.managing_task_score, 0), 0, rules.managing_weight));
        const monthAttendance = attendanceByMonth[win.month_no] || [];
        const deduction = attendanceDeduction(monthAttendance, rules);
        const attitudeScore = roundScore(clamp(rules.attitude_weight - deduction, 0, rules.attitude_weight));
        const monthlyTotal = roundScore(clamp(workScore + managingScore + attitudeScore, 0, rules.total_weight));

        return {
            id: existing.id || null,
            month_no: win.month_no,
            period: win.period_key,
            period_start: win.start_date,
            period_end: win.end_date,
            work_performance_score: workScore,
            managing_task_score: managingScore,
            manager_qualitative_text: String(existing.manager_qualitative_text || '').trim(),
            manager_note: String(existing.manager_note || '').trim(),
            attendance_deduction: deduction,
            attitude_score: attitudeScore,
            monthly_total: monthlyTotal,
            metric_count: workInfo.metric_count,
            attendance_entry_count: monthAttendance.length,
            contributions: workInfo.contributions,
        };
    });

    const quantitativeScore = roundScore(average(monthlyRows.map(row => row.work_performance_score)));
    const qualitativeScore = roundScore(average(monthlyRows.map(row => row.managing_task_score + row.attitude_score)));
    const finalScore = roundScore(average(monthlyRows.map(row => row.monthly_total)));

    return {
        employee_id: employeeId,
        review_period_start: monthlyRows[0]?.period_start || employee.join_date,
        review_period_end: monthlyRows[monthlyRows.length - 1]?.period_end || employee.join_date,
        quantitative_score: quantitativeScore,
        qualitative_score: qualitativeScore,
        final_score: finalScore,
        periods: monthlyRows.map(row => row.period),
        metric_count: monthlyRows.reduce((sum, row) => sum + toNumber(row.metric_count, 0), 0),
        monthly_rows: monthlyRows,
    };
}

export async function saveProbationReview(review, qualitativeItems = []) {
    const draft = buildProbationDraft(review.employee_id);
    const quantitativeScore = review.quantitative_score !== undefined
        ? toNumber(review.quantitative_score, 0)
        : draft.quantitative_score;
    const qualitativeScore = review.qualitative_score !== undefined
        ? toNumber(review.qualitative_score, 0)
        : draft.qualitative_score;
    const finalScore = review.final_score !== undefined
        ? toNumber(review.final_score, 0)
        : roundScore(quantitativeScore + qualitativeScore);

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

export async function saveProbationMonthlyScores(reviewId, rows = []) {
    const rules = getProbationRuleConfig();
    const normalized = asArray(rows)
        .map(raw => {
            const monthNo = Math.max(1, Math.min(3, Math.round(toNumber(raw?.month_no, 0))));
            const existing = asArray(state.probationMonthlyScores).find(item =>
                item.probation_review_id === reviewId && Number(item.month_no) === monthNo
            );
            const rowId = raw?.id || existing?.id || generateUuid();
            return {
                id: rowId,
                probation_review_id: reviewId,
                month_no: monthNo,
                period_start: raw?.period_start || null,
                period_end: raw?.period_end || null,
                work_performance_score: roundScore(clamp(toNumber(raw?.work_performance_score, 0), 0, rules.work_weight)),
                managing_task_score: roundScore(clamp(toNumber(raw?.managing_task_score, 0), 0, rules.managing_weight)),
                manager_qualitative_text: String(raw?.manager_qualitative_text || '').trim(),
                manager_note: String(raw?.manager_note || '').trim(),
                attendance_deduction: roundScore(clamp(toNumber(raw?.attendance_deduction, 0), 0, rules.attitude_weight)),
                attitude_score: roundScore(clamp(toNumber(raw?.attitude_score, rules.attitude_weight), 0, rules.attitude_weight)),
                monthly_total: roundScore(clamp(toNumber(raw?.monthly_total, 0), 0, rules.total_weight)),
            };
        })
        .filter(row => row.probation_review_id && row.month_no >= 1 && row.month_no <= 3 && row.period_start && row.period_end);

    if (normalized.length === 0) return [];

    try {
        const { data } = await execSupabase(
            'Save probation monthly scores',
            () => supabase
                .from('probation_monthly_scores')
                .upsert(normalized, { onConflict: 'probation_review_id,month_no' })
                .select(),
            { interactiveRetry: true, retries: 1 }
        );

        const untouched = state.probationMonthlyScores.filter(item => item.probation_review_id !== reviewId);
        state.probationMonthlyScores = [...untouched, ...(data || [])];
        emit('data:probationMonthlyScores', state.probationMonthlyScores);
        return data || [];
    } catch (error) {
        if (!isMissingRelationError(error)) throw error;

        // Fallback for environments where migration has not been applied yet.
        // Keep values in local state so review/export still reflects manager inputs.
        const fallbackRows = normalized.map(row => ({
            ...row,
            id: row.id || `local-${reviewId}-${row.month_no}`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            _local_only: true,
        }));
        const untouched = state.probationMonthlyScores.filter(item => item.probation_review_id !== reviewId);
        state.probationMonthlyScores = [...untouched, ...fallbackRows];
        emit('data:probationMonthlyScores', state.probationMonthlyScores);

        debugError('probation_monthly_scores table missing. Run migration: 20260308_probation_monthly_attendance.sql');
        return fallbackRows;
    }
}

export async function saveProbationAttendanceRecord(record) {
    const rules = getProbationRuleConfig();
    const maxDeduction = Math.max(0, toNumber(rules.attendance?.monthly_cap, rules.attitude_weight));
    const payload = {
        id: record?.id || generateUuid(),
        probation_review_id: record?.probation_review_id,
        month_no: Math.max(1, Math.min(3, Math.round(toNumber(record?.month_no, 0)))),
        event_date: record?.event_date || null,
        event_type: String(record?.event_type || 'attendance').trim() || 'attendance',
        qty: toNumber(record?.qty, 1),
        deduction_points: roundScore(clamp(toNumber(record?.deduction_points, 0), 0, maxDeduction)),
        note: String(record?.note || '').trim(),
        entered_by: record?.entered_by || state.currentUser?.id || null,
    };

    try {
        const { data } = await execSupabase(
            'Save probation attendance record',
            () => supabase
                .from('probation_attendance_records')
                .upsert(payload, { onConflict: 'id' })
                .select()
                .single(),
            { interactiveRetry: true, retries: 1 }
        );

        const idx = state.probationAttendanceRecords.findIndex(item => item.id === data.id);
        if (idx >= 0) state.probationAttendanceRecords[idx] = data;
        else state.probationAttendanceRecords.push(data);
        emit('data:probationAttendanceRecords', state.probationAttendanceRecords);
        return data;
    } catch (error) {
        if (!isMissingRelationError(error)) throw error;

        // Local fallback if table is not available yet.
        const fallback = {
            ...payload,
            id: payload.id || `local-attendance-${Date.now()}`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            _local_only: true,
        };
        const idx = state.probationAttendanceRecords.findIndex(item => item.id === fallback.id);
        if (idx >= 0) state.probationAttendanceRecords[idx] = fallback;
        else state.probationAttendanceRecords.push(fallback);
        emit('data:probationAttendanceRecords', state.probationAttendanceRecords);

        debugError('probation_attendance_records table missing. Run migration: 20260308_probation_monthly_attendance.sql');
        return fallback;
    }
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
        fetchProbationMonthlyScores(),
        fetchProbationAttendanceRecords(),
        fetchPipPlans(),
        fetchPipActions(),
    ];

    if (state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'manager') {
        tasks.push(fetchActivityLogs());
    }

    await Promise.all(tasks);
    emit('data:synced');
}




