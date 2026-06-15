const MONITOR_WEBHOOK_URL = import.meta.env.VITE_MONITOR_WEBHOOK_URL || '';
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
let _initialized = false;
let _sentryLoaded = false;

async function loadSentry() {
    if (_sentryLoaded || !SENTRY_DSN) return;
    _sentryLoaded = true;
    await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://browser.sentry-cdn.com/8.42.0/bundle.tracing.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
    });
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

async function sendWebhook(payload) {
    if (!MONITOR_WEBHOOK_URL) return;
    try {
        await fetch(MONITOR_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch {
        // swallow: monitoring must never break app flow
    }
}

function getUserContext() {
    try {
        const raw = sessionStorage.getItem('hr_user');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            id: parsed.id,
            email: parsed.email,
            role: parsed.role,
        };
    } catch {
        return null;
    }
}

export async function captureError(error, context = {}) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    if (SENTRY_DSN && typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
        try {
            window.Sentry.captureException(errObj, { extra: context });
        } catch {
            // ignore fallback
        }
    }

    await sendWebhook({
        type: 'frontend_error',
        name: errObj.name,
        message: errObj.message,
        stack: errObj.stack || '',
        context,
        user: getUserContext(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
    });
}

export async function captureMessage(message, context = {}) {
    await sendWebhook({
        type: 'frontend_event',
        message: String(message),
        context,
        user: getUserContext(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
    });
}

export async function initMonitoring() {
    if (_initialized) return;
    _initialized = true;

    window.addEventListener('error', event => {
        captureError(event.error || new Error(event.message || 'Unknown window error'), {
            source: event.filename,
            line: event.lineno,
            column: event.colno,
        });
    });

    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason instanceof Error
            ? event.reason
            : new Error(typeof event.reason === 'string' ? event.reason : safeStringify(event.reason));
        captureError(reason, { kind: 'unhandledrejection' });
    });

    if (SENTRY_DSN) {
        await loadSentry();
        if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.init === 'function') {
            try {
                window.Sentry.init({ dsn: SENTRY_DSN });
            } catch {
                // non-fatal
            }
        }
    }
}
