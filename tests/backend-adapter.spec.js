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

    test('Laravel adapter exposes KPI governance routes', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        await page.route('**/api/v1/kpi-definition-versions', async route => {
            expect(route.request().method()).toBe('POST');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: { id: 'VER-1', version_no: 2 }
                })
            });
        });

        await page.route('**/api/v1/kpi-records/REC-1', async route => {
            expect(route.request().method()).toBe('DELETE');
            await route.fulfill({ status: 204 });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const version = await backend.kpis.saveDefinitionVersion({
                kpi_definition_id: 'DEF-1',
                version_no: 2,
            });
            const deleted = await backend.kpis.deleteRecord('REC-1');

            return {
                versionId: version.data.id,
                deleteError: deleted.error ? deleted.error.message : null,
                methods: [
                    'saveDefinition',
                    'deleteDefinition',
                    'listDefinitionVersions',
                    'saveDefinitionVersion',
                    'updateDefinitionVersion',
                    'listTargetVersions',
                    'saveTargetVersion',
                    'updateTargetVersion',
                    'saveWeightProfile',
                    'saveWeightItems',
                    'deleteRecord',
                ].every(method => typeof backend.kpis[method] === 'function'),
            };
        });

        expect(result.versionId).toBe('VER-1');
        expect(result.deleteError).toBeNull();
        expect(result.methods).toBe(true);
    });

    test('probation and PIP helpers persist every prepared row', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const monthlyRequests = [];
        const pipRequests = [];

        await page.route('**/api/v1/probation-monthly-scores', async route => {
            const payload = route.request().postDataJSON();
            monthlyRequests.push(payload);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: payload })
            });
        });

        await page.route('**/api/v1/pip-actions', async route => {
            const payload = route.request().postDataJSON();
            pipRequests.push(payload);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: payload })
            });
        });

        const result = await page.evaluate(async () => {
            const { state } = await import('./src/lib/store.js');
            const { saveProbationMonthlyScores } = await import('./src/modules/data/probation.js');
            const { savePipActions } = await import('./src/modules/data/pip.js');

            state.probationMonthlyScores = [];
            state.pipActions = [];
            state.appSettings = {};

            const monthly = await saveProbationMonthlyScores('REV-1', [
                { month_no: 1, period_start: '2026-01-01', period_end: '2026-01-31', monthly_total: 80 },
                { month_no: 2, period_start: '2026-02-01', period_end: '2026-02-28', monthly_total: 82 },
                { month_no: 3, period_start: '2026-03-01', period_end: '2026-03-31', monthly_total: 84 },
            ]);

            const actions = await savePipActions('PIP-1', [
                { action_title: 'Weekly coaching check-in', status: 'todo' },
                { action_title: 'Submit KPI recovery target', status: 'todo' },
            ]);

            return {
                monthlyLength: monthly.length,
                monthlyStateLength: state.probationMonthlyScores.filter(row => row.probation_review_id === 'REV-1').length,
                monthlyMonths: monthly.map(row => row.month_no),
                actionLength: actions.length,
                actionStateLength: state.pipActions.filter(row => row.pip_plan_id === 'PIP-1').length,
                actionTitles: actions.map(row => row.action_title),
                actionIds: actions.map(row => row.id),
            };
        });

        expect(monthlyRequests).toHaveLength(3);
        expect(monthlyRequests.map(row => row.month_no)).toEqual([1, 2, 3]);
        expect(pipRequests).toHaveLength(2);
        expect(pipRequests.map(row => row.action_title)).toEqual([
            'Weekly coaching check-in',
            'Submit KPI recovery target',
        ]);
        expect(result.monthlyLength).toBe(3);
        expect(result.monthlyStateLength).toBe(3);
        expect(result.monthlyMonths).toEqual([1, 2, 3]);
        expect(result.actionLength).toBe(2);
        expect(result.actionStateLength).toBe(2);
        expect(result.actionTitles).toEqual([
            'Weekly coaching check-in',
            'Submit KPI recovery target',
        ]);
        expect(result.actionIds.every(Boolean)).toBe(true);
    });
});
