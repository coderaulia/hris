import { test, expect } from '@playwright/test';
import { openSidebarLink, ensureSwalClosed } from './support/app.js';

const settingsRows = [
    { key: 'app_name', value: 'HR Performance Suite' },
    { key: 'company_name', value: 'Vanaila Test Co' },
    { key: 'company_short', value: 'VTC' },
    { key: 'department_label', value: 'Human Resources Department' },
    { key: 'departments', value: 'Engineering, HR, Finance' },
    { key: 'levels', value: 'Junior, Mid, Senior, Manager, Director' },
    { key: 'dept_positions', value: JSON.stringify({
        Engineering: ['Developer', 'QA Engineer'],
        HR: ['HR Partner'],
        Finance: ['Analyst'],
    }) },
];

function baseEmployees() {
    return [
        {
            employee_id: 'SA01',
            id: 'SA01',
            name: 'Super Admin',
            role: 'superadmin',
            department: 'HR',
            position: 'HR Partner',
            seniority: 'Director',
            join_date: '2025-01-01',
            auth_email: 'superadmin@demo.local',
        },
        {
            employee_id: 'M001',
            id: 'M001',
            name: 'Engineering Manager',
            role: 'manager',
            department: 'Engineering',
            position: 'Developer',
            seniority: 'Manager',
            join_date: '2025-01-01',
            auth_email: 'manager@demo.local',
        },
    ];
}

async function installLaravelMocks(page, { role = 'superadmin' } = {}) {
    let employees = baseEmployees();
    const requests = [];
    const currentUser = role === 'manager' ? employees[1] : employees[0];

    await page.addInitScript(() => {
        window._VITE_BACKEND_TYPE = 'laravel';
        localStorage.removeItem('laravel_token');
        sessionStorage.clear();
    });

    await page.route('**/api/v1/auth/login', async route => {
        requests.push({ type: 'login', payload: route.request().postDataJSON() });
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ token: `${role}-token`, user: currentUser }),
        });
    });

    await page.route('**/api/v1/auth/me', async route => {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'No restored session in this mocked UI spec.' }),
        });
    });

    await page.route('**/api/v1/settings', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: settingsRows }),
        });
    });

    await page.route('**/api/v1/employees', async route => {
        if (route.request().method() === 'GET') {
            requests.push({ type: 'employees-list' });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: employees }),
            });
            return;
        }

        const payload = route.request().postDataJSON();
        requests.push({ type: 'employee-create', payload });
        const row = { ...payload, id: payload.employee_id };
        employees = [...employees.filter(item => item.employee_id !== payload.employee_id), row];
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: row }),
        });
    });

    await page.route(/\/api\/v1\/employees\/([^/?]+)$/, async route => {
        const id = route.request().url().split('/').pop();
        if (route.request().method() === 'PUT') {
            const payload = route.request().postDataJSON();
            requests.push({ type: 'employee-update', id, payload });
            const row = { ...payload, id, employee_id: id };
            employees = [...employees.filter(item => item.employee_id !== id), row];
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: row }),
            });
            return;
        }

        if (route.request().method() === 'DELETE') {
            requests.push({ type: 'employee-delete', id });
            employees = employees.filter(item => item.employee_id !== id);
            await route.fulfill({ status: 204 });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: employees.find(item => item.employee_id === id) || null }),
        });
    });

    const emptyDataRoutes = [
        '**/api/v1/assessments',
        '**/api/v1/assessment-scores',
        '**/api/v1/assessment-history',
        '**/api/v1/training-records',
        '**/api/v1/kpis',
        '**/api/v1/kpi-definition-versions',
        '**/api/v1/employee-kpi-target-versions',
        '**/api/v1/kpi-weight-profiles',
        '**/api/v1/kpi-weight-items',
        '**/api/v1/kpi-records',
        '**/api/v1/performance-scores',
        '**/api/v1/activity-logs',
    ];

    for (const pattern of emptyDataRoutes) {
        await page.route(pattern, async route => {
            if (route.request().method() === 'POST') {
                requests.push({ type: 'activity-log', payload: route.request().postDataJSON() });
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: route.request().postDataJSON() }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] }),
            });
        });
    }

    await page.route('**/api/v1/dashboard/summary', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: {} }),
        });
    });

    return { requests, getEmployees: () => employees };
}

async function loginWithMockedLaravel(page, role = 'superadmin') {
    const harness = await installLaravelMocks(page, { role });
    await page.goto('/');
    await page.locator('#login-user').fill(`${role}@demo.local`);
    await page.locator('#login-pass').fill('Password123!');
    await page.locator('#login-btn').click();
    await expect(page.locator('#main-app')).toBeVisible();
    return harness;
}

test.describe('Employee UI Workflows', () => {
    test('superadmin can create, update, and delete an HR employee through the UI', async ({ page }) => {
        const harness = await loginWithMockedLaravel(page, 'superadmin');

        await openSidebarLink(page, 'Employees', 'Add New Employee');

        await page.locator('#emp-id').fill('HR99');
        await page.locator('#emp-name').fill('HR Partner Temp');
        await page.locator('#emp-department').selectOption('HR');
        await page.locator('#emp-position').selectOption('HR Partner');
        await page.locator('#emp-seniority').selectOption('Senior');
        await page.locator('#emp-role').selectOption('hr');
        await page.locator('#emp-join').fill('2026-05-09');
        await page.locator('#emp-auth-email').fill('hr.partner.temp@example.test');
        await page.getByRole('button', { name: /Save Employee/i }).click();

        await expect(page.locator('#employees-directory')).toBeVisible();
        await expect(page.locator('#employee-list-body')).toContainText('HR Partner Temp');
        expect(harness.requests.find(item => item.type === 'employee-create')?.payload).toMatchObject({
            employee_id: 'HR99',
            role: 'hr',
            department: 'HR',
            position: 'HR Partner',
        });

        await page.locator('#employee-list-body tr').filter({ hasText: 'HR Partner Temp' })
            .getByTitle('Edit employee')
            .click();
        await expect(page.locator('.swal2-popup')).toBeVisible();
        await page.locator('#swal-emp-name').fill('HR Partner Updated');
        await page.locator('#swal-emp-role').selectOption('manager');
        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#employee-list-body')).toContainText('HR Partner Updated');
        expect(harness.requests.find(item => item.type === 'employee-update')?.payload).toMatchObject({
            name: 'HR Partner Updated',
            role: 'manager',
        });

        await page.locator('#employee-list-body tr').filter({ hasText: 'HR Partner Updated' })
            .getByTitle('Delete employee')
            .click();
        await expect(page.locator('.swal2-popup')).toContainText(/Delete HR Partner Updated/i);
        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#employee-list-body')).not.toContainText('HR Partner Updated');
        await ensureSwalClosed(page);
        expect(harness.requests.find(item => item.type === 'employee-delete')?.id).toBe('HR99');
    });

    test('manager role cannot reach staff directory or add employee surfaces', async ({ page }) => {
        await loginWithMockedLaravel(page, 'manager');

        const employeeGroup = page.locator('.sidebar-group').filter({ hasText: 'Employees' });
        await expect(employeeGroup).toHaveCount(0);

        await page.evaluate(async () => {
            await window.__app.switchTab('tab-employees', { employeesView: 'employees-add' });
        });

        await expect(page.locator('#emp-form-panel')).toBeHidden();
        await expect(page.locator('#employees-add')).toBeHidden();
        await expect(page.locator('#employees-directory')).toBeHidden();
    });
});
