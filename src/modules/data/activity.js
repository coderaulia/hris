import { supabase, state, emit, debugError, execSupabase } from './runtime.js';

async function fetchActivityLogs(limit = 100) {
    try {
        const { data } = await execSupabase(
            'Load activity log',
            () => supabase
                .from('admin_activity_log')
                .select('id,actor_employee_id,action,details,created_at')
                .order('created_at', { ascending: false })
                .limit(limit),
            { retries: 1 }
        );
        state.activityLogs = data || [];
        emit('data:activityLogs', state.activityLogs);
        return state.activityLogs;
    } catch (error) {
        debugError('Fetch activity logs error:', error);
        state.activityLogs = [];
        emit('data:activityLogs', state.activityLogs);
        return [];
    }
}

async function logActivity({
    action,
    entityType = 'general',
    entityId = null,
    details = {},
} = {}) {
    const actorId = state.currentUser?.id;
    if (!actorId || !action) return;

    try {
        await execSupabase(
            'Write activity log',
            () => supabase.from('admin_activity_log').insert({
                actor_employee_id: actorId,
                actor_role: state.currentUser?.role || null,
                action,
                entity_type: entityType,
                entity_id: entityId ? String(entityId) : null,
                details: details || {},
            }),
            { retries: 0 }
        );
    } catch (error) {
        debugError('Log activity error:', error);
    }
}

export {
    fetchActivityLogs,
    logActivity,
};
