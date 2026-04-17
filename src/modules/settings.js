// ==================================================
// SETTINGS MODULE — App Config & User Management
// (Superadmin only)
// ==================================================

import { state, isAdmin } from '../lib/store.js';
import { applyBranding } from '../lib/branding.js';
import { createManagedUser, updateManagedEmployeeRole } from '../lib/edge/admin.js';
import { escapeHTML, escapeInlineArg, formatDateTime } from '../lib/utils.js';
import { saveSetting } from './data/settings.js';
import { fetchActivityLogs, logActivity } from './data/activity.js';
import { getDefaultProbationAttendanceRulesJson } from './data/probation.js';
import { isAnyModuleEnabled, isModuleEnabled } from '../config/app-modules.js';
import { requireRecentAuth } from './auth.js';
import * as notify from '../lib/notify.js';

let probationAttendanceRulesDraft = null;

// ---- RENDER SETTINGS PAGE ----
function canAccessSettings() {
    return isAdmin() || state.currentUser?.role === 'manager' || state.currentUser?.role === 'hr';
}

function applySettingsRoleVisibility() {
    const allPanels = ['set-general', 'set-users', 'set-competencies', 'set-kpi', 'set-org'];

    if (isAdmin()) {
        return;
    }

    const managerAllowed = new Set(['set-kpi']);
    if (isAnyModuleEnabled(['assessment', 'tna'])) managerAllowed.add('set-competencies');

    allPanels.forEach(id => {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.toggle('hidden', !managerAllowed.has(id));
    });
}

export async function renderSettings() {
    if (!canAccessSettings()) return;

    applySettingsRoleVisibility();

    if (isAdmin()) {
        renderAppSettings();
        renderUserManagement();
        renderOrgSettings();
        await renderActivityLog();
    }
}

function getDefaultProbationAttendanceRulesObject() {
    return JSON.parse(getDefaultProbationAttendanceRulesJson());
}

function sanitizeProbationRuleKey(value, fallback = 'other') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

function normalizeProbationTierRows(rows = []) {
    const dedup = {};
    rows.forEach((row) => {
        const minQty = Math.max(0, Number(row?.min_qty || 0));
        const points = Math.max(0, Number(row?.points || 0));
        dedup[minQty] = points;
    });

    const normalized = Object.entries(dedup)
        .map(([min_qty, points]) => ({ min_qty: Number(min_qty), points: Number(points) }))
        .sort((a, b) => b.min_qty - a.min_qty);

    return normalized.length > 0 ? normalized : [{ min_qty: 1, points: 1 }];
}

function normalizeProbationAttendanceRulesDraft(rawRules = {}) {
    const defaults = getDefaultProbationAttendanceRulesObject();
    const candidate = rawRules && typeof rawRules === 'object' && !Array.isArray(rawRules) ? rawRules : defaults;
    const rawEvents = candidate.events && typeof candidate.events === 'object' && !Array.isArray(candidate.events)
        ? candidate.events
        : defaults.events;

    const events = Object.entries(rawEvents).map(([key, rule], index) => {
        const safeKey = sanitizeProbationRuleKey(key, `event_${index + 1}`);
        const mode = String(rule?.mode || '').trim().toLowerCase() === 'tiered' || Array.isArray(rule?.tiers)
            ? 'tiered'
            : 'per_qty';

        return {
            key: safeKey,
            label: String(rule?.label || safeKey).trim() || safeKey,
            mode,
            per_qty: Math.max(0, Number(rule?.per_qty || 0)),
            max_points: Math.max(0, Number(rule?.max_points || 0)),
            tiers: normalizeProbationTierRows(rule?.tiers || []),
        };
    });

    return {
        monthly_cap: Math.max(0, Number(candidate.monthly_cap ?? defaults.monthly_cap ?? 20)),
        events: events.length > 0
            ? events
            : Object.entries(defaults.events).map(([key, rule], index) => ({
                key: sanitizeProbationRuleKey(key, `event_${index + 1}`),
                label: String(rule?.label || key).trim() || key,
                mode: String(rule?.mode || '').trim().toLowerCase() === 'tiered' ? 'tiered' : 'per_qty',
                per_qty: Math.max(0, Number(rule?.per_qty || 0)),
                max_points: Math.max(0, Number(rule?.max_points || 0)),
                tiers: normalizeProbationTierRows(rule?.tiers || []),
            })),
    };
}

