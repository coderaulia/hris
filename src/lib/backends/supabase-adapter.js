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
             // Supabase logic handles this via separate calls or RPC.
             // For consistency with Laravel, we'll keep it simple or use RPC if exists.
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
    }
};
