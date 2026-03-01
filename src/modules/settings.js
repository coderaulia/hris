// ==================================================
// SETTINGS MODULE — App Config & User Management
// (Superadmin only)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, formatDateTime } from '../lib/utils.js';
import { saveSetting, saveEmployee, fetchActivityLogs, logActivity } from './data.js';
import { createAuthUser, requireRecentAuth } from './auth.js';
import * as notify from '../lib/notify.js';

// ---- RENDER SETTINGS PAGE ----
export async function renderSettings() {
    if (!isAdmin()) return;
    renderAppSettings();
    renderUserManagement();
    renderOrgSettings();
    await renderActivityLog();

    // Default to general tab if none active
    setTimeout(() => {
        const activeNav = document.querySelector('#settingsPills .nav-link.active');
        if (activeNav) window.__app.toggleSettingsView(activeNav.dataset.target, activeNav);
    }, 50);
}

// ---- APP SETTINGS ----
function renderAppSettings() {
    const { appSettings } = state;
    const fields = [
        { key: 'app_name', label: 'Application Name', placeholder: 'e.g. HR Performance Suite' },
        { key: 'company_name', label: 'Company Name', placeholder: 'e.g. Warna Emas Indonesia' },
        { key: 'company_short', label: 'Company Short Name', placeholder: 'e.g. WEI' },
        { key: 'department_label', label: 'Department Label', placeholder: 'e.g. Human Resources Department' },
        { key: 'assessment_scale_max', label: 'Assessment Scale Max', placeholder: '10' },
        { key: 'assessment_threshold', label: 'Training Threshold (score below this triggers recommendation)', placeholder: '7' },
    ];

    const container = document.getElementById('settings-app-fields');
    if (!container) return;
    container.innerHTML = '';

    fields.forEach(f => {
        container.innerHTML += `
      <div class="col-md-6 mb-3">
        <label class="form-label small fw-bold text-muted">${f.label}</label>
        <input type="text" class="form-control" id="setting-${f.key}" 
          value="${escapeHTML(appSettings[f.key] || '')}" placeholder="${f.placeholder}">
      </div>`;
    });
}

export async function saveAppSettings() {
    if (!(await requireRecentAuth('saving application settings'))) return;
    const fields = ['app_name', 'company_name', 'company_short', 'department_label', 'assessment_scale_max', 'assessment_threshold'];
    const changed = {};

    try {
        await notify.withLoading(async () => {
            for (const key of fields) {
                const el = document.getElementById(`setting-${key}`);
                if (!el) continue;
                const newVal = el.value.trim();
                const prevVal = state.appSettings[key] || '';
                if (newVal !== prevVal) {
                    changed[key] = { from: prevVal, to: newVal };
                }
                await saveSetting(key, newVal);
            }
        }, 'Saving Settings', 'Updating application settings...');

        if (Object.keys(changed).length > 0) {
            await logActivity({
                action: 'settings.update',
                entityType: 'app_settings',
                entityId: 'global',
                details: changed,
            });
        }
        await notify.success('Settings saved successfully!');
        applyBranding();
        await renderActivityLog();
    } catch (err) {
        await notify.error('Error saving settings: ' + err.message);
    }
}

// Apply branding to UI
export function applyBranding() {
    const { appSettings } = state;
    const appName = appSettings.app_name || 'HR Performance Suite';
    const companyName = appSettings.company_name || '';
    const companyShort = appSettings.company_short || '';
    const companyLabel = companyName && companyShort
        ? `${companyName} (${companyShort})`
        : (companyName || companyShort || 'Company');

    const headerTitle = document.getElementById('app-header-title');
    if (headerTitle) headerTitle.innerText = appName;

    const headerSub = document.getElementById('app-header-subtitle');
    if (headerSub) {
        const dept = appSettings.department_label || 'Human Resources Department';
        const userName = state.currentUser?.name || '';
        const role = state.currentUser?.role || 'employee';
        const roleLabel = role === 'superadmin' ? 'Super Admin' : role === 'manager' ? 'Manager' : 'Employee';
        const roleClass = role === 'superadmin' ? 'bg-danger' : role === 'manager' ? 'bg-warning text-dark' : 'bg-secondary';
        headerSub.innerHTML = `${escapeHTML(dept)} &middot; <span id="user-display-name" class="fw-bold">${escapeHTML(userName)}</span> <span id="user-role-badge" class="badge ms-2 ${roleClass}">${roleLabel}</span>`;
    }

    const loginCompany = document.getElementById('login-company');
    if (loginCompany) loginCompany.innerText = companyLabel;

    const loginApp = document.getElementById('login-app-name');
    if (loginApp) loginApp.innerText = appName;
}

