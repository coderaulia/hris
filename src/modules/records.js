// ==================================================
// RECORDS & REPORTS MODULE
// ==================================================

import { Chart } from 'chart.js/auto';
import { state, emit, isAdmin, isEmployee, isManager } from '../lib/store.js';
import { escapeHTML, escapeInlineArg, getDisplayDate, toPeriodKey, formatPeriod, formatNumber } from '../lib/utils.js';
import { saveEmployee, logActivity, buildProbationDraft, saveProbationReview, savePipPlan, savePipActions, calculateEmployeeWeightedKpiScore } from './data.js';
import { requireRecentAuth } from './auth.js';
import { startAssessment, renderPendingList, initiateSelfAssessment as _initSelfAssess } from './assessment.js';
import * as notify from '../lib/notify.js';
import { getFilteredEmployeeIds } from '../lib/reportFilters.js';

let competencyChart = null;
let historyChart = null;
let editingTrainingIndex = -1;
let currentTrainingId = null;

// ---- RENDER RECORDS TABLE ----
export function renderRecordsTable(filterKeys = null) {
    const tbody = document.getElementById('records-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { currentUser, db } = state;
    if (!currentUser) return;

    const scopedSet = new Set(getFilteredEmployeeIds());
    let keys = Object.keys(db).filter(id => scopedSet.has(id));
    if (filterKeys) {
        const filterSet = new Set(filterKeys);
        keys = keys.filter(id => filterSet.has(id));
    }

    const periodFilter = state.reportFilters?.period || '';
    if (periodFilter) {
        keys = keys.filter(id => {
            const rec = db[id];
            const period = toPeriodKey(rec.assessment_updated_at || rec.date_updated || rec.date_created);
            return period === periodFilter;
        });
    }

    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No records found.</td></tr>';
        return;
    }

    keys.sort((a, b) => {
        const recA = db[a], recB = db[b];
        const dateA = new Date(recA.date_updated !== '-' ? recA.date_updated : recA.date_created !== '-' ? recA.date_created : '1970-01-01');
        const dateB = new Date(recB.date_updated !== '-' ? recB.date_updated : recB.date_created !== '-' ? recB.date_created : '1970-01-01');
        return dateB - dateA;
    });

    keys.forEach(key => {
        const rec = db[key];
        if (!rec) return;

        const seniorTxt = rec.seniority || '-';
        let levelClass = 'bg-secondary text-white';
        if (seniorTxt.includes('Manager')) levelClass = 'bg-dark text-white';
        else if (seniorTxt === 'Junior') levelClass = 'bg-info text-dark';
        else if (seniorTxt === 'Intermediate') levelClass = 'bg-primary text-white';
        else if (seniorTxt === 'Senior') levelClass = 'bg-warning text-dark';
        else if (seniorTxt === 'Lead') levelClass = 'bg-success text-white';

        const pct = rec.percentage || 0;
        let badgeColor = 'bg-secondary';
        if (pct >= 80) badgeColor = 'bg-success';
        else if (pct >= 60) badgeColor = 'bg-primary';
        else if (pct >= 40) badgeColor = 'bg-warning text-dark';
        else if (pct > 0) badgeColor = 'bg-danger';

        // Self assessment status
        let selfStatus = '';
        if (rec.self_percentage > 0) {
            selfStatus = `<div class="small"><span class="badge bg-info bg-opacity-25 text-info border">Self: ${rec.self_percentage}%</span></div>`;
        } else if (pct > 0) {
            selfStatus = `<div class="small"><span class="badge bg-light text-muted border">Self: Pending</span></div>`;
        }

        let actions = '';
        if (isEmployee()) {
            // Employee: can self-assess if manager has assessed them
            if (pct > 0) {
                if ((rec.self_scores && rec.self_scores.length > 0) || (rec.self_percentage && rec.self_percentage > 0)) {
                    actions = '<span class="badge bg-success-subtle text-success border">Self Assessment Submitted</span>';
                } else {
                    actions = `
          <button class="btn btn-sm btn-primary shadow-sm" onclick="window.__app.initiateSelfAssessment('${escapeInlineArg(rec.id)}')">
            <i class="bi bi-pencil-square"></i> Self-Assess
          </button>`;
                }
            } else {
                actions = '<span class="badge bg-light text-muted border">Awaiting Manager</span>';
            }
        } else {
            // Manager/Admin actions
            actions = `
        <button class="btn btn-outline-secondary" onclick="window.__app.editRecordSafe('${escapeInlineArg(rec.id)}')" title="Edit"><i class="bi bi-pencil"></i></button>
        ${isAdmin() ? `<button class="btn btn-outline-danger" onclick="window.__app.deleteRecordSafe('${escapeInlineArg(rec.id)}')" title="Delete"><i class="bi bi-trash"></i></button>` : ''}`;
        }

        tbody.innerHTML += `
      <tr>
        <td>
          <div class="fw-bold">${escapeHTML(rec.name)}</div>
          <div class="small text-muted font-monospace">${escapeHTML(rec.id)}</div>
        </td>
        <td>
          <div>${escapeHTML(rec.position)}</div>
          <span class="badge ${levelClass}">${escapeHTML(seniorTxt)}</span>
        </td>
        <td>
          <div class="small">${escapeHTML(getDisplayDate(rec.assessment_updated_at || rec.date_updated || rec.date_created || rec.date || '-'))}</div>
          <div class="text-muted" style="font-size:11px;">by ${escapeHTML(state.db[rec.assessment_updated_by]?.name || rec.assessment_updated_by || '-')}</div>
        </td>
        <td>
          <span class="badge ${badgeColor}">${pct > 0 ? pct + '%' : 'N/A'}</span>
          ${selfStatus}
        </td>
        <td class="text-end">
          <div class="btn-group btn-group-sm shadow-sm" role="group">
            <button class="btn btn-outline-success" onclick="window.__app.openTrainingLog('${escapeInlineArg(rec.id)}')" title="Training"><i class="bi bi-mortarboard"></i></button>
            ${pct > 0 ? `<button class="btn btn-outline-primary" onclick="window.__app.openReportByVal('${escapeInlineArg(rec.id)}')" title="Report"><i class="bi bi-eye"></i></button>` : ''}
            ${actions}
          </div>
        </td>
      </tr>`;
    });
}

