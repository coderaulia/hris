function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isLikelyJwt(value) {
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.host);
    } catch {
        return false;
    }
}

export function validateSupabaseEnv(env = import.meta.env) {
    const url = env.VITE_SUPABASE_URL;
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    const issues = [];

    if (!isNonEmptyString(url)) {
        issues.push('`VITE_SUPABASE_URL` is missing.');
    } else if (!isValidHttpUrl(url)) {
        issues.push('`VITE_SUPABASE_URL` must be a valid `http` or `https` URL.');
    }

    if (!isNonEmptyString(anonKey)) {
        issues.push('`VITE_SUPABASE_ANON_KEY` is missing.');
    } else if (!isLikelyJwt(anonKey.trim())) {
        issues.push('`VITE_SUPABASE_ANON_KEY` must look like a valid JWT.');
    }

    return {
        ok: issues.length === 0,
        url,
        anonKey,
        issues,
    };
}

export function formatSupabaseEnvError(validation = validateSupabaseEnv()) {
    return [
        'Invalid Supabase environment configuration.',
        ...validation.issues,
    ].join(' ');
}

export function renderBootErrorScreen(title, details = []) {
    const loginView = document.getElementById('login-view');
    const mainApp = document.getElementById('main-app');
    const container = document.getElementById('component-login');

    if (loginView) loginView.classList.add('hidden');
    if (mainApp) mainApp.classList.add('hidden');
    if (!container) return;

    const detailList = details.map(item => `<li>${item}</li>`).join('');

    container.innerHTML = `
        <div class="min-vh-100 d-flex align-items-center justify-content-center px-3 py-5 bg-light">
            <section class="card border-danger shadow-sm w-100" style="max-width: 760px;">
                <div class="card-body p-4 p-md-5">
                    <div class="d-flex align-items-start gap-3">
                        <div class="text-danger fs-2 lh-1">
                            <i class="bi bi-exclamation-octagon-fill"></i>
                        </div>
                        <div class="flex-grow-1">
                            <p class="text-danger text-uppercase fw-bold small mb-2">Configuration Error</p>
                            <h1 class="h3 mb-3">${title}</h1>
                            <p class="text-muted mb-3">The app stopped during startup because required Supabase environment variables are missing or malformed.</p>
                            <ul class="mb-4 ps-3">
                                ${detailList}
                            </ul>
                            <div class="alert alert-light border mb-0">
                                Update your local environment and restart the Vite app after setting valid values for <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
}
