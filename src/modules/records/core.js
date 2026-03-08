// ==================================================
// RECORDS & REPORTS MODULE
// ==================================================

import { Chart } from 'chart.js/auto';
import Swal from 'sweetalert2';
import { state, emit, isAdmin, isEmployee, isManager } from '../../lib/store.js';
import { escapeHTML, escapeInlineArg, getDisplayDate, toPeriodKey, formatPeriod, formatNumber } from '../../lib/utils.js';
import { saveEmployee, logActivity, buildProbationDraft, saveProbationReview, saveProbationMonthlyScores, saveProbationAttendanceRecord, savePipPlan, savePipActions, calculateEmployeeWeightedKpiScore, getKpiRecordTarget, getProbationRuleConfig, getProbationAttendanceEventOptions, suggestProbationAttendanceDeduction } from '../data.js';
import { requireRecentAuth } from '../auth.js';
import { startAssessment, renderPendingList, initiateSelfAssessment as _initSelfAssess } from '../assessment.js';
import * as notify from '../../lib/notify.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import { DOM_IDS, getProbationScoreBandClass } from '../../lib/uiContracts.js';

let competencyChart = null;
let historyChart = null;
let editingTrainingIndex = -1;
let currentTrainingId = null;

// ---- RENDER RECORDS TABLE ----
export function renderRecordsTable(filterKeys = null) {
    const tbody = document.getElementById(DOM_IDS.records.tableBody);
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

function getProbationPassThreshold() {
    const rules = getProbationRules();
    const raw = document.getElementById('probation-pass-threshold-input')?.value;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, Number(rules.total_weight || 100));
    return Number(rules.pass_threshold || 75) || 75;
}
function scoreBadgeClass(score) {
    return getProbationScoreBandClass(score);
}

function toFixedScore(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return num.toFixed(digits);
}