function serializeProbationAttendanceRulesDraft(draft = probationAttendanceRulesDraft) {
    const normalized = normalizeProbationAttendanceRulesDraft(draft);
    const events = {};

    normalized.events.forEach((event, index) => {
        const key = sanitizeProbationRuleKey(event.key, `event_${index + 1}`);
        const rule = {
            label: String(event.label || key).trim() || key,
            mode: event.mode === 'tiered' ? 'tiered' : 'per_qty',
        };

        if (rule.mode === 'tiered') {
            rule.tiers = normalizeProbationTierRows(event.tiers || []);
        } else {
            rule.per_qty = Math.max(0, Number(event.per_qty || 0));
            rule.max_points = Math.max(0, Number(event.max_points || 0));
        }

        events[key] = rule;
    });

    return {
        monthly_cap: Math.max(0, Number(normalized.monthly_cap || 0)),
        events,
    };
}

function readProbationAttendanceRulesFromState() {
    try {
        const parsed = JSON.parse(state.appSettings?.probation_attendance_rules_json || '{}');
        return normalizeProbationAttendanceRulesDraft(parsed);
    } catch {
        return normalizeProbationAttendanceRulesDraft(getDefaultProbationAttendanceRulesObject());
    }
}

function getProbationAttendanceRulesEditorStateFromDom() {
    const monthlyCapInput = document.getElementById('probation-attendance-monthly-cap');
    const cards = Array.from(document.querySelectorAll('.probation-attendance-event-card'));
    if (!monthlyCapInput || cards.length === 0) {
        return probationAttendanceRulesDraft || readProbationAttendanceRulesFromState();
    }

    return normalizeProbationAttendanceRulesDraft({
        monthly_cap: monthlyCapInput.value,
        events: Object.fromEntries(cards.map((card, index) => {
            const key = card.querySelector('.probation-rule-key')?.value || `event_${index + 1}`;
            const mode = card.querySelector('.probation-rule-mode')?.value || 'per_qty';
            const tiers = Array.from(card.querySelectorAll('.probation-rule-tier-row')).map((row) => ({
                min_qty: row.querySelector('.probation-rule-tier-min')?.value || 0,
                points: row.querySelector('.probation-rule-tier-points')?.value || 0,
            }));

            return [key, {
                label: card.querySelector('.probation-rule-label')?.value || key,
                mode,
                per_qty: card.querySelector('.probation-rule-per-qty')?.value || 0,
                max_points: card.querySelector('.probation-rule-max-points')?.value || 0,
                tiers,
            }];
        })),
    });
}

