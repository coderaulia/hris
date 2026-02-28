// ==================================================
// UTILITY FUNCTIONS
// ==================================================

import { captureError } from './monitoring.js';

export function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

// Escape a value for use inside inline handler string literals like:
// onclick="fn('...')"
export function escapeInlineArg(str) {
    if (str === null || str === undefined) return '';
    const jsSafe = String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    // Protect the surrounding HTML attribute context.
    return jsSafe
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function debugError(...args) {
    if (import.meta.env.DEV) {
        console.error(...args);
    }
    const firstErr = args.find(x => x instanceof Error);
    const error = firstErr || new Error(args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' | '));
    captureError(error, {
        debug_args: args.map(a => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch { return String(a); }
        }),
    });
}

export function formatNumber(val) {
    if (val === null || val === undefined || val === '') return '-';
    const num = Number(val);
    if (isNaN(num)) return val;
    return num.toLocaleString('id-ID');
}

export function getDepartment(pos) {
    if (!pos) return 'Other';
    const p = pos.toLowerCase();
    if (p.includes('hr') || p.includes('human')) return 'HR';
    if (p.includes('finance') || p.includes('account')) return 'Finance';
    if (p.includes('dev') || p.includes('engineer') || p.includes('tech')) return 'IT/Engineering';
    if (p.includes('sales') || p.includes('marketing')) return 'Sales/Marketing';
    return 'Operations';
}

export function getInputValue(val) {
    if (!val || val === '-') return '';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    } catch (e) {
        return '';
    }
}

export function getDisplayDate(val) {
    if (!val || val === '-') return '-';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val).substring(0, 10);
        return d.toISOString().split('T')[0];
    } catch (e) {
        return String(val).substring(0, 10);
    }
}

export function safeCSV(str) {
    if (str === null || str === undefined) return '';
    let s = String(str);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

export function formatPeriod(period) {
    if (!period) return '-';
    const parts = period.split('-');
    if (parts.length === 2) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
    }
    return period;
}

export function toPeriodKey(value) {
    if (!value || value === '-') return '';
    const raw = String(value).trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
}