// ---- ORG SETTINGS ----
function renderOrgSettings() {
    const { appSettings } = state;

    // Levels
    const levelsEl = document.getElementById('settings-levels');
    if (levelsEl) levelsEl.value = appSettings.levels || 'Junior, Intermediate, Senior, Lead, Manager, Director';

    // Department → Positions mapping
    renderDeptPositions();
}

function renderDeptPositions() {
    const container = document.getElementById('org-dept-positions-container');
    if (!container) return;
    container.innerHTML = '';

    const { appSettings } = state;
    let deptMap = {};
    try {
        deptMap = JSON.parse(appSettings.dept_positions || '{}');
    } catch {
        // Fallback: migrate from old comma-separated departments
        const oldDepts = (appSettings.departments || '').split(',').map(s => s.trim()).filter(Boolean);
        oldDepts.forEach(d => { deptMap[d] = []; });
    }

    // If empty, show a default placeholder
    if (Object.keys(deptMap).length === 0) {
        container.innerHTML = '<div class="text-muted fst-italic small py-2">No departments configured yet. Click "Add Department" below.</div>';
        return;
    }

    Object.keys(deptMap).forEach((deptName, deptIdx) => {
        const positions = deptMap[deptName] || [];
        const safeDept = escapeHTML(deptName);

        let positionsHtml = '';
        positions.forEach((pos, posIdx) => {
            positionsHtml += `
            <div class="input-group input-group-sm mb-1">
                <input type="text" class="form-control dept-pos-input" value="${escapeHTML(pos)}" data-dept="${safeDept}" placeholder="Position name">
                <button class="btn btn-outline-danger btn-sm" type="button" onclick="this.closest('.input-group').remove()"><i class="bi bi-x"></i></button>
            </div>`;
        });

        container.innerHTML += `
        <div class="card border mb-3 org-dept-card" data-dept-name="${safeDept}">
            <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <i class="bi bi-building text-success"></i>
                    <input type="text" class="form-control form-control-sm fw-bold dept-name-input" value="${safeDept}" placeholder="Department Name" style="max-width: 300px;">
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.org-dept-card').remove()" title="Remove Department"><i class="bi bi-trash"></i></button>
            </div>
            <div class="card-body py-2">
                <div class="dept-positions-list">
                    ${positionsHtml}
                </div>
                <button class="btn btn-sm btn-outline-primary mt-1" onclick="window.__app.addOrgPosition(this)"><i class="bi bi-plus me-1"></i>Add Position</button>
            </div>
        </div>`;
    });
}

export function addOrgDepartment() {
    const container = document.getElementById('org-dept-positions-container');
    if (!container) return;

    // Remove the "no departments" placeholder if present
    const placeholder = container.querySelector('.text-muted');
    if (placeholder) placeholder.remove();

    const card = document.createElement('div');
    card.className = 'card border mb-3 org-dept-card border-success';
    card.innerHTML = `
        <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2 flex-grow-1">
                <i class="bi bi-building text-success"></i>
                <input type="text" class="form-control form-control-sm fw-bold dept-name-input" value="" placeholder="New Department Name" style="max-width: 300px;" autofocus>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.org-dept-card').remove()" title="Remove Department"><i class="bi bi-trash"></i></button>
        </div>
        <div class="card-body py-2">
            <div class="dept-positions-list"></div>
            <button class="btn btn-sm btn-outline-primary mt-1" onclick="window.__app.addOrgPosition(this)"><i class="bi bi-plus me-1"></i>Add Position</button>
        </div>`;
    container.appendChild(card);
    card.querySelector('.dept-name-input').focus();
}