// ---- OPEN REPORT ----
export function openReportByVal(id) {
    const rec = state.db[id];
    if (!rec) return;

    const setTxt = (domId, val) => {
        const el = document.getElementById(domId);
        if (el) el.innerText = val;
    };

    setTxt('r-name', rec.name);
    setTxt('r-id', rec.id);
    setTxt('r-pos', rec.position);
    setTxt('r-seniority', rec.seniority);
    setTxt('r-join-date', getDisplayDate(rec.join_date));
    setTxt('r-date-updated', getDisplayDate(rec.date_updated || rec.date_created));
    setTxt('r-date-next', getDisplayDate(rec.date_next));
    setTxt('r-total', rec.percentage || 0);
    setTxt('r-date-generated', new Date().toLocaleDateString());

    const details = document.getElementById('r-details');
    const recList = document.getElementById('r-rec-list');
    if (details) details.innerHTML = '';
    if (recList) recList.innerHTML = '';

    const posConfig = state.appConfig[rec.position] || { competencies: [] };
    const chartLabels = [], mgrData = [], selfData = [];
    let needsTraining = false;
    const threshold = parseInt(state.appSettings?.assessment_threshold || '7');

    const selfMap = {};
    if (rec.self_scores) rec.self_scores.forEach(s => selfMap[s.q] = s.s);

    if (rec.scores && rec.scores.length > 0) {
        rec.scores.forEach(s => {
            chartLabels.push(s.q);
            mgrData.push(s.s);
            const selfScore = selfMap[s.q] || 0;
            selfData.push(selfScore);

            const gap = s.s - selfScore;
            let gapHtml = '-';
            if (selfScore > 0) {
                gapHtml = Math.abs(gap) >= 2
                    ? `<span class="badge bg-warning text-dark">Gap: ${gap}</span>`
                    : `<span class="badge bg-light text-secondary border">Match</span>`;
            } else {
                gapHtml = `<span class="text-muted small">-</span>`;
            }

            const compConfig = posConfig.competencies.find(c => c.name === s.q);
            if (s.s < threshold) {
                needsTraining = true;
                const recText = compConfig ? compConfig.rec : 'Training Recommended';
                if (recList) recList.innerHTML += `<li class="mb-1"><strong>${escapeHTML(s.q)} (${s.s}):</strong> ${escapeHTML(recText)}</li>`;
            }

            if (details) {
                details.innerHTML += `
          <tr>
            <td><div class="fw-bold">${escapeHTML(s.q)}</div>
              <div class="small text-muted fst-italic" style="font-size:11px;">${s.n ? '"' + escapeHTML(s.n) + '"' : ''}</div></td>
            <td class="text-center align-middle text-primary fw-bold">${selfScore > 0 ? selfScore : '-'}</td>
            <td class="text-center align-middle text-dark fw-bold">${s.s}</td>
            <td class="text-center align-middle">${gapHtml}</td>
          </tr>`;
            }
        });
    }

    if (!needsTraining && recList) {
        recList.innerHTML = "<li><i class='bi bi-check-circle text-success'></i> Performance meets expectations.</li>";
    }

    if (document.getElementById('competencyChart')) renderComparisonChart(chartLabels, mgrData, selfData);

    const historyBox = document.getElementById('r-history-box');
    let histData = rec.history ? [...rec.history] : [];
    if (rec.percentage > 0) histData.push({ date: rec.date_updated || 'Today', score: rec.percentage });

    if (historyBox) {
        if (histData.length > 0) {
            historyBox.classList.remove('hidden');
            if (document.getElementById('historyChart')) renderHistoryChart(histData);
        } else {
            historyBox.classList.add('hidden');
        }
    }

    renderReportTrainingTables(rec.training_history || []);

    const overlay = document.getElementById('report-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function renderComparisonChart(labels, mgrData, selfData) {
    const ctx = document.getElementById('competencyChart');
    if (competencyChart) competencyChart.destroy();
    const maxScale = parseInt(state.appSettings?.assessment_scale_max || '10');

    competencyChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [
                { label: 'Manager Assessment', data: mgrData, borderColor: 'rgb(13, 110, 253)', backgroundColor: 'rgba(13, 110, 253, 0.2)', borderWidth: 2 },
                { label: 'Self Assessment', data: selfData, borderColor: 'rgb(255, 193, 7)', backgroundColor: 'rgba(255, 193, 7, 0.2)', borderWidth: 2, borderDash: [5, 5] },
            ],
        },
        options: {
            elements: { line: { borderWidth: 3 } },
            scales: { r: { suggestedMin: 0, suggestedMax: maxScale, ticks: { stepSize: 2 } } },
        },
    });
}

