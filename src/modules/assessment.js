// ==================================================
// ASSESSMENT MODULE
// ==================================================

import { state, emit, isEmployee, isManager } from '../lib/store.js';
import { escapeHTML, getDepartment } from '../lib/utils.js';
import { saveEmployee } from './data.js';

// ---- SELF ASSESSMENT (Employee fast-track) ----
export function initiateSelfAssessment(clickedId) {
    const targetId = String(clickedId).trim();
    const currentId = String(state.currentUser.id).trim();

    if (targetId !== currentId) {
        alert(`Security Violation: You are logged in as ID ${currentId}, but tried to assess ID ${targetId}.`);
        return;
    }

    const rec = state.db[targetId];
    if (!rec) { alert('Error: Employee Record not found.'); return; }

    // Employee must have been assessed by manager first
    if ((!rec.scores || rec.scores.length === 0) && rec.percentage === 0) {
        alert('Your manager has not completed your assessment yet. Please wait for manager assessment before self-assessing.');
        return;
    }

    state.currentSession = {
        id: rec.id, name: rec.name, join_date: rec.join_date,
        seniority: rec.seniority, scores: [], position: rec.position,
    };

    if (rec.self_scores && rec.self_scores.length > 0) {
        state.currentSession.scores = rec.self_scores;
        state.currentSession.isEditing = true;
    }

    emit('nav:switchTab', 'tab-assessment');

    document.getElementById('step-login').classList.add('hidden');
    document.getElementById('step-form').classList.remove('hidden');

    refreshPosDropdown();

    setTimeout(() => {
        const posSelect = document.getElementById('inp-position');
        if (posSelect) {
            posSelect.value = rec.position;
            if (state.appConfig[rec.position]) {
                posSelect.disabled = true;
                renderQuestions(state.currentSession.isEditing);
            } else {
                alert(`Warning: The position "${rec.position}" was not found in the Competency Config.`);
                posSelect.disabled = false;
            }
        }
    }, 100);
}

// ---- RENDER PENDING LIST ----
export function renderPendingList() {
    const { currentUser, db, appSettings } = state;
    if (!currentUser) return;

    // Load dynamic seniority levels
    const senEl = document.getElementById('inp-seniority');
    if (senEl) {
        const levels = (appSettings?.levels || 'Junior, Intermediate, Senior, Lead, Manager, Director').split(',').map(s => s.trim()).filter(Boolean);
        const prevVal = senEl.value;
        senEl.innerHTML = '<option value="">-- Level --</option>';
        levels.forEach(l => {
            senEl.innerHTML += `<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`;
        });
        if (prevVal) senEl.value = prevVal;
    }

    if (isEmployee()) {
        // Employee view: hide selector, show their own info
        const sel = document.getElementById('inp-pending-select');
        if (sel && sel.closest('.alert')) sel.closest('.alert').style.display = 'none';

        const rec = db[currentUser.id];
        if (rec) {
            document.getElementById('inp-id').value = rec.id;
            document.getElementById('inp-name').value = rec.name;
            const joinEl = document.getElementById('inp-join-date');
            if (joinEl && rec.join_date) {
                try {
                    const d = new Date(rec.join_date);
                    joinEl.value = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
                } catch { joinEl.value = ''; }
            }
            document.getElementById('inp-seniority').value = rec.seniority;
            ['inp-id', 'inp-name', 'inp-join-date', 'inp-seniority'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = true;
            });
        }

        const startBtn = document.querySelector('#step-login .btn-primary');
        if (startBtn) startBtn.innerHTML = '<i class="bi bi-pencil-square"></i> Start Self-Assessment';
        return;
    }

    // MANAGER / SUPERADMIN LOGIC
    const sel = document.getElementById('inp-pending-select');
    if (!sel) return;

    if (sel.closest('.alert')) sel.closest('.alert').style.display = 'block';
    ['inp-id', 'inp-name', 'inp-join-date', 'inp-seniority'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });

    sel.innerHTML = '<option value="">-- Select Employee to Assess --</option>';

    let keys = Object.keys(db);
    if (currentUser.role === 'manager') {
        const mgrRec = db[currentUser.id];
        if (mgrRec && mgrRec.department) {
            keys = keys.filter(id => db[id].department === mgrRec.department && id !== currentUser.id);
        } else {
            keys = keys.filter(id => db[id].manager_id === currentUser.id);
        }
    }
    // Superadmin can assess anyone
    keys.sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''));

    keys.forEach(id => {
        const rec = db[id];
        const hasMgrScore = rec.percentage > 0 ? '✅ Assessed' : '⏳ Pending';
        const hasSelfScore = rec.self_percentage > 0 ? ' | Self: ✅' : ' | Self: ⏳';
        sel.innerHTML += `<option value="${escapeHTML(rec.id)}">${escapeHTML(rec.name)} (${escapeHTML(rec.position)}) - ${hasMgrScore}${hasSelfScore}</option>`;
    });
}

