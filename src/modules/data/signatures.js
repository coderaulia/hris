import {
    state,
    emit,
    isMissingRelationError,
    debugError,
} from './runtime.js';
import { backend } from '../../lib/backend.js';

const VALID_SIGNER_ROLES = new Set(['employee', 'manager', 'hr']);

function currentEmployeeId() {
    return String(state.currentUser?.id || '').trim();
}

async function fetchSignatureRequests(archiveId) {
    const id = String(archiveId || '').trim();
    if (!id) return [];
    try {
        const { data, error } = await backend.documents.listSignatureRequests(id);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch signature requests error:', error);
        }
        return [];
    }
}

async function fetchMySignatureRequests() {
    const signerId = currentEmployeeId();
    if (!signerId) {
        state.mySignatureRequests = [];
        emit('data:mySignatureRequests', state.mySignatureRequests);
        return [];
    }
    try {
        const { data, error } = await backend.documents.listMySignatureRequests(signerId);
        if (error) throw error;
        state.mySignatureRequests = Array.isArray(data) ? data : [];
        emit('data:mySignatureRequests', state.mySignatureRequests);
        return state.mySignatureRequests;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch my signature requests error:', error);
        }
        state.mySignatureRequests = [];
        emit('data:mySignatureRequests', state.mySignatureRequests);
        return [];
    }
}

async function createSignatureRequests(archive, signers = []) {
    const archiveId = String(archive?.id || '').trim();
    if (!archiveId) throw new Error('Archive id is required to request signatures');

    const documentContext = {
        document_filename: String(archive?.filename || '').trim() || null,
        document_type: String(archive?.document_type || '').trim() || null,
        employee_name:
            String(archive?.metadata?.employee_name || archive?.employee_id || '').trim() || null,
        archive_storage_path: String(archive?.storage_path || '').trim() || null,
    };

    const rows = (Array.isArray(signers) ? signers : [])
        .map(signer => {
            const signerEmployeeId = String(signer?.signer_employee_id || '').trim();
            const role = String(signer?.signer_role || 'employee').trim();
            return {
                archive_id: archiveId,
                signer_employee_id: signerEmployeeId,
                signer_role: VALID_SIGNER_ROLES.has(role) ? role : 'employee',
                status: 'pending',
                created_by: currentEmployeeId() || null,
                ...documentContext,
            };
        })
        .filter(row => row.signer_employee_id);

    if (rows.length === 0) return [];

    const { data, error } = await backend.documents.createSignatureRequests(rows);
    if (error) throw error;
    return Array.isArray(data) ? data : rows;
}

async function signSignatureRequest(request, imageBlob) {
    const id = String(request?.id || '').trim();
    const signerId = String(request?.signer_employee_id || '').trim();
    if (!id || !signerId) throw new Error('Signature request is invalid');
    if (!imageBlob) throw new Error('A signature image is required');

    const storagePath = `${signerId}/${id}.png`;
    const patch = {
        status: 'signed',
        signature_type: 'uploaded',
        signed_at: new Date().toISOString(),
        decline_reason: null,
    };

    const { data, error } = await backend.documents.updateSignatureRequest(
        id,
        patch,
        imageBlob,
        storagePath
    );
    if (error) throw error;

    const saved = data || { ...request, ...patch, signature_storage_path: storagePath };
    replaceMyRequest(saved);
    return saved;
}

async function declineSignatureRequest(request, reason = '') {
    const id = String(request?.id || '').trim();
    if (!id) throw new Error('Signature request is invalid');

    const patch = {
        status: 'declined',
        decline_reason: String(reason || '').trim() || null,
        signed_at: null,
    };

    const { data, error } = await backend.documents.updateSignatureRequest(id, patch);
    if (error) throw error;

    const saved = data || { ...request, ...patch };
    replaceMyRequest(saved);
    return saved;
}

async function deleteSignatureRequest(request) {
    const id = String(request?.id || '').trim();
    if (!id) return;
    const { error } = await backend.documents.deleteSignatureRequest(
        id,
        request?.signature_storage_path || null
    );
    if (error) throw error;
    state.mySignatureRequests = (Array.isArray(state.mySignatureRequests)
        ? state.mySignatureRequests
        : []
    ).filter(item => String(item?.id || '') !== id);
    emit('data:mySignatureRequests', state.mySignatureRequests);
}

async function getSignatureImageUrl(request) {
    if (!request?.signature_storage_path) return null;
    const { data, error } = await backend.documents.getSignatureSignedUrl(
        request.signature_storage_path
    );
    if (error) throw error;
    return data?.signedUrl || null;
}

async function getDocumentPreviewUrl(request) {
    if (!request?.archive_storage_path) return null;
    const { data, error } = await backend.documents.getSignedUrl(
        request.archive_storage_path
    );
    if (error) throw error;
    return data?.signedUrl || null;
}

function replaceMyRequest(saved) {
    const id = String(saved?.id || '').trim();
    if (!id) return;
    const list = Array.isArray(state.mySignatureRequests) ? state.mySignatureRequests : [];
    const index = list.findIndex(item => String(item?.id || '') === id);
    if (index >= 0) {
        const next = [...list];
        next[index] = saved;
        state.mySignatureRequests = next;
        emit('data:mySignatureRequests', state.mySignatureRequests);
    }
}

export {
    fetchSignatureRequests,
    fetchMySignatureRequests,
    createSignatureRequests,
    signSignatureRequest,
    declineSignatureRequest,
    deleteSignatureRequest,
    getSignatureImageUrl,
    getDocumentPreviewUrl,
};
