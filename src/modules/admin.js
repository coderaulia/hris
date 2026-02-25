// ==================================================
// ADMIN MODULE — Competencies Configuration
// (Superadmin only)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML } from '../lib/utils.js';
import { saveConfig, deleteConfig } from './data.js';

let editingPosition = null; // Track which position is being edited

// ---- RENDER POSITION LIST (right side) ----
export function renderAdminList() {
    const listEl = document.getElementById('admin-pos-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const formEl = document.getElementById('admin-form-panel');
    if (formEl) formEl.style.display = isAdmin() ? 'block' : 'none';

    const { appConfig } = state;

    if (!appConfig || Object.keys(appConfig).length === 0) {
        listEl.innerHTML = '<li class="list-group-item text-muted fst-italic">No positions configured yet.</li>';
        return;
    }

    const positions = Object.keys(appConfig).sort();

    positions.forEach(pos => {
        const comps = appConfig[pos].competencies || [];
        const compCount = comps.length;
        const safePos = escapeHTML(pos);
        const isActive = editingPosition === pos;

        let preview = '';
        if (compCount > 0) {
            const previewComps = comps.slice(0, 3).map(c => escapeHTML(c.name)).join(', ');
            const more = compCount > 3 ? ` +${compCount - 3} more` : '';
            preview = `<div class="small text-muted mt-1">${previewComps}${more}</div>`;
        }

        const actions = isAdmin() ? `
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-primary" onclick="window.__app.loadPositionForEdit('${safePos}')" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="window.__app.deletePositionConfig('${safePos}')" title="Delete"><i class="bi bi-trash"></i></button>
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
    if (!isAdmin()) return;
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
    if (!isAdmin()) { alert('Access Denied'); return; }

    const posName = document.getElementById('admin-pos-name').value.trim();
    if (!posName) { alert('Please enter a Position Name.'); return; }

    const competencies = collectCompetenciesFromEditor();
    if (competencies.length === 0) { alert('Please add at least one competency.'); return; }

    try {
        await saveConfig(posName, competencies);
        alert(`Configuration saved! ${competencies.length} competencies for "${posName}".`);
        editingPosition = posName;
        renderAdminList();
        renderCompetencyEditor(); // Re-render to show clean state
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ---- DELETE POSITION CONFIG ----
export async function deletePositionConfig(posName) {
    if (!isAdmin()) return;
    if (confirm(`Delete configuration for "${posName}"?`)) {
        await deleteConfig(posName);
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
    if (!isAdmin()) { alert('Access Denied'); return; }
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const json = JSON.parse(e.target.result);
            let count = 0;
            for (const posName in json) {
                await saveConfig(posName, json[posName].competencies || []);
                count++;
            }
            renderAdminList();
            alert(`Imported ${count} position configs successfully!`);
        } catch (err) {
            alert('Invalid JSON file.');
            console.error(err);
        }
        input.value = '';
    };
    reader.readAsText(file);
}
