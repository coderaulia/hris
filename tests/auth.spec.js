import { test, expect } from '@playwright/test';
import { loginAs } from './support/app.js';

test('login resolves the correct manager role', async ({ page }) => {
    await loginAs(page, 'manager');

    await expect(page.locator('#user-role-badge')).toContainText(/manager/i);
    await expect(page.locator('#sidebar-nav-groups')).toContainText('Assessment Queue');
});

test('auth callback redirect is normalized without losing the active session', async ({ page }) => {
    await loginAs(page, 'employee');

    await page.route('**/functions/v1/auth-callbacks', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    redirect_to: '/',
                },
            }),
        });
    });

    await page.goto('/?auth_callback=1&type=magiclink');

    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator('#user-role-badge')).toContainText(/employee/i);
    await expect.poll(() => new URL(page.url()).searchParams.get('auth_callback')).toBe(null);
    await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe(null);
});
