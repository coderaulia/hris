import {
    state,
    emit,
    generateUuid,
    isMissingRelationError,
    debugError,
} from './runtime.js';
import { backend } from '../../lib/backend.js';

const HR_DOCUMENT_TEMPLATE_COLUMNS = [
    'id',
    'document_type',
    'locale',
    'contract_type',
    'template_name',
    'template_status',
    'version_no',
    'header_json',
    'body_json',
    'body_markup',
    'signature_config_json',
    'field_schema_json',
    'is_default',
    'created_at',
    'updated_at',
].join(',');

const HR_DOCUMENT_REFERENCE_OPTION_COLUMNS = [
    'id',
    'group_key',
    'option_key',
    'option_label',
    'option_value',
    'sort_order',
    'is_active',
    'metadata_json',
    'created_at',
    'updated_at',
].join(',');

async function fetchHrDocumentTemplates() {
    try {
        const { data, error } = await backend.documents.listTemplates();
        if (error) throw error;
        state.hrDocumentTemplates = data || [];
        emit('data:hrDocumentTemplates', state.hrDocumentTemplates);
        return state.hrDocumentTemplates;
    } catch (error) {
        debugError('Fetch HR document templates error:', error);
        return [];
    }
}

async function fetchHrDocumentReferenceOptions() {
    try {
        const { data, error } = await backend.documents.listOptions();
        if (error) throw error;
        state.hrDocumentReferenceOptions = data || [];
        emit('data:hrDocumentReferenceOptions', state.hrDocumentReferenceOptions);
        return state.hrDocumentReferenceOptions;
    } catch (error) {
        debugError('Fetch HR document reference options error:', error);
        return [];
    }
}

async function fetchHrPayrollRecords() {
    try {
        const { data, error } = await backend.documents.listPayrollRecords();
        if (error) throw error;
        state.hrPayrollRecords = data || [];
        emit('data:hrPayrollRecords', state.hrPayrollRecords);
        return state.hrPayrollRecords;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch HR payroll records error:', error);
        }
        state.hrPayrollRecords = [];
        emit('data:hrPayrollRecords', state.hrPayrollRecords);
        return [];
    }
}

async function fetchHrDocumentArchives() {
    try {
        const { data, error } = await backend.documents.listArchives();
        if (error) throw error;
        state.hrDocumentArchives = data || [];
        emit('data:hrDocumentArchives', state.hrDocumentArchives);
        return state.hrDocumentArchives;
    } catch (error) {
        if (!isMissingRelationError(error)) {
            debugError('Fetch HR document archives error:', error);
        }
        state.hrDocumentArchives = [];
        emit('data:hrDocumentArchives', state.hrDocumentArchives);
        return [];
    }
}

async function saveHrPayrollRecords(records = []) {
    const payloads = (Array.isArray(records) ? records : [])
        .map(record => {
            const payload = {
                employee_id: String(record?.employee_id || '').trim(),
                payroll_period: String(record?.payroll_period || '').trim(),
                payroll_cutoff_start: String(record?.payroll_cutoff_start || '').trim() || null,
                payroll_cutoff_end: String(record?.payroll_cutoff_end || '').trim() || null,
                grade_level: String(record?.grade_level || '').trim() || null,
                ptkp: String(record?.ptkp || '').trim() || null,
                npwp: String(record?.npwp || '').trim() || null,
                nik_number: String(record?.nik_number || '').trim() || null,
                job_position: String(record?.job_position || '').trim() || null,
                organization: String(record?.organization || '').trim() || null,
                basic_salary: Number(record?.basic_salary || 0),
                overtime: Number(record?.overtime || 0),
                commission: Number(record?.commission || 0),
                bonus: Number(record?.bonus || 0),
                pph21: Number(record?.pph21 || 0),
                bpjs_kes: Number(record?.bpjs_kes || 0),
                bpjs_tk: Number(record?.bpjs_tk || 0),
                other_deduction: Number(record?.other_deduction || 0),
                bpjs_kes_company: Number(record?.bpjs_kes_company || 0),
                bpjs_tk_company: Number(record?.bpjs_tk_company || 0),
                notes: String(record?.notes || '').trim() || null,
            };
            if (record?.id) payload.id = String(record.id);
            return payload;
        })
        .filter(record => record.employee_id && record.payroll_period);

    if (payloads.length === 0) return [];

    const { data, error } = await backend.documents.savePayrollRecords(payloads);
    if (error) throw error;

    const saved = Array.isArray(data) ? data : payloads;
    const nextRecords = [
        ...(Array.isArray(state.hrPayrollRecords) ? state.hrPayrollRecords : []),
    ];
    saved.forEach(record => {
        const index = nextRecords.findIndex(item =>
            String(item?.employee_id || '') === String(record?.employee_id || '') &&
            String(item?.payroll_period || '') === String(record?.payroll_period || '')
        );
        if (index >= 0) nextRecords[index] = record;
        else nextRecords.push(record);
    });

    state.hrPayrollRecords = nextRecords.sort((a, b) =>
        String(b?.payroll_period || '').localeCompare(String(a?.payroll_period || '')) ||
        String(a?.employee_id || '').localeCompare(String(b?.employee_id || ''))
    );
    emit('data:hrPayrollRecords', state.hrPayrollRecords);
    return saved;
}

