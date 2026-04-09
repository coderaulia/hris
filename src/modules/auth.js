// ==================================================
// AUTH MODULE — Supabase Authentication
// ==================================================

import { supabase } from '../lib/supabase.js';
import { normalizeAuthCallback } from '../lib/edge/auth.js';
import { state, emit } from '../lib/store.js';
import * as notify from '../lib/notify.js';

const PROFILE_RESOLUTION_RETRY_MS = 250;
const PROFILE_RESOLUTION_MAX_ATTEMPTS = 3;

function getHashParams() {
    const hash = String(window.location.hash || '').replace(/^#/, '');
    return new URLSearchParams(hash);
}

export function isRecoveryMode() {
    const searchParams = new URLSearchParams(window.location.search || '');
    if (searchParams.get('recovery') === '1') return true;
    const params = getHashParams();
    return params.get('type') === 'recovery';
}

export function clearAuthHash() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('auth_callback');
    history.replaceState(null, '', `${url.pathname}${url.search}`);
}

async function findProfileByAuthUser(user) {
    let profile = null;

    const { data: byAuthId } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_id', user.id)
        .maybeSingle();

    if (byAuthId) {
        profile = byAuthId;
    } else {
        const normalizedEmail = String(user?.email || '').trim();
        if (!normalizedEmail) return null;

        const { data: byEmail } = await supabase
            .from('employees')
            .select('*')
            .ilike('auth_email', normalizedEmail)
            .maybeSingle();

        if (byEmail) {
            if (byEmail.auth_id && byEmail.auth_id !== user.id) {
                throw new Error('This email is already linked to another auth account. Contact administrator.');
            }
            profile = byEmail;
            if (!byEmail.auth_id) {
                await supabase.from('employees')
                    .update({ auth_id: user.id })
                    .eq('employee_id', byEmail.employee_id);
            }
        }
    }

    return profile;
}

function buildCurrentUser(profile, authUser) {
    const role = profile?.role || 'employee';
    return {
        id: profile?.employee_id || authUser.id,
        name: profile?.name || authUser.email.split('@')[0],
        email: authUser.email,
        role,
        auth_id: authUser.id,
        position: profile?.position || '',
        department: profile?.department || '',
        seniority: profile?.seniority || '',
        must_change_password: Boolean(profile?.must_change_password),
        reauthenticated_at: Date.now(),
    };
}

function setCurrentUser(profile, authUser, options = {}) {
    state.currentUser = buildCurrentUser(profile, authUser);
    if (options.persist !== false) {
        sessionStorage.setItem('hr_user', JSON.stringify(state.currentUser));
    }
    emit('auth:login', state.currentUser);
    return state.currentUser;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveProfileWithRetry(authUser) {
    for (let attempt = 0; attempt < PROFILE_RESOLUTION_MAX_ATTEMPTS; attempt += 1) {
        const profile = await findProfileByAuthUser(authUser);
        if (profile) return profile;
        if (attempt < PROFILE_RESOLUTION_MAX_ATTEMPTS - 1) {
            await delay(PROFILE_RESOLUTION_RETRY_MS);
        }
    }
    return null;
}

function getAuthCallbackType() {
    const searchParams = new URLSearchParams(window.location.search || '');
    const explicit = String(searchParams.get('type') || '').trim().toLowerCase();
    if (explicit) return explicit;
    const hashType = String(getHashParams().get('type') || '').trim().toLowerCase();
    return hashType;
}

function isAuthCallbackRequest() {
    const searchParams = new URLSearchParams(window.location.search || '');
    return searchParams.get('auth_callback') === '1' || Boolean(getHashParams().get('type'));
}

function persistCurrentUser() {
    if (!state.currentUser) return;
    sessionStorage.setItem('hr_user', JSON.stringify(state.currentUser));
    return state.currentUser;
}

function findEmployeeProfileForCurrentUser() {
    const currentUser = state.currentUser;
    if (!currentUser) return null;

    const authId = String(currentUser.auth_id || '').trim();
    const email = String(currentUser.email || '').trim().toLowerCase();

    const match = Object.values(state.db || {}).find(rec => {
        const recAuthId = String(rec?.auth_id || '').trim();
        const recEmail = String(rec?.auth_email || '').trim().toLowerCase();
        return (authId && recAuthId === authId) || (email && recEmail === email);
    });

    return match || null;
}

export function reconcileCurrentUserProfile() {
    const currentUser = state.currentUser;
    if (!currentUser) return currentUser;

    const profile = findEmployeeProfileForCurrentUser();
    if (!profile) return currentUser;

    const nextUser = {
        ...currentUser,
        id: profile.id,
        name: profile.name || currentUser.name,
        role: profile.role || currentUser.role || 'employee',
        position: profile.position || '',
        department: profile.department || '',
        seniority: profile.seniority || '',
        must_change_password: Boolean(profile.must_change_password),
    };

    state.currentUser = nextUser;
    persistCurrentUser();
    emit('auth:login', nextUser);
    return nextUser;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await resolveProfileWithRetry(data.user);
    const user = setCurrentUser(profile, data.user, { persist: Boolean(profile) });
    if (!profile) {
        sessionStorage.removeItem('hr_user');
    }
    return user;
}

export async function signOut() {
    await supabase.auth.signOut();
    state.currentUser = null;
    sessionStorage.removeItem('hr_user');
    emit('auth:logout');
    location.reload();
}

export async function restoreSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    let profile = null;

    if (isAuthCallbackRequest()) {
        try {
            const normalized = await normalizeAuthCallback({
                currentUrl: window.location.href,
                type: getAuthCallbackType(),
            });

            profile = normalized?.profile || null;
            const redirectTo = String(normalized?.redirect_to || '').trim();
            if (redirectTo) {
                clearAuthHash();
                history.replaceState(null, '', redirectTo);
            } else {
                clearAuthHash();
            }
        } catch {
            profile = await resolveProfileWithRetry(session.user);
        }
    } else {
        profile = await resolveProfileWithRetry(session.user);
    }

    const user = setCurrentUser(profile, session.user, { persist: Boolean(profile) });
    if (!profile) {
        sessionStorage.removeItem('hr_user');
    }
    return user;
}