// ---- LOAD PENDING ----
export function loadPendingEmployee() {
    if (isEmployee()) return;
    const id = document.getElementById('inp-pending-select').value;
    if (!id) return;

    const rec = state.db[id];
    if (rec) {
        document.getElementById('inp-id').value = rec.id;
        document.getElementById('inp-name').value = rec.name;
        const joinEl = document.getElementById('inp-join-date');
        if (joinEl && rec.join_date) {
            try {
                const d = new Date(rec.join_date);
                joinEl.value = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
            } catch { joinEl.value = ''; }
        }
        document.getElementById('inp-seniority').value = rec.seniority;
    }
}

// ---- START ASSESSMENT ----
export function startAssessment() {
    const { currentUser, db } = state;
    let targetId = null;

    if (isEmployee()) {
        targetId = currentUser.id;
    } else {
        targetId = document.getElementById('inp-id').value.trim();
    }

    if (!targetId) { alert('Error: No Employee ID identified.'); return; }

    const rec = db[targetId];
    if (!rec) { alert('Employee Record not found in database.'); return; }

    if (!state.currentSession.isEditing) {
        if (isManager() && !isEmployee() && rec.percentage > 0) {
            if (!confirm(`Warning: ${rec.name} has already been assessed. Overwrite?`)) return;
        }

        state.currentSession = {
            id: rec.id, name: rec.name, join_date: rec.join_date,
            seniority: rec.seniority, scores: [], position: rec.position,
        };

        if (isEmployee()) {
            if (rec.self_scores && rec.self_scores.length > 0) {
                state.currentSession.scores = rec.self_scores;
                state.currentSession.isEditing = true;
            }
        }
    } else {
        if (!isEmployee()) {
            state.currentSession.seniority = document.getElementById('inp-seniority').value;
            state.currentSession.join_date = document.getElementById('inp-join-date').value;
        }
        state.currentSession.scores = [];
    }

    document.getElementById('step-login').classList.add('hidden');
    document.getElementById('step-form').classList.remove('hidden');

    refreshPosDropdown();
    const posSelect = document.getElementById('inp-position');
    const targetPos = state.currentSession.position;

    if (targetPos) {
        setTimeout(() => {
            for (let i = 0; i < posSelect.options.length; i++) {
                if (posSelect.options[i].value === targetPos) {
                    posSelect.selectedIndex = i;
                    break;
                }
            }
            renderQuestions(state.currentSession.isEditing);
            posSelect.disabled = isEmployee();
        }, 100);
    }
}

// ---- REFRESH POSITION DROPDOWN ----
export function refreshPosDropdown() {
    const sel = document.getElementById('inp-position');
    sel.innerHTML = '<option value="">-- Select Position --</option>';
    if (state.appConfig) {
        for (const pos in state.appConfig) {
            sel.innerHTML += `<option value="${escapeHTML(pos)}">${escapeHTML(pos)}</option>`;
        }
    }
}

// ---- RENDER QUESTIONS ----
export function renderQuestions(isEdit = false) {
    const area = document.getElementById('questions-area');
    area.innerHTML = '';

    const position = document.getElementById('inp-position').value;
    if (!position || !state.appConfig[position]) {
        area.innerHTML = '<div class="alert alert-warning">Please select a valid position to load competencies.</div>';
        return;
    }

    const competencies = state.appConfig[position].competencies || [];
    const maxScale = parseInt(state.appSettings?.assessment_scale_max || '10');

    // Show context for employee: manager's scores
    if (isEmployee()) {
        const rec = state.db[state.currentUser.id];
        if (rec?.scores?.length > 0) {
            area.innerHTML += `
        <div class="alert alert-info mb-3">
          <i class="bi bi-info-circle me-1"></i>
          <strong>Manager's Assessment:</strong> Your manager has completed your assessment. 
          Review their scores below and provide your self-assessment.
        </div>`;
        }
    }

    competencies.forEach((comp, index) => {
        let oldVal = Math.round(maxScale / 2), oldNote = '';
        if (isEdit && state.currentSession.scores) {
            const found = state.currentSession.scores.find(s => s.q === comp.name);
            if (found) { oldVal = found.s; oldNote = found.n || ''; }
        }

        // Show manager score for employees
        let mgrScoreHtml = '';
        if (isEmployee()) {
            const rec = state.db[state.currentUser.id];
            if (rec?.scores) {
                const mgrScore = rec.scores.find(s => s.q === comp.name);
                if (mgrScore) {
                    mgrScoreHtml = `<div class="badge bg-primary ms-2">Manager Score: ${mgrScore.s}/${maxScale}</div>`;
                }
            }
        }

        area.innerHTML += `
      <div class="card mb-3 shadow-sm border-0">
        <div class="card-body">
          <label class="form-label fw-bold mb-1">${escapeHTML(comp.name)}${mgrScoreHtml}</label>
          <p class="small text-muted mb-2">${escapeHTML(comp.desc || 'Rate proficiency level.')}</p>
          ${comp.rec ? `<p class="small text-info mb-2"><i class="bi bi-lightbulb me-1"></i>Recommended Training: ${escapeHTML(comp.rec)}</p>` : ''}
          <div class="row g-3">
            <div class="col-md-4">
              <div class="d-flex justify-content-between mb-1">
                <span class="small text-muted">Score (1-${maxScale})</span>
                <span class="fw-bold text-primary" id="val-${index}">${oldVal}</span>
              </div>
              <input type="range" class="form-range" min="1" max="${maxScale}" step="1" 
                id="q-${index}" value="${oldVal}" 
                oninput="document.getElementById('val-${index}').innerText = this.value">
              <div class="d-flex justify-content-between small text-muted" style="font-size: 10px;">
                <span>Novice</span><span>Expert</span>
              </div>
            </div>
            <div class="col-md-8">
              <textarea class="form-control form-control-sm" id="note-${index}" 
                placeholder="Evidence / Example..." rows="2">${escapeHTML(oldNote)}</textarea>
            </div>
          </div>
        </div>
      </div>`;
    });
}

