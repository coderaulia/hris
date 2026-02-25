// ==================================================
// DATA MODULE — Supabase CRUD operations
// ==================================================

import { supabase } from '../lib/supabase.js';
import { state, emit } from '../lib/store.js';
import { getDepartment } from '../lib/utils.js';

// ---- APP SETTINGS ----
export async function fetchSettings() {
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) { console.error('Fetch settings error:', error); return {}; }

    const settings = {};
    (data || []).forEach(row => { settings[row.key] = row.value; });
    state.appSettings = settings;
    emit('data:settings', settings);
    return settings;
}

export async function saveSetting(key, value) {
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
    state.appSettings[key] = value;
    emit('data:settings', state.appSettings);
}

// ---- EMPLOYEES / DB ----
export async function fetchEmployees() {
    const { data, error } = await supabase.from('employees').select('*');
    if (error) { console.error('Fetch employees error:', error); return; }

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
        };
    });

    state.db = db;
    emit('data:employees', db);
    return db;
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
    };

    const { error } = await supabase
        .from('employees')
        .upsert(payload, { onConflict: 'employee_id' });

    if (error) { console.error('Save employee error:', error); throw error; }

    state.db[rec.id] = rec;
    emit('data:employees', state.db);
}

export async function deleteEmployee(id) {
    const { error } = await supabase
        .from('employees')
        .delete()
        .eq('employee_id', id);

    if (error) { console.error('Delete employee error:', error); throw error; }
    delete state.db[id];
    emit('data:employees', state.db);
}

// ---- CONFIG ----
export async function fetchConfig() {
    const { data, error } = await supabase.from('competency_config').select('*');
    if (error) { console.error('Fetch config error:', error); return; }

    const config = {};
    (data || []).forEach(row => {
        config[row.position_name] = { competencies: row.competencies || [] };
    });

    state.appConfig = config;
    emit('data:config', config);
    return config;
}

export async function saveConfig(posName, competencies) {
    const { error } = await supabase
        .from('competency_config')
        .upsert({ position_name: posName, competencies }, { onConflict: 'position_name' });
    if (error) throw error;
    state.appConfig[posName] = { competencies };
    emit('data:config', state.appConfig);
}

export async function deleteConfig(posName) {
    const { error } = await supabase
        .from('competency_config')
        .delete()
        .eq('position_name', posName);
    if (error) throw error;
    delete state.appConfig[posName];
    emit('data:config', state.appConfig);
}

// ---- KPI ----
export async function fetchKpiDefinitions() {
    const { data, error } = await supabase.from('kpi_definitions').select('*').order('category');
    if (error) { console.error('Fetch KPI defs error:', error); return []; }
    state.kpiConfig = data || [];
    emit('data:kpiConfig', state.kpiConfig);
    return state.kpiConfig;
}

export async function saveKpiDefinition(kpi) {
    const { data, error } = await supabase
        .from('kpi_definitions')
        .upsert(kpi, { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;

    const idx = state.kpiConfig.findIndex(k => k.id === data.id);
    if (idx >= 0) state.kpiConfig[idx] = data;
    else state.kpiConfig.push(data);
    emit('data:kpiConfig', state.kpiConfig);
    return data;
}

export async function deleteKpiDefinition(id) {
    const { error } = await supabase.from('kpi_definitions').delete().eq('id', id);
    if (error) throw error;
    state.kpiConfig = state.kpiConfig.filter(k => k.id !== id);
    emit('data:kpiConfig', state.kpiConfig);
}

export async function fetchKpiRecords(filters = {}) {
    let query = supabase.from('kpi_records').select('*');
    if (filters.employee_id) query = query.eq('employee_id', filters.employee_id);
    if (filters.period) query = query.eq('period', filters.period);
    const { data, error } = await query.order('period', { ascending: false });
    if (error) { console.error('Fetch KPI records error:', error); return []; }
    state.kpiRecords = data || [];
    emit('data:kpiRecords', state.kpiRecords);
    return state.kpiRecords;
}

export async function saveKpiRecord(record) {
    const { data, error } = await supabase
        .from('kpi_records')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;

    const idx = state.kpiRecords.findIndex(r => r.id === data.id);
    if (idx >= 0) state.kpiRecords[idx] = data;
    else state.kpiRecords.push(data);
    emit('data:kpiRecords', state.kpiRecords);
    return data;
}

export async function deleteKpiRecord(id) {
    const { error } = await supabase.from('kpi_records').delete().eq('id', id);
    if (error) throw error;
    state.kpiRecords = state.kpiRecords.filter(r => r.id !== id);
    emit('data:kpiRecords', state.kpiRecords);
}

// ---- BULK SYNC ----
export async function syncAll() {
    await Promise.all([
        fetchSettings(),
        fetchEmployees(),
        fetchConfig(),
        fetchKpiDefinitions(),
        fetchKpiRecords(),
    ]);
    emit('data:synced');
}
