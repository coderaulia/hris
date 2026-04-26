import {
    state,
    emit,
    generateUuid,
    isMissingRelationError,
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
    fetchHrDocumentTemplates,
    fetchHrDocumentReferenceOptions,
    saveHrDocumentTemplate,
    deleteHrDocumentTemplate,
};
