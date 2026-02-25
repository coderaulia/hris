// ==================================================
// AUTH MODULE — Supabase Authentication
// ==================================================

import { supabase } from '../lib/supabase.js';
import { state, emit } from '../lib/store.js';

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Fetch user profile from employees table by auth_id or email
    let profile = null;

    const { data: byAuthId } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_id', data.user.id)
        .maybeSingle();

    if (byAuthId) {
        profile = byAuthId;
    } else {
        // Fallback: find by email
        const { data: byEmail } = await supabase
            .from('employees')
            .select('*')
            .eq('auth_email', data.user.email)
            .maybeSingle();

        if (byEmail) {
            profile = byEmail;
            // Link auth_id for future logins
            await supabase.from('employees')
                .update({ auth_id: data.user.id })
                .eq('employee_id', byEmail.employee_id);
        }
    }

    // Determine role
    let role = 'employee';
    if (profile) {
        role = profile.role || 'employee';
    }

    state.currentUser = {
        id: profile?.employee_id || data.user.id,
        name: profile?.name || data.user.email.split('@')[0],
        email: data.user.email,
        role: role,
        auth_id: data.user.id,
        position: profile?.position || '',
        department: profile?.department || '',
        seniority: profile?.seniority || '',
    };

    sessionStorage.setItem('hr_user', JSON.stringify(state.currentUser));
    emit('auth:login', state.currentUser);
    return state.currentUser;
}

export async function signOut() {
    await supabase.auth.signOut();
    state.currentUser = null;
    sessionStorage.clear();
    emit('auth:logout');
    location.reload();
}

export async function restoreSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Try cached user first
    const saved = sessionStorage.getItem('hr_user');
    if (saved) {
        state.currentUser = JSON.parse(saved);
        emit('auth:login', state.currentUser);
        return state.currentUser;
    }

    // Refetch profile
    let profile = null;
    const { data: byAuthId } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_id', session.user.id)
        .maybeSingle();

    if (byAuthId) {
        profile = byAuthId;
    } else {
        const { data: byEmail } = await supabase
            .from('employees')
            .select('*')
            .eq('auth_email', session.user.email)
            .maybeSingle();
        if (byEmail) profile = byEmail;
    }

    let role = profile?.role || 'employee';

    state.currentUser = {
        id: profile?.employee_id || session.user.id,
        name: profile?.name || session.user.email.split('@')[0],
        email: session.user.email,
        role: role,
        auth_id: session.user.id,
        position: profile?.position || '',
        department: profile?.department || '',
        seniority: profile?.seniority || '',
    };

    sessionStorage.setItem('hr_user', JSON.stringify(state.currentUser));
    emit('auth:login', state.currentUser);
    return state.currentUser;
}

// Create a new Supabase auth user (superadmin only)
export async function createAuthUser(email, password) {
    // Use Supabase admin API via edge function, or signup
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
    return data;
}
