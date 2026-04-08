import {
    supabase,
    state,
    emit,
    getDepartment,
    debugError,
    asArray,
    toNumber,
    toDateLabel,
    isMissingRelationError,
    normalizeScoreRows,
    mapLegacyEmployeeRow,
    execSupabase,
} from './runtime.js';
import { reconcileCurrentUserProfile } from '../auth.js';

async function fetchEmployees() {
    try {
        const { data: employeeRows } = await execSupabase(
            'Fetch employees',
            () => supabase.from('employees').select('*'),
            { retries: 1 }
        );

        let normalizedTables = null;
        try {
            const [assessmentsRes, assessmentScoresRes, assessmentHistoryRes, trainingRes] = await Promise.all([
                execSupabase('Fetch assessments', () => supabase.from('employee_assessments').select('*'), { retries: 1 }),
                execSupabase('Fetch assessment scores', () => supabase.from('employee_assessment_scores').select('*'), { retries: 1 }),
                execSupabase('Fetch assessment history', () => supabase.from('employee_assessment_history').select('*'), { retries: 1 }),
                execSupabase('Fetch training records', () => supabase.from('employee_training_records').select('*'), { retries: 1 }),
            ]);

            normalizedTables = {
                assessments: assessmentsRes.data || [],
                assessmentScores: assessmentScoresRes.data || [],
                assessmentHistory: assessmentHistoryRes.data || [],
                trainingRecords: trainingRes.data || [],
            };
        } catch (normalizedErr) {
            if (!isMissingRelationError(normalizedErr)) {
                debugError('Fetch normalized employee tables error:', normalizedErr);
            }
        }

        const assessmentsByEmployee = {};
        const assessmentScoresByAssessment = {};
        const historyByEmployee = {};
        const trainingByEmployee = {};

        if (normalizedTables) {
            normalizedTables.assessments.forEach(row => {
                if (!assessmentsByEmployee[row.employee_id]) assessmentsByEmployee[row.employee_id] = {};
                assessmentsByEmployee[row.employee_id][row.assessment_type] = row;
            });

            normalizedTables.assessmentScores.forEach(row => {
                if (!assessmentScoresByAssessment[row.assessment_id]) assessmentScoresByAssessment[row.assessment_id] = [];
                assessmentScoresByAssessment[row.assessment_id].push(row);
            });

            normalizedTables.assessmentHistory.forEach(row => {
                if (!historyByEmployee[row.employee_id]) historyByEmployee[row.employee_id] = [];
                historyByEmployee[row.employee_id].push(row);
            });

            normalizedTables.trainingRecords.forEach(row => {
                if (!trainingByEmployee[row.employee_id]) trainingByEmployee[row.employee_id] = [];
                trainingByEmployee[row.employee_id].push(row);
            });
        }

        const db = {};
        (employeeRows || []).forEach(row => {
            const rec = mapLegacyEmployeeRow(row);

            if (normalizedTables) {
                const snapshots = assessmentsByEmployee[row.employee_id] || {};
                const managerSnapshot = snapshots.manager;
                const selfSnapshot = snapshots.self;

                if (managerSnapshot) {
                    rec.percentage = toNumber(managerSnapshot.percentage, 0);
                    rec.assessment_updated_by = managerSnapshot.assessed_by || '';
                    rec.assessment_updated_at = managerSnapshot.assessed_at || '';
                    rec.date_updated = managerSnapshot.source_date || toDateLabel(managerSnapshot.assessed_at, rec.date_updated);
                    if (!rec.date_created || rec.date_created === '-') {
                        rec.date_created = rec.date_updated || '-';
                    }
                    rec.scores = asArray(assessmentScoresByAssessment[managerSnapshot.id]).map(score => ({
                        q: score.competency_name,
                        s: toNumber(score.score, 0),
                        n: score.note || '',
                    }));
                }

                if (selfSnapshot) {
                    rec.self_percentage = toNumber(selfSnapshot.percentage, 0);
                    rec.self_assessment_updated_by = selfSnapshot.assessed_by || '';
                    rec.self_assessment_updated_at = selfSnapshot.assessed_at || '';
                    rec.self_date = selfSnapshot.source_date || toDateLabel(selfSnapshot.assessed_at, rec.self_date || '');
                    rec.self_scores = asArray(assessmentScoresByAssessment[selfSnapshot.id]).map(score => ({
                        q: score.competency_name,
                        s: toNumber(score.score, 0),
                        n: score.note || '',
                    }));
                }

                if (historyByEmployee[row.employee_id]) {
                    rec.history = historyByEmployee[row.employee_id]
                        .slice()
                        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
                        .map(item => ({
                            date: item.assessed_on || '-',
                            score: toNumber(item.percentage, 0),
                            seniority: item.seniority || rec.seniority || '-',
                            position: item.position || rec.position || '',
                        }));
                }

                if (trainingByEmployee[row.employee_id]) {
                    rec.training_history = trainingByEmployee[row.employee_id]
                        .slice()
                        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
                        .map(item => ({
                            course: item.course || '',
                            start: item.start_date || '',
                            end: item.end_date || '',
                            provider: item.provider || '',
                            status: item.status || 'ongoing',
                        }));
                }
            }

            db[row.employee_id] = rec;
        });

        state.db = db;
        reconcileCurrentUserProfile();
        emit('data:employees', db);
        return db;
    } catch (error) {
        debugError('Fetch employees error:', error);
        return;
    }
}

