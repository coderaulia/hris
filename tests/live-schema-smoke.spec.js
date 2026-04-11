import { test, expect } from '@playwright/test';
import { openSidebarLink } from './support/app.js';
import { loginWithMagicLink } from './support/supabase-admin.js';

test('superadmin auth resolves to employee profile and employee directory loads', async ({ page }) => {
    await loginWithMagicLink(page, 'superadmin@demo.local');

    await expect(page.locator('#user-role-badge')).toContainText(/super admin/i);

    const storedUser = await page.evaluate(() => JSON.parse(sessionStorage.getItem('hr_user') || '{}'));
    expect(storedUser.role).toBe('superadmin');
    expect(storedUser.id).toBe('EMP-0001');
    expect(String(storedUser.auth_id || '')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storedUser.id).not.toBe(storedUser.auth_id);

    await openSidebarLink(page, 'Employees', 'Staff Directory');
    await expect(page.locator('#employees-directory')).toBeVisible();
    await expect.poll(async () => Number(await page.locator('#emp-visible-count').innerText())).toBeGreaterThan(0);
    await expect.poll(async () => page.locator('#employee-list-body tr').count()).toBeGreaterThan(0);
});

test('server-backed dashboard and manpower views are readable from the live schema', async ({ page }) => {
    const endpointStatusMap = new Map();
    const trackedRelations = [
        'dashboard_summary',
        'dashboard_probation_expiry',
        'dashboard_assessment_coverage',
        'manpower_plan_overview',
        'headcount_request_overview',
        'recruitment_pipeline_overview',
    ];

    page.on('response', response => {
        const url = response.url();
        trackedRelations.forEach(relation => {
            if (url.includes(`/rest/v1/${relation}`)) {
                if (!endpointStatusMap.has(relation)) endpointStatusMap.set(relation, []);
                endpointStatusMap.get(relation).push(response.status());
            }
        });
    });

    await loginWithMagicLink(page, 'superadmin@demo.local');
    await expect.poll(async () => Number(await page.locator('#d-summary-active-employees').innerText())).toBeGreaterThan(0);
    await expect(page.locator('#d-assessment-coverage-body')).not.toContainText('No assessment coverage data yet.');

    await openSidebarLink(page, 'Employees', 'Manpower Planning');
    await expect(page.locator('#employees-planning')).toBeVisible();
    await expect(page.locator('#mp-plan-setup-card')).toBeVisible();
    await expect(page.locator('#headcount-request-body')).toBeVisible();

    await openSidebarLink(page, 'Employees', 'Recruitment Board');
    await expect(page.locator('#employees-recruitment')).toBeVisible();
    await expect(page.locator('#mp-recruitment-card')).toBeVisible();

    trackedRelations.forEach(relation => {
        const statuses = endpointStatusMap.get(relation) || [];
        expect(statuses.length, `${relation} was never requested by the live app`).toBeGreaterThan(0);
        expect(statuses.some(status => status >= 200 && status < 300), `${relation} never returned success: ${statuses.join(', ')}`).toBe(true);
    });
});

test('recruitment fallback handles a missing overview view without retrying the raw table', async ({ page }) => {
    let overviewHits = 0;
    let rawTableHits = 0;

    await page.route('**/rest/v1/recruitment_pipeline_overview*', async route => {
        overviewHits += 1;
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 'PGRST205',
                message: "Could not find the table 'public.recruitment_pipeline_overview' in the schema cache",
            }),
        });
    });

    await page.route('**/rest/v1/recruitment_pipeline?*', async route => {
        rawTableHits += 1;
        await route.continue();
    });

    await loginWithMagicLink(page, 'superadmin@demo.local');
    await openSidebarLink(page, 'Employees', 'Recruitment Board');

    await expect(page.locator('#employees-recruitment')).toBeVisible();
    await expect(page.locator('#recruitment-board-columns')).toContainText(/Recruitment Board Unavailable/i);
    await expect(page.locator('#recruitment-board-columns')).toContainText(/20260409_manpower_planning\.sql/i);

    expect(overviewHits).toBeGreaterThan(0);
    expect(rawTableHits).toBe(0);
});
