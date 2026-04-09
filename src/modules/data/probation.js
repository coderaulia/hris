import {
    supabase,
    state,
    emit,
    debugError,
    DEFAULT_PROBATION_WEIGHTS,
    DEFAULT_PROBATION_ATTENDANCE_RULES,
    asArray,
    toNumber,
    generateUuid,
    isMissingRelationError,
    execSupabase,
    roundScore,
    parseJsonObject,
    sanitizeTier,
    clamp,
    average,
    fetchOptionalCollection,
} from './runtime.js';
import { calculateEmployeeWeightedKpiScore } from './kpi.js';

const PROBATION_REVIEW_COLUMNS = 'id,employee_id,review_period_start,review_period_end,quantitative_score,qualitative_score,final_score,decision,manager_notes,reviewed_by,reviewed_at,created_at,updated_at';
const PROBATION_QUALITATIVE_ITEM_COLUMNS = 'id,probation_review_id,item_name,score,note,created_at,updated_at';
const PROBATION_MONTHLY_SCORE_COLUMNS = 'id,probation_review_id,month_no,period_start,period_end,work_performance_score,managing_task_score,manager_qualitative_text,manager_note,attendance_deduction,attitude_score,monthly_total,created_at,updated_at';
const PROBATION_ATTENDANCE_RECORD_COLUMNS = 'id,probation_review_id,month_no,event_date,event_type,qty,deduction_points,note,entered_by,created_at,updated_at';

function normalizeAttendanceEventRule(eventKey, rawRule, fallbackRule = {}) {
    const fallbackLabel = String(fallbackRule?.label || eventKey || 'Other').trim() || 'Other';
    const candidate = rawRule && typeof rawRule === 'object' && !Array.isArray(rawRule) ? rawRule : {};
    const modeRaw = String(candidate.mode || '').trim().toLowerCase();
    const hasTiers = Array.isArray(candidate.tiers);
    const mode = (modeRaw === 'tiered' || hasTiers) ? 'tiered' : 'per_qty';
    const label = String(candidate.label || fallbackLabel).trim() || fallbackLabel;

    if (mode === 'tiered') {
        const fallbackTiers = asArray(fallbackRule.tiers).map(sanitizeTier).filter(Boolean);
        const tiers = asArray(candidate.tiers).map(sanitizeTier).filter(Boolean);
        const source = tiers.length > 0 ? tiers : fallbackTiers;
        const dedup = {};
        source.forEach(item => {
            dedup[item.min_qty] = item.points;
        });
        const normalizedTiers = Object.entries(dedup)
            .map(([min_qty, points]) => ({ min_qty: Number(min_qty), points: roundScore(points) }))
            .sort((a, b) => b.min_qty - a.min_qty);

        if (normalizedTiers.length > 0) {
            return { label, mode: 'tiered', tiers: normalizedTiers };
        }
    }

    const fallbackPerQty = Math.max(0, toNumber(fallbackRule.per_qty, 0));
    const fallbackMax = Math.max(0, toNumber(fallbackRule.max_points, 20));
    return {
        label,
        mode: 'per_qty',
        per_qty: roundScore(Math.max(0, toNumber(candidate.per_qty, fallbackPerQty))),
        max_points: roundScore(Math.max(0, toNumber(candidate.max_points, fallbackMax))),
    };
}

function cloneDefaultAttendanceRules() {
    return JSON.parse(JSON.stringify(DEFAULT_PROBATION_ATTENDANCE_RULES));
}

function getRawProbationAttendanceRules() {
    const raw = state.appSettings?.probation_attendance_rules_json;
    if (!raw) return {};

    const parsed = parseJsonObject(raw);
    if (Object.keys(parsed).length > 0) return parsed;

    if (typeof raw === 'string' && raw.trim()) {
        debugError('Invalid probation_attendance_rules_json. Falling back to defaults.');
    }

    return {};
}

