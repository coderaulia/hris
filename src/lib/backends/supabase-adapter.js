import { supabase } from '../supabase.js';

const HR_DOCUMENT_ARCHIVE_BUCKET = import.meta.env.VITE_HR_DOCUMENT_ARCHIVE_BUCKET || 'hr-document-archives';

export const supabaseAdapter = {
    auth: {
        signIn: async (email, password) => {
            return await supabase.auth.signInWithPassword({ email, password });
        },
        signOut: async () => {
            return await supabase.auth.signOut();
        },
        getSession: async () => {
            return await supabase.auth.getSession();
        },
        onAuthStateChange: (callback) => {
            return supabase.auth.onAuthStateChange(callback);
        }
    },
    settings: {
        list: async () => {
            return await supabase.from('app_settings').select('*');
        },
        update: async (key, value) => {
            return await supabase.from('app_settings').update({ value }).eq('key', key);
        }
    },
    employees: {
        list: async () => {
            return await supabase.from('employees').select('*');
        },
        get: async (id) => {
            return await supabase.from('employees').select('*').eq('employee_id', id).single();
        },
        create: async (data) => {
            return await supabase.from('employees').insert(data).select().single();
        },
        update: async (id, data) => {
            return await supabase.from('employees').update(data).eq('employee_id', id).select().single();
        },
        delete: async (id) => {
            return await supabase.from('employees').delete().eq('employee_id', id);
        }
    },
    assessments: {
        list: async (columns = '*') => {
            return await supabase.from('employee_assessments').select(columns);
        },
        listScores: async (columns = '*') => {
            return await supabase.from('employee_assessment_scores').select(columns);
        },
        listHistory: async (columns = '*') => {
            return await supabase.from('employee_assessment_history').select(columns);
        },
        save: async (payload) => {
             return await supabase.from('employee_assessments').upsert(payload);
        }
    },
    training: {
        list: async (columns = '*') => {
            return await supabase.from('employee_training_records').select(columns);
        },
        create: async (data) => {
            return await supabase.from('employee_training_records').insert(data).select().single();
        },
        update: async (id, data) => {
            return await supabase.from('employee_training_records').update(data).eq('id', id).select().single();
        },
        delete: async (id) => {
            return await supabase.from('employee_training_records').delete().eq('id', id);
        }
    },
    kpis: {
        list: async (columns = '*') => {
            return await supabase.from('kpi_definitions').select(columns);
        },
        saveDefinition: async (payload) => {
            return await supabase
                .from('kpi_definitions')
                .upsert(payload, { onConflict: 'id' })
                .select()
                .single();
        },
        deleteDefinition: async (id) => {
            return await supabase.from('kpi_definitions').delete().eq('id', id);
        },
        listDefinitionVersions: async (columns = '*') => {
            return await supabase.from('kpi_definition_versions').select(columns);
        },
        saveDefinitionVersion: async (payload) => {
            const query = payload?.id
                ? supabase.from('kpi_definition_versions').upsert(payload, { onConflict: 'id' })
                : supabase.from('kpi_definition_versions').insert(payload);

            return await query.select().single();
        },
        updateDefinitionVersion: async (id, payload) => {
            return await supabase
                .from('kpi_definition_versions')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
        },
        listTargetVersions: async (columns = '*') => {
            return await supabase.from('employee_kpi_target_versions').select(columns);
        },
        saveTargetVersion: async (payload) => {
            return await supabase
                .from('employee_kpi_target_versions')
                .insert(payload)
                .select()
                .single();
        },
        updateTargetVersion: async (id, payload) => {
            return await supabase
                .from('employee_kpi_target_versions')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
        },
        listRecords: async (columns = '*') => {
            return await supabase.from('kpi_records').select(columns);
        },
        listWeightProfiles: async (columns = '*') => {
            return await supabase.from('kpi_weight_profiles').select(columns);
        },
        listWeightItems: async (columns = '*') => {
            return await supabase.from('kpi_weight_items').select(columns);
        },
        saveWeightProfile: async (payload) => {
            return await supabase
                .from('kpi_weight_profiles')
                .upsert(payload, { onConflict: 'id' })
                .select()
                .single();
        },
        saveWeightItems: async (_profileId, payload) => {
            return await supabase
                .from('kpi_weight_items')
                .upsert(payload, { onConflict: 'profile_id,kpi_id' })
                .select();
        },
        saveRecord: async (payload) => {
            return await supabase
                .from('kpi_records')
                .upsert(payload, { onConflict: 'id' })
                .select()
                .single();
        },
        deleteRecord: async (id) => {
            return await supabase.from('kpi_records').delete().eq('id', id);
        }
    },
    scores: {
        list: async (columns = '*') => {
            return await supabase.from('employee_performance_scores').select(columns);
        },
        save: async (payload) => {
            return await supabase.from('employee_performance_scores').upsert(payload);
        }
    },
    config: {
        listCompetencies: async () => {
            return await supabase.from('competency_config').select('*');
        },
        saveCompetencies: async (position, competencies) => {
            return await supabase.from('competency_config').upsert({ position_name: position, competencies });
        }
    },
    activity: {
        list: async () => {
            return await supabase.from('admin_activity_log').select('*').order('created_at', { ascending: false }).limit(100);
        },
        log: async (payload) => {
            return await supabase.from('admin_activity_log').insert(payload);
        }
    },
    manpower: {
        listPlans: async () => {
            return await supabase.from('manpower_plan_overview').select('*');
        },
        listRequests: async () => {
            return await supabase.from('headcount_request_overview').select('*');
        },
        listPipeline: async () => {
            return await supabase.from('recruitment_pipeline_overview').select('*');
        },
        savePlan: async (payload) => {
            return await supabase.from('manpower_plans').upsert(payload);
        },
        saveRequest: async (payload) => {
            return await supabase.from('headcount_requests').upsert(payload);
        },
        savePipeline: async (payload) => {
            return await supabase.from('recruitment_pipeline').upsert(payload);
        },
        deletePipeline: async (id) => {
            return await supabase.from('recruitment_pipeline').delete().eq('id', id);
        }
    },
    probation: {
        listReviews: async () => {
            return await supabase.from('probation_reviews').select('*');
        },
        listMonthlyScores: async () => {
            return await supabase.from('probation_monthly_scores').select('*');
        },
        listAttendance: async () => {
            return await supabase.from('probation_attendance_records').select('*');
        },
        saveReview: async (payload) => {
            return await supabase.from('probation_reviews').upsert(payload);
        },
        saveMonthlyScore: async (payload) => {
            return await supabase.from('probation_monthly_scores').upsert(payload);
        },
        saveAttendance: async (payload) => {
            return await supabase.from('probation_attendance_records').upsert(payload);
        }
    },
    pip: {
        listPlans: async () => {
            return await supabase.from('pip_plans').select('*');
        },
        listActions: async () => {
            return await supabase.from('pip_actions').select('*');
        },
        savePlan: async (payload) => {
            return await supabase.from('pip_plans').upsert(payload);
        },
        saveAction: async (payload) => {
            return await supabase.from('pip_actions').upsert(payload);
        }
    },
    documents: {
        listTemplates: async () => {
            return await supabase.from('hr_document_templates').select('*');
        },
        listOptions: async () => {
            return await supabase.from('hr_document_reference_options').select('*');
        },
        listPayrollRecords: async () => {
            return await supabase.from('hr_payroll_records').select('*');
        },
        listArchives: async () => {
            return await supabase
                .from('hr_document_archives')
                .select('*')
                .order('generated_at', { ascending: false })
                .limit(100);
        },
        savePayrollRecords: async (payloads) => {
            return await supabase.from('hr_payroll_records').upsert(payloads, {
                onConflict: 'employee_id,payroll_period'
            }).select('*');
        },
        saveTemplate: async (payload) => {
            return await supabase.from('hr_document_templates').upsert(payload);
        },
        deleteTemplate: async (id) => {
            return await supabase.from('hr_document_templates').delete().eq('id', id);
        },
        saveArchive: async (payload) => {
            return await supabase
                .from('hr_document_archives')
                .upsert(payload, { onConflict: 'id' })
                .select()
                .single();
        },
        uploadArchiveFile: async (_id, payload = {}) => {
            const file = payload.file;
            if (!file) return { data: null, error: new Error('Archive file is required.') };

            const path = String(payload.path || '').trim();
            if (!path) return { data: null, error: new Error('Archive storage path is required.') };

            const { data, error } = await supabase.storage
                .from(HR_DOCUMENT_ARCHIVE_BUCKET)
                .upload(path, file, {
                    contentType: payload.contentType || 'application/pdf',
                    upsert: true,
                });

            if (error) return { data: null, error };

            return {
                data: {
                    ...data,
                    storage_path: data?.path || path,
                    file_size_bytes: file.size || 0,
                },
                error: null,
            };
        },
        signArchive: async (id, payload) => {
            const { data: current, error: fetchError } = await supabase
                .from('hr_document_archives')
                .select('*')
                .eq('id', id)
                .single();
            if (fetchError) return { data: null, error: fetchError };

            const now = new Date().toISOString();
            const update = {
                signature_note: payload?.note || current.signature_note || null,
            };

            if (payload?.decision === 'rejected') {
                update.signature_status = 'rejected';
            } else if (payload?.signer_type === 'company') {
                update.company_signed_at = now;
            } else {
                update.recipient_signed_at = now;
            }

            if (payload?.decision === 'signed') {
                const companySigned = Boolean(update.company_signed_at || current.company_signed_at);
                const recipientSigned = !current.requires_recipient_signature || Boolean(update.recipient_signed_at || current.recipient_signed_at);
                update.signature_status = companySigned && recipientSigned ? 'signed' : 'pending_signature';
            }

            return await supabase
                .from('hr_document_archives')
                .update(update)
                .eq('id', id)
                .select()
                .single();
        }
    }
};
