// ==================================================
// EMPLOYEES MODULE — Staff Directory Management
// (Superadmin only for add/edit/delete)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, getInputValue, getDepartment, safeCSV } from '../lib/utils.js';
import { saveEmployee, deleteEmployee as deleteEmpFromDB } from './data.js';

export function renderEmployeeManager() {
    const { appConfig, db, currentUser } = state;

    // 1. Position Dropdown — pull from both competency config and dept→positions mapping
    const posSelect = document.getElementById('emp-position');
    if (!posSelect) return;
    const currentPosVal = posSelect.value;
    posSelect.innerHTML = '<option value="">-- Select Position --</option>';

    // Collect all unique positions
    const allPositions = new Set();
    if (appConfig) Object.keys(appConfig).forEach(pos => allPositions.add(pos));

    // Also collect from dept_positions org setting
    const { appSettings } = state;
    try {
        const deptMap = JSON.parse(appSettings.dept_positions || '{}');
        Object.values(deptMap).forEach(positions => {
            positions.forEach(pos => allPositions.add(pos));
        });
    } catch { /* ignore */ }

    [...allPositions].sort().forEach(pos => {
        posSelect.innerHTML += `<option value="${escapeHTML(pos)}">${escapeHTML(pos)}</option>`;
    });
    if (currentPosVal && document.getElementById('emp-edit-mode').value === 'true') posSelect.value = currentPosVal;

    // 1b. Levels & Departments
    const loadDropdown = (selId, settingKey, defStr, prevVal) => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const opts = (appSettings[settingKey] || defStr).split(',').map(s => s.trim()).filter(Boolean);
        sel.innerHTML = `<option value="">-- Select --</option>`;
        opts.forEach(opt => {
            sel.innerHTML += `<option value="${escapeHTML(opt)}">${escapeHTML(opt)}</option>`;
        });
        if (prevVal) sel.value = prevVal;
    };

    loadDropdown('emp-seniority', 'levels', 'Junior, Intermediate, Senior, Lead, Manager, Director', document.getElementById('emp-seniority')?.value);
    loadDropdown('emp-department', 'departments', 'Human Resources, Finance, IT, Operations, Marketing, Sales', document.getElementById('emp-department')?.value);

    // 2. Manager Dropdown
    const mgrSelect = document.getElementById('emp-manager-id');
    if (!mgrSelect) return;
    const currentMgrVal = mgrSelect.value;
    mgrSelect.innerHTML = '<option value="">-- Direct to Director --</option>';

    const sortedIds = Object.keys(db).sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''));

    sortedIds.forEach(id => {
        const rec = db[id];
        if (rec.seniority && (rec.seniority.includes('Manager') || rec.seniority.includes('Lead'))) {
            mgrSelect.innerHTML += `<option value="${escapeHTML(rec.id)}">${escapeHTML(rec.name)} (${escapeHTML(rec.position)})</option>`;
        }
    });
    if (currentMgrVal) mgrSelect.value = currentMgrVal;

    // 3. Show/hide form based on role
    const formPanel = document.getElementById('emp-form-panel');
    if (formPanel) {
        formPanel.style.display = isAdmin() ? 'block' : 'none';
    }

    // 4. Render Table
    const tbody = document.getElementById('employee-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    document.getElementById('emp-count-badge').innerText = sortedIds.length + ' Staff';

    sortedIds.forEach(id => {
        const rec = db[id];
        const statusBadge = rec.percentage && rec.percentage > 0
            ? '<span class="badge bg-success">Assessed</span>'
            : '<span class="badge bg-secondary">Pending</span>';

        let roleBadge = '';
        if (rec.role === 'superadmin') roleBadge = '<span class="badge bg-danger ms-1">Admin</span>';
        else if (rec.role === 'manager') roleBadge = '<span class="badge bg-warning text-dark ms-1">Mgr</span>';

        const isMgr = rec.seniority && (rec.seniority.includes('Manager') || rec.seniority.includes('Lead'));
        const mgrIcon = isMgr ? '<i class="bi bi-star-fill text-warning me-1"></i>' : '';

        const actions = isAdmin() ? `
      <button class="btn btn-sm btn-outline-primary border-0" onclick="window.__app.loadEmployeeForEdit('${escapeInlineArg(rec.id)}')"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-danger border-0" onclick="window.__app.deleteEmployeeData('${escapeInlineArg(rec.id)}')"><i class="bi bi-trash"></i></button>
    ` : '';

        tbody.innerHTML += `
      <tr>
        <td class="font-monospace small">${escapeHTML(rec.id)}</td>
        <td class="fw-bold">${mgrIcon}${escapeHTML(rec.name)}${roleBadge}</td>
        <td>
          <div class="small">${escapeHTML(rec.position)}</div>
          <div class="text-muted" style="font-size:10px;">${escapeHTML(rec.seniority)} &middot; ${escapeHTML(rec.department)}</div>
        </td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-end">${actions}</td>
      </tr>`;
    });
}

