// ==================================================
// ADMIN MODULE — Competencies Configuration
// (Superadmin only)
// ==================================================

import { state, emit, isAdmin } from '../lib/store.js';
import { escapeHTML } from '../lib/utils.js';
import { saveConfig, deleteConfig } from './data.js';

export function renderAdminList() {
    const listEl = document.getElementById('admin-pos-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Hide form for non-admins
    const formEl = document.getElementById('admin-form-panel');
    if (formEl) formEl.style.display = isAdmin() ? 'block' : 'none';

    const { appConfig } = state;

    if (!appConfig || Object.keys(appConfig).length === 0) {
        listEl.innerHTML = '<li class="list-group-item text-muted fst-italic">No positions configured. Add one on the left.</li>';
        return;
    }

    const positions = Object.keys(appConfig).sort();

    positions.forEach(pos => {
        const comps = appConfig[pos].competencies || [];
        const compCount = comps.length;
        const safePos = escapeHTML(pos);

        // Show competency preview
        let preview = '';
        if (compCount > 0) {
            const previewComps = comps.slice(0, 3).map(c => escapeHTML(c.name)).join(', ');
            const more = compCount > 3 ? ` +${compCount - 3} more` : '';
            preview = `<div class="small text-muted mt-1">${previewComps}${more}</div>`;
        }

        const actions = isAdmin() ? `
      <div>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="window.__app.loadPositionForEdit('${safePos}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="window.__app.deletePositionConfig('${safePos}')"><i class="bi bi-trash"></i></button>
      </div>` : '';

        listEl.innerHTML += `
      <li class="admin-list-item">
        <div>
          <span class="fw-bold fs-6">${safePos}</span>
          <span class="badge bg-primary text-white ms-2">${compCount} Competencies</span>
          ${preview}
        </div>
        ${actions}
      </li>`;
    });
}

export async function savePositionConfig() {
    if (!isAdmin()) { alert('Access Denied'); return; }

    const posName = document.getElementById('admin-pos-name').value.trim();
    const compsText = document.getElementById('admin-pos-comps').value.trim();

    if (!posName) { alert('Please enter a Position Name.'); return; }
    if (!compsText) { alert('Please enter at least one competency.'); return; }

    const competencies = [];
    compsText.split('\n').forEach(line => {
        if (line.trim()) {
            const parts = line.split('|');
            competencies.push({
                name: parts[0].trim(),
                rec: parts[1] ? parts[1].trim() : 'General training recommended.',
                desc: parts[2] ? parts[2].trim() : '',
            });
        }
    });

    try {
        await saveConfig(posName, competencies);
        alert(`Configuration saved! ${competencies.length} competencies for "${posName}".`);
        renderAdminList();
        clearAdminForm();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

export function loadPositionForEdit(posName) {
    if (!isAdmin()) return;
    const config = state.appConfig[posName];
    if (!config) return;

    document.getElementById('admin-pos-name').value = posName;
    document.getElementById('editor-title').innerHTML = `<i class="bi bi-pencil-square"></i> Editing: <span class="text-primary">${escapeHTML(posName)}</span>`;

    let text = '';
    if (config.competencies) {
        config.competencies.forEach(c => { text += `${c.name} | ${c.rec} | ${c.desc}\n`; });
    }
    document.getElementById('admin-pos-comps').value = text.trim();
}

export async function deletePositionConfig(posName) {
    if (!isAdmin()) return;
    if (confirm(`Delete configuration for "${posName}"?`)) {
        await deleteConfig(posName);
        renderAdminList();
    }
}

export function clearAdminForm() {
    document.getElementById('admin-pos-name').value = '';
    document.getElementById('admin-pos-comps').value = '';
    document.getElementById('editor-title').innerHTML = '<i class="bi bi-pencil-square"></i> Add / Edit Position';
}

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
