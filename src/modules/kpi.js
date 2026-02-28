// ==================================================
// KPI MODULE — KPI Input & Management
// ==================================================

import { state, emit } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, formatPeriod, formatNumber, debugError, formatDateTime } from '../lib/utils.js';
import { saveKpiDefinition, deleteKpiDefinition, saveKpiRecord, deleteKpiRecord, fetchKpiRecords, logActivity } from './data.js';
import * as notify from '../lib/notify.js';
import { getFilteredEmployeeIds } from '../lib/reportFilters.js';
import { requireRecentAuth } from './auth.js';

// ---- RENDER KPI SETTINGS TAB ----
export function renderKpiManager() {
    renderKpiDefinitions();
    renderKpiTargetConfig();
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

    // Group by category (which we now treat as Position)
    const groups = {};
    defs.forEach(kpi => {
        const cat = kpi.category || 'General';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(kpi);
    });

    Object.keys(groups).sort().forEach(cat => {
        let html = `<div class="mb-3"><h6 class="fw-bold text-uppercase small text-primary mb-2"><i class="bi bi-briefcase-fill me-1"></i>${escapeHTML(cat)}</h6>`;

        groups[cat].forEach(kpi => {
            html += `
        <div class="d-flex justify-content-between align-items-center bg-white border rounded p-2 mb-2">
          <div>
            <span class="fw-bold">${escapeHTML(kpi.name)}</span>
            <span class="text-muted small ms-2">${escapeHTML(kpi.description || '')}</span>
            <span class="badge bg-light text-dark border ms-2">Target: ${kpi.target ? formatNumber(kpi.target) : '-'} ${escapeHTML(kpi.unit || '')}</span>
          </div>
          ${isAdmin ? `<div class="btn-group btn-group-sm">
            <button class="btn btn-outline-info" onclick="window.__app.copyKpiDef('${escapeInlineArg(kpi.id)}')" title="Copy KPI"><i class="bi bi-files"></i></button>
            <button class="btn btn-outline-primary" onclick="window.__app.editKpiDef('${escapeInlineArg(kpi.id)}')" title="Edit KPI"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger" onclick="window.__app.removeKpiDef('${escapeInlineArg(kpi.id)}')" title="Delete KPI"><i class="bi bi-trash"></i></button>
          </div>` : ''}
        </div>`;
        });

        html += '</div>';
        container.innerHTML += html;
    });
}

// ---- KPI TARGET ASSIGNMENT FORM (Settings) ----
function renderKpiTargetConfig() {
    const empSelect = document.getElementById('kpi-employee-select');
    if (!empSelect) return;

    empSelect.innerHTML = '<option value="">-- Select Employee --</option>';
    const { currentUser, db } = state;

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

    const defSelect = document.getElementById('kpi-def-category');
    if (defSelect) {
        const currentVal = defSelect.value;
        defSelect.innerHTML = '<option value="">-- Apply to Position (Global if blank) --</option>';
        const allPositions = new Set();
        if (state.appConfig) Object.keys(state.appConfig).forEach(pos => allPositions.add(pos));
        try {
            const deptMap = JSON.parse(state.appSettings?.dept_positions || '{}');
            Object.values(deptMap).forEach(positions => positions.forEach(pos => allPositions.add(pos)));
        } catch { /* ignore */ }

        [...allPositions].sort().forEach(pos => {
            defSelect.innerHTML += `<option value="${escapeHTML(pos)}">${escapeHTML(pos)}</option>`;
        });
        if (currentVal) defSelect.value = currentVal;
    }
}