// ---- REVIEW ----
export function reviewAssessment() {
    const pos = document.getElementById('inp-position').value;
    if (!pos || !state.appConfig[pos]) { alert('Error: Position is missing.'); return; }

    const comps = state.appConfig[pos].competencies;
    let tempScores = [];

    comps.forEach((c, index) => {
        const valEl = document.getElementById(`q-${index}`);
        const noteEl = document.getElementById(`note-${index}`);
        if (valEl) {
            tempScores.push({ q: c.name, s: parseInt(valEl.value), n: noteEl ? noteEl.value.trim() : '' });
        }
    });

    state.currentSession.position = pos;
    state.currentSession.scores = tempScores;

    const revArea = document.getElementById('review-area');
    revArea.innerHTML = '';
    const maxScale = parseInt(state.appSettings?.assessment_scale_max || '10');

    tempScores.forEach(item => {
        revArea.innerHTML += `
      <div class="d-flex justify-content-between border-bottom py-2">
        <div>
          <div class="fw-bold small">${escapeHTML(item.q)}</div>
          <div class="text-muted fst-italic" style="font-size: 11px;">${item.n ? '"' + escapeHTML(item.n) + '"' : ''}</div>
        </div>
        <div class="fw-bold text-primary fs-5 ms-3">${item.s}/${maxScale}</div>
      </div>`;
    });

    document.getElementById('step-form').classList.add('hidden');
    document.getElementById('step-review').classList.remove('hidden');
    window.scrollTo(0, 0);
}

// ---- FINAL SUBMIT ----
export async function finalSubmit() {
    const { currentSession, currentUser, db } = state;
    if (!currentSession.scores || currentSession.scores.length === 0) {
        alert('Error: No scores found.'); return;
    }

    const maxScale = parseInt(state.appSettings?.assessment_scale_max || '10');
    let total = 0;
    let maxPoints = currentSession.scores.length * maxScale || 1;
    currentSession.scores.forEach(x => total += x.s);
    let pct = Math.round((total / maxPoints) * 100);

    const rec = db[currentSession.id];
    rec.training_history = rec.training_history || [];
    if (!rec.department) rec.department = getDepartment(rec.position);

    if (isEmployee()) {
        rec.self_scores = currentSession.scores;
        rec.self_percentage = pct;
        rec.self_date = new Date().toLocaleDateString();
        alert('Self-Assessment Submitted Successfully!');
    } else {
        // Manager/Superadmin Assessment
        let history = rec.history || [];
        if (rec.percentage > 0) {
            const archiveEntry = {
                date: rec.date_updated === '-' ? rec.date_created : rec.date_updated,
                score: rec.percentage, seniority: rec.seniority || '-',
            };
            const isDuplicate = history.some(h => h.date === archiveEntry.date && h.score === archiveEntry.score);
            if (!isDuplicate) history.push(archiveEntry);
        }
        rec.history = history;
        rec.percentage = pct;
        rec.scores = currentSession.scores;
        rec.date_updated = new Date().toLocaleDateString();
        if (!rec.date_created || rec.date_created === '-') rec.date_created = rec.date_updated;
        alert('Assessment Submitted!');
    }

    db[rec.id] = rec;
    await saveEmployee(rec);

    state.currentSession = {};
    emit('data:employees', db);

    document.getElementById('step-review').classList.add('hidden');
    document.getElementById('step-login').classList.remove('hidden');
    renderPendingList();
}

// ---- BACK ----
export function goBack(stepId) {
    ['step-login', 'step-form', 'step-review', 'step-kpi-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById(stepId).classList.remove('hidden');

    if (stepId === 'step-login') {
        if (isEmployee()) {
            renderPendingList();
        } else {
            ['inp-id', 'inp-name', 'inp-join-date', 'inp-seniority'].forEach(id => {
                document.getElementById(id).value = '';
            });
            document.getElementById('inp-position').value = '';
            document.getElementById('inp-pending-select').value = '';
            document.getElementById('questions-area').innerHTML = '';
        }
    }
}