export function addOrgPosition(btn) {
    const list = btn.closest('.card-body').querySelector('.dept-positions-list');
    const div = document.createElement('div');
    div.className = 'input-group input-group-sm mb-1';
    div.innerHTML = `
        <input type="text" class="form-control dept-pos-input" value="" placeholder="Position name">
        <button class="btn btn-outline-danger btn-sm" type="button" onclick="this.closest('.input-group').remove()"><i class="bi bi-x"></i></button>`;
    list.appendChild(div);
    div.querySelector('input').focus();
}

function collectDeptPositions() {
    const cards = document.querySelectorAll('#org-dept-positions-container .org-dept-card');
    const deptMap = {};
    cards.forEach(card => {
        const deptName = card.querySelector('.dept-name-input')?.value?.trim();
        if (!deptName) return;
        const positions = [];
        card.querySelectorAll('.dept-pos-input').forEach(inp => {
            const val = inp.value.trim();
            if (val) positions.push(val);
        });
        deptMap[deptName] = positions;
    });
    return deptMap;
}

export async function saveOrgConfig() {
    if (!(await requireRecentAuth('updating organization configuration'))) return;
    try {
        const levels = document.getElementById('settings-levels').value.trim();
        const deptMap = collectDeptPositions();
        const deptNames = Object.keys(deptMap).join(', ');

        await notify.withLoading(async () => {
            await saveSetting('levels', levels);
            await saveSetting('dept_positions', JSON.stringify(deptMap));
            await saveSetting('departments', deptNames);
        }, 'Saving Organization', 'Updating department and position map...');

        await logActivity({
            action: 'organization.config.update',
            entityType: 'organization',
            entityId: 'dept_positions',
            details: {
                levels,
                departments: Object.keys(deptMap),
                total_departments: Object.keys(deptMap).length,
            },
        });

        await notify.success('Organization settings saved successfully!');
        await renderActivityLog();
    } catch (err) {
        await notify.error('Error saving organization settings: ' + err.message);
    }
}

// ---- USER MANAGEMENT ----
function renderUserManagement() {
    const tbody = document.getElementById('user-mgmt-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { db } = state;
    const sortedIds = Object.keys(db).sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''));

    if (sortedIds.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No users yet. Add employees first.</td></tr>';
        return;
    }

    sortedIds.forEach(id => {
        const rec = db[id];
        let roleBadge = '<span class="badge bg-secondary">Employee</span>';
        if (rec.role === 'superadmin') roleBadge = '<span class="badge bg-danger">Super Admin</span>';
        else if (rec.role === 'manager') roleBadge = '<span class="badge bg-warning text-dark">Manager</span>';

        const authStatus = rec.auth_email
            ? `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>${escapeHTML(rec.auth_email)}</span>`
            : '<span class="badge bg-light text-muted border">No login</span>';
        const mustChangeBadge = rec.must_change_password
            ? '<span class="badge bg-warning text-dark ms-1">Temp Password</span>'
            : '';

        tbody.innerHTML += `
      <tr>
        <td class="font-monospace small">${escapeHTML(rec.id)}</td>
        <td class="fw-bold">${escapeHTML(rec.name)}</td>
        <td>${escapeHTML(rec.position)}</td>
        <td class="text-center">${roleBadge}</td>
        <td>${authStatus}${mustChangeBadge}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="window.__app.editUserRole('${escapeInlineArg(rec.id)}')" title="Change Role"><i class="bi bi-shield-lock"></i></button>
            <button class="btn btn-outline-success" onclick="window.__app.setupUserLogin('${escapeInlineArg(rec.id)}')" title="Setup Login"><i class="bi bi-key"></i></button>
          </div>
        </td>
      </tr>`;
    });
}

