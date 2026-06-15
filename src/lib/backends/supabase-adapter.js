import { supabase } from '../supabase.js';

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
    dashboard: {
        fetchSummary: async () => {
            return await supabase.from('dashboard_summary').select('*').maybeSingle();
        },
        fetchProbationExpiry: async (limit = 8) => {
            return await supabase
                .from('dashboard_probation_expiry')
                .select('employee_id,name,department,position,probation_end_date,days_remaining')
                .limit(limit);
        },
        fetchAssessmentCoverage: async () => {
            return await supabase
                .from('dashboard_assessment_coverage')
                .select('department,active_employee_count,covered_employee_count,missing_employee_count,coverage_pct')
                .order('coverage_pct', { ascending: true })
                .order('department', { ascending: true });
        },
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
        savePayrollRecords: async (payloads) => {
            return await supabase.from('hr_payroll_records').upsert(payloads, {
                onConflict: 'employee_id,payroll_period'
            }).select('*');
        },
        saveTemplate: async (payload) => {
            return await supabase
                .from('hr_document_templates')
                .upsert(payload)
                .select()
                .single();
        },
        deleteTemplate: async (id) => {
            return await supabase.from('hr_document_templates').delete().eq('id', id);
        },
        listArchive: async () => {
            return await supabase
                .from('hr_document_archive')
                .select('*')
                .order('generated_at', { ascending: false });
        },
        storeArchive: async (archiveRow, pdfBlob) => {
            const storagePath = `${archiveRow.employee_id}/${archiveRow.id}-${archiveRow.filename}`;
            const { error: uploadError } = await supabase.storage
                .from('hr-document-archive')
                .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false });
            if (uploadError) throw uploadError;
            return await supabase
                .from('hr_document_archive')
                .insert({ ...archiveRow, storage_path: storagePath })
                .select()
                .single();
        },
        deleteArchive: async (id, storagePath) => {
            if (storagePath) {
                await supabase.storage.from('hr-document-archive').remove([storagePath]);
            }
            return await supabase.from('hr_document_archive').delete().eq('id', id);
        },
        getSignedUrl: async (storagePath) => {
            return await supabase.storage
                .from('hr-document-archive')
                .createSignedUrl(storagePath, 3600);
        },
        listSignatureRequests: async (archiveId) => {
            return await supabase
                .from('document_signature_requests')
                .select('*')
                .eq('archive_id', archiveId)
                .order('created_at', { ascending: true });
        },
        listMySignatureRequests: async (signerEmployeeId) => {
            return await supabase
                .from('document_signature_requests')
                .select('*')
                .eq('signer_employee_id', signerEmployeeId)
                .order('created_at', { ascending: false });
        },
        createSignatureRequests: async (rows) => {
            return await supabase
                .from('document_signature_requests')
                .insert(rows)
                .select('*');
        },
        updateSignatureRequest: async (id, patch, signatureBlob, storagePath) => {
            const nextPatch = { ...patch, updated_at: new Date().toISOString() };
            if (signatureBlob && storagePath) {
                const { error: uploadError } = await supabase.storage
                    .from('document-signatures')
                    .upload(storagePath, signatureBlob, { upsert: true });
                if (uploadError) throw uploadError;
                nextPatch.signature_storage_path = storagePath;
            }
            return await supabase
                .from('document_signature_requests')
                .update(nextPatch)
                .eq('id', id)
                .select()
                .single();
        },
        deleteSignatureRequest: async (id, storagePath) => {
            if (storagePath) {
                await supabase.storage.from('document-signatures').remove([storagePath]);
            }
            return await supabase
                .from('document_signature_requests')
                .delete()
                .eq('id', id);
        },
        getSignatureSignedUrl: async (storagePath) => {
            return await supabase.storage
                .from('document-signatures')
                .createSignedUrl(storagePath, 3600);
        },
    },
    attendance: {
        listWorkSites: async () => {
            return await supabase
                .from('attendance_work_sites')
                .select('*')
                .order('name', { ascending: true });
        },
        upsertWorkSite: async (payload) => {
            return await supabase
                .from('attendance_work_sites')
                .upsert(payload)
                .select()
                .single();
        },
        deleteWorkSite: async (id) => {
            return await supabase.from('attendance_work_sites').delete().eq('id', id);
        },
        listMyAttendance: async (employeeId, { from, to } = {}) => {
            let query = supabase
                .from('attendance_records')
                .select('*')
                .eq('employee_id', employeeId)
                .order('event_time', { ascending: false });
            if (from) query = query.gte('event_time', from);
            if (to) query = query.lte('event_time', to);
            return await query;
        },
        listAttendance: async ({ from, to, employeeId } = {}) => {
            let query = supabase
                .from('attendance_records')
                .select('*')
                .order('event_time', { ascending: false });
            if (employeeId) query = query.eq('employee_id', employeeId);
            if (from) query = query.gte('event_time', from);
            if (to) query = query.lte('event_time', to);
            return await query;
        },
        recordEvent: async (row, photoBlob, storagePath) => {
            const payload = { ...row };
            if (photoBlob && storagePath) {
                const { error: uploadError } = await supabase.storage
                    .from('attendance-photos')
                    .upload(storagePath, photoBlob, { contentType: 'image/jpeg', upsert: false });
                if (uploadError) throw uploadError;
                payload.photo_storage_path = storagePath;
            }
            return await supabase
                .from('attendance_records')
                .insert(payload)
                .select()
                .single();
        },
        updateRecord: async (id, patch) => {
            return await supabase
                .from('attendance_records')
                .update(patch)
                .eq('id', id)
                .select()
                .single();
        },
        deleteRecord: async (id, storagePath) => {
            if (storagePath) {
                await supabase.storage.from('attendance-photos').remove([storagePath]);
            }
            return await supabase.from('attendance_records').delete().eq('id', id);
        },
        getPhotoUrl: async (storagePath) => {
            return await supabase.storage
                .from('attendance-photos')
                .createSignedUrl(storagePath, 3600);
        },
    },
    leave: {
        listLeaveTypes: async () => {
            return await supabase
                .from('leave_types')
                .select('*')
                .eq('active', true)
                .order('name_id', { ascending: true });
        },
        upsertLeaveType: async (payload) => {
            return await supabase
                .from('leave_types')
                .upsert(payload)
                .select()
                .single();
        },
        listMyLeave: async (employeeId, filters = {}) => {
            let query = supabase
                .from('leave_requests')
                .select('*, leave_types(code, name_id, name_en, is_paid)')
                .eq('employee_id', employeeId)
                .order('created_at', { ascending: false });
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.year) {
                query = query
                    .gte('start_date', `${filters.year}-01-01`)
                    .lte('end_date', `${filters.year}-12-31`);
            }
            return await query;
        },
        listLeaveRequests: async (filters = {}) => {
            let query = supabase
                .from('leave_requests')
                .select('*, leave_types(code, name_id, name_en, is_paid)')
                .order('created_at', { ascending: false });
            if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.leaveTypeId) query = query.eq('leave_type_id', filters.leaveTypeId);
            if (filters.from) query = query.gte('start_date', filters.from);
            if (filters.to) query = query.lte('end_date', filters.to);
            return await query;
        },
        createLeaveRequest: async (row, attachmentBlob, storagePath) => {
            const payload = { ...row };
            if (attachmentBlob && storagePath) {
                const { error: uploadError } = await supabase.storage
                    .from('leave-attachments')
                    .upload(storagePath, attachmentBlob, { upsert: false });
                if (uploadError) throw uploadError;
                payload.attachment_storage_path = storagePath;
            }
            return await supabase
                .from('leave_requests')
                .insert(payload)
                .select('*, leave_types(code, name_id, name_en, is_paid)')
                .single();
        },
        decideLeaveRequest: async (id, patch) => {
            return await supabase
                .from('leave_requests')
                .update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select('*, leave_types(code, name_id, name_en, is_paid)')
                .single();
        },
        cancelLeaveRequest: async (id) => {
            return await supabase
                .from('leave_requests')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
        },
        listMyBalances: async (employeeId, year) => {
            let query = supabase
                .from('leave_balance_overview')
                .select('*')
                .eq('employee_id', employeeId);
            if (year) query = query.eq('year', year);
            return await query;
        },
        listBalances: async (filters = {}) => {
            let query = supabase
                .from('leave_balance_overview')
                .select('*');
            if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
            if (filters.year) query = query.eq('year', filters.year);
            return await query;
        },
        upsertBalance: async (payload) => {
            return await supabase
                .from('leave_balances')
                .upsert(payload)
                .select()
                .single();
        },
        applyBalanceDelta: async (employeeId, leaveTypeId, year, delta) => {
            return await supabase.rpc('apply_leave_balance_delta', {
                p_employee_id:   employeeId,
                p_leave_type_id: leaveTypeId,
                p_year:          year,
                p_delta:         delta,
            });
        },
        getLeaveAttachmentUrl: async (storagePath) => {
            return await supabase.storage
                .from('leave-attachments')
                .createSignedUrl(storagePath, 3600);
        },
    },
};
