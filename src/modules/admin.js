// ==================================================
// ADMIN MODULE — Competencies Configuration
// (Superadmin only)
// ==================================================

import { state, emit, isAdmin, isManager } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, debugError } from '../lib/utils.js';
import { saveConfig, deleteConfig } from './data/config.js';
import { logActivity } from './data/activity.js';
import { requireRecentAuth } from './auth.js';
import * as notify from '../lib/notify.js';

let editingPosition = null; // Track which position is being edited

function canManageCompetencies() {
    return isAdmin() || isManager();
}

function getManagerTeamPositions() {
    if (!isManager() || isAdmin()) return null;
    const managerId = state.currentUser?.id;
    const ownDept = state.db[managerId]?.department || '';
    const positions = new Set();

    if (ownDept) {
        try {
            const deptMap = JSON.parse(state.appSettings?.dept_positions || '{}');
            const scopedPositions = Array.isArray(deptMap[ownDept]) ? deptMap[ownDept] : [];
            scopedPositions.forEach(pos => {
                if (pos) positions.add(pos);
            });
        } catch {
            // ignore malformed dept_positions payload
        }
    }

    Object.values(state.db || {}).forEach(emp => {
        if (!emp || !emp.position || emp.role !== 'employee') return;
        if (emp.manager_id === managerId || (ownDept && emp.department === ownDept)) {
            positions.add(emp.position);
        }
    });

    return positions;
}

function canManagePosition(posName) {
    if (isAdmin()) return true;
    if (!isManager()) return false;
    const managed = getManagerTeamPositions();
    return managed?.has(posName) || false;
}