export function onKpiEmployeeChange() {
    const empId = document.getElementById('kpi-employee-select')?.value;
    const listDiv = document.getElementById('kpi-target-list');
    const saveBtn = document.getElementById('kpi-target-save-btn');
    if (!listDiv || !saveBtn) return;

    if (!empId) {
        listDiv.innerHTML = '<div class="text-muted small fst-italic">Please select an employee...</div>';
        saveBtn.classList.add('hidden');
        return;
    }

    const { db, kpiConfig } = state;
    const emp = db[empId];
    if (!emp || !kpiConfig) return;

    const empPos = emp.position || '';
    const applicableKpis = kpiConfig.filter(kpi => {
        const pos = kpi.category || 'General';
        return pos === 'General' || pos === empPos;
    });

    if (applicableKpis.length === 0) {
        listDiv.innerHTML = '<div class="alert alert-warning py-2 small m-0">No KPIs found for this position. Please define them first.</div>';
        saveBtn.classList.add('hidden');
        return;
    }

    const targets = emp.kpi_targets || {};
    let html = '';

    applicableKpis.forEach(kpi => {
        const val = targets[kpi.id] !== undefined ? targets[kpi.id] : '';
        html += `
        <div class="d-flex justify-content-between align-items-center bg-white border rounded px-2 py-1">
            <div class="flex-grow-1">
                <div class="small fw-bold text-truncate" style="max-width: 250px;" title="${escapeHTML(kpi.name)}">${escapeHTML(kpi.name)}</div>
                <div class="text-muted" style="font-size: 10px;">Global Default: ${formatNumber(kpi.target)} ${escapeHTML(kpi.unit || '')}</div>
            </div>
            <div class="ms-2 d-flex gap-1 align-items-center" style="width: 140px;">
                <input type="number" class="form-control form-control-sm text-end target-custom-input"
                    data-kpi="${escapeHTML(kpi.id)}" value="${val}" placeholder="${kpi.target}">
                <span class="small text-muted" style="width: 40px;">${escapeHTML(kpi.unit || '')}</span>
            </div>
        </div>`;
    });

    listDiv.innerHTML = html;
    saveBtn.classList.remove('hidden');
}

export async function saveKpiTargets() {
    const empId = document.getElementById('kpi-employee-select')?.value;
    if (!empId) return;

    const inputs = document.querySelectorAll('.target-custom-input');
    const targets = {};

    inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val !== '') {
            targets[inp.dataset.kpi] = parseFloat(val);
        }
    });

    const emp = state.db[empId];
    if (emp) {
        emp.kpi_targets = targets;
        try {
            const { saveEmployee } = await import('./data.js');
            await notify.withLoading(async () => {
                await saveEmployee(emp);
            }, 'Saving KPI Targets', `Updating personalized targets for ${emp.name}...`);
            await logActivity({
                action: 'kpi.targets.update',
                entityType: 'employee',
                entityId: emp.id,
                details: {
                    employee_name: emp.name,
                    targets: Object.keys(targets).length,
                },
            });
            await notify.success('Employee personalized KPI targets saved successfully!');
        } catch (e) {
            await notify.error('Error saving custom targets: ' + e.message);
        }
    }
}

// ---- START KPI INPUT (from Assessment Tab) ----
export function startKpiInput() {
    const targetId = document.getElementById('inp-id')?.value?.trim();
    if (!targetId) { notify.error('Error: No Employee ID identified.'); return; }

    const rec = state.db[targetId];
    if (!rec) { notify.error('Employee Record not found in database.'); return; }

    document.getElementById('step-login').classList.add('hidden');
    document.getElementById('step-kpi-input').classList.remove('hidden');

    const nameLabel = document.getElementById('kpi-input-emp-name');
    if (nameLabel) nameLabel.innerText = rec.name;

    const periodInput = document.getElementById('kpi-period');
    if (periodInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        periodInput.max = `${yyyy}-${mm}`;
    }

    const kpiSelect = document.getElementById('kpi-metric-select');
    if (kpiSelect) {
        kpiSelect.innerHTML = '<option value="">-- Select KPI --</option>';
        document.getElementById('kpi-unit-label').innerText = '';
        document.getElementById('kpi-target-label').innerText = 'Target: -';

        const { kpiConfig } = state;
        const empPos = rec.position || '';
        const targets = rec.kpi_targets || {};

        const applicableKpis = (kpiConfig || []).filter(kpi => {
            const pos = kpi.category || 'General';
            return pos === 'General' || pos === empPos;
        });

        applicableKpis.forEach(kpi => {
            const effectiveTarget = targets[kpi.id] !== undefined ? targets[kpi.id] : kpi.target;
            kpiSelect.innerHTML += `<option value = "${escapeHTML(kpi.id)}" data-unit="${escapeHTML(kpi.unit || '')}" data-target="${effectiveTarget || ''}" > ${escapeHTML(kpi.name)}</option> `;
        });
    }

    // Auto-fetch small history inside assessment routing
    const histBody = document.getElementById('kpi-quick-history');
    if (histBody) {
        const empRecords = (state.kpiRecords || []).filter(r => r.employee_id === rec.id).slice(0, 5);
        histBody.innerHTML = '';
        if (empRecords.length === 0) {
            histBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted fst-italic py-2 small">No recent KPI achievements logged.</td></tr>';
        } else {
            empRecords.forEach(r => {
                const kpiDef = (state.kpiConfig || []).find(k => k.id === r.kpi_id);
                const t = targets[r.kpi_id] !== undefined ? targets[r.kpi_id] : (kpiDef?.target || 0);
                const ach = t > 0 ? Math.round((r.value / t) * 100) : 0;
                let bg = ach >= 100 ? 'bg-success' : ach >= 75 ? 'bg-primary' : ach >= 50 ? 'bg-warning text-dark' : 'bg-danger';
                histBody.innerHTML += `<tr>
                    <td class="small">${formatPeriod(r.period)}</td>
                    <td class="small text-truncate" style="max-width: 150px;" title="${escapeHTML(kpiDef?.name || '')}">${escapeHTML(kpiDef?.name || '-')}</td>
                    <td class="text-center small fw-bold">${formatNumber(r.value)}</td>
                    <td class="text-center small">${formatNumber(t)}</td>
                    <td class="text-center"><span class="badge ${bg} px-1" style="font-size: 9px;">${ach}%</span></td>
                </tr> `;
            });
        }
    }
}

