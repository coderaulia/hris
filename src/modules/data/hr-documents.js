import {
    fetchOptionalCollection,
} from './runtime.js';

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

function fetchHrDocumentTemplates() {
    return fetchOptionalCollection({
        label: 'Fetch HR document templates',
        table: 'hr_document_templates',
        selectColumns: HR_DOCUMENT_TEMPLATE_COLUMNS,
        stateKey: 'hrDocumentTemplates',
        eventName: 'data:hrDocumentTemplates',
        orderBy: 'updated_at',
        ascending: false,
    });
}

function fetchHrDocumentReferenceOptions() {
    return fetchOptionalCollection({
        label: 'Fetch HR document reference options',
        table: 'hr_document_reference_options',
        selectColumns: HR_DOCUMENT_REFERENCE_OPTION_COLUMNS,
        stateKey: 'hrDocumentReferenceOptions',
        eventName: 'data:hrDocumentReferenceOptions',
        orderBy: 'sort_order',
        ascending: true,
    });
}

export {
    fetchHrDocumentTemplates,
    fetchHrDocumentReferenceOptions,
};
