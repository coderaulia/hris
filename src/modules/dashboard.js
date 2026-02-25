// ==================================================
// DASHBOARD MODULE — Assessment & KPI Summary
// ==================================================

import { Chart } from 'chart.js/auto';
import { state } from '../lib/store.js';
import { getDepartment, formatPeriod } from '../lib/utils.js';

let chartDistInstance = null;
let chartStatusInstance = null;
let chartScoreInstance = null;
let chartKpiOverviewInstance = null;
let chartKpiTrendInstance = null;

export function renderDashboard() {
    renderAssessmentSummary();
    renderKpiSummary();
}

// ==================================================
// ASSESSMENT SUMMARY
// ==================================================
function renderAssessmentSummary() {
    const { db } = state;
    const keys = Object.keys(db);

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

        const score = rec.percentage || 0;
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
        if (rec.percentage > 0 && rec.scores) {
            rec.scores.forEach(s => { if (s.s < 7) gapMap[s.q] = (gapMap[s.q] || 0) + 1; });
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
          <div><div class="fw-bold">${item[0]}</div><div class="text-muted" style="font-size:11px;">Recommended for ${item[1]} staff</div></div>
          <span class="badge bg-danger rounded-pill">${pct}%</span></li>`;
            });
        }
    }

    // Charts
    // Distribution Doughnut
    let cHigh = 0, cMid = 0, cLow = 0;
    keys.forEach(id => {
        const s = db[id].percentage || 0;
        if (s > 0) { if (s >= 80) cHigh++; else if (s >= 60) cMid++; else cLow++; }
    });

    const ctxDist = document.getElementById('chartDist');
    if (ctxDist) {
        if (chartDistInstance) chartDistInstance.destroy();
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

// ==================================================
// KPI SUMMARY
// ==================================================
function renderKpiSummary() {
    const { kpiRecords, kpiConfig, db } = state;

    // KPI Overview Cards
    const totalKpis = kpiConfig.length;
    const totalRecords = kpiRecords.length;
    let totalAchievement = 0;
    let achievedCount = 0;

    kpiRecords.forEach(record => {
        const def = kpiConfig.find(k => k.id === record.kpi_id);
        if (def && def.target > 0) {
            const ach = (record.value / def.target) * 100;
            totalAchievement += ach;
            achievedCount++;
        }
    });

    const avgAchievement = achievedCount > 0 ? Math.round(totalAchievement / achievedCount) : 0;

    // Count how many meet target
    let metTarget = 0;
    kpiRecords.forEach(record => {
        const def = kpiConfig.find(k => k.id === record.kpi_id);
        if (def && def.target > 0 && record.value >= def.target) metTarget++;
    });

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setTxt('d-kpi-total', totalKpis);
    setTxt('d-kpi-records', totalRecords);
    setTxt('d-kpi-avg', avgAchievement + '%');
    setTxt('d-kpi-met', metTarget);

    // KPI Achievement by Category Chart
    const ctxKpiOverview = document.getElementById('chartKpiOverview');
    if (ctxKpiOverview) {
        if (chartKpiOverviewInstance) chartKpiOverviewInstance.destroy();

        const catMap = {};
        kpiRecords.forEach(record => {
            const def = kpiConfig.find(k => k.id === record.kpi_id);
            if (!def) return;
            const cat = def.category || 'General';
            if (!catMap[cat]) catMap[cat] = { sum: 0, count: 0 };
            if (def.target > 0) {
                catMap[cat].sum += (record.value / def.target) * 100;
                catMap[cat].count++;
            }
        });

        const catLabels = Object.keys(catMap);
        const catData = catLabels.map(c => catMap[c].count > 0 ? Math.round(catMap[c].sum / catMap[c].count) : 0);

        chartKpiOverviewInstance = new Chart(ctxKpiOverview, {
            type: 'bar',
            data: {
                labels: catLabels.length > 0 ? catLabels : ['No Data'],
                datasets: [{
                    label: 'Avg Achievement %',
                    data: catData.length > 0 ? catData : [0],
                    backgroundColor: catData.map(v => v >= 100 ? '#198754' : v >= 75 ? '#0d6efd' : v >= 50 ? '#ffc107' : '#dc3545'),
                    borderRadius: 6,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                scales: { x: { beginAtZero: true, max: 150 } },
                plugins: { legend: { display: false } },
            },
        });
    }

    // KPI Top/Bottom Performers
    const perfList = document.getElementById('d-kpi-performers');
    if (perfList) {
        perfList.innerHTML = '';

        // Calculate average achievement per employee
        const empAch = {};
        kpiRecords.forEach(record => {
            const def = kpiConfig.find(k => k.id === record.kpi_id);
            if (!def || def.target <= 0) return;
            if (!empAch[record.employee_id]) empAch[record.employee_id] = { sum: 0, count: 0 };
            empAch[record.employee_id].sum += (record.value / def.target) * 100;
            empAch[record.employee_id].count++;
        });

        const empList = Object.entries(empAch)
            .map(([id, data]) => ({ id, avg: Math.round(data.sum / data.count), name: db[id]?.name || id }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 5);

        if (empList.length === 0) {
            perfList.innerHTML = '<li class="list-group-item text-center text-muted fst-italic">No KPI data yet.</li>';
        } else {
            empList.forEach((emp, i) => {
                const icon = i === 0 ? '<i class="bi bi-trophy-fill text-warning me-1"></i>' : '';
                let badgeClass = emp.avg >= 100 ? 'bg-success' : emp.avg >= 75 ? 'bg-primary' : emp.avg >= 50 ? 'bg-warning text-dark' : 'bg-danger';
                perfList.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">
          <span>${icon}<span class="fw-bold">${emp.name}</span></span>
          <span class="badge ${badgeClass} rounded-pill">${emp.avg}%</span></li>`;
            });
        }
    }
}
