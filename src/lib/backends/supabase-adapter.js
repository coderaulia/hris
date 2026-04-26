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
    }
    // Phase 2 will add more domains here
};
