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
        listRecords: async (columns = '*') => {
            return await supabase.from('kpi_records').select(columns);
        },
        listWeightProfiles: async (columns = '*') => {
            return await supabase.from('kpi_weight_profiles').select(columns);
        },
        listWeightItems: async (columns = '*') => {
            return await supabase.from('kpi_weight_items').select(columns);
        },
        saveRecord: async (payload) => {
            return await supabase.from('kpi_records').upsert(payload);
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
            return await supabase.from('hr_document_templates').upsert(payload);
        },
        deleteTemplate: async (id) => {
            return await supabase.from('hr_document_templates').delete().eq('id', id);
        }
    }
};
