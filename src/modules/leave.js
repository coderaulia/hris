// ==================================================
// LEAVE MANAGEMENT — cuti & izin (records tab view)
// Employee: balance cards + request form + my history
// Manager/HR: pending approvals + full log + export
// ==================================================

import { state } from '../lib/store.js';
import { escapeHTML } from '../lib/utils.js';
import * as notify from '../lib/notify.js';
import { exportToExcel } from '../lib/exportUtils.js';
import {
    fetchLeaveTypes,
    fetchMyLeave,
    fetchLeaveRequests,
    fetchMyBalances,
    fetchBalances,
    submitLeaveRequest,
    decideLeaveRequest,
    cancelLeaveRequest,
    getLeaveAttachmentUrl,
    countWorkingDays,
} from './data/leave.js';

const CONTAINER_ID = 'records-leave';

let handlersBound = false;

function isHrView() {
    const role = String(state.currentUser?.role || '').toLowerCase();
    return role === 'superadmin' || role === 'hr';
}

function isManagerView() {
    const role = String(state.currentUser?.role || '').toLowerCase();
    return role === 'superadmin' || role === 'hr' || role === 'manager' || role === 'director';
}

function employeeName(employeeId) {
    return state.db?.[employeeId]?.name || employeeId || '-';
}

function fmtDate(val) {
    if (!val) return '-';
    const d = new Date(val);
    return isNaN(d) ? String(val).slice(0, 10) : d.toISOString().slice(0, 10);
}

// --- Status badge helpers ---

function statusBadge(status) {
    const map = {
        pending:   '<span class="badge bg-warning text-dark">Pending</span>',
        approved:  '<span class="badge bg-success">Approved</span>',
        rejected:  '<span class="badge bg-danger">Rejected</span>',
        cancelled: '<span class="badge bg-secondary">Cancelled</span>',
    };
    return map[status] || `<span class="badge bg-light text-dark">${escapeHTML(status || '-')}</span>`;
}

// --- Balance cards ---

