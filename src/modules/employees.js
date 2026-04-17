// ==================================================
// EMPLOYEES MODULE — Staff Directory Management
// (Superadmin only for add/edit/delete)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { getManagerAssessment } from '../lib/employee-records.js';
import { escapeHTML, escapeInlineArg, getInputValue, getDepartment, safeCSV } from '../lib/utils.js';
import {
    saveEmployee,
    deleteEmployee as deleteEmpFromDB,
} from './data/employees.js';
import {
    saveManpowerPlan,
    deleteManpowerPlan as deleteManpowerPlanFromDB,
    saveHeadcountRequest,
    updateHeadcountRequestStatus,
    saveRecruitmentCard,
    updateRecruitmentStage,
    deleteRecruitmentCard as deleteRecruitmentCardFromDB,
} from './data/manpower.js';
import { logActivity } from './data/activity.js';
import { requireRecentAuth } from './auth.js';
import * as notify from '../lib/notify.js';
import { getSwal } from '../lib/swal.js';

const RECRUITMENT_STAGES = ['requested', 'sourcing', 'screening', 'interview', 'offer', 'hired', 'closed'];

function parseCsvOptions(value, fallback) {
    return (value || fallback || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function getDepartmentPositionMap() {
    const { appConfig, appSettings, db } = state;
    const allPositions = new Set();
    const positionMap = {};

    Object.keys(appConfig || {}).forEach(position => {
        if (position) allPositions.add(position);
    });

    try {
        const rawMap = JSON.parse(appSettings.dept_positions || '{}');
        Object.entries(rawMap).forEach(([department, positions]) => {
            const scopedPositions = Array.isArray(positions)
                ? positions.map(position => String(position || '').trim()).filter(Boolean)
                : [];
            if (!positionMap[department]) positionMap[department] = new Set();
            scopedPositions.forEach(position => {
                positionMap[department].add(position);
                allPositions.add(position);
            });
        });
    } catch {
        // Ignore invalid legacy JSON and fall back to roster-derived mapping.
    }

    Object.values(db || {}).forEach(rec => {
        const position = String(rec?.position || '').trim();
        const department = String(rec?.department || '').trim();
        if (!position) return;
        allPositions.add(position);
        if (!department) return;
        if (!positionMap[department]) positionMap[department] = new Set();
        positionMap[department].add(position);
    });

    return {
        allPositions: [...allPositions].sort((a, b) => a.localeCompare(b)),
        byDepartment: Object.fromEntries(
            Object.entries(positionMap).map(([department, positions]) => [
                department,
                [...positions].sort((a, b) => a.localeCompare(b)),
            ])
        ),
    };
}

function getScopedPositions(department, selectedValue = '') {
    const { allPositions, byDepartment } = getDepartmentPositionMap();
    const normalizedDepartment = String(department || '').trim();
    const selected = String(selectedValue || '').trim();
    const scoped = normalizedDepartment && Array.isArray(byDepartment[normalizedDepartment])
        ? [...byDepartment[normalizedDepartment]]
        : [...allPositions];

    if (selected && !scoped.includes(selected)) scoped.push(selected);
    return scoped.sort((a, b) => a.localeCompare(b));
}

function syncScopedPositionSelect(selectId, department, selectedValue = '', placeholder = '-- Select Position --') {
    setSelectOptions(selectId, getScopedPositions(department, selectedValue), selectedValue, placeholder);
}

function getEmployeeFormOptionData() {
    const { appSettings, db } = state;
    const { allPositions, byDepartment } = getDepartmentPositionMap();

    const seniorityOptions = parseCsvOptions(
        appSettings.levels,
        'Junior, Intermediate, Senior, Lead, Manager, Director'
    );

    const departmentOptions = parseCsvOptions(
        appSettings.departments,
        'Human Resources, Finance, IT, Operations, Marketing, Sales'
    );

    const managerOptions = Object.keys(db)
        .sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''))
        .map(id => db[id])
        .filter(rec => (rec.seniority && (rec.seniority.includes('Manager') || rec.seniority.includes('Lead') || rec.seniority.includes('Director'))) || rec.role === 'director')
        .map(rec => ({ id: rec.id, label: `${rec.name} (${rec.position})` }));

    return {
        positions: allPositions,
        positionsByDepartment: byDepartment,
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
    const derivedDefaults = {
        percentage: 0,
        scores: [],
        training_history: [],
        history: [],
        self_scores: [],
        self_percentage: 0,
        self_date: '',
        date_created: '-',
        date_updated: '-',
        date_next: '-',
    };
    const rec = isEdit && existing ? { ...derivedDefaults, ...existing } : {
        id: values.id,
        ...derivedDefaults,
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

function isActiveSpRecord(rec = {}) {
    const level = String(rec?.active_sp_level || '').trim();
    if (!level) return false;
    const until = String(rec?.active_sp_until || '').trim();
    if (!until) return true;
    const untilMs = Date.parse(until);
    return Number.isFinite(untilMs) && untilMs >= Date.now();
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

    // 1. Position Dropdown — scope options to the selected department
    const posSelect = document.getElementById('emp-position');
    if (!posSelect) return;
    const currentPosVal = posSelect.value;
    const currentDeptVal = document.getElementById('emp-department')?.value || '';
    posSelect.innerHTML = '<option value="">-- Select Position --</option>';
    syncScopedPositionSelect('emp-position', currentDeptVal, currentPosVal, '-- Select Position --');

    // 1b. Levels & Departments
    const loadDropdown = (selId, opts, prevVal, placeholder = '-- Select --') => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        sel.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>`;
        opts.forEach(opt => {
            sel.innerHTML += `<option value="${escapeHTML(opt)}">${escapeHTML(opt)}</option>`;
        });
        if (prevVal) sel.value = prevVal;
    };

    loadDropdown('emp-seniority', formOptions.seniorityOptions, document.getElementById('emp-seniority')?.value);
    loadDropdown('emp-department', formOptions.departmentOptions, currentDeptVal);
    syncScopedPositionSelect(
        'emp-position',
        document.getElementById('emp-department')?.value || '',
        currentPosVal,
        '-- Select Position --'
    );

    const deptSelect = document.getElementById('emp-department');
    if (deptSelect) {
        deptSelect.onchange = () => {
            syncScopedPositionSelect('emp-position', deptSelect.value, '', '-- Select Position --');
        };
    }

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
    if (assessedCountEl) assessedCountEl.innerText = String(filteredIds.filter(id => (getManagerAssessment(db[id]).percentage || 0) > 0).length);

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
        const managerAssessment = getManagerAssessment(rec);
        const managerName = rec.manager_id ? (db[rec.manager_id]?.name || rec.manager_id) : 'Direct to Director';
        const statusBadge = managerAssessment.percentage && managerAssessment.percentage > 0
            ? '<span class="badge bg-success">Assessed</span>'
            : '<span class="badge bg-secondary">Pending</span>';

        let roleBadge = '';
        if (rec.role === 'superadmin') roleBadge = '<span class="badge bg-danger ms-1">Admin</span>';
        else if (rec.role === 'manager') roleBadge = '<span class="badge bg-warning text-dark ms-1">Mgr</span>';
        else if (rec.role === 'director') roleBadge = '<span class="badge bg-info text-dark ms-1">Dir</span>';
        else if (rec.role === 'hr') roleBadge = '<span class="badge bg-success ms-1">HR</span>';
        const spBadge = isActiveSpRecord(rec)
            ? `<span class="badge bg-danger-subtle text-danger border ms-1">${escapeHTML(String(rec.active_sp_level || 'SP Active'))}</span>`
            : '';

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
          <div class="fw-bold d-flex align-items-center gap-2">${mgrIcon}${escapeHTML(rec.name)}${roleBadge}${spBadge}</div>
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

    getSwal().then(Swal => Swal.fire({
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
        didOpen: () => {
            const deptSelect = document.getElementById('swal-emp-department');
            const posSelect = document.getElementById('swal-emp-position');
            syncScopedPositionSelect(
                'swal-emp-position',
                deptSelect?.value || rec.department || '',
                rec.position || '',
                '-- Select Position --'
            );
            if (deptSelect && posSelect) {
                deptSelect.onchange = () => {
                    syncScopedPositionSelect('swal-emp-position', deptSelect.value, '', '-- Select Position --');
                };
            }
        },
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
    })).then(async result => {
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

function getManpowerOptionData() {
    const { appSettings } = state;
    const { allPositions, byDepartment } = getDepartmentPositionMap();

    const departmentOptions = parseCsvOptions(
        appSettings.departments,
        'Human Resources, Finance, IT, Operations, Marketing, Sales'
    );

    const seniorityOptions = parseCsvOptions(
        appSettings.levels,
        'Junior, Intermediate, Senior, Lead, Manager, Director'
    );

    return {
        positions: allPositions,
        positionsByDepartment: byDepartment,
        departments: departmentOptions,
        seniorities: seniorityOptions,
    };
}

function getCurrentPeriodValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function canApproveHeadcountRequests() {
    return ['superadmin', 'hr'].includes(String(state.currentUser?.role || '').toLowerCase());
}

function canManageManpowerPlans() {
    return ['superadmin', 'hr'].includes(String(state.currentUser?.role || '').toLowerCase());
}

function canAccessManpowerPlanning() {
    return ['superadmin', 'hr', 'manager'].includes(String(state.currentUser?.role || '').toLowerCase());
}

function canManageRecruitmentBoard() {
    return ['superadmin', 'hr'].includes(String(state.currentUser?.role || '').toLowerCase());
}

function getRecruitmentOwnerOptions() {
    return Object.values(state.db || {})
        .filter(rec => ['superadmin', 'hr', 'manager', 'director'].includes(String(rec?.role || '').toLowerCase()))
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
        .map(rec => ({ id: rec.id, label: `${rec.name} (${rec.position || rec.role})` }));
}

function getRequestRemainingOpenings(request) {
    const requestedCount = Number(request?.requested_count || 0);
    const hiredCount = Number(request?.hired_total || 0);
    return Math.max(requestedCount - hiredCount, 0);
}

function getRecruitmentRequestOptions() {
    return (state.headcountRequests || [])
        .filter(request => String(request.approval_status || '').toLowerCase() === 'approved')
        .sort((a, b) => String(a.target_hire_date || '9999-12-31').localeCompare(String(b.target_hire_date || '9999-12-31')))
        .map(request => ({
            id: request.id,
            label: `${request.request_code || 'Pending Code'} · ${request.department} · ${request.position} (${getRequestRemainingOpenings(request)} open)`,
        }));
}

function getStageBadgeClass(stage) {
    const normalized = String(stage || '').toLowerCase();
    if (normalized === 'hired') return 'bg-success-subtle text-success border';
    if (normalized === 'offer') return 'bg-primary-subtle text-primary border';
    if (normalized === 'closed') return 'bg-secondary-subtle text-secondary border';
    if (normalized === 'requested') return 'bg-light text-muted border';
    return 'bg-warning-subtle text-warning border';
}

function getRecruitmentUrgency(card) {
    const overdueDays = Number(card?.overdue_days || 0);
    const targetDate = card?.target_hire_date ? new Date(card.target_hire_date) : null;
    const stageAge = Number(card?.stage_age_days || 0);
    if (overdueDays > 0) return { label: `Overdue ${overdueDays}d`, className: 'text-danger' };
    if (targetDate && !Number.isNaN(targetDate.getTime())) {
        const daysLeft = Math.ceil((targetDate.getTime() - Date.now()) / 86400000);
        if (daysLeft >= 0 && daysLeft <= 7) return { label: 'Due Soon', className: 'text-warning' };
    }
    if (String(card?.priority || '').toLowerCase() === 'urgent') return { label: 'Urgent Request', className: 'text-danger' };
    if (stageAge >= 10) return { label: `In Stage ${stageAge}d`, className: 'text-muted' };
    return { label: 'On Track', className: 'text-success' };
}

function canEditHeadcountRequest(request) {
    if (!request) return false;
    if (canApproveHeadcountRequests()) return true;
    return String(request.requested_by || '') === String(state.currentUser?.id || '')
        && ['pending', 'cancelled'].includes(String(request.approval_status || '').toLowerCase());
}

function buildHeadcountRequestCode() {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REQ-${ymd}-${suffix}`;
}

function setSelectOptions(selectId, options, selectedValue = '', placeholder = '-- Select --') {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = buildOptionsHtml(options, selectedValue, placeholder);
}

function readManpowerPlanForm() {
    return {
        id: document.getElementById('mp-edit-id')?.value?.trim() || '',
        period: document.getElementById('mp-period')?.value || '',
        department: document.getElementById('mp-department')?.value || '',
        position: document.getElementById('mp-position')?.value || '',
        seniority: document.getElementById('mp-seniority')?.value || '',
        planned_headcount: Number(document.getElementById('mp-planned-headcount')?.value || 0),
        approved_headcount: Number(document.getElementById('mp-approved-headcount-input')?.value || 0),
        status: document.getElementById('mp-status')?.value || 'draft',
        notes: document.getElementById('mp-notes')?.value?.trim() || '',
    };
}

export function resetManpowerPlanForm() {
    const periodEl = document.getElementById('mp-period');
    if (periodEl) periodEl.value = getCurrentPeriodValue();

    const editIdEl = document.getElementById('mp-edit-id');
    if (editIdEl) editIdEl.value = '';

    const plannedEl = document.getElementById('mp-planned-headcount');
    if (plannedEl) plannedEl.value = '0';

    const approvedEl = document.getElementById('mp-approved-headcount-input');
    if (approvedEl) approvedEl.value = '0';

    const statusEl = document.getElementById('mp-status');
    if (statusEl) statusEl.value = 'draft';

    const notesEl = document.getElementById('mp-notes');
    if (notesEl) notesEl.value = '';

    const cancelBtn = document.getElementById('mp-cancel-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');

    const options = getManpowerOptionData();
    setSelectOptions('mp-department', options.departments, '', '-- Select Department --');
    syncScopedPositionSelect('mp-position', '', '', '-- Select Position --');
    setSelectOptions('mp-seniority', options.seniorities, '', '-- Select Seniority --');

    const departmentSelect = document.getElementById('mp-department');
    if (departmentSelect) {
        departmentSelect.onchange = () => {
            syncScopedPositionSelect('mp-position', departmentSelect.value, '', '-- Select Position --');
        };
    }
}

export function renderManpowerPlanning() {
    const tbody = document.getElementById('manpower-plan-body');
    if (!tbody) return;
    if (!canAccessManpowerPlanning()) return;
    const canManagePlans = canManageManpowerPlans();
    document.getElementById('mp-plan-setup-card')?.classList.toggle('hidden', !canManagePlans);
    document.getElementById('mp-add-plan-btn')?.classList.toggle('hidden', !canManagePlans);

    const plans = Array.isArray(state.manpowerPlans) ? [...state.manpowerPlans] : [];
    const metaEl = document.getElementById('mp-table-meta');
    const emptyState = document.getElementById('mp-empty-state');

    if (!document.getElementById('mp-period')?.value) {
        resetManpowerPlanForm();
    } else {
        const options = getManpowerOptionData();
        setSelectOptions('mp-department', options.departments, document.getElementById('mp-department')?.value || '', '-- Select Department --');
        syncScopedPositionSelect(
            'mp-position',
            document.getElementById('mp-department')?.value || '',
            document.getElementById('mp-position')?.value || '',
            '-- Select Position --'
        );
        setSelectOptions('mp-seniority', options.seniorities, document.getElementById('mp-seniority')?.value || '', '-- Select Seniority --');
    }

    const totalPlans = plans.length;
    const approvedHeadcount = plans.reduce((sum, row) => sum + Number(row.approved_headcount || 0), 0);
    const filledHeadcount = plans.reduce((sum, row) => sum + Number(row.filled_headcount || 0), 0);
    const gapHeadcount = plans.reduce((sum, row) => sum + Number(row.gap_headcount || 0), 0);
    const requests = Array.isArray(state.headcountRequests) ? state.headcountRequests : [];
    const pipeline = Array.isArray(state.recruitmentPipeline) ? state.recruitmentPipeline : [];
    const openApprovedRequests = requests.filter(request =>
        String(request.approval_status || '').toLowerCase() === 'approved'
        && getRequestRemainingOpenings(request) > 0
    ).length;
    const activePipelineCount = pipeline.filter(card =>
        !['hired', 'closed'].includes(String(card.stage || '').toLowerCase())
    ).length;
    const hiresCompleted = pipeline.filter(card => String(card.stage || '').toLowerCase() === 'hired').length;
    const overdueTargets = requests.filter(request => {
        if (String(request.approval_status || '').toLowerCase() !== 'approved') return false;
        if (getRequestRemainingOpenings(request) <= 0 || !request.target_hire_date) return false;
        const target = new Date(request.target_hire_date);
        return !Number.isNaN(target.getTime()) && target < new Date(new Date().toDateString());
    }).length;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = String(value);
    };

    setText('mp-total-plans', totalPlans);
    setText('mp-approved-headcount', approvedHeadcount);
    setText('mp-filled-headcount', filledHeadcount);
    setText('mp-gap-headcount', gapHeadcount);
    setText('mp-funnel-open-requests', openApprovedRequests);
    setText('mp-funnel-active-pipeline', activePipelineCount);
    setText('mp-funnel-hires-completed', hiresCompleted);
    setText('mp-funnel-overdue-targets', overdueTargets);

    if (metaEl) {
        metaEl.innerText = totalPlans > 0
            ? `${totalPlans} plan${totalPlans === 1 ? '' : 's'} loaded`
            : 'No plans loaded';
    }

    if (emptyState) emptyState.classList.toggle('hidden', totalPlans > 0);

    tbody.innerHTML = '';
    if (totalPlans === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4 fst-italic">No manpower plans yet.</td></tr>';
        renderHeadcountRequests();
        renderRecruitmentBoard();
        return;
    }

    plans
        .sort((a, b) => {
            const periodCompare = String(b.period || '').localeCompare(String(a.period || ''));
            if (periodCompare !== 0) return periodCompare;
            const deptCompare = String(a.department || '').localeCompare(String(b.department || ''));
            if (deptCompare !== 0) return deptCompare;
            return String(a.position || '').localeCompare(String(b.position || ''));
        })
        .forEach(plan => {
            const status = String(plan.status || 'draft');
            const statusClass = status === 'active' || status === 'approved'
                ? 'bg-success-subtle text-success border'
                : status === 'submitted'
                    ? 'bg-warning-subtle text-warning border'
                    : status === 'closed'
                        ? 'bg-secondary-subtle text-secondary border'
                        : 'bg-light text-muted border';

            tbody.innerHTML += `
                <tr>
                    <td class="ps-3 fw-semibold">${escapeHTML(plan.period || '-')}</td>
                    <td>${escapeHTML(plan.department || '-')}</td>
                    <td>${escapeHTML(plan.position || '-')}</td>
                    <td>${escapeHTML(plan.seniority || '-')}</td>
                    <td class="text-end">${escapeHTML(String(plan.planned_headcount ?? 0))}</td>
                    <td class="text-end">${escapeHTML(String(plan.approved_headcount ?? 0))}</td>
                    <td class="text-end">${escapeHTML(String(plan.filled_headcount ?? 0))}</td>
                    <td class="text-end fw-bold ${Number(plan.gap_headcount || 0) > 0 ? 'text-warning' : 'text-success'}">${escapeHTML(String(plan.gap_headcount ?? 0))}</td>
                    <td><span class="badge ${statusClass}">${escapeHTML(status)}</span></td>
                    <td class="text-end pe-3">
                        ${canManagePlans ? `<div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="window.__app.loadManpowerPlanForEdit('${escapeInlineArg(plan.id)}')" title="Edit plan">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="window.__app.deleteManpowerPlanData('${escapeInlineArg(plan.id)}')" title="Delete plan">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>` : '<span class="text-muted small">Read only</span>'}
                    </td>
                </tr>
            `;
        });

    renderHeadcountRequests();
    renderRecruitmentBoard();
}

function readHeadcountRequestForm() {
    return {
        id: document.getElementById('mpr-edit-id')?.value?.trim() || '',
        plan_id: document.getElementById('mpr-plan-id')?.value || null,
        department: document.getElementById('mpr-department')?.value || '',
        position: document.getElementById('mpr-position')?.value || '',
        seniority: document.getElementById('mpr-seniority')?.value || '',
        requested_count: Number(document.getElementById('mpr-requested-count')?.value || 1),
        priority: document.getElementById('mpr-priority')?.value || 'normal',
        target_hire_date: document.getElementById('mpr-target-hire-date')?.value || null,
        business_reason: document.getElementById('mpr-business-reason')?.value?.trim() || '',
    };
}

function syncHeadcountFormFromPlan() {
    const planId = document.getElementById('mpr-plan-id')?.value || '';
    if (!planId) return;
    const plan = (state.manpowerPlans || []).find(row => row.id === planId);
    if (!plan) return;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = value ?? '';
    };

    setValue('mpr-department', plan.department || '');
    syncScopedPositionSelect('mpr-position', plan.department || '', plan.position || '', '-- Select Position --');
    setValue('mpr-seniority', plan.seniority || '');
}

function populateHeadcountRequestFormOptions(selected = {}) {
    const options = getManpowerOptionData();
    setSelectOptions('mpr-department', options.departments, selected.department || '', '-- Select Department --');
    syncScopedPositionSelect('mpr-position', selected.department || '', selected.position || '', '-- Select Position --');
    setSelectOptions('mpr-seniority', options.seniorities, selected.seniority || '', '-- Select Seniority --');

    const planSelect = document.getElementById('mpr-plan-id');
    if (planSelect) {
        const selectedPlanId = selected.plan_id || '';
        const plans = [{ id: '', label: 'Optional: link to manpower plan' }]
            .concat((state.manpowerPlans || []).map(plan => ({
                id: plan.id,
                label: `${plan.period} · ${plan.department} · ${plan.position}${plan.seniority ? ` · ${plan.seniority}` : ''}`,
            })));
        planSelect.innerHTML = plans
            .map(plan => `<option value="${escapeHTML(plan.id)}" ${selectedPlanId === plan.id ? 'selected' : ''}>${escapeHTML(plan.label)}</option>`)
            .join('');
    }

    const departmentSelect = document.getElementById('mpr-department');
    if (departmentSelect) {
        departmentSelect.onchange = () => {
            syncScopedPositionSelect('mpr-position', departmentSelect.value, '', '-- Select Position --');
        };
    }
}

export function resetHeadcountRequestForm() {
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setValue('mpr-edit-id', '');
    setValue('mpr-requested-count', 1);
    setValue('mpr-priority', 'normal');
    setValue('mpr-target-hire-date', '');
    setValue('mpr-business-reason', '');
    document.getElementById('mpr-cancel-btn')?.classList.add('hidden');

    populateHeadcountRequestFormOptions();

    const role = String(state.currentUser?.role || '').toLowerCase();
    if (role === 'manager') {
        setValue('mpr-department', state.currentUser?.department || '');
    }
}

function readRecruitmentCardForm() {
    return {
        id: document.getElementById('mpc-edit-id')?.value?.trim() || '',
        request_id: document.getElementById('mpc-request-id')?.value || '',
        candidate_name: document.getElementById('mpc-candidate-name')?.value?.trim() || '',
        stage: document.getElementById('mpc-stage')?.value || 'requested',
        source: document.getElementById('mpc-source')?.value?.trim() || '',
        owner_id: document.getElementById('mpc-owner-id')?.value || '',
        expected_start_date: document.getElementById('mpc-expected-start-date')?.value || null,
        offer_status: document.getElementById('mpc-offer-status')?.value?.trim() || '',
        notes: document.getElementById('mpc-notes')?.value?.trim() || '',
    };
}

function populateRecruitmentFormOptions(selected = {}) {
    const requestSelect = document.getElementById('mpc-request-id');
    if (requestSelect) {
        const selectedRequestId = selected.request_id || '';
        const options = [{ id: '', label: 'Select approved request' }].concat(getRecruitmentRequestOptions());
        requestSelect.innerHTML = options
            .map(option => `<option value="${escapeHTML(option.id)}" ${selectedRequestId === option.id ? 'selected' : ''}>${escapeHTML(option.label)}</option>`)
            .join('');
    }

    setSelectOptions('mpc-owner-id', getRecruitmentOwnerOptions(), selected.owner_id || '', '-- Select Owner --');

    const boardFilter = document.getElementById('mp-board-request-filter');
    if (boardFilter) {
        const selectedFilter = boardFilter.value || '';
        const filters = [{ id: '', label: 'All Approved Requests' }].concat(getRecruitmentRequestOptions());
        boardFilter.innerHTML = filters
            .map(option => `<option value="${escapeHTML(option.id)}" ${selectedFilter === option.id ? 'selected' : ''}>${escapeHTML(option.label)}</option>`)
            .join('');
    }
}

export function resetRecruitmentCardForm() {
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setValue('mpc-edit-id', '');
    setValue('mpc-candidate-name', '');
    setValue('mpc-stage', 'requested');
    setValue('mpc-source', '');
    setValue('mpc-owner-id', '');
    setValue('mpc-expected-start-date', '');
    setValue('mpc-offer-status', '');
    setValue('mpc-notes', '');
    populateRecruitmentFormOptions();
    document.getElementById('mpc-cancel-btn')?.classList.add('hidden');
}

export function loadRecruitmentCardForEdit(id) {
    const card = (state.recruitmentPipeline || []).find(row => row.id === id);
    if (!card || !canManageRecruitmentBoard()) return;

    populateRecruitmentFormOptions(card);
    const setValue = (fieldId, value) => {
        const el = document.getElementById(fieldId);
        if (el) el.value = value ?? '';
    };

    setValue('mpc-edit-id', card.id);
    setValue('mpc-candidate-name', card.candidate_name || '');
    setValue('mpc-stage', card.stage || 'requested');
    setValue('mpc-source', card.source || '');
    setValue('mpc-owner-id', card.owner_id || '');
    setValue('mpc-expected-start-date', card.expected_start_date || '');
    setValue('mpc-offer-status', card.offer_status || '');
    setValue('mpc-notes', card.notes || '');
    document.getElementById('mpc-cancel-btn')?.classList.remove('hidden');
    document.getElementById('mpc-request-id')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function saveRecruitmentCardData() {
    if (!canManageRecruitmentBoard()) {
        await notify.error('Access Denied.');
        return;
    }

    const values = readRecruitmentCardForm();
    if (!values.request_id || !values.candidate_name) {
        await notify.warn('Approved request and candidate name are required.');
        return;
    }

    const existing = values.id
        ? (state.recruitmentPipeline || []).find(row => row.id === values.id)
        : null;

    const payload = {
        id: existing?.id || undefined,
        request_id: values.request_id,
        candidate_name: values.candidate_name,
        stage: values.stage,
        source: values.source,
        owner_id: values.owner_id || null,
        expected_start_date: values.expected_start_date || null,
        offer_status: values.offer_status,
        notes: values.notes,
        stage_updated_at: existing && existing.stage === values.stage
            ? existing.stage_updated_at
            : new Date().toISOString(),
    };

    await notify.withLoading(async () => {
        await saveRecruitmentCard(payload);
    }, existing ? 'Updating Recruitment Card' : 'Saving Recruitment Card', 'Writing recruitment workflow...');

    await logActivity({
        action: existing ? 'recruitment_card.update' : 'recruitment_card.create',
        entityType: 'recruitment_pipeline',
        entityId: existing?.id || payload.request_id,
        details: {
            request_id: payload.request_id,
            candidate_name: payload.candidate_name,
            stage: payload.stage,
            owner_id: payload.owner_id || '',
        },
    });

    resetRecruitmentCardForm();
    renderRecruitmentBoard();
    renderHeadcountRequests();
    await notify.success(existing ? 'Recruitment card updated.' : 'Recruitment card saved.');
}

export async function moveRecruitmentCard(id, direction) {
    if (!canManageRecruitmentBoard()) {
        await notify.error('Access Denied.');
        return;
    }

    const card = (state.recruitmentPipeline || []).find(row => row.id === id);
    if (!card) return;
    const currentIndex = RECRUITMENT_STAGES.indexOf(String(card.stage || '').toLowerCase());
    if (currentIndex === -1) return;
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    const nextStage = RECRUITMENT_STAGES[nextIndex];
    if (!nextStage) return;

    await notify.withLoading(async () => {
        await updateRecruitmentStage(id, nextStage);
    }, 'Moving Recruitment Card', 'Updating board stage...');

    await logActivity({
        action: 'recruitment_card.move',
        entityType: 'recruitment_pipeline',
        entityId: id,
        details: {
            candidate_name: card.candidate_name || '',
            from_stage: card.stage,
            to_stage: nextStage,
        },
    });

    renderRecruitmentBoard();
    renderHeadcountRequests();
}

export async function deleteRecruitmentCard(id) {
    if (!canManageRecruitmentBoard()) {
        await notify.error('Access Denied.');
        return;
    }

    const card = (state.recruitmentPipeline || []).find(row => row.id === id);
    if (!card) return;
    const confirmed = await notify.confirm(`Delete recruitment card for ${card.candidate_name || card.request_code || id}?`, {
        confirmButtonText: 'Delete',
    });
    if (!confirmed) return;

    await notify.withLoading(async () => {
        await deleteRecruitmentCardFromDB(id);
    }, 'Deleting Recruitment Card', 'Removing recruitment record...');

    await logActivity({
        action: 'recruitment_card.delete',
        entityType: 'recruitment_pipeline',
        entityId: id,
        details: {
            candidate_name: card.candidate_name || '',
            stage: card.stage || '',
            request_code: card.request_code || '',
        },
    });

    resetRecruitmentCardForm();
    renderRecruitmentBoard();
    renderHeadcountRequests();
    await notify.success('Recruitment card deleted.');
}

export function renderRecruitmentBoard() {
    const board = document.getElementById('recruitment-board-columns');
    if (!board) return;

    const canManage = canManageRecruitmentBoard();
    const isAvailable = state.recruitmentPipelineAvailable !== false;
    document.getElementById('mp-recruitment-card')?.classList.toggle('hidden', !canManage);
    populateRecruitmentFormOptions({
        request_id: document.getElementById('mpc-request-id')?.value || '',
        owner_id: document.getElementById('mpc-owner-id')?.value || '',
    });

    if (!isAvailable) {
        board.innerHTML = `
            <div class="col-12">
                <div class="border rounded-4 p-4 text-center bg-light">
                    <div class="small text-uppercase fw-bold text-muted mb-2">Recruitment Board Unavailable</div>
                    <div class="text-muted">Run migration <span class="font-monospace">20260409_manpower_planning.sql</span> in Supabase, then reload the app.</div>
                </div>
            </div>
        `;
        document.getElementById('mp-recruitment-empty-state')?.classList.add('hidden');
        document.getElementById('mp-recruitment-card')?.classList.add('hidden');
        return;
    }

    const selectedRequestId = document.getElementById('mp-board-request-filter')?.value || '';
    const requestMap = new Map((state.headcountRequests || []).map(request => [request.id, request]));
    const cards = (state.recruitmentPipeline || [])
        .map(card => {
            const linkedRequest = requestMap.get(card.request_id) || {};
            const owner = state.db[card.owner_id] || {};
            return {
                ...linkedRequest,
                ...card,
                request_code: card.request_code || linkedRequest.request_code || '',
                department: card.department || linkedRequest.department || '',
                position: card.position || linkedRequest.position || '',
                priority: card.priority || linkedRequest.priority || 'normal',
                target_hire_date: card.target_hire_date || linkedRequest.target_hire_date || null,
                remaining_openings: card.remaining_openings ?? getRequestRemainingOpenings(linkedRequest),
                owner_name: card.owner_name || owner.name || '',
            };
        })
        .filter(card => !selectedRequestId || card.request_id === selectedRequestId)
        .sort((a, b) => {
            const overdueCompare = Number(b.overdue_days || 0) - Number(a.overdue_days || 0);
            if (overdueCompare !== 0) return overdueCompare;
            const priorityOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
            const priorityCompare = (priorityOrder[String(b.priority || 'normal').toLowerCase()] || 0)
                - (priorityOrder[String(a.priority || 'normal').toLowerCase()] || 0);
            if (priorityCompare !== 0) return priorityCompare;
            return Number(b.stage_age_days || 0) - Number(a.stage_age_days || 0);
        });

    document.getElementById('mp-recruitment-empty-state')?.classList.toggle('hidden', cards.length > 0);
    board.innerHTML = '';
    if (cards.length === 0) return;

    RECRUITMENT_STAGES.forEach(stage => {
        const stageCards = cards.filter(card => String(card.stage || '').toLowerCase() === stage);
        const prettyStage = stage.charAt(0).toUpperCase() + stage.slice(1);
        const col = document.createElement('div');
        col.className = 'col';
        col.innerHTML = `
            <div class="border rounded-4 h-100 p-3" style="background: rgba(248,250,252,0.8); min-height: 260px;">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <div class="small text-uppercase fw-bold text-muted">${escapeHTML(prettyStage)}</div>
                        <div class="small text-muted">${stageCards.length} card(s)</div>
                    </div>
                </div>
                <div class="d-flex flex-column gap-3">
                    ${stageCards.length === 0 ? '<div class="small text-muted fst-italic">No cards in this stage.</div>' : stageCards.map(card => {
                        const urgency = getRecruitmentUrgency(card);
                        const currentIndex = RECRUITMENT_STAGES.indexOf(stage);
                        const canMovePrev = canManage && currentIndex > 0;
                        const canMoveNext = canManage && currentIndex < RECRUITMENT_STAGES.length - 1;
                        const remainingOpenings = Number(card.remaining_openings || 0);
                        return `
                            <div class="border rounded-4 p-3 bg-white shadow-sm">
                                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                                    <div>
                                        <div class="fw-semibold">${escapeHTML(card.candidate_name || 'Unnamed Candidate')}</div>
                                        <div class="small text-muted">${escapeHTML(card.request_code || '-')} · ${escapeHTML(card.department || '-')} · ${escapeHTML(card.position || '-')}</div>
                                    </div>
                                    <span class="badge ${getStageBadgeClass(card.stage)}">${escapeHTML(card.stage || stage)}</span>
                                </div>
                                <div class="small ${urgency.className} fw-semibold mb-2">${escapeHTML(urgency.label)}</div>
                                <div class="small text-muted mb-1">Owner: ${escapeHTML(card.owner_name || card.owner_id || '-')}</div>
                                <div class="small text-muted mb-1">Target hire: ${escapeHTML(card.target_hire_date || '-')}</div>
                                <div class="small text-muted mb-2">Remaining openings: ${escapeHTML(String(remainingOpenings))}</div>
                                ${card.notes ? `<div class="small text-muted mb-3">${escapeHTML(card.notes)}</div>` : ''}
                                <div class="d-flex justify-content-between align-items-center gap-2">
                                    <div class="btn-group btn-group-sm">
                                        ${canMovePrev ? `<button class="btn btn-outline-secondary" onclick="window.__app.moveRecruitmentCard('${escapeInlineArg(card.id)}', 'prev')" title="Move backward"><i class="bi bi-arrow-left"></i></button>` : ''}
                                        ${canMoveNext ? `<button class="btn btn-outline-secondary" onclick="window.__app.moveRecruitmentCard('${escapeInlineArg(card.id)}', 'next')" title="Move forward"><i class="bi bi-arrow-right"></i></button>` : ''}
                                    </div>
                                    ${canManage ? `<div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-primary" onclick="window.__app.loadRecruitmentCardForEdit('${escapeInlineArg(card.id)}')" title="Edit recruitment card"><i class="bi bi-pencil"></i></button>
                                        <button class="btn btn-outline-danger" onclick="window.__app.deleteRecruitmentCard('${escapeInlineArg(card.id)}')" title="Delete recruitment card"><i class="bi bi-trash"></i></button>
                                    </div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        board.appendChild(col);
    });
}

export function renderHeadcountRequests() {
    const tbody = document.getElementById('headcount-request-body');
    if (!tbody) return;

    const requests = Array.isArray(state.headcountRequests) ? [...state.headcountRequests] : [];
    const filterStatus = document.getElementById('mpr-filter-status')?.value || '';

    populateHeadcountRequestFormOptions({
        plan_id: document.getElementById('mpr-plan-id')?.value || '',
        department: document.getElementById('mpr-department')?.value || '',
        position: document.getElementById('mpr-position')?.value || '',
        seniority: document.getElementById('mpr-seniority')?.value || '',
    });

    const visibleRequests = requests.filter(request => {
        if (!filterStatus) return true;
        return String(request.approval_status || '').toLowerCase() === filterStatus;
    });

    const pendingCount = requests.filter(req => String(req.approval_status || '').toLowerCase() === 'pending').length;
    const approvedCount = requests.filter(req => String(req.approval_status || '').toLowerCase() === 'approved').length;
    const closedCount = requests.filter(req => ['rejected', 'cancelled'].includes(String(req.approval_status || '').toLowerCase())).length;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = String(value);
    };

    setText('mp-request-pending-count', pendingCount);
    setText('mp-request-approved-count', approvedCount);
    setText('mp-request-closed-count', closedCount);

    tbody.innerHTML = '';
    if (visibleRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4 fst-italic">No headcount requests yet.</td></tr>';
        return;
    }

    visibleRequests.forEach(request => {
        const status = String(request.approval_status || 'pending').toLowerCase();
        const statusClass = status === 'approved'
            ? 'bg-success-subtle text-success border'
            : status === 'pending'
                ? 'bg-warning-subtle text-warning border'
                : 'bg-secondary-subtle text-secondary border';
        const priority = String(request.priority || 'normal').toLowerCase();
        const priorityClass = priority === 'urgent'
            ? 'text-danger'
            : priority === 'high'
                ? 'text-warning'
                : 'text-muted';

        const canEdit = canEditHeadcountRequest(request);
        const canApprove = canApproveHeadcountRequests() && status === 'pending';
        const ownerLabel = request.requested_by_name || request.requested_by || '-';
        const targetHire = request.target_hire_date || '-';
        const planLabel = request.plan_period
            ? `${request.plan_period} · ${request.department} · ${request.position}`
            : `${request.department} · ${request.position}`;
        const remainingOpenings = getRequestRemainingOpenings(request);
        const progressLabel = request.requested_count
            ? `${request.hired_total || 0} hired / ${request.requested_count} requested`
            : 'No target';
        const progressTone = remainingOpenings > 0
            ? (Number(request.pipeline_total || 0) > 0 ? 'text-warning' : 'text-danger')
            : 'text-success';
        const progressNote = remainingOpenings > 0
            ? (Number(request.pipeline_total || 0) > 0 ? `${remainingOpenings} opening(s) still open` : 'Not started')
            : 'Request fully covered';

        tbody.innerHTML += `
            <tr>
                <td class="ps-3">
                    <div class="fw-semibold">${escapeHTML(request.request_code || 'Pending Code')}</div>
                    <div class="small text-muted">${escapeHTML(planLabel)}</div>
                    <div class="small text-muted">${escapeHTML(request.requested_count)} opening(s)</div>
                </td>
                <td>
                    <div class="small fw-semibold">${escapeHTML(request.plan_period || '-')}</div>
                    <div class="small text-muted">${escapeHTML(request.seniority || '-')}</div>
                </td>
                <td>
                    <div class="small fw-semibold ${progressTone}">${escapeHTML(progressLabel)}</div>
                    <div class="small text-muted">${escapeHTML(progressNote)}</div>
                </td>
                <td><span class="small fw-bold ${priorityClass}">${escapeHTML(priority)}</span></td>
                <td>
                    <span class="badge ${statusClass}">${escapeHTML(status)}</span>
                    ${request.approval_note ? `<div class="small text-muted mt-1">${escapeHTML(request.approval_note)}</div>` : ''}
                </td>
                <td>
                    <div class="small fw-semibold">${escapeHTML(ownerLabel)}</div>
                    <div class="small text-muted">${escapeHTML(request.approved_by_name || '')}</div>
                </td>
                <td class="text-end">${escapeHTML(targetHire)}</td>
                <td class="text-end pe-3">
                    <div class="btn-group btn-group-sm">
                        ${canEdit ? `<button class="btn btn-outline-primary" onclick="window.__app.loadHeadcountRequestForEdit('${escapeInlineArg(request.id)}')" title="Edit request"><i class="bi bi-pencil"></i></button>` : ''}
                        ${canApprove ? `<button class="btn btn-outline-success" onclick="window.__app.approveHeadcountRequest('${escapeInlineArg(request.id)}')" title="Approve request"><i class="bi bi-check2"></i></button>` : ''}
                        ${canApprove ? `<button class="btn btn-outline-danger" onclick="window.__app.rejectHeadcountRequest('${escapeInlineArg(request.id)}')" title="Reject request"><i class="bi bi-x-lg"></i></button>` : ''}
                        ${!canApprove && canEdit && status === 'pending' ? `<button class="btn btn-outline-secondary" onclick="window.__app.cancelHeadcountRequest('${escapeInlineArg(request.id)}')" title="Cancel request"><i class="bi bi-slash-circle"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
}

export function loadHeadcountRequestForEdit(id) {
    const request = (state.headcountRequests || []).find(row => row.id === id);
    if (!request || !canEditHeadcountRequest(request)) return;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    populateHeadcountRequestFormOptions(request);
    setValue('mpr-edit-id', request.id);
    setValue('mpr-requested-count', request.requested_count ?? 1);
    setValue('mpr-priority', request.priority || 'normal');
    setValue('mpr-target-hire-date', request.target_hire_date || '');
    setValue('mpr-business-reason', request.business_reason || '');
    document.getElementById('mpr-cancel-btn')?.classList.remove('hidden');
    document.getElementById('mpr-plan-id')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function saveHeadcountRequestData() {
    if (!canAccessManpowerPlanning()) {
        await notify.error('Access Denied.');
        return;
    }

    const values = readHeadcountRequestForm();
    if (!values.department || !values.position || !values.business_reason) {
        await notify.warn('Department, position, and business reason are required.');
        return;
    }
    if (values.requested_count <= 0) {
        await notify.warn('Requested count must be greater than zero.');
        return;
    }

    const existing = values.id
        ? (state.headcountRequests || []).find(row => row.id === values.id)
        : null;
    if (existing && !canEditHeadcountRequest(existing)) {
        await notify.error('You cannot edit this request.');
        return;
    }

    const payload = {
        id: existing?.id || undefined,
        plan_id: values.plan_id || null,
        request_code: existing?.request_code || buildHeadcountRequestCode(),
        department: values.department,
        position: values.position,
        seniority: values.seniority || '',
        requested_count: Math.round(values.requested_count),
        business_reason: values.business_reason,
        priority: values.priority,
        requested_by: existing?.requested_by || state.currentUser?.id || '',
        approved_by: existing?.approved_by || null,
        approval_status: existing?.approval_status || 'pending',
        approval_note: existing?.approval_note || '',
        target_hire_date: values.target_hire_date || null,
    };

    await notify.withLoading(async () => {
        await saveHeadcountRequest(payload);
    }, existing ? 'Updating Headcount Request' : 'Submitting Headcount Request', 'Saving request workflow...');

    await logActivity({
        action: existing ? 'headcount_request.update' : 'headcount_request.create',
        entityType: 'headcount_request',
        entityId: existing?.id || payload.request_code,
        details: {
            request_code: payload.request_code,
            department: payload.department,
            position: payload.position,
            seniority: payload.seniority,
            requested_count: payload.requested_count,
            priority: payload.priority,
        },
    });

    resetHeadcountRequestForm();
    renderHeadcountRequests();
    await notify.success(existing ? 'Headcount request updated.' : 'Headcount request submitted.');
}

async function updateHeadcountRequestDecision(id, approvalStatus, promptTitle) {
    const request = (state.headcountRequests || []).find(row => row.id === id);
    if (!request) return;

    const note = await notify.input({
        title: promptTitle,
        inputLabel: 'Optional note',
        inputPlaceholder: approvalStatus === 'approved' ? 'Approval context or hiring note' : 'Reason for rejection',
        confirmButtonText: approvalStatus === 'approved' ? 'Confirm Approval' : 'Confirm Rejection',
    });
    if (note === null) return;

    await notify.withLoading(async () => {
        await updateHeadcountRequestStatus(id, {
            approval_status: approvalStatus,
            approved_by: state.currentUser?.id || null,
            approval_note: note || '',
        });
    }, approvalStatus === 'approved' ? 'Approving Request' : 'Rejecting Request', 'Updating approval state...');

    await logActivity({
        action: approvalStatus === 'approved' ? 'headcount_request.approve' : 'headcount_request.reject',
        entityType: 'headcount_request',
        entityId: id,
        details: {
            request_code: request.request_code,
            approval_status: approvalStatus,
            approval_note: note || '',
        },
    });

    renderHeadcountRequests();
    await notify.success(approvalStatus === 'approved' ? 'Request approved.' : 'Request rejected.');
}

export async function approveHeadcountRequest(id) {
    if (!canApproveHeadcountRequests()) {
        await notify.error('Access Denied.');
        return;
    }
    await updateHeadcountRequestDecision(id, 'approved', 'Approve Headcount Request');
}

export async function rejectHeadcountRequest(id) {
    if (!canApproveHeadcountRequests()) {
        await notify.error('Access Denied.');
        return;
    }
    await updateHeadcountRequestDecision(id, 'rejected', 'Reject Headcount Request');
}

export async function cancelHeadcountRequest(id) {
    const request = (state.headcountRequests || []).find(row => row.id === id);
    if (!request || !canEditHeadcountRequest(request)) {
        await notify.error('You cannot cancel this request.');
        return;
    }

    const confirmed = await notify.confirm(`Cancel request ${request.request_code || id}?`, {
        confirmButtonText: 'Cancel Request',
    });
    if (!confirmed) return;

    await notify.withLoading(async () => {
        await updateHeadcountRequestStatus(id, {
            approval_status: 'cancelled',
            approved_by: null,
            approval_note: '',
        });
    }, 'Cancelling Request', 'Updating request state...');

    await logActivity({
        action: 'headcount_request.cancel',
        entityType: 'headcount_request',
        entityId: id,
        details: {
            request_code: request.request_code,
        },
    });

    renderHeadcountRequests();
    await notify.success('Request cancelled.');
}

export function loadManpowerPlanForEdit(id) {
    if (!canManageManpowerPlans()) return;
    const plan = (state.manpowerPlans || []).find(row => row.id === id);
    if (!plan) return;

    const options = getManpowerOptionData();
    setSelectOptions('mp-department', options.departments, plan.department || '', '-- Select Department --');
    syncScopedPositionSelect('mp-position', plan.department || '', plan.position || '', '-- Select Position --');
    setSelectOptions('mp-seniority', options.seniorities, plan.seniority || '', '-- Select Seniority --');

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setValue('mp-edit-id', plan.id);
    setValue('mp-period', plan.period || getCurrentPeriodValue());
    setValue('mp-planned-headcount', plan.planned_headcount ?? 0);
    setValue('mp-approved-headcount-input', plan.approved_headcount ?? 0);
    setValue('mp-status', plan.status || 'draft');
    setValue('mp-notes', plan.notes || '');

    document.getElementById('mp-cancel-btn')?.classList.remove('hidden');
    document.getElementById('mp-period')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function saveManpowerPlanData() {
    if (!canManageManpowerPlans()) {
        await notify.error('Access Denied.');
        return;
    }

    const values = readManpowerPlanForm();
    if (!values.period || !values.department || !values.position) {
        await notify.warn('Period, department, and position are required.');
        return;
    }
    if (values.planned_headcount < 0 || values.approved_headcount < 0) {
        await notify.warn('Headcount values cannot be negative.');
        return;
    }

    const existing = values.id
        ? (state.manpowerPlans || []).find(row => row.id === values.id)
        : null;

    const payload = {
        id: existing?.id || undefined,
        period: values.period,
        department: values.department,
        position: values.position,
        seniority: values.seniority || '',
        planned_headcount: Math.round(values.planned_headcount),
        approved_headcount: Math.round(values.approved_headcount),
        status: values.status,
        notes: values.notes,
        created_by: existing?.created_by || state.currentUser?.id || '',
        updated_by: state.currentUser?.id || '',
    };

    await notify.withLoading(async () => {
        await saveManpowerPlan(payload);
    }, existing ? 'Updating Manpower Plan' : 'Saving Manpower Plan', 'Writing planning record...');

    await logActivity({
        action: existing ? 'manpower_plan.update' : 'manpower_plan.create',
        entityType: 'manpower_plan',
        entityId: existing?.id || 'pending',
        details: {
            period: payload.period,
            department: payload.department,
            position: payload.position,
            seniority: payload.seniority,
            planned_headcount: payload.planned_headcount,
            approved_headcount: payload.approved_headcount,
            status: payload.status,
        },
    });

    resetManpowerPlanForm();
    renderManpowerPlanning();
    await notify.success(existing ? 'Manpower plan updated.' : 'Manpower plan saved.');
}

export async function deleteManpowerPlanData(id) {
    if (!canManageManpowerPlans()) {
        await notify.error('Access Denied.');
        return;
    }

    const plan = (state.manpowerPlans || []).find(row => row.id === id);
    if (!plan) return;

    const confirmed = await notify.confirm(
        `Delete manpower plan for ${plan.department} / ${plan.position} (${plan.period})?`,
        { confirmButtonText: 'Delete' }
    );
    if (!confirmed) return;

    await notify.withLoading(async () => {
        await deleteManpowerPlanFromDB(id);
    }, 'Deleting Manpower Plan', 'Removing planning record...');

    await logActivity({
        action: 'manpower_plan.delete',
        entityType: 'manpower_plan',
        entityId: id,
        details: {
            period: plan.period,
            department: plan.department,
            position: plan.position,
            seniority: plan.seniority,
            approved_headcount: plan.approved_headcount,
            filled_headcount: plan.filled_headcount,
        },
    });

    resetManpowerPlanForm();
    renderManpowerPlanning();
    await notify.success('Manpower plan deleted.');
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
    syncScopedPositionSelect('emp-position', '', '', '-- Select Position --');
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
