// ==================================================
// RECORDS & REPORTS MODULE
// ==================================================

import { getChartCtor } from '../../lib/chartLoader.js';
import { state, emit, isAdmin, isEmployee, isManager } from '../../lib/store.js';
import { getAssessmentHistory, getManagerAssessment, getSelfAssessment, getTrainingRecords, setAssessmentHistory, setManagerAssessment, setSelfAssessment, setTrainingRecords } from '../../lib/employee-records.js';
import { escapeHTML, escapeInlineArg, getDisplayDate, toPeriodKey, formatPeriod, formatNumber } from '../../lib/utils.js';
import { saveEmployee, logActivity } from '../data.js';
import { requireRecentAuth } from '../auth.js';
import { startAssessment, renderPendingList, initiateSelfAssessment as _initSelfAssess } from '../assessment.js';
import * as notify from '../../lib/notify.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import { DOM_IDS } from '../../lib/uiContracts.js';

let competencyChart = null;
let historyChart = null;
let editingTrainingIndex = -1;
let currentTrainingId = null;

function setAssessmentRecordsCount(visibleCount, scopedCount = visibleCount) {
    const badge = document.getElementById('assessment-records-count');
    if (!badge) return;
    badge.innerText = String(visibleCount);
    badge.title = visibleCount === scopedCount
        ? `${visibleCount} assessment record${visibleCount === 1 ? '' : 's'} shown`
        : `Showing ${visibleCount} of ${scopedCount} assessment records`;
}

