import { test, expect } from '@playwright/test';
import { loginAs, openSidebarLink } from './support/app.js';

const stressProfile = String(process.env.STRESS_PROFILE || 'average').trim().toLowerCase();
const expectedEmployees = Number(process.env.STRESS_EMPLOYEES || (stressProfile === 'busy' ? 220 : 120));
const expectedManagerScopeFloor = Math.max(15, Math.floor(expectedEmployees * 0.15));
const expectedHeadcountFloor = stressProfile === 'busy' ? 12 : 8;
const expectedPipelineFloor = stressProfile === 'busy' ? 16 : 10;

function numberFromText(value) {
    const match = String(value || '').match(/-?\d+/);
    return match ? Number(match[0]) : 0;
}

test.describe('stress workload coverage', () => {
    test('HR can load manpower planning and recruitment workload under stress data', async ({ page }) => {
        await loginAs(page, 'hr');
        await openSidebarLink(page, 'Employees', 'Manpower Planning');

        await expect(page.locator('#employees-planning')).toBeVisible();

        const planRows = await page.locator('#manpower-plan-body tr').count();
        expect(planRows).toBeGreaterThanOrEqual(8);

        const pendingRequests = numberFromText(await page.locator('#mp-request-pending-count').textContent());
        const approvedRequests = numberFromText(await page.locator('#mp-request-approved-count').textContent());
        const activePipeline = numberFromText(await page.locator('#mp-funnel-active-pipeline').textContent());

        expect(pendingRequests + approvedRequests).toBeGreaterThanOrEqual(expectedHeadcountFloor);
        expect(activePipeline).toBeGreaterThanOrEqual(expectedPipelineFloor);

        await openSidebarLink(page, 'Employees', 'Recruitment Pipeline');
        await expect(page.locator('#employees-recruitment')).toBeVisible();
        await expect(page.locator('#recruitment-board-columns')).not.toContainText('No recruitment cards yet');
        const recruitmentColumns = await page.locator('#recruitment-board-columns .col').count();
        expect(recruitmentColumns).toBeGreaterThanOrEqual(4);
        await expect(page.locator('#recruitment-board-columns')).toContainText(/QA Stress/i);
    });

    test('manager can browse a large assessment queue', async ({ page }) => {
        await loginAs(page, 'manager');
        await openSidebarLink(page, 'Assessment & KPI', 'Assessment Queue');

        const optionCount = await page.locator('#inp-pending-select option').count();
        expect(optionCount - 1).toBeGreaterThanOrEqual(expectedManagerScopeFloor);

        await page.locator('#inp-pending-select').evaluate((select) => {
            if (select.options.length < 2) throw new Error('No employees available in manager scope.');
            select.value = select.options[1].value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await expect(page.locator('#inp-id')).not.toHaveValue('');
        await page.getByRole('button', { name: /Assess Competencies/i }).click();

        const popup = page.locator('.swal2-popup');
        if (await popup.isVisible().catch(() => false)) {
            const text = await popup.textContent();
            if (/overwrite/i.test(text || '')) {
                await page.locator('.swal2-confirm').click();
            }
        }

        await expect(page.locator('#step-form')).toBeVisible();
        const competencyCards = await page.locator('#questions-area .card').count();
        expect(competencyCards).toBeGreaterThanOrEqual(2);
        await page.getByRole('button', { name: /Back/i }).click();
        await expect(page.locator('#step-login')).toBeVisible();
    });

    test('employee self-assessment view stays usable with stress seed data', async ({ page }) => {
        await loginAs(page, 'stressEmployee');
        await openSidebarLink(page, 'Assessment & KPI', 'Assessment Queue');

        await expect(page.locator('#step-login')).toBeVisible();
        await expect(page.locator('#inp-pending-select')).not.toBeVisible();
        await expect(page.locator('#inp-id')).not.toHaveValue('');

        const startButton = page.getByRole('button', { name: /Start Self-Assessment|Self-Assessment Submitted/i });
        await expect(startButton).toBeVisible();
        await expect(startButton).toContainText(/Self-Assessment/i);

        if (/start/i.test((await startButton.textContent()) || '')) {
            await startButton.click();
            await expect(page.locator('#step-form')).toBeVisible();
            const competencyCards = await page.locator('#questions-area .card').count();
            expect(competencyCards).toBeGreaterThanOrEqual(2);
        }
    });
});
