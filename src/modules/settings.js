// ==================================================
// SETTINGS MODULE — App Config & User Management
// (Superadmin only)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML } from '../lib/utils.js';
import { saveSetting, saveEmployee, deleteEmployee, fetchEmployees } from './data.js';
import { createAuthUser } from './auth.js';

// ---- RENDER SETTINGS PAGE ----
export function renderSettings() {
    if (!isAdmin()) return;
    renderAppSettings();
    renderUserManagement();
    renderOrgSettings();

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
    const fields = ['app_name', 'company_name', 'company_short', 'department_label', 'assessment_scale_max', 'assessment_threshold'];

    try {
        for (const key of fields) {
            const el = document.getElementById(`setting-${key}`);
            if (el) await saveSetting(key, el.value.trim());
        }
        alert('Settings saved successfully!');
        applyBranding();
    } catch (err) {
        alert('Error saving settings: ' + err.message);
    }
}

// Apply branding to UI
export function applyBranding() {
    const { appSettings } = state;
    const headerTitle = document.getElementById('app-header-title');
    if (headerTitle) headerTitle.innerText = appSettings.app_name || 'HR Performance Suite';

    const headerSub = document.getElementById('app-header-subtitle');
    if (headerSub) {
        const dept = appSettings.department_label || 'Human Resources Department';
        const userName = state.currentUser?.name || '';
        headerSub.innerHTML = `${dept} &middot; <span class="fw-bold">${escapeHTML(userName)}</span>`;
    }

    const loginCompany = document.getElementById('login-company');
    if (loginCompany) loginCompany.innerText = appSettings.company_name || 'Company';

    const loginApp = document.getElementById('login-app-name');
    if (loginApp) loginApp.innerText = appSettings.app_name || 'HR Performance Suite';
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
    try {
        const levels = document.getElementById('settings-levels').value.trim();
        await saveSetting('levels', levels);

        // Save department→positions mapping as JSON
        const deptMap = collectDeptPositions();
        await saveSetting('dept_positions', JSON.stringify(deptMap));

        // Also save a flat departments list for backward compat
        const deptNames = Object.keys(deptMap).join(', ');
        await saveSetting('departments', deptNames);

        alert('Organization settings saved successfully!');
    } catch (err) {
        alert('Error saving organization settings: ' + err.message);
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

        tbody.innerHTML += `
      <tr>
        <td class="font-monospace small">${escapeHTML(rec.id)}</td>
        <td class="fw-bold">${escapeHTML(rec.name)}</td>
        <td>${escapeHTML(rec.position)}</td>
        <td class="text-center">${roleBadge}</td>
        <td>${authStatus}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="window.__app.editUserRole('${escapeHTML(rec.id)}')" title="Change Role"><i class="bi bi-shield-lock"></i></button>
            <button class="btn btn-outline-success" onclick="window.__app.setupUserLogin('${escapeHTML(rec.id)}')" title="Setup Login"><i class="bi bi-key"></i></button>
          </div>
        </td>
      </tr>`;
    });
}

// ---- EDIT USER ROLE ----
export async function editUserRole(empId) {
    const rec = state.db[empId];
    if (!rec) return;

    const role = prompt(
        `Change role for ${rec.name}:\n\nCurrent: ${rec.role}\n\nEnter new role:\n- superadmin\n- manager\n- employee`,
        rec.role
    );

    if (!role) return;
    if (!['superadmin', 'manager', 'employee'].includes(role)) {
        alert('Invalid role. Must be: superadmin, manager, or employee');
        return;
    }

    rec.role = role;
    try {
        await saveEmployee(rec);
        alert(`${rec.name} is now "${role}"`);
        renderUserManagement();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ---- SETUP USER LOGIN ----
export async function setupUserLogin(empId) {
    const rec = state.db[empId];
    if (!rec) return;

    const email = prompt(`Setup login for ${rec.name}\n\nEnter email address:`, rec.auth_email || '');
    if (!email) return;

    const password = prompt(`Enter temporary password for ${rec.name}\n(min 6 characters):`);
    if (!password || password.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
    }

    try {
        const authData = await createAuthUser(email, password);

        rec.auth_email = email;
        if (authData?.user?.id) rec.auth_id = authData.user.id;
        await saveEmployee(rec);

        alert(`Login created for ${rec.name}!\nEmail: ${email}\nPassword: ${password}\n\nNote: User may need to confirm email (check Supabase auth settings).`);
        renderUserManagement();
    } catch (err) {
        // If user already exists, just update the email
        if (err.message?.includes('already registered') || err.message?.includes('already been registered')) {
            rec.auth_email = email;
            await saveEmployee(rec);
            alert(`Email updated for ${rec.name}. User already exists in auth system.`);
            renderUserManagement();
        } else {
            alert('Error creating login: ' + err.message);
        }
    }
}
