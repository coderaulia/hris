// ==================================================
// UTILITY FUNCTIONS
// ==================================================

export function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
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
