import {
    state,
    emit,
    generateUuid,
    isMissingRelationError,
    debugError,
    asArray,
    toNumber,
} from './runtime.js';
import { backend } from '../../lib/backend.js';
import { logActivity } from './activity.js';
import { requestLeaveNotification } from '../../lib/edge/notifications.js';

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'cancelled']);

function currentEmployeeId() {
    return String(state.currentUser?.id || '').trim();
}

function currentYear() {
    return new Date().getFullYear();
}

// Count Mon–Fri working days between two date strings (inclusive).
// Public holidays are not subtracted (follow-up scope).
function countWorkingDays(startDate, endDate) {
    const s = new Date(`${startDate}T00:00:00`);
    const e = new Date(`${endDate}T00:00:00`);
    if (isNaN(s) || isNaN(e) || s > e) return 0;
    let count = 0;
    const cur = new Date(s);
    while (cur <= e) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

async function fetchLeaveTypes() {
    try {
        const { data, error } = await backend.leave.listLeaveTypes();
        if (error) throw error;
        state.leaveTypes = asArray(data);
        emit('data:leaveTypes', state.leaveTypes);
        return state.leaveTypes;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('[leave] fetchLeaveTypes:', error);
        state.leaveTypes = [];
        emit('data:leaveTypes', state.leaveTypes);
        return [];
    }
}

async function fetchMyLeave(filters = {}) {
    const employeeId = currentEmployeeId();
    if (!employeeId) {
        state.myLeave = [];
        emit('data:myLeave', state.myLeave);
        return [];
    }
    try {
        const { data, error } = await backend.leave.listMyLeave(employeeId, filters);
        if (error) throw error;
        state.myLeave = asArray(data);
        emit('data:myLeave', state.myLeave);
        return state.myLeave;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('[leave] fetchMyLeave:', error);
        state.myLeave = [];
        emit('data:myLeave', state.myLeave);
        return [];
    }
}

async function fetchLeaveRequests(filters = {}) {
    try {
        const { data, error } = await backend.leave.listLeaveRequests(filters);
        if (error) throw error;
        state.leaveRequests = asArray(data);
        emit('data:leaveRequests', state.leaveRequests);
        return state.leaveRequests;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('[leave] fetchLeaveRequests:', error);
        state.leaveRequests = [];
        emit('data:leaveRequests', state.leaveRequests);
        return [];
    }
}

async function fetchMyBalances(year = currentYear()) {
    const employeeId = currentEmployeeId();
    if (!employeeId) {
        state.myLeaveBalances = [];
        emit('data:myLeaveBalances', state.myLeaveBalances);
        return [];
    }
    try {
        const { data, error } = await backend.leave.listMyBalances(employeeId, year);
        if (error) throw error;
        state.myLeaveBalances = asArray(data);
        emit('data:myLeaveBalances', state.myLeaveBalances);
        return state.myLeaveBalances;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('[leave] fetchMyBalances:', error);
        state.myLeaveBalances = [];
        emit('data:myLeaveBalances', state.myLeaveBalances);
        return [];
    }
}

async function fetchBalances(filters = {}) {
    try {
        const { data, error } = await backend.leave.listBalances(filters);
        if (error) throw error;
        state.leaveBalances = asArray(data);
        emit('data:leaveBalances', state.leaveBalances);
        return state.leaveBalances;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('[leave] fetchBalances:', error);
        state.leaveBalances = [];
        emit('data:leaveBalances', state.leaveBalances);
        return [];
    }
}

async function submitLeaveRequest({ leaveTypeId, startDate, endDate, halfDay = false, reason = '', attachmentFile = null } = {}) {
    const employeeId = currentEmployeeId();
    if (!employeeId) throw new Error('You must be signed in to submit a leave request');
    if (!leaveTypeId) throw new Error('Leave type is required');
    if (!startDate || !endDate) throw new Error('Start and end dates are required');

    const days = halfDay ? 0.5 : countWorkingDays(startDate, endDate);
    if (days <= 0) throw new Error('No working days in the selected date range');

    // Quota check for types with a limit
    const types = state.leaveTypes?.length ? state.leaveTypes : await fetchLeaveTypes();
    const leaveType = types.find(t => t.id === leaveTypeId);
    if (leaveType?.default_quota_days) {
        const balances = state.myLeaveBalances?.length
            ? state.myLeaveBalances
            : await fetchMyBalances(new Date(startDate).getFullYear());
        const balance = balances.find(b => b.leave_type_id === leaveTypeId && b.year === new Date(startDate).getFullYear());
        const remaining = balance ? balance.remaining_days : toNumber(leaveType.default_quota_days, 0);
        if (days > remaining) {
            throw new Error(`Insufficient ${leaveType.name_id} balance. Remaining: ${remaining} day(s), requested: ${days}`);
        }
    }

    const requestId = generateUuid();
    const row = {
        id: requestId,
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        days_count: Math.ceil(days),
        half_day: Boolean(halfDay),
        reason: String(reason || '').trim() || null,
        status: 'pending',
        created_by: employeeId,
    };

    let attachmentBlob = null;
    let storagePath = null;
    if (attachmentFile) {
        attachmentBlob = attachmentFile;
        const safeFilename = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        storagePath = `${employeeId}/${requestId}/${safeFilename}`;
    }

    const { data, error } = await backend.leave.createLeaveRequest(row, attachmentBlob, storagePath);
    if (error) throw error;

    await logActivity({
        action: 'submit_leave_request',
        entityType: 'leave_request',
        entityId: requestId,
        details: { leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, days_count: row.days_count },
    });

    try {
        await requestLeaveNotification(requestId);
    } catch {
        // Non-blocking — notification failure doesn't abort submission
    }

    await fetchMyLeave();
    return data;
}

async function decideLeaveRequest(id, { status, decisionNote = '' } = {}) {
    const requestId = String(id || '').trim();
    if (!requestId) throw new Error('Leave request id is required');
    if (!VALID_STATUSES.has(status) || status === 'pending' || status === 'cancelled') {
        throw new Error('Decision must be "approved" or "rejected"');
    }

    const approverId = currentEmployeeId();

    // Fetch the current request to know previous status + days
    const allRequests = state.leaveRequests?.length ? state.leaveRequests : await fetchLeaveRequests();
    const current = allRequests.find(r => r.id === requestId);

    const patch = {
        status,
        approver_id: approverId,
        decided_at: new Date().toISOString(),
        decision_note: String(decisionNote || '').trim() || null,
    };

    const { data, error } = await backend.leave.decideLeaveRequest(requestId, patch);
    if (error) throw error;

    // Balance adjustment: approve increments used_days; rejecting an already-approved row decrements
    if (current) {
        const year = new Date(current.start_date).getFullYear();
        const leaveType = (state.leaveTypes || []).find(t => t.id === current.leave_type_id);
        const hasQuota = Boolean(leaveType?.default_quota_days);
        if (hasQuota) {
            let delta = 0;
            if (status === 'approved') delta = current.days_count;
            else if (status === 'rejected' && current.status === 'approved') delta = -current.days_count;
            if (delta !== 0) {
                const { error: balErr } = await backend.leave.applyBalanceDelta(
                    current.employee_id, current.leave_type_id, year, delta
                );
                if (balErr) debugError('[leave] balance delta failed:', balErr);
            }
        }
    }

    await logActivity({
        action: status === 'approved' ? 'approve_leave' : 'reject_leave',
        entityType: 'leave_request',
        entityId: requestId,
        details: { status, decision_note: patch.decision_note },
    });

    try {
        await requestLeaveNotification(requestId);
    } catch {
        // Non-blocking
    }

    await fetchLeaveRequests();
    return data;
}

async function cancelLeaveRequest(id) {
    const requestId = String(id || '').trim();
    if (!requestId) return;
    const { error } = await backend.leave.cancelLeaveRequest(requestId);
    if (error) throw error;
    await logActivity({
        action: 'cancel_leave_request',
        entityType: 'leave_request',
        entityId: requestId,
    });
    await fetchMyLeave();
}

async function getLeaveAttachmentUrl(record) {
    if (!record?.attachment_storage_path) return null;
    const { data, error } = await backend.leave.getLeaveAttachmentUrl(record.attachment_storage_path);
    if (error) throw error;
    return data?.signedUrl || null;
}

export {
    countWorkingDays,
    fetchLeaveTypes,
    fetchMyLeave,
    fetchLeaveRequests,
    fetchMyBalances,
    fetchBalances,
    submitLeaveRequest,
    decideLeaveRequest,
    cancelLeaveRequest,
    getLeaveAttachmentUrl,
};
