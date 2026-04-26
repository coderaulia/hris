// ==================================================
// DASHBOARD MODULE — Assessment & KPI Summary
// ==================================================

import { state } from '../../lib/store.js';
import { getChartCtor } from '../../lib/chartLoader.js';
import { renderKpiSummary } from './kpiSummary.js';
import { getManagerAssessment } from '../../lib/employee-records.js';
import { getDepartment, escapeHTML, toPeriodKey } from '../../lib/utils.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';

let chartDistInstance = null;
let chartStatusInstance = null;
let chartScoreInstance = null;

export async function renderDashboard() {
    await Promise.all([
        renderAssessmentSummary(),
        renderKpiSummary(),
    ]);
}

// ==================================================
// ASSESSMENT SUMMARY
// ==================================================
async function renderAssessmentSummary() {
    const { db } = state;
    let keys = getFilteredEmployeeIds();
    const selectedPeriod = state.reportFilters?.period || '';
    if (selectedPeriod) {
        keys = keys.filter(id => {
            const rec = db[id];
            const managerAssessment = getManagerAssessment(rec);
            return toPeriodKey(managerAssessment.updatedAt || managerAssessment.sourceDate || rec?.date_created) === selectedPeriod;
        });
    }

    let totalEmp = keys.length;
    let pendingCount = 0, completedCount = 0, totalScore = 0;
    let maxScore = -1;
    let topPerformer = { name: '-', dept: '-' };
    let deptMap = {};

    keys.forEach(id => {
        const rec = db[id];
        if (!rec.department || rec.department === 'Other') rec.department = getDepartment(rec.position);
        const dept = rec.department;

        if (!deptMap[dept]) deptMap[dept] = { total: 0, completed: 0, pending: 0, sumScore: 0 };
        deptMap[dept].total++;

        const score = getManagerAssessment(rec).percentage || 0;
        if (score > 0) {
            completedCount++;
            totalScore += score;
            deptMap[dept].completed++;
            deptMap[dept].sumScore += score;
            if (score > maxScore) { maxScore = score; topPerformer = { name: rec.name, dept }; }
        } else {
            pendingCount++;
            deptMap[dept].pending++;
        }
    });

    // Cards
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setTxt('d-total-emp', totalEmp);
    const totalSub = document.getElementById('d-total-sub');
    if (totalSub) totalSub.innerHTML = `<span class="text-danger fw-bold">${pendingCount} Pending</span> | <span class="text-success fw-bold">${completedCount} Done</span>`;

    const globalAvg = completedCount > 0 ? Math.round(totalScore / completedCount) : 0;
    setTxt('d-avg-score', globalAvg + '%');
    setTxt('d-top-emp', topPerformer.name);
    setTxt('d-top-role', topPerformer.dept);

    // Skill Gaps
    let gapMap = {};
    keys.forEach(id => {
        const rec = db[id];
        const managerAssessment = getManagerAssessment(rec);
        if (managerAssessment.percentage > 0 && managerAssessment.scores) {
            managerAssessment.scores.forEach(s => { if (s.s < 7) gapMap[s.q] = (gapMap[s.q] || 0) + 1; });
        }
    });

    const gapList = Object.entries(gapMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const gapEl = document.getElementById('d-skill-gaps');
    if (gapEl) {
        gapEl.innerHTML = '';
        if (gapList.length === 0) {
            gapEl.innerHTML = '<li class="list-group-item text-center text-muted fst-italic">No data available.</li>';
        } else {
            gapList.forEach(item => {
                const pct = completedCount > 0 ? Math.round((item[1] / completedCount) * 100) : 0;
                gapEl.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">
          <div><div class="fw-bold">${escapeHTML(item[0])}</div><div class="text-muted" style="font-size:11px;">Recommended for ${item[1]} staff</div></div>
          <span class="badge bg-danger rounded-pill">${pct}%</span></li>`;
            });
        }
    }

    // Charts
    // Distribution Doughnut
    let cHigh = 0, cMid = 0, cLow = 0;
    keys.forEach(id => {
        const s = getManagerAssessment(db[id]).percentage || 0;
        if (s > 0) { if (s >= 80) cHigh++; else if (s >= 60) cMid++; else cLow++; }
    });

    const ctxDist = document.getElementById('chartDist');
    if (ctxDist) {
        if (chartDistInstance) chartDistInstance.destroy();
        const Chart = await getChartCtor();
        chartDistInstance = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['High (>80%)', 'Mid (60-79%)', 'Low (<60%)'],
                datasets: [{ data: [cHigh, cMid, cLow], backgroundColor: ['#198754', '#0d6efd', '#dc3545'], borderWidth: 0 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } } },
        });
    }

    // Department Status
    const deptLabels = Object.keys(deptMap);
    const ctxStatus = document.getElementById('chartStatus');
    if (ctxStatus) {
        if (chartStatusInstance) chartStatusInstance.destroy();
        const Chart = await getChartCtor();
        chartStatusInstance = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: deptLabels,
                datasets: [
                    { label: 'Done', data: deptLabels.map(d => deptMap[d].completed), backgroundColor: '#198754' },
                    { label: 'Pending', data: deptLabels.map(d => deptMap[d].pending), backgroundColor: '#e9ecef', borderWidth: 1, borderColor: '#ced4da' },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { position: 'top' } },
            },
        });
    }

    // Average Score
    const ctxScore = document.getElementById('chartScore');
    if (ctxScore) {
        if (chartScoreInstance) chartScoreInstance.destroy();
        const Chart = await getChartCtor();
        chartScoreInstance = new Chart(ctxScore, {
            type: 'bar',
            data: {
                labels: deptLabels,
                datasets: [{ label: 'Avg Score', data: deptLabels.map(d => { const i = deptMap[d]; return i.completed > 0 ? Math.round(i.sumScore / i.completed) : 0; }), backgroundColor: '#0d6efd', borderRadius: 4 }],
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } },
        });
    }
}

export { renderAssessmentSummary };
