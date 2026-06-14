// ==================================================
// SIGNER INBOX (My Signatures) — records tab view
// ==================================================

import { state } from '../../lib/store.js';
import { escapeHTML } from '../../lib/utils.js';
import * as notify from '../../lib/notify.js';
import {
    fetchMySignatureRequests,
    signSignatureRequest,
    declineSignatureRequest,
    getDocumentPreviewUrl,
    getSignatureImageUrl,
} from '../data/signatures.js';

const CONTAINER_ID = 'records-signatures';
const selectedFiles = new Map();
let handlersBound = false;

function statusBadge(status) {
    const value = String(status || 'pending').toLowerCase();
    if (value === 'signed') return '<span class="badge bg-success">Signed</span>';
    if (value === 'declined') return '<span class="badge bg-danger">Declined</span>';
    return '<span class="badge bg-warning text-dark">Pending</span>';
}

function requestRow(req) {
    const id = escapeHTML(String(req.id));
    const docName = escapeHTML(String(req.document_filename || req.document_type || 'HR document'));
    const subject = req.employee_name ? `<div class="small text-muted">Subject: ${escapeHTML(String(req.employee_name))}</div>` : '';
    const previewBtn = req.archive_storage_path
        ? `<button type="button" class="btn btn-sm btn-outline-secondary sig-preview-btn" data-id="${id}"><i class="bi bi-file-earmark-text me-1"></i>View document</button>`
        : '';

    let actions = '';
    if (String(req.status).toLowerCase() === 'pending') {
        actions = `
            <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
                <input type="file" class="form-control form-control-sm sig-file-input" data-id="${id}" accept="image/png,image/jpeg" style="max-width:240px;">
                <button type="button" class="btn btn-sm btn-success sig-sign-btn" data-id="${id}"><i class="bi bi-pen me-1"></i>Upload &amp; Sign</button>
                <button type="button" class="btn btn-sm btn-outline-danger sig-decline-btn" data-id="${id}">Decline</button>
            </div>`;
    } else if (req.signature_storage_path) {
        actions = `
            <div class="mt-2">
                <button type="button" class="btn btn-sm btn-link p-0 sig-view-btn" data-id="${id}">View my signature</button>
            </div>`;
    }

    const decline = req.decline_reason
        ? `<div class="small text-danger mt-1">Declined: ${escapeHTML(String(req.decline_reason))}</div>`
        : '';

    return `
        <div class="card border mb-2">
            <div class="card-body py-2">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                        <div class="fw-semibold">${docName}</div>
                        ${subject}
                        <div class="small text-muted">Role: ${escapeHTML(String(req.signer_role || '-'))}</div>
                    </div>
                    <div class="text-end">
                        ${statusBadge(req.status)}
                        <div class="mt-1">${previewBtn}</div>
                    </div>
                </div>
                ${actions}
                ${decline}
            </div>
        </div>`;
}

export async function renderSignatureInbox() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    bindInboxHandlers(container);
    selectedFiles.clear();

    container.innerHTML = `
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
                <h6 class="m-0 fw-bold"><i class="bi bi-pen me-1"></i>My Signatures</h6>
                <button type="button" id="sig-inbox-refresh" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>
            </div>
            <div class="card-body" id="sig-inbox-body">
                <div class="text-muted small">Loading…</div>
            </div>
        </div>`;

    await loadAndRender(container);
}

async function loadAndRender(container) {
    const body = container.querySelector('#sig-inbox-body');
    if (!body) return;
    const requests = await fetchMySignatureRequests();
    if (!requests || requests.length === 0) {
        body.innerHTML = '<div class="text-muted small py-2">No signature requests assigned to you.</div>';
        return;
    }
    body.innerHTML = requests.map(requestRow).join('');
}

function findRequest(id) {
    return (Array.isArray(state.mySignatureRequests) ? state.mySignatureRequests : []).find(
        r => String(r.id) === String(id)
    );
}

function bindInboxHandlers(container) {
    if (handlersBound) return;
    handlersBound = true;

    container.addEventListener('change', event => {
        const fileInput = event.target.closest('.sig-file-input');
        if (fileInput) {
            const id = fileInput.dataset.id;
            const file = fileInput.files && fileInput.files[0];
            if (file) selectedFiles.set(id, file);
            else selectedFiles.delete(id);
        }
    });

    container.addEventListener('click', async event => {
        const refreshBtn = event.target.closest('#sig-inbox-refresh');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            await loadAndRender(container);
            refreshBtn.disabled = false;
            return;
        }

        const previewBtn = event.target.closest('.sig-preview-btn');
        if (previewBtn) {
            const req = findRequest(previewBtn.dataset.id);
            if (!req) return;
            try {
                previewBtn.disabled = true;
                const url = await getDocumentPreviewUrl(req);
                if (url) window.open(url, '_blank');
                else await notify.warn('Document is not available to preview.');
            } catch (err) {
                await notify.error(`Could not open document: ${err?.message || String(err)}`);
            } finally {
                previewBtn.disabled = false;
            }
            return;
        }

        const signBtn = event.target.closest('.sig-sign-btn');
        if (signBtn) {
            const id = signBtn.dataset.id;
            const req = findRequest(id);
            if (!req) return;
            const file = selectedFiles.get(id);
            if (!file) {
                await notify.warn('Please choose a signature image first.');
                return;
            }
            try {
                signBtn.disabled = true;
                await notify.withLoading(
                    () => signSignatureRequest(req, file),
                    'Submitting Signature',
                    'Uploading your signature…'
                );
                selectedFiles.delete(id);
                await loadAndRender(container);
                await notify.success('Signature submitted.');
            } catch (err) {
                await notify.error(`Could not submit signature: ${err?.message || String(err)}`);
                signBtn.disabled = false;
            }
            return;
        }

        const declineBtn = event.target.closest('.sig-decline-btn');
        if (declineBtn) {
            const id = declineBtn.dataset.id;
            const req = findRequest(id);
            if (!req) return;
            const reason = await notify.input({
                title: 'Decline signature',
                inputLabel: 'Reason (optional)',
                input: 'text',
                confirmButtonText: 'Decline',
            });
            if (reason === null) return;
            try {
                await notify.withLoading(
                    () => declineSignatureRequest(req, reason),
                    'Declining',
                    'Updating request…'
                );
                await loadAndRender(container);
            } catch (err) {
                await notify.error(`Could not decline: ${err?.message || String(err)}`);
            }
            return;
        }

        const viewBtn = event.target.closest('.sig-view-btn');
        if (viewBtn) {
            const req = findRequest(viewBtn.dataset.id);
            if (!req) return;
            try {
                const url = await getSignatureImageUrl(req);
                if (url) window.open(url, '_blank');
            } catch (err) {
                await notify.error(`Could not open signature: ${err?.message || String(err)}`);
            }
        }
    });
}