function renderProbationAttendanceRulesEditor() {
    const mount = document.getElementById('probation-attendance-rules-editor');
    const hiddenInput = document.getElementById('setting-probation_attendance_rules_json');
    if (!mount || !hiddenInput) return;

    const draft = normalizeProbationAttendanceRulesDraft(probationAttendanceRulesDraft || readProbationAttendanceRulesFromState());
    probationAttendanceRulesDraft = draft;
    hiddenInput.value = JSON.stringify(serializeProbationAttendanceRulesDraft(draft), null, 2);

    mount.innerHTML = draft.events.map((event, index) => {
        const isTiered = event.mode === 'tiered';
        const tiersHtml = normalizeProbationTierRows(event.tiers || []).map((tier, tierIndex) => `
            <div class="row g-2 align-items-end probation-rule-tier-row mb-2">
                <div class="col-sm-5">
                    <label class="form-label small text-muted mb-1">Minimum Qty</label>
                    <input type="number" min="0" step="1" class="form-control form-control-sm probation-rule-tier-min" value="${escapeHTML(String(tier.min_qty))}">
                </div>
                <div class="col-sm-5">
                    <label class="form-label small text-muted mb-1">Deduction Points</label>
                    <input type="number" min="0" step="0.1" class="form-control form-control-sm probation-rule-tier-points" value="${escapeHTML(String(tier.points))}">
                </div>
                <div class="col-sm-2">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="window.__app.removeProbationAttendanceRuleTier(${index}, ${tierIndex})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="card border probation-attendance-event-card mb-3">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <div class="fw-semibold small">Attendance Event Rule</div>
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="window.__app.removeProbationAttendanceRuleEvent(${index})">
                        <i class="bi bi-x-lg me-1"></i> Remove
                    </button>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold text-muted">Event Key</label>
                            <input type="text" class="form-control form-control-sm probation-rule-key" value="${escapeHTML(event.key)}" placeholder="e.g. late_in">
                            <div class="form-text">Internal key used when HR logs the event.</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold text-muted">Display Label</label>
                            <input type="text" class="form-control form-control-sm probation-rule-label" value="${escapeHTML(event.label)}" placeholder="e.g. Late Clock In">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold text-muted">Deduction Type</label>
                            <select class="form-select form-select-sm probation-rule-mode" onchange="window.__app.changeProbationAttendanceRuleMode(${index}, this.value)">
                                <option value="per_qty" ${!isTiered ? 'selected' : ''}>Per occurrence</option>
                                <option value="tiered" ${isTiered ? 'selected' : ''}>Tiered thresholds</option>
                            </select>
                        </div>
                    </div>

                    <div class="mt-3 ${isTiered ? 'd-none' : ''}">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-muted">Points Per Occurrence</label>
                                <input type="number" min="0" step="0.1" class="form-control form-control-sm probation-rule-per-qty" value="${escapeHTML(String(event.per_qty || 0))}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-muted">Maximum Points For This Event</label>
                                <input type="number" min="0" step="0.1" class="form-control form-control-sm probation-rule-max-points" value="${escapeHTML(String(event.max_points || 0))}">
                            </div>
                        </div>
                    </div>

                    <div class="mt-3 ${isTiered ? '' : 'd-none'}">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="small fw-bold text-muted">Threshold Rules</div>
                            <button type="button" class="btn btn-outline-primary btn-sm" onclick="window.__app.addProbationAttendanceRuleTier(${index})">
                                <i class="bi bi-plus-circle me-1"></i> Add Tier
                            </button>
                        </div>
                        <div class="small text-muted mb-2">Higher minimum quantity should carry the bigger deduction.</div>
                        ${tiersHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
// ---- APP SETTINGS ----
function renderAppSettings() {
    const { appSettings } = state;
    const fields = [
        { key: 'app_name', label: 'Application Name', placeholder: 'e.g. HR Performance Suite' },
        { key: 'company_name', label: 'Company Name', placeholder: 'e.g. Your Company' },
        { key: 'company_short', label: 'Company Short Name', placeholder: 'e.g. YC' },
        { key: 'department_label', label: 'Department Label', placeholder: 'e.g. Human Resources Department' },
        { key: 'document_logo_url', label: 'Document Logo URL', placeholder: 'https://.../company-logo.png' },
        { key: 'document_default_watermark', label: 'Document Default Watermark', placeholder: 'e.g. Confidential' },
        { key: 'document_footer_text', label: 'Document Footer Text', placeholder: 'e.g. PT Example Indonesia' },
        isAnyModuleEnabled(['assessment', 'tna'])
            ? { key: 'assessment_scale_max', label: 'Assessment Scale Max', placeholder: '10' }
            : null,
        isAnyModuleEnabled(['assessment', 'tna'])
            ? { key: 'assessment_threshold', label: 'Training Threshold (score below this triggers recommendation)', placeholder: '7' }
            : null,
        isModuleEnabled('probation')
            ? { key: 'probation_pass_threshold', label: 'Probation Pass Threshold (minimum final score)', placeholder: '75' }
            : null,
        isModuleEnabled('probation')
            ? { key: 'probation_weight_work', label: 'Probation Work Weight', placeholder: '50' }
            : null,
        isModuleEnabled('probation')
            ? { key: 'probation_weight_managing', label: 'Probation Managing Weight', placeholder: '30' }
            : null,
        isModuleEnabled('probation')
            ? { key: 'probation_weight_attitude', label: 'Probation Attitude Weight', placeholder: '20' }
            : null,
    ].filter(Boolean);

    const container = document.getElementById('settings-app-fields');
    if (!container) return;
    container.innerHTML = '';
    probationAttendanceRulesDraft = readProbationAttendanceRulesFromState();

    fields.forEach(f => {
        const value = appSettings[f.key] || '';

        container.innerHTML += `
      <div class="col-md-6 mb-3">
        <label class="form-label small fw-bold text-muted">${f.label}</label>
        <input type="text" class="form-control" id="setting-${f.key}" value="${escapeHTML(value)}" placeholder="${f.placeholder}">
      </div>`;
    });

    if (isModuleEnabled('probation')) {
        container.innerHTML += `
      <div class="col-12 mb-3">
        <div class="card border">
            <div class="card-header bg-light d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <div class="fw-bold">Probation Attendance Deduction Rules</div>
                    <div class="small text-muted">Configure each attendance event with a friendly form instead of editing JSON directly.</div>
                </div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="window.__app.resetProbationAttendanceRulesTemplate()">
                        <i class="bi bi-arrow-counterclockwise me-1"></i> Reset Default Rules
                    </button>
                    <button type="button" class="btn btn-outline-primary btn-sm" onclick="window.__app.addProbationAttendanceRuleEvent()">
                        <i class="bi bi-plus-circle me-1"></i> Add Event Rule
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="row g-3 mb-3">
                    <div class="col-md-4">
                        <label class="form-label small fw-bold text-muted">Maximum Monthly Deduction</label>
                        <input type="number" min="0" step="0.1" class="form-control" id="probation-attendance-monthly-cap" value="${escapeHTML(String(probationAttendanceRulesDraft.monthly_cap || 0))}">
                        <div class="form-text">Total deduction points in one probation month cannot exceed this cap.</div>
                    </div>
                </div>
                <div id="probation-attendance-rules-editor"></div>
                <input type="hidden" id="setting-probation_attendance_rules_json" value="">
            </div>
        </div>
      </div>`;
    }

    renderProbationAttendanceRulesEditor();
}

export function resetProbationAttendanceRulesTemplate() {
    probationAttendanceRulesDraft = normalizeProbationAttendanceRulesDraft(getDefaultProbationAttendanceRulesObject());
    renderProbationAttendanceRulesEditor();
}

export function addProbationAttendanceRuleEvent() {
    const draft = getProbationAttendanceRulesEditorStateFromDom();
    draft.events.push({
        key: `custom_rule_${draft.events.length + 1}`,
        label: `Custom Rule ${draft.events.length + 1}`,
        mode: 'per_qty',
        per_qty: 1,
        max_points: Math.max(1, Number(draft.monthly_cap || 20)),
        tiers: [{ min_qty: 1, points: 1 }],
    });
    probationAttendanceRulesDraft = draft;
    renderProbationAttendanceRulesEditor();
}

export function removeProbationAttendanceRuleEvent(index) {
    const draft = getProbationAttendanceRulesEditorStateFromDom();
    draft.events = draft.events.filter((_, itemIndex) => itemIndex !== Number(index));
    if (draft.events.length === 0) {
        draft.events = normalizeProbationAttendanceRulesDraft(getDefaultProbationAttendanceRulesObject()).events.slice(0, 1);
    }
    probationAttendanceRulesDraft = draft;
    renderProbationAttendanceRulesEditor();
}

export function changeProbationAttendanceRuleMode(index, mode) {
    const draft = getProbationAttendanceRulesEditorStateFromDom();
    const item = draft.events[Number(index)];
    if (!item) return;
    item.mode = String(mode || 'per_qty') === 'tiered' ? 'tiered' : 'per_qty';
    if (item.mode === 'tiered') {
        item.tiers = normalizeProbationTierRows(item.tiers || []);
    } else {
        item.per_qty = Math.max(0, Number(item.per_qty || 1));
        item.max_points = Math.max(0, Number(item.max_points || draft.monthly_cap || 0));
    }
    probationAttendanceRulesDraft = draft;
    renderProbationAttendanceRulesEditor();
}

export function addProbationAttendanceRuleTier(index) {
    const draft = getProbationAttendanceRulesEditorStateFromDom();
    const item = draft.events[Number(index)];
    if (!item) return;
    item.tiers = normalizeProbationTierRows([...(item.tiers || []), { min_qty: 1, points: 1 }]);
    probationAttendanceRulesDraft = draft;
    renderProbationAttendanceRulesEditor();
}

export function removeProbationAttendanceRuleTier(index, tierIndex) {
    const draft = getProbationAttendanceRulesEditorStateFromDom();
    const item = draft.events[Number(index)];
    if (!item) return;
    item.tiers = normalizeProbationTierRows(
        (item.tiers || []).filter((_, currentTierIndex) => currentTierIndex !== Number(tierIndex)),
    );
    probationAttendanceRulesDraft = draft;
    renderProbationAttendanceRulesEditor();
}

export async function saveAppSettings() {
    if (!(await requireRecentAuth('saving application settings'))) return;
    const fields = [
        'app_name',
        'company_name',
        'company_short',
        'department_label',
        'document_logo_url',
        'document_default_watermark',
        'document_footer_text',
        ...(isAnyModuleEnabled(['assessment', 'tna'])
            ? ['assessment_scale_max', 'assessment_threshold']
            : []),
        ...(isModuleEnabled('probation')
            ? [
                'probation_pass_threshold',
                'probation_weight_work',
                'probation_weight_managing',
                'probation_weight_attitude',
                'probation_attendance_rules_json',
            ]
            : []),
    ];
    const changed = {};

    try {
        await notify.withLoading(async () => {
            const numericKeys = new Set(['assessment_scale_max', 'assessment_threshold', 'probation_pass_threshold', 'probation_weight_work', 'probation_weight_managing', 'probation_weight_attitude']);
            for (const key of fields) {
                const el = document.getElementById(`setting-${key}`);
                if (!el) continue;
                let newVal = el.value.trim();
                if (numericKeys.has(key) && newVal) {
                    const n = Number(newVal);
                    if (!Number.isFinite(n) || n < 0) {
                        throw new Error(`${key.replaceAll('_', ' ')} must be a non-negative number.`);
                    }
                }
                if (key === 'probation_attendance_rules_json' && newVal) {
                    probationAttendanceRulesDraft = getProbationAttendanceRulesEditorStateFromDom();
                    const seenKeys = new Set();
                    probationAttendanceRulesDraft.events.forEach((event, index) => {
                        const safeKey = sanitizeProbationRuleKey(event.key, `event_${index + 1}`);
                        if (seenKeys.has(safeKey)) {
                            throw new Error(`Duplicate probation attendance event key: "${safeKey}".`);
                        }
                        seenKeys.add(safeKey);
                    });
                    newVal = JSON.stringify(serializeProbationAttendanceRulesDraft(probationAttendanceRulesDraft), null, 2);
                    el.value = newVal;
                    const parsed = JSON.parse(newVal);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        throw new Error('Probation attendance rules must be a valid JSON object.');
                    }
                }
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

export { applyBranding };

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
        else if (rec.role === 'director') roleBadge = '<span class="badge bg-info text-dark">Director</span>';
        else if (rec.role === 'hr') roleBadge = '<span class="badge bg-success">HR</span>';

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
            hr: 'hr',
            director: 'director',
            manager: 'manager',
            employee: 'employee',
        },
        confirmButtonText: 'Update Role',
        cancelButtonText: 'Cancel',
    });

    if (role === null) return;

    try {
        await notify.withLoading(async () => {
            await updateManagedEmployeeRole({
                employeeId: rec.id,
                role,
            });
        }, 'Updating Role', `Applying role change for ${rec.name}...`);
        rec.role = role;
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
            return await createManagedUser({
                employeeId: rec.id,
                email: emailVal,
                password: passwordVal,
                mustChangePassword: true,
            });
        }, 'Creating Login', `Provisioning auth account for ${rec.name}...`);

        rec.auth_email = emailVal;
        if (authData?.auth_user_id) rec.auth_id = authData.auth_user_id;
        rec.must_change_password = true;

        await notify.success(`Login created for ${rec.name}.\nEmail: ${emailVal}\nTemporary password has been set.\n\nAsk the user to change the password immediately.`);
        renderUserManagement();
        await renderActivityLog();
    } catch (err) {
        await notify.error('Error creating login: ' + err.message);
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


export function exportOrgConfigJSON() {
    if (!isAdmin()) return;

    const levels = document.getElementById('settings-levels')?.value?.trim() || state.appSettings?.levels || '';
    const deptMap = collectDeptPositions();
    const payload = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        levels,
        dept_positions: deptMap,
        departments: Object.keys(deptMap),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'organization_setup.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export function triggerOrgConfigImport() {
    document.getElementById('org-import-input')?.click();
}

function normalizeOrgImportPayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Expected a JSON object.');
    }

    const levelsRaw = raw.levels ?? raw.organization?.levels ?? '';
    const deptRaw = raw.dept_positions ?? raw.organization?.dept_positions ?? raw.departments_map ?? {};

    let levels = '';
    if (Array.isArray(levelsRaw)) {
        levels = levelsRaw.map(v => String(v || '').trim()).filter(Boolean).join(', ');
    } else {
        levels = String(levelsRaw || '').trim();
    }

    let sourceMap = deptRaw;
    if (typeof sourceMap === 'string') {
        try {
            sourceMap = JSON.parse(sourceMap);
        } catch {
            throw new Error('dept_positions must be an object or valid JSON string.');
        }
    }

    if (!sourceMap || typeof sourceMap !== 'object' || Array.isArray(sourceMap)) {
        throw new Error('dept_positions must be an object map of department to position list.');
    }

    const cleanedMap = {};
    Object.entries(sourceMap).forEach(([deptNameRaw, positionsRaw]) => {
        const deptName = String(deptNameRaw || '').trim();
        if (!deptName) return;

        const arr = Array.isArray(positionsRaw) ? positionsRaw : [];
        const cleanedPositions = arr
            .map(v => String(v || '').trim())
            .filter(Boolean);

        cleanedMap[deptName] = [...new Set(cleanedPositions)];
    });

    if (Object.keys(cleanedMap).length === 0) {
        throw new Error('No valid departments found in import file.');
    }

    return {
        levels,
        deptMap: cleanedMap,
    };
}

export async function importOrgConfigJSON(input) {
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('importing organization setup'))) return;

    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const parsed = JSON.parse(String(e.target?.result || '{}'));
            const normalized = normalizeOrgImportPayload(parsed);
            const deptRows = Object.entries(normalized.deptMap);
            const previewRows = deptRows.slice(0, 8).map(([dept, positions]) => `
                <tr>
                    <td>${escapeHTML(dept)}</td>
                    <td>${positions.length}</td>
                </tr>
            `).join('');

            const proceed = await notify.confirm('', {
                title: 'Confirm Organization Import',
                confirmButtonText: 'Import Now',
                html: `
                    <div class="text-start small">
                        <div class="mb-2"><strong>Seniority levels:</strong> ${escapeHTML(normalized.levels || '(keep current)')}</div>
                        <div class="mb-2"><strong>Total departments:</strong> ${deptRows.length}</div>
                        <div class="table-responsive" style="max-height:220px;">
                            <table class="table table-sm table-bordered mb-0">
                                <thead><tr><th>Department</th><th>Positions</th></tr></thead>
                                <tbody>${previewRows || '<tr><td colspan="2" class="text-center text-muted">No rows</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                `,
            });
            if (!proceed) return;

            const levelsToSave = normalized.levels || state.appSettings?.levels || '';
            const departments = Object.keys(normalized.deptMap).join(', ');

            await notify.withLoading(async () => {
                await saveSetting('levels', levelsToSave);
                await saveSetting('dept_positions', JSON.stringify(normalized.deptMap));
                await saveSetting('departments', departments);
            }, 'Importing Organization', 'Applying organization setup...');

            await logActivity({
                action: 'organization.config.import',
                entityType: 'organization',
                entityId: 'dept_positions',
                details: {
                    levels: levelsToSave,
                    departments: Object.keys(normalized.deptMap),
                    total_departments: Object.keys(normalized.deptMap).length,
                },
            });

            renderOrgSettings();
            await renderActivityLog();
            await notify.success(`Organization setup imported (${Object.keys(normalized.deptMap).length} departments).`);
        } catch (err) {
            await notify.error('Invalid organization JSON: ' + err.message);
        } finally {
            input.value = '';
        }
    };

    reader.readAsText(file);
}
