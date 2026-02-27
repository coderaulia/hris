// ==================================================
// DASHBOARD MODULE — Assessment & KPI Summary
// ==================================================

import { Chart } from 'chart.js/auto';
import { state } from '../lib/store.js';
import { getDepartment, formatPeriod, escapeHTML } from '../lib/utils.js';

let chartDistInstance = null;
let chartStatusInstance = null;
let chartScoreInstance = null;
let chartKpiOverviewInstance = null;
let chartKpiTrendInstance = null;

// Store modal data for export reuse
let _currentDeptName = '';
let _currentDeptRows = [];

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
          <span>${icon}<span class="fw-bold">${escapeHTML(emp.name)}</span></span>
          <span class="badge ${badgeClass} rounded-pill">${emp.avg}%</span></li>`;
            });
        }
    }

    // Render department cards
    renderDeptKpiCards();
}

// ==================================================
// DEPARTMENT KPI CARDS
// ==================================================
function renderDeptKpiCards() {
    const container = document.getElementById('d-kpi-dept-cards');
    if (!container) return;

    const { db, kpiRecords, kpiConfig } = state;

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
        const deptRecords = kpiRecords.filter(r => empIds.includes(r.employee_id));
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
    const { db, kpiRecords, kpiConfig } = state;

    _currentDeptName = dept;

    // Get employees in this department
    const empIds = Object.keys(db).filter(id => db[id].department === dept);
    const deptRecords = kpiRecords.filter(r => empIds.includes(r.employee_id));

    // Build row data
    const rows = [];
    let totalAch = 0, achCount = 0, metCount = 0;

    deptRecords.forEach(record => {
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
        });
    });

    _currentDeptRows = rows;

    const avgAch = achCount > 0 ? Math.round(totalAch / achCount) : 0;

    // Update modal title
    document.getElementById('deptKpiModalTitle').innerText = dept;

    // Summary stats
    const statsEl = document.getElementById('deptKpiModalStats');
    if (statsEl) {
        statsEl.innerHTML = `
        <div class="col-md-3">
            <div class="card border-0 bg-light"><div class="card-body text-center py-2">
                <div class="text-muted small fw-bold text-uppercase">Employees</div>
                <div class="fs-4 fw-bold">${empIds.length}</div>
            </div></div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 bg-light"><div class="card-body text-center py-2">
                <div class="text-muted small fw-bold text-uppercase">KPI Records</div>
                <div class="fs-4 fw-bold">${deptRecords.length}</div>
            </div></div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 bg-light"><div class="card-body text-center py-2">
                <div class="text-muted small fw-bold text-uppercase">Avg Achievement</div>
                <div class="fs-4 fw-bold">${avgAch}%</div>
            </div></div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 bg-light"><div class="card-body text-center py-2">
                <div class="text-muted small fw-bold text-uppercase">Met Target</div>
                <div class="fs-4 fw-bold">${metCount} / ${achCount}</div>
            </div></div>
        </div>`;
    }

    // Table rows
    const tbody = document.getElementById('deptKpiModalBody');
    if (tbody) {
        tbody.innerHTML = '';
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No KPI records for this department.</td></tr>';
        } else {
            rows.forEach(r => {
                let achBadge = 'bg-secondary';
                if (r.achievement >= 100) achBadge = 'bg-success';
                else if (r.achievement >= 75) achBadge = 'bg-primary';
                else if (r.achievement >= 50) achBadge = 'bg-warning text-dark';
                else achBadge = 'bg-danger';

                tbody.innerHTML += `<tr>
                    <td class="fw-bold">${escapeHTML(r.name)}</td>
                    <td class="small">${escapeHTML(r.position)}</td>
                    <td>${escapeHTML(r.kpi)}</td>
                    <td class="text-center">${escapeHTML(r.period)}</td>
                    <td class="text-center fw-bold">${r.value} ${escapeHTML(r.unit)}</td>
                    <td class="text-center">${r.target} ${escapeHTML(r.unit)}</td>
                    <td class="text-center"><span class="badge ${achBadge}">${r.achievement}%</span></td>
                </tr>`;
            });
        }
    }

    // Show modal
    const modalEl = document.getElementById('deptKpiModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
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
    const tableRows = _currentDeptRows.map(r => [r.name, r.position, r.kpi, r.period, `${r.value}`, `${r.target}`, `${r.achievement}%`]);

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

