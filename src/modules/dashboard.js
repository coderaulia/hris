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
let _currentDeptMonth = '';
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
    _currentDeptMonth = month;
    const monthRecords = _currentDeptRecords.filter(r => r.period === month);
    const monthRecordEmpIds = new Set(monthRecords.map(r => r.employee_id));
    const noKpiEmpIds = _currentDeptEmpIds.filter(id => !monthRecordEmpIds.has(id));
    const noKpiEmpNames = noKpiEmpIds.map(id => db[id]?.name || id).sort((a, b) => a.localeCompare(b));
    const allEmpNames = _currentDeptEmpIds.map(id => db[id]?.name || id).sort((a, b) => a.localeCompare(b));
    const employeesTooltipText = `Employees (${allEmpNames.length}): ${allEmpNames.join(', ')} | No KPI this period: ${noKpiEmpNames.length > 0 ? noKpiEmpNames.join(', ') : 'None'}`;

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
            <div class="card border border-2 h-100" title="${escapeHTML(employeesTooltipText)}" style="cursor: help;"><div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="text-muted small fw-bold text-uppercase">Total Employees</div>
                    <div class="bg-primary bg-opacity-10 text-primary rounded p-1"><i class="bi bi-people-fill" style="font-size: 0.7rem;"></i></div>
                </div>
                <div class="fs-2 fw-bold mb-1">${_currentDeptEmpIds.length}</div>
                <div class="small ${noKpiEmpIds.length > 0 ? 'text-danger' : 'text-success'}">
                    <i class="bi ${noKpiEmpIds.length > 0 ? 'bi-exclamation-triangle' : 'bi-check-circle'}"></i>
                    ${noKpiEmpIds.length > 0 ? `${noKpiEmpIds.length} without KPI record` : 'All have KPI records'}
                </div>
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
            if (noKpiEmpIds.length > 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-warning py-4 fw-semibold">No KPI records submitted in this period.</td></tr>';
                noKpiEmpIds
                    .map(id => ({ id, name: db[id]?.name || id, position: db[id]?.position || '-' }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(emp => {
                        const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                        tbody.innerHTML += `
                        <tr class="table-warning kpi-emp-row">
                            <td colspan="5" class="py-3 px-4 border-bottom">
                                <div class="d-flex align-items-center">
                                    <div class="rounded-circle bg-danger bg-opacity-10 text-danger d-flex align-items-center justify-content-center fw-bold me-3" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                        ${initials}
                                    </div>
                                    <div class="d-flex align-items-center gap-3">
                                        <span class="fw-bold emp-search-target">${escapeHTML(emp.name)}</span>
                                        <span class="text-muted small">${escapeHTML(emp.position)}</span>
                                    </div>
                                    <div class="ms-auto">
                                        <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle">No KPI Record (${formatPeriod(month)})</span>
                                    </div>
                                </div>
                            </td>
                        </tr>`;
                    });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5">No KPI records for this month.</td></tr>';
            }
        } else {
            // Sort rows by employee name, then by period
            rows.sort((a, b) => {
                if (a.name !== b.name) return a.name.localeCompare(b.name);
                return b.periodRaw.localeCompare(a.periodRaw);
            });

            // Show employees with no KPI records for selected month
            if (noKpiEmpIds.length > 0) {
                noKpiEmpIds
                    .map(id => ({ id, name: db[id]?.name || id, position: db[id]?.position || '-' }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach((emp, idx) => {
                        const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                        tbody.innerHTML += `
                        <tr class="table-warning kpi-emp-row">
                            <td colspan="5" class="py-3 px-4 border-bottom">
                                <div class="d-flex align-items-center">
                                    <div class="rounded-circle bg-danger bg-opacity-10 text-danger d-flex align-items-center justify-content-center fw-bold me-3" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                        ${initials}
                                    </div>
                                    <div class="d-flex align-items-center gap-3">
                                        <span class="fw-bold emp-search-target">${escapeHTML(emp.name)}</span>
                                        <span class="text-muted small">${escapeHTML(emp.position)}</span>
                                    </div>
                                    <div class="ms-auto">
                                        <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle">No KPI Record (${formatPeriod(month)})</span>
                                    </div>
                                </div>
                            </td>
                        </tr>`;

                        if (idx === noKpiEmpIds.length - 1) {
                            tbody.innerHTML += '<tr><td colspan="5" class="py-1 bg-light border-bottom"></td></tr>';
                        }
                    });
            }

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
                    const empRows = rows.filter(x => x.employee_id === r.employee_id);
                    const metricsCount = empRows.length;

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
                                <div class="ms-auto d-flex align-items-center gap-2">
                                    <span class="small text-muted">${metricsCount} KPI</span>
                                    <div class="small fw-bold" style="color: ${avg >= 100 ? '#10b981' : avg >= 75 ? '#f59e0b' : '#ef4444'}">
                                        ${avg}% Avg
                                    </div>
                                    <button class="btn btn-sm btn-outline-primary py-0 px-2"
                                        onclick="window.__app.exportEmployeeKpiPDF('${escapeHTML(r.employee_id)}')"
                                        title="Export ${escapeHTML(r.name)} report">
                                        <i class="bi bi-file-earmark-pdf me-1"></i> PDF
                                    </button>
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
function getDeptReportSnapshot() {
    const rows = [..._currentDeptRows];
    const generatedAt = new Date();
    const appName = state.appSettings?.app_name || 'HR Performance Suite';

    const employeeCount = new Set(rows.map(r => r.employee_id)).size;
    const totalRecords = rows.length;
    const avgAch = totalRecords > 0 ? Math.round(rows.reduce((sum, r) => sum + r.achievement, 0) / totalRecords) : 0;
    const metTarget = rows.filter(r => r.achievement >= 100).length;
    const atRisk = rows.filter(r => r.achievement < 75).length;

    const empMap = {};
    rows.forEach(r => {
        if (!empMap[r.employee_id]) {
            empMap[r.employee_id] = { name: r.name, sum: 0, count: 0 };
        }
        empMap[r.employee_id].sum += r.achievement;
        empMap[r.employee_id].count++;
    });

    const topPerformer = Object.values(empMap)
        .map(e => ({ name: e.name, avg: Math.round(e.sum / Math.max(1, e.count)) }))
        .sort((a, b) => b.avg - a.avg)[0] || null;

    return {
        appName,
        generatedAt,
        generatedDate: generatedAt.toLocaleDateString('en-GB'),
        generatedDateTime: generatedAt.toLocaleString('en-GB'),
        periodLabel: formatPeriod(_currentDeptMonth),
        employeeCount,
        totalRecords,
        avgAch,
        metTarget,
        atRisk,
        topPerformer: topPerformer ? `${topPerformer.name} (${topPerformer.avg}%)` : '-',
        rows,
    };
}

function getAchievementStatus(achievement) {
    if (achievement >= 100) return 'On Track';
    if (achievement >= 75) return 'Delayed';
    return 'At Risk';
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

function groupRowsByEmployee(rows) {
    const byEmp = {};
    rows.forEach(r => {
        if (!byEmp[r.employee_id]) {
            byEmp[r.employee_id] = {
                employee_id: r.employee_id,
                name: r.name,
                position: r.position,
                rows: [],
            };
        }
        byEmp[r.employee_id].rows.push(r);
    });

    return Object.values(byEmp)
        .map(emp => {
            const avg = emp.rows.length > 0
                ? Math.round(emp.rows.reduce((sum, r) => sum + r.achievement, 0) / emp.rows.length)
                : 0;
            return { ...emp, avg };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

export async function exportDeptKpiExcel() {
    const XLSX = await import('xlsx');
    const report = getDeptReportSnapshot();

    const detailRows = report.rows.map((r, i) => {
        let status = 'At Risk';
        if (r.achievement >= 100) status = 'On Track';
        else if (r.achievement >= 75) status = 'Delayed';

        return [
            i + 1,
            r.name,
            r.position,
            r.kpi,
            r.unit || '-',
            r.target,
            r.value,
            r.achievement,
            status,
        ];
    });

    const wsData = [
        [`${report.appName} - KPI Department Report`],
        [`Department: ${_currentDeptName}`],
        [`Period: ${report.periodLabel}`],
        [`Generated: ${report.generatedDateTime}`],
        [],
        ['Summary', 'Value'],
        ['Total Employees', report.employeeCount],
        ['Total KPI Records', report.totalRecords],
        ['Average Achievement', `${report.avgAch}%`],
        ['Met Target', report.metTarget],
        ['At Risk', report.atRisk],
        ['Top Performer', report.topPerformer],
        [],
        ['No', 'Employee', 'Position', 'KPI Metric', 'Unit', 'Target', 'Actual', 'Achievement (%)', 'Status'],
        ...detailRows,
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Template polish: merged title rows + readable column widths.
    ws['!merges'] = [
        { s: { c: 0, r: 0 }, e: { c: 8, r: 0 } },
        { s: { c: 0, r: 1 }, e: { c: 8, r: 1 } },
        { s: { c: 0, r: 2 }, e: { c: 8, r: 2 } },
        { s: { c: 0, r: 3 }, e: { c: 8, r: 3 } },
    ];

    ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 28 }, // Employee
        { wch: 24 }, // Position
        { wch: 28 }, // KPI
        { wch: 10 }, // Unit
        { wch: 14 }, // Target
        { wch: 14 }, // Actual
        { wch: 16 }, // Achievement
        { wch: 14 }, // Status
    ];

    const tableHeadRow = 13;
    const tableLastRow = Math.max(tableHeadRow, tableHeadRow + detailRows.length);
    ws['!autofilter'] = { ref: `A${tableHeadRow}:I${tableLastRow}` };

    XLSX.utils.book_append_sheet(wb, ws, _currentDeptName.substring(0, 31));
    XLSX.writeFile(wb, `KPI_Report_${_currentDeptName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ==================================================
// EXPORT: PDF
// ==================================================
export async function exportDeptKpiPDF() {
    const { jsPDF } = await import('jspdf');
    const autoTableMod = await import('jspdf-autotable');
    const report = getDeptReportSnapshot();

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const runAutoTable = getPdfTableRunner(doc, autoTableMod);
    const groupedRows = groupRowsByEmployee(report.rows);

    // Header banner
    doc.setFillColor(47, 84, 150);
    doc.rect(0, 0, 297, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${report.appName} - KPI Department Report`, 14, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Department: ${_currentDeptName} | Period: ${report.periodLabel}`, 14, 18);
    doc.text(`Generated: ${report.generatedDateTime}`, 210, 18, { align: 'right' });

    // Summary grid
    doc.setTextColor(0);
    runAutoTable({
        startY: 30,
        head: [['Total Employees', 'KPI Records', 'Avg Achievement', 'Met Target', 'At Risk', 'Top Performer']],
        body: [[
            report.employeeCount,
            report.totalRecords,
            `${report.avgAch}%`,
            report.metTarget,
            report.atRisk,
            report.topPerformer,
        ]],
        theme: 'grid',
        headStyles: { fillColor: [237, 242, 247], textColor: [45, 55, 72], fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 9, halign: 'center' },
        margin: { left: 14, right: 14 },
        didDrawPage: data => {
            doc.setFontSize(8);
            doc.setTextColor(130);
            doc.text(
                `Page ${data.pageNumber} | ${report.appName}`,
                283,
                205,
                { align: 'right' }
            );
        },
    });

    let currentY = doc.lastAutoTable.finalY + 8;

    if (groupedRows.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(80);
        doc.text('No KPI records for this period.', 14, currentY);
    } else {
        groupedRows.forEach((emp, empIndex) => {
            if (currentY > 178) {
                doc.addPage();
                currentY = 16;
            }

            const onTrackCount = emp.rows.filter(r => r.achievement >= 100).length;
            const atRiskCount = emp.rows.filter(r => r.achievement < 75).length;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 41, 59);
            doc.text(`${empIndex + 1}. ${emp.name}`, 14, currentY);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(90);
            doc.text(
                `Position: ${emp.position} | KPI Items: ${emp.rows.length} | Avg: ${emp.avg}% | On Track: ${onTrackCount} | At Risk: ${atRiskCount}`,
                14,
                currentY + 5
            );

            const tableRows = emp.rows.map((r, rowIndex) => [
                rowIndex + 1,
                r.kpi,
                `${formatNumber(r.target)} ${r.unit || ''}`.trim(),
                `${formatNumber(r.value)} ${r.unit || ''}`.trim(),
                `${r.achievement}%`,
                getAchievementStatus(r.achievement),
            ]);

            runAutoTable({
                startY: currentY + 8,
                head: [['#', 'KPI Metric', 'Target', 'Actual', 'Achievement', 'Status']],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: [47, 84, 150], fontSize: 8.5, fontStyle: 'bold' },
                bodyStyles: { fontSize: 8, valign: 'middle' },
                alternateRowStyles: { fillColor: [247, 250, 252] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 10 },
                    2: { halign: 'right' },
                    3: { halign: 'right' },
                    4: { halign: 'center', fontStyle: 'bold', cellWidth: 24 },
                    5: { halign: 'center', cellWidth: 24 },
                },
                margin: { left: 14, right: 14 },
                didDrawPage: data => {
                    doc.setFontSize(8);
                    doc.setTextColor(130);
                    doc.text(
                        `Page ${data.pageNumber} | ${report.appName}`,
                        283,
                        205,
                        { align: 'right' }
                    );
                },
            });

            currentY = doc.lastAutoTable.finalY + 7;
        });
    }

    doc.save(`KPI_Report_${_currentDeptName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function exportEmployeeKpiPDF(employeeId) {
    const { jsPDF } = await import('jspdf');
    const autoTableMod = await import('jspdf-autotable');
    const report = getDeptReportSnapshot();
    const empRows = report.rows.filter(r => String(r.employee_id) === String(employeeId));
    if (empRows.length === 0) {
        alert('No KPI records found for this employee in the selected period.');
        return;
    }

    const emp = empRows[0];
    const avgAch = Math.round(empRows.reduce((sum, r) => sum + r.achievement, 0) / Math.max(1, empRows.length));
    const metTarget = empRows.filter(r => r.achievement >= 100).length;
    const atRisk = empRows.filter(r => r.achievement < 75).length;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const runAutoTable = getPdfTableRunner(doc, autoTableMod);

    doc.setFillColor(13, 110, 253);
    doc.rect(0, 0, 297, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${report.appName} - Employee KPI Report`, 14, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Department: ${_currentDeptName} | Period: ${report.periodLabel}`, 14, 18);
    doc.text(`Generated: ${report.generatedDateTime}`, 210, 18, { align: 'right' });

    runAutoTable({
        startY: 30,
        head: [['Employee', 'Position', 'KPI Items', 'Avg Achievement', 'Met Target', 'At Risk']],
        body: [[
            emp.name,
            emp.position,
            empRows.length,
            `${avgAch}%`,
            metTarget,
            atRisk,
        ]],
        theme: 'grid',
        headStyles: { fillColor: [237, 242, 247], textColor: [45, 55, 72], fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 9, halign: 'center' },
        margin: { left: 14, right: 14 },
        didDrawPage: data => {
            doc.setFontSize(8);
            doc.setTextColor(130);
            doc.text(
                `Page ${data.pageNumber} | ${report.appName}`,
                283,
                205,
                { align: 'right' }
            );
        },
    });

    const tableRows = empRows.map((r, idx) => [
        idx + 1,
        r.kpi,
        `${formatNumber(r.target)} ${r.unit || ''}`.trim(),
        `${formatNumber(r.value)} ${r.unit || ''}`.trim(),
        `${r.achievement}%`,
        getAchievementStatus(r.achievement),
    ]);

    runAutoTable({
        startY: doc.lastAutoTable.finalY + 6,
        head: [['#', 'KPI Metric', 'Target', 'Actual', 'Achievement', 'Status']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [13, 110, 253], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, valign: 'middle' },
        alternateRowStyles: { fillColor: [247, 250, 252] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center', fontStyle: 'bold', cellWidth: 24 },
            5: { halign: 'center', cellWidth: 24 },
        },
        margin: { left: 14, right: 14 },
        didDrawPage: data => {
            doc.setFontSize(8);
            doc.setTextColor(130);
            doc.text(
                `Page ${data.pageNumber} | ${report.appName}`,
                283,
                205,
                { align: 'right' }
            );
        },
    });

    const safeEmp = emp.name.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDept = _currentDeptName.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`KPI_Employee_${safeDept}_${safeEmp}_${new Date().toISOString().split('T')[0]}.pdf`);
}