function formatScoreLabel(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function getProbationRules() {
    return getProbationRuleConfig();
}

function getErrorMessage(error, fallback = 'Unknown error') {
    if (!error) return fallback;
    if (typeof error === 'string') return error;

    const parts = [
        error.message,
        error.details,
        error.hint,
        error.error_description,
    ]
        .filter(v => typeof v === 'string' && v.trim())
        .map(v => v.trim());

    if (parts.length === 0) return fallback;
    return [...new Set(parts)].join(' | ');
}

function isHrOperator() {
    const role = String(state.currentUser?.role || '').toLowerCase();
    const deptRaw = state.currentUser?.department || state.db[state.currentUser?.id]?.department || '';
    const dept = String(deptRaw).toLowerCase();
    return role === 'hr'
        || dept === 'hr'
        || dept.includes('human resource')
        || dept.includes('human resources');
}

function canManageAttendance() {
    return isAdmin() || isHrOperator();
}

function getScopedProbationReviews() {
    const sourceRows = state.probationReviews || [];
    if (canManageAttendance()) return sourceRows;

    const scoped = new Set(getFilteredEmployeeIds());
    return sourceRows.filter(row => scoped.has(row.employee_id));
}

function getMonthlyRows(reviewId) {
    return (state.probationMonthlyScores || [])
        .filter(row => row.probation_review_id === reviewId)
        .sort((a, b) => Number(a.month_no || 0) - Number(b.month_no || 0));
}

function getAttendanceRows(reviewId) {
    return (state.probationAttendanceRecords || []).filter(row => row.probation_review_id === reviewId);
}

function monthAttendanceSummary(reviewId, monthNo) {
    const items = getAttendanceRows(reviewId).filter(row => Number(row.month_no) === Number(monthNo));
    if (items.length === 0) return '-';
    return items
        .map(row => `${row.event_date || '-'} ${row.event_type || 'attendance'} x${Number(row.qty || 1)} (-${toFixedScore(row.deduction_points || 0, 1)})`)
        .join('; ');
}

function suggestAttendanceDeduction(eventType, qty) {
    return suggestProbationAttendanceDeduction(eventType, qty, getProbationRules());
}

async function ensureProbationMonthlyRows(review, options = {}) {
    const persist = options.persist !== false;
    const existing = getMonthlyRows(review.id);
    const attendance = getAttendanceRows(review.id);
    const draft = buildProbationDraft(review.employee_id, existing, attendance);
    const payloadRows = draft.monthly_rows.map(row => ({
        ...row,
        probation_review_id: review.id,
    }));

    if (persist) {
        await saveProbationMonthlyScores(review.id, payloadRows);
        return buildProbationDraft(review.employee_id, getMonthlyRows(review.id), attendance);
    }

    return draft;
}

async function recomputeProbationReview(review, overrideRows = null, decisionOverride = null, summaryNoteOverride = null) {
    const attendance = getAttendanceRows(review.id);
    const baseRows = overrideRows || getMonthlyRows(review.id);
    const draft = buildProbationDraft(review.employee_id, baseRows, attendance);

    const payloadRows = draft.monthly_rows.map(row => ({
        ...row,
        probation_review_id: review.id,
    }));
    await saveProbationMonthlyScores(review.id, payloadRows);

    const updatedReview = await saveProbationReview({
        ...review,
        review_period_start: draft.review_period_start,
        review_period_end: draft.review_period_end,
        quantitative_score: draft.quantitative_score,
        qualitative_score: draft.qualitative_score,
        final_score: draft.final_score,
        decision: decisionOverride !== null ? decisionOverride : (review.decision || 'pending'),
        manager_notes: summaryNoteOverride !== null ? summaryNoteOverride : (review.manager_notes || ''),
    }, []);

    return {
        review: updatedReview,
        draft,
    };
}

export function renderProbationPipView() {
    const probationBody = document.getElementById('probation-reviews-body');
    const pipBody = document.getElementById('pip-plans-body');
    if (!probationBody || !pipBody) return;

    const attendanceBtn = document.getElementById('probation-attendance-btn');
    if (attendanceBtn) attendanceBtn.classList.toggle('d-none', !canManageAttendance());

    const probationRows = getScopedProbationReviews()
        .slice()
        .sort((a, b) => String(b.reviewed_at || b.created_at || '').localeCompare(String(a.reviewed_at || a.created_at || '')));

    probationBody.innerHTML = '';
    if (probationRows.length === 0) {
        probationBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No probation reviews.</td></tr>';
    } else {
        probationRows.forEach(row => {
            const emp = state.db[row.employee_id];
            const monthly = buildProbationDraft(row.employee_id, getMonthlyRows(row.id), getAttendanceRows(row.id));
            const finalScore = Number(row.final_score ?? monthly.final_score ?? 0);
            const decision = String(row.decision || 'pending').toLowerCase();
            const decisionClass = decision === 'pass'
                ? 'bg-success'
                : decision === 'extend'
                    ? 'bg-warning text-dark'
                    : decision === 'fail'
                        ? 'bg-danger'
                        : 'bg-secondary';

            const monthlyPills = (monthly.monthly_rows || [])
                .map(m => `<span class="badge bg-light text-dark border me-1">M${m.month_no}: ${toFixedScore(m.monthly_total, 1)}</span>`)
                .join('');

            probationBody.innerHTML += `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHTML(emp?.name || row.employee_id)}</div>
                    <div class="small text-muted">${escapeHTML(row.review_period_start || monthly.review_period_start || '-')} to ${escapeHTML(row.review_period_end || monthly.review_period_end || '-')}</div>
                    <div class="small mt-1">${monthlyPills}</div>
                </td>
                <td class="text-center">
                    <span class="badge ${scoreBadgeClass(finalScore)}">${toFixedScore(finalScore, 1)}</span>
                </td>
                <td class="text-center"><span class="badge ${decisionClass}">${escapeHTML(decision)}</span></td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="window.__app.reviewProbation('${escapeInlineArg(row.id)}')" title="Review Form">
                            <i class="bi bi-pencil"></i>
                        </button>
                        ${canManageAttendance() ? `
                        <button class="btn btn-outline-dark" onclick="window.__app.addProbationAttendanceEntry('${escapeInlineArg(row.id)}')" title="Attendance Entry">
                            <i class="bi bi-calendar-plus"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
        });
    }

    const scoped = new Set(getFilteredEmployeeIds());
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

    const passThresholdInput = document.getElementById('probation-pass-threshold-input');
    if (passThresholdInput && !passThresholdInput.value) {
        passThresholdInput.value = String(Number(getProbationRules().pass_threshold || 75) || 75);
    }
}

export async function generateProbationDrafts() {
    if (!isManager() && !isAdmin()) {
        await notify.error('Access denied.');
        return;
    }

    try {
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

            const draft = buildProbationDraft(empId);
            if (!draft.review_period_start || draft.metric_count <= 0) {
                skipped++;
                continue;
            }

            const reviewEnd = new Date(`${draft.review_period_end}T23:59:59`);
            if (Number.isNaN(reviewEnd.getTime()) || now < reviewEnd) {
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

            const savedReview = await saveProbationReview({
                employee_id: empId,
                review_period_start: draft.review_period_start,
                review_period_end: draft.review_period_end,
                quantitative_score: draft.quantitative_score,
                qualitative_score: draft.qualitative_score,
                final_score: draft.final_score,
                decision: 'pending',
                manager_notes: 'Auto-generated probation draft from first 3-month review window.',
            }, []);

            await saveProbationMonthlyScores(savedReview.id, draft.monthly_rows.map(row => ({
                ...row,
                probation_review_id: savedReview.id,
            })));

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
    } catch (error) {
        await notify.error(`Failed to generate probation drafts: ${getErrorMessage(error)}`);
    }
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

    try {
    const seeded = await ensureProbationMonthlyRows(review);
    const rows = seeded.monthly_rows || [];
    const rules = getProbationRules();
    const passThreshold = getProbationPassThreshold();
    const workWeightLabel = formatScoreLabel(rules.work_weight);
    const managingWeightLabel = formatScoreLabel(rules.managing_weight);
    const attitudeWeightLabel = formatScoreLabel(rules.attitude_weight);
    const totalWeightLabel = formatScoreLabel(rules.total_weight);
    const managingMax = Number(rules.managing_weight || 0);
    const totalMax = Number(rules.total_weight || 100);
    const managingRubric = rules.managing_rubric || {};

    const htmlRows = rows.map(row => `
        <tr>
            <td class="small">
                <div class="fw-bold">Month ${row.month_no}</div>
                <div class="text-muted">${escapeHTML(row.period_start)} to ${escapeHTML(row.period_end)}</div>
            </td>
            <td><input id="pr-work-${row.month_no}" class="form-control form-control-sm text-end" value="${toFixedScore(row.work_performance_score, 2)}" readonly></td>
            <td><input id="pr-manage-${row.month_no}" class="form-control form-control-sm text-end" type="number" min="0" max="${managingWeightLabel}" step="0.1" value="${toFixedScore(row.managing_task_score, 2)}" placeholder="0-${managingWeightLabel}" title="Manager input (0-${managingWeightLabel}). Suggested rubric: Responsibility 0-${formatScoreLabel(managingRubric.responsibility_max)}, Innovation 0-${formatScoreLabel(managingRubric.innovation_max)}, Communication 0-${formatScoreLabel(managingRubric.communication_max)}."></td>
            <td><input id="pr-att-${row.month_no}" class="form-control form-control-sm text-end" value="${toFixedScore(row.attitude_score, 2)}" readonly></td>
            <td><input id="pr-ded-${row.month_no}" class="form-control form-control-sm text-end" value="${toFixedScore(row.attendance_deduction, 2)}" readonly></td>
            <td><textarea id="pr-qual-${row.month_no}" class="form-control form-control-sm" rows="2" placeholder="Qualitative summary: achievements, behavior, and quality of execution">${escapeHTML(row.manager_qualitative_text || '')}</textarea></td>
            <td><input id="pr-total-${row.month_no}" class="form-control form-control-sm text-end" value="${toFixedScore(row.monthly_total, 2)}" readonly></td>
        </tr>
    `).join('');

        const modalResult = await Swal.fire({
        title: 'Probation Review Form',
        width: 1450,
        heightAuto: false,
        showCancelButton: true,
        confirmButtonText: 'Save Review',
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        html: `
            <div class="text-start small">
                <div class="mb-2"><strong>Employee:</strong> ${escapeHTML(state.db[review.employee_id]?.name || review.employee_id)}</div>
                <div class="mb-2"><strong>Window:</strong> ${escapeHTML(seeded.review_period_start || '-')} to ${escapeHTML(seeded.review_period_end || '-')}</div>
                <div class="alert alert-light border py-2 px-3 mb-3">
                    <div class="fw-bold mb-1">Manager Scoring Hints</div>
                    <div class="small mb-1"><strong>Work (${workWeightLabel}):</strong> auto-generated from KPI records in each probation window (read-only).</div>
                    <div class="small mb-1"><strong>Managing (${managingWeightLabel}):</strong> manager input. Suggested rubric: Responsibility 0-${formatScoreLabel(managingRubric.responsibility_max)}, Innovation 0-${formatScoreLabel(managingRubric.innovation_max)}, Communication 0-${formatScoreLabel(managingRubric.communication_max)}.</div>
                    <div class="small mb-1"><strong>Attitude (${attitudeWeightLabel}):</strong> auto-calculated from attendance deductions (read-only).</div>
                    <div class="small mb-1"><strong>Qualitative Score (summary):</strong> average of monthly (Managing + Attitude).</div>
                    <div class="small"><strong>Pass Rule:</strong> decision <strong>Pass</strong> requires final score >= ${toFixedScore(passThreshold, 1)} (max ${totalWeightLabel}).</div>
                </div>
                <div class="table-responsive border rounded mb-3" style="max-height:380px; overflow:auto;">
                    <table class="table table-sm align-middle mb-0" style="table-layout:fixed; min-width:1280px;">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th style="width:190px;">Month</th>
                                <th style="width:115px;">Work<br><span class="text-muted">(${workWeightLabel})</span></th>
                                <th style="width:115px;">Managing<br><span class="text-muted">(${managingWeightLabel})</span></th>
                                <th style="width:115px;">Attitude<br><span class="text-muted">(${attitudeWeightLabel})</span></th>
                                <th style="width:115px;">Deduction</th>
                                <th style="width:520px;">Qualitative Text</th>
                                <th style="width:115px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${htmlRows}</tbody>
                    </table>
                </div>
                <div class="mb-2">
                    <label class="form-label fw-bold mb-1">Decision</label>
                    <select id="pr-decision" class="form-select form-select-sm">
                        <option value="pending" ${String(review.decision || 'pending') === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="pass" ${String(review.decision || '') === 'pass' ? 'selected' : ''}>Pass</option>
                        <option value="extend" ${String(review.decision || '') === 'extend' ? 'selected' : ''}>Extend</option>
                        <option value="fail" ${String(review.decision || '') === 'fail' ? 'selected' : ''}>Fail</option>
                    </select>
                </div>
                <div class="mb-2">
                    <label class="form-label fw-bold mb-1">Overall Performance Report (Manager)</label>
                    <textarea id="pr-summary" class="form-control form-control-sm" rows="3" placeholder="Write overall qualitative recap for probation result, strengths, weaknesses, and salary adjustment recommendation">${escapeHTML(review.manager_notes || '')}</textarea>
                </div>
                ${canManageAttendance() ? '<div class="text-muted small">Tip: use Attendance Entry button to update attitude score deductions.</div>' : ''}
            </div>
        `,
        preConfirm: () => {
            const collectedRows = [];
            for (const row of rows) {
                const manage = Number(document.getElementById(`pr-manage-${row.month_no}`)?.value);
                const qual = (document.getElementById(`pr-qual-${row.month_no}`)?.value || '').trim();
                if (!Number.isFinite(manage) || manage < 0 || manage > managingMax) {
                    Swal.showValidationMessage(`Managing Task score for Month ${row.month_no} must be between 0 and ${formatScoreLabel(managingMax)}.`);
                    return false;
                }
                collectedRows.push({
                    ...row,
                    probation_review_id: review.id,
                    managing_task_score: Math.max(0, Math.min(managingMax, manage)),
                    manager_qualitative_text: qual,
                });
            }

            const decision = (document.getElementById('pr-decision')?.value || 'pending').trim();
            const summary = (document.getElementById('pr-summary')?.value || '').trim();

            const projectedTotals = collectedRows.map(item => {
                const work = Number(item.work_performance_score || 0);
                const manageScore = Number(item.managing_task_score || 0);
                const attitude = Number(item.attitude_score || 0);
                return Math.max(0, Math.min(totalMax, work + manageScore + attitude));
            });
            const projectedFinal = projectedTotals.length
                ? projectedTotals.reduce((sum, score) => sum + score, 0) / projectedTotals.length
                : 0;

            if (decision === 'pass' && projectedFinal < passThreshold) {
                Swal.showValidationMessage(`Pass requires final score >= ${toFixedScore(passThreshold, 1)}. Current projected final: ${toFixedScore(projectedFinal, 2)}.`);
                return false;
            }

            return { collectedRows, decision, summary };
        },
    });
    if (!modalResult.isConfirmed || !modalResult.value) return;

    const updatedRows = modalResult.value.collectedRows;
    const decision = modalResult.value.decision;
    const summary = modalResult.value.summary;

    const refreshed = await recomputeProbationReview(review, updatedRows, decision, summary);

    await logActivity({
        action: 'probation.review.update',
        entityType: 'probation_review',
        entityId: reviewId,
        details: {
            quantitative_score: refreshed.draft.quantitative_score,
            qualitative_score: refreshed.draft.qualitative_score,
            final_score: refreshed.draft.final_score,
            decision,
        },
    });

    renderProbationPipView();
    await notify.success('Probation review updated.');
    } catch (error) {
        await notify.error(`Failed to update probation review: ${getErrorMessage(error)}`);
    }
}

export async function addProbationAttendanceEntry(reviewId = '') {
    if (!canManageAttendance()) {
        await notify.error('Only HR/Superadmin can add attendance entries.');
        return;
    }

    const reviews = getScopedProbationReviews();
    if (reviews.length === 0) {
        await notify.warn('No probation review available. Generate drafts first.');
        return;
    }

    let selectedReviewId = reviewId;
    if (!selectedReviewId) {
        const options = {};
        reviews.forEach(r => {
            const emp = state.db[r.employee_id];
            options[r.id] = `${emp?.name || r.employee_id} (${r.review_period_start || '-'})`;
        });
        selectedReviewId = await notify.input({
            title: 'Select Probation Review',
            input: 'select',
            inputOptions: options,
            inputValue: Object.keys(options)[0],
            confirmButtonText: 'Next',
        });
        if (selectedReviewId === null) return;
    }

    const review = reviews.find(r => r.id === selectedReviewId);
    if (!review) {
        await notify.error('Probation review not found.');
        return;
    }

    try {
    const seeded = await ensureProbationMonthlyRows(review);
    const rules = getProbationRules();
    const eventOptions = getProbationAttendanceEventOptions(rules);
    const defaultEvent = Object.keys(eventOptions)[0] || 'other';
    const monthOptions = {};
    (seeded.monthly_rows || []).forEach(row => {
        monthOptions[String(row.month_no)] = `Month ${row.month_no} (${row.period_start} to ${row.period_end})`;
    });

    const monthRaw = await notify.input({
        title: 'Select Probation Month',
        input: 'select',
        inputOptions: monthOptions,
        inputValue: '1',
        confirmButtonText: 'Next',
    });
    if (monthRaw === null) return;
    const monthNo = Number(monthRaw);

    const targetMonth = (seeded.monthly_rows || []).find(r => Number(r.month_no) === monthNo);
    const eventDate = await notify.input({
        title: 'Attendance Event Date',
        input: 'text',
        inputPlaceholder: 'YYYY-MM-DD',
        inputValue: targetMonth?.period_start || '',
        confirmButtonText: 'Next',
        validate: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()) ? null : 'Use YYYY-MM-DD format.',
    });
    if (eventDate === null) return;

    const eventType = await notify.input({
        title: 'Attendance Event Type',
        input: 'select',
        inputOptions: eventOptions,
        inputValue: defaultEvent,
        confirmButtonText: 'Next',
    });
    if (eventType === null) return;

    const qtyRaw = await notify.input({
        title: 'Event Quantity',
        input: 'number',
        inputValue: '1',
        inputLabel: 'How many occurrences?',
        confirmButtonText: 'Next',
        validate: value => {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0) return 'Quantity must be >= 0';
            return null;
        },
    });
    if (qtyRaw === null) return;
    const qty = Number(qtyRaw);

    const suggested = suggestAttendanceDeduction(String(eventType), qty);
    const deductionRaw = await notify.input({
        title: 'Deduction Points',
        input: 'number',
        inputValue: String(suggested),
        inputLabel: `Suggested by policy. Max monthly deduction: ${formatScoreLabel(rules.attendance?.monthly_cap)}.`,
        confirmButtonText: 'Next',
        validate: value => {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0) return 'Deduction must be >= 0';
            if (n > Number(rules.attendance?.monthly_cap || rules.attitude_weight || 0)) return `Deduction cannot exceed ${formatScoreLabel(rules.attendance?.monthly_cap || rules.attitude_weight || 0)}.`;
            return null;
        },
    });
    if (deductionRaw === null) return;

    const note = await notify.input({
        title: 'Attendance Note',
        input: 'textarea',
        inputValue: '',
        confirmButtonText: 'Save Entry',
    });
    if (note === null) return;

    await saveProbationAttendanceRecord({
        probation_review_id: review.id,
        month_no: monthNo,
        event_date: String(eventDate).trim(),
        event_type: String(eventType).trim(),
        qty,
        deduction_points: Number(deductionRaw),
        note: String(note || '').trim(),
        entered_by: state.currentUser?.id || null,
    });

    const currentReview = (state.probationReviews || []).find(r => r.id === review.id) || review;
    await recomputeProbationReview(currentReview);

    await logActivity({
        action: 'probation.attendance.add',
        entityType: 'probation_attendance',
        entityId: review.id,
        details: {
            month_no: monthNo,
            event_type: eventType,
            qty,
            deduction: Number(deductionRaw),
        },
    });

    renderProbationPipView();
    await notify.success('Attendance entry saved and probation score updated.');
    } catch (error) {
        await notify.error(`Failed to save attendance entry: ${getErrorMessage(error)}`);
    }
}

