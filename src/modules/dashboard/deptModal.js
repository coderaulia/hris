import { state } from '../../lib/store.js';
import { getChartCtor } from '../../lib/chartLoader.js';
import {
    escapeHTML,
    escapeInlineArg,
    formatNumber,
    formatPeriod,
} from '../../lib/utils.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import { DOM_IDS, getScoreBandClass } from '../../lib/uiContracts.js';
import { getDeptKpiContext, setDeptKpiContext } from './deptContext.js';
import { getKpiRecordMeta, normalizeEmployeeId } from './shared.js';

let currentDeptRows = [];
let currentDeptEmpIds = [];
let currentDeptRecords = [];
let deptKpiTrendChart = null;

export async function openDeptKpiModal(dept) {
    const { db, kpiRecords } = state;

    setDeptKpiContext({ name: dept });
    const filteredIds = new Set(getFilteredEmployeeIds());

    currentDeptEmpIds = Object.keys(db).filter(
        id => db[id].department === dept && filteredIds.has(id),
    );
    currentDeptRecords = kpiRecords.filter(record =>
        currentDeptEmpIds.includes(normalizeEmployeeId(record.employee_id)),
    );

    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
    ).padStart(2, '0')}`;
    const distinctMonths = [...new Set(currentDeptRecords.map(record => record.period))];
    if (!distinctMonths.includes(currentMonthStr)) distinctMonths.push(currentMonthStr);
    distinctMonths.sort().reverse();

    const tabsHtml = distinctMonths
        .map(month => `
        <li class="nav-item">
            <button class="nav-link ${month === currentMonthStr ? 'active' : ''}" 
                onclick="window.__app.renderDeptKpiTable('${escapeInlineArg(month)}', this)">
                ${formatPeriod(month)}
            </button>
        </li>
    `)
        .join('');

    const tabsEl = document.getElementById(DOM_IDS.dashboard.deptModalTabs);
    if (tabsEl) tabsEl.innerHTML = tabsHtml;

    const modalEl = document.getElementById('deptKpiModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }

    await window.__app.renderDeptKpiTable(currentMonthStr, null);
}

export async function renderDeptKpiTable(month, tabBtn) {
    if (tabBtn) {
        document
            .querySelectorAll(`#${DOM_IDS.dashboard.deptModalTabs} .nav-link`)
            .forEach(node => node.classList.remove('active'));
        tabBtn.classList.add('active');
    }

    const { db } = state;
    const { name: currentDeptName } = getDeptKpiContext();

    setDeptKpiContext({ month });
    const monthRecords = currentDeptRecords.filter(record => record.period === month);
    const monthRecordEmpIds = new Set(
        monthRecords.map(record => normalizeEmployeeId(record.employee_id)),
    );
    const noKpiEmpIds = currentDeptEmpIds.filter(id => !monthRecordEmpIds.has(id));
    const noKpiEmpNames = noKpiEmpIds
        .map(id => db[id]?.name || id)
        .sort((a, b) => a.localeCompare(b));
    const allEmpNames = currentDeptEmpIds
        .map(id => db[id]?.name || id)
        .sort((a, b) => a.localeCompare(b));
    const employeesTooltipText = `Employees (${allEmpNames.length}): ${allEmpNames.join(', ')} | No KPI this period: ${noKpiEmpNames.length > 0 ? noKpiEmpNames.join(', ') : 'None'}`;

    const rows = [];
    let totalAch = 0;
    let achCount = 0;
    let metCount = 0;

    monthRecords.forEach(record => {
        const recordEmployeeId = normalizeEmployeeId(record.employee_id);
        const emp = db[recordEmployeeId] || db[record.employee_id];
        const meta = getKpiRecordMeta(record);
        const target = meta.target;
        const achievement = target > 0 ? Math.round((record.value / target) * 100) : 0;

        if (target > 0) {
            totalAch += achievement;
            achCount++;
            if (record.value >= target) metCount++;
        }

        rows.push({
            name: emp?.name || recordEmployeeId,
            position: emp?.position || '-',
            kpi: meta.name || 'Unknown',
            unit: meta.unit || '',
            period: formatPeriod(record.period),
            periodRaw: record.period,
            value: record.value,
            target,
            achievement,
            employee_id: recordEmployeeId,
        });
    });

    currentDeptRows = rows;
    const avgAch = achCount > 0 ? Math.round(totalAch / achCount) : 0;

    const titleEl = document.getElementById('deptKpiModalTitle');
    if (titleEl) titleEl.innerText = currentDeptName;

    const statsEl = document.getElementById('deptKpiModalStats');
    if (statsEl) {
        statsEl.innerHTML = `
        <div class="col-md-4">
            <div class="card border border-2 h-100" title="${escapeHTML(employeesTooltipText)}" style="cursor: help;"><div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="text-muted small fw-bold text-uppercase">Total Employees</div>
                    <div class="bg-primary bg-opacity-10 text-primary rounded p-1"><i class="bi bi-people-fill" style="font-size: 0.7rem;"></i></div>
                </div>
                <div class="fs-2 fw-bold mb-1">${currentDeptEmpIds.length}</div>
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

    const trendCtx = document.getElementById('deptKpiTrendChart');
    if (trendCtx) {
        if (deptKpiTrendChart) deptKpiTrendChart.destroy();

        const monthCounts = {};
        const monthAchs = {};
        const today = new Date();
        const past6Months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            past6Months.push(
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            );
        }

        currentDeptRecords.forEach(record => {
            if (!past6Months.includes(record.period)) return;
            if (!monthCounts[record.period]) {
                monthCounts[record.period] = 0;
                monthAchs[record.period] = 0;
            }

            const target = getKpiRecordMeta(record).target;
            if (target > 0) {
                monthAchs[record.period] += (record.value / target) * 100;
                monthCounts[record.period]++;
            }
        });

        const chartData = past6Months.map(period =>
            monthCounts[period] ? monthAchs[period] / monthCounts[period] : 0,
        );

        const curM = chartData[5];
        const prevM = chartData[4];
        const diff = prevM > 0 ? ((curM - prevM) / prevM) * 100 : (curM > 0 ? 100 : 0);
        const badgeEl = document.getElementById('deptKpiTrendBadge');
        if (badgeEl) {
            badgeEl.innerText = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
            badgeEl.className = `badge rounded-pill ${diff >= 0 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`;
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const Chart = await getChartCtor();
        deptKpiTrendChart = new Chart(trendCtx, {
            type: 'bar',
            data: {
                labels: past6Months.map(period => monthNames[parseInt(period.split('-')[1], 10) - 1]),
                datasets: [{
                    data: chartData,
                    backgroundColor: chartData.map((_, idx) => (
                        idx === 5 ? '#a855f7' : idx === 4 ? '#c084fc' : '#e9d5ff'
                    )),
                    borderRadius: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: true, grid: { display: false }, border: { display: false } },
                    y: { display: false, max: 120 },
                },
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
            },
        });
    }

    const tbody = document.getElementById(DOM_IDS.dashboard.deptModalBody);
    if (!tbody) return;

    tbody.innerHTML = '';
    if (rows.length === 0) {
        if (noKpiEmpIds.length > 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-warning py-4 fw-semibold">No KPI records submitted in this period.</td></tr>';
            noKpiEmpIds
                .map(id => ({ id, name: db[id]?.name || id, position: db[id]?.position || '-' }))
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(emp => {
                    const initials = emp.name
                        .split(' ')
                        .map(name => name[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase();
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
        return;
    }

    rows.sort((a, b) => {
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        return b.periodRaw.localeCompare(a.periodRaw);
    });

    if (noKpiEmpIds.length > 0) {
        noKpiEmpIds
            .map(id => ({ id, name: db[id]?.name || id, position: db[id]?.position || '-' }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((emp, idx) => {
                const initials = emp.name
                    .split(' ')
                    .map(name => name[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase();
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

    const empOverall = {};
    rows.forEach(row => {
        if (!empOverall[row.name]) empOverall[row.name] = { sum: 0, count: 0 };
        empOverall[row.name].sum += row.achievement;
        empOverall[row.name].count++;
    });

    let currentEmp = null;
    rows.forEach(row => {
        if (currentEmp !== row.name) {
            const avg = empOverall[row.name].count > 0
                ? Math.round(empOverall[row.name].sum / empOverall[row.name].count)
                : 0;
            const empRows = rows.filter(item => item.employee_id === row.employee_id);
            const metricsCount = empRows.length;
            const initials = row.name
                .split(' ')
                .map(name => name[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();

            tbody.innerHTML += `
                    <tr class="table-light kpi-emp-row">
                        <td colspan="5" class="py-3 px-4 border-bottom">
                            <div class="d-flex align-items-center">
                                <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold me-3" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                    ${initials}
                                </div>
                                <div class="d-flex align-items-center gap-3">
                                    <span class="fw-bold emp-search-target">${escapeHTML(row.name)}</span>
                                    <span class="text-muted small">${escapeHTML(row.position)}</span>
                                </div>
                                <div class="ms-auto d-flex align-items-center gap-2">
                                    <span class="small text-muted">${metricsCount} KPI</span>
                                    <div class="small fw-bold" style="color: ${avg >= 100 ? '#10b981' : avg >= 75 ? '#f59e0b' : '#ef4444'}">
                                        ${avg}% Avg
                                    </div>
                                    <button class="btn btn-sm btn-outline-primary py-0 px-2"
                                        onclick="window.__app.exportEmployeeKpiPDF('${escapeInlineArg(row.employee_id)}')"
                                        title="Export ${escapeHTML(row.name)} report">
                                        <i class="bi bi-file-earmark-pdf me-1"></i> PDF
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>`;
            currentEmp = row.name;
        }

        let badgeHtml = '';
        if (row.achievement >= 100) {
            badgeHtml = '<span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2"><span style="font-size: 8px; vertical-align: middle;">🟢</span> On Track</span>';
        } else if (row.achievement >= 75) {
            badgeHtml = '<span class="badge bg-warning bg-opacity-10 text-warning rounded-pill px-2"><span style="font-size: 8px; vertical-align: middle;">🟡</span> Delayed</span>';
        } else {
            badgeHtml = '<span class="badge bg-danger bg-opacity-10 text-danger rounded-pill px-2"><span style="font-size: 8px; vertical-align: middle;">🔴</span> At Risk</span>';
        }

        tbody.innerHTML += `<tr class="kpi-detail-row" data-emp="${escapeHTML(row.name)}">
                    <td class="ps-5 pe-4">
                        <span class="text-dark small">${escapeHTML(row.kpi)}</span>
                    </td>
                    <td class="text-end text-muted small pe-4">${formatNumber(row.target)}</td>
                    <td class="text-end fw-bold small pe-4">${formatNumber(row.value)}</td>
                    <td class="text-center">${badgeHtml}</td>
                    <td class="text-end text-muted"><i class="bi bi-three-dots-vertical" role="button"></i></td>
                </tr>`;
    });
}

export function searchDeptKpiModal() {
    const input = document.getElementById('deptKpiSearch')?.value.toLowerCase() || '';
    const tbody = document.getElementById(DOM_IDS.dashboard.deptModalBody);
    if (!tbody) return;

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
        row.style.display = visibleEmps.has(empName) ? '' : 'none';
    });
}