function renderHistoryChart(dataPoints) {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    if (historyChart) historyChart.destroy();
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataPoints.map(d => d.date),
            datasets: [{ label: 'Performance Trend', data: dataPoints.map(d => d.score), borderColor: '#198754', tension: 0.2, fill: true, backgroundColor: 'rgba(25, 135, 84, 0.1)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } },
    });
}

function renderReportTrainingTables(history) {
    const tOngoingList = document.getElementById('r-training-ongoing');
    const tCompletedList = document.getElementById('r-training-completed');
    const tEmpty = document.getElementById('r-training-empty');
    const tOngoingBox = document.getElementById('r-training-ongoing-box');
    const tCompletedBox = document.getElementById('r-training-completed-box');

    if (tOngoingList) tOngoingList.innerHTML = '';
    if (tCompletedList) tCompletedList.innerHTML = '';

    let hasOngoing = false, hasCompleted = false;
    history.forEach(t => {
        if (!t.end && t.status === 'approved') {
            hasOngoing = true;
            if (tOngoingList) tOngoingList.innerHTML += `<tr><td>${escapeHTML(t.course)}</td><td>${escapeHTML(t.start)}</td></tr>`;
        } else if (t.end && t.status === 'approved') {
            hasCompleted = true;
            if (tCompletedList) tCompletedList.innerHTML += `<tr><td>${escapeHTML(t.course)}</td><td>${escapeHTML(t.start)}</td><td>${escapeHTML(t.end)}</td></tr>`;
        }
    });

    if (tOngoingBox) tOngoingBox.style.display = hasOngoing ? 'block' : 'none';
    if (tCompletedBox) tCompletedBox.style.display = hasCompleted ? 'block' : 'none';
    if (tEmpty) { if (!hasOngoing && !hasCompleted) tEmpty.classList.remove('hidden'); else tEmpty.classList.add('hidden'); }
}

