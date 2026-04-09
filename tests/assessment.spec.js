import { test, expect } from '@playwright/test';
import { loginAs, openSidebarLink, expectSuccessToast } from './support/app.js';
import { signInAs, restRequest, assertDenied, encodeFilterValue } from './support/supabase-api.js';

async function selectScopedEmployee(page, employeeName) {
    const employeeId = await page.locator('#inp-pending-select').evaluate((select, name) => {
        const option = [...select.options].find(item => item.text.includes(name)) || select.options[1];
        if (!option) return '';
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.value;
    }, employeeName);

    if (!employeeId) {
        throw new Error(`Unable to find scoped employee "${employeeName}" in assessment queue.`);
    }

    await expect(page.locator('#inp-id')).toHaveValue(employeeId);
    return employeeId;
}

async function acceptOverwriteIfPrompted(page) {
    const popup = page.locator('.swal2-popup');
    if (await popup.isVisible().catch(() => false)) {
        const text = await popup.textContent();
        if (/overwrite/i.test(text || '')) {
            await page.locator('.swal2-confirm').click();
        }
    }
}

test('manager can submit an assessment and RLS blocks another manager from editing it', async ({ page }) => {
    await loginAs(page, 'manager');
    await openSidebarLink(page, 'Assessment & KPI', 'Assessment Queue');

    const employeeId = await selectScopedEmployee(page, 'Alya Pratama');

    await page.getByRole('button', { name: /Assess Competencies/i }).click();
    await acceptOverwriteIfPrompted(page);

    await expect(page.locator('#step-form')).toBeVisible();
    await expect(page.locator('#questions-area .form-range').first()).toBeVisible();

    for (const [id, value] of [['#q-0', '8'], ['#q-1', '7'], ['#q-2', '9']]) {
        await page.locator(id).evaluate((input, nextValue) => {
            input.value = nextValue;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, value);
    }

    await page.getByRole('button', { name: /Review Answers/i }).click();
    await expect(page.locator('#step-review')).toBeVisible();

    await page.getByRole('button', { name: /Final Submit/i }).click();
    await expectSuccessToast(page, /Assessment Submitted/i);
    await expect(page.locator('#step-login')).toBeVisible();

    const managerToken = await signInAs('manager');
    const assessmentResult = await restRequest(managerToken, {
        path: `employee_assessments?select=id,employee_id,assessment_type,percentage&employee_id=eq.${encodeFilterValue(employeeId)}&assessment_type=eq.manager&order=updated_at.desc&limit=1`,
        prefer: '',
    });

    expect(assessmentResult.ok).toBe(true);
    expect(Array.isArray(assessmentResult.data)).toBe(true);
    expect(assessmentResult.data.length).toBeGreaterThan(0);

    const [assessment] = assessmentResult.data;
    expect(assessment.employee_id).toBe(employeeId);

    const otherManagerToken = await signInAs('otherManager');
    const deniedUpdate = await restRequest(otherManagerToken, {
        method: 'PATCH',
        path: `employee_assessments?id=eq.${encodeFilterValue(assessment.id)}`,
        body: { percentage: 1 },
        prefer: 'return=minimal',
    });

    assertDenied(deniedUpdate, 'other manager cannot patch another manager assessment');
});
