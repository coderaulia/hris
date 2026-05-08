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

    test('Laravel adapter exposes HR document archive routes', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        await page.route('**/api/v1/hr-document-archives', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [] })
                });
                return;
            }

            expect(route.request().method()).toBe('POST');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: { id: 'ARCH-1', signature_status: 'pending_signature' }
                })
            });
        });

        await page.route('**/api/v1/hr-document-archives/ARCH-1/signature', async route => {
            expect(route.request().method()).toBe('POST');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: { id: 'ARCH-1', signature_status: 'signed' }
                })
            });
        });

        await page.route('**/api/v1/hr-document-archives/ARCH-1/file', async route => {
            expect(route.request().method()).toBe('POST');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: {
                        id: 'ARCH-1',
                        storage_status: 'stored',
                        storage_path: 'hr-documents/emp-1/ARCH-1/payslip.pdf',
                        file_size_bytes: 7,
                    }
                })
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const list = await backend.documents.listArchives();
            const archive = await backend.documents.saveArchive({
                document_type: 'payslip',
                subject_name: 'Employee One',
                filename: 'payslip.pdf',
            });
            const uploaded = await backend.documents.uploadArchiveFile('ARCH-1', {
                path: 'hr-documents/emp-1/ARCH-1/payslip.pdf',
                file: new Blob(['pdfdata'], { type: 'application/pdf' }),
                filename: 'payslip.pdf',
                contentType: 'application/pdf',
            });
            const signed = await backend.documents.signArchive('ARCH-1', {
                signer_type: 'company',
                decision: 'signed',
            });

            return {
                listCount: list.data.length,
                archiveId: archive.data.id,
                uploadStatus: uploaded.data.storage_status,
                signedStatus: signed.data.signature_status,
                methods: [
                    'listArchives',
                    'saveArchive',
                    'uploadArchiveFile',
                    'signArchive',
                ].every(method => typeof backend.documents[method] === 'function'),
            };
        });

        expect(result.listCount).toBe(0);
        expect(result.archiveId).toBe('ARCH-1');
        expect(result.uploadStatus).toBe('stored');
        expect(result.signedStatus).toBe('signed');
        expect(result.methods).toBe(true);
    });
});
