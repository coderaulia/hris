// ==================================================
// DASHBOARD MODULE — Assessment & KPI Summary
// ==================================================

import { Chart } from 'chart.js/auto';
import { state } from '../../lib/store.js';
import { downloadEdgeExportFile, requestDepartmentKpiExport, requestEmployeeKpiExport } from '../../lib/edge/exports.js';
import { getManagerAssessment } from '../../lib/employee-records.js';
import { getDepartment, formatPeriod, escapeHTML, escapeInlineArg, formatNumber, toPeriodKey } from '../../lib/utils.js';
import * as notify from '../../lib/notify.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import { calculateEmployeeWeightedKpiScore, getKpiRecordTarget, getKpiDefinitionForPeriod } from '../data.js';
import { DOM_IDS, getScoreBandClass, getKpiStatus } from '../../lib/uiContracts.js';

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

function getKpiRecordMeta(record) {
    const def = getKpiDefinitionForPeriod(record?.kpi_id, record?.period) || state.kpiConfig.find(k => k.id === record?.kpi_id);
    return {
        name: record?.kpi_name_snapshot || def?.name || record?.kpi_id || '-',
        unit: record?.kpi_unit_snapshot || def?.unit || '',
        category: record?.kpi_category_snapshot || def?.category || 'General',
        target: getKpiRecordTarget(record, state.db[record?.employee_id]),
    };
}

function normalizeEmployeeId(value) {
    return String(value ?? '').trim();
}

export function renderDashboard() {
    renderAssessmentSummary();
    renderKpiSummary();
}