// ---- RENDER RECORDS TABLE ----
export function renderRecordsTable(filterKeys = null) {
    const tbody = document.getElementById(DOM_IDS.records.tableBody);
    if (!tbody) return;
    tbody.innerHTML = '';

    const { currentUser, db } = state;
    if (!currentUser) return;

    const scopedSet = new Set(getFilteredEmployeeIds());
    const scopedKeys = Object.keys(db).filter(id => scopedSet.has(id));
    let keys = [...scopedKeys];
    if (filterKeys) {
        const filterSet = new Set(filterKeys);
        keys = keys.filter(id => filterSet.has(id));
    }

    const periodFilter = state.reportFilters?.period || '';
    if (periodFilter) {
        keys = keys.filter(id => {
            const rec = db[id];
            const managerAssessment = getManagerAssessment(rec);
            const period = toPeriodKey(managerAssessment.updatedAt || managerAssessment.sourceDate || rec.date_created);
            return period === periodFilter;
        });
    }

    setAssessmentRecordsCount(keys.length, scopedKeys.length);

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
        const managerAssessment = getManagerAssessment(rec);
        const selfAssessment = getSelfAssessment(rec);

        const seniorTxt = rec.seniority || '-';
        let levelClass = 'bg-secondary text-white';
        if (seniorTxt.includes('Manager')) levelClass = 'bg-dark text-white';
        else if (seniorTxt === 'Junior') levelClass = 'bg-info text-dark';
        else if (seniorTxt === 'Intermediate') levelClass = 'bg-primary text-white';
        else if (seniorTxt === 'Senior') levelClass = 'bg-warning text-dark';
        else if (seniorTxt === 'Lead') levelClass = 'bg-success text-white';

        const pct = managerAssessment.percentage || 0;
        let badgeColor = 'bg-secondary';
        if (pct >= 80) badgeColor = 'bg-success';
        else if (pct >= 60) badgeColor = 'bg-primary';
        else if (pct >= 40) badgeColor = 'bg-warning text-dark';
        else if (pct > 0) badgeColor = 'bg-danger';

        // Self assessment status
        let selfStatus = '';
        if (selfAssessment.percentage > 0) {
            selfStatus = `<div class="small"><span class="badge bg-info bg-opacity-25 text-info border">Self: ${selfAssessment.percentage}%</span></div>`;
        } else if (pct > 0) {
            selfStatus = `<div class="small"><span class="badge bg-light text-muted border">Self: Pending</span></div>`;
        }

        let actions = '';
        if (isEmployee()) {
            // Employee: can self-assess if manager has assessed them
            if (pct > 0) {
                if ((selfAssessment.scores && selfAssessment.scores.length > 0) || (selfAssessment.percentage && selfAssessment.percentage > 0)) {
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
          <div class="small">${escapeHTML(getDisplayDate(managerAssessment.updatedAt || managerAssessment.sourceDate || rec.date_created || rec.date || '-'))}</div>
          <div class="text-muted" style="font-size:11px;">by ${escapeHTML(state.db[managerAssessment.updatedBy]?.name || managerAssessment.updatedBy || '-')}</div>
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
export async function openReportByVal(id) {
    const rec = state.db[id];
    if (!rec) return;
    const managerAssessment = getManagerAssessment(rec);
    const selfAssessment = getSelfAssessment(rec);
    const history = getAssessmentHistory(rec);
    const trainingHistory = getTrainingRecords(rec);

    const setTxt = (domId, val) => {
        const el = document.getElementById(domId);
        if (el) el.innerText = val;
    };

    setTxt('r-name', rec.name);
    setTxt('r-id', rec.id);
    setTxt('r-pos', rec.position);
    setTxt('r-seniority', rec.seniority);
    setTxt('r-join-date', getDisplayDate(rec.join_date));
    setTxt('r-date-updated', getDisplayDate(managerAssessment.sourceDate || rec.date_created));
    setTxt('r-date-next', getDisplayDate(rec.date_next));
    setTxt('r-total', managerAssessment.percentage || 0);
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
    if (selfAssessment.scores) selfAssessment.scores.forEach(s => selfMap[s.q] = s.s);

    if (managerAssessment.scores && managerAssessment.scores.length > 0) {
        managerAssessment.scores.forEach(s => {
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
    let histData = history ? [...history] : [];
    if (managerAssessment.percentage > 0) histData.push({ date: managerAssessment.sourceDate || 'Today', score: managerAssessment.percentage });

    if (historyBox) {
        if (histData.length > 0) {
            historyBox.classList.remove('hidden');
            if (document.getElementById('historyChart')) renderHistoryChart(histData);
        } else {
            historyBox.classList.add('hidden');
        }
    }

    renderReportTrainingTables(trainingHistory || []);

    const overlay = document.getElementById('report-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

async function renderComparisonChart(labels, mgrData, selfData) {
    const ctx = document.getElementById('competencyChart');
    if (competencyChart) competencyChart.destroy();
    const maxScale = parseInt(state.appSettings?.assessment_scale_max || '10');

    const Chart = await getChartCtor();
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

async function renderHistoryChart(dataPoints) {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    if (historyChart) historyChart.destroy();
    const Chart = await getChartCtor();
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
    const history = getTrainingRecords(rec);

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
    let rec = state.db[currentTrainingId];
    if (!rec) return;

    const course = document.getElementById('t-course-name').value.trim();
    const start = document.getElementById('t-date-start').value;
    let end = document.getElementById('t-date-end').value;
    const isOngoing = document.getElementById('t-ongoing').checked;

    if (!course) { await notify.warn('Please enter a course name.'); return; }
    if (isOngoing) end = '';
    const trainingHistory = [...getTrainingRecords(rec)];

    let status = isEmployee() ? 'pending' : 'approved';
    const newItem = { course, start, end, provider: 'External', status };

    if (editingTrainingIndex === -1) {
        trainingHistory.push(newItem);
    } else {
        newItem.status = trainingHistory[editingTrainingIndex].status;
        trainingHistory[editingTrainingIndex] = newItem;
    }
    rec = setTrainingRecords(rec, trainingHistory);

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
    let rec = state.db[currentTrainingId];
    const trainingHistory = [...getTrainingRecords(rec)];
    trainingHistory[index].status = 'approved';
    rec = setTrainingRecords(rec, trainingHistory);
    await notify.withLoading(async () => {
        await saveEmployee(rec);
    }, 'Approving Training', 'Updating training status...');
    renderTrainingHistory();
}

export function editTrainingItem(index) {
    const rec = state.db[currentTrainingId];
    const item = getTrainingRecords(rec)[index];
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
    let rec = state.db[currentTrainingId];
    const trainingHistory = [...getTrainingRecords(rec)];
    trainingHistory.splice(index, 1);
    rec = setTrainingRecords(rec, trainingHistory);
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
        let nextRec = setManagerAssessment(rec, { percentage: 0, scores: [], sourceDate: '-', updatedAt: new Date().toISOString(), updatedBy: state.currentUser?.id || '' });
        nextRec = setAssessmentHistory(nextRec, []);
        nextRec = setSelfAssessment(nextRec, { percentage: 0, scores: [], sourceDate: '', updatedAt: '', updatedBy: '' });
        nextRec.date_created = '-'; nextRec.date_updated = '-'; nextRec.date_next = '-';
        state.db[id] = nextRec;
        await notify.withLoading(async () => {
            await saveEmployee(nextRec);
        }, 'Deleting Assessment', 'Removing assessment record...');
        await logActivity({
            action: 'assessment.delete',
            entityType: 'assessment',
            entityId: id,
            details: {
                employee_name: nextRec.name,
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

