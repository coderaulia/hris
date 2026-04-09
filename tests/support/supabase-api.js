import { credentials } from './app.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required for Playwright API tests.');
}

export async function signInAs(role) {
    const user = credentials[role];
    if (!user) throw new Error(`Unknown auth role "${role}"`);

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: user.email,
            password: user.password,
        }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.access_token) {
        throw new Error(`Failed to sign in as ${role}: ${response.status} ${JSON.stringify(payload)}`);
    }

    return payload.access_token;
}

export async function restRequest(token, { method = 'GET', path, body = null, prefer = 'return=representation' }) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
            ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === null ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    return {
        ok: response.ok,
        status: response.status,
        text,
        data,
    };
}

export function assertDenied(result, label) {
    if (result.ok) {
        throw new Error(`${label}: expected denial but got HTTP ${result.status}`);
    }

    const message = String(result.text || '');
    if (!/(row-level security|permission|denied|forbidden|violates|not allowed)/i.test(message)
        && ![400, 401, 403, 404, 409].includes(result.status)) {
        throw new Error(`${label}: unexpected denial response HTTP ${result.status} body=${message}`);
    }
}

export function encodeFilterValue(value) {
    return encodeURIComponent(String(value || '').trim());
}

export async function fetchEmployeeByEmail(email) {
    const token = await signInAs('superadmin');
    const result = await restRequest(token, {
        path: `employees?select=employee_id,name,auth_email,department,manager_id,role&auth_email=eq.${encodeFilterValue(String(email || '').toLowerCase())}`,
        prefer: '',
    });

    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
        throw new Error(`Employee not found for email ${email}`);
    }

    return result.data[0];
}
