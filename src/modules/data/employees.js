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
    isMissingColumnError,
    normalizeScoreRows,
    mapLegacyEmployeeRow,
    execSupabase,
} from './runtime.js';
import { backend } from '../../lib/backend.js';
import {
    getAssessmentHistory,
    getManagerAssessment,
    getSelfAssessment,
    getTrainingRecords,
    hydrateEmployeeRecord,
    setAssessmentHistory,
    setManagerAssessment,
    setSelfAssessment,
    setTrainingRecords,
} from '../../lib/employee-records.js';
import { reconcileCurrentUserProfile } from '../auth.js';

const EMPLOYEE_COLUMNS = [
    'employee_id',
    'name',
    'legal_name',
    'position',
    'seniority',
    'join_date',
    'department',
    'manager_id',
    'auth_email',
    'auth_id',
    'role',
    'tenure_display',
    'kpi_targets',
    'must_change_password',
    'place_of_birth',
    'date_of_birth',
    'address',
    'nik_number',
    'job_level',
    'signature_image_url',
    'active_sp_level',
    'active_sp_until',
    'active_sp_reason',
].join(',');
const LEGACY_EMPLOYEE_COLUMNS = [
    'employee_id',
    'name',
    'position',
    'seniority',
    'join_date',
    'department',
    'manager_id',
    'auth_email',
    'auth_id',
    'role',
    'tenure_display',
    'kpi_targets',
    'must_change_password',
].join(',');
const EMPLOYEE_ASSESSMENT_COLUMNS = 'id,employee_id,assessment_type,percentage,assessed_by,assessed_at,source_date';
const EMPLOYEE_ASSESSMENT_SCORE_COLUMNS = 'assessment_id,competency_name,score,note';
const EMPLOYEE_ASSESSMENT_HISTORY_COLUMNS = 'employee_id,assessed_on,percentage,seniority,position,created_at';
const EMPLOYEE_TRAINING_RECORD_COLUMNS = 'employee_id,course,start_date,end_date,provider,status,created_at';