function normalizeProbationWeights(rawWork, rawManaging, rawAttitude) {
    let work = roundScore(clamp(toNumber(rawWork, DEFAULT_PROBATION_WEIGHTS.work), 0, 100));
    let managing = roundScore(clamp(toNumber(rawManaging, DEFAULT_PROBATION_WEIGHTS.managing), 0, 100));
    let attitude = roundScore(clamp(toNumber(rawAttitude, DEFAULT_PROBATION_WEIGHTS.attitude), 0, 100));

    const rawSum = work + managing + attitude;
    if (rawSum <= 0) {
        work = DEFAULT_PROBATION_WEIGHTS.work;
        managing = DEFAULT_PROBATION_WEIGHTS.managing;
        attitude = DEFAULT_PROBATION_WEIGHTS.attitude;
    } else if (Math.abs(rawSum - 100) > 0.01) {
        const scale = 100 / rawSum;
        work = roundScore(work * scale);
        managing = roundScore(managing * scale);
        attitude = roundScore(Math.max(0, 100 - work - managing));
    }

    return {
        work,
        managing,
        attitude,
        total: roundScore(work + managing + attitude),
    };
}

function computeProbationRuleConfig() {
    const weights = normalizeProbationWeights(
        state.appSettings?.probation_weight_work,
        state.appSettings?.probation_weight_managing,
        state.appSettings?.probation_weight_attitude
    );

    const defaultAttendance = cloneDefaultAttendanceRules();
    defaultAttendance.monthly_cap = roundScore(clamp(toNumber(defaultAttendance.monthly_cap, weights.attitude), 0, weights.attitude));

    const rawAttendance = getRawProbationAttendanceRules();
    const rawEvents = rawAttendance.events && typeof rawAttendance.events === 'object' && !Array.isArray(rawAttendance.events)
        ? rawAttendance.events
        : {};

    const eventKeys = [...new Set([
        ...Object.keys(defaultAttendance.events || {}),
        ...Object.keys(rawEvents),
    ])];

    const normalizedEvents = {};
    eventKeys.forEach(key => {
        normalizedEvents[key] = normalizeAttendanceEventRule(
            key,
            rawEvents[key],
            defaultAttendance.events?.[key] || {}
        );
    });

    const monthlyCap = roundScore(clamp(
        toNumber(rawAttendance.monthly_cap, defaultAttendance.monthly_cap),
        0,
        weights.attitude
    ));

    const passThreshold = roundScore(clamp(
        toNumber(state.appSettings?.probation_pass_threshold, 75),
        0,
        weights.total
    ));

    const managingResponsibility = roundScore(weights.managing * 0.4);
    const managingInnovation = roundScore(weights.managing * 0.4);
    const managingCommunication = roundScore(Math.max(0, weights.managing - managingResponsibility - managingInnovation));

    return {
        work_weight: weights.work,
        managing_weight: weights.managing,
        attitude_weight: weights.attitude,
        total_weight: weights.total,
        pass_threshold: passThreshold,
        attendance: {
            monthly_cap: monthlyCap,
            events: normalizedEvents,
        },
        managing_rubric: {
            responsibility_max: managingResponsibility,
            innovation_max: managingInnovation,
            communication_max: managingCommunication,
        },
    };
}

function getProbationRuleConfig() {
    return computeProbationRuleConfig();
}

function getDefaultProbationAttendanceRulesJson() {
    return JSON.stringify(DEFAULT_PROBATION_ATTENDANCE_RULES, null, 2);
}

function getProbationAttendanceEventOptions(config = getProbationRuleConfig()) {
    const opts = {};
    Object.entries(config.attendance?.events || {}).forEach(([key, eventRule]) => {
        opts[key] = eventRule?.label || key;
    });
    return opts;
}

