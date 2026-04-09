import { state } from './store.js';

export function applyBranding() {
    const { appSettings } = state;
    const appName = appSettings.app_name || 'HR Performance Suite';
    const companyName = appSettings.company_name || '';
    const companyShort = appSettings.company_short || '';
    const companyLabel = companyName && companyShort
        ? `${companyName} (${companyShort})`
        : (companyName || companyShort || 'Company');

    const headerTitle = document.getElementById('app-header-title');
    if (headerTitle) headerTitle.innerText = appName;

    const headerSub = document.getElementById('app-header-subtitle');
    if (headerSub) {
        const dept = appSettings.department_label || 'Human Resources Department';
        headerSub.innerText = dept;
    }

    const sidebarUserLabel = document.getElementById('sidebar-user-label');
    if (sidebarUserLabel) {
        sidebarUserLabel.innerText = appSettings.company_name
            ? `${appSettings.company_name} Workspace`
            : 'Active Session';
    }

    const loginCompany = document.getElementById('login-company');
    if (loginCompany) loginCompany.innerText = companyLabel;

    const loginApp = document.getElementById('login-app-name');
    if (loginApp) loginApp.innerText = appName;
}