// ---- TRAINING LOG ----
export function openTrainingLog(id) {
    const rec = state.db[id];
    if (!rec) return;

    currentTrainingId = id;
    editingTrainingIndex = -1;
    resetTrainingForm();

    document.getElementById('t-name').innerText = rec.name;
    document.getElementById('t-id').innerText = rec.position;

    const formTitle = document.getElementById('t-form-title');
    const submitBtn = document.getElementById('t-submit-btn');

    if (isEmployee()) {
        formTitle.innerText = 'Request New Training';
        submitBtn.innerHTML = '<i class="bi bi-send"></i> Submit Request';
        submitBtn.className = 'btn btn-success btn-sm';
    } else {
        formTitle.innerText = 'Add Training Record';
        submitBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Add Record';
        submitBtn.className = 'btn btn-primary btn-sm';
    }

    const sel = document.getElementById('t-comp-select');
    sel.innerHTML = '<option value="">-- Select Competency to Auto-fill --</option>';
    if (state.appConfig[rec.position] && state.appConfig[rec.position].competencies) {
        state.appConfig[rec.position].competencies.forEach(c => {
            sel.innerHTML += `<option value="${escapeHTML(c.rec)}">${escapeHTML(c.name)}: ${escapeHTML(c.rec)}</option>`;
        });
    }

    renderTrainingHistory();
    document.getElementById('training-overlay').classList.remove('hidden');
}

function renderTrainingHistory() {
    const tbody = document.getElementById('t-history-body');
    tbody.innerHTML = '';
    const rec = state.db[currentTrainingId];
    const history = rec.training_history || [];

    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted small py-3">No history found.</td></tr>';
        return;
    }

    history.forEach((item, index) => {
        let statusBadge = '<span class="badge bg-success">Approved</span>';
        let actionBtn = '';

        if (item.status === 'pending') {
            statusBadge = '<span class="badge bg-warning text-dark">Pending</span>';
            if (!isEmployee()) {
                actionBtn = `<button class="btn btn-sm btn-success py-0 px-2 me-1" onclick="window.__app.approveTraining(${index})" title="Approve"><i class="bi bi-check"></i></button>`;
            }
        } else if (item.status === 'rejected') {
            statusBadge = '<span class="badge bg-danger">Rejected</span>';
        }

        const endDate = item.end ? escapeHTML(item.end) : '<span class="badge bg-warning text-dark" style="font-size: 0.6em;">Ongoing</span>';

        let controls = '';
        if (!isEmployee()) {
            controls = `
        ${actionBtn}
        <button class="btn btn-sm btn-link text-primary p-0 me-1" onclick="window.__app.editTrainingItem(${index})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-link text-danger p-0" onclick="window.__app.deleteTrainingItem(${index})"><i class="bi bi-trash"></i></button>`;
        } else if (item.status === 'pending') {
            controls = `<button class="btn btn-sm btn-link text-danger p-0" onclick="window.__app.deleteTrainingItem(${index})"><i class="bi bi-trash"></i></button>`;
        }

        tbody.innerHTML += `
      <tr>
        <td><div class="fw-bold">${escapeHTML(item.course)}</div>${statusBadge}</td>
        <td class="small">${escapeHTML(item.start || '-')}</td>
        <td class="small">${endDate}</td>
        <td class="text-end">${controls}</td>
      </tr>`;
    });
}

export async function saveTrainingLog() {
    const rec = state.db[currentTrainingId];
    if (!rec) return;

    const course = document.getElementById('t-course-name').value.trim();
    const start = document.getElementById('t-date-start').value;
    let end = document.getElementById('t-date-end').value;
    const isOngoing = document.getElementById('t-ongoing').checked;

    if (!course) { await notify.warn('Please enter a course name.'); return; }
    if (isOngoing) end = '';
    if (!rec.training_history) rec.training_history = [];

    let status = isEmployee() ? 'pending' : 'approved';
    const newItem = { course, start, end, provider: 'External', status };

    if (editingTrainingIndex === -1) {
        rec.training_history.push(newItem);
    } else {
        newItem.status = rec.training_history[editingTrainingIndex].status;
        rec.training_history[editingTrainingIndex] = newItem;
    }

    await notify.withLoading(async () => {
        await saveEmployee(rec);
    }, 'Saving Training Log', 'Updating training history...');
    renderTrainingHistory();
    resetTrainingForm();

    if (isEmployee() && editingTrainingIndex === -1) {
        await notify.success('Training Request submitted to Manager.');
    }
}

export async function approveTraining(index) {
    const rec = state.db[currentTrainingId];
    rec.training_history[index].status = 'approved';
    await notify.withLoading(async () => {
        await saveEmployee(rec);
    }, 'Approving Training', 'Updating training status...');
    renderTrainingHistory();
}

