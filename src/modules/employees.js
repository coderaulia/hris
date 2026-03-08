// ==================================================
// EMPLOYEES MODULE — Staff Directory Management
// (Superadmin only for add/edit/delete)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, getInputValue, getDepartment, safeCSV } from '../lib/utils.js';
import { saveEmployee, deleteEmployee as deleteEmpFromDB, logActivity } from './data.js';
import { requireRecentAuth } from './auth.js';
import * as notify from '../lib/notify.js';

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
        if ((rec.seniority && (rec.seniority.includes('Manager') || rec.seniority.includes('Lead') || rec.seniority.includes('Director'))) || rec.role === 'director') {
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
        else if (rec.role === 'director') roleBadge = '<span class="badge bg-info text-dark ms-1">Dir</span>';

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
    if (!isAdmin()) { await notify.error('Access Denied. Superadmin only.'); return; }

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
        await notify.warn('Please fill in ID, Name, Position, and Join Date.');
        return;
    }

    if (!isEdit && state.db[id]) {
        await notify.warn('ID ' + id + ' already exists.');
        return;
    }

    let rec = isEdit ? { ...state.db[id] } : {
        id, date_created: '-', date_updated: '-', date_next: '-',
        percentage: 0, scores: [], training_history: [], history: [],
        self_scores: [], self_percentage: 0, self_date: '',
        kpi_targets: {},
        must_change_password: false,
    };
    const oldSnapshot = isEdit ? { ...rec } : null;

    rec.name = name;
    rec.position = pos;
    rec.seniority = seniority;
    rec.join_date = joinDate;
    rec.manager_id = managerId;
    rec.department = department; // Used manual selection or fallback
    rec.auth_email = authEmail;
    rec.role = role;

    await notify.withLoading(async () => {
        state.db[id] = rec;
        await saveEmployee(rec);
    }, isEdit ? 'Updating Employee' : 'Adding Employee', 'Saving employee data...');

    await logActivity({
        action: isEdit ? 'employee.update' : 'employee.create',
        entityType: 'employee',
        entityId: rec.id,
        details: {
            employee_name: rec.name,
            old: oldSnapshot ? {
                role: oldSnapshot.role,
                department: oldSnapshot.department,
                manager_id: oldSnapshot.manager_id,
            } : null,
            next: {
                role: rec.role,
                department: rec.department,
                manager_id: rec.manager_id,
            },
        },
    });

    await notify.success(isEdit ? 'Employee Updated!' : 'Employee Added!');
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
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('deleting employee data'))) return;
    if (await notify.confirm(`Delete ${state.db[id]?.name}? This removes all their data.`, { confirmButtonText: 'Delete' })) {
        const deleted = state.db[id];
        await notify.withLoading(async () => {
            await deleteEmpFromDB(id);
        }, 'Deleting Employee', 'Removing employee record...');
        await logActivity({
            action: 'employee.delete',
            entityType: 'employee',
            entityId: id,
            details: {
                employee_name: deleted?.name || id,
                role: deleted?.role || '-',
                department: deleted?.department || '-',
            },
        });
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
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('importing employee data'))) return;
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const text = String(e.target.result || '');
            const lines = text.split(/\r\n|\n/);
            const startRow = lines[0]?.toLowerCase().includes('id') ? 1 : 0;
            const validRoles = new Set(['employee', 'manager', 'director', 'superadmin']);
            const ops = [];
            const errors = [];
            const warnings = [];
            const seen = new Set();

            for (let i = startRow; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const rowNo = i + 1;
                const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim());
                const id = parts[0];
                const name = parts[1];
                if (!id || !name) {
                    errors.push(`Row ${rowNo}: ID and Name are required.`);
                    continue;
                }
                if (seen.has(id)) {
                    warnings.push(`Row ${rowNo}: Duplicate ID "${id}" in import file (latest row will be used).`);
                }
                seen.add(id);

                const role = (parts[7] || 'employee').toLowerCase();
                if (!validRoles.has(role)) {
                    errors.push(`Row ${rowNo}: Invalid role "${parts[7]}".`);
                    continue;
                }

                const authEmail = parts[8] || '';
                if (authEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
                    errors.push(`Row ${rowNo}: Invalid email "${authEmail}".`);
                    continue;
                }

                const existing = state.db[id] ? { ...state.db[id] } : {
                    id, percentage: 0, scores: [], history: [], training_history: [],
                    date_created: '-', date_updated: '-', date_next: '-',
                    self_scores: [], self_percentage: 0, self_date: '',
                    kpi_targets: {},
                    must_change_password: false,
                };

                existing.name = name;
                existing.position = parts[2] || '';
                existing.seniority = parts[3] || 'Junior';
                existing.join_date = parts[4] || '';
                existing.department = parts[5] || getDepartment(existing.position);
                existing.manager_id = parts[6] || '';
                existing.role = role;
                existing.auth_email = authEmail;

                ops.push({
                    id,
                    rec: existing,
                    isNew: !state.db[id],
                });
            }

            if (errors.length > 0) {
                await notify.error(`Import validation failed:\n${errors.slice(0, 6).join('\n')}${errors.length > 6 ? `\n...and ${errors.length - 6} more error(s)` : ''}`);
                input.value = '';
                return;
            }

            const knownIds = new Set([...Object.keys(state.db), ...ops.map(x => x.id)]);
            ops.forEach(op => {
                if (op.rec.manager_id && !knownIds.has(op.rec.manager_id)) {
                    warnings.push(`Employee ${op.id}: manager_id "${op.rec.manager_id}" not found.`);
                }
            });

            const inserts = ops.filter(x => x.isNew).length;
            const updates = ops.length - inserts;
            const previewRows = ops.slice(0, 10).map(op => `
                <tr>
                    <td>${escapeHTML(op.rec.id)}</td>
                    <td>${escapeHTML(op.rec.name)}</td>
                    <td>${escapeHTML(op.rec.department || '-')}</td>
                    <td>${escapeHTML(op.rec.role || 'employee')}</td>
                    <td><span class="badge ${op.isNew ? 'bg-success' : 'bg-warning text-dark'}">${op.isNew ? 'New' : 'Update'}</span></td>
                </tr>
            `).join('');

            const proceed = await notify.confirm('', {
                title: 'Confirm Employee Import',
                confirmButtonText: 'Import Now',
                cancelButtonText: 'Cancel',
                html: `
                    <div class="text-start small">
                        <div class="mb-2"><strong>Total rows:</strong> ${ops.length}</div>
                        <div class="mb-2"><strong>New:</strong> ${inserts} | <strong>Updates:</strong> ${updates}</div>
                        <div class="mb-2"><strong>Warnings:</strong> ${warnings.length}</div>
                        ${warnings.length > 0 ? `<div class="alert alert-warning py-2 mb-2">${escapeHTML(warnings.slice(0, 3).join(' | '))}${warnings.length > 3 ? ' ...' : ''}</div>` : ''}
                        <div class="table-responsive" style="max-height:220px;">
                            <table class="table table-sm table-bordered mb-0">
                                <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Role</th><th>Status</th></tr></thead>
                                <tbody>${previewRows || '<tr><td colspan="5" class="text-center text-muted">No rows</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                `,
            });
            if (!proceed) {
                input.value = '';
                return;
            }

            await notify.withLoading(async () => {
                for (const op of ops) {
                    state.db[op.id] = op.rec;
                    await saveEmployee(op.rec);
                }
            }, 'Importing Employees', 'Applying validated rows...');

            await logActivity({
                action: 'employee.import.csv',
                entityType: 'employee',
                entityId: 'bulk',
                details: {
                    total: ops.length,
                    inserted: inserts,
                    updated: updates,
                    warnings: warnings.length,
                },
            });

            renderEmployeeManager();
            await notify.success(`Imported ${ops.length} employees successfully!`);
        } catch (err) {
            await notify.error('Import failed: ' + err.message);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}
