// ==================================================
// DASHBOARD MODULE — Assessment & KPI Summary
// ==================================================

import { state } from '../../lib/store.js';
import { getChartCtor } from '../../lib/chartLoader.js';
import { getManagerAssessment } from '../../lib/employee-records.js';
import { getDepartment, formatPeriod, escapeHTML, escapeInlineArg, formatNumber, toPeriodKey } from '../../lib/utils.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import {
    calculateEmployeeWeightedKpiScore,
    fetchDashboardSummary,
    fetchDashboardProbationExpiry,
    fetchDashboardAssessmentCoverage,
} from '../data.js';
import { getScoreBandClass } from '../../lib/uiContracts.js';
import { getKpiRecordMeta, normalizeEmployeeId } from './shared.js';

let chartDistInstance = null;
let chartStatusInstance = null;
let chartScoreInstance = null;
let chartKpiOverviewInstance = null;
let chartKpiTrendInstance = null;
const DASHBOARD_SUMMARY_FALLBACK = Object.freeze({
    active_employees: 0,
    on_probation: 0,
    active_pips: 0,
    kpi_pending_approval: 0,
    failed_notifications: 0,
    open_hires: 0,
});

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

// ==================================================
// KPI SUMMARY
// ==================================================
async function renderKpiSummary() {
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
    const [serverSummary, probationExpiryRows, assessmentCoverageRows] = await Promise.all([
        fetchDashboardSummary(),
        fetchDashboardProbationExpiry(),
        fetchDashboardAssessmentCoverage(),
    ]);
    renderDashboardSummaryCards(serverSummary);
    renderProbationExpiryPanel(probationExpiryRows);
    renderAssessmentCoveragePanel(assessmentCoverageRows);

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

        const Chart = await getChartCtor();
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

async function renderLeadershipAnalytics(selectedMonth) {
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
        const Chart = await getChartCtor();
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

function buildDashboardSummaryFallback() {
    const scopedEmployeeIds = getFilteredEmployeeIds().map(normalizeEmployeeId);
    const scopedEmployeeSet = new Set(scopedEmployeeIds);
    const activeEmployees = scopedEmployeeIds
        .map(id => state.db[id])
        .filter(employee => employee && isTrackedEmployee(employee))
        .length;

    const onProbation = new Set(
        (state.probationReviews || [])
            .filter(review => scopedEmployeeSet.has(normalizeEmployeeId(review.employee_id)))
            .filter(review => {
                const decision = String(review?.decision || 'pending').trim().toLowerCase();
                return decision === 'pending' || decision === 'extend';
            })
            .map(review => normalizeEmployeeId(review.employee_id))
    ).size;

    const activePips = (state.pipPlans || [])
        .filter(plan => scopedEmployeeSet.has(normalizeEmployeeId(plan.employee_id)))
        .filter(plan => String(plan?.status || '').trim().toLowerCase() === 'active')
        .length;

    const pendingApprovals = (state.employeeKpiTargetVersions || [])
        .filter(version => scopedEmployeeSet.has(normalizeEmployeeId(version.employee_id)))
        .filter(version => String(version?.status || '').trim().toLowerCase() === 'pending')
        .length;

    return {
        ...DASHBOARD_SUMMARY_FALLBACK,
        active_employees: activeEmployees,
        on_probation: onProbation,
        active_pips: activePips,
        kpi_pending_approval: pendingApprovals,
    };
}

function renderDashboardSummaryCards(summaryRow) {
    const summary = summaryRow && typeof summaryRow === 'object'
        ? { ...DASHBOARD_SUMMARY_FALLBACK, ...summaryRow }
        : buildDashboardSummaryFallback();

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = formatNumber(Number(value || 0));
    };

    setText('d-summary-active-employees', summary.active_employees);
    setText('d-summary-on-probation', summary.on_probation);
    setText('d-summary-active-pips', summary.active_pips);
    setText('d-summary-kpi-pending-approval', summary.kpi_pending_approval);
    setText('d-summary-failed-notifications', summary.failed_notifications);
    setText('d-summary-open-hires', summary.open_hires);
}

function renderProbationExpiryPanel(rows = []) {
    const listEl = document.getElementById('d-probation-expiry-list');
    if (!listEl) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        listEl.innerHTML = '<li class="list-group-item text-center text-muted fst-italic">No probation deadlines in the next 30 days.</li>';
        return;
    }

    listEl.innerHTML = rows.map(row => {
        const daysRemaining = Number(row?.days_remaining || 0);
        const urgencyClass = daysRemaining <= 7 ? 'text-danger' : daysRemaining <= 14 ? 'text-warning' : 'text-primary';
        const urgencyLabel = daysRemaining === 0
            ? 'Due today'
            : `${formatNumber(daysRemaining)} day${daysRemaining === 1 ? '' : 's'} left`;
        const deptLabel = row?.department || 'Unassigned';
        const positionLabel = row?.position || '-';
        const probationEnd = row?.probation_end_date || '-';

        return `<li class="list-group-item">
            <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
                    <div class="fw-bold">${escapeHTML(row?.name || row?.employee_id || 'Unknown Employee')}</div>
                    <div class="small text-muted">${escapeHTML(deptLabel)} · ${escapeHTML(positionLabel)}</div>
                    <div class="small text-muted">Probation end: ${escapeHTML(probationEnd)}</div>
                </div>
                <span class="badge bg-light border ${urgencyClass}">${escapeHTML(urgencyLabel)}</span>
            </div>
        </li>`;
    }).join('');
}

function renderAssessmentCoveragePanel(rows = []) {
    const bodyEl = document.getElementById('d-assessment-coverage-body');
    if (!bodyEl) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        bodyEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3 fst-italic">No assessment coverage data yet.</td></tr>';
        return;
    }

    bodyEl.innerHTML = rows.map(row => {
        const coverage = Number(row?.coverage_pct || 0);
        const activeCount = Number(row?.active_employee_count || 0);
        const coveredCount = Number(row?.covered_employee_count || 0);
        const missingCount = Number(row?.missing_employee_count || Math.max(activeCount - coveredCount, 0));
        const barClass = coverage >= 90 ? 'bg-success' : coverage >= 70 ? 'bg-warning' : 'bg-danger';

        return `<tr>
            <td class="ps-3">
                <div class="fw-semibold">${escapeHTML(row?.department || 'Unassigned')}</div>
                <div class="small text-muted">${formatNumber(activeCount)} active employee${activeCount === 1 ? '' : 's'}</div>
            </td>
            <td style="min-width: 220px;">
                <div class="d-flex justify-content-between small mb-1">
                    <span>${coverage.toFixed(1)}%</span>
                    <span class="text-muted">${formatNumber(coveredCount)} covered</span>
                </div>
                <div class="progress" style="height: 8px;">
                    <div class="progress-bar ${barClass}" style="width: ${Math.max(0, Math.min(coverage, 100))}%"></div>
                </div>
            </td>
            <td class="text-end">${formatNumber(coveredCount)}</td>
            <td class="text-end pe-3">${formatNumber(missingCount)}</td>
        </tr>`;
    }).join('');
}

export { renderAssessmentSummary, renderKpiSummary, renderDeptKpiCards };
