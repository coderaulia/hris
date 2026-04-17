import {
    supabase,
    state,
    emit,
    execSupabase,
    fetchOptionalCollection,
    generateUuid,
    isMissingRelationError,
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
        const { data } = await execSupabase(
            `Save HR document template "${payload.template_name}"`,
            () =>
                supabase
                    .from('hr_document_templates')
                    .upsert(payload, { onConflict: 'id' })
                    .select(HR_DOCUMENT_TEMPLATE_COLUMNS)
                    .single(),
            { interactiveRetry: true, retries: 1 }
        );

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
        if (isMissingRelationError(error)) {
            const migrationError = new Error(
                'The hr_document_templates table is not available yet. Run the HR document foundation migration first.'
            );
            migrationError.code = 'HR_DOCUMENT_TEMPLATES_MISSING';
            throw migrationError;
        }
        throw error;
    }
}

async function deleteHrDocumentTemplate(templateId) {
    const id = String(templateId || '').trim();
    if (!id) return;

    try {
        await execSupabase(
            `Delete HR document template "${id}"`,
            () => supabase.from('hr_document_templates').delete().eq('id', id),
            { interactiveRetry: true, retries: 1 }
        );

        state.hrDocumentTemplates = (Array.isArray(state.hrDocumentTemplates)
            ? state.hrDocumentTemplates
            : []
        ).filter(item => String(item?.id || '') !== id);
        emit('data:hrDocumentTemplates', state.hrDocumentTemplates);
    } catch (error) {
        if (isMissingRelationError(error)) {
            const migrationError = new Error(
                'The hr_document_templates table is not available yet. Run the HR document foundation migration first.'
            );
            migrationError.code = 'HR_DOCUMENT_TEMPLATES_MISSING';
            throw migrationError;
        }
        throw error;
    }
}

export {
    fetchHrDocumentTemplates,
    fetchHrDocumentReferenceOptions,
    saveHrDocumentTemplate,
    deleteHrDocumentTemplate,
};