function balanceCardsHtml(balances, leaveTypes) {
    if (!leaveTypes?.length) return '<p class="text-muted small">No leave types configured.</p>';
    return `<div class="row g-2 mb-3">
        ${leaveTypes.map(lt => {
            const bal = (balances || []).find(b => b.leave_type_id === lt.id);
            const total    = bal ? bal.total_entitled : (lt.default_quota_days ?? '∞');
            const used     = bal ? bal.used_days : 0;
            const remaining = bal ? bal.remaining_days : (lt.default_quota_days ?? '∞');
            const pct = (bal && lt.default_quota_days) ? Math.round((used / (bal.total_entitled || 1)) * 100) : 0;
            return `<div class="col-6 col-md-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body py-2 px-3">
                        <div class="small fw-bold text-truncate mb-1">${escapeHTML(lt.name_id)}</div>
                        <div class="d-flex justify-content-between align-items-baseline">
                            <span class="fs-5 fw-bold">${remaining}</span>
                            <span class="text-muted small">/ ${total}</span>
                        </div>
                        <div class="text-muted small mb-1">remaining</div>
                        ${lt.default_quota_days ? `<div class="progress" style="height:4px"><div class="progress-bar bg-primary" style="width:${pct}%"></div></div>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

// --- Request form ---

function requestFormHtml(leaveTypes) {
    const typeOptions = (leaveTypes || [])
        .map(lt => `<option value="${escapeHTML(lt.id)}" data-quota="${lt.default_quota_days ?? ''}">${escapeHTML(lt.name_id)}</option>`)
        .join('');
    return `
    <div class="card shadow-sm border-0 mb-3" id="leave-form-card">
        <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
            <h6 class="m-0 fw-bold"><i class="bi bi-calendar-plus me-1"></i>Submit Leave Request</h6>
            <button type="button" class="btn btn-sm btn-link p-0" id="leave-form-toggle">
                <i class="bi bi-chevron-down" id="leave-form-icon"></i>
            </button>
        </div>
        <div class="card-body" id="leave-form-body">
            <form id="leave-request-form" novalidate>
                <div class="row g-2">
                    <div class="col-12 col-md-4">
                        <label class="form-label small fw-semibold">Leave Type <span class="text-danger">*</span></label>
                        <select class="form-select form-select-sm" id="leave-type-select" required>${typeOptions}</select>
                    </div>
                    <div class="col-6 col-md-2">
                        <label class="form-label small fw-semibold">Start Date <span class="text-danger">*</span></label>
                        <input type="date" class="form-control form-control-sm" id="leave-start-date" required>
                    </div>
                    <div class="col-6 col-md-2">
                        <label class="form-label small fw-semibold">End Date <span class="text-danger">*</span></label>
                        <input type="date" class="form-control form-control-sm" id="leave-end-date" required>
                    </div>
                    <div class="col-6 col-md-2 d-flex align-items-end">
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" id="leave-half-day">
                            <label class="form-check-label small" for="leave-half-day">Half day</label>
                        </div>
                    </div>
                    <div class="col-6 col-md-2 d-flex align-items-end">
                        <div id="leave-days-preview" class="text-muted small mb-2">— days</div>
                    </div>
                    <div class="col-12 col-md-8">
                        <label class="form-label small fw-semibold">Reason</label>
                        <textarea class="form-control form-control-sm" id="leave-reason" rows="2" maxlength="500" placeholder="Optional reason…"></textarea>
                    </div>
                    <div class="col-12 col-md-4">
                        <label class="form-label small fw-semibold">Attachment <span class="text-muted">(optional)</span></label>
                        <input type="file" class="form-control form-control-sm" id="leave-attachment" accept="image/jpeg,image/png,application/pdf">
                        <div class="form-text">JPG, PNG, or PDF · max 5 MB</div>
                    </div>
                </div>
                <div class="mt-2">
                    <button type="submit" class="btn btn-sm btn-primary" id="leave-submit-btn">
                        <i class="bi bi-send me-1"></i>Submit Request
                    </button>
                </div>
            </form>
        </div>
    </div>`;
}

// --- My requests table ---

function myRequestsTableHtml() {
    return `
    <div class="card shadow-sm border-0 mb-3">
        <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
            <h6 class="m-0 fw-bold"><i class="bi bi-list-check me-1"></i>My Leave Requests</h6>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="leave-my-refresh">
                <i class="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light"><tr>
                        <th>Type</th><th>Start</th><th>End</th>
                        <th class="text-center">Days</th><th class="text-center">Status</th>
                        <th>Reason</th><th class="text-end">Actions</th>
                    </tr></thead>
                    <tbody id="leave-my-body"><tr><td colspan="7" class="text-muted small">Loading…</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --- Pending approvals panel (manager/HR) ---

function approvalsHtml() {
    return `
    <div class="card shadow-sm border-0 mb-3">
        <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
            <h6 class="m-0 fw-bold"><i class="bi bi-check2-circle me-1"></i>Pending Approvals</h6>
            <span class="badge bg-warning text-dark" id="leave-pending-count">0</span>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light"><tr>
                        <th>Employee</th><th>Type</th><th>Start</th><th>End</th>
                        <th class="text-center">Days</th><th>Reason</th>
                        <th class="text-end">Actions</th>
                    </tr></thead>
                    <tbody id="leave-pending-body"><tr><td colspan="7" class="text-muted small">Loading…</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --- Full log (HR) ---

function fullLogHtml() {
    return `
    <div class="card shadow-sm border-0">
        <div class="card-header bg-white border-bottom py-2">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h6 class="m-0 fw-bold"><i class="bi bi-table me-1"></i>All Leave Requests</h6>
                <div class="d-flex gap-2 align-items-center flex-wrap">
                    <input type="date" id="leave-filter-from" class="form-control form-control-sm" style="max-width:150px;" title="From date">
                    <input type="date" id="leave-filter-to"   class="form-control form-control-sm" style="max-width:150px;" title="To date">
                    <select id="leave-filter-status" class="form-select form-select-sm" style="max-width:140px;">
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button type="button" id="leave-apply-filter" class="btn btn-sm btn-outline-primary">
                        <i class="bi bi-funnel me-1"></i>Apply
                    </button>
                    <button type="button" id="leave-export" class="btn btn-sm btn-warning">
                        <i class="bi bi-file-earmark-excel me-1"></i>Export
                    </button>
                </div>
            </div>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light sticky-top"><tr>
                        <th>Employee</th><th>Type</th><th>Start</th><th>End</th>
                        <th class="text-center">Days</th><th class="text-center">Status</th>
                        <th>Approver</th><th>Decided</th>
                        <th class="text-end">Attachment</th>
                    </tr></thead>
                    <tbody id="leave-log-body"><tr><td colspan="9" class="text-muted small">Loading…</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --- Render helpers ---

function renderMyTable() {
    const body = document.getElementById('leave-my-body');
    if (!body) return;
    const rows = Array.isArray(state.myLeave) ? state.myLeave : [];
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="text-muted small">No leave requests.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(r => {
        const typeName = r.leave_types?.name_id || '-';
        const canCancel = r.status === 'pending';
        const hasAttachment = Boolean(r.attachment_storage_path);
        return `<tr>
            <td>${escapeHTML(typeName)}</td>
            <td>${escapeHTML(fmtDate(r.start_date))}</td>
            <td>${escapeHTML(fmtDate(r.end_date))}</td>
            <td class="text-center">${escapeHTML(String(r.days_count ?? '-'))}</td>
            <td class="text-center">${statusBadge(r.status)}</td>
            <td class="small text-truncate" style="max-width:180px;" title="${escapeHTML(r.reason || '')}">${escapeHTML(r.reason || '-')}</td>
            <td class="text-end d-flex gap-1 justify-content-end">
                ${hasAttachment ? `<button class="btn btn-sm btn-link p-0 leave-att-btn" data-path="${escapeHTML(r.attachment_storage_path)}">Doc</button>` : ''}
                ${canCancel ? `<button class="btn btn-sm btn-outline-danger leave-cancel-btn" data-id="${escapeHTML(r.id)}">Cancel</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function renderPendingTable() {
    const body = document.getElementById('leave-pending-body');
    const badge = document.getElementById('leave-pending-count');
    if (!body) return;
    const all = Array.isArray(state.leaveRequests) ? state.leaveRequests : [];
    const myId = String(state.currentUser?.id || '');
    const pending = all.filter(r => r.status === 'pending' && r.employee_id !== myId);
    if (badge) badge.textContent = String(pending.length);
    if (pending.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="text-muted small">No pending approvals.</td></tr>';
        return;
    }
    body.innerHTML = pending.map(r => {
        const typeName = r.leave_types?.name_id || '-';
        return `<tr>
            <td>${escapeHTML(employeeName(r.employee_id))}</td>
            <td>${escapeHTML(typeName)}</td>
            <td>${escapeHTML(fmtDate(r.start_date))}</td>
            <td>${escapeHTML(fmtDate(r.end_date))}</td>
            <td class="text-center">${escapeHTML(String(r.days_count ?? '-'))}</td>
            <td class="small text-truncate" style="max-width:140px;" title="${escapeHTML(r.reason || '')}">${escapeHTML(r.reason || '-')}</td>
            <td class="text-end d-flex gap-1 justify-content-end">
                <button class="btn btn-sm btn-success leave-approve-btn" data-id="${escapeHTML(r.id)}" title="Approve">
                    <i class="bi bi-check-lg"></i>
                </button>
                <button class="btn btn-sm btn-danger leave-reject-btn" data-id="${escapeHTML(r.id)}" title="Reject">
                    <i class="bi bi-x-lg"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderLogTable() {
    const body = document.getElementById('leave-log-body');
    if (!body) return;
    const rows = Array.isArray(state.leaveRequests) ? state.leaveRequests : [];
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="9" class="text-muted small">No leave requests.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(r => {
        const typeName = r.leave_types?.name_id || '-';
        const hasAtt = Boolean(r.attachment_storage_path);
        return `<tr>
            <td>${escapeHTML(employeeName(r.employee_id))}</td>
            <td>${escapeHTML(typeName)}</td>
            <td>${escapeHTML(fmtDate(r.start_date))}</td>
            <td>${escapeHTML(fmtDate(r.end_date))}</td>
            <td class="text-center">${escapeHTML(String(r.days_count ?? '-'))}</td>
            <td class="text-center">${statusBadge(r.status)}</td>
            <td class="small">${escapeHTML(r.approver_id ? employeeName(r.approver_id) : '-')}</td>
            <td class="small">${escapeHTML(fmtDate(r.decided_at))}</td>
            <td class="text-end">${hasAtt ? `<button class="btn btn-sm btn-link p-0 leave-att-btn" data-path="${escapeHTML(r.attachment_storage_path)}">View</button>` : '-'}</td>
        </tr>`;
    }).join('');
}

// --- Main render ---

export async function renderLeaveView() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const [types] = await Promise.all([
        fetchLeaveTypes(),
    ]);

    const year = new Date().getFullYear();
    const [balances] = await Promise.all([
        fetchMyBalances(year),
        fetchMyLeave(),
    ]);

    let html = `
        <div class="mb-3">
            <h6 class="fw-bold small text-uppercase text-muted">${year} Balance</h6>
            ${balanceCardsHtml(balances, types)}
        </div>
        ${requestFormHtml(types)}
        ${myRequestsTableHtml()}
    `;

    if (isManagerView()) {
        await fetchLeaveRequests({ status: 'pending' });
        html += approvalsHtml();
    }

    if (isHrView()) {
        await fetchLeaveRequests();
        html += fullLogHtml();
    }

    container.innerHTML = html;
    renderMyTable();
    if (isManagerView()) renderPendingTable();
    if (isHrView()) renderLogTable();

    bindHandlers(container);
    updateDaysPreview();
}

// --- Handlers ---

function updateDaysPreview() {
    const start = document.getElementById('leave-start-date')?.value;
    const end   = document.getElementById('leave-end-date')?.value;
    const half  = document.getElementById('leave-half-day')?.checked;
    const preview = document.getElementById('leave-days-preview');
    if (!preview) return;
    if (!start || !end) { preview.textContent = '— days'; return; }
    const days = half ? 0.5 : countWorkingDays(start, end);
    preview.textContent = days > 0 ? `${days} working day${days !== 1 ? 's' : ''}` : 'No working days';
}

async function doDecide(id, status) {
    const decisionNote = status === 'rejected'
        ? await (async () => {
            const { value } = await Swal.fire({
                title: 'Reject reason',
                input: 'textarea',
                inputPlaceholder: 'Reason for rejection…',
                showCancelButton: true,
                confirmButtonText: 'Reject',
                confirmButtonColor: '#dc3545',
            });
            return value || '';
        })()
        : '';

    if (status === 'rejected' && decisionNote === undefined) return; // cancelled

    try {
        await notify.withLoading(
            () => decideLeaveRequest(id, { status, decisionNote }),
            status === 'approved' ? 'Approving…' : 'Rejecting…',
            'Updating leave request…'
        );
        renderPendingTable();
        if (isHrView()) renderLogTable();
        await notify.success(status === 'approved' ? 'Leave approved.' : 'Leave rejected.');
    } catch (err) {
        await notify.error(`Could not ${status}: ${err?.message || String(err)}`);
    }
}

function bindHandlers(container) {
    if (handlersBound) return;
    handlersBound = true;

    // Days preview update
    container.addEventListener('change', event => {
        if (
            event.target.closest('#leave-start-date') ||
            event.target.closest('#leave-end-date') ||
            event.target.closest('#leave-half-day')
        ) {
            updateDaysPreview();
        }
    });
    container.addEventListener('input', event => {
        if (event.target.closest('#leave-start-date') || event.target.closest('#leave-end-date')) {
            updateDaysPreview();
        }
    });

    // Form toggle
    container.addEventListener('click', async event => {
        if (event.target.closest('#leave-form-toggle')) {
            const body = document.getElementById('leave-form-body');
            const icon = document.getElementById('leave-form-icon');
            if (body) body.classList.toggle('d-none');
            if (icon) icon.className = body?.classList.contains('d-none')
                ? 'bi bi-chevron-right'
                : 'bi bi-chevron-down';
            return;
        }

        // Approve
        const approveBtn = event.target.closest('.leave-approve-btn');
        if (approveBtn) {
            await doDecide(approveBtn.dataset.id, 'approved');
            return;
        }

        // Reject
        const rejectBtn = event.target.closest('.leave-reject-btn');
        if (rejectBtn) {
            await doDecide(rejectBtn.dataset.id, 'rejected');
            return;
        }

        // Cancel own request
        const cancelBtn = event.target.closest('.leave-cancel-btn');
        if (cancelBtn) {
            const ok = await notify.confirm('Cancel this leave request?');
            if (!ok) return;
            try {
                await cancelLeaveRequest(cancelBtn.dataset.id);
                renderMyTable();
                await notify.success('Leave request cancelled.');
            } catch (err) {
                await notify.error(`Could not cancel: ${err?.message || String(err)}`);
            }
            return;
        }

        // View attachment
        const attBtn = event.target.closest('.leave-att-btn');
        if (attBtn) {
            try {
                const url = await getLeaveAttachmentUrl({ attachment_storage_path: attBtn.dataset.path });
                if (url) window.open(url, '_blank');
                else await notify.warn('Attachment not available.');
            } catch (err) {
                await notify.error(`Could not open attachment: ${err?.message || String(err)}`);
            }
            return;
        }

        // Refresh my leave
        if (event.target.closest('#leave-my-refresh')) {
            await fetchMyLeave();
            renderMyTable();
            return;
        }

        // Apply filter (HR full log)
        if (event.target.closest('#leave-apply-filter')) {
            const from   = document.getElementById('leave-filter-from')?.value || '';
            const to     = document.getElementById('leave-filter-to')?.value || '';
            const status = document.getElementById('leave-filter-status')?.value || '';
            const filters = {};
            if (from) filters.from = from;
            if (to) filters.to = to;
            if (status) filters.status = status;
            await fetchLeaveRequests(filters);
            renderLogTable();
            if (isManagerView()) renderPendingTable();
            return;
        }

        // Export
        if (event.target.closest('#leave-export')) {
            await exportLeaveLog();
        }
    });

    // Form submit
    container.addEventListener('submit', async event => {
        const form = event.target.closest('#leave-request-form');
        if (!form) return;
        event.preventDefault();

        const leaveTypeId  = document.getElementById('leave-type-select')?.value;
        const startDate    = document.getElementById('leave-start-date')?.value;
        const endDate      = document.getElementById('leave-end-date')?.value;
        const halfDay      = document.getElementById('leave-half-day')?.checked;
        const reason       = document.getElementById('leave-reason')?.value || '';
        const attachInput  = document.getElementById('leave-attachment');
        const attachmentFile = attachInput?.files?.[0] || null;

        if (attachmentFile && attachmentFile.size > 5 * 1024 * 1024) {
            await notify.error('Attachment must be under 5 MB.');
            return;
        }

        try {
            await notify.withLoading(
                () => submitLeaveRequest({ leaveTypeId, startDate, endDate, halfDay, reason, attachmentFile }),
                'Submitting…',
                'Sending leave request…'
            );
            form.reset();
            updateDaysPreview();
            const year = new Date().getFullYear();
            await fetchMyBalances(year);
            const container2 = document.getElementById(CONTAINER_ID);
            const leaveTypes = state.leaveTypes || [];
            const balCards = document.querySelector('.row.g-2.mb-3');
            if (balCards) balCards.outerHTML = balanceCardsHtml(state.myLeaveBalances, leaveTypes);
            renderMyTable();
            await notify.success('Leave request submitted.');
        } catch (err) {
            await notify.error(err?.message || 'Could not submit leave request.');
        }
    });
}

async function exportLeaveLog() {
    const rows = Array.isArray(state.leaveRequests) ? state.leaveRequests : [];
    if (rows.length === 0) {
        await notify.warn('No leave records to export.');
        return;
    }
    const data = rows.map(r => ({
        employee_id:   r.employee_id,
        employee_name: employeeName(r.employee_id),
        leave_type:    r.leave_types?.name_id || r.leave_type_id,
        start_date:    fmtDate(r.start_date),
        end_date:      fmtDate(r.end_date),
        days_count:    r.days_count ?? '',
        half_day:      r.half_day ? 'Yes' : 'No',
        status:        r.status || '',
        reason:        r.reason || '',
        approver:      r.approver_id ? employeeName(r.approver_id) : '',
        decided_at:    fmtDate(r.decided_at),
        decision_note: r.decision_note || '',
    }));
    try {
        await exportToExcel(data, `leave-requests-${new Date().toISOString().slice(0, 10)}`, {
            sheetName: 'Leave Requests',
        });
    } catch (err) {
        await notify.error(`Export failed: ${err?.message || String(err)}`);
    }
}
