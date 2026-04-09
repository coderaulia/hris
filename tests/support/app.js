import { expect } from '@playwright/test';

export const credentials = {
    superadmin: {
        email: process.env.TEST_SUPERADMIN_EMAIL || 'superadmin@demo.local',
        password: process.env.TEST_SUPERADMIN_PASSWORD || 'Superadmin123!',
    },
    hr: {
        email: process.env.TEST_HR_EMAIL || 'hr@demo.local',
        password: process.env.TEST_HR_PASSWORD || 'HrManager123!',
    },
    manager: {
        email: process.env.TEST_MANAGER_EMAIL || 'eng.manager@demo.local',
        password: process.env.TEST_MANAGER_PASSWORD || 'Manager123!',
    },
    otherManager: {
        email: process.env.TEST_OTHER_MANAGER_EMAIL || 'sales.manager@demo.local',
        password: process.env.TEST_OTHER_MANAGER_PASSWORD || 'Manager123!',
    },
    employee: {
        email: process.env.TEST_EMPLOYEE_EMAIL || 'raka.frontend@demo.local',
        password: process.env.TEST_EMPLOYEE_PASSWORD || 'Employee123!',
    },
    otherEmployee: {
        email: process.env.TEST_OTHER_EMPLOYEE_EMAIL || 'bima.sales@demo.local',
        password: process.env.TEST_OTHER_EMPLOYEE_PASSWORD || 'Employee123!',
    },
};

export async function loginAs(page, role) {
    const user = credentials[role];
    if (!user) throw new Error(`Unknown login role "${role}"`);

    await page.goto('/');
    await page.locator('#login-user').fill(user.email);
    await page.locator('#login-pass').fill(user.password);
    await page.locator('#login-btn').click();

    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator('#user-role-badge')).toBeVisible();
    return user;
}

export async function openSidebarLink(page, groupLabel, linkLabel) {
    const group = page.locator('.sidebar-group').filter({ hasText: groupLabel }).first();
    const link = group.locator('.sidebar-link').filter({ hasText: linkLabel }).first();

    if (!(await link.isVisible().catch(() => false))) {
        await group.locator('.sidebar-group-toggle').click();
    }

    await link.click();
}

export async function expectSuccessToast(page, messagePattern) {
    const popup = page.locator('.swal2-popup').last();
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(messagePattern);
    await page.locator('.swal2-confirm').click();
}

export async function ensureSwalClosed(page) {
    await expect(page.locator('.swal2-popup')).toHaveCount(0, { timeout: 15000 });
}

export function uniqueLabel(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function currentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