export function editTrainingItem(index) {
    const rec = state.db[currentTrainingId];
    const item = rec.training_history[index];
    editingTrainingIndex = index;

    document.getElementById('t-course-name').value = item.course;
    document.getElementById('t-date-start').value = item.start;
    document.getElementById('t-date-end').value = item.end;
    document.getElementById('t-ongoing').checked = !item.end;
    document.getElementById('t-date-end').disabled = !item.end;

    document.getElementById('t-form-title').innerText = 'Edit Record';
    document.getElementById('t-submit-btn').innerHTML = '<i class="bi bi-check-lg"></i> Update';
    document.getElementById('t-cancel-edit').classList.remove('hidden');
}

export async function deleteTrainingItem(index) {
    if (!(await notify.confirm('Remove this item?', { confirmButtonText: 'Remove' }))) return;
    const rec = state.db[currentTrainingId];
    rec.training_history.splice(index, 1);
    await notify.withLoading(async () => {
        await saveEmployee(rec);
    }, 'Removing Training Item', 'Updating training history...');
    renderTrainingHistory();
}

export function closeTrainingLog() {
    document.getElementById('training-overlay').classList.add('hidden');
    currentTrainingId = null;
}

export function resetTrainingForm() {
    editingTrainingIndex = -1;
    document.getElementById('t-course-name').value = '';
    document.getElementById('t-date-start').value = '';
    document.getElementById('t-date-end').value = '';
    document.getElementById('t-date-end').disabled = false;
    document.getElementById('t-ongoing').checked = false;
    document.getElementById('t-comp-select').value = '';

    const title = isEmployee() ? 'Request New Training' : 'Add Training Record';
    const btnHtml = isEmployee() ? '<i class="bi bi-send"></i> Submit Request' : '<i class="bi bi-plus-lg"></i> Add Record';

    document.getElementById('t-form-title').innerText = title;
    document.getElementById('t-submit-btn').innerHTML = btnHtml;
    document.getElementById('t-cancel-edit').classList.add('hidden');
}

export function fillTrainingRec() {
    const val = document.getElementById('t-comp-select').value;
    if (val) document.getElementById('t-course-name').value = val;
}

export function toggleOngoing() {
    const isOngoing = document.getElementById('t-ongoing').checked;
    const endInput = document.getElementById('t-date-end');
    if (isOngoing) { endInput.value = ''; endInput.disabled = true; }
    else endInput.disabled = false;
}

export function searchRecords() {
    const term = document.getElementById('search-input')?.value?.toLowerCase() || '';
    const scoped = new Set(getFilteredEmployeeIds());
    const keys = Object.keys(state.db).filter(id => {
        if (!scoped.has(id)) return false;
        const rec = state.db[id];
        return rec.name.toLowerCase().includes(term) || rec.id.toLowerCase().includes(term) || rec.position.toLowerCase().includes(term);
    });
    renderRecordsTable(keys);
}

export function closeReport() {
    document.getElementById('report-overlay').classList.add('hidden');
}

export async function deleteRecordSafe(id) {
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    if (!(await requireRecentAuth('deleting assessment record'))) return;
    const rec = state.db[id];
    if (!rec) return;
    if (await notify.confirm(`Delete assessment results for ${rec.name}?`, { confirmButtonText: 'Delete' })) {
        rec.percentage = 0; rec.scores = []; rec.history = [];
        rec.self_scores = []; rec.self_percentage = 0; rec.self_date = '';
        rec.date_created = '-'; rec.date_updated = '-'; rec.date_next = '-';
        rec.assessment_updated_at = new Date().toISOString();
        rec.assessment_updated_by = state.currentUser?.id || '';
        state.db[id] = rec;
        await notify.withLoading(async () => {
            await saveEmployee(rec);
        }, 'Deleting Assessment', 'Removing assessment record...');
        await logActivity({
            action: 'assessment.delete',
            entityType: 'assessment',
            entityId: id,
            details: {
                employee_name: rec.name,
            },
        });
        renderRecordsTable();
        await notify.success('Assessment deleted.');
    }
}

