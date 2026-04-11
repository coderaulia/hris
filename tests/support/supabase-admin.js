import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const APP_BASE_URL = String(process.env.E2E_BASE_URL || process.env.APP_BASE_URL || 'http://127.0.0.1:5173').trim().replace(/\/$/, '');

if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL or VITE_SUPABASE_URL is required for admin-auth smoke tests.');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin-auth smoke tests.');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

export async function loginWithMagicLink(page, email) {
    const appUrl = new URL(`${APP_BASE_URL}/`);
    const normalizedRedirectTo = `${APP_BASE_URL}/?auth_callback=1`;
    const { data, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
            redirectTo: normalizedRedirectTo,
        },
    });

    if (error) throw error;

    const actionLink = String(data?.properties?.action_link || '').trim();
    if (!actionLink) {
        throw new Error(`No action_link returned for ${email}`);
    }

    const normalizedLink = new URL(actionLink);
    normalizedLink.searchParams.set('redirect_to', normalizedRedirectTo);

    const verifyResponse = await fetch(normalizedLink, { redirect: 'manual' });
    const location = String(verifyResponse.headers.get('location') || '').trim();
    if (!location) {
        throw new Error(`No redirect location returned for ${email}`);
    }

    const callbackUrl = new URL(location);
    callbackUrl.protocol = appUrl.protocol;
    callbackUrl.hostname = appUrl.hostname;
    callbackUrl.port = appUrl.port;
    callbackUrl.pathname = appUrl.pathname;
    callbackUrl.searchParams.set('auth_callback', '1');

    await page.goto(callbackUrl.toString());
    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator('#user-role-badge')).toBeVisible();
}