async function saveHrDocumentArchive(archive = {}) {
    const payload = {
        id: String(archive?.id || generateUuid()),
        document_type: String(archive?.document_type || '').trim(),
        employee_id: String(archive?.employee_id || '').trim() || null,
        subject_name: String(archive?.subject_name || '').trim(),
        subject_mode: String(archive?.subject_mode || 'employee').trim() || 'employee',
        template_id: String(archive?.template_id || '').trim() || null,
        filename: String(archive?.filename || '').trim(),
        mime_type: String(archive?.mime_type || 'application/pdf').trim() || 'application/pdf',
        file_size_bytes: Math.max(0, Math.round(Number(archive?.file_size_bytes || 0))),
        storage_status: String(archive?.storage_status || 'metadata_only').trim() || 'metadata_only',
        storage_path: String(archive?.storage_path || '').trim() || null,
        generated_by: String(archive?.generated_by || state.currentUser?.id || '').trim() || null,
        generated_at: archive?.generated_at || new Date().toISOString(),
        signer_id: String(archive?.signer_id || '').trim() || null,
        signer_title: String(archive?.signer_title || '').trim() || null,
        recipient_signer_id: String(archive?.recipient_signer_id || '').trim() || null,
        requires_recipient_signature: Boolean(archive?.requires_recipient_signature),
        signature_status: String(archive?.signature_status || 'pending_signature').trim() || 'pending_signature',
        signature_note: String(archive?.signature_note || '').trim() || null,
        document_payload_json:
            archive?.document_payload_json && typeof archive.document_payload_json === 'object'
                ? archive.document_payload_json
                : {},
    };

    if (!payload.document_type || !payload.subject_name || !payload.filename) return null;

    const { data, error } = await backend.documents.saveArchive(payload);
    if (error) throw error;

    const saved = data || payload;
    const nextArchives = [
        saved,
        ...(Array.isArray(state.hrDocumentArchives) ? state.hrDocumentArchives : []).filter(
            item => String(item?.id || '') !== String(saved?.id || payload.id)
        ),
    ].sort((a, b) =>
        String(b?.generated_at || b?.created_at || '').localeCompare(String(a?.generated_at || a?.created_at || ''))
    );

    state.hrDocumentArchives = nextArchives;
    emit('data:hrDocumentArchives', state.hrDocumentArchives);
    return saved;
}

async function signHrDocumentArchive(archiveId, payload = {}) {
    const id = String(archiveId || '').trim();
    if (!id) return null;

    const { data, error } = await backend.documents.signArchive(id, {
        signer_type: String(payload?.signer_type || 'company').trim(),
        decision: String(payload?.decision || 'signed').trim(),
        note: String(payload?.note || '').trim() || null,
    });
    if (error) throw error;

    const saved = data || null;
    if (saved) {
        state.hrDocumentArchives = (Array.isArray(state.hrDocumentArchives)
            ? state.hrDocumentArchives
            : []
        ).map(item => String(item?.id || '') === id ? saved : item);
        emit('data:hrDocumentArchives', state.hrDocumentArchives);
    }
    return saved;
}

async function saveHrDocumentTemplate(template = {}) {
    const payload = {
        id: String(template?.id || generateUuid()),
        document_type: String(template?.document_type || '').trim(),
        locale: String(template?.locale || 'id-ID').trim() || 'id-ID',
        contract_type: String(template?.contract_type || '').trim() || null,
        template_name: String(template?.template_name || '').trim() || 'Untitled Template',
        template_status: String(template?.template_status || 'active').trim() || 'active',
        version_no: Math.max(1, Number(template?.version_no || 1)),
        header_json:
            template?.header_json && typeof template.header_json === 'object'
                ? template.header_json
                : {},
        body_json: Array.isArray(template?.body_json) ? template.body_json : [],
        body_markup: String(template?.body_markup || '').trim() || null,
        signature_config_json:
            template?.signature_config_json &&
            typeof template.signature_config_json === 'object'
                ? template.signature_config_json
                : {},
        field_schema_json:
            template?.field_schema_json && typeof template.field_schema_json === 'object'
                ? template.field_schema_json
                : {},
        is_default: Boolean(template?.is_default),
    };

    try {
        const { data, error } = await backend.documents.saveTemplate(payload);
        if (error) throw error;

        const nextTemplates = [
            ...(Array.isArray(state.hrDocumentTemplates) ? state.hrDocumentTemplates : []).filter(
                item => String(item?.id || '') !== payload.id
            ),
            data,
        ].sort((a, b) =>
            String(b?.updated_at || '').localeCompare(String(a?.updated_at || ''))
        );

        state.hrDocumentTemplates = nextTemplates;
        emit('data:hrDocumentTemplates', state.hrDocumentTemplates);
        return data;
    } catch (error) {
        throw error;
    }
}

async function deleteHrDocumentTemplate(templateId) {
    const id = String(templateId || '').trim();
    if (!id) return;

    try {
        const { error } = await backend.documents.deleteTemplate(id);
        if (error) throw error;

        state.hrDocumentTemplates = (Array.isArray(state.hrDocumentTemplates)
            ? state.hrDocumentTemplates
            : []
        ).filter(item => String(item?.id || '') !== id);
        emit('data:hrDocumentTemplates', state.hrDocumentTemplates);
    } catch (error) {
        throw error;
    }
}

export {
    fetchHrDocumentArchives,
    fetchHrDocumentTemplates,
    fetchHrDocumentReferenceOptions,
    fetchHrPayrollRecords,
    saveHrPayrollRecords,
    saveHrDocumentArchive,
    saveHrDocumentTemplate,
    signHrDocumentArchive,
    deleteHrDocumentTemplate,
};