// ---- EDIT USER ROLE ----
export async function editUserRole(empId) {
    if (!(await requireRecentAuth('changing user role'))) return;
    const rec = state.db[empId];
    if (!rec) return;

    const role = await notify.input({
        title: `Change role for ${rec.name}`,
        input: 'select',
        inputLabel: `Current role: ${rec.role}`,
        inputValue: rec.role,
        inputOptions: {
            superadmin: 'superadmin',
            manager: 'manager',
            employee: 'employee',
        },
        confirmButtonText: 'Update Role',
        cancelButtonText: 'Cancel',
    });

    if (role === null) return;

    const oldRole = rec.role;
    rec.role = role;
    try {
        await notify.withLoading(async () => {
            await saveEmployee(rec);
        }, 'Updating Role', `Applying role change for ${rec.name}...`);
        await logActivity({
            action: 'user.role.change',
            entityType: 'employee',
            entityId: rec.id,
            details: {
                employee_name: rec.name,
                previous_role: oldRole,
                new_role: role,
            },
        });
        await notify.success(`${rec.name} is now "${role}"`);
        renderUserManagement();
        await renderActivityLog();
    } catch (err) {
        await notify.error('Error: ' + err.message);
    }
}

// ---- SETUP USER LOGIN ----
export async function setupUserLogin(empId) {
    if (!(await requireRecentAuth('creating account credentials'))) return;
    const rec = state.db[empId];
    if (!rec) return;

    const email = await notify.input({
        title: `Setup login for ${rec.name}`,
        input: 'email',
        inputLabel: 'Email address',
        inputValue: rec.auth_email || '',
        inputPlaceholder: 'name@company.com',
        confirmButtonText: 'Continue',
        validate: value => {
            const v = String(value || '').trim();
            if (!v) return 'Email address is required.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
            return null;
        },
    });
    if (email === null) return;
    const emailVal = String(email).trim();

    const password = await notify.input({
        title: `Temporary password for ${rec.name}`,
        input: 'password',
        inputLabel: 'Minimum 6 characters',
        confirmButtonText: 'Create Login',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        validate: value => {
            const v = String(value || '');
            if (!v || v.length < 6) return 'Password must be at least 6 characters.';
            return null;
        },
    });
    if (password === null) return;
    const passwordVal = String(password);

    try {
        const authData = await notify.withLoading(async () => {
            return await createAuthUser(emailVal, passwordVal);
        }, 'Creating Login', `Provisioning auth account for ${rec.name}...`);

        rec.auth_email = emailVal;
        if (authData?.user?.id) rec.auth_id = authData.user.id;
        rec.must_change_password = true;
        await saveEmployee(rec);
        await logActivity({
            action: 'user.login.setup',
            entityType: 'employee',
            entityId: rec.id,
            details: {
                employee_name: rec.name,
                auth_email: emailVal,
                auth_user_id: authData?.user?.id || null,
                must_change_password: true,
            },
        });

        await notify.success(`Login created for ${rec.name}.\nEmail: ${emailVal}\nTemporary password has been set.\n\nAsk the user to change the password immediately.`);
        renderUserManagement();
        await renderActivityLog();
    } catch (err) {
        // If user already exists, just update the email
        if (err.message?.includes('already registered') || err.message?.includes('already been registered')) {
            rec.auth_email = emailVal;
            rec.must_change_password = true;
            await saveEmployee(rec);
            await logActivity({
                action: 'user.login.email_update',
                entityType: 'employee',
                entityId: rec.id,
                details: {
                    employee_name: rec.name,
                    auth_email: emailVal,
                    reason: 'auth_user_exists',
                    must_change_password: true,
                },
            });
            await notify.info(`Email updated for ${rec.name}. User already exists in auth system.`);
            renderUserManagement();
            await renderActivityLog();
        } else {
            await notify.error('Error creating login: ' + err.message);
        }
    }
}

async function renderActivityLog() {
    const tbody = document.getElementById('activity-log-tbody');
    if (!tbody) return;

    await fetchActivityLogs(120);
    const logs = state.activityLogs || [];
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No activity logs found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
        const actor = state.db[log.actor_employee_id]?.name || log.actor_employee_id || '-';
        const details = log.details && typeof log.details === 'object'
            ? Object.entries(log.details).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' | ')
            : '-';
        tbody.innerHTML += `
      <tr>
        <td class="small">${escapeHTML(formatDateTime(log.created_at))}</td>
        <td class="small fw-bold">${escapeHTML(actor)}</td>
        <td class="small"><span class="badge bg-light text-dark border">${escapeHTML(log.action || '-')}</span></td>
        <td class="small text-muted">${escapeHTML(details || '-')}</td>
      </tr>`;
    });
}
