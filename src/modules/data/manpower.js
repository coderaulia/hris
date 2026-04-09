import {
    supabase,
    state,
    emit,
    debugError,
    execSupabase,
    fetchOptionalCollection,
    isMissingRelationError,
} from './runtime.js';

async function fetchManpowerPlans() {
    try {
        const { data } = await execSupabase(
            'Fetch manpower plans',
            () => supabase
                .from('manpower_plan_overview')
                .select('*')
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
                .select('*')
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
    return fetchOptionalCollection({
        label: 'Fetch recruitment pipeline',
        table: 'recruitment_pipeline',
        stateKey: 'recruitmentPipeline',
        eventName: 'data:recruitmentPipeline',
        orderBy: 'stage_updated_at',
        ascending: false,
    });
}

async function saveHeadcountRequest(request) {
    await execSupabase(
        `Save headcount request "${request?.request_code || request?.department || '-'}"`,
        () => supabase
            .from('headcount_requests')
            .upsert(request)
            .select('*')
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

export {
    fetchManpowerPlans,
    saveManpowerPlan,
    deleteManpowerPlan,
    fetchHeadcountRequests,
    fetchRecruitmentPipeline,
    saveHeadcountRequest,
    updateHeadcountRequestStatus,
};