// ==================================================
// ASSESSMENT SUMMARY
// ==================================================
function renderAssessmentSummary() {
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
    const visibleIds = new Set(getFilteredEmployeeIds().map(normalizeEmployeeId));

    const today = new Date();
    const currentMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    const selectedMonth = state.reportFilters?.period || currentMonth;
    const [selYearRaw, selMonthRaw] = selectedMonth.split('-');
    const selYear = parseInt(selYearRaw || String(today.getFullYear()), 10);
    const selMonth = parseInt(selMonthRaw || String(today.getMonth() + 1), 10);
    const currentQ = Math.floor((selMonth - 1) / 3);
    const qPeriods = [
        selYear + '-' + String(currentQ * 3 + 1).padStart(2, '0'),
        selYear + '-' + String(currentQ * 3 + 2).padStart(2, '0'),
        selYear + '-' + String(currentQ * 3 + 3).padStart(2, '0')
    ];

    const scopedRecords = kpiRecords.filter(r => visibleIds.has(normalizeEmployeeId(r.employee_id)));
    const monthlyRecords = scopedRecords.filter(r => r.period === selectedMonth);
    const quarterlyRecords = scopedRecords.filter(r => qPeriods.includes(r.period));
    const totalScopedEmployees = visibleIds.size;
    const employeesWithMonthlyKpi = new Set(monthlyRecords.map(r => normalizeEmployeeId(r.employee_id))).size;

    // KPI Overview Cards (Current Month)
    const totalKpis = kpiConfig.length;
    const totalRecords = scopedRecords.length;
    const monthlyRecordCount = monthlyRecords.length;
    let totalAchievement = 0;
    let achievedCount = 0;

    monthlyRecords.forEach(record => {
        const target = getKpiRecordMeta(record).target;
        if (target > 0) {
            const ach = (record.value / target) * 100;
            totalAchievement += ach;
            achievedCount++;
        }
    });

    const avgAchievement = achievedCount > 0 ? Math.round(totalAchievement / achievedCount) : 0;

    // Count how many meet target
    let metTarget = 0;
    monthlyRecords.forEach(record => {
        const target = getKpiRecordMeta(record).target;
        if (target > 0 && record.value >= target) metTarget++;
    });

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setTxt('d-kpi-emp', totalScopedEmployees);
    const kpiEmpSub = document.getElementById('d-kpi-emp-sub');
    if (kpiEmpSub) kpiEmpSub.innerText = `With KPI records: ${employeesWithMonthlyKpi}`;
    setTxt('d-kpi-total', totalKpis);
    setTxt('d-kpi-records', totalRecords);
    const kpiRecordsSub = document.getElementById('d-kpi-records-sub');
    if (kpiRecordsSub) {
        const monthlyLabel = String(selectedMonth || currentMonth);
        kpiRecordsSub.innerText = `${monthlyLabel}: ${monthlyRecordCount} record${monthlyRecordCount === 1 ? '' : 's'}`;
    }
    setTxt('d-kpi-avg', avgAchievement + '%');
    setTxt('d-kpi-met', metTarget);

    // KPI Achievement by Category Chart
    const ctxKpiOverview = document.getElementById('chartKpiOverview');
    if (ctxKpiOverview) {
        if (chartKpiOverviewInstance) chartKpiOverviewInstance.destroy();

        const catMap = {};
        monthlyRecords.forEach(record => {
            const meta = getKpiRecordMeta(record);
            const cat = meta.category || 'General';
            if (!catMap[cat]) catMap[cat] = { sum: 0, count: 0 };
            if (meta.target > 0) {
                catMap[cat].sum += (record.value / meta.target) * 100;
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
    const hasWeightConfig = (state.kpiWeightProfiles || []).some(profile => profile?.active !== false)
        && (state.kpiWeightItems || []).length > 0;

    const monthlyTitle = document.getElementById('d-kpi-performers-monthly-title');
    const quarterlyTitle = document.getElementById('d-kpi-performers-quarterly-title');
    if (monthlyTitle) {
        monthlyTitle.innerHTML = hasWeightConfig
            ? '<i class="bi bi-trophy-fill text-warning me-1"></i> Monthly Leaderboard (Points)'
            : '<i class="bi bi-trophy-fill text-warning me-1"></i> Monthly Top Performer';
    }
    if (quarterlyTitle) {
        quarterlyTitle.innerHTML = hasWeightConfig
            ? '<i class="bi bi-trophy-fill text-warning me-1"></i> Quarterly Leaderboard (Points)'
            : '<i class="bi bi-trophy-fill text-warning me-1"></i> Quarterly Top Performer';
    }

    const renderPerformers = (records, elId) => {
        const perfList = document.getElementById(elId);
        if (!perfList) return;
        perfList.innerHTML = '';

        const byEmp = {};
        records.forEach(record => {
            if (!byEmp[record.employee_id]) byEmp[record.employee_id] = [];
            byEmp[record.employee_id].push(record);
        });

        const empList = Object.keys(byEmp)
            .map(id => {
                const empRecords = byEmp[id] || [];

                if (hasWeightConfig) {
                    const weighted = calculateEmployeeWeightedKpiScore(id, empRecords);
                    return {
                        id,
                        name: db[id]?.name || id,
                        score: weighted.score,
                        weighted: weighted.weighted,
                        hasData: weighted.metric_count > 0,
                    };
                }

                let sum = 0;
                let count = 0;
                empRecords.forEach(record => {
                    const target = getKpiRecordMeta(record).target;
                    if (target > 0) {
                        sum += (record.value / target) * 100;
                        count++;
                    }
                });

                return {
                    id,
                    name: db[id]?.name || id,
                    score: count > 0 ? Math.round(sum / count) : 0,
                    weighted: false,
                    hasData: count > 0,
                };
            })
            .filter(emp => emp.hasData)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        if (empList.length === 0) {
            perfList.innerHTML = '<li class="list-group-item text-center text-muted fst-italic">No KPI data yet.</li>';
        } else {
            empList.forEach((emp, i) => {
                const icon = i === 0 ? '<i class="bi bi-trophy-fill text-warning me-1"></i>' : '';
                const scoreVal = Number(emp.score || 0);
                const scoreLabel = emp.weighted
                    ? `${Number.isInteger(scoreVal) ? formatNumber(scoreVal) : scoreVal.toFixed(1)} pts`
                    : `${Math.round(scoreVal)}%`;
                const badgeClass = getScoreBandClass(scoreVal);
                perfList.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">
          <span>${icon}<span class="fw-bold">${escapeHTML(emp.name)}</span></span>
          <span class="badge ${badgeClass} rounded-pill">${scoreLabel}</span></li>`;
            });
        }
    };

    renderPerformers(monthlyRecords, 'd-kpi-performers-monthly');
    renderPerformers(quarterlyRecords, 'd-kpi-performers-quarterly');

    // Render department cards
    renderDeptKpiCards(monthlyRecords);
    renderLeadershipAnalytics(selectedMonth);
}

function isTrackedEmployee(employee) {
    const role = String(employee?.role || 'employee').trim().toLowerCase();
    return !role || role === 'employee';
}

function parsePeriodKey(period) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || month < 1 || month > 12) return null;
    return { year, month };
}

function shiftPeriodKey(period, deltaMonths = 0) {
    const parsed = parsePeriodKey(period);
    if (!parsed) return '';

    const baseIndex = parsed.year * 12 + (parsed.month - 1) + Number(deltaMonths || 0);
    const year = Math.floor(baseIndex / 12);
    const month = (baseIndex % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
}

function buildRollingPeriods(endPeriod, count = 6) {
    const periods = [];
    const safeCount = Math.max(1, Number(count) || 1);
    for (let offset = safeCount - 1; offset >= 0; offset--) {
        const period = shiftPeriodKey(endPeriod, -offset);
        if (period) periods.push(period);
    }
    return periods;
}

function averageNumbers(values = []) {
    const nums = values
        .map(value => Number(value))
        .filter(value => Number.isFinite(value));

    if (nums.length === 0) return 0;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function roundMetric(value, digits = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    const factor = 10 ** digits;
    return Math.round(num * factor) / factor;
}

function formatMetricPercent(value) {
    return `${roundMetric(value, 1).toFixed(1)}%`;
}

function buildEmployeePerformanceLookup() {
    const lookup = new Map();
    (state.employeePerformanceScores || []).forEach(row => {
        const scoreType = String(row?.score_type || 'kpi_weighted').trim().toLowerCase();
        if (scoreType && scoreType !== 'kpi_weighted') return;
        lookup.set(`${row.employee_id}__${row.period}`, Number(row.total_score || 0));
    });
    return lookup;
}

function buildScopedRecordLookup(scopedIds) {
    const lookup = new Map();
    (state.kpiRecords || []).forEach(record => {
        const employeeId = normalizeEmployeeId(record.employee_id);
        if (scopedIds && !scopedIds.has(employeeId)) return;
        const key = `${employeeId}__${record.period}`;
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key).push(record);
    });
    return lookup;
}

function getEmployeePeriodKpiScore(employeeId, period, scoreLookup, recordLookup, cache) {
    const key = `${employeeId}__${period}`;
    if (cache.has(key)) return cache.get(key);

    if (scoreLookup.has(key)) {
        const value = Number(scoreLookup.get(key));
        const safeValue = Number.isFinite(value) ? value : null;
        cache.set(key, safeValue);
        return safeValue;
    }

    const periodRecords = recordLookup.get(key) || [];
    if (periodRecords.length === 0) {
        cache.set(key, null);
        return null;
    }

    const summary = calculateEmployeeWeightedKpiScore(employeeId, periodRecords);
    const safeValue = Number(summary?.metric_count || 0) > 0 ? Number(summary.score || 0) : null;
    cache.set(key, Number.isFinite(safeValue) ? safeValue : null);
    return cache.get(key);
}

function buildLeadershipAnalyticsSnapshot(selectedMonth) {
    const scopedEmployeeIds = getFilteredEmployeeIds().filter(id => isTrackedEmployee(state.db[id]));
    const scopedEmployeeSet = new Set(scopedEmployeeIds.map(normalizeEmployeeId));
    const selectedPeriod = shiftPeriodKey(selectedMonth, 0) || selectedMonth;
    const trendPeriods = buildRollingPeriods(selectedPeriod, 6);
    const riskPeriods = buildRollingPeriods(selectedPeriod, 3);
    const pipThreshold = Number(state.appSettings?.pip_threshold || 70) || 70;
    const probationPassThreshold = Number(state.appSettings?.probation_pass_threshold || 75) || 75;

    const scoreLookup = buildEmployeePerformanceLookup();
    const recordLookup = buildScopedRecordLookup(scopedEmployeeSet);
    const scoreCache = new Map();
    const getScore = (employeeId, period) => getEmployeePeriodKpiScore(employeeId, period, scoreLookup, recordLookup, scoreCache);

    const selectedPeriodScores = scopedEmployeeIds
        .map(employeeId => ({ employee_id: employeeId, score: getScore(employeeId, selectedPeriod) }))
        .filter(row => row.score !== null);
    const selectedScoreMap = new Map(selectedPeriodScores.map(row => [row.employee_id, row.score]));

    const atRiskEmployees = selectedPeriodScores.filter(row => row.score < pipThreshold);
    const atRiskEmployeeSet = new Set(atRiskEmployees.map(row => row.employee_id));

    const scopedProbationReviews = (state.probationReviews || []).filter(review => scopedEmployeeSet.has(normalizeEmployeeId(review.employee_id)));
    const closedProbationReviews = scopedProbationReviews.filter(review => ['pass', 'extend', 'fail'].includes(String(review.decision || '').toLowerCase()));
    const passedProbationReviews = closedProbationReviews.filter(review => String(review.decision || '').toLowerCase() === 'pass');
    const probationPassRate = closedProbationReviews.length > 0
        ? (passedProbationReviews.length / closedProbationReviews.length) * 100
        : 0;

    const scopedPipPlans = (state.pipPlans || []).filter(plan => scopedEmployeeSet.has(normalizeEmployeeId(plan.employee_id)));
    const activePlanStatuses = new Set(['active', 'extended']);
    const resolvedPlanStatuses = new Set(['completed', 'cancelled', 'escalated']);
    const successPlanStatuses = new Set(['completed']);

    const activePipEmployeeSet = new Set(
        scopedPipPlans
            .filter(plan => activePlanStatuses.has(String(plan.status || 'active').toLowerCase()))
            .map(plan => normalizeEmployeeId(plan.employee_id))
    );

    const convertedEmployeeSet = new Set(
        scopedPipPlans
            .filter(plan => {
                const status = String(plan.status || 'active').toLowerCase();
                return atRiskEmployeeSet.has(normalizeEmployeeId(plan.employee_id))
                    && (activePlanStatuses.has(status) || String(plan.trigger_period || '') === selectedPeriod);
            })
            .map(plan => normalizeEmployeeId(plan.employee_id))
    );

    const resolvedPipPlans = scopedPipPlans.filter(plan => resolvedPlanStatuses.has(String(plan.status || '').toLowerCase()));
    const successfulPipPlans = resolvedPipPlans.filter(plan => successPlanStatuses.has(String(plan.status || '').toLowerCase()));

    const pipConversionRate = atRiskEmployees.length > 0
        ? (convertedEmployeeSet.size / atRiskEmployees.length) * 100
        : 0;
    const pipSuccessRate = resolvedPipPlans.length > 0
        ? (successfulPipPlans.length / resolvedPipPlans.length) * 100
        : 0;

    const trend = trendPeriods.map(period => {
        const scores = scopedEmployeeIds
            .map(employeeId => getScore(employeeId, period))
            .filter(score => score !== null);

        return {
            period,
            avg_score: roundMetric(averageNumbers(scores), 1),
            employee_count: scores.length,
            at_risk_count: scores.filter(score => score < pipThreshold).length,
        };
    });

    const latestReviewByEmployee = new Map();
    scopedProbationReviews.forEach(review => {
        const employeeId = normalizeEmployeeId(review.employee_id);
        const current = latestReviewByEmployee.get(employeeId);
        const reviewTs = new Date(review.reviewed_at || review.created_at || 0).getTime();
        if (!current || reviewTs > current._sortTs) {
            latestReviewByEmployee.set(employeeId, {
                ...review,
                _sortTs: reviewTs,
            });
        }
    });

    const riskRows = scopedEmployeeIds
        .map(employeeId => {
            const employee = state.db[employeeId] || {};
            const monthlyScores = riskPeriods.map(period => ({ period, score: getScore(employeeId, period) }));
            const validScores = monthlyScores.filter(item => item.score !== null);
            const latest = validScores[validScores.length - 1] || null;
            const previous = validScores.length > 1 ? validScores[validScores.length - 2] : null;
            const earliest = validScores[0] || null;

            const selectedScore = monthlyScores[monthlyScores.length - 1]?.score ?? null;
            const currentScore = selectedScore ?? latest?.score ?? null;
            const trendDelta = latest && earliest ? roundMetric(latest.score - earliest.score, 1) : null;
            const consecutiveDecline = validScores.length >= 3
                && validScores[validScores.length - 3].score > validScores[validScores.length - 2].score
                && validScores[validScores.length - 2].score > validScores[validScores.length - 1].score;
            const recentDrop = latest && previous ? latest.score < previous.score : false;
            const lowTrend = trendDelta !== null && trendDelta <= -10;
            const belowThreshold = currentScore !== null && currentScore < pipThreshold;
            const activePip = activePipEmployeeSet.has(employeeId);
            const latestReview = latestReviewByEmployee.get(employeeId);
            const probationDecision = String(latestReview?.decision || '').toLowerCase();

            const include = belowThreshold
                || lowTrend
                || consecutiveDecline
                || (recentDrop && currentScore !== null && currentScore < pipThreshold + 5)
                || activePip;

            if (!include) return null;

            let riskLevel = 'Low';
            if ((belowThreshold && (lowTrend || consecutiveDecline)) || (activePip && belowThreshold)) {
                riskLevel = 'High';
            } else if (belowThreshold || lowTrend || activePip || consecutiveDecline) {
                riskLevel = 'Medium';
            }

            const reasons = [];
            if (belowThreshold) reasons.push(`Below KPI threshold (${roundMetric(currentScore, 1).toFixed(1)})`);
            if (trendDelta !== null && (lowTrend || consecutiveDecline)) reasons.push(`3-month trend ${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)}`);
            if (activePip) reasons.push('Active PIP');
            if (probationDecision && probationDecision !== 'pass') reasons.push(`Probation ${probationDecision.toUpperCase()}`);

            return {
                employee_id: employeeId,
                name: employee.name || employeeId,
                position: employee.position || '-',
                department: employee.department || getDepartment(employee.position),
                manager_name: state.db[employee.manager_id || '']?.name || 'Unassigned',
                current_score: currentScore,
                trend_delta: trendDelta,
                risk_level: riskLevel,
                active_pip: activePip,
                reasons,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const riskOrder = { High: 0, Medium: 1, Low: 2 };
            const byRisk = (riskOrder[a.risk_level] ?? 99) - (riskOrder[b.risk_level] ?? 99);
            if (byRisk !== 0) return byRisk;

            const aScore = a.current_score === null ? 9999 : a.current_score;
            const bScore = b.current_score === null ? 9999 : b.current_score;
            if (aScore !== bScore) return aScore - bScore;

            const aTrend = a.trend_delta === null ? 9999 : a.trend_delta;
            const bTrend = b.trend_delta === null ? 9999 : b.trend_delta;
            return aTrend - bTrend;
        });

    const riskEmployeeSet = new Set(riskRows.map(row => row.employee_id));

    const managerTeams = new Map();
    scopedEmployeeIds.forEach(employeeId => {
        const managerId = String(state.db[employeeId]?.manager_id || '').trim();
        if (!managerId) return;
        if (!managerTeams.has(managerId)) managerTeams.set(managerId, []);
        managerTeams.get(managerId).push(employeeId);
    });

    const managerCalibration = [...managerTeams.entries()]
        .map(([managerId, teamEmployeeIds]) => {
            const teamSet = new Set(teamEmployeeIds);
            const kpiScores = teamEmployeeIds
                .map(employeeId => selectedScoreMap.get(employeeId))
                .filter(score => score !== undefined);
            const assessmentScores = teamEmployeeIds
                .map(employeeId => Number(getManagerAssessment(state.db[employeeId]).percentage || 0))
                .filter(score => score > 0);
            const teamClosedReviews = closedProbationReviews.filter(review => teamSet.has(normalizeEmployeeId(review.employee_id)));
            const teamPassedReviews = teamClosedReviews.filter(review => String(review.decision || '').toLowerCase() === 'pass');
            const activePipCount = teamEmployeeIds.filter(employeeId => activePipEmployeeSet.has(employeeId)).length;
            const riskCount = teamEmployeeIds.filter(employeeId => riskEmployeeSet.has(employeeId)).length;

            return {
                manager_id: managerId,
                manager_name: state.db[managerId]?.name || managerId,
                team_size: teamEmployeeIds.length,
                kpi_avg: kpiScores.length > 0 ? roundMetric(averageNumbers(kpiScores), 1) : null,
                assessment_avg: assessmentScores.length > 0 ? roundMetric(averageNumbers(assessmentScores), 1) : null,
                probation_pass_rate: teamClosedReviews.length > 0
                    ? roundMetric((teamPassedReviews.length / teamClosedReviews.length) * 100, 1)
                    : null,
                probation_closed_count: teamClosedReviews.length,
                active_pip_count: activePipCount,
                risk_count: riskCount,
            };
        })
        .sort((a, b) => {
            if (b.risk_count !== a.risk_count) return b.risk_count - a.risk_count;
            if ((a.kpi_avg ?? 9999) !== (b.kpi_avg ?? 9999)) return (a.kpi_avg ?? 9999) - (b.kpi_avg ?? 9999);
            return a.manager_name.localeCompare(b.manager_name);
        });

    return {
        selected_period: selectedPeriod,
        pip_threshold: pipThreshold,
        probation_pass_threshold: probationPassThreshold,
        probation_pass_rate: roundMetric(probationPassRate, 1),
        probation_closed_count: closedProbationReviews.length,
        probation_passed_count: passedProbationReviews.length,
        pip_conversion_rate: roundMetric(pipConversionRate, 1),
        pip_converted_count: convertedEmployeeSet.size,
        pip_at_risk_count: atRiskEmployees.length,
        pip_success_rate: roundMetric(pipSuccessRate, 1),
        pip_resolved_count: resolvedPipPlans.length,
        pip_success_count: successfulPipPlans.length,
        active_pip_count: activePipEmployeeSet.size,
        risk_count: riskRows.length,
        risk_rows: riskRows.slice(0, 8),
        manager_rows: managerCalibration,
        trend,
    };
}

function renderLeadershipAnalytics(selectedMonth) {
    const snapshot = buildLeadershipAnalyticsSnapshot(selectedMonth);

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
        return el;
    };

    setText('d-analytics-period-label', `Scope: ${formatPeriod(snapshot.selected_period)}`);
    setText('d-analytics-probation-rate', formatMetricPercent(snapshot.probation_pass_rate));
    setText('d-analytics-probation-sub', `Pass ${snapshot.probation_passed_count} of ${snapshot.probation_closed_count} closed reviews`);
    setText('d-analytics-pip-conversion', formatMetricPercent(snapshot.pip_conversion_rate));
    setText('d-analytics-pip-conversion-sub', `Below-threshold employees covered: ${snapshot.pip_converted_count} / ${snapshot.pip_at_risk_count}`);
    setText('d-analytics-pip-success', formatMetricPercent(snapshot.pip_success_rate));
    setText('d-analytics-pip-success-sub', `Completed ${snapshot.pip_success_count} of ${snapshot.pip_resolved_count} resolved plans`);
    setText('d-analytics-risk-count', formatNumber(snapshot.risk_count));
    setText('d-analytics-risk-sub', `Active PIP employees: ${snapshot.active_pip_count}`);
    setText('d-kpi-trend-note', `Last 6 months ending ${formatPeriod(snapshot.selected_period)}. Blue line = KPI weighted average, red bars = employees below threshold.`);
    setText('d-kpi-threshold-badge', `Risk Threshold: ${roundMetric(snapshot.pip_threshold, 1).toFixed(1)}`);
    setText('d-analytics-hint', `Leadership formulas: probation pass rate uses closed probation decisions, PIP conversion uses current-period employees below KPI threshold ${roundMetric(snapshot.pip_threshold, 1).toFixed(1)}, and pass benchmark uses probation minimum ${roundMetric(snapshot.probation_pass_threshold, 1).toFixed(1)}.`);

    const trendCanvas = document.getElementById('chartKpiTrend');
    if (trendCanvas) {
        if (chartKpiTrendInstance) chartKpiTrendInstance.destroy();
        chartKpiTrendInstance = new Chart(trendCanvas, {
            type: 'bar',
            data: {
                labels: snapshot.trend.map(item => formatPeriod(item.period)),
                datasets: [
                    {
                        type: 'line',
                        label: 'Avg KPI Score',
                        data: snapshot.trend.map(item => item.avg_score),
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.12)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 3,
                        yAxisID: 'y',
                    },
                    {
                        type: 'line',
                        label: 'Risk Threshold',
                        data: snapshot.trend.map(() => snapshot.pip_threshold),
                        borderColor: '#94a3b8',
                        borderDash: [6, 4],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false,
                        tension: 0,
                        yAxisID: 'y',
                    },
                    {
                        type: 'bar',
                        label: 'At-Risk Employees',
                        data: snapshot.trend.map(item => item.at_risk_count),
                        backgroundColor: 'rgba(239, 68, 68, 0.24)',
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        borderRadius: 8,
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: 120,
                        title: {
                            display: true,
                            text: 'KPI Score',
                        },
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            precision: 0,
                        },
                        title: {
                            display: true,
                            text: 'Employees',
                        },
                    },
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                },
            },
        });
    }

    const riskList = document.getElementById('d-risk-list');
    if (riskList) {
        riskList.innerHTML = '';
        if (snapshot.risk_rows.length === 0) {
            riskList.innerHTML = '<li class="list-group-item text-center text-muted fst-italic">No risk indicators in the current scope.</li>';
        } else {
            snapshot.risk_rows.forEach(row => {
                const badgeClass = row.risk_level === 'High'
                    ? 'text-bg-danger'
                    : row.risk_level === 'Medium'
                        ? 'text-bg-warning'
                        : 'text-bg-primary';
                const currentScore = row.current_score === null ? '-' : formatMetricPercent(row.current_score);
                const trendText = row.trend_delta === null
                    ? 'Trend not enough'
                    : `${row.trend_delta >= 0 ? '+' : ''}${row.trend_delta.toFixed(1)} pts`;
                const reasons = row.reasons.length > 0 ? row.reasons.join(' | ') : 'Needs follow-up';

                riskList.innerHTML += `
                    <li class="list-group-item">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <div>
                                <div class="fw-bold">${escapeHTML(row.name)}</div>
                                <div class="text-muted" style="font-size: 11px;">${escapeHTML(row.department)} · ${escapeHTML(row.manager_name)}</div>
                            </div>
                            <span class="badge ${badgeClass} rounded-pill">${escapeHTML(row.risk_level)}</span>
                        </div>
                        <div class="d-flex gap-2 flex-wrap mt-2" style="font-size: 11px;">
                            <span class="badge text-bg-light border">Score ${escapeHTML(currentScore)}</span>
                            <span class="badge text-bg-light border">Trend ${escapeHTML(trendText)}</span>
                            ${row.active_pip ? '<span class="badge text-bg-light border border-warning text-warning-emphasis">Active PIP</span>' : ''}
                        </div>
                        <div class="text-muted mt-2" style="font-size: 11px;">${escapeHTML(reasons)}</div>
                    </li>`;
            });
        }
    }

    const calibrationBody = document.getElementById('d-manager-calibration-body');
    if (calibrationBody) {
        calibrationBody.innerHTML = '';
        if (snapshot.manager_rows.length === 0) {
            calibrationBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3 fst-italic">No manager calibration data yet.</td></tr>';
        } else {
            snapshot.manager_rows.forEach(row => {
                const kpiAvgLabel = row.kpi_avg === null ? '-' : formatMetricPercent(row.kpi_avg);
                const assessmentAvgLabel = row.assessment_avg === null ? '-' : formatMetricPercent(row.assessment_avg);
                const probationLabel = row.probation_pass_rate === null
                    ? '-'
                    : `${formatMetricPercent(row.probation_pass_rate)} (${row.probation_closed_count})`;
                const riskBadgeClass = row.risk_count > 0 ? 'text-bg-danger' : 'text-bg-success';
                const kpiBadgeClass = row.kpi_avg === null ? 'text-bg-light border' : getScoreBandClass(row.kpi_avg);

                calibrationBody.innerHTML += `
                    <tr>
                        <td class="ps-3">
                            <div class="fw-bold">${escapeHTML(row.manager_name)}</div>
                            <div class="text-muted small">Manager ID: ${escapeHTML(row.manager_id)}</div>
                        </td>
                        <td>${formatNumber(row.team_size)}</td>
                        <td><span class="badge ${kpiBadgeClass} rounded-pill">${escapeHTML(kpiAvgLabel)}</span></td>
                        <td>${escapeHTML(assessmentAvgLabel)}</td>
                        <td>${escapeHTML(probationLabel)}</td>
                        <td>${formatNumber(row.active_pip_count)}</td>
                        <td><span class="badge ${riskBadgeClass} rounded-pill">${formatNumber(row.risk_count)}</span></td>
                    </tr>`;
            });
        }
    }
}
// ==================================================
// DEPARTMENT KPI CARDS
// ==================================================
function renderDeptKpiCards(records) {
    const container = document.getElementById('d-kpi-dept-cards');
    if (!container) return;

    const { db, kpiConfig } = state;
    const filteredIds = new Set(getFilteredEmployeeIds());

    // Group employees by department
    const deptMap = {};
    Object.keys(db).forEach(id => {
        if (!filteredIds.has(id)) return;
        const emp = db[id];
        const dept = emp.department || 'Other';
        if (!deptMap[dept]) deptMap[dept] = [];
        deptMap[dept].push(id);
    });

    // Calculate KPI stats per department
    const deptStats = {};
    Object.keys(deptMap).forEach(dept => {
        const empIds = deptMap[dept];
        const deptRecords = records.filter(r => empIds.includes(normalizeEmployeeId(r.employee_id)));
        let totalAch = 0, achCount = 0, metCount = 0;

        deptRecords.forEach(record => {
            const target = getKpiRecordMeta(record).target;
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
    if (sortedDepts.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted small py-3 fst-italic">No department data for current filters.</div>';
        return;
    }

    sortedDepts.forEach((dept, i) => {
        const st = deptStats[dept];
        const c = colors[i % colors.length];

        const achBadge = st.records > 0 ? getScoreBandClass(st.avgAch) : 'bg-secondary';

        container.innerHTML += `
        <div class="col-md-4 col-lg-3">
            <div class="card border-0 shadow-sm h-100 dept-kpi-card" role="button"
                 onclick="window.__app.openDeptKpiModal('${escapeInlineArg(dept)}')"
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
    const filteredIds = new Set(getFilteredEmployeeIds());

    // Get employees in this department
    _currentDeptEmpIds = Object.keys(db).filter(id => db[id].department === dept && filteredIds.has(id));
    _currentDeptRecords = kpiRecords.filter(r => _currentDeptEmpIds.includes(normalizeEmployeeId(r.employee_id)));

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
                onclick="window.__app.renderDeptKpiTable('${escapeInlineArg(m)}', this)">
                ${formatPeriod(m)}
            </button>
        </li>
    `).join('');

    const tabsEl = document.getElementById(DOM_IDS.dashboard.deptModalTabs);
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
        document.querySelectorAll(`#${DOM_IDS.dashboard.deptModalTabs} .nav-link`).forEach(n => n.classList.remove('active'));
        tabBtn.classList.add('active');
    }

    const { db, kpiConfig } = state;

    // Filter by month
    _currentDeptMonth = month;
    const monthRecords = _currentDeptRecords.filter(r => r.period === month);
    const monthRecordEmpIds = new Set(monthRecords.map(r => normalizeEmployeeId(r.employee_id)));
    const noKpiEmpIds = _currentDeptEmpIds.filter(id => !monthRecordEmpIds.has(id));
    const noKpiEmpNames = noKpiEmpIds.map(id => db[id]?.name || id).sort((a, b) => a.localeCompare(b));
    const allEmpNames = _currentDeptEmpIds.map(id => db[id]?.name || id).sort((a, b) => a.localeCompare(b));
    const employeesTooltipText = `Employees (${allEmpNames.length}): ${allEmpNames.join(', ')} | No KPI this period: ${noKpiEmpNames.length > 0 ? noKpiEmpNames.join(', ') : 'None'}`;

    // Build row data
    const rows = [];
    let totalAch = 0, achCount = 0, metCount = 0;

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
            target: target,
            achievement: achievement,
            employee_id: recordEmployeeId
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

                const t = getKpiRecordMeta(r).target;
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
    const tbody = document.getElementById(DOM_IDS.dashboard.deptModalBody);
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
                                        onclick="window.__app.exportEmployeeKpiPDF('${escapeInlineArg(r.employee_id)}')"
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
    const tbody = document.getElementById(DOM_IDS.dashboard.deptModalBody);
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

export async function exportDeptKpiExcel() {
    if (!_currentDeptName) {
        await notify.warn('Open a department KPI modal first.');
        return;
    }
    try {
        const result = await requestDepartmentKpiExport({
            department: _currentDeptName,
            period: _currentDeptMonth,
            action: 'department_kpi_excel',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Department KPI Excel exported.');
    } catch (error) {
        await notify.error(`Failed to export department KPI Excel: ${error.message}`);
    }
}

export async function exportDeptKpiPDF() {
    if (!_currentDeptName) {
        await notify.warn('Open a department KPI modal first.');
        return;
    }
    try {
        const result = await requestDepartmentKpiExport({
            department: _currentDeptName,
            period: _currentDeptMonth,
            action: 'department_kpi_pdf',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Department KPI PDF exported.');
    } catch (error) {
        await notify.error(`Failed to export department KPI PDF: ${error.message}`);
    }
}

export async function exportEmployeeKpiPDF(employeeId) {
    try {
        const result = await requestEmployeeKpiExport({
            employeeId,
            period: _currentDeptMonth,
            action: 'employee_kpi_pdf',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Employee KPI PDF exported.');
    } catch (error) {
        await notify.error(`Failed to export employee KPI PDF: ${error.message}`);
    }
}





export { renderAssessmentSummary, renderKpiSummary, renderDeptKpiCards };