function suggestProbationAttendanceDeduction(eventType, qty, config = getProbationRuleConfig()) {
    const key = String(eventType || '').trim() || 'other';
    const amount = Math.max(0, Math.round(toNumber(qty, 0)));
    const events = config.attendance?.events || {};
    const eventRule = events[key] || events.other;
    if (!eventRule) return 0;

    let points = 0;
    if (eventRule.mode === 'tiered' && Array.isArray(eventRule.tiers)) {
        const tier = eventRule.tiers.find(item => amount >= Number(item.min_qty || 0));
        points = toNumber(tier?.points, 0);
    } else {
        const perQty = Math.max(0, toNumber(eventRule.per_qty, 0));
        const maxPoints = Math.max(0, toNumber(eventRule.max_points, config.attendance?.monthly_cap || config.attitude_weight || 0));
        points = Math.min(maxPoints, amount * perQty);
    }

    return roundScore(clamp(points, 0, toNumber(config.attendance?.monthly_cap, config.attitude_weight)));
}

async function fetchProbationReviews() {
    return fetchOptionalCollection({
        label: 'Fetch probation reviews',
        table: 'probation_reviews',
        selectColumns: PROBATION_REVIEW_COLUMNS,
        stateKey: 'probationReviews',
        eventName: 'data:probationReviews',
        orderBy: 'created_at',
        ascending: false,
    });
}

async function fetchProbationQualitativeItems() {
    return fetchOptionalCollection({
        label: 'Fetch probation qualitative items',
        table: 'probation_qualitative_items',
        selectColumns: PROBATION_QUALITATIVE_ITEM_COLUMNS,
        stateKey: 'probationQualitativeItems',
        eventName: 'data:probationQualitativeItems',
        orderBy: 'created_at',
        ascending: false,
    });
}

async function fetchProbationMonthlyScores() {
    return fetchOptionalCollection({
        label: 'Fetch probation monthly scores',
        table: 'probation_monthly_scores',
        selectColumns: PROBATION_MONTHLY_SCORE_COLUMNS,
        stateKey: 'probationMonthlyScores',
        eventName: 'data:probationMonthlyScores',
        orderBy: 'created_at',
        ascending: false,
    });
}

async function fetchProbationAttendanceRecords() {
    return fetchOptionalCollection({
        label: 'Fetch probation attendance records',
        table: 'probation_attendance_records',
        selectColumns: PROBATION_ATTENDANCE_RECORD_COLUMNS,
        stateKey: 'probationAttendanceRecords',
        eventName: 'data:probationAttendanceRecords',
        orderBy: 'event_date',
        ascending: false,
    });
}

function toPeriod(date) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function parseIsoDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
}

function formatIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function addDaysUtc(date, days) {
    const dt = new Date(date.getTime());
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt;
}

function addMonthsClampedUtc(date, monthDelta) {
    const baseYear = date.getUTCFullYear();
    const baseMonth = date.getUTCMonth();
    const baseDay = date.getUTCDate();

    const monthIndex = baseMonth + monthDelta;
    const targetYear = baseYear + Math.floor(monthIndex / 12);
    const targetMonth = ((monthIndex % 12) + 12) % 12;
    const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

    return new Date(Date.UTC(targetYear, targetMonth, Math.min(baseDay, maxDay)));
}

function getPeriodBounds(period) {
    const [yyyy, mm] = String(period || '').split('-').map(Number);
    if (!yyyy || !mm) return null;
    const start = new Date(Date.UTC(yyyy, mm - 1, 1));
    const end = new Date(Date.UTC(yyyy, mm, 0));
    return { start, end };
}

