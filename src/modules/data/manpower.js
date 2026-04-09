import {
    supabase,
    state,
    emit,
    debugError,
    execSupabase,
    fetchOptionalCollection,
    isMissingRelationError,
    generateUuid,
} from './runtime.js';

const MANPOWER_PLAN_OVERVIEW_COLUMNS = 'id,period,department,position,seniority,planned_headcount,approved_headcount,filled_headcount,gap_headcount,status,notes,created_by,updated_by,created_at,updated_at';
const HEADCOUNT_REQUEST_OVERVIEW_COLUMNS = 'id,plan_id,request_code,plan_period,department,position,seniority,requested_count,hired_total,pipeline_total,priority,business_reason,approval_status,approval_note,requested_by,requested_by_name,approved_by,approved_by_name,target_hire_date,created_at,updated_at';
const RECRUITMENT_PIPELINE_OVERVIEW_COLUMNS = 'id,request_id,request_code,department,position,priority,target_hire_date,remaining_openings,candidate_name,stage,source,owner_id,owner_name,stage_updated_at,stage_age_days,offer_status,expected_start_date,notes,overdue_days,created_at,updated_at';
const RECRUITMENT_PIPELINE_COLUMNS = 'id,request_id,candidate_name,stage,source,owner_id,stage_updated_at,offer_status,expected_start_date,notes,created_at,updated_at';

async function fetchManpowerPlans() {
    try {
        const { data } = await execSupabase(
            'Fetch manpower plans',
            () => supabase
                .from('manpower_plan_overview')
                .select(MANPOWER_PLAN_OVERVIEW_COLUMNS)
                .order('period', { ascending: false })
                .order('department', { ascending: true })
                .order('position', { ascending: true }),
            { retries: 1 }
        );
        state.manpowerPlans = data || [];
        emit('data:manpowerPlans', state.manpowerPlans);
        return state.manpowerPlans;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch manpower plans error:', error);
        }
        state.manpowerPlans = [];
        emit('data:manpowerPlans', state.manpowerPlans);
        return [];
    }
}

async function saveManpowerPlan(plan) {
    await execSupabase(
        `Save manpower plan "${plan?.department || '-'} / ${plan?.position || '-'}"`,
        () => supabase
            .from('manpower_plans')
            .upsert(plan, { onConflict: 'period,department,position,seniority' }),
        { interactiveRetry: true, retries: 1 }
    );

    return fetchManpowerPlans();
}

async function deleteManpowerPlan(id) {
    await execSupabase(
        `Delete manpower plan "${id}"`,
        () => supabase
            .from('manpower_plans')
            .delete()
            .eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );

    return fetchManpowerPlans();
}

async function fetchHeadcountRequests() {
    try {
        const { data } = await execSupabase(
            'Fetch headcount requests',
            () => supabase
                .from('headcount_request_overview')
                .select(HEADCOUNT_REQUEST_OVERVIEW_COLUMNS)
                .order('created_at', { ascending: false }),
            { retries: 1 }
        );
        state.headcountRequests = data || [];
        emit('data:headcountRequests', state.headcountRequests);
        return state.headcountRequests;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch headcount requests error:', error);
        }
        state.headcountRequests = [];
        emit('data:headcountRequests', state.headcountRequests);
        return [];
    }
}

async function fetchRecruitmentPipeline() {
    try {
        const { data } = await execSupabase(
            'Fetch recruitment pipeline',
            () => supabase
                .from('recruitment_pipeline_overview')
                .select(RECRUITMENT_PIPELINE_OVERVIEW_COLUMNS)
                .order('stage_updated_at', { ascending: false }),
            { retries: 1 }
        );
        state.recruitmentPipeline = data || [];
        emit('data:recruitmentPipeline', state.recruitmentPipeline);
        return state.recruitmentPipeline;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch recruitment pipeline error:', error);
        }
        return fetchOptionalCollection({
            label: 'Fetch recruitment pipeline (fallback)',
            table: 'recruitment_pipeline',
            selectColumns: RECRUITMENT_PIPELINE_COLUMNS,
            stateKey: 'recruitmentPipeline',
            eventName: 'data:recruitmentPipeline',
            orderBy: 'stage_updated_at',
            ascending: false,
        });
    }
}

async function saveHeadcountRequest(request) {
    await execSupabase(
        `Save headcount request "${request?.request_code || request?.department || '-'}"`,
        () => supabase
            .from('headcount_requests')
            .upsert(request)
            .select('id')
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    return fetchHeadcountRequests();
}

async function updateHeadcountRequestStatus(id, {
    approval_status,
    approved_by = null,
    approval_note = '',
} = {}) {
    await execSupabase(
        `Update headcount request status "${id}"`,
        () => supabase
            .from('headcount_requests')
            .update({
                approval_status,
                approved_by,
                approval_note,
            })
            .eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );

    return fetchHeadcountRequests();
}

async function saveRecruitmentCard(card) {
    const payload = {
        id: card?.id || generateUuid(),
        request_id: card?.request_id || null,
        candidate_name: card?.candidate_name || '',
        stage: card?.stage || 'requested',
        source: card?.source || '',
        owner_id: card?.owner_id || null,
        stage_updated_at: card?.stage_updated_at || new Date().toISOString(),
        offer_status: card?.offer_status || '',
        expected_start_date: card?.expected_start_date || null,
        notes: card?.notes || '',
    };

    await execSupabase(
        `Save recruitment card "${payload.candidate_name || payload.id}"`,
        () => supabase
            .from('recruitment_pipeline')
            .upsert(payload)
            .select('id')
            .single(),
        { interactiveRetry: true, retries: 1 }
    );

    await Promise.all([
        fetchRecruitmentPipeline(),
        fetchHeadcountRequests(),
    ]);
    return state.recruitmentPipeline;
}

async function updateRecruitmentStage(id, stage) {
    await execSupabase(
        `Update recruitment stage "${id}"`,
        () => supabase
            .from('recruitment_pipeline')
            .update({
                stage,
                stage_updated_at: new Date().toISOString(),
            })
            .eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );

    await Promise.all([
        fetchRecruitmentPipeline(),
        fetchHeadcountRequests(),
    ]);
    return state.recruitmentPipeline;
}

async function deleteRecruitmentCard(id) {
    await execSupabase(
        `Delete recruitment card "${id}"`,
        () => supabase
            .from('recruitment_pipeline')
            .delete()
            .eq('id', id),
        { interactiveRetry: true, retries: 1 }
    );

    await Promise.all([
        fetchRecruitmentPipeline(),
        fetchHeadcountRequests(),
    ]);
    return state.recruitmentPipeline;
}

export {
    fetchManpowerPlans,
    saveManpowerPlan,
    deleteManpowerPlan,
    fetchHeadcountRequests,
    fetchRecruitmentPipeline,
    saveHeadcountRequest,
    updateHeadcountRequestStatus,
    saveRecruitmentCard,
    updateRecruitmentStage,
    deleteRecruitmentCard,
};
