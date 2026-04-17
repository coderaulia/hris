import { supabase } from '../../lib/supabase.js';
import { state, emit } from '../../lib/store.js';
import { hydrateEmployeeRecord } from '../../lib/employee-records.js';
import { getDepartment, debugError } from '../../lib/utils.js';
import * as notify from '../../lib/notify.js';

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
    return hydrateEmployeeRecord({
        id: row.employee_id,
        name: row.name,
        legal_name: row.legal_name || '',
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
        place_of_birth: row.place_of_birth || '',
        date_of_birth: row.date_of_birth || '',
        address: row.address || '',
        nik_number: row.nik_number || '',
        job_level: row.job_level || '',
        signature_image_url: row.signature_image_url || '',
        active_sp_level: row.active_sp_level || '',
        active_sp_until: row.active_sp_until || '',
        active_sp_reason: row.active_sp_reason || '',
        assessment_updated_by: row.assessment_updated_by || '',
        assessment_updated_at: row.assessment_updated_at || '',
        self_assessment_updated_by: row.self_assessment_updated_by || '',
        self_assessment_updated_at: row.self_assessment_updated_at || '',
    });
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

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function average(values = []) {
    const nums = values.filter(v => Number.isFinite(Number(v))).map(v => Number(v));
    if (nums.length === 0) return 0;
    return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

async function fetchOptionalCollection({
    label,
    table,
    selectColumns = 'id',
    stateKey,
    eventName,
    orderBy = 'created_at',
    ascending = false,
}) {
    try {
        const query = supabase.from(table).select(selectColumns).order(orderBy, { ascending });
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

export {
    supabase,
    state,
    emit,
    getDepartment,
    debugError,
    DEFAULT_PROBATION_WEIGHTS,
    DEFAULT_PROBATION_ATTENDANCE_RULES,
    writeSettingsCache,
    readSettingsCache,
    asArray,
    toNumber,
    toDateLabel,
    generateUuid,
    isMissingRelationError,
    normalizeScoreRows,
    mapLegacyEmployeeRow,
    isPeriodKey,
    sanitizeTargetMap,
    execSupabase,
    roundScore,
    parseJsonObject,
    sanitizeTier,
    clamp,
    average,
    fetchOptionalCollection,
};
