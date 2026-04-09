// ==================================================
// EMPLOYEES MODULE — Staff Directory Management
// (Superadmin only for add/edit/delete)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, getInputValue, getDepartment, safeCSV } from '../lib/utils.js';
import { saveEmployee, deleteEmployee as deleteEmpFromDB, logActivity } from './data.js';
import { requireRecentAuth } from './auth.js';
import * as notify from '../lib/notify.js';
import Swal from 'sweetalert2';

function getEmployeeFormOptionData() {
    const { appConfig, appSettings, db } = state;

    const allPositions = new Set();
    if (appConfig) Object.keys(appConfig).forEach(pos => allPositions.add(pos));
    try {
        const deptMap = JSON.parse(appSettings.dept_positions || '{}');
        Object.values(deptMap).forEach(positions => positions.forEach(pos => allPositions.add(pos)));
    } catch { /* ignore */ }

    const seniorityOptions = (appSettings.levels || 'Junior, Intermediate, Senior, Lead, Manager, Director')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const departmentOptions = (appSettings.departments || 'Human Resources, Finance, IT, Operations, Marketing, Sales')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const managerOptions = Object.keys(db)
        .sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''))
        .map(id => db[id])
        .filter(rec => (rec.seniority && (rec.seniority.includes('Manager') || rec.seniority.includes('Lead') || rec.seniority.includes('Director'))) || rec.role === 'director')
        .map(rec => ({ id: rec.id, label: `${rec.name} (${rec.position})` }));

    return {
        positions: [...allPositions].sort(),
        seniorityOptions,
        departmentOptions,
        managerOptions,
    };
}

function buildOptionsHtml(options, selectedValue, placeholder) {
    const selected = String(selectedValue || '');
    return [`<option value="">${placeholder}</option>`]
        .concat(options.map(option => {
            const value = typeof option === 'string' ? option : option.id;
            const label = typeof option === 'string' ? option : option.label;
            return `<option value="${escapeHTML(value)}" ${selected === String(value) ? 'selected' : ''}>${escapeHTML(label)}</option>`;
        }))
        .join('');
}

