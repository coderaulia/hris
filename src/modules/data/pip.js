import {
    state,
    emit,
    asArray,
    toNumber,
} from './runtime.js';
import { backend } from '../../lib/backend.js';

const PIP_PLAN_COLUMNS = 'id,employee_id,owner_manager_id,trigger_reason,trigger_period,start_date,target_end_date,status,summary,closed_at,created_at,updated_at';
const PIP_ACTION_COLUMNS = 'id,pip_plan_id,action_title,action_detail,due_date,progress_pct,status,checkpoint_note,created_at,updated_at';

async function fetchPipPlans() {
    try {
        const { data, error } = await backend.pip.listPlans();
        if (error) throw error;
        state.pipPlans = data || [];
        emit('data:pipPlans', state.pipPlans);
        return state.pipPlans;
    } catch (error) {
        debugError('Fetch PIP plans error:', error);
        return [];
    }
}

async function fetchPipActions() {
    try {
        const { data, error } = await backend.pip.listActions();
        if (error) throw error;
        state.pipActions = data || [];
        emit('data:pipActions', state.pipActions);
        return state.pipActions;
    } catch (error) {
        debugError('Fetch PIP actions error:', error);
        return [];
    }
}

async function savePipPlan(plan) {
    const payload = {
        ...plan,
        owner_manager_id: plan.owner_manager_id || state.currentUser?.id || null,
    };

    const { data, error } = await backend.pip.savePlan(payload);
    if (error) throw error;

    const idx = state.pipPlans.findIndex(r => r.id === data.id);
    if (idx >= 0) state.pipPlans[idx] = data;
    else state.pipPlans.push(data);
    emit('data:pipPlans', state.pipPlans);
    return data;
}

async function savePipActions(pipPlanId, actions = []) {
    const rows = asArray(actions)
        .map(item => ({
            id: item?.id,
            pip_plan_id: pipPlanId,
            action_title: String(item?.action_title || '').trim(),
            action_detail: String(item?.action_detail || '').trim(),
            due_date: item?.due_date || null,
            progress_pct: toNumber(item?.progress_pct, 0),
            status: String(item?.status || 'todo'),
            checkpoint_note: String(item?.checkpoint_note || '').trim(),
        }))
        .filter(item => item.action_title);

    if (rows.length === 0) return [];

    try {
        const { data, error } = await backend.pip.saveAction(rows[0]); // Simple for now
        if (error) throw error;

        const untouched = state.pipActions.filter(item => item.pip_plan_id !== pipPlanId);
        state.pipActions = [...untouched, ...(data ? [data] : [])];
        emit('data:pipActions', state.pipActions);
        return data ? [data] : [];
    } catch (error) {
        debugError('Save PIP actions error:', error);
        return [];
    }
}

export {
    fetchPipPlans,
    fetchPipActions,
    savePipPlan,
    savePipActions,
};
