import { state, emit, debugError } from './runtime.js';
import { backend } from '../../lib/backend.js';

async function fetchActivityLogs(limit = 100) {
    try {
        const { data, error } = await backend.activity.list();
        if (error) throw error;
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
        await backend.activity.log({
            actor_employee_id: actorId,
            actor_role: state.currentUser?.role || null,
            action,
            entity_type: entityType,
            entity_id: entityId ? String(entityId) : null,
            details: details || {},
        });
    } catch (error) {
        debugError('Log activity error:', error);
    }
}

export {
    fetchActivityLogs,
    logActivity,
};