export async function editRecordSafe(id) {
    if (isEmployee()) { await notify.error('Access Denied'); return; }
    const rec = state.db[id];
    if (!rec) return;
    if (!(await notify.confirm(`Edit assessment for ${rec.name}?`, { confirmButtonText: 'Edit' }))) return;

    state.currentSession = JSON.parse(JSON.stringify(rec));
    state.currentSession.isEditing = true;

    document.getElementById('inp-id').value = rec.id;
    document.getElementById('inp-name').value = rec.name;
    document.getElementById('inp-seniority').value = rec.seniority;
    document.getElementById('inp-join-date').value = rec.join_date || '';

    emit('nav:switchTab', 'tab-assessment');
    await startAssessment();
}

export function initiateSelfAssessment(id) {
    _initSelfAssess(id);
}


function getCurrentPeriodKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getProbationPeriodFilter() {
    const input = document.getElementById('probation-period-filter');
    const val = input?.value || '';
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(val) ? val : getCurrentPeriodKey();
}

function getPipThreshold() {
    const raw = document.getElementById('pip-threshold-input')?.value;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    return Number(state.appSettings?.pip_threshold || 70) || 70;
}

function scoreBadgeClass(score) {
    if (score >= 100) return 'bg-success';
    if (score >= 75) return 'bg-primary';
    if (score >= 50) return 'bg-warning text-dark';
    return 'bg-danger';
}

export function renderProbationPipView() {
    const probationBody = document.getElementById('probation-reviews-body');
    const pipBody = document.getElementById('pip-plans-body');
    if (!probationBody || !pipBody) return;

    const scoped = new Set(getFilteredEmployeeIds());

    const probationRows = (state.probationReviews || [])
        .filter(row => scoped.has(row.employee_id))
        .sort((a, b) => String(b.reviewed_at || b.created_at || '').localeCompare(String(a.reviewed_at || a.created_at || '')));

    probationBody.innerHTML = '';
    if (probationRows.length === 0) {
        probationBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No probation reviews.</td></tr>';
    } else {
        probationRows.forEach(row => {
            const emp = state.db[row.employee_id];
            const decision = String(row.decision || 'pending').toLowerCase();
            const decisionClass = decision === 'pass'
                ? 'bg-success'
                : decision === 'extend'
                    ? 'bg-warning text-dark'
                    : decision === 'fail'
                        ? 'bg-danger'
                        : 'bg-secondary';

            probationBody.innerHTML += `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHTML(emp?.name || row.employee_id)}</div>
                    <div class="small text-muted">${escapeHTML(row.review_period_start || '-')} to ${escapeHTML(row.review_period_end || '-')}</div>
                </td>
                <td class="text-center">
                    <span class="badge ${scoreBadgeClass(Number(row.final_score || 0))}">${formatNumber(Number(row.final_score || 0).toFixed(1))}</span>
                </td>
                <td class="text-center"><span class="badge ${decisionClass}">${escapeHTML(decision)}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.__app.reviewProbation('${escapeInlineArg(row.id)}')" title="Review">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>`;
        });
    }

    const pipRows = (state.pipPlans || [])
        .filter(row => scoped.has(row.employee_id))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    pipBody.innerHTML = '';
    if (pipRows.length === 0) {
        pipBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No PIP plans.</td></tr>';
    } else {
        pipRows.forEach(plan => {
            const emp = state.db[plan.employee_id];
            const status = String(plan.status || 'active');
            const statusClass = status === 'completed'
                ? 'bg-success'
                : status === 'extended'
                    ? 'bg-warning text-dark'
                    : status === 'escalated'
                        ? 'bg-danger'
                        : status === 'cancelled'
                            ? 'bg-secondary'
                            : 'bg-primary';

            pipBody.innerHTML += `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHTML(emp?.name || plan.employee_id)}</div>
                    <div class="small text-muted">${escapeHTML(plan.trigger_reason || '-')}</div>
                </td>
                <td>${escapeHTML(plan.trigger_period || '-')}</td>
                <td class="text-center"><span class="badge ${statusClass}">${escapeHTML(status)}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.__app.updatePipPlanStatus('${escapeInlineArg(plan.id)}')" title="Update Status">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>`;
        });
    }

    const probationBadge = document.getElementById('probation-count-badge');
    if (probationBadge) probationBadge.innerText = String(probationRows.length);

    const pipBadge = document.getElementById('pip-count-badge');
    if (pipBadge) pipBadge.innerText = String(pipRows.length);

    const periodInput = document.getElementById('probation-period-filter');
    if (periodInput && !periodInput.value) periodInput.value = getCurrentPeriodKey();

    const thresholdInput = document.getElementById('pip-threshold-input');
    if (thresholdInput && !thresholdInput.value) {
        thresholdInput.value = String(Number(state.appSettings?.pip_threshold || 70) || 70);
    }
}

