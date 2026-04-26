import { test, expect } from '@playwright/test';

test.describe('Backend Adapter Routing', () => {
    
    test.beforeEach(async ({ page }) => {
        // Go to home page to ensure we can evaluate scripts
        await page.goto('/');
    });

    test('routes to Supabase by default', async ({ page }) => {
        const type = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return backend._type;
        });
        expect(type).toBe('supabase');
    });

    test('routes to Laravel when forced', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();
        
        const type = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return backend._type;
        });
        expect(type).toBe('laravel');
    });

    test('Supabase adapter uses Supabase SDK (Mocked)', async ({ page }) => {
        // Mock Supabase REST call
        await page.route('**/rest/v1/employees?*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: 'SUPA-1', name: 'Supa Employee' }])
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.employees.list();
        });

        expect(result.data[0].id).toBe('SUPA-1');
    });

    test('Laravel adapter uses fetch API (Mocked)', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        // Mock Laravel API call
        await page.route('**/api/v1/employees', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [{ id: 'LARA-1', name: 'Lara Employee' }]
                })
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.employees.list();
        });

        expect(result.data[0].id).toBe('LARA-1');
    });
});
