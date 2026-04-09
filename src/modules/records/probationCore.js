// ==================================================
// RECORDS PROBATION & PIP MODULE
// ==================================================

import { state, isAdmin, isManager } from '../../lib/store.js';
import { downloadEdgeExportFile, requestProbationExport } from '../../lib/edge/exports.js';
import { getSwal } from '../../lib/swal.js';
import { escapeHTML, escapeInlineArg } from '../../lib/utils.js';
import { buildProbationDraft, saveProbationReview, saveProbationMonthlyScores, saveProbationAttendanceRecord, savePipPlan, savePipActions, calculateEmployeeWeightedKpiScore, getProbationRuleConfig, getProbationAttendanceEventOptions, suggestProbationAttendanceDeduction, logActivity } from '../data.js';
import * as notify from '../../lib/notify.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import { getProbationScoreBandClass } from '../../lib/uiContracts.js';

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

        const Swal = await getSwal();
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

async function selectProbationReviewForExport(confirmButtonText) {
    const reviews = getScopedProbationReviews();
    if (reviews.length === 0) {
        await notify.warn('No probation review to export.');
        return null;
    }

    const options = {};
    reviews.forEach(review => {
        const employee = state.db[review.employee_id];
        options[review.id] = `${employee?.name || review.employee_id} (${review.review_period_start || '-'})`;
    });

    const selected = await notify.input({
        title: 'Select Probation Review to Export',
        input: 'select',
        inputOptions: options,
        inputValue: reviews[0]?.id || '',
        confirmButtonText,
    });
    if (selected === null) return null;

    const review = reviews.find(row => row.id === selected);
    if (!review) {
        await notify.error('Probation review not found.');
        return null;
    }

    return review;
}

export async function exportProbationPdf() {
    const review = await selectProbationReviewForExport('Export PDF');
    if (!review) return;

    try {
        const result = await requestProbationExport({
            reviewId: review.id,
            action: 'probation_pdf',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Probation PDF exported.');
    } catch (error) {
        await notify.error(`Failed to export probation PDF: ${getErrorMessage(error)}`);
    }
}

export async function exportProbationCsv() {
    const review = await selectProbationReviewForExport('Export Excel');
    if (!review) return;

    try {
        const result = await requestProbationExport({
            reviewId: review.id,
            action: 'probation_excel',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
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