function getPdfTableRunner(doc, autoTableMod) {
    const autoTable = autoTableMod?.default || autoTableMod?.autoTable;
    return opts => {
        if (typeof autoTable === 'function') {
            autoTable(doc, opts);
            return;
        }
        if (typeof doc.autoTable === 'function') {
            doc.autoTable(opts);
            return;
        }
        throw new Error('jspdf-autotable failed to load.');
    };
}

export async function exportProbationPdf() {
    const reviews = getScopedProbationReviews();
    if (reviews.length === 0) {
        await notify.warn('No probation review to export.');
        return;
    }

    const options = {};
    reviews.forEach(r => {
        const emp = state.db[r.employee_id];
        options[r.id] = `${emp?.name || r.employee_id} (${r.review_period_start || '-'})`;
    });

    const selected = await notify.input({
        title: 'Select Probation Review to Export',
        input: 'select',
        inputOptions: options,
        inputValue: reviews[0]?.id || '',
        confirmButtonText: 'Export PDF',
    });
    if (selected === null) return;

    const review = reviews.find(r => r.id === selected);
    if (!review) {
        await notify.error('Probation review not found.');
        return;
    }

    try {
        const draft = await ensureProbationMonthlyRows(review, { persist: false });
        const employee = state.db[review.employee_id] || { id: review.employee_id, name: review.employee_id, position: '-' };
        const managerName = state.db[employee.manager_id || '']?.name || 'Manager';
        const directorName = state.appSettings?.director_name || 'Director';
        const company = state.appSettings?.company_name || 'Company';
        const appName = state.appSettings?.app_name || 'HR Performance Suite';
        const rules = getProbationRules();
        const passThreshold = Number(rules.pass_threshold || 75) || 75;
        const workWeightLabel = formatScoreLabel(rules.work_weight);
        const managingWeightLabel = formatScoreLabel(rules.managing_weight);
        const attitudeWeightLabel = formatScoreLabel(rules.attitude_weight);
        const generatedAt = new Date();
        const generatedDate = generatedAt.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });

        const { jsPDF } = await import('jspdf');
        const autoTableMod = await import('jspdf-autotable');

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const runAutoTable = getPdfTableRunner(doc, autoTableMod);

        // ---- Page 1: Summary + Signatures ----
        doc.setFillColor(17, 24, 39);
        doc.rect(0, 0, 210, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text(`${company} - Probation Assessment Report`, 14, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(appName, 14, 17);
        doc.text(`Generated Date: ${generatedDate}`, 196, 17, { align: 'right' });

        doc.setTextColor(20, 20, 20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Employee Information', 14, 31);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(`Name: ${employee.name || '-'}`, 14, 37);
        doc.text(`Position: ${employee.position || '-'}`, 14, 42);
        doc.text(`Probation Window: ${review.review_period_start || draft.review_period_start || '-'} to ${review.review_period_end || draft.review_period_end || '-'}`, 14, 47);

        const monthRows = (draft.monthly_rows || []).map(row => [
            `Month ${row.month_no}`,
            `${row.period_start} to ${row.period_end}`,
            toFixedScore(row.work_performance_score, 2),
            toFixedScore(row.managing_task_score, 2),
            toFixedScore(row.attitude_score, 2),
            toFixedScore(row.attendance_deduction, 2),
            toFixedScore(row.monthly_total, 2),
            row.manager_qualitative_text || review.manager_notes || '-',
        ]);

        runAutoTable({
            startY: 52,
            head: [[
                'Month',
                'Period',
                `Work (${workWeightLabel})`,
                `Managing (${managingWeightLabel})`,
                `Attitude (${attitudeWeightLabel})`,
                'Deduction',
                'Total',
                'Qualitative',
            ]],
            body: monthRows,
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 8, valign: 'top' },
            styles: { overflow: 'linebreak', cellPadding: 1.4 },
            columnStyles: {
                0: { cellWidth: 14, halign: 'center' },
                1: { cellWidth: 27 },
                2: { cellWidth: 14, halign: 'right' },
                3: { cellWidth: 15, halign: 'right' },
                4: { cellWidth: 14, halign: 'right' },
                5: { cellWidth: 13, halign: 'right' },
                6: { cellWidth: 13, halign: 'right', fontStyle: 'bold' },
                7: { cellWidth: 72 },
            },
            margin: { left: 14, right: 14 },
        });

        const summaryY = (doc.lastAutoTable?.finalY || 52) + 6;
        runAutoTable({
            startY: summaryY,
            head: [['Quantitative', 'Managing+Attitude Avg', 'Final Score', 'Pass Min', 'Decision']],
            body: [[
                toFixedScore(draft.quantitative_score, 2),
                toFixedScore(draft.qualitative_score, 2),
                toFixedScore(review.final_score || draft.final_score, 2),
                toFixedScore(passThreshold, 1),
                String(review.decision || 'pending').toUpperCase(),
            ]],
            theme: 'grid',
            headStyles: { fillColor: [229, 231, 235], textColor: [31, 41, 55], fontStyle: 'bold', halign: 'center' },
            bodyStyles: { fontSize: 9, halign: 'center' },
            margin: { left: 14, right: 14 },
        });

        const contextTop = (doc.lastAutoTable?.finalY || summaryY) + 7;
        runAutoTable({
            startY: contextTop,
            head: [['Score Context (For Director)']],
            body: [[
                `Work (${workWeightLabel}): auto-generated from KPI records (target vs actual achievement) within probation window.\n`
                + `Managing (${managingWeightLabel}): manager score input based on responsibility, innovation, and communication.\n`
                + `Attitude (${attitudeWeightLabel}): auto-calculated from attendance deductions (${attitudeWeightLabel} - deduction points, min 0).\n`
                + 'See attachment below for Work score details.',
            ]],
            theme: 'grid',
            headStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold' },
            bodyStyles: { fontSize: 8.3, valign: 'top' },
            styles: { overflow: 'linebreak', cellPadding: 1.6 },
            columnStyles: { 0: { cellWidth: 182 } },
            margin: { left: 14, right: 14 },
        });

        let recapTop = (doc.lastAutoTable?.finalY || contextTop) + 8;
        if (recapTop > 220) {
            doc.addPage();
            recapTop = 20;
        }

        const recapText = String(review.manager_notes || '-').trim() || '-';
        const recapLines = doc.splitTextToSize(recapText, 176);
        const recapBoxHeight = Math.max(18, (recapLines.length * 4.3) + 8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text('Overall Performance Report (Manager)', 14, recapTop);

        const recapBoxY = recapTop + 3;
        doc.setDrawColor(140, 140, 140);
        doc.rect(14, recapBoxY, 182, recapBoxHeight);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(recapLines, 16, recapBoxY + 6);

        let signatureTop = recapBoxY + recapBoxHeight + 18;
        if (signatureTop > 248) {
            doc.addPage();
            signatureTop = 35;
        }

        const lineY = signatureTop;
        const labelY = lineY + 7;
        const nameY = lineY + 13;

        doc.setDrawColor(100, 100, 100);
        doc.line(18, lineY, 66, lineY);
        doc.line(81, lineY, 129, lineY);
        doc.line(144, lineY, 192, lineY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Employee', 42, labelY, { align: 'center' });
        doc.text('Manager', 105, labelY, { align: 'center' });
        doc.text('Director', 168, labelY, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(employee.name || '-', 42, nameY, { align: 'center' });
        doc.text(managerName, 105, nameY, { align: 'center' });
        doc.text(directorName, 168, nameY, { align: 'center' });

        // ---- Page 2: KPI detail basis for Work score ----
        doc.addPage('a4', 'landscape');

        doc.setFillColor(17, 24, 39);
        doc.rect(0, 0, 297, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('KPI Performance Detail (Work Score Basis)', 14, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${employee.name || '-'} | ${review.review_period_start || draft.review_period_start || '-'} to ${review.review_period_end || draft.review_period_end || '-'}`, 14, 17);
        doc.text(`Generated Date: ${generatedDate}`, 283, 17, { align: 'right' });

        const kpiDetailRows = [];
        (draft.monthly_rows || []).forEach(monthRow => {
            const contributions = Array.isArray(monthRow.contributions) ? monthRow.contributions : [];
            if (contributions.length === 0) {
                kpiDetailRows.push([
                    `Month ${monthRow.month_no}`,
                    `${monthRow.period_start} to ${monthRow.period_end}`,
                    '-',
                    '-',
                    '-',
                    '-',
                    '-',
                    '-',
                    'No KPI contribution rows',
                ]);
                return;
            }

            contributions.forEach(contrib => {
                const period = String(contrib.period || '').trim();
                const periodRecords = (state.kpiRecords || []).filter(r => r.employee_id === review.employee_id && r.period === period);
                if (periodRecords.length === 0) {
                    kpiDetailRows.push([
                        `Month ${monthRow.month_no}`,
                        `${monthRow.period_start} to ${monthRow.period_end}`,
                        period || '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        `${Number(contrib.overlap_days || 0)}d`,
                        'No KPI records on this period',
                    ]);
                    return;
                }

                periodRecords.forEach(record => {
                    const kpiDef = (state.kpiConfig || []).find(k => k.id === record.kpi_id);
                    const kpiName = record.kpi_name_snapshot || kpiDef?.name || record.kpi_id || '-';
                    const unit = record.kpi_unit_snapshot || kpiDef?.unit || '';
                    const target = getKpiRecordTarget(record, employee);
                    const actual = Number(record.value || 0);
                    const achievement = target > 0 ? (actual / target) * 100 : 0;

                    kpiDetailRows.push([
                        `Month ${monthRow.month_no}`,
                        `${monthRow.period_start} to ${monthRow.period_end}`,
                        period || '-',
                        kpiName,
                        `${formatNumber(target)} ${unit}`.trim(),
                        `${formatNumber(actual)} ${unit}`.trim(),
                        target > 0 ? `${toFixedScore(achievement, 2)}%` : '-',
                        `${Number(contrib.overlap_days || 0)}d`,
                        record.notes || '-',
                    ]);
                });
            });
        });

        runAutoTable({
            startY: 24,
            head: [[
                'Month',
                'Probation Window',
                'KPI Period',
                'KPI Metric',
                'Target',
                'Actual',
                'Ach%',
                'Overlap',
                'Record Note',
            ]],
            body: kpiDetailRows.length > 0 ? kpiDetailRows : [['-', '-', '-', '-', '-', '-', '-', '-', '-']],
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7.8, valign: 'top' },
            styles: { overflow: 'linebreak', cellPadding: 1.2 },
            columnStyles: {
                0: { cellWidth: 14, halign: 'center' },
                1: { cellWidth: 28 },
                2: { cellWidth: 16, halign: 'center' },
                3: { cellWidth: 58 },
                4: { cellWidth: 28, halign: 'right' },
                5: { cellWidth: 28, halign: 'right' },
                6: { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
                7: { cellWidth: 16, halign: 'center' },
                8: { cellWidth: 55 },
            },
            margin: { left: 14, right: 14 },
            didDrawPage: data => {
                doc.setFontSize(8);
                doc.setTextColor(120);
                doc.text(`Page ${data.pageNumber}`, 283, 205, { align: 'right' });
            },
        });

        const safeName = String(employee.name || review.employee_id || 'employee').replace(/[^a-zA-Z0-9_-]/g, '_');
        const todayIso = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')}`;
        doc.save(`probation_report_${safeName}_${todayIso}.pdf`);
        await notify.success('Probation PDF exported.');
    } catch (error) {
        await notify.error(`Failed to export probation PDF: ${getErrorMessage(error)}`);
    }
}
export async function exportProbationCsv() {
    const reviews = getScopedProbationReviews();
    if (reviews.length === 0) {
        await notify.warn('No probation review to export.');
        return;
    }

    const options = {};
    reviews.forEach(r => {
        const emp = state.db[r.employee_id];
        options[r.id] = `${emp?.name || r.employee_id} (${r.review_period_start || '-'})`;
    });

    const selected = await notify.input({
        title: 'Select Probation Review to Export',
        input: 'select',
        inputOptions: options,
        inputValue: reviews[0]?.id || '',
        confirmButtonText: 'Export Excel',
    });
    if (selected === null) return;

    const review = reviews.find(r => r.id === selected);
    if (!review) {
        await notify.error('Probation review not found.');
        return;
    }

    try {
        const draft = await ensureProbationMonthlyRows(review, { persist: false });
        const employee = state.db[review.employee_id] || { id: review.employee_id, name: review.employee_id, position: '-' };
        const attendanceRows = getAttendanceRows(review.id);
        const company = state.appSettings?.company_name || 'Company';
        const appName = state.appSettings?.app_name || 'HR Performance Suite';
        const rules = getProbationRules();
        const workWeightLabel = formatScoreLabel(rules.work_weight);
        const managingWeightLabel = formatScoreLabel(rules.managing_weight);
        const attitudeWeightLabel = formatScoreLabel(rules.attitude_weight);

        const ExcelJS = await import('exceljs');
        const wb = new ExcelJS.Workbook();

        (draft.monthly_rows || []).forEach(monthRow => {
            const ws = wb.addWorksheet(`Bulan ${monthRow.month_no}`);
            ws.columns = [
                { width: 6 },
                { width: 38 },
                { width: 16 },
                { width: 52 },
                { width: 40 },
            ];

            ws.addRow([company]);
            ws.addRow([appName]);
            ws.addRow([]);
            ws.addRow(['Probationary Employee Assessment']);
            ws.mergeCells('A4:E4');
            ws.addRow([]);
            ws.addRow(['Employee', employee.name, '', 'Position', employee.position || '-']);
            ws.addRow(['Month Window', `${monthRow.period_start} to ${monthRow.period_end}`]);
            ws.addRow([]);
            ws.addRow(['No', 'Tugas & tanggung Jawab', 'Realisasi', 'Penilaian Qualitative', 'Catatan']);
            ws.addRow([1, `Work Performance (${workWeightLabel} points)`, Number(monthRow.work_performance_score || 0), monthRow.manager_qualitative_text || '', monthAttendanceSummary(review.id, monthRow.month_no)]);
            ws.addRow([2, `Managing Task (${managingWeightLabel} points)`, Number(monthRow.managing_task_score || 0), monthRow.manager_qualitative_text || '', monthAttendanceSummary(review.id, monthRow.month_no)]);
            ws.addRow([3, `Attitude (${attitudeWeightLabel} points)`, Number(monthRow.attitude_score || 0), `Attendance deduction: ${toFixedScore(monthRow.attendance_deduction || 0, 2)}`, monthAttendanceSummary(review.id, monthRow.month_no)]);
            ws.addRow(['', 'Score Rata-rata', Number(monthRow.monthly_total || 0), '', '']);

            const headRow = ws.getRow(9);
            headRow.font = { bold: true };
            headRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            [9, 10, 11, 12, 13].forEach(rn => {
                const row = ws.getRow(rn);
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' },
                    };
                });
            });
            ws.getCell('A4').font = { bold: true, size: 14 };
            ws.getCell('A4').alignment = { horizontal: 'center' };
        });

        const recap = wb.addWorksheet('Rekap');
        recap.columns = [
            { width: 10 },
            { width: 22 },
            { width: 20 },
            { width: 14 },
            { width: 14 },
            { width: 14 },
            { width: 14 },
            { width: 42 },
        ];

        recap.addRow([company]);
        recap.addRow([appName]);
        recap.addRow([]);
        recap.addRow(['Probationary Employee Assessment - Recap']);
        recap.mergeCells('A4:H4');
        recap.addRow([]);
        recap.addRow(['Nama', employee.name, '', 'Jabatan', employee.position || '-']);
        recap.addRow(['Mulai Probation', review.review_period_start || draft.review_period_start || '-', '', 'Akhir Probation', review.review_period_end || draft.review_period_end || '-']);
        recap.addRow([]);
        recap.addRow(['No', 'Task', 'Period', `Work (${workWeightLabel})`, `Managing (${managingWeightLabel})`, `Attitude (${attitudeWeightLabel})`, 'Total', 'Qualitative']);

        (draft.monthly_rows || []).forEach(row => {
            recap.addRow([
                row.month_no,
                `Hasil Progres Bulan ${row.month_no}`,
                `${row.period_start} to ${row.period_end}`,
                Number(row.work_performance_score || 0),
                Number(row.managing_task_score || 0),
                Number(row.attitude_score || 0),
                Number(row.monthly_total || 0),
                row.manager_qualitative_text || review.manager_notes || '-',
            ]);
        });

        recap.addRow(['', 'Score Rata-rata', '', Number(draft.quantitative_score || 0), Number(draft.qualitative_score || 0), '', Number(review.final_score || draft.final_score || 0), '']);
        recap.addRow([]);
        recap.addRow(['Decision', review.decision || 'pending']);
        recap.addRow(['Summary', review.manager_notes || '-']);

        [9, 10, 11, 12].forEach(rn => {
            const row = recap.getRow(rn);
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            });
        });
        recap.getCell('A4').font = { bold: true, size: 14 };
        recap.getCell('A4').alignment = { horizontal: 'center' };

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = String(employee.name || review.employee_id || 'employee').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.href = url;
        a.download = `probation_${safeName}_${getCurrentPeriodKey()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        await notify.success('Probation Excel exported.');
    } catch (error) {
        await notify.error(`Failed to export probation Excel: ${getErrorMessage(error)}`);
    }
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