async function fetchEmployees() {
    try {
        let employeeRows = [];
        try {
            const { data, error } = await backend.employees.list();
            if (error) throw error;
            employeeRows = data || [];
        } catch (error) {
            debugError('Fetch employees error:', error);
            // Fallback or handle missing columns if necessary via backend adapter
        }

        let normalizedTables = null;
        try {
            const [assessmentsRes, assessmentScoresRes, assessmentHistoryRes, trainingRes] = await Promise.all([
                backend.assessments.list(EMPLOYEE_ASSESSMENT_COLUMNS),
                backend.assessments.listScores(EMPLOYEE_ASSESSMENT_SCORE_COLUMNS),
                backend.assessments.listHistory(EMPLOYEE_ASSESSMENT_HISTORY_COLUMNS),
                backend.training.list(EMPLOYEE_TRAINING_RECORD_COLUMNS),
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
            let rec = mapLegacyEmployeeRow(row);

            if (normalizedTables) {
                const snapshots = assessmentsByEmployee[row.employee_id] || {};
                const managerSnapshot = snapshots.manager;
                const selfSnapshot = snapshots.self;

                if (managerSnapshot) {
                    rec = setManagerAssessment(rec, {
                        percentage: toNumber(managerSnapshot.percentage, 0),
                        updatedBy: managerSnapshot.assessed_by || '',
                        updatedAt: managerSnapshot.assessed_at || '',
                        sourceDate: managerSnapshot.source_date || toDateLabel(managerSnapshot.assessed_at, rec.date_updated),
                        scores: asArray(assessmentScoresByAssessment[managerSnapshot.id]).map(score => ({
                            q: score.competency_name,
                            s: toNumber(score.score, 0),
                            n: score.note || '',
                        })),
                    });
                    if (!rec.date_created || rec.date_created === '-') {
                        rec.date_created = rec.date_updated || '-';
                    }
                }

                if (selfSnapshot) {
                    rec = setSelfAssessment(rec, {
                        percentage: toNumber(selfSnapshot.percentage, 0),
                        updatedBy: selfSnapshot.assessed_by || '',
                        updatedAt: selfSnapshot.assessed_at || '',
                        sourceDate: selfSnapshot.source_date || toDateLabel(selfSnapshot.assessed_at, rec.self_date || ''),
                        scores: asArray(assessmentScoresByAssessment[selfSnapshot.id]).map(score => ({
                            q: score.competency_name,
                            s: toNumber(score.score, 0),
                            n: score.note || '',
                        })),
                    });
                }

                if (historyByEmployee[row.employee_id]) {
                    rec = setAssessmentHistory(rec, historyByEmployee[row.employee_id]
                        .slice()
                        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
                        .map(item => ({
                            date: item.assessed_on || '-',
                            score: toNumber(item.percentage, 0),
                            seniority: item.seniority || rec.seniority || '-',
                            position: item.position || rec.position || '',
                        })));
                }

                if (trainingByEmployee[row.employee_id]) {
                    rec = setTrainingRecords(rec, trainingByEmployee[row.employee_id]
                        .slice()
                        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
                        .map(item => ({
                            course: item.course || '',
                            start: item.start_date || '',
                            end: item.end_date || '',
                            provider: item.provider || '',
                            status: item.status || 'ongoing',
                        })));
                }
            }

            db[row.employee_id] = hydrateEmployeeRecord(rec);
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
    const snapshotState = isSelf ? getSelfAssessment(rec) : getManagerAssessment(rec);
    const percentage = toNumber(snapshotState.percentage, 0);
    const assessedAt = snapshotState.updatedAt || null;
    const assessedBy = snapshotState.updatedBy || null;
    const sourceDate = snapshotState.sourceDate || '-';
    const scoreRows = normalizeScoreRows(snapshotState.scores);

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

    const rows = asArray(getAssessmentHistory(rec))
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

    const rows = asArray(getTrainingRecords(rec))
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
    const hydrated = hydrateEmployeeRecord(rec);
    const basePayload = {
        employee_id: hydrated.id,
        name: hydrated.name,
        position: hydrated.position,
        seniority: hydrated.seniority,
        join_date: hydrated.join_date,
        department: hydrated.department || getDepartment(hydrated.position),
        manager_id: hydrated.manager_id || null,
        auth_email: hydrated.auth_email || null,
        auth_id: hydrated.auth_id || null,
        role: hydrated.role || 'employee',
        tenure_display: hydrated.tenure_display || '',
        kpi_targets: hydrated.kpi_targets || {},
        must_change_password: Boolean(hydrated.must_change_password),
    };
    const payload = {
        ...basePayload,
        legal_name: hydrated.legal_name || null,
        place_of_birth: hydrated.place_of_birth || null,
        date_of_birth: hydrated.date_of_birth || null,
        address: hydrated.address || null,
        nik_number: hydrated.nik_number || null,
        job_level: hydrated.job_level || null,
        signature_image_url: hydrated.signature_image_url || null,
        active_sp_level: hydrated.active_sp_level || null,
        active_sp_until: hydrated.active_sp_until || null,
        active_sp_reason: hydrated.active_sp_reason || null,
    };

    try {
        const isEdit = Boolean(state.db[hydrated.id]);
        let response;
        if (isEdit) {
            response = await backend.employees.update(hydrated.id, payload);
        } else {
            response = await backend.employees.create(payload);
        }
        
        if (response.error) {
             throw response.error;
        }
    } catch (error) {
        if (!isMissingColumnError(error)) throw error;

        // Fallback for missing columns
        const isEdit = Boolean(state.db[hydrated.id]);
        let response;
        if (isEdit) {
            response = await backend.employees.update(hydrated.id, basePayload);
        } else {
            response = await backend.employees.create(basePayload);
        }
        
        if (response.error) throw response.error;
    }

    await syncEmployeeNormalizedRecords(hydrated);

    state.db[hydrated.id] = hydrated;
    emit('data:employees', state.db);
}

async function deleteEmployee(id) {
    const response = await backend.employees.delete(id);
    if (response.error) {
        throw response.error;
    }

    delete state.db[id];
    emit('data:employees', state.db);
}

export {
    fetchEmployees,
    saveEmployee,
    deleteEmployee,
};
