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
        const { data } = await execSupabase(
            'Fetch employees',
            () => supabase.from('employees').select('*'),
            { retries: 1 }
        );

        const db = {};
        (data || []).forEach(row => {
            db[row.employee_id] = {
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
                percentage: row.percentage || 0,
                scores: row.scores || [],
                self_scores: row.self_scores || [],
                self_percentage: row.self_percentage || 0,
                self_date: row.self_date || '',
                history: row.history || [],
                training_history: row.training_history || [],
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
        });

        state.db = db;
        emit('data:employees', db);
        return db;
    } catch (error) {
        debugError('Fetch employees error:', error);
        return;
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
    return data;
}

export async function deleteKpiRecord(id) {
    await execSupabase(
        `Delete KPI record "${id}"`,
        () => supabase.from('kpi_records').delete().eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );
    state.kpiRecords = state.kpiRecords.filter(r => r.id !== id);
    emit('data:kpiRecords', state.kpiRecords);
}

// ---- BULK SYNC ----
export async function syncAll() {
    const tasks = [
        fetchSettings(),
        fetchEmployees(),
        fetchConfig(),
        fetchKpiDefinitions(),
        fetchKpiRecords(),
    ];

    if (state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'manager') {
        tasks.push(fetchActivityLogs());
    }

    await Promise.all(tasks);
    emit('data:synced');
}