export async function generateProbationDrafts() {
    if (!isManager() && !isAdmin()) {
        await notify.error('Access denied.');
        return;
    }

    const scoped = getFilteredEmployeeIds();
    const now = new Date();
    let created = 0;
    let skipped = 0;

    for (const empId of scoped) {
        const emp = state.db[empId];
        if (!emp || emp.role !== 'employee' || !emp.join_date) {
            skipped++;
            continue;
        }

        const join = new Date(emp.join_date);
        if (Number.isNaN(join.getTime())) {
            skipped++;
            continue;
        }

        const probationEnd = new Date(join);
        probationEnd.setMonth(probationEnd.getMonth() + 3);
        if (now < probationEnd) {
            skipped++;
            continue;
        }

        const draft = buildProbationDraft(empId);
        if (!draft.review_period_start || draft.metric_count <= 0) {
            skipped++;
            continue;
        }

        const already = (state.probationReviews || []).some(r =>
            r.employee_id === empId && r.review_period_start === draft.review_period_start
        );
        if (already) {
            skipped++;
            continue;
        }

        await saveProbationReview({
            employee_id: empId,
            review_period_start: draft.review_period_start,
            review_period_end: draft.review_period_end,
            quantitative_score: draft.quantitative_score,
            qualitative_score: 0,
            final_score: draft.quantitative_score,
            decision: 'pending',
            manager_notes: 'Auto-generated probation draft from first 3 months KPI result.',
        }, []);

        created++;
    }

    await logActivity({
        action: 'probation.draft.generate',
        entityType: 'probation_review',
        entityId: 'bulk',
        details: { created, skipped },
    });

    renderProbationPipView();
    await notify.success(`Probation draft generation complete. Created: ${created}, Skipped: ${skipped}.`);
}

export async function reviewProbation(reviewId) {
    if (!isManager() && !isAdmin()) {
        await notify.error('Access denied.');
        return;
    }

    const review = (state.probationReviews || []).find(r => r.id === reviewId);
    if (!review) {
        await notify.error('Probation review not found.');
        return;
    }

    const qualitativeRaw = await notify.input({
        title: 'Qualitative Score',
        input: 'number',
        inputLabel: 'Manager qualitative score (0-100)',
        inputValue: String(Number(review.qualitative_score || 0)),
        confirmButtonText: 'Next',
        validate: value => {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0 || n > 100) return 'Score must be 0-100.';
            return null;
        },
    });
    if (qualitativeRaw === null) return;

    const decision = await notify.input({
        title: 'Probation Decision',
        input: 'select',
        inputOptions: {
            pending: 'Pending',
            pass: 'Pass',
            extend: 'Extend',
            fail: 'Fail',
        },
        inputValue: String(review.decision || 'pending'),
        confirmButtonText: 'Next',
    });
    if (decision === null) return;

    const notes = await notify.input({
        title: 'Manager Notes',
        input: 'textarea',
        inputValue: String(review.manager_notes || ''),
        confirmButtonText: 'Save',
    });
    if (notes === null) return;

    const qualitativeScore = Number(qualitativeRaw);
    const finalScore = (Number(review.quantitative_score || 0) * 0.7) + (qualitativeScore * 0.3);

    await saveProbationReview({
        ...review,
        qualitative_score: qualitativeScore,
        final_score: finalScore,
        decision,
        manager_notes: notes,
    }, [
        {
            item_name: 'Manager Qualitative Assessment',
            score: qualitativeScore,
            note: notes,
        },
    ]);

    await logActivity({
        action: 'probation.review.update',
        entityType: 'probation_review',
        entityId: reviewId,
        details: {
            qualitative_score: qualitativeScore,
            decision,
        },
    });

    renderProbationPipView();
    await notify.success('Probation review updated.');
}