async function persistEmployeeRecord(rec, isEdit, oldSnapshot) {
    await notify.withLoading(async () => {
        state.db[rec.id] = rec;
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
}

function readInlineEmployeeForm() {
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

    return {
        id,
        name,
        pos,
        seniority,
        department,
        joinDate,
        isEdit,
        managerId,
        authEmail,
        role,
    };
}

function buildEmployeeRecordFromValues(values) {
    const isEdit = Boolean(values.isEdit);
    const existing = isEdit ? state.db[values.id] : null;
    const rec = isEdit && existing ? { ...existing } : {
        id: values.id,
        date_created: '-',
        date_updated: '-',
        date_next: '-',
        percentage: 0,
        scores: [],
        training_history: [],
        history: [],
        self_scores: [],
        self_percentage: 0,
        self_date: '',
        kpi_targets: {},
        must_change_password: false,
    };

    rec.name = values.name;
    rec.position = values.pos;
    rec.seniority = values.seniority;
    rec.join_date = values.joinDate;
    rec.manager_id = values.managerId;
    rec.department = values.department;
    rec.auth_email = values.authEmail;
    rec.role = values.role;

    return rec;
}

function getEmployeeDirectoryFilters() {
    return {
        search: document.getElementById('emp-search')?.value?.trim().toLowerCase() || '',
        department: document.getElementById('emp-filter-department')?.value || '',
        role: document.getElementById('emp-filter-role')?.value || '',
    };
}

export function clearEmployeeDirectoryFilters() {
    const ids = ['emp-search', 'emp-filter-department', 'emp-filter-role'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = '';
    });
    renderEmployeeManager();
}

export function renderEmployeeManager() {
    const { db } = state;
    const formOptions = getEmployeeFormOptionData();

    // 1. Position Dropdown — pull from both competency config and dept→positions mapping
    const posSelect = document.getElementById('emp-position');
    if (!posSelect) return;
    const currentPosVal = posSelect.value;
    posSelect.innerHTML = '<option value="">-- Select Position --</option>';

    formOptions.positions.forEach(pos => {
        posSelect.innerHTML += `<option value="${escapeHTML(pos)}">${escapeHTML(pos)}</option>`;
    });
    if (currentPosVal && document.getElementById('emp-edit-mode').value === 'true') posSelect.value = currentPosVal;

    // 1b. Levels & Departments
    const loadDropdown = (selId, settingKey, defStr, prevVal) => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const opts = settingKey === 'levels' ? formOptions.seniorityOptions : formOptions.departmentOptions;
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

    formOptions.managerOptions.forEach(rec => {
        if (rec.id) {
            mgrSelect.innerHTML += `<option value="${escapeHTML(rec.id)}">${escapeHTML(rec.label)}</option>`;
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
    const deptFilter = document.getElementById('emp-filter-department');
    if (deptFilter) {
        const currentVal = deptFilter.value;
        const departments = [...new Set(Object.values(db).map(rec => rec.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        deptFilter.innerHTML = '<option value="">All Departments</option>' + departments.map(dept => `<option value="${escapeHTML(dept)}">${escapeHTML(dept)}</option>`).join('');
        deptFilter.value = currentVal;
    }

    const filters = getEmployeeDirectoryFilters();
    const filteredIds = sortedIds.filter(id => {
        const rec = db[id];
        const managerName = rec.manager_id ? (db[rec.manager_id]?.name || rec.manager_id) : '';
        const haystack = [
            rec.id,
            rec.name,
            rec.position,
            rec.department,
            rec.seniority,
            rec.role,
            managerName,
        ].join(' ').toLowerCase();

        if (filters.search && !haystack.includes(filters.search)) return false;
        if (filters.department && rec.department !== filters.department) return false;
        if (filters.role && rec.role !== filters.role) return false;
        return true;
    });

    document.getElementById('emp-count-badge').innerText = `${filteredIds.length} / ${sortedIds.length} Staff`;
    const visibleCountEl = document.getElementById('emp-visible-count');
    if (visibleCountEl) visibleCountEl.innerText = String(filteredIds.length);
    const managerCountEl = document.getElementById('emp-manager-count');
    if (managerCountEl) managerCountEl.innerText = String(filteredIds.filter(id => ['manager', 'director', 'superadmin'].includes(db[id]?.role)).length);
    const assessedCountEl = document.getElementById('emp-assessed-count');
    if (assessedCountEl) assessedCountEl.innerText = String(filteredIds.filter(id => (db[id]?.percentage || 0) > 0).length);

    if (filteredIds.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-muted">
          <div class="small text-uppercase fw-bold mb-2">No employees found</div>
          <div>Try adjusting the search term or reset the directory filters.</div>
        </td>
      </tr>`;
        return;
    }

    filteredIds.forEach(id => {
        const rec = db[id];
        const managerName = rec.manager_id ? (db[rec.manager_id]?.name || rec.manager_id) : 'Direct to Director';
        const statusBadge = rec.percentage && rec.percentage > 0
            ? '<span class="badge bg-success">Assessed</span>'
            : '<span class="badge bg-secondary">Pending</span>';

        let roleBadge = '';
        if (rec.role === 'superadmin') roleBadge = '<span class="badge bg-danger ms-1">Admin</span>';
        else if (rec.role === 'manager') roleBadge = '<span class="badge bg-warning text-dark ms-1">Mgr</span>';
        else if (rec.role === 'director') roleBadge = '<span class="badge bg-info text-dark ms-1">Dir</span>';
        else if (rec.role === 'hr') roleBadge = '<span class="badge bg-success ms-1">HR</span>';

        const isMgr = rec.seniority && (rec.seniority.includes('Manager') || rec.seniority.includes('Lead'));
        const mgrIcon = isMgr ? '<i class="bi bi-star-fill text-warning me-1"></i>' : '';

        const accessBadge = rec.auth_email
            ? '<span class="badge bg-success-subtle text-success border">Active Login</span>'
            : '<span class="badge bg-light text-muted border">No Login</span>';

        const actions = isAdmin() ? `
      <div class="btn-group btn-group-sm employee-actions" role="group">
        <button class="btn btn-outline-primary" onclick="window.__app.loadEmployeeForEdit('${escapeInlineArg(rec.id)}')" title="Edit employee"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger" onclick="window.__app.deleteEmployeeData('${escapeInlineArg(rec.id)}')" title="Delete employee"><i class="bi bi-trash"></i></button>
      </div>
    ` : '';

        tbody.innerHTML += `
      <tr class="employee-row">
        <td>
          <div class="fw-bold d-flex align-items-center gap-2">${mgrIcon}${escapeHTML(rec.name)}${roleBadge}</div>
          <div class="text-muted small font-monospace">${escapeHTML(rec.id)}</div>
        </td>
        <td>
          <div class="small fw-semibold">${escapeHTML(rec.position)}</div>
          <div class="text-muted" style="font-size:10px;">${escapeHTML(rec.seniority)} &middot; ${escapeHTML(rec.department)}</div>
        </td>
        <td class="small">${escapeHTML(managerName)}</td>
        <td class="small">${escapeHTML(rec.join_date || '-')}</td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center">${accessBadge}</td>
        <td class="text-end">${actions}</td>
      </tr>`;
    });
}

export async function saveEmployeeData() {
    if (!isAdmin()) { await notify.error('Access Denied. Superadmin only.'); return; }

    const values = readInlineEmployeeForm();
    const { id, name, pos, joinDate, isEdit } = values;

    if (!id || !name || !pos || !joinDate) {
        await notify.warn('Please fill in ID, Name, Position, and Join Date.');
        return;
    }

    if (!isEdit && state.db[id]) {
        await notify.warn('ID ' + id + ' already exists.');
        return;
    }

    const rec = buildEmployeeRecordFromValues(values);
    const oldSnapshot = isEdit ? { ...state.db[id] } : null;

    await persistEmployeeRecord(rec, isEdit, oldSnapshot);

    await notify.success(isEdit ? 'Employee Updated!' : 'Employee Added!');
    resetEmployeeForm();
    if (window.__app?.toggleEmployeesView) window.__app.toggleEmployeesView('employees-directory');
    renderEmployeeManager();
}

export function loadEmployeeForEdit(id) {
    if (!isAdmin()) return;
    const rec = state.db[id];
    if (!rec) return;
    const formOptions = getEmployeeFormOptionData();

    Swal.fire({
        title: `Edit ${escapeHTML(rec.name)}`,
        width: 760,
        confirmButtonText: 'Save Changes',
        cancelButtonText: 'Cancel',
        showCancelButton: true,
        focusConfirm: false,
        html: `
            <div class="text-start">
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Employee ID</label>
                        <input id="swal-emp-id" class="form-control" value="${escapeHTML(rec.id)}" disabled>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Full Name</label>
                        <input id="swal-emp-name" class="form-control" value="${escapeHTML(rec.name || '')}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Position</label>
                        <select id="swal-emp-position" class="form-select">${buildOptionsHtml(formOptions.positions, rec.position, '-- Select Position --')}</select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold text-muted">Seniority</label>
                        <select id="swal-emp-seniority" class="form-select">${buildOptionsHtml(formOptions.seniorityOptions, rec.seniority, '-- Select --')}</select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold text-muted">Department</label>
                        <select id="swal-emp-department" class="form-select">${buildOptionsHtml(formOptions.departmentOptions, rec.department, '-- Select --')}</select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Reports To</label>
                        <select id="swal-emp-manager" class="form-select">${buildOptionsHtml(formOptions.managerOptions, rec.manager_id, '-- Direct to Director --')}</select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold text-muted">Role</label>
                        <select id="swal-emp-role" class="form-select">
                            ${buildOptionsHtml(['employee', 'manager', 'director', 'superadmin', 'hr'], rec.role, '-- Select Role --')}
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold text-muted">Date Joined</label>
                        <input id="swal-emp-join" type="date" class="form-control" value="${escapeHTML(getInputValue(rec.join_date))}">
                    </div>
                    <div class="col-12">
                        <label class="form-label small fw-bold text-muted">Login Email</label>
                        <input id="swal-emp-email" type="email" class="form-control" value="${escapeHTML(rec.auth_email || '')}" placeholder="user@company.com">
                    </div>
                </div>
            </div>
        `,
        preConfirm: async () => {
            const values = {
                id: rec.id,
                name: document.getElementById('swal-emp-name')?.value?.trim() || '',
                pos: document.getElementById('swal-emp-position')?.value || '',
                seniority: document.getElementById('swal-emp-seniority')?.value || '',
                department: document.getElementById('swal-emp-department')?.value || getDepartment(document.getElementById('swal-emp-position')?.value || ''),
                joinDate: document.getElementById('swal-emp-join')?.value || '',
                isEdit: true,
                managerId: document.getElementById('swal-emp-manager')?.value || '',
                authEmail: document.getElementById('swal-emp-email')?.value?.trim() || '',
                role: document.getElementById('swal-emp-role')?.value || 'employee',
            };

            if (!values.name || !values.pos || !values.joinDate) {
                Swal.showValidationMessage('Name, position, and join date are required.');
                return false;
            }

            if (values.authEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.authEmail)) {
                Swal.showValidationMessage('Enter a valid login email.');
                return false;
            }

            return values;
        },
    }).then(async result => {
        if (!result.isConfirmed || !result.value) return;

        const values = result.value;
        const oldSnapshot = { ...state.db[id] };
        const updatedRecord = buildEmployeeRecordFromValues(values);

        await persistEmployeeRecord(updatedRecord, true, oldSnapshot);
        await notify.success('Employee Updated!');
        renderEmployeeManager();
    }).catch(async err => {
        await notify.error('Failed to update employee: ' + (err.message || err));
    });
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
            const validRoles = new Set(['employee', 'manager', 'director', 'superadmin', 'hr']);
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
