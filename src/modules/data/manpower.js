import {
    state,
    emit,
    debugError,
    isMissingRelationError,
    generateUuid,
} from './runtime.js';
import { backend } from '../../lib/backend.js';

const MANPOWER_PLAN_OVERVIEW_COLUMNS = 'id,period,department,position,seniority,planned_headcount,approved_headcount,filled_headcount,gap_headcount,status,notes,created_by,updated_by,created_at,updated_at';
const HEADCOUNT_REQUEST_OVERVIEW_COLUMNS = 'id,plan_id,request_code,plan_period,department,position,seniority,requested_count,hired_total,pipeline_total,priority,business_reason,approval_status,approval_note,requested_by,requested_by_name,approved_by,approved_by_name,target_hire_date,created_at,updated_at';
const RECRUITMENT_PIPELINE_OVERVIEW_COLUMNS = 'id,request_id,request_code,department,position,priority,target_hire_date,remaining_openings,candidate_name,stage,source,owner_id,owner_name,stage_updated_at,stage_age_days,offer_status,expected_start_date,notes,overdue_days,created_at,updated_at';
const RECRUITMENT_PIPELINE_COLUMNS = 'id,request_id,candidate_name,stage,source,owner_id,stage_updated_at,offer_status,expected_start_date,notes,created_at,updated_at';

async function fetchManpowerPlans() {
    try {
        const { data, error } = await backend.manpower.listPlans();
        if (error) throw error;
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
    await backend.manpower.savePlan(plan);
    return fetchManpowerPlans();
}

async function deleteManpowerPlan(id) {
    // We could add delete to backend, for now skip or use update status
    return fetchManpowerPlans();
}

async function fetchHeadcountRequests() {
    try {
        const { data, error } = await backend.manpower.listRequests();
        if (error) throw error;
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
        const { data, error } = await backend.manpower.listPipeline();
        if (error) throw error;
        state.recruitmentPipelineAvailable = true;
        state.recruitmentPipeline = data || [];
        emit('data:recruitmentPipeline', state.recruitmentPipeline);
        return state.recruitmentPipeline;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch recruitment pipeline error:', error);
        } else {
            state.recruitmentPipelineAvailable = false;
        }
        state.recruitmentPipeline = [];
        emit('data:recruitmentPipeline', state.recruitmentPipeline);
        return [];
    }
}

async function saveHeadcountRequest(request) {
    await backend.manpower.saveRequest(request);
    return fetchHeadcountRequests();
}

async function updateHeadcountRequestStatus(id, {
    approval_status,
    approved_by = null,
    approval_note = '',
} = {}) {
    await backend.manpower.saveRequest({
        id,
        approval_status,
        approved_by,
        approval_note,
    });
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

    await backend.manpower.savePipeline(payload);

    await Promise.all([
        fetchRecruitmentPipeline(),
        fetchHeadcountRequests(),
    ]);
    return state.recruitmentPipeline;
}

async function updateRecruitmentStage(id, stage) {
    await backend.manpower.savePipeline({
        id,
        stage,
        stage_updated_at: new Date().toISOString(),
    });

    await Promise.all([
        fetchRecruitmentPipeline(),
        fetchHeadcountRequests(),
    ]);
    return state.recruitmentPipeline;
}

async function deleteRecruitmentCard(id) {
    if (state.recruitmentPipelineAvailable === false) {
        throw new Error('Recruitment board is not available yet. Run migration 20260409_manpower_planning.sql first.');
    }

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