async function upsertAssessmentSnapshot(rec, assessmentType) {
    const isSelf = assessmentType === 'self';
    const percentage = toNumber(isSelf ? rec.self_percentage : rec.percentage, 0);
    const assessedAt = isSelf ? (rec.self_assessment_updated_at || null) : (rec.assessment_updated_at || null);
    const assessedBy = isSelf ? (rec.self_assessment_updated_by || null) : (rec.assessment_updated_by || null);
    const sourceDate = isSelf
        ? (rec.self_date || '-')
        : (rec.date_updated || rec.date_created || '-');
    const scoreRows = normalizeScoreRows(isSelf ? rec.self_scores : rec.scores);

    const hasData = percentage > 0 || scoreRows.length > 0 || Boolean(assessedAt);

    if (!hasData) {
        const { data: existingRows } = await execSupabase(
            `Find ${assessmentType} assessment snapshot for ${rec.id}`,
            () => supabase
                .from('employee_assessments')
                .select('id')
                .eq('employee_id', rec.id)
                .eq('assessment_type', assessmentType),
            { retries: 0 }
        );

        const assessmentIds = (existingRows || []).map(row => row.id).filter(Boolean);
        if (assessmentIds.length > 0) {
            await execSupabase(
                `Delete ${assessmentType} assessment score rows for ${rec.id}`,
                () => supabase
                    .from('employee_assessment_scores')
                    .delete()
                    .in('assessment_id', assessmentIds),
                { retries: 0 }
            );
        }

        await execSupabase(
            `Delete ${assessmentType} assessment snapshot for ${rec.id}`,
            () => supabase
                .from('employee_assessments')
                .delete()
                .eq('employee_id', rec.id)
                .eq('assessment_type', assessmentType),
            { retries: 0 }
        );
        return;
    }

    const { data: snapshot } = await execSupabase(
        `Save ${assessmentType} assessment snapshot for ${rec.id}`,
        () => supabase
            .from('employee_assessments')
            .upsert({
                employee_id: rec.id,
                assessment_type: assessmentType,
                percentage,
                seniority: rec.seniority || '',
                assessed_at: assessedAt,
                assessed_by: assessedBy,
                source_date: sourceDate,
            }, { onConflict: 'employee_id,assessment_type' })
            .select('id')
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    await execSupabase(
        `Replace ${assessmentType} assessment score rows for ${rec.id}`,
        () => supabase
            .from('employee_assessment_scores')
            .delete()
            .eq('assessment_id', snapshot.id),
        { retries: 0 }
    );

    if (scoreRows.length > 0) {
        await execSupabase(
            `Insert ${assessmentType} assessment score rows for ${rec.id}`,
            () => supabase
                .from('employee_assessment_scores')
                .insert(scoreRows.map(row => ({
                    assessment_id: snapshot.id,
                    competency_name: row.competency_name,
                    score: row.score,
                    note: row.note,
                }))),
            { interactiveRetry: true, retries: 1 }
        );
    }
}

async function replaceAssessmentHistoryRows(rec) {
    await execSupabase(
        `Replace assessment history rows for ${rec.id}`,
        () => supabase
            .from('employee_assessment_history')
            .delete()
            .eq('employee_id', rec.id),
        { retries: 0 }
    );

    const rows = asArray(rec.history)
        .map(item => ({
            employee_id: rec.id,
            assessment_type: 'manager',
            assessed_on: String(item?.date || '-'),
            percentage: toNumber(item?.score, 0),
            seniority: String(item?.seniority || rec.seniority || ''),
            position: String(item?.position || rec.position || ''),
        }))
        .filter(item => item.assessed_on !== '' && Number.isFinite(item.percentage));

    if (rows.length > 0) {
        await execSupabase(
            `Insert assessment history rows for ${rec.id}`,
            () => supabase.from('employee_assessment_history').insert(rows),
            { interactiveRetry: true, retries: 1 }
        );
    }
}

async function replaceTrainingRows(rec) {
    await execSupabase(
        `Replace training rows for ${rec.id}`,
        () => supabase
            .from('employee_training_records')
            .delete()
            .eq('employee_id', rec.id),
        { retries: 0 }
    );

    const rows = asArray(rec.training_history)
        .map(item => ({
            employee_id: rec.id,
            course: String(item?.course || '').trim(),
            start_date: String(item?.start || ''),
            end_date: String(item?.end || ''),
            provider: String(item?.provider || ''),
            status: String(item?.status || 'ongoing').toLowerCase(),
            notes: String(item?.notes || ''),
        }))
        .filter(item => item.course)
        .map(item => ({
            ...item,
            status: ['planned', 'ongoing', 'completed', 'approved'].includes(item.status) ? item.status : 'ongoing',
        }));

    if (rows.length > 0) {
        await execSupabase(
            `Insert training rows for ${rec.id}`,
            () => supabase.from('employee_training_records').insert(rows),
            { interactiveRetry: true, retries: 1 }
        );
    }
}

async function syncEmployeeNormalizedRecords(rec) {
    try {
        await upsertAssessmentSnapshot(rec, 'manager');
        await upsertAssessmentSnapshot(rec, 'self');
        await replaceAssessmentHistoryRows(rec);
        await replaceTrainingRows(rec);
    } catch (error) {
        if (isMissingRelationError(error)) return;
        throw error;
    }
}

async function saveEmployee(rec) {
    const payload = {
        employee_id: rec.id,
        name: rec.name,
        position: rec.position,
        seniority: rec.seniority,
        join_date: rec.join_date,
        department: rec.department || getDepartment(rec.position),
        manager_id: rec.manager_id || null,
        auth_email: rec.auth_email || null,
        auth_id: rec.auth_id || null,
        role: rec.role || 'employee',
        percentage: rec.percentage || 0,
        scores: rec.scores || [],
        self_scores: rec.self_scores || [],
        self_percentage: rec.self_percentage || 0,
        self_date: rec.self_date || null,
        history: rec.history || [],
        training_history: rec.training_history || [],
        date_created: rec.date_created || '-',
        date_updated: rec.date_updated || '-',
        date_next: rec.date_next || '-',
        tenure_display: rec.tenure_display || '',
        kpi_targets: rec.kpi_targets || {},
        must_change_password: Boolean(rec.must_change_password),
        assessment_updated_by: rec.assessment_updated_by || null,
        assessment_updated_at: rec.assessment_updated_at || null,
        self_assessment_updated_by: rec.self_assessment_updated_by || null,
        self_assessment_updated_at: rec.self_assessment_updated_at || null,
    };

    await execSupabase(
        `Save employee "${rec.id}"`,
        () => supabase
            .from('employees')
            .upsert(payload, { onConflict: 'employee_id' }),
        { interactiveRetry: true, retries: 1 }
    );

    await syncEmployeeNormalizedRecords(rec);

    state.db[rec.id] = rec;
    emit('data:employees', state.db);
}

async function deleteEmployee(id) {
    await execSupabase(
        `Delete employee "${id}"`,
        () => supabase
            .from('employees')
            .delete()
            .eq('employee_id', id),
        { interactiveRetry: true, retries: 1 }
    );

    delete state.db[id];
    emit('data:employees', state.db);
}

export {
    fetchEmployees,
    saveEmployee,
    deleteEmployee,
};