function getPeriodsInRange(startDate, endDate) {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return [];
    if (startDate > endDate) return [];

    const periods = [];
    let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

    while (cursor <= last) {
        periods.push(toPeriod(cursor));
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    return periods;
}

function overlapDaysInclusive(startA, endA, startB, endB) {
    const start = startA > startB ? startA : startB;
    const end = endA < endB ? endA : endB;
    if (end < start) return 0;
    const millis = end.getTime() - start.getTime();
    return Math.floor(millis / 86400000) + 1;
}

function attendanceDeduction(entries = [], config = getProbationRuleConfig()) {
    const sum = roundScore(asArray(entries).reduce((total, row) => total + Math.max(0, toNumber(row?.deduction_points, 0)), 0));
    const cap = Math.max(0, toNumber(config.attendance?.monthly_cap, config.attitude_weight));
    return roundScore(clamp(sum, 0, cap));
}

function normalizeMonthlyScoreRow(row = {}, config = getProbationRuleConfig()) {
    const monthNoRaw = toNumber(row.month_no, 0);
    const monthNo = Number.isFinite(monthNoRaw) ? Math.max(1, Math.min(3, Math.round(monthNoRaw))) : 0;
    const workMax = Math.max(0, toNumber(config.work_weight, DEFAULT_PROBATION_WEIGHTS.work));
    const managingMax = Math.max(0, toNumber(config.managing_weight, DEFAULT_PROBATION_WEIGHTS.managing));
    const attitudeMax = Math.max(0, toNumber(config.attitude_weight, DEFAULT_PROBATION_WEIGHTS.attitude));
    const totalMax = Math.max(0, toNumber(config.total_weight, workMax + managingMax + attitudeMax));

    return {
        id: row.id || null,
        month_no: monthNo,
        period_start: row.period_start || '',
        period_end: row.period_end || '',
        work_performance_score: roundScore(clamp(toNumber(row.work_performance_score, 0), 0, workMax)),
        managing_task_score: roundScore(clamp(toNumber(row.managing_task_score, 0), 0, managingMax)),
        manager_qualitative_text: String(row.manager_qualitative_text || '').trim(),
        manager_note: String(row.manager_note || '').trim(),
        attitude_score: roundScore(clamp(toNumber(row.attitude_score, attitudeMax), 0, attitudeMax)),
        attendance_deduction: roundScore(clamp(toNumber(row.attendance_deduction, 0), 0, attitudeMax)),
        monthly_total: roundScore(clamp(toNumber(row.monthly_total, 0), 0, totalMax)),
    };
}

function buildProbationWindows(joinDate, monthCount = 3) {
    const start = parseIsoDate(joinDate);
    if (!start) return [];

    const windows = [];
    for (let i = 0; i < monthCount; i++) {
        const periodStart = addMonthsClampedUtc(start, i);
        const periodEnd = addDaysUtc(addMonthsClampedUtc(start, i + 1), -1);
        windows.push({
            month_no: i + 1,
            start_date: formatIsoDate(periodStart),
            end_date: formatIsoDate(periodEnd),
            period_key: toPeriod(periodStart),
        });
    }

    return windows;
}

function calculateProbationWorkPerformance(employeeId, startDate, endDate) {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    if (!start || !end || start > end) {
        return {
            score: 0,
            metric_count: 0,
            total_days: 0,
            contributions: [],
        };
    }

    const periods = getPeriodsInRange(start, end);
    const contributions = [];
    let weightedSum = 0;
    let totalWeightDays = 0;
    let metricCount = 0;

    periods.forEach(period => {
        const bounds = getPeriodBounds(period);
        if (!bounds) return;

        const overlapDays = overlapDaysInclusive(start, end, bounds.start, bounds.end);
        if (overlapDays <= 0) return;

        const periodRecords = asArray(state.kpiRecords).filter(r => r.employee_id === employeeId && r.period === period);
        const summary = calculateEmployeeWeightedKpiScore(employeeId, periodRecords);
        const score = toNumber(summary.score, 0);

        const hasRecords = periodRecords.length > 0;
        const summaryMetricCount = toNumber(summary.metric_count, 0);

        // Do not penalize pre-tracking days (e.g., join late in month with KPI tracking starting next month).
        if (hasRecords) {
            weightedSum += score * overlapDays;
            totalWeightDays += overlapDays;
            metricCount += summaryMetricCount;
        }

        contributions.push({
            period,
            overlap_days: overlapDays,
            score: roundScore(score),
            metric_count: summaryMetricCount,
            has_records: hasRecords,
            used_in_weight: hasRecords,
        });
    });

    const avgScore = totalWeightDays > 0 ? weightedSum / totalWeightDays : 0;
    return {
        score: roundScore(avgScore),
        metric_count: metricCount,
        total_days: totalWeightDays,
        contributions,
    };
}

function buildProbationDraft(employeeId, monthlyScores = [], attendanceRecords = []) {
    const employee = state.db[employeeId];
    if (!employee?.join_date) {
        return {
            employee_id: employeeId,
            review_period_start: null,
            review_period_end: null,
            quantitative_score: 0,
            qualitative_score: 0,
            final_score: 0,
            periods: [],
            metric_count: 0,
            monthly_rows: [],
        };
    }

    const windows = buildProbationWindows(employee.join_date, 3);
    const rules = getProbationRuleConfig();
    const scoreMap = {};
    asArray(monthlyScores).forEach(raw => {
        const row = normalizeMonthlyScoreRow(raw, rules);
        if (!row.month_no) return;
        scoreMap[row.month_no] = row;
    });

    const attendanceByMonth = {};
    asArray(attendanceRecords).forEach(entry => {
        const monthNo = Math.max(1, Math.min(3, Math.round(toNumber(entry?.month_no, 0))));
        if (!attendanceByMonth[monthNo]) attendanceByMonth[monthNo] = [];
        attendanceByMonth[monthNo].push(entry);
    });

    const monthlyRows = windows.map(win => {
        const existing = scoreMap[win.month_no] || {};
        const workInfo = calculateProbationWorkPerformance(employeeId, win.start_date, win.end_date);
        const workScore = roundScore(clamp((workInfo.score * rules.work_weight) / 100, 0, rules.work_weight));

        const managingScore = roundScore(clamp(toNumber(existing.managing_task_score, 0), 0, rules.managing_weight));
        const monthAttendance = attendanceByMonth[win.month_no] || [];
        const deduction = attendanceDeduction(monthAttendance, rules);
        const attitudeScore = roundScore(clamp(rules.attitude_weight - deduction, 0, rules.attitude_weight));
        const monthlyTotal = roundScore(clamp(workScore + managingScore + attitudeScore, 0, rules.total_weight));

        return {
            id: existing.id || null,
            month_no: win.month_no,
            period: win.period_key,
            period_start: win.start_date,
            period_end: win.end_date,
            work_performance_score: workScore,
            managing_task_score: managingScore,
            manager_qualitative_text: String(existing.manager_qualitative_text || '').trim(),
            manager_note: String(existing.manager_note || '').trim(),
            attendance_deduction: deduction,
            attitude_score: attitudeScore,
            monthly_total: monthlyTotal,
            metric_count: workInfo.metric_count,
            attendance_entry_count: monthAttendance.length,
            contributions: workInfo.contributions,
        };
    });

    const quantitativeScore = roundScore(average(monthlyRows.map(row => row.work_performance_score)));
    const qualitativeScore = roundScore(average(monthlyRows.map(row => row.managing_task_score + row.attitude_score)));
    const finalScore = roundScore(average(monthlyRows.map(row => row.monthly_total)));

    return {
        employee_id: employeeId,
        review_period_start: monthlyRows[0]?.period_start || employee.join_date,
        review_period_end: monthlyRows[monthlyRows.length - 1]?.period_end || employee.join_date,
        quantitative_score: quantitativeScore,
        qualitative_score: qualitativeScore,
        final_score: finalScore,
        periods: monthlyRows.map(row => row.period),
        metric_count: monthlyRows.reduce((sum, row) => sum + toNumber(row.metric_count, 0), 0),
        monthly_rows: monthlyRows,
    };
}

async function saveProbationReview(review, qualitativeItems = []) {
    const draft = buildProbationDraft(review.employee_id);
    const quantitativeScore = review.quantitative_score !== undefined
        ? toNumber(review.quantitative_score, 0)
        : draft.quantitative_score;
    const qualitativeScore = review.qualitative_score !== undefined
        ? toNumber(review.qualitative_score, 0)
        : draft.qualitative_score;
    const finalScore = review.final_score !== undefined
        ? toNumber(review.final_score, 0)
        : roundScore(quantitativeScore + qualitativeScore);

    const payload = {
        ...review,
        review_period_start: review.review_period_start || draft.review_period_start,
        review_period_end: review.review_period_end || draft.review_period_end,
        quantitative_score: quantitativeScore,
        qualitative_score: qualitativeScore,
        final_score: finalScore,
        reviewed_by: review.reviewed_by || state.currentUser?.id || null,
        reviewed_at: review.reviewed_at || new Date().toISOString(),
    };

    const { data } = await execSupabase(
        'Save probation review',
        () => supabase
            .from('probation_reviews')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    const idx = state.probationReviews.findIndex(r => r.id === data.id);
    if (idx >= 0) state.probationReviews[idx] = data;
    else state.probationReviews.push(data);
    emit('data:probationReviews', state.probationReviews);

    const qualRows = asArray(qualitativeItems)
        .map(item => ({
            id: item?.id,
            probation_review_id: data.id,
            item_name: String(item?.item_name || '').trim(),
            score: toNumber(item?.score, 0),
            note: String(item?.note || '').trim(),
        }))
        .filter(item => item.item_name);

    if (qualRows.length > 0) {
        const { data: qualSaved } = await execSupabase(
            'Save probation qualitative items',
            () => supabase
                .from('probation_qualitative_items')
                .upsert(qualRows, { onConflict: 'probation_review_id,item_name' })
                .select(),
            { interactiveRetry: true, retries: 1 }
        );

        const untouched = state.probationQualitativeItems.filter(item => item.probation_review_id !== data.id);
        state.probationQualitativeItems = [...untouched, ...(qualSaved || [])];
        emit('data:probationQualitativeItems', state.probationQualitativeItems);
    }

    return data;
}

async function saveProbationMonthlyScores(reviewId, rows = []) {
    const rules = getProbationRuleConfig();
    const normalized = asArray(rows)
        .map(raw => {
            const monthNo = Math.max(1, Math.min(3, Math.round(toNumber(raw?.month_no, 0))));
            const existing = asArray(state.probationMonthlyScores).find(item =>
                item.probation_review_id === reviewId && Number(item.month_no) === monthNo
            );
            const rowId = raw?.id || existing?.id || generateUuid();
            return {
                id: rowId,
                probation_review_id: reviewId,
                month_no: monthNo,
                period_start: raw?.period_start || null,
                period_end: raw?.period_end || null,
                work_performance_score: roundScore(clamp(toNumber(raw?.work_performance_score, 0), 0, rules.work_weight)),
                managing_task_score: roundScore(clamp(toNumber(raw?.managing_task_score, 0), 0, rules.managing_weight)),
                manager_qualitative_text: String(raw?.manager_qualitative_text || '').trim(),
                manager_note: String(raw?.manager_note || '').trim(),
                attendance_deduction: roundScore(clamp(toNumber(raw?.attendance_deduction, 0), 0, rules.attitude_weight)),
                attitude_score: roundScore(clamp(toNumber(raw?.attitude_score, rules.attitude_weight), 0, rules.attitude_weight)),
                monthly_total: roundScore(clamp(toNumber(raw?.monthly_total, 0), 0, rules.total_weight)),
            };
        })
        .filter(row => row.probation_review_id && row.month_no >= 1 && row.month_no <= 3 && row.period_start && row.period_end);

    if (normalized.length === 0) return [];

    try {
        const { data } = await execSupabase(
            'Save probation monthly scores',
            () => supabase
                .from('probation_monthly_scores')
                .upsert(normalized, { onConflict: 'probation_review_id,month_no' })
                .select(),
            { interactiveRetry: true, retries: 1 }
        );

        const untouched = state.probationMonthlyScores.filter(item => item.probation_review_id !== reviewId);
        state.probationMonthlyScores = [...untouched, ...(data || [])];
        emit('data:probationMonthlyScores', state.probationMonthlyScores);
        return data || [];
    } catch (error) {
        if (!isMissingRelationError(error)) throw error;

        // Fallback for environments where migration has not been applied yet.
        // Keep values in local state so review/export still reflects manager inputs.
        const fallbackRows = normalized.map(row => ({
            ...row,
            id: row.id || `local-${reviewId}-${row.month_no}`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            _local_only: true,
        }));
        const untouched = state.probationMonthlyScores.filter(item => item.probation_review_id !== reviewId);
        state.probationMonthlyScores = [...untouched, ...fallbackRows];
        emit('data:probationMonthlyScores', state.probationMonthlyScores);

        debugError('probation_monthly_scores table missing. Run migration: 20260308_probation_monthly_attendance.sql');
        return fallbackRows;
    }
}

async function saveProbationAttendanceRecord(record) {
    const rules = getProbationRuleConfig();
    const maxDeduction = Math.max(0, toNumber(rules.attendance?.monthly_cap, rules.attitude_weight));
    const payload = {
        id: record?.id || generateUuid(),
        probation_review_id: record?.probation_review_id,
        month_no: Math.max(1, Math.min(3, Math.round(toNumber(record?.month_no, 0)))),
        event_date: record?.event_date || null,
        event_type: String(record?.event_type || 'attendance').trim() || 'attendance',
        qty: toNumber(record?.qty, 1),
        deduction_points: roundScore(clamp(toNumber(record?.deduction_points, 0), 0, maxDeduction)),
        note: String(record?.note || '').trim(),
        entered_by: record?.entered_by || state.currentUser?.id || null,
    };

    try {
        const { data } = await execSupabase(
            'Save probation attendance record',
            () => supabase
                .from('probation_attendance_records')
                .upsert(payload, { onConflict: 'id' })
                .select()
                .single(),
            { interactiveRetry: true, retries: 1 }
        );

        const idx = state.probationAttendanceRecords.findIndex(item => item.id === data.id);
        if (idx >= 0) state.probationAttendanceRecords[idx] = data;
        else state.probationAttendanceRecords.push(data);
        emit('data:probationAttendanceRecords', state.probationAttendanceRecords);
        return data;
    } catch (error) {
        if (!isMissingRelationError(error)) throw error;

        // Local fallback if table is not available yet.
        const fallback = {
            ...payload,
            id: payload.id || `local-attendance-${Date.now()}`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            _local_only: true,
        };
        const idx = state.probationAttendanceRecords.findIndex(item => item.id === fallback.id);
        if (idx >= 0) state.probationAttendanceRecords[idx] = fallback;
        else state.probationAttendanceRecords.push(fallback);
        emit('data:probationAttendanceRecords', state.probationAttendanceRecords);

        debugError('probation_attendance_records table missing. Run migration: 20260308_probation_monthly_attendance.sql');
        return fallback;
    }
}

export {
    getProbationRuleConfig,
    getDefaultProbationAttendanceRulesJson,
    getProbationAttendanceEventOptions,
    suggestProbationAttendanceDeduction,
    fetchProbationReviews,
    fetchProbationQualitativeItems,
    fetchProbationMonthlyScores,
    fetchProbationAttendanceRecords,
    buildProbationWindows,
    calculateProbationWorkPerformance,
    buildProbationDraft,
    saveProbationReview,
    saveProbationMonthlyScores,
    saveProbationAttendanceRecord,
};
