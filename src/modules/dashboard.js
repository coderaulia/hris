// ==================================================
// DASHBOARD MODULE — Assessment & KPI Summary
// ==================================================

import { Chart } from 'chart.js/auto';
import { state } from '../lib/store.js';
import { getDepartment, formatPeriod, escapeHTML, formatNumber } from '../lib/utils.js';

let chartDistInstance = null;
let chartStatusInstance = null;
let chartScoreInstance = null;
let chartKpiOverviewInstance = null;
let chartKpiTrendInstance = null;

// Store modal data for export/tab reuse
let _currentDeptName = '';
let _currentDeptRows = [];
let _currentDeptEmpIds = [];
let _currentDeptRecords = [];
let _deptKpiTrendChart = null;

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
          <div><div class="fw-bold">${escapeHTML(item[0])}</div><div class="text-muted" style="font-size:11px;">Recommended for ${item[1]} staff</div></div>
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

    const today = new Date();
    const currentMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');

    const currentQ = Math.floor(today.getMonth() / 3);
    const qPeriods = [
        today.getFullYear() + '-' + String(currentQ * 3 + 1).padStart(2, '0'),
        today.getFullYear() + '-' + String(currentQ * 3 + 2).padStart(2, '0'),
        today.getFullYear() + '-' + String(currentQ * 3 + 3).padStart(2, '0')
    ];

    const monthlyRecords = kpiRecords.filter(r => r.period === currentMonth);
    const quarterlyRecords = kpiRecords.filter(r => qPeriods.includes(r.period));

    // KPI Overview Cards (Current Month)
    const totalKpis = kpiConfig.length;
    const totalRecords = monthlyRecords.length;
    let totalAchievement = 0;
    let achievedCount = 0;

    monthlyRecords.forEach(record => {
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
    monthlyRecords.forEach(record => {
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
        monthlyRecords.forEach(record => {
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

    // Helper for rendering top performers list
    const renderPerformers = (records, elId) => {
        const perfList = document.getElementById(elId);
        if (!perfList) return;
        perfList.innerHTML = '';

        const empAch = {};
        records.forEach(record => {
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
          <span>${icon}<span class="fw-bold">${escapeHTML(emp.name)}</span></span>
          <span class="badge ${badgeClass} rounded-pill">${emp.avg}%</span></li>`;
            });
        }
    };

    renderPerformers(monthlyRecords, 'd-kpi-performers-monthly');
    renderPerformers(quarterlyRecords, 'd-kpi-performers-quarterly');

    // Render department cards
    renderDeptKpiCards(monthlyRecords);
}

// ==================================================
// DEPARTMENT KPI CARDS
// ==================================================
function renderDeptKpiCards(records) {
    const container = document.getElementById('d-kpi-dept-cards');
    if (!container) return;

    const { db, kpiConfig } = state;

    // Group employees by department
    const deptMap = {};
    Object.keys(db).forEach(id => {
        const emp = db[id];
        const dept = emp.department || 'Other';
        if (!deptMap[dept]) deptMap[dept] = [];
        deptMap[dept].push(id);
    });

    // Calculate KPI stats per department
    const deptStats = {};
    Object.keys(deptMap).forEach(dept => {
        const empIds = deptMap[dept];
        const deptRecords = records.filter(r => empIds.includes(r.employee_id));
        let totalAch = 0, achCount = 0, metCount = 0;

        deptRecords.forEach(record => {
            const def = kpiConfig.find(k => k.id === record.kpi_id);
            const emp = db[record.employee_id];
            const targets = emp?.kpi_targets || {};
            const target = targets[record.kpi_id] !== undefined ? targets[record.kpi_id] : (def?.target || 0);
            if (target > 0) {
                const ach = (record.value / target) * 100;
                totalAch += ach;
                achCount++;
                if (record.value >= target) metCount++;
            }
        });

        deptStats[dept] = {
            employees: empIds.length,
            records: deptRecords.length,
            avgAch: achCount > 0 ? Math.round(totalAch / achCount) : 0,
            metTarget: metCount,
        };
    });

    // Color palette for departments
    const colors = [
        { bg: 'rgba(79, 70, 229, 0.08)', border: '#4f46e5', icon: 'bi-people-fill', iconColor: '#4f46e5' },
        { bg: 'rgba(16, 185, 129, 0.08)', border: '#10b981', icon: 'bi-briefcase-fill', iconColor: '#10b981' },
        { bg: 'rgba(245, 158, 11, 0.08)', border: '#f59e0b', icon: 'bi-graph-up', iconColor: '#f59e0b' },
        { bg: 'rgba(239, 68, 68, 0.08)', border: '#ef4444', icon: 'bi-pie-chart-fill', iconColor: '#ef4444' },
        { bg: 'rgba(6, 182, 212, 0.08)', border: '#06b6d4', icon: 'bi-bar-chart-fill', iconColor: '#06b6d4' },
        { bg: 'rgba(168, 85, 247, 0.08)', border: '#a855f7', icon: 'bi-people', iconColor: '#a855f7' },
    ];

    const sortedDepts = Object.keys(deptStats).sort();
    container.innerHTML = '';

    sortedDepts.forEach((dept, i) => {
        const st = deptStats[dept];
        const c = colors[i % colors.length];

        let achBadge = 'bg-secondary';
        if (st.avgAch >= 100) achBadge = 'bg-success';
        else if (st.avgAch >= 75) achBadge = 'bg-primary';
        else if (st.avgAch >= 50) achBadge = 'bg-warning text-dark';
        else if (st.records > 0) achBadge = 'bg-danger';

        container.innerHTML += `
        <div class="col-md-4 col-lg-3">
            <div class="card border-0 shadow-sm h-100 dept-kpi-card" role="button"
                 onclick="window.__app.openDeptKpiModal('${escapeHTML(dept)}')"
                 style="background: ${c.bg}; border-left: 4px solid ${c.border} !important; transition: transform .15s, box-shadow .15s;">
                <div class="card-body py-3 px-3">
                    <div class="d-flex align-items-center mb-2">
                        <div class="rounded-circle d-flex align-items-center justify-content-center me-2"
                             style="width: 32px; height: 32px; background: ${c.border}20;">
                            <i class="bi ${c.icon}" style="color: ${c.border}; font-size: 14px;"></i>
                        </div>
                        <h6 class="m-0 fw-bold small text-truncate" style="max-width: 150px;" title="${escapeHTML(dept)}">${escapeHTML(dept)}</h6>
                    </div>
                    <div class="d-flex justify-content-between align-items-end">
                        <div>
                            <div class="text-muted" style="font-size: 11px;">${st.employees} employees · ${st.records} records</div>
                            <div class="text-muted" style="font-size: 11px;">${st.metTarget} met target</div>
                        </div>
                        <span class="badge ${achBadge} fs-6">${st.records > 0 ? st.avgAch + '%' : '-'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    });
}

// ==================================================
// DEPARTMENT KPI DRILL-DOWN MODAL
// ==================================================
export function openDeptKpiModal(dept) {
    const { db, kpiRecords } = state;

    _currentDeptName = dept;

    // Get employees in this department
    _currentDeptEmpIds = Object.keys(db).filter(id => db[id].department === dept);
    _currentDeptRecords = kpiRecords.filter(r => _currentDeptEmpIds.includes(r.employee_id));

    // Get unique months in the department records + current month
    const today = new Date();
    const currentMonthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    let distinctMonths = [...new Set(_currentDeptRecords.map(r => r.period))];
    if (!distinctMonths.includes(currentMonthStr)) {
        distinctMonths.push(currentMonthStr);
    }
    distinctMonths.sort().reverse();

    // Render Tabs
    const tabsHtml = distinctMonths.map(m => `
        <li class="nav-item">
            <button class="nav-link ${m === currentMonthStr ? 'active' : ''}" 
                onclick="window.__app.renderDeptKpiTable('${m}', this)">
                ${formatPeriod(m)}
            </button>
        </li>
    `).join('');

    const tabsEl = document.getElementById('deptKpiMonthTabs');
    if (tabsEl) tabsEl.innerHTML = tabsHtml;

    // Show modal
    const modalEl = document.getElementById('deptKpiModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }

    // Render table
    window.__app.renderDeptKpiTable(currentMonthStr, null);
}

export function renderDeptKpiTable(month, tabBtn) {
    if (tabBtn) {
        document.querySelectorAll('#deptKpiMonthTabs .nav-link').forEach(n => n.classList.remove('active'));
        tabBtn.classList.add('active');
    }

    const { db, kpiConfig } = state;

    // Filter by month
    const monthRecords = _currentDeptRecords.filter(r => r.period === month);

    // Build row data
    const rows = [];
    let totalAch = 0, achCount = 0, metCount = 0;

    monthRecords.forEach(record => {
        const emp = db[record.employee_id];
        const def = kpiConfig.find(k => k.id === record.kpi_id);
        const targets = emp?.kpi_targets || {};
        const target = targets[record.kpi_id] !== undefined ? targets[record.kpi_id] : (def?.target || 0);
        const achievement = target > 0 ? Math.round((record.value / target) * 100) : 0;

        if (target > 0) {
            totalAch += achievement;
            achCount++;
            if (record.value >= target) metCount++;
        }

        rows.push({
            name: emp?.name || record.employee_id,
            position: emp?.position || '-',
            kpi: def?.name || 'Unknown',
            unit: def?.unit || '',
            period: formatPeriod(record.period),
            periodRaw: record.period,
            value: record.value,
            target: target,
            achievement: achievement,
            employee_id: record.employee_id
        });
    });

    _currentDeptRows = rows;

    const avgAch = achCount > 0 ? Math.round(totalAch / achCount) : 0;

    // Update modal title
    document.getElementById('deptKpiModalTitle').innerText = _currentDeptName;

    // Summary stats
    const statsEl = document.getElementById('deptKpiModalStats');
    if (statsEl) {
        statsEl.innerHTML = `
        <div class="col-md-4">
            <div class="card border border-2 h-100"><div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="text-muted small fw-bold text-uppercase">Total Employees</div>
                    <div class="bg-primary bg-opacity-10 text-primary rounded p-1"><i class="bi bi-people-fill" style="font-size: 0.7rem;"></i></div>
                </div>
                <div class="fs-2 fw-bold mb-1">${_currentDeptEmpIds.length}</div>
                <div class="small text-success"><i class="bi bi-arrow-up-short"></i> Stable</div>
            </div></div>
        </div>
        <div class="col-md-4">
            <div class="card border border-2 h-100"><div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="text-muted small fw-bold text-uppercase">Active KPIs</div>
                    <div class="bg-warning bg-opacity-10 text-warning rounded p-1"><i class="bi bi-flag-fill" style="font-size: 0.7rem;"></i></div>
                </div>
                <div class="fs-2 fw-bold mb-1">${monthRecords.length}</div>
                <div class="small text-muted">Targets set</div>
            </div></div>
        </div>
        <div class="col-md-4">
            <div class="card border border-2 h-100"><div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="text-muted small fw-bold text-uppercase">Overall Achievement</div>
                    <div class="bg-warning bg-opacity-10 text-warning rounded p-1"><i class="bi bi-trophy-fill" style="font-size: 0.7rem;"></i></div>
                </div>
                <div class="d-flex align-items-baseline gap-2 mb-2">
                    <div class="fs-2 fw-bold">${avgAch}%</div>
                    <div class="small ${avgAch >= 100 ? 'text-success' : 'text-danger'}">${avgAch >= 100 ? 'On Target' : 'Below Target'}</div>
                </div>
                <div class="progress" style="height: 4px;">
                    <div class="progress-bar ${avgAch >= 100 ? 'bg-success' : 'bg-warning'}" style="width: ${Math.min(avgAch, 100)}%"></div>
                </div>
            </div></div>
        </div>`;
    }

    // 6-Month Trend Chart
    const trendCtx = document.getElementById('deptKpiTrendChart');
    if (trendCtx) {
        if (_deptKpiTrendChart) _deptKpiTrendChart.destroy();

        // Calculate last 6 months logic
        const monthCounts = {};
        const monthAchs = {};
        const today2 = new Date();
        const past6Months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today2.getFullYear(), today2.getMonth() - i, 1);
            past6Months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
        }

        _currentDeptRecords.forEach(r => {
            if (past6Months.includes(r.period)) {
                if (!monthCounts[r.period]) { monthCounts[r.period] = 0; monthAchs[r.period] = 0; }

                const def = kpiConfig.find(k => k.id === r.kpi_id);
                const t = (db[r.employee_id]?.kpi_targets || {})[r.kpi_id] !== undefined ? db[r.employee_id]?.kpi_targets[r.kpi_id] : (def?.target || 0);
                if (t > 0) {
                    monthAchs[r.period] += (r.value / t) * 100;
                    monthCounts[r.period]++;
                }
            }
        });

        const chartData = past6Months.map(m => monthCounts[m] ? monthAchs[m] / monthCounts[m] : 0);

        // Update badge (compare last vs previous)
        const curM = chartData[5];
        const prevM = chartData[4];
        const diff = prevM > 0 ? ((curM - prevM) / prevM) * 100 : (curM > 0 ? 100 : 0);
        const badgeEl = document.getElementById('deptKpiTrendBadge');
        if (badgeEl) {
            badgeEl.innerText = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
            badgeEl.className = `badge rounded-pill ${diff >= 0 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`;
        }

        const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        _deptKpiTrendChart = new Chart(trendCtx, {
            type: 'bar',
            data: {
                labels: past6Months.map(m => mNames[parseInt(m.split('-')[1]) - 1]),
                datasets: [{
                    data: chartData,
                    backgroundColor: chartData.map((_, i) => i === 5 ? '#a855f7' : i === 4 ? '#c084fc' : '#e9d5ff'),
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { display: true, grid: { display: false }, border: { display: false } }, y: { display: false, max: 120 } },
                plugins: { legend: { display: false }, tooltip: { enabled: true } }
            }
        });
    }

    // Table rows
    const tbody = document.getElementById('deptKpiModalBody');
    if (tbody) {
        tbody.innerHTML = '';
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5">No KPI records for this month.</td></tr>';
        } else {
            // Sort rows by employee name, then by period
            rows.sort((a, b) => {
                if (a.name !== b.name) return a.name.localeCompare(b.name);
                return b.periodRaw.localeCompare(a.periodRaw);
            });

            // Compute overall percentage per employee
            const empOverall = {};
            rows.forEach(r => {
                if (!empOverall[r.name]) empOverall[r.name] = { sum: 0, count: 0 };
                empOverall[r.name].sum += r.achievement;
                empOverall[r.name].count++;
            });

            let currentEmp = null;

            rows.forEach(r => {
                if (currentEmp !== r.name) {
                    const avg = empOverall[r.name].count > 0 ? Math.round(empOverall[r.name].sum / empOverall[r.name].count) : 0;

                    const initials = r.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                    tbody.innerHTML += `
                    <tr class="table-light kpi-emp-row">
                        <td colspan="5" class="py-3 px-4 border-bottom">
                            <div class="d-flex align-items-center">
                                <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold me-3" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                    ${initials}
                                </div>
                                <div class="d-flex align-items-center gap-3">
                                    <span class="fw-bold emp-search-target">${escapeHTML(r.name)}</span>
                                    <span class="text-muted small">${escapeHTML(r.position)}</span>
                                </div>
                                <div class="ms-auto small fw-bold" style="color: ${avg >= 100 ? '#10b981' : avg >= 75 ? '#f59e0b' : '#ef4444'}">
                                    ${avg}% Avg
                                </div>
                            </div>
                        </td>
                    </tr>`;
                    currentEmp = r.name;
                }

                let badgeHtml = '';
                if (r.achievement >= 100) {
                    badgeHtml = '<span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2"><span style="font-size: 8px; vertical-align: middle;">🟢</span> On Track</span>';
                } else if (r.achievement >= 75) {
                    badgeHtml = '<span class="badge bg-warning bg-opacity-10 text-warning rounded-pill px-2"><span style="font-size: 8px; vertical-align: middle;">🟡</span> Delayed</span>';
                } else {
                    badgeHtml = '<span class="badge bg-danger bg-opacity-10 text-danger rounded-pill px-2"><span style="font-size: 8px; vertical-align: middle;">🔴</span> At Risk</span>';
                }

                tbody.innerHTML += `<tr class="kpi-detail-row" data-emp="${escapeHTML(r.name)}">
                    <td class="ps-5 pe-4">
                        <span class="text-dark small">${escapeHTML(r.kpi)}</span>
                    </td>
                    <td class="text-end text-muted small pe-4">${formatNumber(r.target)}</td>
                    <td class="text-end fw-bold small pe-4">${formatNumber(r.value)}</td>
                    <td class="text-center">${badgeHtml}</td>
                    <td class="text-end text-muted"><i class="bi bi-three-dots-vertical" role="button"></i></td>
                </tr>`;
            });
        }
    }
}

export function searchDeptKpiModal() {
    const input = document.getElementById('deptKpiSearch')?.value.toLowerCase() || '';
    const tbody = document.getElementById('deptKpiModalBody');
    if (!tbody) return;

    // Filter logic: show rows where name matches, hide others
    const empRows = tbody.querySelectorAll('.kpi-emp-row');
    const detailRows = tbody.querySelectorAll('.kpi-detail-row');

    const visibleEmps = new Set();

    empRows.forEach(row => {
        const name = row.querySelector('.emp-search-target')?.innerText.toLowerCase() || '';
        if (name.includes(input)) {
            row.style.display = '';
            visibleEmps.add(name);
        } else {
            row.style.display = 'none';
        }
    });

    detailRows.forEach(row => {
        const empName = row.getAttribute('data-emp').toLowerCase();
        if (visibleEmps.has(empName)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// ==================================================
// EXPORT: EXCEL
// ==================================================
export async function exportDeptKpiExcel() {
    const XLSX = await import('xlsx');

    const wsData = [
        [`${_currentDeptName} — KPI Performance Report`],
        [`Generated: ${new Date().toLocaleDateString('en-GB')}`],
        [],
        ['Employee', 'Position', 'KPI', 'Period', 'Value', 'Target', 'Achievement (%)'],
    ];

    _currentDeptRows.forEach(r => {
        wsData.push([r.name, r.position, r.kpi, r.period, r.value, r.target, r.achievement]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
        { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, _currentDeptName.substring(0, 31));
    XLSX.writeFile(wb, `KPI_${_currentDeptName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ==================================================
// EXPORT: PDF
// ==================================================
export async function exportDeptKpiPDF() {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`${_currentDeptName} — KPI Performance Report`, 14, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} | HR Performance Suite`, 14, 24);
    doc.setTextColor(0);

    // Summary line
    const totalRows = _currentDeptRows.length;
    const avgAch = totalRows > 0 ? Math.round(_currentDeptRows.reduce((s, r) => s + r.achievement, 0) / totalRows) : 0;
    const met = _currentDeptRows.filter(r => r.achievement >= 100).length;
    doc.setFontSize(10);
    doc.text(`Records: ${totalRows}  |  Avg Achievement: ${avgAch}%  |  Met Target: ${met}/${totalRows}`, 14, 30);

    // Table
    const tableRows = _currentDeptRows.map(r => [r.name, r.position, r.kpi, r.period, `${formatNumber(r.value)}`, `${formatNumber(r.target)}`, `${r.achievement}%`]);

    doc.autoTable({
        startY: 35,
        head: [['Employee', 'Position', 'KPI', 'Period', 'Value', 'Target', 'Achievement']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        columnStyles: {
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
    });

    doc.save(`KPI_${_currentDeptName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
}