// ---- RENDER POSITION LIST (right side) ----
export function renderAdminList() {
    const listEl = document.getElementById('admin-pos-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const formEl = document.getElementById('admin-form-panel');
    if (formEl) formEl.style.display = canManageCompetencies() ? 'block' : 'none';

    const { appConfig } = state;

    if (!appConfig || Object.keys(appConfig).length === 0) {
        listEl.innerHTML = '<li class="list-group-item text-muted fst-italic">No positions configured yet.</li>';
        return;
    }

    let positions = Object.keys(appConfig).sort();
    if (isManager() && !isAdmin()) {
        const managed = getManagerTeamPositions();
        positions = positions.filter(pos => managed?.has(pos));
    }

    positions.forEach(pos => {
        const comps = appConfig[pos].competencies || [];
        const compCount = comps.length;
        const safePos = escapeHTML(pos);
        const safePosInline = escapeInlineArg(pos);
        const isActive = editingPosition === pos;

        let preview = '';
        if (compCount > 0) {
            const previewComps = comps.slice(0, 3).map(c => escapeHTML(c.name)).join(', ');
            const more = compCount > 3 ? ` +${compCount - 3} more` : '';
            preview = `<div class="small text-muted mt-1">${previewComps}${more}</div>`;
        }

        const actions = canManagePosition(pos) ? `
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-primary" onclick="window.__app.loadPositionForEdit('${safePosInline}')" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="window.__app.deletePositionConfig('${safePosInline}')" title="Delete"><i class="bi bi-trash"></i></button>
      </div>` : '';

        listEl.innerHTML += `
      <li class="admin-list-item ${isActive ? 'border-primary border-2' : ''}">
        <div>
          <span class="fw-bold fs-6">${safePos}</span>
          <span class="badge bg-primary text-white ms-2">${compCount} Competencies</span>
          ${preview}
        </div>
        ${actions}
      </li>`;
    });
}

// ---- RENDER EDITABLE COMPETENCY ROWS (left side) ----
function renderCompetencyEditor() {
    const container = document.getElementById('comp-editor-rows');
    if (!container) return;
    container.innerHTML = '';

    const config = editingPosition ? state.appConfig[editingPosition] : null;
    const comps = config?.competencies || [];

    if (comps.length === 0 && !editingPosition) {
        container.innerHTML = '<div class="text-muted fst-italic small py-2">Add a position name and competencies to get started.</div>';
        return;
    }

    comps.forEach((c, index) => {
        container.innerHTML += `
        <div class="comp-edit-row border rounded p-2 mb-2 bg-white" data-index="${index}">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge bg-secondary small">#${index + 1}</span>
                <button class="btn btn-sm btn-link text-danger p-0" onclick="window.__app.removeCompetencyRow(${index})" title="Remove"><i class="bi bi-x-circle-fill"></i></button>
            </div>
            <input type="text" class="form-control form-control-sm mb-1 comp-name" value="${escapeHTML(c.name)}" placeholder="Skill Name">
            <input type="text" class="form-control form-control-sm mb-1 comp-rec" value="${escapeHTML(c.rec || '')}" placeholder="Recommended Training">
            <input type="text" class="form-control form-control-sm comp-desc" value="${escapeHTML(c.desc || '')}" placeholder="Description">
        </div>`;
    });
}

// ---- COLLECT ALL COMPETENCIES FROM EDITOR ----
function collectCompetenciesFromEditor() {
    const rows = document.querySelectorAll('#comp-editor-rows .comp-edit-row');
    const competencies = [];
    rows.forEach(row => {
        const name = row.querySelector('.comp-name')?.value?.trim();
        const rec = row.querySelector('.comp-rec')?.value?.trim() || 'General training recommended.';
        const desc = row.querySelector('.comp-desc')?.value?.trim() || '';
        if (name) competencies.push({ name, rec, desc });
    });
    return competencies;
}

// ---- ADD NEW COMPETENCY ROW ----
export function addCompetencyRow() {
    const container = document.getElementById('comp-editor-rows');
    if (!container) return;

    const index = container.querySelectorAll('.comp-edit-row').length;

    const div = document.createElement('div');
    div.className = 'comp-edit-row border rounded p-2 mb-2 bg-white border-success';
    div.dataset.index = index;
    div.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge bg-success small">#${index + 1} (new)</span>
            <button class="btn btn-sm btn-link text-danger p-0" onclick="this.closest('.comp-edit-row').remove()" title="Remove"><i class="bi bi-x-circle-fill"></i></button>
        </div>
        <input type="text" class="form-control form-control-sm mb-1 comp-name" value="" placeholder="Skill Name" autofocus>
        <input type="text" class="form-control form-control-sm mb-1 comp-rec" value="" placeholder="Recommended Training">
        <input type="text" class="form-control form-control-sm comp-desc" value="" placeholder="Description">`;
    container.appendChild(div);

    // Focus the new name input
    const nameInput = div.querySelector('.comp-name');
    if (nameInput) nameInput.focus();

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// ---- REMOVE COMPETENCY ROW ----
export function removeCompetencyRow(index) {
    const rows = document.querySelectorAll('#comp-editor-rows .comp-edit-row');
    if (rows[index]) rows[index].remove();
}

// ---- LOAD POSITION FOR EDIT ----
export function loadPositionForEdit(posName) {
    if (!canManagePosition(posName)) return;
    const config = state.appConfig[posName];
    if (!config) return;

    editingPosition = posName;

    document.getElementById('admin-pos-name').value = posName;
    document.getElementById('editor-title').innerHTML = `<i class="bi bi-pencil-square"></i> Editing: <span class="text-primary">${escapeHTML(posName)}</span>`;

    renderCompetencyEditor();
    renderAdminList(); // Re-render to highlight active position
}

// ---- SAVE POSITION CONFIG ----
export async function savePositionConfig() {
    if (!canManageCompetencies()) { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('saving competency configuration'))) return;

    const posName = document.getElementById('admin-pos-name').value.trim();
    if (!posName) { await notify.warn('Please enter a Position Name.'); return; }

    if (!isAdmin() && !canManagePosition(posName)) {
        await notify.error('Manager can only edit competency config for team member positions.');
        return;
    }

    const competencies = collectCompetenciesFromEditor();
    if (competencies.length === 0) { await notify.warn('Please add at least one competency.'); return; }

    try {
        await notify.withLoading(async () => {
            await saveConfig(posName, competencies);
        }, 'Saving Configuration', `Updating competencies for ${posName}...`);
        await logActivity({
            action: 'competency.config.save',
            entityType: 'competency_config',
            entityId: posName,
            details: {
                position: posName,
                competencies: competencies.length,
            },
        });
        await notify.success(`Configuration saved! ${competencies.length} competencies for "${posName}".`);
        editingPosition = posName;
        renderAdminList();
        renderCompetencyEditor(); // Re-render to show clean state
    } catch (err) {
        await notify.error('Error: ' + err.message);
    }
}

// ---- DELETE POSITION CONFIG ----
export async function deletePositionConfig(posName) {
    if (!canManagePosition(posName)) return;
    if (!(await requireRecentAuth('deleting competency configuration'))) return;
    if (await notify.confirm(`Delete configuration for "${posName}"?`, { confirmButtonText: 'Delete' })) {
        await notify.withLoading(async () => {
            await deleteConfig(posName);
        }, 'Deleting Configuration', `Removing competency config for ${posName}...`);
        await logActivity({
            action: 'competency.config.delete',
            entityType: 'competency_config',
            entityId: posName,
            details: { position: posName },
        });
        if (editingPosition === posName) clearAdminForm();
        renderAdminList();
    }
}

// ---- CLEAR FORM ----
export function clearAdminForm() {
    editingPosition = null;
    document.getElementById('admin-pos-name').value = '';
    document.getElementById('editor-title').innerHTML = '<i class="bi bi-pencil-square"></i> Add / Edit Position';

    const container = document.getElementById('comp-editor-rows');
    if (container) container.innerHTML = '<div class="text-muted fst-italic small py-2">Add a position name and competencies to get started.</div>';

    renderAdminList();
}

// ---- JSON EXPORT/IMPORT ----
export function exportConfigJSON() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.appConfig, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'competencies_config.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export function triggerConfigImport() {
    document.getElementById('config-import').click();
}

export async function importConfigJSON(input) {
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('importing competency configuration'))) return;
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const json = JSON.parse(e.target.result);
            const posNames = Object.keys(json || {});
            const errors = [];
            const normalized = [];

            posNames.forEach(posName => {
                const row = json[posName] || {};
                const competencies = Array.isArray(row.competencies) ? row.competencies : [];
                if (!posName.trim()) {
                    errors.push('Position name cannot be empty.');
                    return;
                }
                const invalid = competencies.find(c => !c || !String(c.name || '').trim());
                if (invalid) {
                    errors.push(`Position "${posName}" has competency row without "name".`);
                    return;
                }
                normalized.push({ posName, competencies });
            });

            if (errors.length > 0) {
                await notify.error(`Import validation failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more error(s)` : ''}`);
                return;
            }

            const previewRows = normalized.slice(0, 10).map(row => `
                <tr>
                    <td>${escapeHTML(row.posName)}</td>
                    <td>${row.competencies.length}</td>
                </tr>
            `).join('');

            const proceed = await notify.confirm('', {
                title: 'Confirm Competency Import',
                confirmButtonText: 'Import Now',
                html: `
                    <div class="text-start small">
                        <div class="mb-2"><strong>Total positions:</strong> ${normalized.length}</div>
                        <div class="table-responsive" style="max-height:220px;">
                            <table class="table table-sm table-bordered mb-0">
                                <thead><tr><th>Position</th><th>Competencies</th></tr></thead>
                                <tbody>${previewRows || '<tr><td colspan="2" class="text-center text-muted">No rows</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                `,
            });
            if (!proceed) return;

            await notify.withLoading(async () => {
                for (const row of normalized) {
                    await saveConfig(row.posName, row.competencies || []);
                }
            }, 'Importing Config', 'Applying validated position configs...');

            await logActivity({
                action: 'competency.config.import',
                entityType: 'competency_config',
                entityId: 'bulk',
                details: {
                    total_positions: normalized.length,
                    total_competencies: normalized.reduce((sum, row) => sum + row.competencies.length, 0),
                },
            });

            renderAdminList();
            await notify.success(`Imported ${normalized.length} position configs successfully!`);
        } catch (err) {
            await notify.error('Invalid JSON file.');
            debugError(err);
        }
        input.value = '';
    };
    reader.readAsText(file);
}
