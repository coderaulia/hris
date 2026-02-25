// ==================================================
// KPI MODULE — KPI Input & Management
// ==================================================

import { state, emit } from '../lib/store.js';
import { escapeHTML, formatPeriod } from '../lib/utils.js';
import { saveKpiDefinition, deleteKpiDefinition, saveKpiRecord, deleteKpiRecord, fetchKpiRecords } from './data.js';

// ---- RENDER KPI TAB ----
export function renderKpiManager() {
    renderKpiDefinitions();
    renderKpiInput();
    renderKpiHistory();
}

// ---- KPI DEFINITIONS (Admin only) ----
function renderKpiDefinitions() {
    const container = document.getElementById('kpi-definitions-list');
    if (!container) return;
    container.innerHTML = '';

    const isAdmin = state.currentUser?.role === 'superadmin';
    const defs = state.kpiConfig || [];

    if (defs.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3 fst-italic">No KPIs defined yet. Admin can add new KPIs above.</div>';
        return;
    }

    // Group by category
    const groups = {};
    defs.forEach(kpi => {
        const cat = kpi.category || 'General';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(kpi);
    });

    Object.keys(groups).sort().forEach(cat => {
        let html = `<div class="mb-3"><h6 class="fw-bold text-uppercase small text-muted mb-2"><i class="bi bi-tag-fill me-1"></i>${escapeHTML(cat)}</h6>`;

        groups[cat].forEach(kpi => {
            html += `
        <div class="d-flex justify-content-between align-items-center bg-white border rounded p-2 mb-2">
          <div>
            <span class="fw-bold">${escapeHTML(kpi.name)}</span>
            <span class="text-muted small ms-2">${escapeHTML(kpi.description || '')}</span>
            <span class="badge bg-light text-dark border ms-2">Target: ${kpi.target || '-'} ${escapeHTML(kpi.unit || '')}</span>
          </div>
          ${isAdmin ? `<div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="window.__app.editKpiDef('${kpi.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger" onclick="window.__app.removeKpiDef('${kpi.id}')"><i class="bi bi-trash"></i></button>
          </div>` : ''}
        </div>`;
        });

        html += '</div>';
        container.innerHTML += html;
    });
}

// ---- KPI INPUT FORM ----
function renderKpiInput() {
    const form = document.getElementById('kpi-input-section');
    if (!form) return;

    // Employee selector (admin/manager only)
    const empSelect = document.getElementById('kpi-employee-select');
    if (empSelect) {
        empSelect.innerHTML = '<option value="">-- Select Employee --</option>';
        const { currentUser, db } = state;

        if (currentUser.role === 'employee') {
            empSelect.innerHTML = `<option value="${currentUser.id}" selected>${escapeHTML(db[currentUser.id]?.name || currentUser.name)}</option>`;
            empSelect.disabled = true;
        } else {
            let keys = Object.keys(db);
            if (currentUser.role === 'manager') {
                const mgrRec = db[currentUser.id];
                if (mgrRec?.department) {
                    keys = keys.filter(id => db[id].department === mgrRec.department);
                }
            }
            keys.sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''));
            keys.forEach(id => {
                empSelect.innerHTML += `<option value="${escapeHTML(id)}">${escapeHTML(db[id].name)} (${escapeHTML(db[id].position)})</option>`;
            });
            empSelect.disabled = false;
        }
    }

    // KPI selector
    const kpiSelect = document.getElementById('kpi-metric-select');
    if (kpiSelect) {
        kpiSelect.innerHTML = '<option value="">-- Select KPI --</option>';
        (state.kpiConfig || []).forEach(kpi => {
            kpiSelect.innerHTML += `<option value="${kpi.id}" data-unit="${escapeHTML(kpi.unit || '')}" data-target="${kpi.target || ''}">${escapeHTML(kpi.name)} (${escapeHTML(kpi.category || 'General')})</option>`;
        });
    }
}