export function exportProbationCsv() {
    const scoped = new Set(getFilteredEmployeeIds());
    const rows = (state.probationReviews || []).filter(r => scoped.has(r.employee_id));

    const header = [
        'Review_ID',
        'Employee_ID',
        'Employee_Name',
        'Review_Period_Start',
        'Review_Period_End',
        'Quantitative_Score',
        'Qualitative_Score',
        'Final_Score',
        'Decision',
        'Manager_Notes',
        'Reviewed_At',
    ];

    const lines = [header.join(',')];
    rows.forEach(row => {
        const emp = state.db[row.employee_id];
        const vals = [
            row.id || '',
            row.employee_id || '',
            emp?.name || row.employee_id || '',
            row.review_period_start || '',
            row.review_period_end || '',
            row.quantitative_score ?? 0,
            row.qualitative_score ?? 0,
            row.final_score ?? 0,
            row.decision || '',
            (row.manager_notes || '').replace(/\r?\n/g, ' '),
            row.reviewed_at || '',
        ].map(v => {
            const s = String(v ?? '');
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        });
        lines.push(vals.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `probation_reviews_${getCurrentPeriodKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function generatePipPlans() {
    if (!isManager() && !isAdmin()) {
        await notify.error('Access denied.');
        return;
    }

    const period = getProbationPeriodFilter();
    const threshold = getPipThreshold();
    const scoped = getFilteredEmployeeIds();

    let created = 0;
    let skipped = 0;

    for (const empId of scoped) {
        const employee = state.db[empId];
        if (!employee || employee.role !== 'employee') {
            skipped++;
            continue;
        }

        const periodRecords = (state.kpiRecords || []).filter(r => r.employee_id === empId && r.period === period);
        if (periodRecords.length === 0) {
            skipped++;
            continue;
        }

        const summary = calculateEmployeeWeightedKpiScore(empId, periodRecords);
        const score = Number(summary.score || 0);
        if (score >= threshold) {
            skipped++;
            continue;
        }

        const existing = (state.pipPlans || []).find(plan =>
            plan.employee_id === empId
            && plan.trigger_period === period
            && ['active', 'extended'].includes(String(plan.status || 'active'))
        );
        if (existing) {
            skipped++;
            continue;
        }

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 30);

        const plan = await savePipPlan({
            employee_id: empId,
            trigger_reason: `KPI score ${score.toFixed(1)} below threshold ${threshold}`,
            trigger_period: period,
            start_date: startDate.toISOString().slice(0, 10),
            target_end_date: endDate.toISOString().slice(0, 10),
            status: 'active',
            summary: 'Auto-generated PIP based on KPI performance below threshold.',
        });

        await savePipActions(plan.id, [
            {
                action_title: 'Weekly coaching check-in',
                action_detail: 'Manager and employee weekly review of KPI blockers and improvement plan.',
                due_date: endDate.toISOString().slice(0, 10),
                progress_pct: 0,
                status: 'todo',
                checkpoint_note: '',
            },
            {
                action_title: 'Submit KPI recovery target',
                action_detail: 'Employee submits measurable recovery target and execution steps.',
                due_date: endDate.toISOString().slice(0, 10),
                progress_pct: 0,
                status: 'todo',
                checkpoint_note: '',
            },
        ]);

        created++;
    }

    await logActivity({
        action: 'pip.generate.from_kpi',
        entityType: 'pip_plan',
        entityId: period,
        details: {
            threshold,
            created,
            skipped,
            period,
        },
    });

    renderProbationPipView();
    await notify.success(`PIP generation complete. Created: ${created}, Skipped: ${skipped}.`);
}

export async function updatePipPlanStatus(planId) {
    if (!isManager() && !isAdmin()) {
        await notify.error('Access denied.');
        return;
    }

    const plan = (state.pipPlans || []).find(p => p.id === planId);
    if (!plan) {
        await notify.error('PIP plan not found.');
        return;
    }

    const status = await notify.input({
        title: 'Update PIP Status',
        input: 'select',
        inputOptions: {
            active: 'Active',
            completed: 'Completed',
            extended: 'Extended',
            escalated: 'Escalated',
            cancelled: 'Cancelled',
        },
        inputValue: String(plan.status || 'active'),
        confirmButtonText: 'Next',
    });
    if (status === null) return;

    const note = await notify.input({
        title: 'PIP Summary / Update Note',
        input: 'textarea',
        inputValue: String(plan.summary || ''),
        confirmButtonText: 'Save',
    });
    if (note === null) return;

    await savePipPlan({
        ...plan,
        status,
        summary: note,
        closed_at: ['completed', 'cancelled'].includes(String(status)) ? new Date().toISOString() : null,
    });

    await logActivity({
        action: 'pip.status.update',
        entityType: 'pip_plan',
        entityId: planId,
        details: {
            status,
        },
    });

    renderProbationPipView();
    await notify.success('PIP plan updated.');
}