const DEFAULT_AUTH_REDIRECT_URL = 'https://example.com';

function resolveAuthRedirectUrl() {
    const envUrl = String(import.meta?.env?.VITE_AUTH_REDIRECT_URL || import.meta?.env?.VITE_PUBLIC_APP_URL || '').trim();
    const configured = String(state.appSettings?.app_public_url || '').trim();
    const base = envUrl || configured || DEFAULT_AUTH_REDIRECT_URL;

    try {
        const normalized = /^https?:\/\//i.test(base) ? base : `https://${base}`;
        const url = new URL(normalized);
        url.searchParams.set('auth_callback', '1');
        return url.toString();
    } catch {
        return DEFAULT_AUTH_REDIRECT_URL;
    }
}

export async function createAuthUser(email, password) {
    if (state.currentUser?.role !== 'superadmin') {
        throw new Error('Access denied. Superadmin only.');
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: resolveAuthRedirectUrl() }
    });
    if (error) throw error;
    return data;
}

export async function requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resolveAuthRedirectUrl(),
    });
    if (error) throw error;
}

export async function updatePassword(newPassword, options = {}) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    if (state.currentUser) {
        state.currentUser.reauthenticated_at = Date.now();
        if (options.clearMustChange) {
            state.currentUser.must_change_password = false;
            const { saveEmployee } = await import('./data.js');
            const rec = state.db[state.currentUser.id];
            if (rec) {
                rec.must_change_password = false;
                await saveEmployee(rec);
            }
        }
        persistCurrentUser();
    }
}

export async function promptChangePassword(options = {}) {
    const title = options.enforced ? 'Set New Password (Required)' : 'Change Password';
    const newPass = await notify.input({
        title,
        input: 'password',
        inputLabel: 'New password (minimum 8 characters)',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        confirmButtonText: 'Continue',
        cancelButtonText: options.enforced ? 'Logout' : 'Cancel',
        validate: value => {
            const v = String(value || '');
            if (!v || v.length < 8) return 'Password must be at least 8 characters.';
            return null;
        },
    });
    if (newPass === null) return false;

    const confirmPass = await notify.input({
        title: 'Confirm New Password',
        input: 'password',
        inputLabel: 'Re-enter the new password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        confirmButtonText: 'Update Password',
        cancelButtonText: options.enforced ? 'Logout' : 'Cancel',
        validate: value => {
            if (String(value || '') !== String(newPass)) return 'Passwords do not match.';
            return null;
        },
    });
    if (confirmPass === null) return false;

    await notify.withLoading(async () => {
        await updatePassword(String(newPass), {
            clearMustChange: options.clearMustChange,
        });
    }, 'Updating Password', 'Applying new password...');

    await notify.success('Password updated successfully.');
    return true;
}

export async function enforcePasswordPolicyOnLogin() {
    if (isRecoveryMode()) {
        await notify.info('Password recovery verified. Please set your new password now.');
        const ok = await promptChangePassword({ enforced: true, clearMustChange: true });
        clearAuthHash();
        if (!ok) {
            await notify.error('Password update is required after recovery. You have been logged out.');
            await signOut();
            return false;
        }
    }

    if (state.currentUser?.must_change_password) {
        await notify.info('You are using a temporary password. Please change it before continuing.');
        const ok = await promptChangePassword({ enforced: true, clearMustChange: true });
        if (!ok) {
            await notify.error('Password change is required for first login. You have been logged out.');
            await signOut();
            return false;
        }
    }
    return true;
}

export async function requireRecentAuth(actionLabel = 'this action', maxAgeMs = 10 * 60 * 1000) {
    const user = state.currentUser;
    if (!user) return false;
    if (user.must_change_password) {
        await notify.warn('Please change your temporary password first.');
        return false;
    }

    const age = Date.now() - Number(user.reauthenticated_at || 0);
    if (age <= maxAgeMs) return true;

    const password = await notify.input({
        title: 'Re-authentication Required',
        text: `Please re-enter your password to continue with ${actionLabel}.`,
        input: 'password',
        inputLabel: `Account: ${user.email}`,
        confirmButtonText: 'Verify',
        validate: value => {
            const v = String(value || '');
            if (!v) return 'Password is required.';
            return null;
        },
    });
    if (password === null) return false;

    const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: String(password),
    });
    if (error) {
        await notify.error('Re-authentication failed: ' + error.message);
        return false;
    }

    user.reauthenticated_at = Date.now();
    persistCurrentUser();
    return true;
}