// ---- KPI HISTORY TABLE ----
async function renderKpiHistory() {
    const tbody = document.getElementById('kpi-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { currentUser, db, kpiRecords, kpiConfig } = state;

    let records = kpiRecords || [];

    // Filter by role
    if (currentUser.role === 'employee') {
        records = records.filter(r => r.employee_id === currentUser.id);
    } else if (currentUser.role === 'manager') {
        const mgrRec = db[currentUser.id];
        if (mgrRec?.department) {
            const deptIds = Object.keys(db).filter(id => db[id].department === mgrRec.department);
            records = records.filter(r => deptIds.includes(r.employee_id));
        }
    }

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No KPI records yet.</td></tr>';
        return;
    }

    records.forEach(record => {
        const emp = db[record.employee_id];
        const kpiDef = kpiConfig.find(k => k.id === record.kpi_id);
        const target = kpiDef?.target || 0;
        const achievement = target > 0 ? Math.round((record.value / target) * 100) : 0;

        let achBadge = 'bg-secondary';
        if (achievement >= 100) achBadge = 'bg-success';
        else if (achievement >= 75) achBadge = 'bg-primary';
        else if (achievement >= 50) achBadge = 'bg-warning text-dark';
        else achBadge = 'bg-danger';

        tbody.innerHTML += `
      <tr>
        <td class="fw-bold">${escapeHTML(emp?.name || record.employee_id)}</td>
        <td>${escapeHTML(kpiDef?.name || 'Unknown KPI')}</td>
        <td class="text-center">${formatPeriod(record.period)}</td>
        <td class="text-center fw-bold">${record.value} ${escapeHTML(kpiDef?.unit || '')}</td>
        <td class="text-center">${target} ${escapeHTML(kpiDef?.unit || '')}</td>
        <td class="text-center"><span class="badge ${achBadge}">${achievement}%</span></td>
        <td class="text-end">
          ${currentUser.role !== 'employee' ? `<button class="btn btn-sm btn-outline-danger" onclick="window.__app.removeKpiRecord('${record.id}')"><i class="bi bi-trash"></i></button>` : ''}
        </td>
      </tr>`;
    });
}

// ---- SAVE KPI RECORD ----
export async function submitKpiRecord() {
    const empId = document.getElementById('kpi-employee-select')?.value;
    const kpiId = document.getElementById('kpi-metric-select')?.value;
    const period = document.getElementById('kpi-period')?.value;
    const value = parseFloat(document.getElementById('kpi-value')?.value);
    const notes = document.getElementById('kpi-notes')?.value?.trim() || '';

    if (!empId || !kpiId || !period || isNaN(value)) {
        alert('Please fill in all required fields.');
        return;
    }

    const record = {
        employee_id: empId,
        kpi_id: kpiId,
        period: period,
        value: value,
        notes: notes,
        submitted_by: state.currentUser.id,
        submitted_at: new Date().toISOString(),
    };

    try {
        await saveKpiRecord(record);
        alert('KPI record saved successfully!');

        // Clear form
        document.getElementById('kpi-value').value = '';
        document.getElementById('kpi-notes').value = '';

        await fetchKpiRecords();
        renderKpiHistory();
    } catch (err) {
        alert('Error saving KPI record: ' + err.message);
    }
}

// ---- KPI DEFINITION CRUD ----
export async function saveKpiDef() {
    const name = document.getElementById('kpi-def-name')?.value?.trim();
    const description = document.getElementById('kpi-def-desc')?.value?.trim();
    const category = document.getElementById('kpi-def-category')?.value?.trim();
    const target = parseFloat(document.getElementById('kpi-def-target')?.value) || 0;
    const unit = document.getElementById('kpi-def-unit')?.value?.trim() || '';

    if (!name) { alert('Please enter a KPI name.'); return; }

    const editingId = document.getElementById('kpi-def-edit-id')?.value;

    const kpi = {
        name, description, category: category || 'General', target, unit,
    };
    if (editingId) kpi.id = editingId;

    try {
        await saveKpiDefinition(kpi);
        alert('KPI Definition saved!');
        clearKpiDefForm();
        renderKpiManager();
    } catch (err) {
        alert('Error saving KPI: ' + err.message);
    }
}

export function editKpiDef(id) {
    const kpi = state.kpiConfig.find(k => k.id === id);
    if (!kpi) return;

    document.getElementById('kpi-def-name').value = kpi.name;
    document.getElementById('kpi-def-desc').value = kpi.description || '';
    document.getElementById('kpi-def-category').value = kpi.category || 'General';
    document.getElementById('kpi-def-target').value = kpi.target || '';
    document.getElementById('kpi-def-unit').value = kpi.unit || '';
    document.getElementById('kpi-def-edit-id').value = kpi.id;

    document.getElementById('kpi-def-title').innerText = 'Edit KPI Definition';
}

export async function removeKpiDef(id) {
    if (!confirm('Delete this KPI definition?')) return;
    try {
        await deleteKpiDefinition(id);
        renderKpiManager();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

export async function removeKpiRecord(id) {
    if (!confirm('Delete this KPI record?')) return;
    try {
        await deleteKpiRecord(id);
        renderKpiHistory();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

export function clearKpiDefForm() {
    document.getElementById('kpi-def-name').value = '';
    document.getElementById('kpi-def-desc').value = '';
    document.getElementById('kpi-def-category').value = '';
    document.getElementById('kpi-def-target').value = '';
    document.getElementById('kpi-def-unit').value = '';
    document.getElementById('kpi-def-edit-id').value = '';
    document.getElementById('kpi-def-title').innerText = 'Add New KPI Definition';
}

export function onKpiMetricChange() {
    const sel = document.getElementById('kpi-metric-select');
    const opt = sel.options[sel.selectedIndex];
    const unitLabel = document.getElementById('kpi-unit-label');
    if (unitLabel) unitLabel.innerText = opt?.dataset?.unit || '';
}