export async function saveEmployeeData() {
    if (!isAdmin()) { alert('Access Denied. Superadmin only.'); return; }

    const id = document.getElementById('emp-id').value.trim();
    const name = document.getElementById('emp-name').value.trim();
    const pos = document.getElementById('emp-position').value;
    const seniority = document.getElementById('emp-seniority').value;
    const department = document.getElementById('emp-department')?.value || getDepartment(pos);
    const joinDate = document.getElementById('emp-join').value;
    const isEdit = document.getElementById('emp-edit-mode').value === 'true';
    const managerId = document.getElementById('emp-manager-id').value;
    const authEmail = document.getElementById('emp-auth-email')?.value?.trim() || '';
    const role = document.getElementById('emp-role')?.value || 'employee';

    if (!id || !name || !pos || !joinDate) {
        alert('Please fill in ID, Name, Position, and Join Date.');
        return;
    }

    if (!isEdit && state.db[id]) {
        alert('ID ' + id + ' already exists.');
        return;
    }

    let rec = isEdit ? { ...state.db[id] } : {
        id, date_created: '-', date_updated: '-', date_next: '-',
        percentage: 0, scores: [], training_history: [], history: [],
        self_scores: [], self_percentage: 0, self_date: '',
        kpi_targets: {}
    };

    rec.name = name;
    rec.position = pos;
    rec.seniority = seniority;
    rec.join_date = joinDate;
    rec.manager_id = managerId;
    rec.department = department; // Used manual selection or fallback
    rec.auth_email = authEmail;
    rec.role = role;

    state.db[id] = rec;
    await saveEmployee(rec);

    alert(isEdit ? 'Employee Updated!' : 'Employee Added!');
    resetEmployeeForm();
    renderEmployeeManager();
}

export function loadEmployeeForEdit(id) {
    if (!isAdmin()) return;
    const rec = state.db[id];
    if (!rec) return;

    document.getElementById('emp-id').value = rec.id;
    document.getElementById('emp-id').disabled = true;
    document.getElementById('emp-name').value = rec.name;
    document.getElementById('emp-join').value = getInputValue(rec.join_date);
    document.getElementById('emp-manager-id').value = rec.manager_id || '';

    // Set these values BEFORE calling renderEmployeeManager, so they are preserved
    document.getElementById('emp-position').value = rec.position || '';
    document.getElementById('emp-seniority').value = rec.seniority || '';

    const deptEl = document.getElementById('emp-department');
    if (deptEl) deptEl.value = rec.department || '';

    const emailEl = document.getElementById('emp-auth-email');
    if (emailEl) emailEl.value = rec.auth_email || '';

    const roleEl = document.getElementById('emp-role');
    if (roleEl) roleEl.value = rec.role || 'employee';

    renderEmployeeManager();
    document.getElementById('emp-position').value = rec.position;

    document.getElementById('emp-edit-mode').value = 'true';
    document.getElementById('emp-cancel-btn').classList.remove('hidden');
}

export function resetEmployeeForm() {
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-id').disabled = false;
    document.getElementById('emp-name').value = '';
    document.getElementById('emp-position').value = '';
    document.getElementById('emp-join').value = '';
    document.getElementById('emp-seniority').value = '';
    const deptEl = document.getElementById('emp-department');
    if (deptEl) deptEl.value = '';
    document.getElementById('emp-edit-mode').value = 'false';
    document.getElementById('emp-cancel-btn').classList.add('hidden');
    const emailEl = document.getElementById('emp-auth-email');
    if (emailEl) emailEl.value = '';
    const roleEl = document.getElementById('emp-role');
    if (roleEl) roleEl.value = 'employee';
}

export async function deleteEmployeeData(id) {
    if (!isAdmin()) { alert('Access Denied'); return; }
    if (confirm(`Delete ${state.db[id]?.name}? This removes all their data.`)) {
        await deleteEmpFromDB(id);
        renderEmployeeManager();
    }
}

export function exportEmployeeCSV() {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'ID,Name,Position,Seniority,Join_Date,Department,Manager_ID,Role,Email\n';

    Object.values(state.db).forEach(rec => {
        csvContent += [
            safeCSV(rec.id), safeCSV(rec.name), safeCSV(rec.position),
            safeCSV(rec.seniority), safeCSV(rec.join_date), safeCSV(rec.department),
            safeCSV(rec.manager_id), safeCSV(rec.role), safeCSV(rec.auth_email),
        ].join(',') + '\n';
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'employee_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function importEmployeeCSV(input) {
    if (!isAdmin()) { alert('Access Denied'); return; }
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const lines = e.target.result.split(/\r\n|\n/);
        let count = 0;
        let startRow = lines[0]?.toLowerCase().includes('id') ? 1 : 0;

        for (let i = startRow; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim());

            if (parts.length >= 2) {
                const id = parts[0];
                const existing = state.db[id] || {
                    id, percentage: 0, scores: [], history: [], training_history: [],
                    date_created: '-', date_updated: '-', date_next: '-',
                    self_scores: [], self_percentage: 0, self_date: '',
                    kpi_targets: {}
                };

                existing.name = parts[1];
                existing.position = parts[2] || '';
                existing.seniority = parts[3] || 'Junior';
                existing.join_date = parts[4] || '';
                existing.department = parts[5] || getDepartment(existing.position);
                existing.manager_id = parts[6] || '';
                existing.role = parts[7] || 'employee';
                existing.auth_email = parts[8] || '';

                state.db[id] = existing;
                await saveEmployee(existing);
                count++;
            }
        }

        renderEmployeeManager();
        alert(`Imported ${count} employees successfully!`);
        input.value = '';
    };
    reader.readAsText(file);
}