// ---- KPI HISTORY TABLE (now in Records tab) ----
export async function renderKpiHistory() {
    const tbody = document.getElementById('kpi-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { currentUser, db, kpiRecords, kpiConfig } = state;

    // Populate employee filter dropdown
    const empFilter = document.getElementById('kpi-records-filter-emp');
    if (empFilter) {
        const selectedEmp = empFilter.value || '';
        empFilter.innerHTML = '<option value="">All Employees</option>';
        const keys = getFilteredEmployeeIds().sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''));
        keys.forEach(id => {
            empFilter.innerHTML += `<option value = "${escapeHTML(id)}" > ${escapeHTML(db[id].name)}</option> `;
        });
        if (selectedEmp && keys.includes(selectedEmp)) {
            empFilter.value = selectedEmp;
        }
    }

    const scopedIds = new Set(getFilteredEmployeeIds());
    let records = (kpiRecords || []).filter(r => scopedIds.has(r.employee_id));

    // Apply employee filter
    const filterEmp = document.getElementById('kpi-records-filter-emp')?.value;
    if (filterEmp) {
        records = records.filter(r => r.employee_id === filterEmp);
    }

    // Apply period filter
    const filterPeriod = document.getElementById('kpi-records-filter-period')?.value;
    if (filterPeriod) {
        records = records.filter(r => r.period === filterPeriod);
    }
    const globalPeriod = state.reportFilters?.period || '';
    if (globalPeriod) {
        records = records.filter(r => r.period === globalPeriod);
    }

    // Sort by most recent first
    records.sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''));

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">No KPI records found.</td></tr>';
        return;
    }

    records.forEach(record => {
        const emp = db[record.employee_id];
        const kpiDef = kpiConfig.find(k => k.id === record.kpi_id);
        const targets = emp?.kpi_targets || {};
        const target = targets[record.kpi_id] !== undefined ? targets[record.kpi_id] : (kpiDef?.target || 0);
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
        <td class="text-center fw-bold">${formatNumber(record.value)} ${escapeHTML(kpiDef?.unit || '')}</td>
        <td class="text-center">${formatNumber(target)} ${escapeHTML(kpiDef?.unit || '')}</td>
        <td class="text-center"><span class="badge ${achBadge}">${achievement}%</span></td>
        <td class="small text-muted">
          <div>${escapeHTML(state.db[record.updated_by || record.submitted_by]?.name || record.updated_by || record.submitted_by || '-')}</div>
          <div>${escapeHTML(formatDateTime(record.updated_at || record.submitted_at))}</div>
        </td>
        <td class="text-end">
          ${currentUser.role !== 'employee' ? `
            <div class="btn-group btn-group-sm" role="group">
                <button class="btn btn-outline-primary" onclick="window.__app.editKpiRecord('${escapeInlineArg(record.id)}')" title="Edit KPI Record"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger" onclick="window.__app.removeKpiRecord('${escapeInlineArg(record.id)}')" title="Delete KPI Record"><i class="bi bi-trash"></i></button>
            </div>
          ` : ''}
        </td>
      </tr> `;
    });
}

// ---- SAVE KPI RECORD ----
export async function submitKpiRecord() {
    const empId = document.getElementById('inp-id')?.value?.trim();
    const kpiId = document.getElementById('kpi-metric-select')?.value;
    const period = document.getElementById('kpi-period')?.value;
    const value = parseFloat(document.getElementById('kpi-value')?.value);
    const notes = document.getElementById('kpi-notes')?.value?.trim() || '';

    if (!empId || !kpiId || !period || isNaN(value)) {
        await notify.warn('Please fill in all required fields.');
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
        await notify.withLoading(async () => {
            await saveKpiRecord(record);
        }, 'Saving KPI Record', 'Submitting KPI achievement...');
        await logActivity({
            action: 'kpi.record.create',
            entityType: 'kpi_record',
            entityId: `${record.employee_id}:${record.kpi_id}:${record.period}`,
            details: {
                employee_id: record.employee_id,
                kpi_id: record.kpi_id,
                period: record.period,
                value: record.value,
            },
        });
        await notify.success('KPI record saved successfully!');

        // Clear form
        document.getElementById('kpi-value').value = '';
        document.getElementById('kpi-notes').value = '';
        document.getElementById('kpi-dividend').value = '';
        document.getElementById('kpi-divisor').value = '';

        await fetchKpiRecords();
        renderKpiHistory();
        startKpiInput(); // Refresh target history
    } catch (err) {
        await notify.error('Error saving KPI record: ' + err.message);
    }
}

// ---- KPI DEFINITION CRUD ----
export async function saveKpiDef() {
    if (!(await requireRecentAuth('saving KPI definition'))) return;
    const name = document.getElementById('kpi-def-name')?.value?.trim();
    const description = document.getElementById('kpi-def-desc')?.value?.trim();
    const category = document.getElementById('kpi-def-category')?.value?.trim();
    const target = parseFloat(document.getElementById('kpi-def-target')?.value) || 0;
    const unit = document.getElementById('kpi-def-unit')?.value?.trim() || '';

    if (!name) { await notify.warn('Please enter a KPI name.'); return; }

    const editingId = document.getElementById('kpi-def-edit-id')?.value;

    const kpi = {
        name, description, category: category || 'General', target, unit,
    };
    if (editingId) kpi.id = editingId;

    try {
        const saved = await notify.withLoading(async () => {
            return await saveKpiDefinition(kpi);
        }, 'Saving KPI Definition', 'Updating KPI definition...');
        await logActivity({
            action: editingId ? 'kpi.definition.update' : 'kpi.definition.create',
            entityType: 'kpi_definition',
            entityId: saved?.id || editingId || name,
            details: {
                name,
                category: category || 'General',
                target,
                unit,
            },
        });
        await notify.success('KPI Definition saved!');
        clearKpiDefForm();
        renderKpiManager();
    } catch (err) {
        await notify.error('Error saving KPI: ' + err.message);
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

export function copyKpiDef(id) {
    const kpi = state.kpiConfig.find(k => k.id === id);
    if (!kpi) return;

    document.getElementById('kpi-def-name').value = kpi.name + ' (Copy)';
    document.getElementById('kpi-def-desc').value = kpi.description || '';
    document.getElementById('kpi-def-category').value = kpi.category || 'General';
    document.getElementById('kpi-def-target').value = kpi.target || '';
    document.getElementById('kpi-def-unit').value = kpi.unit || '';

    // Explicitly reset the ID so it saves as a NEW definition
    document.getElementById('kpi-def-edit-id').value = '';

    document.getElementById('kpi-def-title').innerText = 'Copying KPI Definition: ' + kpi.name;

    // Scroll to the definition form
    const formEl = document.getElementById('kpi-def-title');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function removeKpiDef(id) {
    if (!(await requireRecentAuth('deleting KPI definition'))) return;
    if (!(await notify.confirm('Delete this KPI definition?', { confirmButtonText: 'Delete' }))) return;
    try {
        const kpi = state.kpiConfig.find(k => k.id === id);
        await notify.withLoading(async () => {
            await deleteKpiDefinition(id);
        }, 'Deleting KPI Definition', 'Removing KPI definition...');
        await logActivity({
            action: 'kpi.definition.delete',
            entityType: 'kpi_definition',
            entityId: id,
            details: {
                name: kpi?.name || id,
            },
        });
        renderKpiManager();
    } catch (err) {
        await notify.error('Error: ' + err.message);
    }
}

export async function removeKpiRecord(id) {
    if (!(await notify.confirm('Delete this KPI record?', { confirmButtonText: 'Delete' }))) return;
    try {
        await notify.withLoading(async () => {
            await deleteKpiRecord(id);
        }, 'Deleting KPI Record', 'Removing KPI record...');
        await logActivity({
            action: 'kpi.record.delete',
            entityType: 'kpi_record',
            entityId: id,
            details: {},
        });
        renderKpiHistory();
    } catch (err) {
        await notify.error('Error: ' + err.message);
    }
}

export async function editKpiRecord(id) {
    if (state.currentUser?.role === 'employee') { await notify.error('Access Denied'); return; }

    const record = state.kpiRecords.find(r => r.id === id);
    if (!record) { await notify.error('Record not found.'); return; }

    const emp = state.db[record.employee_id];
    const kpiDef = state.kpiConfig.find(k => k.id === record.kpi_id);
    const unit = kpiDef?.unit ? ` ${kpiDef.unit}` : '';

    const newValueRaw = await notify.input({
        title: 'Edit KPI Value',
        text: `Employee: ${emp?.name || record.employee_id}\nKPI: ${kpiDef?.name || 'Unknown KPI'}`,
        input: 'number',
        inputLabel: `Enter new value${unit}:`,
        inputValue: String(record.value ?? ''),
        confirmButtonText: 'Next',
        validate: value => {
            const parsed = parseFloat(value);
            if (value === '' || Number.isNaN(parsed)) return 'Invalid value. Please enter a numeric KPI value.';
            return null;
        },
    });
    if (newValueRaw === null) return;
    const newValue = parseFloat(newValueRaw);
    if (isNaN(newValue)) return;

    const newPeriod = await notify.input({
        title: 'Edit KPI Period',
        input: 'text',
        inputPlaceholder: 'YYYY-MM',
        inputValue: String(record.period || ''),
        confirmButtonText: 'Next',
        validate: value => {
            const periodVal = String(value || '').trim();
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodVal)) return 'Invalid period format. Use YYYY-MM.';
            return null;
        },
    });
    if (newPeriod === null) return;
    const period = newPeriod.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;

    const newNotes = await notify.input({
        title: 'Edit Notes (optional)',
        input: 'textarea',
        inputValue: String(record.notes || ''),
        confirmButtonText: 'Save',
    });
    if (newNotes === null) return;

    const updated = {
        ...record,
        value: newValue,
        period,
        notes: newNotes.trim(),
        submitted_by: state.currentUser.id,
        submitted_at: new Date().toISOString(),
    };

    try {
        await notify.withLoading(async () => {
            await saveKpiRecord(updated);
        }, 'Updating KPI Record', 'Saving KPI changes...');
        await logActivity({
            action: 'kpi.record.update',
            entityType: 'kpi_record',
            entityId: id,
            details: {
                employee_id: updated.employee_id,
                kpi_id: updated.kpi_id,
                period: updated.period,
                value: updated.value,
            },
        });
        await fetchKpiRecords();
        renderKpiHistory();
        await notify.success('KPI record updated successfully!');
    } catch (err) {
        await notify.error('Error updating KPI record: ' + err.message);
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
    const targetLabel = document.getElementById('kpi-target-label');

    const unit = opt?.dataset?.unit || '';
    if (unitLabel) unitLabel.innerText = unit;
    if (targetLabel) {
        const t = opt?.dataset?.target || '-';
        targetLabel.innerText = `Target: ${t} ${unit} `;
    }

    // Handle percentage inputs
    const divCol = document.getElementById('kpi-pct-dividend-col');
    const diviCol = document.getElementById('kpi-pct-divisor-col');
    const valInput = document.getElementById('kpi-value');

    if (unit === '%') {
        divCol?.classList.remove('d-none');
        diviCol?.classList.remove('d-none');
        if (valInput) valInput.readOnly = true;
    } else {
        divCol?.classList.add('d-none');
        diviCol?.classList.add('d-none');
        if (valInput) valInput.readOnly = false;

        // Reset specific inputs
        if (document.getElementById('kpi-dividend')) document.getElementById('kpi-dividend').value = '';
        if (document.getElementById('kpi-divisor')) document.getElementById('kpi-divisor').value = '';
    }
}

export function calcKpiPercentage() {
    const dividend = parseFloat(document.getElementById('kpi-dividend')?.value);
    const divisor = parseFloat(document.getElementById('kpi-divisor')?.value);
    const valInput = document.getElementById('kpi-value');

    if (valInput && !isNaN(dividend) && !isNaN(divisor) && divisor !== 0) {
        valInput.value = Number(((dividend / divisor) * 100).toFixed(2));
    } else if (valInput) {
        valInput.value = '';
    }
}

// ---- KPI JSON EXPORT / IMPORT ----
export function exportKpiJSON() {
    const sanitizedConfig = state.kpiConfig.map(k => {
        const { id, ...rest } = k;
        return rest; // export without DB IDs
    });
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sanitizedConfig, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'kpi_definitions.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export async function importKpiJSON(input) {
    if (state.currentUser?.role !== 'superadmin') { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('importing KPI definitions'))) return;
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const json = JSON.parse(e.target.result);
            if (!Array.isArray(json)) throw new Error("Expected an array of KPI definitions.");
            const errors = [];
            const normalized = [];
            json.forEach((kpi, idx) => {
                const rowNo = idx + 1;
                const name = String(kpi?.name || '').trim();
                if (!name) {
                    errors.push(`Row ${rowNo}: KPI name is required.`);
                    return;
                }
                const targetRaw = kpi?.target ?? 0;
                const targetNum = Number(targetRaw);
                if (Number.isNaN(targetNum)) {
                    errors.push(`Row ${rowNo}: target must be numeric.`);
                    return;
                }
                const { id, ...cleanKpi } = kpi;
                normalized.push({
                    ...cleanKpi,
                    name,
                    target: targetNum,
                    category: String(cleanKpi.category || 'General'),
                    unit: String(cleanKpi.unit || ''),
                });
            });

            if (errors.length > 0) {
                await notify.error(`Import validation failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more error(s)` : ''}`);
                return;
            }

            const previewRows = normalized.slice(0, 10).map(kpi => `
                <tr>
                    <td>${escapeHTML(kpi.name)}</td>
                    <td>${escapeHTML(kpi.category || 'General')}</td>
                    <td>${formatNumber(kpi.target)}</td>
                    <td>${escapeHTML(kpi.unit || '-')}</td>
                </tr>
            `).join('');

            const proceed = await notify.confirm('', {
                title: 'Confirm KPI Import',
                confirmButtonText: 'Import Now',
                html: `
                    <div class="text-start small">
                        <div class="mb-2"><strong>Total KPI rows:</strong> ${normalized.length}</div>
                        <div class="table-responsive" style="max-height:220px;">
                            <table class="table table-sm table-bordered mb-0">
                                <thead><tr><th>Name</th><th>Category</th><th>Target</th><th>Unit</th></tr></thead>
                                <tbody>${previewRows || '<tr><td colspan="4" class="text-center text-muted">No rows</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                `,
            });
            if (!proceed) return;

            await notify.withLoading(async () => {
                for (const kpi of normalized) {
                    await saveKpiDefinition(kpi);
                }
            }, 'Importing KPI Definitions', 'Applying validated KPI rows...');

            await logActivity({
                action: 'kpi.definition.import',
                entityType: 'kpi_definition',
                entityId: 'bulk',
                details: {
                    total: normalized.length,
                },
            });

            renderKpiManager();
            await notify.success(`Imported ${normalized.length} KPIs successfully!`);
        } catch (err) {
            await notify.error('Invalid JSON file. Error: ' + err.message);
            debugError(err);
        }
        input.value = '';
    };
    reader.readAsText(file);
}

